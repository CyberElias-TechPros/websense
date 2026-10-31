import React, { useState, useEffect } from 'react';
import { getHealthCheckerStats, getHealthCheckerResults, startHealthChecker, stopHealthChecker } from '../services/api';

export default function HealthChecker() {
  const [stats, setStats] = useState(null);
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    loadData();
    const interval = setInterval(loadData, 30000);
    return () => clearInterval(interval);
  }, []);

  const loadData = async () => {
    try {
      const [s, r] = await Promise.all([
        getHealthCheckerStats(),
        getHealthCheckerResults(20),
      ]);
      setStats(s.data);
      setResults(r.data.results || []);
    } catch (err) {
      console.error('Failed to load health checker data:', err);
    }
  };

  const handleStart = async () => {
    setLoading(true);
    try { await startHealthChecker(); } catch (e) {}
    await loadData();
    setLoading(false);
  };

  const handleStop = async () => {
    setLoading(true);
    try { await stopHealthChecker(); } catch (e) {}
    await loadData();
    setLoading(false);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">Health Checker</h1>
        <div className="flex gap-2">
          {stats?.active ? (
            <button onClick={handleStop} disabled={loading}
              className="px-4 py-2 rounded-lg bg-red-600 text-white text-sm font-medium hover:bg-red-700 disabled:opacity-50 transition-colors">
              Stop
            </button>
          ) : (
            <button onClick={handleStart} disabled={loading}
              className="px-4 py-2 rounded-lg bg-green-600 text-white text-sm font-medium hover:bg-green-700 disabled:opacity-50 transition-colors">
              Start
            </button>
          )}
          <button onClick={loadData}
            className="px-4 py-2 rounded-lg bg-indigo-600 text-white text-sm font-medium hover:bg-indigo-700 transition-colors">
            Refresh
          </button>
        </div>
      </div>

      {/* Stats */}
      {stats && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="bg-white rounded-xl shadow-lg p-4">
            <div className={`text-2xl font-bold ${stats.active ? 'text-green-600' : 'text-gray-400'}`}>
              {stats.active ? '✅ Active' : '⏸ Inactive'}
            </div>
            <div className="text-xs text-gray-500">Status</div>
          </div>
          <div className="bg-white rounded-xl shadow-lg p-4">
            <div className="text-2xl font-bold text-blue-600">{Math.round(stats.interval / 1000)}s</div>
            <div className="text-xs text-gray-500">Interval</div>
          </div>
          <div className="bg-white rounded-xl shadow-lg p-4">
            <div className="text-2xl font-bold text-purple-600">{stats.batchSize}</div>
            <div className="text-xs text-gray-500">Batch Size</div>
          </div>
          <div className="bg-white rounded-xl shadow-lg p-4">
            <div className="text-2xl font-bold text-orange-600">{stats.totalChecks || 0}</div>
            <div className="text-xs text-gray-500">Total Checks</div>
          </div>
        </div>
      )}

      {/* Last check result */}
      {stats?.lastCheck && (
        <div className="bg-white rounded-xl shadow-lg p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Last Check</h2>
          <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
            <div className="bg-gray-50 rounded-lg p-3">
              <div className="text-xs text-gray-500">Total Proxies</div>
              <div className="text-lg font-bold text-gray-900">{stats.lastCheck.total}</div>
            </div>
            <div className="bg-gray-50 rounded-lg p-3">
              <div className="text-xs text-gray-500">Checked</div>
              <div className="text-lg font-bold text-gray-900">{stats.lastCheck.checked}</div>
            </div>
            <div className="bg-gray-50 rounded-lg p-3">
              <div className="text-xs text-gray-500">Healthy</div>
              <div className="text-lg font-bold text-green-600">{stats.lastCheck.healthy}</div>
            </div>
            <div className="bg-gray-50 rounded-lg p-3">
              <div className="text-xs text-gray-500">Unhealthy</div>
              <div className="text-lg font-bold text-red-500">{stats.lastCheck.unhealthy}</div>
            </div>
            <div className="bg-gray-50 rounded-lg p-3">
              <div className="text-xs text-gray-500">Health Ratio</div>
              <div className="text-lg font-bold text-blue-600">
                {Math.round((stats.lastCheck.healthyRatio || 0) * 100)}%
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Check history */}
      <div className="bg-white rounded-xl shadow-lg p-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">Check History</h2>
        {results.length === 0 ? (
          <div className="text-center py-10 text-gray-400">No checks yet</div>
        ) : (
          <table className="w-full">
            <thead>
              <tr className="border-b border-gray-200">
                <th className="text-left py-2 text-sm font-medium text-gray-600">Time</th>
                <th className="text-right py-2 text-sm font-medium text-gray-600">Total</th>
                <th className="text-right py-2 text-sm font-medium text-gray-600">Checked</th>
                <th className="text-right py-2 text-sm font-medium text-gray-600">Healthy</th>
                <th className="text-right py-2 text-sm font-medium text-gray-600">Unhealthy</th>
                <th className="text-right py-2 text-sm font-medium text-gray-600">Ratio</th>
              </tr>
            </thead>
            <tbody>
              {results.map((r, i) => (
                <tr key={i} className="border-b border-gray-100">
                  <td className="py-2 text-sm text-gray-900">{new Date(r.timestamp).toLocaleString()}</td>
                  <td className="py-2 text-sm text-right text-gray-600">{r.total}</td>
                  <td className="py-2 text-sm text-right text-gray-600">{r.checked}</td>
                  <td className="py-2 text-sm text-right text-green-600">{r.healthy}</td>
                  <td className="py-2 text-sm text-right text-red-500">{r.unhealthy}</td>
                  <td className="py-2 text-sm text-right">
                    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                      r.healthyRatio >= 0.7 ? 'bg-green-100 text-green-700' :
                      r.healthyRatio >= 0.5 ? 'bg-yellow-100 text-yellow-700' :
                      'bg-red-100 text-red-700'
                    }`}>
                      {Math.round(r.healthyRatio * 100)}%
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
