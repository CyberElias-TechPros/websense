import React, { useState, useEffect, useCallback } from 'react';
import {
  Brain, Globe2, Activity, ShieldAlert, RefreshCw, Play, Plus, X, Bot,
} from 'lucide-react';
import {
  getAIDirectorStatus, recheckAIDirector, previewAIDirectorPlan,
  getFreeProxyStats, refreshFreeProxies, updateFreeProxyConfig, getProxySources,
  getMetrics, getAlerts, ackAlert,
  getDomainRules, updateDomainRules, addDomainOptOut, removeDomainOptOut, refreshRobots,
} from '../services/api';

const card = 'bg-white rounded-xl shadow-lg p-5';
const btn = 'px-3 py-1.5 rounded-lg text-sm font-medium transition-colors disabled:opacity-50';
const inputCls = 'w-full px-3 py-1.5 rounded-lg border border-gray-300 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500';

export default function Intelligence() {
  const [director, setDirector] = useState(null);
  const [freeStats, setFreeStats] = useState(null);
  const [sources, setSources] = useState(null);
  const [metrics, setMetrics] = useState(null);
  const [alerts, setAlerts] = useState([]);
  const [rules, setRules] = useState(null);
  const [busy, setBusy] = useState({});
  const [planForm, setPlanForm] = useState({ url: '', seed: '' });
  const [planResult, setPlanResult] = useState(null);
  const [optOutInput, setOptOutInput] = useState('');
  const [freeConf, setFreeConf] = useState({ max: '', refreshHours: '' });

  const loadAll = useCallback(async () => {
    try {
      const [d, f, s, m, a, r] = await Promise.allSettled([
        getAIDirectorStatus(), getFreeProxyStats(), getProxySources(),
        getMetrics(), getAlerts(), getDomainRules(),
      ]);
      if (d.status === 'fulfilled') setDirector(d.value.data);
      if (f.status === 'fulfilled') setFreeStats(f.value.data);
      if (s.status === 'fulfilled') setSources(s.value.data);
      if (m.status === 'fulfilled') setMetrics(m.value.data);
      if (a.status === 'fulfilled') setAlerts(a.value.data.alerts || []);
      if (r.status === 'fulfilled') setRules(r.value.data);
    } catch (err) {
      console.error('Intelligence load failed:', err);
    }
  }, []);

  useEffect(() => {
    loadAll();
    const t = setInterval(loadAll, 30000);
    return () => clearInterval(t);
  }, [loadAll]);

  const run = async (key, fn) => {
    setBusy((b) => ({ ...b, [key]: true }));
    try { await fn(); } catch (e) { console.error(e); }
    await loadAll();
    setBusy((b) => ({ ...b, [key]: false }));
  };

  const previewPlan = async () => {
    if (!planForm.url) return;
    await run('plan', async () => {
      const r = await previewAIDirectorPlan({ url: planForm.url, seed: planForm.seed || String(Date.now()) });
      setPlanResult(r.data.plan);
    });
  };

  const addOptOut = async () => {
    if (!optOutInput.trim()) return;
    await run('optout', async () => { await addDomainOptOut(optOutInput.trim()); setOptOutInput(''); });
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
          <Brain className="w-7 h-7 text-indigo-600" /> AI & Proxy Intelligence
        </h1>
        <button onClick={loadAll} className={`${btn} bg-indigo-600 text-white hover:bg-indigo-700`}>
          <RefreshCw className="w-4 h-4 inline mr-1" /> Refresh
        </button>
      </div>

      {/* ── AI Behavior Director ─────────────────────────────────────────── */}
      <div className={card}>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-lg font-semibold text-gray-800 flex items-center gap-2">
            <Bot className="w-5 h-5 text-indigo-600" /> AI Behavior Director
          </h2>
          <button onClick={() => run('recheck', recheckAIDirector)}
            disabled={busy.recheck}
            className={`${btn} bg-indigo-600 text-white hover:bg-indigo-700`}>
            Re-probe providers
          </button>
        </div>
        {director ? (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
            <div><div className="text-gray-500">Active provider</div><div className="font-semibold text-gray-900">{director.provider}</div></div>
            <div><div className="text-gray-500">OmniRoute</div><div className="font-semibold text-gray-900 truncate">{director.omniroute?.url} · {director.omniroute?.model}</div></div>
            <div><div className="text-gray-500">Models</div><div className="font-semibold text-gray-900">{director.models?.length || 0}</div></div>
            <div><div className="text-gray-500">Plans (LLM / heuristic / cache)</div><div className="font-semibold text-gray-900">{director.stats?.llmPlans || 0} / {director.stats?.heuristicPlans || 0} / {director.stats?.cacheHits || 0}</div></div>
            <div><div className="text-gray-500">Feedback: detections (1h)</div><div className="font-semibold text-gray-900">{director.feedback?.detectionsLastHour || 0}</div></div>
          </div>
        ) : <p className="text-gray-500 text-sm">Loading…</p>}

        <div className="mt-4 flex flex-col md:flex-row gap-2">
          <input className={inputCls} placeholder="https://example.com/page — preview the behavior plan"
            value={planForm.url} onChange={(e) => setPlanForm({ ...planForm, url: e.target.value })} />
          <input className={`${inputCls} md:w-40`} placeholder="seed (optional)"
            value={planForm.seed} onChange={(e) => setPlanForm({ ...planForm, seed: e.target.value })} />
          <button onClick={previewPlan} disabled={busy.plan || !planForm.url}
            className={`${btn} bg-emerald-600 text-white hover:bg-emerald-700`}>
            <Play className="w-4 h-4 inline mr-1" /> Preview plan
          </button>
        </div>
        {planResult && (
          <pre className="mt-3 bg-gray-900 text-emerald-300 text-xs rounded-lg p-3 overflow-x-auto max-h-48">
            {JSON.stringify(planResult, null, 2)}
          </pre>
        )}
      </div>

      {/* ── Free proxy pool ──────────────────────────────────────────────── */}
      <div className={card}>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-lg font-semibold text-gray-800 flex items-center gap-2">
            <Globe2 className="w-5 h-5 text-blue-600" /> Free Proxy Pool (GitHub sources)
          </h2>
          <button onClick={() => run('refresh', refreshFreeProxies)}
            disabled={busy.refresh}
            className={`${btn} bg-blue-600 text-white hover:bg-blue-700`}>
            <RefreshCw className={`w-4 h-4 inline mr-1 ${busy.refresh ? 'animate-spin' : ''}`} /> Refresh now
          </button>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3 text-sm">
          <div><div className="text-gray-500">Pool total</div><div className="font-semibold text-lg text-gray-900">{sources?.poolTotal ?? '—'}</div></div>
          <div><div className="text-gray-500">Paid (Webshare)</div><div className="font-semibold text-lg text-gray-900">{sources?.paid ?? '—'}</div></div>
          <div><div className="text-gray-500">Free</div><div className="font-semibold text-lg text-blue-600">{sources?.free ?? '—'}</div></div>
          <div><div className="text-gray-500">Free active</div><div className="font-semibold text-lg text-emerald-600">{sources?.freeActive ?? '—'}</div></div>
          <div><div className="text-gray-500">Archived</div><div className="font-semibold text-lg text-amber-600">{sources?.archived ?? '—'}</div></div>
        </div>
        {freeStats && (
          <div className="mt-3 text-xs text-gray-600">
            <span className="font-medium">By source:</span>{' '}
            {Object.entries(freeStats.bySource || {}).map(([k, v]) => `${k}: ${v}`).join(' · ') || '—'}
            {' '}| refresh every {freeStats.refreshHours}h · cap {freeStats.max} · probe sample {freeStats.probeSample}
            {freeStats.useCodeloadOnly && ' · codeload-only'}
          </div>
        )}
        {freeStats?.recentRefreshes?.[0] && (
          <div className="mt-1 text-xs text-gray-500">
            Last refresh: fetched {freeStats.recentRefreshes[0].fetched}, added {freeStats.recentRefreshes[0].added}
            {freeStats.recentRefreshes[0].reactivated ? `, reactivated ${freeStats.recentRefreshes[0].reactivated}` : ''}
            {' '}in {(freeStats.recentRefreshes[0].durationMs / 1000).toFixed(1)}s
            {freeStats.recentRefreshes[0].probed ? ` · probe ${freeStats.recentRefreshes[0].probeAlive}/${freeStats.recentRefreshes[0].probed} alive` : ''}
          </div>
        )}
        <div className="mt-3 flex flex-col md:flex-row gap-2 items-center">
          <input className={`${inputCls} md:w-40`} placeholder="max (e.g. 5000)" value={freeConf.max}
            onChange={(e) => setFreeConf({ ...freeConf, max: e.target.value })} />
          <input className={`${inputCls} md:w-40`} placeholder="refresh hours" value={freeConf.refreshHours}
            onChange={(e) => setFreeConf({ ...freeConf, refreshHours: e.target.value })} />
          <button onClick={() => run('freeconf', () => updateFreeProxyConfig({
            ...(freeConf.max !== '' ? { max: Number(freeConf.max) } : {}),
            ...(freeConf.refreshHours !== '' ? { refreshHours: Number(freeConf.refreshHours) } : {}),
          }))} className={`${btn} bg-gray-700 text-white hover:bg-gray-800`}>Apply config</button>
        </div>
      </div>

      {/* ── Observability: metrics + alerts ──────────────────────────────── */}
      <div className={card}>
        <h2 className="text-lg font-semibold text-gray-800 flex items-center gap-2 mb-3">
          <Activity className="w-5 h-5 text-emerald-600" /> Metrics & Alerts
        </h2>
        {metrics && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm mb-4">
            <div><div className="text-gray-500">Visits</div><div className="font-semibold text-gray-900">{metrics.counters.visits_total} ({metrics.counters.visits_success}✓ / {metrics.counters.visits_failed}✗ / {metrics.counters.visits_skipped}⏭)</div></div>
            <div><div className="text-gray-500">Error rate (window)</div><div className="font-semibold text-gray-900">{(metrics.gauges.visit_error_rate * 100).toFixed(1)}%</div></div>
            <div><div className="text-gray-500">AI plan fallback rate</div><div className="font-semibold text-gray-900">{(metrics.gauges.plan_fallback_rate * 100).toFixed(0)}% heuristic</div></div>
            <div><div className="text-gray-500">Free refreshes</div><div className="font-semibold text-gray-900">{metrics.counters.free_refreshes} (+{metrics.counters.free_proxies_added_total} proxies)</div></div>
            <div><div className="text-gray-500">Detection signals</div><div className="font-semibold text-gray-900">{metrics.counters.detection_signals_total}</div></div>
            <div><div className="text-gray-500">Active alerts</div><div className={`font-semibold ${metrics.gauges.active_alerts > 0 ? 'text-red-600' : 'text-emerald-600'}`}>{metrics.gauges.active_alerts}</div></div>
            <div><div className="text-gray-500">Uptime</div><div className="font-semibold text-gray-900">{Math.floor(metrics.uptimeSeconds / 60)}m</div></div>
          </div>
        )}
        {alerts.length > 0 ? (
          <ul className="space-y-2">
            {alerts.map((a) => (
              <li key={a.id} className={`flex items-center justify-between rounded-lg px-3 py-2 text-sm ${a.acked ? 'bg-gray-100 text-gray-400' : a.severity === 'critical' ? 'bg-red-50 text-red-700 border border-red-200' : 'bg-amber-50 text-amber-700 border border-amber-200'}`}>
                <span className="flex items-center gap-2">
                  <ShieldAlert className="w-4 h-4" />
                  <span><b>{a.id}</b> — {a.message} <span className="opacity-60">(×{a.count})</span></span>
                </span>
                {!a.acked && (
                  <button onClick={() => run(`ack-${a.id}`, () => ackAlert(a.id))}
                    className={`${btn} bg-gray-200 text-gray-700 hover:bg-gray-300`}>Ack</button>
                )}
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-emerald-600">No alerts — all systems nominal ✅</p>
        )}
      </div>

      {/* ── Domain rules ─────────────────────────────────────────────────── */}
      <div className={card}>
        <h2 className="text-lg font-semibold text-gray-800 flex items-center gap-2 mb-3">
          <ShieldAlert className="w-5 h-5 text-amber-600" /> Domain Rules (rate limits · opt-outs · robots.txt)
        </h2>
        {rules && (
          <>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm mb-3">
              <div><div className="text-gray-500">Enabled</div><div className="font-semibold text-gray-900">{rules.stats?.enabled ? 'yes' : 'no'}</div></div>
              <div><div className="text-gray-500">Respect robots.txt</div><div className="font-semibold text-gray-900">{rules.stats?.respectRobots ? 'yes' : 'no'}</div></div>
              <div><div className="text-gray-500">Default min interval</div><div className="font-semibold text-gray-900">{(rules.defaults?.minIntervalMs / 1000)}s</div></div>
              <div><div className="text-gray-500">Default max / hour</div><div className="font-semibold text-gray-900">{rules.defaults?.maxVisitsPerHour}</div></div>
            </div>
            <div className="flex gap-2 mb-3">
              <input className={inputCls} placeholder="domain to opt out (e.g. example.com)"
                value={optOutInput} onChange={(e) => setOptOutInput(e.target.value)} />
              <button onClick={addOptOut} disabled={busy.optout || !optOutInput.trim()}
                className={`${btn} bg-red-600 text-white hover:bg-red-700`}><Plus className="w-4 h-4 inline mr-1" /> Opt out</button>
            </div>
            {rules.optOuts?.length > 0 && (
              <div className="flex flex-wrap gap-2 mb-3">
                {rules.optOuts.map((d) => (
                  <span key={d} className="inline-flex items-center gap-1 bg-red-50 text-red-700 border border-red-200 rounded-full px-3 py-1 text-xs">
                    {d}
                    <button onClick={() => run(`rm-${d}`, () => removeDomainOptOut(d))} className="hover:text-red-900"><X className="w-3 h-3" /></button>
                  </span>
                ))}
              </div>
            )}
            {rules.stats?.robotsCached?.length > 0 && (
              <div className="text-xs text-gray-500">
                robots.txt cached: {rules.stats.robotsCached.map((r) => `${r.domain} (${r.rules} rules${r.error ? `, ${r.error}` : ''})`).join(' · ')}
              </div>
            )}
            <div className="mt-2 flex gap-2">
              <button onClick={() => run('robots', async () => {
                for (const r of rules.stats?.robotsCached || []) await refreshRobots(r.domain);
              })} className={`${btn} bg-gray-700 text-white hover:bg-gray-800`}>Re-fetch all robots.txt</button>
              <button onClick={() => run('drules', () => updateDomainRules({ respectRobots: !rules.stats?.respectRobots }))}
                className={`${btn} bg-gray-200 text-gray-700 hover:bg-gray-300`}>
                Toggle robots.txt respect (now: {rules.stats?.respectRobots ? 'on' : 'off'})
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
