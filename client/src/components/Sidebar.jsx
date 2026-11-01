import React from 'react';
import { NavLink } from 'react-router-dom';
import {
  LayoutDashboard, Shield, Link2, History,
  BarChart3, Settings, ScrollText, Globe, Wifi, WifiOff, Wand2, TrendingUp, Layers, Bell, HeartPulse, Brain,
} from 'lucide-react';

const navItems = [
  { path: '/', label: 'Dashboard', icon: LayoutDashboard },
  { path: '/wizard', label: 'Setup Wizard', icon: Wand2 },
  { path: '/proxy-pool', label: 'Proxy Pool', icon: Layers },
  { path: '/intelligence', label: 'AI & Proxy Intel', icon: Brain },
  { path: '/proxies', label: 'Proxies', icon: Shield },
  { path: '/urls', label: 'URLs', icon: Link2 },
  { path: '/history', label: 'History', icon: History },
  { path: '/analytics', label: 'Analytics', icon: BarChart3 },
  { path: '/analytics-dashboard', label: 'Dashboard', icon: TrendingUp },
  { path: '/logs', label: 'Logs', icon: ScrollText },
  { path: '/notifications', label: 'Notifications', icon: Bell },
  { path: '/health-checker', label: 'Health Checker', icon: HeartPulse },
  { path: '/settings', label: 'Settings', icon: Settings },
];

export default function Sidebar({ connected }) {
  return (
    <aside className="w-64 bg-dark-900 border-r border-dark-700 flex flex-col fixed h-full z-10 shrink-0">
      <div className="p-5 border-b border-dark-700">
        <div className="flex items-center gap-3">
          <Globe className="w-8 h-8 text-blue-500" />
          <div>
            <h1 className="font-bold text-lg leading-tight">Proxy Visitor</h1>
            <p className="text-dark-400 text-xs">Automated Traffic Engine</p>
          </div>
        </div>
      </div>

      <nav className="flex-1 p-3 space-y-1 overflow-y-auto">
        {navItems.map(({ path, icon: Icon, label }) => (
          <NavLink
            key={path}
            to={path}
            end={path === '/'}
            className={({ isActive }) =>
              `flex items-center gap-3 px-4 py-3 rounded-lg transition-colors duration-200 ${
                isActive
                  ? 'bg-blue-600/20 text-blue-400 border-l-2 border-blue-400'
                  : 'text-dark-400 hover:text-dark-200 hover:bg-dark-800'
              }`
            }
          >
            <Icon className="w-5 h-5" />
            <span className="font-medium text-sm">{label}</span>
          </NavLink>
        ))}
      </nav>

      <div className="p-4 border-t border-dark-700">
        <div className="flex items-center gap-2 text-sm">
          {connected
            ? (<><Wifi className="w-4 h-4 text-emerald-400" /><span className="text-emerald-400">Connected</span></>)
            : (<><WifiOff className="w-4 h-4 text-red-400" /><span className="text-red-400">Disconnected</span></>)
          }
        </div>
      </div>
    </aside>
  );
}
