// ============================================================================
// vpn-manager.test.js — VPN tunnel management (no root / no real tunnel):
//   • deps are injected (spawn / fetch / fs / dataDir) so tests are hermetic
//   • external mode: connect = exit-IP verify; expectedExitIp pin; verify
//     failure while connected → state 'error' and blocksVisits() === true
//   • openvpn: spawn args, "Initialization Sequence Completed" detection,
//     auth file written 0600 + removed on disconnect, child exit → down
//   • wireguard: sudo -n wg-quick up/down args; sudo failure → actionable error
//   • updateConfig validation
//   • engine leak guard: VisitEngine skips real visits with reason 'vpn_down'
//     while a required tunnel is down; allows direct VPN visits when up
// ============================================================================

import { describe, it, expect, vi, beforeAll } from 'vitest';
import { EventEmitter } from 'node:events';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { VPNManager, VPN_TYPES } from '../../core/vpn-manager.js';

function fakeChild() {
  const child = new EventEmitter();
  child.stdout = new EventEmitter();
  child.stderr = new EventEmitter();
  child.pid = 4242;
  child.killed = [];
  child.kill = (sig) => { child.killed.push(sig); child.emit('exit', 0); return true; };
  return child;
}

const okFetch = (ip = '203.0.113.9') => async () => ({ data: { ip } });
const textFetch = (text = '198.51.100.7\n') => async () => ({ data: text });
const failFetch = async () => { throw new Error('connect ECONNREFUSED'); };

let tmpDir;
beforeAll(() => { tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'vpn-test-')); });

function mkVpn(config = {}, deps = {}) {
  return new VPNManager(
    { enabled: true, type: 'external', verifyIntervalMs: 60000, ...config },
    { fetch: okFetch(), dataDir: tmpDir, ...deps }
  );
}

describe('external mode', () => {
  it('connect() verifies the exit IP and goes connected', async () => {
    const vpn = mkVpn();
    const out = await vpn.connect();
    expect(out.ok).toBe(true);
    expect(vpn.state).toBe('connected');
    expect(vpn.exitIp).toBe('203.0.113.9');
    expect(vpn.isUp()).toBe(true);
    expect(vpn.blocksVisits()).toBe(false);
  });

  it('parses a plain-text IP body too', async () => {
    const vpn = mkVpn({}, { fetch: textFetch('198.51.100.7\n') });
    await vpn.connect();
    expect(vpn.exitIp).toBe('198.51.100.7');
  });

  it('expectedExitIp pin: mismatch → error state, visits blocked', async () => {
    const vpn = mkVpn({ expectedExitIp: '10.0.0.1' });
    const out = await vpn.connect();
    expect(out.ok).toBe(false);
    expect(vpn.state).toBe('error');
    expect(vpn.blocksVisits()).toBe(true); // enabled + requiredForVisits + not up
  });

  it('verify failure while connected flips to error and blocks visits (leak protection)', async () => {
    let fetchFn = okFetch();
    const vpn = mkVpn({}, { fetch: (...a) => fetchFn(...a) });
    await vpn.connect();
    expect(vpn.isUp()).toBe(true);
    fetchFn = failFetch;
    const v = await vpn.verify();
    expect(v.ok).toBe(false);
    expect(vpn.state).toBe('error');
    expect(vpn.blocksVisits()).toBe(true);
  });

  it('disabled VPN never blocks visits', async () => {
    const vpn = mkVpn({ enabled: false });
    expect(vpn.blocksVisits()).toBe(false);
    const out = await vpn.connect();
    expect(out.ok).toBe(false); // connect refused while disabled
  });
});

describe('openvpn (mocked spawn)', () => {
  const ovpnConfig = () => path.join(tmpDir, 'client.ovpn');

  it('spawns openvpn --config, waits for Initialization Sequence Completed, verifies, connects', async () => {
    fs.writeFileSync(ovpnConfig(), '[client]\n');
    const children = [];
    const spawn = vi.fn(() => { const c = fakeChild(); children.push(c); return c; });
    const vpn = mkVpn(
      { type: 'openvpn', configPath: ovpnConfig(), authUser: 'u', authPass: 'p' },
      { spawn }
    );
    const p = vpn.connect();
    await new Promise((r) => setImmediate(r));
    expect(spawn).toHaveBeenCalledWith('openvpn', expect.arrayContaining(['--config', ovpnConfig(), '--auth-user-pass', expect.stringMatching(/\.vpn-auth-.*\.txt$/)]), expect.anything());
    // auth file exists with 0600 while connected
    const authArg = spawn.mock.calls[0][1].find((a) => a.endsWith('.txt'));
    expect(fs.existsSync(authArg)).toBe(true);
    expect(fs.statSync(authArg).mode & 0o777).toBe(0o600);
    children[0].stdout.emit('data', Buffer.from('OpenVPN 2.6 Initialization Sequence Completed'));
    const out = await p;
    expect(out.ok).toBe(true);
    expect(vpn.state).toBe('connected');
    // disconnect kills the child and removes the auth file
    await vpn.disconnect();
    expect(children[0].killed).toContain('SIGTERM');
    expect(fs.existsSync(authArg)).toBe(false);
    expect(vpn.state).toBe('disconnected');
  });

  it('child exit before completion → error, auth file cleaned', async () => {
    fs.writeFileSync(ovpnConfig(), '[client]\n');
    const spawn = vi.fn(() => { const c = fakeChild(); setImmediate(() => c.emit('exit', 1)); return c; });
    const vpn = mkVpn({ type: 'openvpn', configPath: ovpnConfig(), authUser: 'u', authPass: 'p' }, { spawn });
    const out = await vpn.connect();
    expect(out.ok).toBe(false);
    expect(vpn.state).toBe('error');
    expect(vpn.process).toBe(null);
    expect(fs.readdirSync(tmpDir).filter((f) => f.startsWith('.vpn-auth-'))).toHaveLength(0);
  });

  it('missing configPath → validation error without spawning', async () => {
    const spawn = vi.fn();
    const vpn = mkVpn({ type: 'openvpn', configPath: '/nonexistent/x.ovpn' }, { spawn });
    const out = await vpn.connect();
    expect(out.ok).toBe(false);
    expect(out.errors.join(' ')).toMatch(/configPath/);
    expect(spawn).not.toHaveBeenCalled();
  });
});

