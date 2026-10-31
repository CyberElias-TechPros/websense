import React, { useState } from 'react';
import {
  TimelineChart, UrlDistributionChart, ProxyDistributionChart, LatencyChart,
} from '../components/VisitChart';

export default function Analytics() {
  const [hours, setHours] = useState(24);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">Analytics</h2>
          <p className="text-dark-400">Detailed visit analytics and trends</p>
        </div>
        <div className="flex gap-2">
          {[1, 24, 72].map((h) => (
            <button
              key={h}
              onClick={() => setHours(h)}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                hours === h ? 'bg-blue-600 text-white' : 'bg-dark-800 text-dark-400 hover:text-white'
              }`}
            >
              {h < 24 ? `${h}h` : h === 24 ? '24h' : `${h / 24}d`}
            </button>
          ))}
        </div>
      </div>

      <div className="card">
        <h3 className="text-lg font-semibold mb-4">Visits Over Time</h3>
        <TimelineChart hours={hours} />
      </div>

      <div className="card">
        <h3 className="text-lg font-semibold mb-4">Average Latency</h3>
        <LatencyChart hours={hours} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="card">
          <h3 className="text-lg font-semibold mb-4">Visits by URL</h3>
          <UrlDistributionChart />
        </div>
        <div className="card">
          <h3 className="text-lg font-semibold mb-4">Visits by Proxy Location</h3>
          <ProxyDistributionChart />
        </div>
      </div>
    </div>
  );
}
