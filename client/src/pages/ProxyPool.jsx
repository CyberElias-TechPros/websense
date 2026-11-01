import React, { useState, useEffect } from 'react';
import { getPoolSummary, getPoolHealthReport, forceRefresh, getProxyHealthSummary, getProxyPerformanceMetrics, getIntelSummary } from '../services/api';

export default function ProxyPool() {
  const [summary, setSummary] = useState(null);
  const [report, setReport] = useState(null);
  const [health, setHealth] = useState(null);
  const [performance, setPerformance] = useState(null);
  const [intel, setIntel] = useState(null);
  const [refreshing, setRefreshing] = useState(false);
  const [selectedProxy, setSelectedProxy] = useState(null);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      const [s, r, h, p, i] = await Promise.all([
        getPoolSummary(),
        getPoolHealthReport(),
        getProxyHealthSummary(),
        getProxyPerformanceMetrics(),
        getIntelSummary(),
      ]);
      setSummary(s.data);
      setReport(r.data);
      setHealth(h.data);
      setPerformance(p.data);
      setIntel(i.data);
    } catch (err) {
      console.error('Failed to load pool data:', err);
    }
  };

  const handleRefresh = async () => {
    setRefreshing(true);
    try {
      await forceRefresh();
      await loadData();
    } catch (err) {
      console.error('Refresh failed:', err);
    }
    setRefreshing(false);
  };

  if (!summary) return <div className="text-center py-20 text-gray-400">Loading pool...</div>;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">Proxy Pool</h1>
        <button
          onClick={handleRefresh}
          disabled={refreshing}
          className="px-4 py-2 rounded-lg bg-indigo-600 text-white text-sm font-medium hover:bg-indigo-700 disabled:opacity-50 transition-colors"
        >
          {refreshing ? 'Refreshing...' : '🔄 Refresh Pool'}
        </button>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
        <div className="bg-white rounded-xl shadow-lg p-4">
          <div className="text-2xl font-bold text-gray-900">{summary.poolStats.total || 0}</div>
          <div className="text-xs text-gray-500">Total Proxies</div>
        </div>
        <div className="bg-white rounded-xl shadow-lg p-4">
          <div className="text-2xl font-bold text-green-600">{summary.poolStats.healthy || 0}</div>
          <div className="text-xs text-gray-500">Healthy</div>
        </div>
        <div className="bg-white rounded-xl shadow-lg p-4">
          <div className="text-2xl font-bold text-red-500">{summary.poolStats.unhealthy || 0}</div>
          <div className="text-xs text-gray-500">Unhealthy</div>
        </div>
        <div className="bg-white rounded-xl shadow-lg p-4">
          <div className="text-2xl font-bold text-blue-600">{summary.poolStats.healthyRatio || 0}%</div>
          <div className="text-xs text-gray-500">Health Rate</div>
        </div>
        <div className="bg-white rounded-xl shadow-lg p-4">
          <div className="text-2xl font-bold text-purple-600">{summary.healthyProxies || 0}</div>
          <div className="text-xs text-gray-500">Selectable</div>
        </div>
        <div className="bg-white rounded-xl shadow-lg p-4">
          <div className={`text-2xl font-bold ${summary.poolStats.meetsMinimum ? 'text-green-600' : 'text-red-500'}`}>
            {summary.poolStats.meetsMinimum ? '✅' : '⚠️'}
          </div>
          <div className="text-xs text-gray-500">Pool Status</div>
        </div>
      </div>

      {/* Pool health distribution */}
      <div className="bg-white rounded-xl shadow-lg p-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">Pool Health Distribution</h2>
        <div className="space-y-3">
          <div>
            <div className="flex justify-between text-sm mb-1">
              <span className="text-gray-600">Healthy (80+)</span>
              <span className="font-medium text-green-600">{report?.proxies?.filter(p => p.healthScore >= 80).length || 0}</span>
            </div>
            <div className="w-full bg-gray-200 rounded-full h-6">
              <div className="bg-green-500 h-6 rounded-full flex items-center justify-end pr-2 text-white text-xs font-bold"
                style={{ width: `${(report?.proxies?.filter(p => p.healthScore >= 80).length / Math.max(report?.proxies?.length, 1)) * 100}%` }}>
                {Math.round((report?.proxies?.filter(p => p.healthScore >= 80).length / Math.max(report?.proxies?.length, 1)) * 100)}%
              </div>
            </div>
          </div>
          <div>
            <div className="flex justify-between text-sm mb-1">
              <span className="text-gray-600">Good (60-79)</span>
              <span className="font-medium text-blue-500">{report?.proxies?.filter(p => p.healthScore >= 60 && p.healthScore < 80).length || 0}</span>
            </div>
            <div className="w-full bg-gray-200 rounded-full h-6">
              <div className="bg-blue-500 h-6 rounded-full flex items-center justify-end pr-2 text-white text-xs font-bold"
                style={{ width: `${(report?.proxies?.filter(p => p.healthScore >= 60 && p.healthScore < 80).length / Math.max(report?.proxies?.length, 1)) * 100}%` }}>
                {Math.round((report?.proxies?.filter(p => p.healthScore >= 60 && p.healthScore < 80).length / Math.max(report?.proxies?.length, 1)) * 100)}%
              </div>
            </div>
          </div>
          <div>
            <div className="flex justify-between text-sm mb-1">
              <span className="text-gray-600">Fair (40-59)</span>
              <span className="font-medium text-yellow-500">{report?.proxies?.filter(p => p.healthScore >= 40 && p.healthScore < 60).length || 0}</span>
            </div>
            <div className="w-full bg-gray-200 rounded-full h-6">
              <div className="bg-yellow-500 h-6 rounded-full flex items-center justify-end pr-2 text-white text-xs font-bold"
                style={{ width: `${(report?.proxies?.filter(p => p.healthScore >= 40 && p.healthScore < 60).length / Math.max(report?.proxies?.length, 1)) * 100}%` }}>
                {Math.round((report?.proxies?.filter(p => p.healthScore >= 40 && p.healthScore < 60).length / Math.max(report?.proxies?.length, 1)) * 100)}%
              </div>
            </div>
          </div>
          <div>
            <div className="flex justify-between text-sm mb-1">
                <span className="text-gray-600">Poor (under 40)</span>
              <span className="font-medium text-red-500">{report?.proxies?.filter(p => p.healthScore < 40).length || 0}</span>
            </div>
            <div className="w-full bg-gray-200 rounded-full h-6">
              <div className="bg-red-500 h-6 rounded-full flex items-center justify-end pr-2 text-white text-xs font-bold"
                style={{ width: `${(report?.proxies?.filter(p => p.healthScore < 40).length / Math.max(report?.proxies?.length, 1)) * 100}%` }}>
                {Math.round((report?.proxies?.filter(p => p.healthScore < 40).length / Math.max(report?.proxies?.length, 1)) * 100)}%
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Proxy table */}
      <div className="bg-white rounded-xl shadow-lg p-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">Proxy Details</h2>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-gray-200">
                <th className="text-left py-2 text-sm font-medium text-gray-600">Proxy</th>
                <th className="text-left py-2 text-sm font-medium text-gray-600">Country</th>
                <th className="text-center py-2 text-sm font-medium text-gray-600">Health</th>
                <th className="text-right py-2 text-sm font-medium text-gray-600">Visits</th>
                <th className="text-right py-2 text-sm font-medium text-gray-600">Success</th>
                <th className="text-right py-2 text-sm font-medium text-gray-600">Latency</th>
                <th className="text-center py-2 text-sm font-medium text-gray-600">Status</th>
              </tr>
            </thead>
            <tbody>
              {report?.proxies?.slice(0, 50).map((p) => (
                <tr key={`${p.host}:${p.port}`} className="border-b border-gray-100 hover:bg-gray-50 cursor-pointer"
                  onClick={() => setSelectedProxy(p)}>
                  <td className="py-2 text-sm text-gray-900">{p.host}:{p.port}</td>
                  <td className="py-2 text-sm text-gray-600">{p.country || 'N/A'}</td>
                  <td className="py-2 text-sm text-center">
                    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                      p.healthScore >= 80 ? 'bg-green-100 text-green-700' :
                      p.healthScore >= 60 ? 'bg-blue-100 text-blue-700' :
                      p.healthScore >= 40 ? 'bg-yellow-100 text-yellow-700' :
                      'bg-red-100 text-red-700'
                    }`}>
                      {p.healthScore}
                    </span>
                  </td>
                  <td className="py-2 text-sm text-right text-gray-600">{p.totalVisits || 0}</td>
                  <td className="py-2 text-sm text-right text-gray-600">{p.successRate || 0}%</td>
                  <td className="py-2 text-sm text-right text-gray-600">{p.avgLatency || 0}ms</td>
                  <td className="py-2 text-sm text-center">
                    {p.isCooldown ? (
                      <span className="text-xs text-orange-500">Cooldown</span>
                    ) : p.healthScore >= 60 ? (
                      <span className="text-xs text-green-500">Active</span>
                    ) : (
                      <span className="text-xs text-red-500">Poor</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {report?.proxies?.length > 50 && (
          <p className="text-sm text-gray-500 mt-2">Showing 50 of {report.proxies.length} proxies</p>
        )}
      </div>

      {/* Selected proxy detail */}
      {selectedProxy && (
        <div className="bg-white rounded-xl shadow-lg p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-gray-900">
              Proxy Details: {selectedProxy.host}:{selectedProxy.port}
            </h2>
            <button onClick={() => setSelectedProxy(null)} className="text-gray-400 hover:text-gray-600">✕</button>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="bg-gray-50 rounded-lg p-3">
              <div className="text-xs text-gray-500">Country</div>
              <div className="text-sm font-medium text-gray-900">{selectedProxy.country || 'N/A'}</div>
            </div>
            <div className="bg-gray-50 rounded-lg p-3">
              <div className="text-xs text-gray-500">Health Score</div>
              <div className="text-sm font-medium text-gray-900">{selectedProxy.healthScore}</div>
            </div>
            <div className="bg-gray-50 rounded-lg p-3">
              <div className="text-xs text-gray-500">Total Visits</div>
              <div className="text-sm font-medium text-gray-900">{selectedProxy.totalVisits || 0}</div>
            </div>
            <div className="bg-gray-50 rounded-lg p-3">
              <div className="text-xs text-gray-500">Success Rate</div>
              <div className="text-sm font-medium text-gray-900">{selectedProxy.successRate || 0}%</div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
