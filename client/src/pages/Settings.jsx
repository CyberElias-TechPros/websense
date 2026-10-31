import React, { useState, useEffect } from 'react';
import { Save, Trash2, RotateCcw } from 'lucide-react';
import { toast } from 'sonner';
import { getConfig, updateConfig, cleanupDb } from '../services/api';

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

  useEffect(() => {
    const load = async () => {
      try {
        const res = await getConfig();
        setConfig(res.data);
      } catch {
        toast.error('Failed to load config');
      }
    };
    load();
  }, []);

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
        </div>

        <button onClick={handleSave} className="btn-primary">
          <Save className="w-4 h-4" />
          {saved ? '✓ Saved!' : 'Save Configuration'}
        </button>
      </div>

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
