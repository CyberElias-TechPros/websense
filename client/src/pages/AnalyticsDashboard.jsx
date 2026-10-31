import React, { useState, useEffect } from 'react';
import { getDashboard, getHourlyPattern, getProxyComparison, getProxyHealthSummary, getRotationStats } from '../services/api';

export default function AnalyticsDashboard() {
  const [dashboard, setDashboard] = useState(null);
  const [hourly, setHourly] = useState(null);
  const [comparison, setComparison] = useState(null);
  const [health, setHealth] = useState(null);
  const [rotation, setRotation] = useState(null);
  const [days, setDays] = useState(7);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    loadData();
  }, [days]);

  const loadData = async () => {
    setLoading(true);
    try {
      const [d, h, c, hh, r] = await Promise.all([
        getDashboard(days),
        getHourlyPattern(days),
        getProxyComparison(days),
        getProxyHealthSummary(),
        getRotationStats(),
      ]);
      setDashboard(d.data);
      setHourly(h.data);
      setComparison(c.data);
      setHealth(hh.data);
      setRotation(r.data);
    } catch (err) {
      console.error('Failed to load analytics:', err);
    }
    setLoading(false);
  };

  if (loading) return <div className="text-center py-20 text-gray-400">Loading analytics...</div>;
  if (!dashboard) return <div className="text-center py-20 text-gray-400">No data available</div>;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">Analytics Dashboard</h1>
        <select
          value={days}
          onChange={(e) => setDays(parseInt(e.target.value))}
          className="px-4 py-2 rounded-lg border border-gray-300 bg-white text-sm font-medium"
        >
          <option value={1}>Today</option>
          <option value={7}>Last 7 days</option>
          <option value={30}>Last 30 days</option>
          <option value={90}>Last 90 days</option>
        </select>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
        <div className="bg-white rounded-xl shadow-lg p-4">
          <div className="text-2xl font-bold text-gray-900">{dashboard.totals.total || 0}</div>
          <div className="text-xs text-gray-500">Total Visits</div>
        </div>
        <div className="bg-white rounded-xl shadow-lg p-4">
          <div className="text-2xl font-bold text-green-600">{dashboard.totals.successes || 0}</div>
          <div className="text-xs text-gray-500">Successful</div>
        </div>
        <div className="bg-white rounded-xl shadow-lg p-4">
          <div className="text-2xl font-bold text-red-500">{dashboard.totals.failures || 0}</div>
          <div className="text-xs text-gray-500">Failed</div>
        </div>
        <div className="bg-white rounded-xl shadow-lg p-4">
          <div className="text-2xl font-bold text-blue-600">{dashboard.totals.successRate || 0}%</div>
          <div className="text-xs text-gray-500">Success Rate</div>
        </div>
        <div className="bg-white rounded-xl shadow-lg p-4">
          <div className="text-2xl font-bold text-purple-600">{Math.round(dashboard.totals.avg_latency || 0)}ms</div>
          <div className="text-xs text-gray-500">Avg Latency</div>
        </div>
        <div className="bg-white rounded-xl shadow-lg p-4">
          <div className="text-2xl font-bold text-orange-600">{health?.healthy || 0}</div>
          <div className="text-xs text-gray-500">Healthy Proxies</div>
        </div>
      </div>

      {/* Daily traffic chart */}
      <div className="bg-white rounded-xl shadow-lg p-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">Daily Traffic</h2>
        <div className="flex items-end justify-between gap-2 h-48">
          {dashboard.byDay.map((d) => {
            const max = Math.max(...dashboard.byDay.map((x) => x.total), 1);
            return (
              <div key={d.day} className="flex-1 flex flex-col items-center gap-1">
                <div className="w-full bg-blue-500 rounded-t-lg flex items-end justify-center" style={{ height: `${(d.total / max) * 180}px` }}>
                  <span className="text-xs text-white mb-1">{d.total}</span>
                </div>
                <span className="text-xs text-gray-500">{d.day?.slice(5)}</span>
              </div>
            );
          })}
        </div>
      </div>

      {/* Hourly pattern */}
      <div className="bg-white rounded-xl shadow-lg p-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">
          Hourly Pattern {hourly?.peakHours?.length > 0 && `(Peak: ${hourly.peakHours.join(', ')})`}
        </h2>
        <div className="flex items-end justify-between gap-1 h-32">
          {hourly?.pattern?.map((h) => {
            const max = Math.max(...hourly.pattern.map((x) => x.total), 1);
            return (
              <div key={h.hour} className="flex-1 flex flex-col items-center gap-1">
                <div className="w-full bg-purple-500 rounded-t-lg" style={{ height: `${(h.total / max) * 120}px` }} />
                <span className="text-xs text-gray-500">{h.hour}</span>
              </div>
            );
          })}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Top URLs */}
        <div className="bg-white rounded-xl shadow-lg p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Top URLs</h2>
          <table className="w-full">
            <thead>
              <tr className="border-b border-gray-200">
                <th className="text-left py-2 text-sm font-medium text-gray-600">Subdomain</th>
                <th className="text-right py-2 text-sm font-medium text-gray-600">Visits</th>
                <th className="text-right py-2 text-sm font-medium text-gray-600">Success</th>
              </tr>
            </thead>
            <tbody>
              {dashboard.byUrl.slice(0, 10).map((u) => (
                <tr key={u.subdomain} className="border-b border-gray-100">
                  <td className="py-2 text-sm text-gray-900">{u.subdomain || 'N/A'}</td>
                  <td className="py-2 text-sm text-right text-gray-600">{u.total}</td>
                  <td className="py-2 text-sm text-right text-gray-600">{u.successes}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Traffic by Country */}
        <div className="bg-white rounded-xl shadow-lg p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Traffic by Country</h2>
          <table className="w-full">
            <thead>
              <tr className="border-b border-gray-200">
                <th className="text-left py-2 text-sm font-medium text-gray-600">Country</th>
                <th className="text-right py-2 text-sm font-medium text-gray-600">Visits</th>
                <th className="text-right py-2 text-sm font-medium text-gray-600">Success</th>
              </tr>
            </thead>
            <tbody>
              {dashboard.byCountry.slice(0, 10).map((c) => (
                <tr key={c.proxy_country} className="border-b border-gray-100">
                  <td className="py-2 text-sm text-gray-900">{c.proxy_country || 'N/A'}</td>
                  <td className="py-2 text-sm text-right text-gray-600">{c.total}</td>
                  <td className="py-2 text-sm text-right text-gray-600">{c.successes}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Proxy Performance Comparison */}
        <div className="bg-white rounded-xl shadow-lg p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Top Proxy Performance</h2>
          <table className="w-full">
            <thead>
              <tr className="border-b border-gray-200">
                <th className="text-left py-2 text-sm font-medium text-gray-600">Proxy</th>
                <th className="text-right py-2 text-sm font-medium text-gray-600">Visits</th>
                <th className="text-right py-2 text-sm font-medium text-gray-600">Score</th>
              </tr>
            </thead>
            <tbody>
              {comparison?.slice(0, 10).map((p) => (
                <tr key={p.proxy_host} className="border-b border-gray-100">
                  <td className="py-2 text-sm text-gray-900">{p.proxy_host} ({p.proxy_country})</td>
                  <td className="py-2 text-sm text-right text-gray-600">{p.total}</td>
                  <td className="py-2 text-sm text-right">
                    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                      p.performanceScore >= 70 ? 'bg-green-100 text-green-700' :
                      p.performanceScore >= 50 ? 'bg-yellow-100 text-yellow-700' :
                      'bg-red-100 text-red-700'
                    }`}>
                      {p.performanceScore}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* System Health */}
        <div className="bg-white rounded-xl shadow-lg p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">System Health</h2>
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-sm text-gray-600">Healthy Proxies</span>
              <span className="text-sm font-bold text-green-600">{health?.healthy || 0}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-gray-600">Unhealthy Proxies</span>
              <span className="text-sm font-bold text-red-500">{health?.unhealthy || 0}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-gray-600">In Cooldown</span>
              <span className="text-sm font-bold text-orange-500">{health?.inCooldown || 0}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-gray-600">Health Rate</span>
              <span className="text-sm font-bold text-blue-600">{health?.healthRate || 0}%</span>
            </div>
            <div className="border-t border-gray-100 pt-3">
              <div className="flex items-center justify-between">
                <span className="text-sm text-gray-600">Rotation Active</span>
                <span className={`text-sm font-bold ${rotation?.active ? 'text-green-600' : 'text-gray-400'}`}>
                  {rotation?.active ? 'Yes' : 'No'}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-gray-600">Rotations (1h)</span>
                <span className="text-sm font-bold text-purple-600">{rotation?.rotationsLastHour || 0}</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Top Errors */}
      {dashboard.topErrors && dashboard.topErrors.length > 0 && (
        <div className="bg-white rounded-xl shadow-lg p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Top Errors</h2>
          <table className="w-full">
            <thead>
              <tr className="border-b border-gray-200">
                <th className="text-left py-2 text-sm font-medium text-gray-600">Error</th>
                <th className="text-right py-2 text-sm font-medium text-gray-600">Count</th>
              </tr>
            </thead>
            <tbody>
              {dashboard.topErrors.map((e, i) => (
                <tr key={i} className="border-b border-gray-100">
                  <td className="py-2 text-sm text-gray-900 font-mono">{e.error_message}</td>
                  <td className="py-2 text-sm text-right text-gray-600">{e.count}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
