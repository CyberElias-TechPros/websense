import React, { useState, useEffect } from 'react';
import { getRecentNotifications, getNotificationStats } from '../services/api';

export default function Notifications() {
  const [notifications, setNotifications] = useState([]);
  const [stats, setStats] = useState(null);
  const [filter, setFilter] = useState('all');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadData();
    const interval = setInterval(loadData, 30000);
    return () => clearInterval(interval);
  }, []);

  const loadData = async () => {
    try {
      const [n, s] = await Promise.all([
        getRecentNotifications(100),
        getNotificationStats(),
      ]);
      setNotifications(n.data.notifications || []);
      setStats(s.data);
    } catch (err) {
      console.error('Failed to load notifications:', err);
    }
    setLoading(false);
  };

  const filtered = filter === 'all' ? notifications : notifications.filter(n => n.level === filter);

  const levelIcons = {
    error: '🔴',
    warning: '🟡',
    success: '🟢',
    info: '🔵',
  };

  const levelColors = {
    error: 'border-l-red-500 bg-red-50',
    warning: 'border-l-yellow-500 bg-yellow-50',
    success: 'border-l-green-500 bg-green-50',
    info: 'border-l-blue-500 bg-blue-50',
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">Notifications</h1>
        <div className="flex gap-2">
          <button onClick={loadData} className="px-4 py-2 rounded-lg bg-indigo-600 text-white text-sm font-medium hover:bg-indigo-700 transition-colors">
            Refresh
          </button>
        </div>
      </div>

      {/* Stats */}
      {stats && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="bg-white rounded-xl shadow-lg p-4">
            <div className="text-2xl font-bold text-gray-900">{stats.totalNotifications || 0}</div>
            <div className="text-xs text-gray-500">Total</div>
          </div>
          <div className="bg-white rounded-xl shadow-lg p-4">
            <div className="text-2xl font-bold text-red-500">{stats.byLevel?.error || 0}</div>
            <div className="text-xs text-gray-500">Errors</div>
          </div>
          <div className="bg-white rounded-xl shadow-lg p-4">
            <div className="text-2xl font-bold text-yellow-500">{stats.byLevel?.warning || 0}</div>
            <div className="text-xs text-gray-500">Warnings</div>
          </div>
          <div className="bg-white rounded-xl shadow-lg p-4">
            <div className="text-2xl font-bold text-green-600">{stats.byLevel?.success || 0}</div>
            <div className="text-xs text-gray-500">Success</div>
          </div>
        </div>
      )}

      {/* Filter */}
      <div className="flex gap-2">
        {['all', 'error', 'warning', 'success', 'info'].map(f => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`px-4 py-2 rounded-lg text-sm font-medium capitalize transition-colors ${
              filter === f ? 'bg-indigo-600 text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
            }`}
          >
            {f}
          </button>
        ))}
      </div>

      {/* Notifications list */}
      <div className="space-y-2">
        {loading ? (
          <div className="text-center py-20 text-gray-400">Loading notifications...</div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-20 text-gray-400">No notifications</div>
        ) : (
          filtered.map(n => (
            <div key={n.id} className={`border-l-4 rounded-lg p-4 ${levelColors[n.level] || levelColors.info}`}>
              <div className="flex items-start justify-between">
                <div className="flex items-start gap-3">
                  <span className="text-xl">{levelIcons[n.level] || '⚪'}</span>
                  <div>
                    <div className="font-medium text-gray-900">{n.message}</div>
                    <div className="text-xs text-gray-500 mt-1">
                      {n.event} • {n.source} • {new Date(n.timestamp).toLocaleString()}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
