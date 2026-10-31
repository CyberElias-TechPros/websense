import React, { useState, useEffect, useCallback } from 'react';
import { Link2, Plus, Trash2, ToggleRight, ToggleLeft } from 'lucide-react';
import { toast } from 'sonner';
import { getUrls, addUrl, removeUrl, setUrlPriority, toggleUrl } from '../services/api';

export default function UrlTable() {
  const [urls, setUrls] = useState([]);
  const [newUrl, setNewUrl] = useState('');
  const [bulk, setBulk] = useState('');
  const [showBulk, setShowBulk] = useState(false);

  const loadUrls = useCallback(async () => {
    try {
      const res = await getUrls();
      setUrls(res.data);
    } catch {
      toast.error('Failed to load URLs');
    }
  }, []);

  useEffect(() => {
    loadUrls();
  }, [loadUrls]);

  const handleAdd = async () => {
    if (!newUrl.trim()) return;
    try {
      await addUrl(newUrl.trim());
      toast.success('URL added');
      setNewUrl('');
      await loadUrls();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to add URL');
    }
  };

  const handleRemove = async (url) => {
    try {
      await removeUrl(url);
      toast.success('URL removed');
      await loadUrls();
    } catch {
      toast.error('Failed to remove URL');
    }
  };

  const handlePriority = async (url, priority) => {
    try {
      await setUrlPriority(url, parseInt(priority, 10));
      await loadUrls();
    } catch {
      toast.error('Failed to update priority');
    }
  };

  const handleToggle = async (url, enabled) => {
    try {
      await toggleUrl(url, !enabled);
      await loadUrls();
    } catch {
      toast.error('Failed to toggle URL');
    }
  };

  const handleBulkImport = async () => {
    const list = bulk.split('\n').map((s) => s.trim()).filter(Boolean);
    for (const url of list) {
      try {
        await addUrl(url);
      } catch { /* skip duplicates */ }
    }
    setBulk('');
    setShowBulk(false);
    toast.success(`Imported ${list.length} URLs`);
    await loadUrls();
  };

  return (
    <div className="card">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold flex items-center gap-2">
          <Link2 className="w-5 h-5 text-purple-400" />
          Target URLs ({urls.length})
        </h3>
        <button onClick={() => setShowBulk((s) => !s)} className="btn-secondary text-sm py-1.5">
          <Plus className="w-4 h-4" /> Bulk Import
        </button>
      </div>

      {showBulk && (
        <div className="mb-4 p-4 bg-dark-800/50 rounded-lg animate-fade-in">
          <textarea
            className="input w-full h-24 mb-3 font-mono text-xs"
            placeholder={'https://one.freegameplay.site/\nhttps://two.freegameplay.site/'}
            value={bulk}
            onChange={(e) => setBulk(e.target.value)}
          />
          <div className="flex justify-end gap-2">
            <button onClick={() => setShowBulk(false)} className="btn-secondary py-1.5">Cancel</button>
            <button onClick={handleBulkImport} className="btn-primary py-1.5">Import</button>
          </div>
        </div>
      )}

      <div className="flex gap-2 mb-4">
        <input
          type="url"
          value={newUrl}
          onChange={(e) => setNewUrl(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleAdd()}
          placeholder="https://example.freegameplay.site/"
          className="input flex-1"
        />
        <button onClick={handleAdd} className="btn-primary">
          <Plus className="w-4 h-4" /> Add
        </button>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-dark-400 border-b border-dark-700">
              <th className="pb-3 text-left font-medium">Subdomain</th>
              <th className="pb-3 text-right font-medium">Visits</th>
              <th className="pb-3 text-right font-medium">Success</th>
              <th className="pb-3 text-right font-medium">Rate</th>
              <th className="pb-3 text-center font-medium">Priority</th>
              <th className="pb-3 text-left font-medium">Last Visit</th>
              <th className="pb-3 text-center font-medium">Actions</th>
            </tr>
          </thead>
          <tbody>
            {urls.map((u) => (
              <tr
                key={u.url}
                className={`border-b border-dark-800 hover:bg-dark-800/50 ${!u.enabled ? 'opacity-40' : ''}`}
              >
                <td className="py-3">
                  <span className="font-medium text-blue-400">{u.subdomain}</span>
                  <span className="text-dark-500">.freegameplay.site</span>
                </td>
                <td className="py-3 text-right">{u.visitCount}</td>
                <td className="py-3 text-right text-emerald-400">{u.successCount}</td>
                <td className="py-3 text-right">{u.successRate}%</td>
                <td className="py-3">
                  <div className="flex items-center justify-center gap-2">
                    <input
                      type="range"
                      min="1"
                      max="10"
                      value={u.priority}
                      onChange={(e) => handlePriority(u.url, e.target.value)}
                      className="w-20 accent-blue-500"
                    />
                    <span className="text-xs text-dark-400 w-4">{u.priority}</span>
                  </div>
                </td>
                <td className="py-3 text-dark-400 text-xs">
                  {u.lastVisited ? new Date(u.lastVisited).toLocaleString() : 'Never'}
                </td>
                <td className="py-3">
                  <div className="flex items-center justify-center gap-1">
                    <button
                      onClick={() => handleToggle(u.url, u.enabled)}
                      className="p-1.5 hover:bg-dark-700 rounded"
                    >
                      {u.enabled
                        ? <ToggleRight className="w-5 h-5 text-emerald-400" />
                        : <ToggleLeft className="w-5 h-5 text-dark-500" />}
                    </button>
                    <button
                      onClick={() => handleRemove(u.url)}
                      className="p-1.5 hover:bg-dark-700 rounded text-red-400"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
