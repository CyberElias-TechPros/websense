import React from 'react';

const statusColors = {
  healthy: 'bg-emerald-500/20 text-emerald-400',
  degraded: 'bg-amber-500/20 text-amber-400',
  unhealthy: 'bg-red-500/20 text-red-400',
  circuit_open: 'bg-red-500/20 text-red-400',
  unknown: 'bg-dark-500/20 text-dark-400',
  running: 'bg-emerald-500/20 text-emerald-400',
  paused: 'bg-amber-500/20 text-amber-400',
  stopped: 'bg-dark-500/20 text-dark-400',
  success: 'bg-emerald-500/20 text-emerald-400',
  failed: 'bg-red-500/20 text-red-400',
  demo: 'bg-purple-500/20 text-purple-400',
};

export default function StatusBadge({ status, pulse = false }) {
  const color = statusColors[status] || statusColors.unknown;
  return (
    <span className={`badge ${color}`}>
      {pulse && status === 'running' && (
        <span className="w-2 h-2 bg-emerald-400 rounded-full pulse-green" />
      )}
      {status}
    </span>
  );
}
