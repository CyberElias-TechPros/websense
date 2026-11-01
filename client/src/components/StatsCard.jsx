import React from 'react';

const colorMap = {
  blue: 'from-blue-600 to-blue-800',
  green: 'from-emerald-600 to-emerald-800',
  red: 'from-red-600 to-red-800',
  amber: 'from-amber-600 to-amber-800',
  purple: 'from-purple-600 to-purple-800',
  cyan: 'from-cyan-600 to-cyan-800',
};

export default function StatsCard({ title, value, subtitle, icon: Icon, color = 'blue' }) {
  return (
    <div className="card card-hover relative overflow-hidden">
      <div className={`absolute top-0 right-0 w-24 h-24 rounded-bl-full bg-gradient-to-br ${colorMap[color]} opacity-10`} />
      <div className="flex items-start justify-between">
        <div>
          <p className="text-dark-400 text-sm font-medium">{title}</p>
          <p className="text-3xl font-bold mt-1">{value}</p>
          {subtitle && <p className="text-dark-400 text-xs mt-1">{subtitle}</p>}
        </div>
        {Icon && (
          <div className={`p-3 rounded-xl bg-gradient-to-br ${colorMap[color]} opacity-20`}>
            <Icon className="w-6 h-6 text-white" />
          </div>
        )}
      </div>
    </div>
  );
}
