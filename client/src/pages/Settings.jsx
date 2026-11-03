import React, { useState, useEffect } from 'react';
import { Save, Trash2, RotateCcw, ShieldCheck, ShieldOff, Wifi, WifiOff } from 'lucide-react';
import { toast } from 'sonner';
import { getConfig, updateConfig, cleanupDb, getEngineStatus, getVpnStatus, getVpnConfig, updateVpnConfig, connectVpn, disconnectVpn, verifyVpn } from '../services/api';

const PRESETS = {
  stealth: { minInterval: 30000, maxInterval: 120000, concurrency: 1 },
  moderate: { minInterval: 10000, maxInterval: 45000, concurrency: 2 },
  aggressive: { minInterval: 3000, maxInterval: 15000, concurrency: 5 },
  maximum: { minInterval: 1000, maxInterval: 5000, concurrency: 8 },
};

export default function Settings() {
  const [config, setConfig] = useState({
    minInterval: 5000, maxInterval: 30000, concurrency: 3,
    requestTimeout: 30000, retryAttempts: 2, mode: 'http',
  });
  const [saved, setSaved] = useState(false);
  const [cleanupDays, setCleanupDays] = useState(30);
  const [browserAvail, setBrowserAvail] = useState(null); // { available, reason } from engine status
  const [vpn, setVpn] = useState(null);       // status from /vpn/status
  const [vpnCfg, setVpnCfg] = useState(null); // config from /vpn/config

  useEffect(() => {
    const load = async () => {
      try {
        const res = await getConfig();
        setConfig(res.data);
      } catch {
        toast.error('Failed to load config');
      }
      try {
        const st = await getEngineStatus();
        setBrowserAvail(st.data?.browserMode || null);
      } catch { /* status optional */ }
      try {
        const vs = await getVpnStatus();
        if (vs.data?.enabled) {
          setVpn(vs.data);
          const vc = await getVpnConfig();
          setVpnCfg(vc.data);
        }
      } catch { /* vpn optional */ }
    };
    load();
  }, []);

  const vpnAction = async (fn, okMsg, errMsg) => {
    try {
      const r = await fn();
      if (r.data?.status) setVpn((v) => ({ ...(v || {}), ...r.data.status }));
      else if (r.data?.ok !== undefined && !r.data.ok) { toast.error(r.data.error || errMsg); return; }
      else setVpn(await getVpnStatus().then((x) => x.data).catch(() => vpn));
      toast.success(okMsg);
    } catch (e) {
      toast.error(e.response?.data?.error || errMsg);
    }
  };

  const handleVpnToggle = async (enabled) => {
    try {
      await updateVpnConfig({ enabled });
      setVpnCfg((c) => ({ ...(c || {}), enabled }));
      toast.success(enabled ? 'VPN enabled — connect it below' : 'VPN disabled');
    } catch (e) {
      toast.error(e.response?.data?.error || 'Failed to update VPN config');
    }
  };

  const handleSave = async () => {
    try {
      await updateConfig(config);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
      toast.success('Configuration saved');
    } catch {
      toast.error('Failed to save config');
    }
  };

  const handleCleanup = async () => {
    try {
      const res = await cleanupDb(cleanupDays);
      toast.success(`Deleted ${res.data.deleted} old visits`);
    } catch {
      toast.error('Cleanup failed');
    }
  };

  const applyPreset = (preset) => {
    setConfig((prev) => ({ ...prev, ...preset }));
    toast.info(`Applied ${preset === PRESETS.stealth ? 'stealth' : preset === PRESETS.moderate ? 'moderate' : preset === PRESETS.aggressive ? 'aggressive' : 'maximum'} preset`);
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold">Settings</h2>
        <p className="text-dark-400">Configure engine behavior</p>
      </div>

      <div className="card">
        <h3 className="text-lg font-semibold mb-4">Schedule Presets</h3>
        <div className="flex gap-3 flex-wrap">
          {Object.entries(PRESETS).map(([name, preset]) => (
            <button
              key={name}
              onClick={() => applyPreset(preset)}
              className="btn-secondary capitalize"
            >
              {name}
            </button>
          ))}
        </div>
      </div>

      <div className="card space-y-6">
        <h3 className="text-lg font-semibold">Visit Engine</h3>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div>
            <label className="block text-sm text-dark-400 mb-2">
              Min Interval: {Math.round(config.minInterval / 1000)}s
            </label>
            <input
              type="range" min="1000" max="120000" step="1000"
              value={config.minInterval}
              onChange={(e) => setConfig((c) => ({ ...c, minInterval: parseInt(e.target.value, 10) }))}
              className="w-full accent-blue-500"
            />
          </div>
          <div>
            <label className="block text-sm text-dark-400 mb-2">
              Max Interval: {Math.round(config.maxInterval / 1000)}s
            </label>
            <input
              type="range" min="1000" max="300000" step="1000"
              value={config.maxInterval}
              onChange={(e) => setConfig((c) => ({ ...c, maxInterval: parseInt(e.target.value, 10) }))}
              className="w-full accent-blue-500"
            />
          </div>
        </div>

        <div>
          <label className="block text-sm text-dark-400 mb-2">
            Concurrency: {config.concurrency} concurrent visits
          </label>
          <input
            type="range" min="1" max="10" value={config.concurrency}
            onChange={(e) => setConfig((c) => ({ ...c, concurrency: parseInt(e.target.value, 10) }))}
            className="w-full accent-blue-500"
          />
        </div>

        <div>
          <label className="block text-sm text-dark-400 mb-2">
            Request Timeout: {Math.round(config.requestTimeout / 1000)}s
          </label>
          <input
            type="range" min="5000" max="60000" step="1000"
            value={config.requestTimeout}
            onChange={(e) => setConfig((c) => ({ ...c, requestTimeout: parseInt(e.target.value, 10) }))}
            className="w-full accent-blue-500"
          />
        </div>

        <div>
          <label className="block text-sm text-dark-400 mb-2">
            Retry Attempts: {config.retryAttempts}
          </label>
          <input
            type="range" min="0" max="5" value={config.retryAttempts}
            onChange={(e) => setConfig((c) => ({ ...c, retryAttempts: parseInt(e.target.value, 10) }))}
            className="w-full accent-blue-500"
          />
        </div>

        <div>
          <label className="block text-sm text-dark-400 mb-2">Visit Mode</label>
          <select
            value={config.mode}
            onChange={(e) => setConfig((c) => ({ ...c, mode: e.target.value }))}
            className="input w-48"
          >
            <option value="http">HTTP requests</option>
            <option value="browser">Browser (Puppeteer)</option>
            <option value="mixed">Mixed (HTTP + browser)</option>
          </select>
          {['browser', 'mixed'].includes(config.mode) && browserAvail && !browserAvail.available && (
            <p className="text-xs text-amber-400 mt-2 max-w-xs">
              ⚠ Browser mode is unavailable on this machine: {browserAvail.reason}. Browser visits will fail until fixed.
            </p>
          )}
          {['browser', 'mixed'].includes(config.mode) && browserAvail?.available && (
            <p className="text-xs text-green-400 mt-2 max-w-xs">
              ✓ Browser mode ready ({browserAvail.reason})
            </p>
          )}
        </div>

        <button onClick={handleSave} className="btn-primary">
          <Save className="w-4 h-4" />
          {saved ? '✓ Saved!' : 'Save Configuration'}
        </button>
      </div>

      {vpnCfg && (
        <div className="card">
          <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
            {vpn?.state === 'connected' ? <ShieldCheck className="w-5 h-5 text-green-400" /> : <ShieldOff className="w-5 h-5 text-amber-400" />}
            VPN Tunnel
          </h3>
          <div className="flex items-center gap-4 flex-wrap">
            <label className="flex items-center gap-2 text-sm text-dark-300">
              <input
                type="checkbox"
                checked={!!vpnCfg.enabled}
                onChange={(e) => handleVpnToggle(e.target.checked)}
                className="accent-blue-500"
              />
              Enabled (visits blocked while tunnel is down — leak protection)
            </label>
            <select
              value={vpnCfg.type || 'external'}
              onChange={async (e) => { try { await updateVpnConfig({ type: e.target.value }); setVpnCfg((c) => ({ ...c, type: e.target.value })); } catch { toast.error('Invalid type'); } }}
              className="input w-44"
              disabled={!vpnCfg.enabled}
            >
              <option value="external">External (my own VPN app)</option>
              <option value="openvpn">OpenVPN (managed)</option>
              <option value="wireguard">WireGuard (wg-quick)</option>
            </select>
            {vpnCfg.type !== 'external' && (
              <input
                type="text"
                placeholder={vpnCfg.type === 'openvpn' ? '/path/to/config.ovpn' : '/path/to/wg0.conf'}
                value={vpnCfg.configPath || ''}
                onChange={(e) => setVpnCfg((c) => ({ ...c, configPath: e.target.value }))}
                onBlur={async (e) => { try { await updateVpnConfig({ configPath: e.target.value }); } catch { toast.error('Invalid config path'); } }}
                className="input w-72"
                disabled={!vpnCfg.enabled}
              />
            )}
            {vpn?.state === 'connected' ? (
              <button onClick={() => vpnAction(disconnectVpn, 'VPN disconnected', 'Disconnect failed')} className="btn-danger">
                <WifiOff className="w-4 h-4" /> Disconnect
              </button>
            ) : (
              <button onClick={() => vpnAction(connectVpn, 'VPN connected', 'Connect failed')} className="btn-primary" disabled={!vpnCfg.enabled}>
                <Wifi className="w-4 h-4" /> Connect
              </button>
            )}
            <button onClick={() => vpnAction(verifyVpn, 'Exit IP verified', 'Verify failed')} className="btn-secondary" disabled={!vpnCfg.enabled}>
              <RotateCcw className="w-4 h-4" /> Verify exit IP
            </button>
          </div>
          <div className="text-xs text-dark-400 mt-3 flex gap-4 flex-wrap">
            <span>State: <b className={vpn?.state === 'connected' ? 'text-green-400' : 'text-amber-400'}>{vpn?.state || 'disconnected'}</b></span>
            <span>Exit IP: <b>{vpn?.exitIp || '—'}</b>{vpn?.expectedExitIp ? ` (expected ${vpn.expectedExitIp})` : ''}</span>
            {vpn?.lastVerify && <span>Last check: {vpn.lastVerify.ok ? '✅' : '❌'} {vpn.lastVerify.at}</span>}
            {vpn?.stats?.lastError && <span className="text-red-400">Error: {vpn.stats.lastError}</span>}
          </div>
          <p className="text-dark-500 text-xs mt-2">
            external = connect with your own VPN app (NordVPN, WireGuard GUI, corporate client…), we verify the exit IP.
            openvpn/wireguard = the server spawns <code>openvpn --config</code> / <code>sudo -n wg-quick up</code> (needs the binary + passwordless sudo for wg-quick).
            Env: VPN_ENABLED, VPN_TYPE, VPN_CONFIG_PATH, VPN_AUTH_USER, VPN_AUTH_PASS, VPN_VERIFY_URL, VPN_EXPECTED_EXIT_IP, VPN_ALLOW_DIRECT_VISITS.
          </p>
        </div>
      )}

      <div className="card">
        <h3 className="text-lg font-semibold mb-4">Database Maintenance</h3>
        <div className="flex items-center gap-4 flex-wrap">
          <span className="text-dark-400 text-sm">Delete visits older than</span>
          <input
            type="number" min="1" max="3650"
            value={cleanupDays}
            onChange={(e) => setCleanupDays(parseInt(e.target.value, 10) || 30)}
            className="input w-24"
          />
          <span className="text-dark-400 text-sm">days</span>
          <button onClick={handleCleanup} className="btn-danger">
            <Trash2 className="w-4 h-4" /> Cleanup
          </button>
        </div>
        <p className="text-dark-500 text-xs mt-3">
          Tip: auto-cleanup runs daily on the server when DB_CLEANUP_DAYS is set.
        </p>
      </div>
    </div>
  );
}
