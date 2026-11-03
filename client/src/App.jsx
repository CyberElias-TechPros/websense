import React, { useState, useEffect } from 'react';
import { Routes, Route, useLocation, useNavigate } from 'react-router-dom';
import { Menu, Globe } from 'lucide-react';
import { useSocket } from './hooks/useSocket';
import Sidebar from './components/Sidebar';
import { getServerOrigin, isNativeApp } from './services/serverBase';
import Dashboard from './pages/Dashboard';
import Proxies from './pages/Proxies';
import Urls from './pages/Urls';
import History from './pages/History';
import Analytics from './pages/Analytics';
import AnalyticsDashboard from './pages/AnalyticsDashboard';
import ProxyPool from './pages/ProxyPool';
import Notifications from './pages/Notifications';
import HealthChecker from './pages/HealthChecker';
import Intelligence from './pages/Intelligence';
import Settings from './pages/Settings';
import Logs from './pages/Logs';
import Wizard from './pages/Wizard';
import Qa from './pages/Qa';

export default function App() {
  const { connected, engineState, stats, liveVisits, socket } = useSocket();
  const location = useLocation();
  const navigate = useNavigate();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  // Native app first launch: no server configured yet → send to Settings.
  useEffect(() => {
    if (isNativeApp() && !getServerOrigin() && location.pathname !== '/settings') {
      navigate('/settings?setup=1', { replace: true });
    }
  }, [navigate, location.pathname]);

  return (
    <div className="flex min-h-screen">
      <Sidebar
        connected={connected}
        open={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
      />
      <main className="flex-1 min-w-0 lg:ml-64">
        {/* Mobile / native top bar */}
        <header className="lg:hidden sticky top-0 z-20 flex items-center gap-3 px-4 py-3 bg-dark-900/95 backdrop-blur border-b border-dark-700">
          <button
            type="button"
            onClick={() => setSidebarOpen(true)}
            className="p-2 -ml-2 rounded-lg text-dark-300 hover:text-white hover:bg-dark-800"
            aria-label="Open navigation"
          >
            <Menu className="w-6 h-6" />
          </button>
          <Globe className="w-6 h-6 text-blue-500" />
          <span className="font-bold text-sm">WebSense</span>
          <span
            className={`ml-auto w-2.5 h-2.5 rounded-full ${connected ? 'bg-emerald-400' : 'bg-red-400'}`}
            title={connected ? 'Connected' : 'Disconnected'}
          />
        </header>
        <div className="p-4 lg:p-8 animate-fade-in" key={location.pathname}>
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
          <Route path="/qa" element={<Qa socket={socket} />} />
          <Route path="/intelligence" element={<Intelligence />} />
          <Route path="/logs" element={<Logs />} />
          <Route path="/settings" element={<Settings />} />
          <Route path="/wizard" element={<Wizard />} />
        </Routes>
        </div>
      </main>
    </div>
  );
}
