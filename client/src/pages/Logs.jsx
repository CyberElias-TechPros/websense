import React, { useState, useEffect } from 'react';
import { ScrollText, RefreshCw } from 'lucide-react';
import { getLogs } from '../services/api';

export default function Logs() {
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(false);
  const [filter, setFilter] = useState('');

  const load = async () => {
    setLoading(true);
    try {
      const res = await getLogs({ limit: 200 });
      setLogs(res.data.logs || []);
    } catch { /* noop */ }
    setLoading(false);
  };

  useEffect(() => {
    load();
    const interval = setInterval(load, 10000);
    return () => clearInterval(interval);
  }, []);

  const filtered = logs.filter(
    (l) => !filter || l.toLowerCase().includes(filter.toLowerCase())
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">System Logs</h2>
          <p className="text-dark-400">{logs.length} entries (auto-refreshing)</p>
        </div>
        <div className="flex gap-2">
          <input
            type="text"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder="Filter logs..."
            className="input w-56"
          />
          <button onClick={load} className="btn-secondary py-2">
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      <div className="card p-0 overflow-hidden">
        <div className="max-h-[600px] overflow-y-auto font-mono text-xs">
          {filtered.length === 0 ? (
            <div className="text-dark-500 text-center py-10">No log entries yet</div>
          ) : (
            filtered.map((line, i) => {
              const isError = line.includes('"level":"error"') || line.includes('[error]');
              const isWarn = line.includes('"level":"warn"') || line.includes('[warn]');
              return (
                <div
                  key={i}
                  className={`px-4 py-1 border-b border-dark-800/50 ${
                    isError ? 'text-red-400' : isWarn ? 'text-amber-400' : 'text-dark-300'
                  }`}
                >
                  {line}
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
