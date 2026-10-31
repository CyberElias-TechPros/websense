import React from 'react';
import { Play, Pause, Square, RefreshCw, Zap, Clock, Gauge } from 'lucide-react';
import StatusBadge from './StatusBadge';

export default function EngineControls({ state, stats, onStart, onPause, onStop, onResume, onManualVisit, loading }) {
  return (
    <div className="card space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold flex items-center gap-2">
          <Zap className="w-5 h-5 text-blue-400" />
          Engine Control
        </h3>
        <StatusBadge status={state} pulse />
      </div>

      <div className="flex gap-3">
        {state === 'stopped' && (
          <button onClick={onStart} disabled={loading} className="btn-success flex-1">
            <Play className="w-4 h-4" /> Start
          </button>
        )}
        {state === 'running' && (
          <>
            <button onClick={onPause} disabled={loading} className="btn-warning flex-1">
              <Pause className="w-4 h-4" /> Pause
            </button>
            <button onClick={onStop} disabled={loading} className="btn-danger flex-1">
              <Square className="w-4 h-4" /> Stop
            </button>
          </>
        )}
        {state === 'paused' && (
          <>
            <button onClick={onResume} disabled={loading} className="btn-success flex-1">
              <RefreshCw className="w-4 h-4" /> Resume
            </button>
            <button onClick={onStop} disabled={loading} className="btn-danger flex-1">
              <Square className="w-4 h-4" /> Stop
            </button>
          </>
        )}
      </div>

      <button onClick={onManualVisit} disabled={loading} className="btn-secondary w-full text-sm">
        ⚡ Visit Now (one-off)
      </button>

      <div className="space-y-2 pt-2 border-t border-dark-700">
        <div className="flex items-center justify-between text-sm">
          <span className="text-dark-400 flex items-center gap-1.5"><Gauge className="w-3.5 h-3.5" /> Concurrency</span>
          <span>{stats.concurrency || 3} slots</span>
        </div>
        <div className="flex items-center justify-between text-sm">
          <span className="text-dark-400 flex items-center gap-1.5"><Clock className="w-3.5 h-3.5" /> Interval</span>
          <span>{stats.intervalRange || '5-30s'}</span>
        </div>
        <div className="flex items-center justify-between text-sm">
          <span className="text-dark-400">Mode</span>
          <span>{stats.mode || 'http'}{stats.demoMode ? ' · demo' : ''}</span>
        </div>
        <div className="flex items-center justify-between text-sm">
          <span className="text-dark-400">Active visits</span>
          <span>{stats.activeVisits || 0}</span>
        </div>
      </div>
    </div>
  );
}