describe('wireguard (mocked spawn)', () => {
  const wgConfig = () => path.join(tmpDir, 'wg0.conf');

  it('runs sudo -n wg-quick up <iface>, verifies, connects; down on disconnect', async () => {
    fs.writeFileSync(wgConfig(), '[Interface]\n');
    const calls = [];
    const spawn = vi.fn((cmd, args) => { calls.push([cmd, ...args]); const c = fakeChild(); setImmediate(() => c.emit('exit', 0)); return c; });
    const vpn = mkVpn({ type: 'wireguard', configPath: wgConfig() }, { spawn });
    const out = await vpn.connect();
    expect(out.ok).toBe(true);
    expect(calls[0]).toEqual(['sudo', '-n', 'wg-quick', 'up', 'wg0']);
    expect(vpn.state).toBe('connected');
    await vpn.disconnect();
    expect(calls.some((c) => c.join(' ') === 'sudo -n wg-quick down wg0')).toBe(true);
  });

  it('sudo failure → actionable error mentioning external mode', async () => {
    fs.writeFileSync(wgConfig(), '[Interface]\n');
    const spawn = vi.fn(() => { const c = fakeChild(); setImmediate(() => { c.stderr.emit('data', Buffer.from('sudo: a password is required')); c.emit('exit', 1); }); return c; });
    const vpn = mkVpn({ type: 'wireguard', configPath: wgConfig() }, { spawn });
    const out = await vpn.connect();
    expect(out.ok).toBe(false);
    expect(out.error).toMatch(/external/);
    expect(vpn.state).toBe('error');
  });
});

describe('updateConfig', () => {
  it('rejects invalid type / intervals', () => {
    const vpn = mkVpn();
    expect(vpn.updateConfig({ type: 'l2tp' }).ok).toBe(false);
    expect(vpn.updateConfig({ verifyIntervalMs: 10 }).ok).toBe(false);
    const ok = vpn.updateConfig({ type: 'openvpn', leakProtection: false });
    expect(ok.ok).toBe(true);
    expect(vpn.config.type).toBe('openvpn');
  });

  it('getConfig never exposes the password', () => {
    const vpn = mkVpn({ authUser: 'u', authPass: 'secret' });
    const c = vpn.getConfig();
    expect(c.authPass).toBeUndefined();
    expect(c.hasAuthPass).toBe(true);
    expect(JSON.stringify(c)).not.toContain('secret');
  });
});

describe('engine leak guard (VisitEngine + VPNManager)', () => {
  it('skips real visits with reason vpn_down while a required tunnel is down', async () => {
    const { default: VisitEngine } = await import('../../core/visit-engine.js');
    const pm = { select: () => null, getRandom: () => null, proxies: [], getActiveProxies: () => [], ensureScreened: async () => false, recordFailure: () => {} };
    const um = { getRandom: () => ({ url: 'http://example.com/', subdomain: 'example.com' }), recordVisit: () => {}, urls: [] };
    const engine = new VisitEngine(pm, um, { mode: 'http', requestTimeout: 500, retryAttempts: 0, demoMode: false });
    const vpn = mkVpn({ enabled: true, requiredForVisits: true }); // disconnected
    engine.setVpnManager(vpn);
    expect(vpn.blocksVisits()).toBe(true);
    const res = await engine.executeVisit({});
    expect(res.success).toBe(false);
    expect(res.skipped).toBe(true);
    expect(res.reason).toBe('vpn_down');
  });

  it('vpn up + allowDirectVisits → visit proceeds direct (proxy null, no gate)', async () => {
    const { default: VisitEngine } = await import('../../core/visit-engine.js');
    const pm = {
      select: () => null, getRandom: () => null, proxies: [], getActiveProxies: () => [],
      ensureScreened: async () => { throw new Error('gate must not run for direct VPN visits'); },
      recordSuccess: () => {}, recordFailure: () => {},
    };
    const um = { getRandom: () => ({ url: 'http://127.0.0.1:1/', subdomain: '127.0.0.1' }), recordVisit: () => {}, urls: [] };
    const engine = new VisitEngine(pm, um, { mode: 'http', requestTimeout: 300, retryAttempts: 0, demoMode: false });
    const vpn = mkVpn({ enabled: true, requiredForVisits: true, allowDirectVisits: true });
    await vpn.connect(); // external + ok fetch → connected
    engine.setVpnManager(vpn);
    expect(vpn.isUp()).toBe(true);
    const res = await engine.executeVisit({});
    // gate skipped, proxy null → request attempted direct and fails on conn refused,
    // NOT skipped with vpn_down / no_verified_proxy
    expect(res.reason).not.toBe('vpn_down');
    expect(res.reason).not.toBe('no_verified_proxy');
  });
});
