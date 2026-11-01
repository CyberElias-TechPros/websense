<<<<<<< HEAD
import React, { useState, useEffect, useCallback } from 'react';
=======
import React, { useState, useCallback } from 'react';
>>>>>>> b99e6874ed35a4bfe1ffef506c3d9abe1b6f023a
import {
  Activity, CheckCircle2, Shield, Clock, Zap, Globe, TrendingUp,
} from 'lucide-react';
import { toast } from 'sonner';
import StatsCard from '../components/StatsCard';
import LiveFeed from '../components/LiveFeed';
import EngineControls from '../components/EngineControls';
import WorldMap from '../components/WorldMap';
import StatusBadge from '../components/StatusBadge';
import {
  startEngine, stopEngine, pauseEngine, resumeEngine, manualVisit, getProxies,
} from '../services/api';

export default function Dashboard({ engineState, stats, liveVisits, connected }) {
  const [loading, setLoading] = useState(false);
  const [proxies, setProxies] = useState([]);

  const loadProxies = useCallback(async () => {
    try {
      const res = await getProxies();
      setProxies(res.data);
    } catch { /* noop */ }
  }, []);

<<<<<<< HEAD
  // Poll proxy health every 30s (useEffect, not useState: App.jsx remounts
  // this page via `key={location.pathname}`, so the interval must be cleaned
  // up or every navigation leaks another timer).
  useEffect(() => {
    loadProxies();
    const interval = setInterval(loadProxies, 30000);
    return () => clearInterval(interval);
  }, [loadProxies]);
=======
  useState(() => {
    loadProxies();
    const interval = setInterval(loadProxies, 30000);
    return () => clearInterval(interval);
  });
>>>>>>> b99e6874ed35a4bfe1ffef506c3d9abe1b6f023a

  const handleStart = useCallback(async () => {
    setLoading(true);
    try {
      await startEngine();
      toast.success('Engine started');
    } catch {
      toast.error('Failed to start engine');
    } finally {
      setLoading(false);
    }
  }, []);

  const handleStop = useCallback(async () => {
    setLoading(true);
    try {
      await stopEngine();
      toast.info('Engine stopped');
    } catch {
      toast.error('Failed to stop engine');
    } finally {
      setLoading(false);
    }
  }, []);

  const handlePause = useCallback(async () => {
    setLoading(true);
    try {
      await pauseEngine();
      toast.info('Engine paused');
    } catch {
      toast.error('Failed to pause engine');
    } finally {
      setLoading(false);
    }
  }, []);

  const handleResume = useCallback(async () => {
    setLoading(true);
    try {
      await resumeEngine();
      toast.success('Engine resumed');
    } catch {
      toast.error('Failed to resume engine');
    } finally {
      setLoading(false);
    }
  }, []);

  const handleManual = useCallback(async () => {
    setLoading(true);
    try {
      const res = await manualVisit();
      if (res.data?.success) toast.success(`Visited ${res.data.subdomain}`);
      else toast.error(`Visit failed: ${res.data?.error || 'unknown'}`);
    } catch {
      toast.error('Manual visit failed');
    } finally {
      setLoading(false);
    }
  }, []);

  const formatUptime = (seconds) => {
    if (!seconds) return '0s';
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = seconds % 60;
    if (h > 0) return `${h}h ${m}m`;
    if (m > 0) return `${m}m ${s}s`;
    return `${s}s`;
  };

  const healthyProxies = proxies.filter((p) => p.status === 'healthy').length;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">Dashboard</h2>
          <p className="text-dark-400">Real-time monitoring & control</p>
        </div>
        <div className="flex items-center gap-2 text-sm">
          <span className={`badge ${connected ? 'bg-emerald-500/20 text-emerald-400' : 'bg-red-500/20 text-red-400'}`}>
            {connected ? 'Live' : 'Reconnecting'}
          </span>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
        <StatsCard
          title="Total Visits"
          value={stats.totalVisits || 0}
          subtitle={`${stats.visitsPerHour || 0} per hour`}
          icon={Activity}
          color="blue"
        />
        <StatsCard
          title="Success Rate"
          value={`${stats.successRate || 0}%`}
          subtitle={`${stats.successCount || 0} success / ${stats.failCount || 0} failed`}
          icon={CheckCircle2}
          color="green"
        />
        <StatsCard
          title="Active Proxies"
          value={`${stats.activeProxies || 0}/${stats.totalProxies || 0}`}
          subtitle={`${healthyProxies} healthy`}
          icon={Shield}
          color="purple"
        />
        <StatsCard
          title="Uptime"
          value={formatUptime(stats.uptime)}
          subtitle={`${stats.activeUrls || 0} URLs active`}
          icon={Clock}
          color="cyan"
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2">
          <LiveFeed visits={liveVisits} />
        </div>
        <div className="space-y-6">
          <EngineControls
            state={engineState}
            stats={stats}
            onStart={handleStart}
            onStop={handleStop}
            onPause={handlePause}
            onResume={handleResume}
            onManualVisit={handleManual}
            loading={loading}
          />
          <div className="card">
            <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
              <TrendingUp className="w-5 h-5 text-amber-400" /> Quick Info
            </h3>
            <div className="space-y-3 text-sm">
              <div className="flex justify-between">
                <span className="text-dark-400">Mode</span>
                <span>{stats.mode || 'http'}{stats.demoMode ? ' · demo' : ''}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-dark-400">Concurrency</span>
                <span>{stats.concurrency || 3} slots</span>
              </div>
              <div className="flex justify-between">
                <span className="text-dark-400">Interval</span>
                <span>{stats.intervalRange || '5-30s'}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-dark-400">URLs Pool</span>
                <span>{stats.totalUrls || 0} URLs</span>
              </div>
              <div className="flex justify-between">
                <span className="text-dark-400">Recent hour</span>
                <span>{stats.recentVisits || 0} visits · {stats.recentSuccessRate || 0}%</span>
              </div>
              <div className="flex justify-between">
                <span className="text-dark-400">Avg latency</span>
                <span>{stats.avgLatency || 0}ms</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      <WorldMap proxies={proxies} />
    </div>
  );
}
