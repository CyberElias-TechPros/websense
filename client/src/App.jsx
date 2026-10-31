import React from 'react';
import { Routes, Route, useLocation } from 'react-router-dom';
import { useSocket } from './hooks/useSocket';
import Sidebar from './components/Sidebar';
import Dashboard from './pages/Dashboard';
import Proxies from './pages/Proxies';
import Urls from './pages/Urls';
import History from './pages/History';
import Analytics from './pages/Analytics';
import AnalyticsDashboard from './pages/AnalyticsDashboard';
import ProxyPool from './pages/ProxyPool';
import Notifications from './pages/Notifications';
import HealthChecker from './pages/HealthChecker';
import Settings from './pages/Settings';
import Logs from './pages/Logs';
import Wizard from './pages/Wizard';

export default function App() {
  const { connected, engineState, stats, liveVisits } = useSocket();
  const location = useLocation();

  return (
    <div className="flex min-h-screen">
      <Sidebar connected={connected} />
      <main className="flex-1 ml-64 p-6 lg:p-8 animate-fade-in" key={location.pathname}>
        <Routes>
          <Route
            path="/"
            element={
              <Dashboard
                engineState={engineState}
                stats={stats}
                liveVisits={liveVisits}
                connected={connected}
              />
            }
          />
          <Route path="/proxies" element={<Proxies />} />
          <Route path="/urls" element={<Urls />} />
          <Route path="/history" element={<History />} />
          <Route path="/analytics" element={<Analytics />} />
          <Route path="/analytics-dashboard" element={<AnalyticsDashboard />} />
          <Route path="/proxy-pool" element={<ProxyPool />} />
          <Route path="/notifications" element={<Notifications />} />
          <Route path="/health-checker" element={<HealthChecker />} />
          <Route path="/logs" element={<Logs />} />
          <Route path="/settings" element={<Settings />} />
          <Route path="/wizard" element={<Wizard />} />
        </Routes>
      </main>
    </div>
  );
}
