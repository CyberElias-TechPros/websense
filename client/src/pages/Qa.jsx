// ============================================================================
// Qa.jsx — Geo/Device QA testing dashboard page.
// Run a URL × device × country matrix against your own properties, then read
// the heatmap: green = consistent, amber = divergent content, red = geo/device
// blocked, gray = errors. Click a cell for the full capture detail.
// ============================================================================

import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import {
  MonitorSmartphone, Play, Square, RefreshCw, X, Globe2, Smartphone,
  Monitor, Tablet, AlertTriangle, CheckCircle2, Camera, Eye, ShieldAlert,
} from 'lucide-react';
import {
  getQaCapabilities, startQaRun, getQaRuns, getQaMatrix, getQaRun, getQaExposure, getQaExposureTrends,
  cancelQaRun, qaScreenshotUrl,
} from '../services/api';

const CLASS_META = {
  identical: { color: 'bg-emerald-500', soft: 'bg-emerald-500/15 text-emerald-400', label: 'Identical' },
  similar: { color: 'bg-teal-400', soft: 'bg-teal-400/15 text-teal-300', label: 'Similar' },
  divergent: { color: 'bg-amber-400', soft: 'bg-amber-400/15 text-amber-300', label: 'Divergent' },
  geo_blocked: { color: 'bg-red-500', soft: 'bg-red-500/15 text-red-400', label: 'Geo-blocked' },
  device_blocked: { color: 'bg-orange-500', soft: 'bg-orange-500/15 text-orange-400', label: 'Device-blocked' },
  redirect_loop: { color: 'bg-rose-500', soft: 'bg-rose-500/15 text-rose-300', label: 'Redirect loop' },
  http_error: { color: 'bg-zinc-500', soft: 'bg-zinc-500/15 text-zinc-300', label: 'HTTP error' },
  network_error: { color: 'bg-zinc-700', soft: 'bg-zinc-600/25 text-zinc-400', label: 'Network error' },
  unavailable: { color: 'bg-slate-600', soft: 'bg-slate-500/15 text-slate-400', label: 'Unavailable' },
  pending: { color: 'bg-dark-600', soft: 'bg-dark-600/40 text-dark-300', label: 'Pending' },
};
const meta = (c) => CLASS_META[c] || CLASS_META.pending;

const DEVICE_ICON = { desktop: Monitor, mobile: Smartphone, tablet: Tablet };

function shortUrl(url) {
  try {
    const u = new URL(url);
    return u.hostname.split('.')[0] + (u.pathname === '/' ? '' : u.pathname);
  } catch {
    return url;
  }
}

function fmtWhen(iso) {
  if (!iso) return '—';
  return new Date(String(iso).replace(' ', 'T') + 'Z').toLocaleString();
}

