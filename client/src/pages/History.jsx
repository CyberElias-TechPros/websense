import React, { useState, useEffect, useCallback } from 'react';
import { ChevronLeft, ChevronRight, Download, Search } from 'lucide-react';
import { toast } from 'sonner';
import StatusBadge from '../components/StatusBadge';
import { getVisits } from '../services/api';

export default function History() {
  const [visits, setVisits] = useState([]);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [pages, setPages] = useState(0);
  const [filter, setFilter] = useState('all');
  const [search, setSearch] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const limit = 25;

  const load = useCallback(async () => {
    try {
      const params = { page, limit };
      if (filter !== 'all') params.status = filter;
      if (searchTerm) params.url = searchTerm;
      const res = await getVisits(params);
      setVisits(res.data.visits);
      setTotal(res.data.total);
      setPages(res.data.pages);
    } catch {
      toast.error('Failed to load visits');
    }
  }, [page, filter, searchTerm]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    const t = setTimeout(() => setSearchTerm(search), 300);
    return () => clearTimeout(t);
  }, [search]);

  const exportCsv = () => {
    const csv = [
      'Timestamp,URL,Proxy,Country,Status,Latency(ms),Success,Error',
      ...visits.map((v) =>
        `"${v.created_at}","${v.url}","${v.proxy_host}","${v.proxy_country}",${v.status_code},${v.latency_ms},${v.success ? 'Yes' : 'No'},"${(v.error_message || '').replace(/"/g, '""')}"`
      ),
    ].join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `visits-${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    toast.success('Exported CSV');
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">Visit History</h2>
          <p className="text-dark-400">{total} total visits recorded</p>
        </div>
        <button onClick={exportCsv} className="btn-secondary">
          <Download className="w-4 h-4" /> Export CSV
        </button>
      </div>

      <div className="flex gap-2 flex-wrap">
        {['all', 'success', 'failed'].map((f) => (
          <button
            key={f}
            onClick={() => { setFilter(f); setPage(1); }}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              filter === f ? 'bg-blue-600 text-white' : 'bg-dark-800 text-dark-400 hover:text-white'
            }`}
          >
            {f.charAt(0).toUpperCase() + f.slice(1)}
          </button>
        ))}
        <div className="relative flex-1 min-w-[200px]">
          <Search className="w-4 h-4 absolute left-3 top-2.5 text-dark-500" />
          <input
            type="text"
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1); }}
            placeholder="Search URL..."
            className="input pl-9 w-full"
          />
        </div>
      </div>

      <div className="card overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-dark-400 border-b border-dark-700">
              <th className="pb-3 text-left font-medium">Time</th>
              <th className="pb-3 text-left font-medium">URL</th>
              <th className="pb-3 text-left font-medium">Proxy</th>
              <th className="pb-3 text-center font-medium">Status</th>
              <th className="pb-3 text-right font-medium">Code</th>
              <th className="pb-3 text-right font-medium">Latency</th>
              <th className="pb-3 text-left font-medium">Error</th>
            </tr>
          </thead>
          <tbody>
            {visits.map((v) => (
              <tr key={v.id} className="border-b border-dark-800 hover:bg-dark-800/50">
                <td className="py-2.5 text-dark-400 text-xs whitespace-nowrap">
                  {new Date(v.created_at).toLocaleString()}
                </td>
                <td className="py-2.5">
                  <span className="text-blue-400 font-medium">{v.subdomain}</span>
                  <span className="text-dark-500">.freegameplay.site</span>
                </td>
                <td className="py-2.5 text-xs">{v.proxy_city}, {v.proxy_country}</td>
                <td className="py-2.5 text-center">
                  <StatusBadge status={v.success ? 'success' : 'failed'} />
                </td>
                <td className="py-2.5 text-right font-mono">{v.status_code || '-'}</td>
                <td className="py-2.5 text-right">{v.latency_ms}ms</td>
                <td className="py-2.5 text-red-400 text-xs truncate max-w-[200px]">
                  {v.error_message || '-'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        {visits.length === 0 && (
          <div className="text-dark-500 text-center py-10">No visits found</div>
        )}

        <div className="flex items-center justify-between mt-4 pt-4 border-t border-dark-700">
          <span className="text-dark-400 text-sm">
            Page {page} of {pages || 1} ({total} records)
          </span>
          <div className="flex gap-2">
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page <= 1}
              className="btn-secondary p-2 disabled:opacity-30"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <button
              onClick={() => setPage((p) => Math.min(pages || 1, p + 1))}
              disabled={page >= pages}
              className="btn-secondary p-2 disabled:opacity-30"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
