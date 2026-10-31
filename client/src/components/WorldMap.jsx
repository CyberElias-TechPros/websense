import React, { useState, useEffect } from 'react';

// Simplified dot-matrix world map: plots proxy locations by approximate
// lon/lat. No external map library — pure SVG, zero dependencies.
// Approximate coordinates for the proxy cities (good enough for a dashboard).
const CITY_COORDS = {
  London: { lon: -0.13, lat: 51.51 },
  Madrid: { lon: -3.7, lat: 40.42 },
  'Los Angeles': { lon: -118.24, lat: 34.05 },
  Piscataway: { lon: -74.44, lat: 40.49 },
  Warsaw: { lon: 21.01, lat: 52.23 },
  'Santa Clara': { lon: -121.96, lat: 37.35 },
  Orem: { lon: -111.83, lat: 40.27 },
  Frankfurt: { lon: 8.68, lat: 50.11 },
};

function project(lon, lat) {
  const x = ((lon + 180) / 360) * 100;
  const y = ((90 - lat) / 180) * 50;
  return { x, y };
}

export default function WorldMap({ proxies }) {
  const [pulse, setPulse] = useState({});

  useEffect(() => {
    proxies.forEach((p) => {
      setPulse((prev) => ({ ...prev, [p.host]: Date.now() }));
    });
  }, [proxies]);

  const activeProxies = proxies.filter((p) => p.enabled);
  const coords = activeProxies.map((p) => ({
    ...p,
    coord: CITY_COORDS[p.city] || { lon: 0, lat: 20 },
    pos: project(CITY_COORDS[p.city]?.lon || 0, CITY_COORDS[p.city]?.lat || 20),
  }));

  return (
    <div className="card">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold flex items-center gap-2">
          <span className="text-xl">🌍</span> Proxy Locations
        </h3>
        <span className="text-dark-400 text-sm">{activeProxies.length} active</span>
      </div>
      <div className="relative bg-dark-950 rounded-lg overflow-hidden" style={{ aspectRatio: '2 / 1' }}>
        {/* Stylized dot-grid "map" background */}
        <svg viewBox="0 0 100 50" className="absolute inset-0 w-full h-full" preserveAspectRatio="none">
          <defs>
            <pattern id="grid" width="2.5" height="2.5" patternUnits="userSpaceOnUse">
              <circle cx="0.5" cy="0.5" r="0.08" fill="#1e293b" />
            </pattern>
          </defs>
          <rect width="100" height="50" fill="url(#grid)" />
          {/* Continent silhouettes (rough boxes for visual context) */}
          <g fill="#0f172a" opacity="0.8">
            <rect x="12" y="10" width="18" height="14" rx="3" />
            <rect x="33" y="12" width="20" height="10" rx="3" />
            <rect x="40" y="26" width="14" height="12" rx="3" />
            <rect x="55" y="12" width="16" height="14" rx="3" />
            <rect x="72" y="14" width="10" height="10" rx="3" />
          </g>
          {/* Proxy points */}
          {coords.map((p) => (
            <g key={p.host}>
              <circle
                cx={p.pos.x}
                cy={p.pos.y}
                r={p.status === 'healthy' ? 1.1 : 0.8}
                fill={p.status === 'healthy' ? '#10b981' : p.status === 'unhealthy' ? '#ef4444' : '#64748b'}
                opacity="0.9"
              />
              {p.status === 'healthy' && (
                <circle
                  cx={p.pos.x}
                  cy={p.pos.y}
                  r={1.1}
                  fill="none"
                  stroke="#10b981"
                  strokeWidth="0.3"
                  opacity="0.6"
                >
                  <animate attributeName="r" from="1.1" to="2.4" dur="2s" repeatCount="indefinite" />
                  <animate attributeName="opacity" from="0.6" to="0" dur="2s" repeatCount="indefinite" />
                </circle>
              )}
            </g>
          ))}
        </svg>
      </div>
      <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-dark-400">
        {coords.map((p) => (
          <span key={p.host} className="flex items-center gap-1">
            <span
              className={`w-2 h-2 rounded-full ${
                p.status === 'healthy' ? 'bg-emerald-400' : p.status === 'unhealthy' ? 'bg-red-400' : 'bg-dark-500'
              }`}
            />
            {p.flag} {p.city}
          </span>
        ))}
      </div>
    </div>
  );
}
