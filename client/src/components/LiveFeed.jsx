import React from 'react';
import { Globe, Zap } from 'lucide-react';
import StatusBadge from './StatusBadge';

export default function LiveFeed({ visits, maxItems = 15 }) {
  const displayed = visits.slice(0, maxItems);

  return (
    <div className="card">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold flex items-center gap-2">
          <span className="w-2 h-2 bg-emerald-400 rounded-full pulse-green" />
          Live Visit Feed
        </h3>
        <span className="text-dark-400 text-sm">{visits.length} in buffer</span>
      </div>
      <div className="space-y-2 max-h-[520px] overflow-y-auto pr-1">
        {displayed.length === 0 ? (
          <div className="text-dark-500 text-center py-10">
            <Globe className="w-10 h-10 mx-auto mb-3 opacity-40" />
            <p className="text-sm">No visits yet. Start the engine to begin.</p>
          </div>
        ) : (
          displayed.map((visit, i) => (
            <div
              key={visit.visitId || i}
              className={`flex items-center justify-between p-3 rounded-lg border transition-all duration-300 animate-slide-in ${
                visit.success
                  ? 'bg-emerald-500/5 border-emerald-500/20'
                  : 'bg-red-500/5 border-red-500/20'
              }`}
            >
              <div className="flex items-center gap-3 min-w-0">
                <span className="text-lg shrink-0">{visit.proxy?.flag || '🌐'}</span>
                <div className="min-w-0">
                  <div className="font-medium text-sm truncate">
                    {visit.subdomain || 'unknown'}
                    <span className="text-dark-500">.freegameplay.site</span>
                  </div>
                  <div className="text-dark-500 text-xs">
                    via {visit.proxy?.city || 'Unknown'} · {visit.latency}ms
                    {visit.mode === 'demo' && ' · demo'}
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <StatusBadge status={visit.success ? 'success' : 'failed'} />
                <span className="text-dark-500 text-xs font-mono">
                  {visit.statusCode || '---'}
                </span>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