// ---------------------------------------------------------------------------
// New-run form
// ---------------------------------------------------------------------------
function NewRunCard({ capabilities, onStarted }) {
  const [devices, setDevices] = useState(() => capabilities.devices.map((d) => d.id));
  const [countries, setCountries] = useState(() => capabilities.countries.map((c) => c.code));
  const [includeDirect, setIncludeDirect] = useState(true);
  const [mode, setMode] = useState('http');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const vantageCount = countries.length + (includeDirect ? 1 : 0);
  const cellCount = (capabilities.urlCount || 0) * devices.length * vantageCount;
  const overCap = cellCount > capabilities.defaults.maxCells;

  const toggle = (list, setList, id) =>
    setList(list.includes(id) ? list.filter((x) => x !== id) : [...list, id]);

  const start = async () => {
    setBusy(true);
    setError('');
    try {
      const res = await startQaRun({
        deviceIds: devices,
        countries: countries.length ? countries : ['*'],
        includeDirect,
        mode,
      });
      onStarted(res.data.runId);
    } catch (err) {
      setError(err.response?.data?.error || err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="bg-dark-900 border border-dark-700 rounded-xl p-5 space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold flex items-center gap-2">
          <Play className="w-5 h-5 text-blue-400" /> New QA Run
        </h2>
        <span className="text-xs text-dark-400">
          {capabilities.urlCount} URLs · requests carry <code className="text-dark-300">X-Websense-QA</code> header
        </span>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div>
          <p className="text-xs font-semibold text-dark-400 uppercase tracking-wide mb-2">Device profiles</p>
          <div className="space-y-1.5">
            {capabilities.devices.map((d) => {
              const Icon = DEVICE_ICON[d.type] || Monitor;
              return (
                <label key={d.id} className="flex items-center gap-2 text-sm text-dark-200 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={devices.includes(d.id)}
                    onChange={() => toggle(devices, setDevices, d.id)}
                    className="accent-blue-500"
                  />
                  <Icon className="w-4 h-4 text-dark-400" />
                  {d.shortLabel}
                </label>
              );
            })}
          </div>
        </div>

        <div>
          <p className="text-xs font-semibold text-dark-400 uppercase tracking-wide mb-2">Country vantages</p>
          <div className="space-y-1.5 max-h-44 overflow-y-auto pr-1">
            {capabilities.countries.map((c) => (
              <label key={c.code} className="flex items-center gap-2 text-sm text-dark-200 cursor-pointer">
                <input
                  type="checkbox"
                  checked={countries.includes(c.code)}
                  onChange={() => toggle(countries, setCountries, c.code)}
                  className="accent-blue-500"
                />
                <Globe2 className="w-4 h-4 text-dark-400" />
                {c.code}
                <span className="text-dark-500 text-xs">({c.proxies} prox{c.proxies === 1 ? 'y' : 'ies'})</span>
              </label>
            ))}
            {capabilities.countries.length === 0 && (
              <p className="text-xs text-amber-400">No active proxies — only the DIRECT vantage is available.</p>
            )}
            <label className="flex items-center gap-2 text-sm text-dark-200 cursor-pointer border-t border-dark-700 pt-1.5">
              <input
                type="checkbox"
                checked={includeDirect}
                onChange={() => setIncludeDirect(!includeDirect)}
                className="accent-blue-500"
              />
              DIRECT <span className="text-dark-500 text-xs">(no-proxy control)</span>
            </label>
          </div>
        </div>

        <div className="space-y-3">
          <div>
            <p className="text-xs font-semibold text-dark-400 uppercase tracking-wide mb-2">Capture mode</p>
            <select
              value={mode}
              onChange={(e) => setMode(e.target.value)}
              className="w-full bg-dark-800 border border-dark-600 rounded-lg px-3 py-2 text-sm text-dark-100"
            >
              <option value="http">HTTP — fast structural checks</option>
              <option value="browser" disabled={!capabilities.browserAvailable}>
                Browser — rendered DOM + screenshots {capabilities.browserAvailable ? '' : '(no Chrome)'}
              </option>
              <option value="auto">Auto — browser if available</option>
            </select>
          </div>

          <div className={`text-sm rounded-lg px-3 py-2 border ${overCap ? 'border-amber-500/40 bg-amber-500/10 text-amber-300' : 'border-dark-600 bg-dark-800 text-dark-300'}`}>
            Matrix: <strong>{cellCount}</strong> cells
            {overCap && <span className="block text-xs mt-0.5">Exceeds cap of {capabilities.defaults.maxCells} — deselect devices/countries.</span>}
          </div>

          <button
            onClick={start}
            disabled={busy || overCap || devices.length === 0 || vantageCount === 0}
            className="w-full bg-blue-600 hover:bg-blue-500 disabled:opacity-40 disabled:cursor-not-allowed text-white font-medium rounded-lg px-4 py-2 text-sm transition-colors"
          >
            {busy ? 'Starting…' : 'Start matrix run'}
          </button>
        </div>
      </div>

      {error && (
        <div className="text-sm text-red-300 bg-red-500/10 border border-red-500/30 rounded-lg px-3 py-2 flex items-center gap-2">
          <AlertTriangle className="w-4 h-4" /> {error}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Cell detail drawer
// ---------------------------------------------------------------------------
function CellDetail({ cell, exposure, onClose }) {
  if (!cell) return null;
  const m = meta(cell.classification);
  const exp = exposure?.byId?.[cell.id];
  return (
    <div className="fixed inset-y-0 right-0 w-full max-w-xl bg-dark-900 border-l border-dark-700 shadow-2xl z-30 overflow-y-auto animate-slide-in">
      <div className="p-5 border-b border-dark-700 flex items-start justify-between sticky top-0 bg-dark-900 z-10">
        <div>
          <h3 className="font-semibold text-dark-100 break-all">{cell.url}</h3>
          <p className="text-xs text-dark-400 mt-1">
            {cell.vantage} · {cell.device_label} · {fmtWhen(cell.created_at)}
          </p>
          <span className={`inline-block mt-2 text-xs px-2 py-0.5 rounded-full ${m.soft}`}>{m.label}</span>
        </div>
        <button onClick={onClose} className="text-dark-400 hover:text-dark-100 p-1">
          <X className="w-5 h-5" />
        </button>
      </div>

      <div className="p-5 space-y-5">
        <dl className="grid grid-cols-2 gap-3 text-sm">
          <div><dt className="text-dark-400 text-xs">HTTP status</dt><dd className="text-dark-100 font-mono">{cell.status_code ?? '—'}</dd></div>
          <div><dt className="text-dark-400 text-xs">Duration</dt><dd className="text-dark-100 font-mono">{cell.duration_ms ?? '—'} ms</dd></div>
          <div><dt className="text-dark-400 text-xs">Similarity to baseline</dt><dd className="text-dark-100 font-mono">{cell.similarity == null ? '—' : cell.similarity.toFixed(3)}</dd></div>
          <div><dt className="text-dark-400 text-xs">Vantage proxy</dt><dd className="text-dark-100 font-mono">{cell.proxy_host || 'direct'}</dd></div>
          {cell.error && (
            <div className="col-span-2"><dt className="text-dark-400 text-xs">Error</dt><dd className="text-red-300 font-mono text-xs">{cell.error}: {cell.error_message}</dd></div>
          )}
        </dl>

        {cell.final_url && cell.final_url !== cell.url && (
          <div>
            <p className="text-xs text-dark-400 mb-1">Final URL after redirects</p>
            <p className="text-sm text-amber-300 break-all font-mono">{cell.final_url}</p>
          </div>
        )}

        {(cell.redirectChain || []).length > 1 && (
          <div>
            <p className="text-xs text-dark-400 mb-1">Redirect chain</p>
            <ol className="text-xs font-mono space-y-1">
              {cell.redirectChain.map((h, i) => (
                <li key={i} className="text-dark-300 break-all">
                  <span className="text-dark-500">{i + 1}.</span> [{h.status}] {h.url}
                  {h.location && <span className="text-blue-400"> → {h.location}</span>}
                </li>
              ))}
            </ol>
          </div>
        )}

        {(cell.signals || []).length > 0 && (
          <div>
            <p className="text-xs text-dark-400 mb-1">Detection signals</p>
            <div className="flex flex-wrap gap-1.5">
              {cell.signals.map((s, i) => (
                <span key={i} className="text-xs bg-red-500/10 text-red-300 border border-red-500/20 rounded px-2 py-0.5 font-mono">{s}</span>
              ))}
            </div>
          </div>
        )}

        {exp && (
          <div>
            <p className="text-xs text-dark-400 mb-1 flex items-center gap-1">
              <Eye className="w-3.5 h-3.5 text-purple-400" /> Exposure — detectability score {exp.score}/100
            </p>
            {exp.flags.length === 0 ? (
              <p className="text-xs text-emerald-400">No detector-visible tells on this cell.</p>
            ) : (
              <ul className="space-y-1.5">
                {exp.flags.map((f, i) => (
                  <li key={i} className={`text-xs rounded-lg border px-2 py-1.5 ${SEV_COLOR[f.severity] || SEV_COLOR.low}`}>
                    <span className="font-medium">{f.name}</span>
                    {f.detail && <span className="font-mono opacity-80"> · {f.detail}</span>}
                    <span className="block opacity-70 mt-0.5">{f.why}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}

        <div>
          <p className="text-xs text-dark-400 mb-1">Response headers (curated)</p>
          <div className="text-xs font-mono bg-dark-800 rounded-lg p-3 space-y-0.5 max-h-40 overflow-y-auto">
            {Object.entries(cell.headers || {}).map(([k, v]) => (
              <div key={k}><span className="text-dark-500">{k}:</span> <span className="text-dark-200">{v}</span></div>
            ))}
            {Object.keys(cell.headers || {}).length === 0 && <span className="text-dark-500">none captured</span>}
          </div>
        </div>

        {cell.screenshot_path && (
          <div>
            <p className="text-xs text-dark-400 mb-1 flex items-center gap-1"><Camera className="w-3.5 h-3.5" /> Screenshot</p>
            <img src={qaScreenshotUrl(cell.id)} alt="cell screenshot" className="rounded-lg border border-dark-700 w-full" />
          </div>
        )}

        {cell.text_sample && (
          <div>
            <p className="text-xs text-dark-400 mb-1">Visible text sample (normalized)</p>
            <pre className="text-xs bg-dark-800 rounded-lg p-3 whitespace-pre-wrap text-dark-300 max-h-48 overflow-y-auto">{cell.text_sample}</pre>
          </div>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Detection exposure panel (blue-hat view: how detectable is this traffic?)
// ---------------------------------------------------------------------------
const SEV_COLOR = {
  high: 'bg-red-500/15 text-red-400 border-red-500/30',
  medium: 'bg-amber-500/15 text-amber-300 border-amber-500/30',
  low: 'bg-blue-500/15 text-blue-300 border-blue-500/30',
};

// Regression alert threshold: avg detectability must move this many points
// between consecutive runs before the dashboard shouts about it.
const REGRESSION_PTS = 10;

function TrendWidget({ snapshots, catalog }) {
  if (!snapshots || snapshots.length < 2) return null;
  const series = [...snapshots].reverse(); // oldest → newest
  const latest = series[series.length - 1];
  const prev = series[series.length - 2];
  const delta = latest.avgScore - prev.avgScore;
  const regressed = delta >= REGRESSION_PTS || latest.avgScore >= 60;
  const improved = delta <= -REGRESSION_PTS;

  const W = 220; const H = 46; const PAD = 4;
  const x = (i) => PAD + (i * (W - PAD * 2)) / (series.length - 1);
  const y = (v) => H - PAD - (v / 100) * (H - PAD * 2);
  const points = series.map((s, i) => `${x(i).toFixed(1)},${y(s.avgScore).toFixed(1)}`).join(' ');
  const stroke = regressed ? '#f87171' : improved ? '#34d399' : '#a78bfa';

  const ruleDeltas = Object.entries(latest.ruleCounts)
    .map(([rule, n]) => [rule, n - (prev.ruleCounts?.[rule] || 0)])
    .filter(([, d]) => d !== 0)
    .sort((a, b) => Math.abs(b[1]) - Math.abs(a[1]))
    .slice(0, 4);

  return (
    <div className="flex flex-wrap items-start gap-5 mt-4 pt-4 border-t border-dark-700/60">
      <div>
        <p className="text-xs text-dark-400 mb-1">Detectability across runs</p>
        <svg width={W} height={H} className="block">
          <line x1={PAD} y1={y(50)} x2={W - PAD} y2={y(50)} stroke="#3f3f46" strokeDasharray="3 4" />
          <polyline points={points} fill="none" stroke={stroke} strokeWidth="2" strokeLinejoin="round" />
          {series.map((s, i) => (
            <circle key={s.runId || i} cx={x(i)} cy={y(s.avgScore)} r={i === series.length - 1 ? 3.5 : 2} fill={stroke} />
          ))}
        </svg>
        <p className="text-[10px] text-dark-500 mt-0.5">{series.length} runs · dashed = 50</p>
      </div>

      <div className="flex-1 min-w-[240px] text-xs space-y-1.5">
        {regressed ? (
          <p className="text-red-400 font-medium flex items-center gap-1">
            <AlertTriangle className="w-3.5 h-3.5" />
            {delta >= REGRESSION_PTS
              ? `Detection regression: avg detectability +${delta.toFixed(0)} vs previous run`
              : `Detectability at ${latest.avgScore.toFixed(0)}/100 — easily detected band (≥60)`}
          </p>
        ) : improved ? (
          <p className="text-emerald-400 font-medium">
            Improvement: avg detectability {delta.toFixed(0)} vs previous run
          </p>
        ) : (
          <p className="text-dark-400">
            Stable vs previous run ({delta >= 0 ? '+' : ''}{delta.toFixed(0)} pts, threshold ±{REGRESSION_PTS})
          </p>
        )}
        {ruleDeltas.length > 0 && (
          <div className="flex flex-wrap gap-1.5 pt-1">
            {ruleDeltas.map(([rule, d]) => {
              const name = (catalog || []).find((c) => c.id === rule)?.name || rule;
              return (
                <span
                  key={rule}
                  className={`text-[10px] px-1.5 py-0.5 rounded border ${d > 0 ? 'bg-red-500/10 text-red-300 border-red-500/25' : 'bg-emerald-500/10 text-emerald-300 border-emerald-500/25'}`}
                  title={`rule ${rule}: ${prev.ruleCounts?.[rule] || 0} → ${latest.ruleCounts[rule] || 0}`}
                >
                  {name} {d > 0 ? `↑${d}` : `↓${Math.abs(d)}`}
                </span>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

function ExposurePanel({ exposure, trends }) {
  if (!exposure) return null;
  const detectability = exposure.avgScore; // higher = MORE detectable
  const verdict =
    detectability >= 60 ? { label: 'Easily detected', cls: 'text-red-400' }
    : detectability >= 30 ? { label: 'Detectable with effort', cls: 'text-amber-300' }
    : { label: 'Low observable tells', cls: 'text-emerald-400' };

  return (
    <div className="bg-dark-900 border border-dark-700 rounded-xl p-5">
      <h2 className="text-sm font-semibold text-dark-200 flex items-center gap-2">
        <Eye className="w-4 h-4 text-purple-400" /> Detection exposure
        <span className="text-xs font-normal text-dark-400">— what a bot-detector would notice about these requests</span>
      </h2>

      <div className="flex flex-wrap items-center gap-4 mt-3">
        <div className="flex items-center gap-2">
          <span className="text-2xl font-bold font-mono">{detectability}</span>
          <div className="text-xs">
            <div className="text-dark-400">avg detectability / 100</div>
            <div className={`font-medium ${verdict.cls}`}>{verdict.label}</div>
          </div>
        </div>
        <div className="text-xs text-dark-400">
          {exposure.flaggedRecords}/{exposure.total} cells carry at least one detector-visible tell
          {exposure.interarrivalCV != null && (
            <span className="block mt-0.5">
              inter-request timing CV: {exposure.interarrivalCV.toFixed(2)}{' '}
              {exposure.interarrivalCV < 0.25 ? '(metronome — humans ≳ 1.0)' : '(human-plausible)'}
            </span>
          )}
        </div>
      </div>

      {Object.keys(exposure.ruleCounts || {}).length > 0 && (
        <div className="flex flex-wrap gap-2 mt-3">
          {Object.entries(exposure.ruleCounts)
            .sort((a, b) => b[1] - a[1])
            .map(([rule, n]) => {
              const entry = (exposure.catalog || []).find((c) => c.id === rule);
              const sev = entry?.severity || 'low';
              return (
                <span
                  key={rule}
                  title={entry?.why || rule}
                  className={`text-xs px-2 py-1 rounded-lg border cursor-help ${SEV_COLOR[sev]}`}
                >
                  {entry?.name || rule} × {n}
                </span>
              );
            })}
          {(exposure.cohortFlags || []).map((f) => (
            <span key={f.rule} title={`${f.why}${f.detail ? ` — ${f.detail}` : ''}`} className={`text-xs px-2 py-1 rounded-lg border cursor-help ${SEV_COLOR[f.severity]}`}>
              <ShieldAlert className="w-3 h-3 inline mr-1" />{f.name}
            </span>
          ))}
        </div>
      )}

      <TrendWidget snapshots={trends} catalog={exposure.catalog} />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Matrix heatmap
// ---------------------------------------------------------------------------
function Matrix({ matrix, onCellClick }) {
  if (!matrix) return null;
  return (
    <div className="overflow-x-auto">
      <table className="border-separate border-spacing-1 w-full">
        <thead>
          <tr>
            <th className="text-left text-xs text-dark-400 font-medium sticky left-0 bg-dark-900 pr-2">URL</th>
            {matrix.columns.map((c) => {
              const Icon = DEVICE_ICON[c.deviceType] || Monitor;
              return (
                <th key={`${c.vantage}::${c.deviceId}`} className="text-xs text-dark-300 font-medium min-w-[3.2rem]">
                  <div className="flex flex-col items-center gap-0.5">
                    <Icon className="w-3.5 h-3.5 text-dark-500" />
                    <span>{c.vantage}</span>
                    <span className="text-dark-500 font-normal">{c.deviceLabel}</span>
                  </div>
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {matrix.rows.map((row) => (
            <tr key={row.url}>
              <td className="text-xs text-dark-300 font-mono pr-2 sticky left-0 bg-dark-900 max-w-[14rem] truncate" title={row.url}>
                {shortUrl(row.url)}
              </td>
              {row.cells.map((cell, i) => (
                <td key={i} className="text-center">
                  {cell ? (
                    <button
                      onClick={() => onCellClick(cell.id)}
                      title={`${meta(cell.classification).label}${cell.statusCode ? ` · HTTP ${cell.statusCode}` : ''}${cell.similarity != null ? ` · sim ${cell.similarity.toFixed(2)}` : ''}`}
                      className={`w-9 h-9 rounded-md ${meta(cell.classification).color} ${cell.flagged ? 'ring-2 ring-white/40' : 'opacity-70 hover:opacity-100'} transition`}
                    />
                  ) : (
                    <div className="w-9 h-9 rounded-md bg-dark-800 mx-auto" />
                  )}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>

      <div className="flex flex-wrap gap-3 mt-4">
        {Object.entries(matrix.counts || {}).map(([cls, n]) => (
          <span key={cls} className={`text-xs px-2 py-0.5 rounded-full ${meta(cls).soft}`}>
            {meta(cls).label}: {n}
          </span>
        ))}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------
export default function Qa({ socket }) {
  const [capabilities, setCapabilities] = useState(null);
  const [runs, setRuns] = useState([]);
  const [activeRuns, setActiveRuns] = useState([]);
  const [selectedRun, setSelectedRun] = useState(null);
  const [matrix, setMatrix] = useState(null);
  const [exposure, setExposure] = useState(null);
  const [trends, setTrends] = useState(null);
  const [selectedCell, setSelectedCell] = useState(null);
  const [banner, setBanner] = useState('');
  const pollRef = useRef(null);

  const loadCapabilities = async () => {
    try {
      const res = await getQaCapabilities();
      setCapabilities(res.data);
    } catch (err) {
      setBanner(`QA unavailable: ${err.response?.data?.error || err.message}`);
    }
  };

  const loadRuns = useCallback(async () => {
    try {
      const res = await getQaRuns();
      setRuns(res.data.runs || []);
      setActiveRuns(res.data.active || []);
      return res.data.active || [];
    } catch { return []; }
  }, []);

  const loadMatrix = useCallback(async (runId) => {
    try {
      const res = await getQaMatrix(runId);
      setMatrix(res.data);
      if (res.data.status === 'done' || res.data.status === 'cancelled') {
        try {
          const exp = await getQaExposure(runId);
          setExposure(exp.data);
        } catch { setExposure(null); }
        try {
          const tr = await getQaExposureTrends(20);
          setTrends(tr.data.snapshots || []);
        } catch { setTrends(null); }
      } else {
        setExposure(null);
        setTrends(null);
      }
    } catch { /* noop */ }
  }, []);

  const selectRun = useCallback(async (runId) => {
    setSelectedRun(runId);
    setMatrix(null);
    setExposure(null);
    setTrends(null);
    await loadMatrix(runId);
  }, [loadMatrix]);

  useEffect(() => { loadCapabilities(); loadRuns(); }, []);
  useEffect(() => () => clearInterval(pollRef.current), []);

  // Live updates: socket progress events refresh the open matrix and runs list.
  useEffect(() => {
    const s = socket?.current;
    if (!s) return;
    const onProgress = (p) => {
      if (p.runId === selectedRun) loadMatrix(p.runId);
    };
    const onComplete = () => { loadRuns(); if (selectedRun) loadMatrix(selectedRun); };
    s.on('qa:progress', onProgress);
    s.on('qa:run_complete', onComplete);
    return () => {
      s.off('qa:progress', onProgress);
      s.off('qa:run_complete', onComplete);
    };
  }, [socket, selectedRun, loadMatrix, loadRuns]);

  // Fallback polling while any run is active (covers socket drops).
  useEffect(() => {
    clearInterval(pollRef.current);
    if (activeRuns.length > 0) {
      pollRef.current = setInterval(async () => {
        const active = await loadRuns();
        if (selectedRun) await loadMatrix(selectedRun);
        if (active.length === 0) clearInterval(pollRef.current);
      }, 4000);
    }
    return () => clearInterval(pollRef.current);
  }, [activeRuns.length, selectedRun, loadRuns, loadMatrix]);

  const openCell = async (cellId) => {
    if (!selectedRun) return;
    try {
      const res = await getQaRun(selectedRun);
      const cell = (res.data.cells || []).find((c) => c.id === cellId);
      setSelectedCell(cell || null);
    } catch { /* noop */ }
  };

  const cancel = async (runId) => {
    try { await cancelQaRun(runId); await loadRuns(); } catch { /* noop */ }
  };

  if (!capabilities) {
    return (
      <div className="text-dark-400">
        {banner || 'Loading QA capabilities…'}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <MonitorSmartphone className="w-7 h-7 text-blue-400" /> Geo / Device QA
          </h1>
          <p className="text-dark-400 text-sm mt-1">
            Test how your properties behave across countries and device profiles — geo-blocks, app walls, redirect loops, content drift.
            Requests are low-volume and identify themselves with <code className="text-dark-300">X-Websense-QA</code>;
            whitelist it in your own WAF/analytics.
          </p>
        </div>
        <button onClick={() => { loadRuns(); if (selectedRun) loadMatrix(selectedRun); }} className="text-dark-300 hover:text-white p-2" title="Refresh">
          <RefreshCw className="w-5 h-5" />
        </button>
      </div>

      {!capabilities.browserAvailable && (
        <div className="text-xs text-dark-300 bg-dark-800 border border-dark-700 rounded-lg px-3 py-2">
          Browser capture unavailable ({capabilities.browserReason}). HTTP mode still answers status/redirect/copy-based geo & device checks;
          install/provide Chrome for rendered DOM comparison and screenshots.
        </div>
      )}

      <NewRunCard capabilities={capabilities} onStarted={(id) => { loadRuns(); selectRun(id); }} />

      {exposure && <ExposurePanel exposure={exposure} trends={trends} />}

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        <div className="bg-dark-900 border border-dark-700 rounded-xl p-4">
          <h2 className="text-sm font-semibold text-dark-200 mb-3">Recent runs</h2>
          <div className="space-y-2 max-h-[34rem] overflow-y-auto">
            {runs.map((r) => (
              <div
                key={r.id}
                onClick={() => selectRun(r.id)}
                className={`cursor-pointer rounded-lg border px-3 py-2 text-sm transition-colors ${
                  selectedRun === r.id ? 'border-blue-500 bg-blue-500/10' : 'border-dark-700 hover:border-dark-500 bg-dark-800'
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="font-mono text-xs text-dark-300">{r.id.slice(0, 8)}</span>
                  <span className={`text-xs px-2 py-0.5 rounded-full ${
                    r.status === 'done' ? 'bg-emerald-500/15 text-emerald-400'
                    : r.status === 'running' ? 'bg-blue-500/15 text-blue-400'
                    : 'bg-dark-600/40 text-dark-300'
                  }`}>
                    {r.status}
                  </span>
                </div>
                <div className="text-xs text-dark-500 mt-1">
                  {fmtWhen(r.created_at)} · {r.mode} · {r.done_cells}/{r.total_cells} cells
                  {r.flagged_cells > 0 && <span className="text-amber-400"> · {r.flagged_cells} flagged</span>}
                </div>
                {activeRuns.includes(r.id) && (
                  <button
                    onClick={(e) => { e.stopPropagation(); cancel(r.id); }}
                    className="mt-1 text-xs text-red-400 hover:text-red-300 flex items-center gap-1"
                  >
                    <Square className="w-3 h-3" /> Cancel
                  </button>
                )}
              </div>
            ))}
            {runs.length === 0 && <p className="text-xs text-dark-500">No runs yet — start one above.</p>}
          </div>
        </div>

        <div className="xl:col-span-2 bg-dark-900 border border-dark-700 rounded-xl p-4">
          <h2 className="text-sm font-semibold text-dark-200 mb-3">
            {selectedRun ? <>Matrix <span className="font-mono text-xs text-dark-400">{selectedRun.slice(0, 8)}</span></> : 'Select a run'}
          </h2>
          {matrix
            ? <Matrix matrix={matrix} onCellClick={openCell} />
            : <p className="text-xs text-dark-500">{selectedRun ? 'Loading matrix…' : 'The heatmap appears here: rows are URLs, columns are vantage × device.'}</p>}
        </div>
      </div>

      <CellDetail cell={selectedCell} exposure={exposure} onClose={() => setSelectedCell(null)} />
    </div>
  );
}
