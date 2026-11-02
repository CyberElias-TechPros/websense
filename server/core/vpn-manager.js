// ============================================================================
// vpn-manager.js — OS-level VPN tunnel management (leak-protected).
//
// Three connection types:
//   • 'external'  — you already connected with your own VPN app (NordVPN,
//                   WireGuard GUI, corporate client…). We just verify the
//                   exit IP periodically and gate visits on it.
//   • 'openvpn'   — we spawn the `openvpn` binary with your .ovpn config
//                   (auth via a 0600 temp file, never logged) and watch its
//                   stdout for "Initialization Sequence Completed".
//   • 'wireguard' — `sudo -n wg-quick up <iface>` / `down` (config file or
//                   interface name). If sudo -n isn't allowed, the error tells
//                   you exactly what to do (or use 'external' mode).
//
// Safety: leakProtection + requiredForVisits make the engine SKIP every visit
// with reason 'vpn_down' while the tunnel is not verified up — traffic never
// silently falls back to your real IP. Exit IP is re-verified on an interval
// and on demand (POST /api/vpn/verify); an optional expectedExitIp pins it.
//
// The module is dependency-injectable (spawn/fetch/fs/dataDir) so tests run
// without root or a real tunnel.
// ============================================================================

import { spawn as realSpawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import axios from 'axios';
import logger from '../utils/logger.js';

export const VPN_TYPES = ['external', 'openvpn', 'wireguard'];

const IP_RE = /\b(\d{1,3}\.){3}\d{1,3}\b/;

function extractIp(data) {
  if (!data) return null;
  if (typeof data === 'object' && data.ip) return String(data.ip);
  const m = String(data).match(IP_RE);
  return m ? m[0] : null;
}

export class VPNManager {
  constructor(config = {}, deps = {}) {
    this.config = {
      enabled: false,
      type: 'external',            // external | openvpn | wireguard
      configPath: '',              // .ovpn file or .conf for wg-quick
      interface: '',               // wireguard interface name (default: basename of configPath)
      authUser: '',
      authPass: '',
      verifyUrl: 'https://api.ipify.org?format=json',
      verifyTimeoutMs: 8000,
      verifyIntervalMs: 30000,
      expectedExitIp: '',          // optional pin — verify fails if exit IP differs
      leakProtection: true,        // pause engine when tunnel drops
      requiredForVisits: true,     // engine skips visits while tunnel is down
      allowDirectVisits: false,    // allow proxy-less visits through the tunnel
      connectTimeoutMs: 30000,     // how long to wait for the tunnel to come up
      ...config,
    };
    // Injectable deps (tests)
    this._spawn = deps.spawn || realSpawn;
    this._fetch = deps.fetch || ((url, opts) => axios.get(url, opts));
    this._fs = deps.fs || fs;
    this._dataDir = deps.dataDir || path.join(process.cwd(), 'data');

    this.state = 'disconnected';   // disconnected | connecting | connected | error
    this.exitIp = null;
    this.lastVerify = null;        // { ok, ip, at, error? }
    this.process = null;           // managed child process (openvpn)
    this._authFile = null;
    this._timer = null;
    this._listeners = new Set();
    this.stats = { connects: 0, disconnects: 0, verifyFailures: 0, lastError: null };
  }

  // ------------------------------------------------------------- events ---
  onStateChange(fn) { this._listeners.add(fn); return () => this._listeners.delete(fn); }
  _emit() {
    const st = this.getStatus();
    for (const fn of this._listeners) { try { fn(st); } catch { /* listener error */ } }
  }
  _setState(state, lastError = null) {
    this.state = state;
    if (lastError !== null) this.stats.lastError = lastError;
    logger.info(`🔌 VPN state → ${state}${lastError ? ` (${lastError})` : ''} [${this.config.type}]`);
    this._emit();
  }

  // ------------------------------------------------------------ status ----
  isUp() { return this.config.enabled && this.state === 'connected'; }
  /** Engine gate: should visits be blocked right now? */
  blocksVisits() {
    return !!(this.config.enabled && this.config.requiredForVisits && !this.isUp());
  }
  getStatus() {
    return {
      enabled: this.config.enabled,
      type: this.config.type,
      state: this.state,
      exitIp: this.exitIp,
      expectedExitIp: this.config.expectedExitIp || null,
      lastVerify: this.lastVerify,
      leakProtection: this.config.leakProtection,
      requiredForVisits: this.config.requiredForVisits,
      allowDirectVisits: this.config.allowDirectVisits,
      pid: this.process?.pid || null,
      stats: { ...this.stats },
    };
  }
  getConfig() {
    // Never expose the password
    const { authPass, ...safe } = this.config;
    return { ...safe, authUser: this.config.authUser, hasAuthPass: !!this.config.authPass };
  }

  updateConfig(patch = {}) {
    const errors = [];
    const next = { ...this.config, ...patch };
    if (patch.type !== undefined && !VPN_TYPES.includes(patch.type)) {
      errors.push(`type must be one of ${VPN_TYPES.join(', ')}`);
    }
    if (patch.verifyIntervalMs !== undefined && (patch.verifyIntervalMs < 5000 || patch.verifyIntervalMs > 3600000)) {
      errors.push('verifyIntervalMs must be 5000–3600000');
    }
    if (patch.verifyTimeoutMs !== undefined && (patch.verifyTimeoutMs < 1000 || patch.verifyTimeoutMs > 60000)) {
      errors.push('verifyTimeoutMs must be 1000–60000');
    }
    if (errors.length) return { ok: false, errors };
    const wasMonitoring = !!this._timer;
    Object.assign(this.config, next);
    if (wasMonitoring && this.config.verifyIntervalMs) this.startMonitoring();
    return { ok: true, config: this.getConfig() };
  }

  // ----------------------------------------------------------- verify -----
  /** Probe the exit IP directly (no proxy). Returns lastVerify. */
  async verify() {
    const started = Date.now();
    try {
      const res = await this._fetch(this.config.verifyUrl, { timeout: this.config.verifyTimeoutMs });
      const ip = extractIp(res.data);
      const ok = !!ip && (!this.config.expectedExitIp || ip === this.config.expectedExitIp);
      this.lastVerify = { ok, ip, at: new Date().toISOString(), latencyMs: Date.now() - started };
      if (ip) this.exitIp = ip;
      if (!ok) {
        this.stats.verifyFailures++;
        if (this.state === 'connected') {
          this._setState('error', `exit IP verification failed (got ${ip || 'none'}${this.config.expectedExitIp ? `, expected ${this.config.expectedExitIp}` : ''})`);
        }
      } else if (this.state === 'connecting' || this.state === 'error') {
        // Tunnel came back / first success
        this._setState('connected');
      }
      return this.lastVerify;
    } catch (err) {
      this.lastVerify = { ok: false, ip: null, at: new Date().toISOString(), error: err.message };
      this.stats.verifyFailures++;
      if (this.state === 'connected' || this.state === 'connecting') {
        this._setState('error', `verify failed: ${err.message}`);
      }
      return this.lastVerify;
    }
  }

  // ---------------------------------------------------------- connect -----
  _validateForConnect() {
    const errors = [];
    if (!this.config.enabled) errors.push('VPN is disabled (enabled=false)');
    if (!VPN_TYPES.includes(this.config.type)) errors.push(`type must be one of ${VPN_TYPES.join(', ')}`);
    if (this.config.type !== 'external') {
      if (!this.config.configPath) errors.push('configPath is required for openvpn/wireguard');
      else if (!this._fs.existsSync(this.config.configPath)) errors.push(`configPath not found: ${this.config.configPath}`);
    }
    return { ok: errors.length === 0, errors };
  }

  async connect() {
    const v = this._validateForConnect();
    if (!v.ok) { this.stats.lastError = v.errors.join('; '); this._setState('error', this.stats.lastError); return { ok: false, errors: v.errors }; }
    if (this.state === 'connected' || this.state === 'connecting') return { ok: true, status: this.getStatus() };

    this._setState('connecting');
    try {
      if (this.config.type === 'external') {
        // Nothing to spawn — just verify the tunnel is really up.
        const vres = await this.verify();
        if (!vres.ok) { this._setState('error', vres.error || `exit IP verify failed (${vres.ip || 'no ip'})`); return { ok: false, error: this.stats.lastError }; }
        this.stats.connects++;
        this._setState('connected');
        this.startMonitoring();
        return { ok: true, status: this.getStatus() };
      }
      if (this.config.type === 'openvpn') return await this._connectOpenVpn();
      return await this._connectWireGuard();
    } catch (err) {
      this._setState('error', err.message);
      return { ok: false, error: err.message };
    }
  }

  _writeAuthFile() {
    if (!this.config.authUser) return null;
    try {
      this._fs.mkdirSync(this._dataDir, { recursive: true });
      const file = path.join(this._dataDir, `.vpn-auth-${process.pid}-${Date.now()}.txt`);
      this._fs.writeFileSync(file, `${this.config.authUser}\n${this.config.authPass}\n`, { mode: 0o600 });
      this._authFile = file;
      return file;
    } catch (err) {
      throw new Error(`could not write VPN auth file: ${err.message}`);
    }
  }

  _cleanupAuthFile() {
    if (this._authFile) {
      try { this._fs.unlinkSync(this._authFile); } catch { /* already gone */ }
      this._authFile = null;
    }
  }

  async _connectOpenVpn() {
    const authFile = this._writeAuthFile();
    const args = ['--config', this.config.configPath];
    if (authFile) args.push('--auth-user-pass', authFile);
    // --route-noexec/--ifconfig-noexec would break routing; keep defaults.
    logger.info(`🔌 Starting openvpn with ${this.config.configPath}`);
    const child = this._spawn('openvpn', args, { stdio: ['ignore', 'pipe', 'pipe'] });
    this.process = child;
    let completed = false;
    const timeoutMs = this.config.connectTimeoutMs;

    const waitCompleted = new Promise((resolve, reject) => {
      const to = setTimeout(() => reject(new Error(`openvpn did not complete initialization within ${timeoutMs}ms`)), timeoutMs);
      const onData = (buf) => {
        const text = String(buf);
        if (text.includes('Initialization Sequence Completed')) { completed = true; clearTimeout(to); resolve(); }
        if (/AUTH_FAILED|Cannot open|No such file|exiting/i.test(text) && !completed) {
          // don't reject immediately — openvpn retries; final decision on exit
        }
      };
      child.stdout?.on('data', onData);
      child.stderr?.on('data', onData);
      child.on('error', (e) => { clearTimeout(to); reject(e); });
      child.on('exit', (code) => {
        clearTimeout(to);
        if (!completed) reject(new Error(`openvpn exited before tunnel was up (code ${code})`));
        else resolve();
      });
    });

    child.on('exit', (code) => {
      // Tunnel dropped at runtime
      if (this.process === child) {
        this.process = null;
        this._cleanupAuthFile();
        if (this.state === 'connected' || this.state === 'connecting') {
          this.stats.disconnects++;
          this._setState('disconnected', `openvpn process exited (code ${code})`);
        }
      }
    });

    try {
      await waitCompleted;
    } catch (err) {
      this._killChild(child);
      this._cleanupAuthFile();
      this.process = null;
      throw err;
    }

    // Confirm the exit IP actually changed through the tunnel
    const vres = await this.verify();
    if (!vres.ok) {
      this._killChild(child);
      this._cleanupAuthFile();
      this.process = null;
      throw new Error(`tunnel up but exit IP verify failed: ${vres.error || vres.ip || 'no ip'}`);
    }
    this.stats.connects++;
    this._setState('connected');
    this.startMonitoring();
    return { ok: true, status: this.getStatus() };
  }

  async _connectWireGuard() {
    const iface = this.config.interface || path.basename(this.config.configPath).replace(/\.conf$/i, '');
    if (!iface) throw new Error('wireguard: could not determine interface name (set config.interface)');
    // wg-quick needs root; sudo -n avoids password prompts. If that fails the
    // error tells the user to allow passwordless wg-quick or use external mode.
    const res = await this._runWg(['-n', 'wg-quick', 'up', iface]);
    if (res.code !== 0) {
      throw new Error(`wg-quick up failed: ${res.stderr || res.stdout || `code ${res.code}`}. Grant passwordless sudo for wg-quick (sudo -n), or connect with your own VPN app and use type=external.`);
    }
    this._wgInterface = iface;
    const vres = await this.verify();
    if (!vres.ok) {
      await this._runWg(['-n', 'wg-quick', 'down', iface]).catch(() => {});
      throw new Error(`wg-quick up succeeded but exit IP verify failed: ${vres.error || vres.ip || 'no ip'}`);
    }
    this.stats.connects++;
    this._setState('connected');
    this.startMonitoring();
    return { ok: true, status: this.getStatus() };
  }

  _runWg(args) {
    return new Promise((resolve) => {
      const child = this._spawn('sudo', args, { stdio: ['ignore', 'pipe', 'pipe'] });
      let out = '', err = '';
      child.stdout?.on('data', (b) => { out += b; });
      child.stderr?.on('data', (b) => { err += b; });
      child.on('error', (e) => resolve({ code: -1, stdout: out, stderr: String(e) }));
      child.on('exit', (code) => resolve({ code, stdout: out, stderr: err }));
    });
  }

  _killChild(child) {
    try { child.kill('SIGTERM'); } catch { /* already dead */ }
    setTimeout(() => { try { child.kill('SIGKILL'); } catch { /* already dead */ } }, 3000).unref?.();
  }

  // ------------------------------------------------------- disconnect -----
  async disconnect() {
    const wasUp = this.state === 'connected';
    if (this.config.type === 'openvpn' && this.process) {
      this._killChild(this.process);
      this.process = null;
    }
    if (this.config.type === 'wireguard' && this._wgInterface) {
      await this._runWg(['-n', 'wg-quick', 'down', this._wgInterface]).catch(() => {});
      this._wgInterface = null;
    }
    this._cleanupAuthFile();
    if (wasUp) this.stats.disconnects++;
    this._setState('disconnected');
    // Keep monitoring only for external mode (we don't manage the tunnel, but
    // we still want to notice if the user's VPN app drops).
    if (this.config.type !== 'external' || !this.config.enabled) this.stopMonitoring();
    return { ok: true, status: this.getStatus() };
  }

  // ------------------------------------------------------- monitoring -----
  startMonitoring() {
    this.stopMonitoring();
    if (!this.config.enabled || this.config.verifyIntervalMs < 5000) return;
    this._timer = setInterval(() => { this.verify().catch(() => {}); }, this.config.verifyIntervalMs);
    this._timer.unref?.();
  }
  stopMonitoring() { if (this._timer) { clearInterval(this._timer); this._timer = null; } }
}

export default VPNManager;
