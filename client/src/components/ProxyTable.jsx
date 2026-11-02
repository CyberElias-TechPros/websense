import React, { useState, useEffect, useCallback } from 'react';
import { RefreshCw, ToggleRight, ToggleLeft, Trash2, Plus, Shield } from 'lucide-react';
import { toast } from 'sonner';
import StatusBadge from './StatusBadge';
import {
  getProxies, checkAllProxies, checkProxy, toggleProxy, addProxy, removeProxy,
} from '../services/api';

export default function ProxyTable() {
  const [proxies, setProxies] = useState([]);
  const [checking, setChecking] = useState(false);
  const [checkingHost, setCheckingHost] = useState(null);
  const [adding, setAdding] = useState({ host: '', port: '', country: '', city: '', type: 'http' });
  const [showAdd, setShowAdd] = useState(false);

  const loadProxies = useCallback(async () => {
    try {
      const res = await getProxies();
      setProxies(res.data);
    } catch (err) {
      toast.error('Failed to load proxies');
    }
  }, []);

  useEffect(() => {
    loadProxies();
    const interval = setInterval(loadProxies, 30000);
    return () => clearInterval(interval);
  }, [loadProxies]);

  const handleCheckAll = async () => {
    setChecking(true);
    try {
      const results = await checkAllProxies();
      const ok = results.filter((r) => r.healthy).length;
      toast.success(`Health check complete: ${ok}/${results.length} healthy`);
      await loadProxies();
    } catch (err) {
      toast.error('Health check failed');
    } finally {
      setChecking(false);
    }
  };

  const handleCheckOne = async (host) => {
    setCheckingHost(host);
    try {
      const res = await checkProxy(host);
      if (res.data.healthy) {
        toast.success(`${host}: healthy (${res.data.latency}ms)`);
      } else {
        toast.error(`${host}: ${res.data.error || 'unhealthy'}`, { duration: 6000 });
      }
      await loadProxies();
    } catch {
      toast.error('Health check failed');
    } finally {
      setCheckingHost(null);
    }
  };

  const handleToggle = async (host, currentEnabled) => {
    try {
      await toggleProxy(host, !currentEnabled);
      await loadProxies();
    } catch {
      toast.error('Failed to toggle proxy');
    }
  };

  const handleRemove = async (host) => {
    try {
      await removeProxy(host);
      toast.success(`Removed ${host}`);
      await loadProxies();
    } catch {
      toast.error('Failed to remove proxy');
    }
  };

  const handleAdd = async () => {
    try {
      await addProxy({
        host: adding.host,
        port: parseInt(adding.port, 10),
        type: adding.type,
        country: adding.country || 'XX',
        city: adding.city || 'Unknown',
        flag: '🌐',
      });
      toast.success('Proxy added');
      setAdding({ host: '', port: '', country: '', city: '', type: 'http' });
      setShowAdd(false);
      await loadProxies();
    } catch {
      toast.error('Failed to add proxy');
    }
  };

  return (
    <div className="card">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold flex items-center gap-2">
          <Shield className="w-5 h-5 text-blue-400" />
          Proxy Pool ({proxies.length})
        </h3>
        <div className="flex gap-2">
          <button onClick={() => setShowAdd((s) => !s)} className="btn-secondary text-sm py-1.5">
            <Plus className="w-4 h-4" /> Add
          </button>
          <button onClick={handleCheckAll} disabled={checking} className="btn-secondary text-sm py-1.5">
            <RefreshCw className={`w-4 h-4 ${checking ? 'animate-spin' : ''}`} />
            {checking ? 'Checking...' : 'Check All'}
          </button>
        </div>
      </div>

      {showAdd && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4 p-4 bg-dark-800/50 rounded-lg animate-fade-in">
          <input className="input" placeholder="Host (IP)" value={adding.host}
            onChange={(e) => setAdding((a) => ({ ...a, host: e.target.value }))} />
          <input className="input" placeholder="Port" type="number" value={adding.port}
            onChange={(e) => setAdding((a) => ({ ...a, port: e.target.value }))} />
          <input className="input" placeholder="Country (GB)" value={adding.country}
            onChange={(e) => setAdding((a) => ({ ...a, country: e.target.value }))} />
          <input className="input" placeholder="City" value={adding.city}
            onChange={(e) => setAdding((a) => ({ ...a, city: e.target.value }))} />
          <select className="input" value={adding.type}
            onChange={(e) => setAdding((a) => ({ ...a, type: e.target.value }))}>
            <option value="http">http</option>
            <option value="https">https</option>
            <option value="socks4">socks4</option>
            <option value="socks5">socks5</option>
          </select>
          <div className="col-span-2 md:col-span-4 flex justify-end gap-2">
            <button onClick={() => setShowAdd(false)} className="btn-secondary py-1.5">Cancel</button>
            <button onClick={handleAdd} className="btn-primary py-1.5">Add Proxy</button>
          </div>
        </div>
      )}

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-dark-400 border-b border-dark-700">
              <th className="pb-3 text-left font-medium">Location</th>
              <th className="pb-3 text-left font-medium">Host</th>
              <th className="pb-3 text-left font-medium">Port</th>
              <th className="pb-3 text-left font-medium">Proto</th>
              <th className="pb-3 text-left font-medium">Source</th>
              <th className="pb-3 text-left font-medium">Status</th>
              <th className="pb-3 text-right font-medium">Success</th>
              <th className="pb-3 text-right font-medium">Failed</th>
              <th className="pb-3 text-right font-medium">Rate</th>
              <th className="pb-3 text-right font-medium">Latency</th>
              <th className="pb-3 text-center font-medium">Actions</th>
            </tr>
          </thead>
          <tbody>
            {proxies.map((proxy) => (
              <tr
                key={proxy.host}
                className={`border-b border-dark-800 hover:bg-dark-800/50 ${!proxy.enabled ? 'opacity-40' : ''}`}
              >
                <td className="py-3">
                  <span className="mr-2">{proxy.flag}</span>
                  {proxy.city}, {proxy.country}
                </td>
                <td className="py-3 font-mono text-xs">{proxy.host}</td>
                <td className="py-3">{proxy.port}</td>
                <td className="py-3">
                  <span className={`px-1.5 py-0.5 rounded text-xs font-mono ${proxy.type === 'socks5' || proxy.type === 'socks4' ? 'bg-purple-500/20 text-purple-300' : 'bg-sky-500/20 text-sky-300'}`}>
                    {proxy.type || 'http'}
                  </span>
                </td>
                <td className="py-3">
                  <span className={`px-1.5 py-0.5 rounded text-xs ${proxy.source === 'webshare' ? 'bg-amber-500/20 text-amber-300' : proxy.source === 'free' ? 'bg-emerald-500/20 text-emerald-300' : 'bg-dark-700 text-dark-300'}`}>
                    {proxy.source || 'manual'}{proxy.archived ? ' · archived' : ''}
                  </span>
                </td>
                <td className="py-3"><StatusBadge status={proxy.status} /></td>
                <td className="py-3 text-right text-emerald-400">{proxy.successCount}</td>
                <td className="py-3 text-right text-red-400">{proxy.failCount}</td>
                <td className="py-3 text-right">{proxy.successRate}%</td>
                <td className="py-3 text-right">{proxy.avgLatency}ms</td>
                <td className="py-3">
                  <div className="flex items-center justify-center gap-1">
                    <button
                      onClick={() => handleCheckOne(proxy.host)}
                      disabled={checkingHost === proxy.host}
                      className="p-1.5 hover:bg-dark-700 rounded"
                      title="Health check"
                    >
                      <RefreshCw className={`w-4 h-4 ${checkingHost === proxy.host ? 'animate-spin' : ''}`} />
                    </button>
                    <button
                      onClick={() => handleToggle(proxy.host, proxy.enabled)}
                      className="p-1.5 hover:bg-dark-700 rounded"
                      title={proxy.enabled ? 'Disable' : 'Enable'}
                    >
                      {proxy.enabled
                        ? <ToggleRight className="w-5 h-5 text-emerald-400" />
                        : <ToggleLeft className="w-5 h-5 text-dark-500" />}
                    </button>
                    <button
                      onClick={() => handleRemove(proxy.host)}
                      className="p-1.5 hover:bg-dark-700 rounded text-red-400"
                      title="Remove"
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
