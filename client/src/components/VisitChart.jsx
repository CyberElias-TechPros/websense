import React, { useState, useEffect } from 'react';
import {
  LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, PieChart, Pie, Cell, Legend,
} from 'recharts';
import { getTimeline, getByUrl, getByProxy } from '../services/api';

const COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#06b6d4', '#ec4899', '#84cc16'];

const tooltipStyle = {
  contentStyle: { background: '#0f172a', border: '1px solid #334155', borderRadius: '8px' },
  labelStyle: { color: '#94a3b8' },
};

export function TimelineChart({ hours = 24 }) {
  const [data, setData] = useState([]);

  useEffect(() => {
    const load = async () => {
      try {
        const res = await getTimeline(hours);
        setData(
          res.data.map((d) => ({
            ...d,
            hour: d.hour.split(' ')[1]?.slice(0, 5) || d.hour,
            avg_latency: Math.round(d.avg_latency || 0),
          }))
        );
      } catch { /* noop */ }
    };
    load();
    const interval = setInterval(load, 60000);
    return () => clearInterval(interval);
  }, [hours]);

  if (data.length === 0) return <div className="text-dark-500 text-center py-8">No data yet</div>;

  return (
    <ResponsiveContainer width="100%" height={300}>
      <LineChart data={data}>
        <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
        <XAxis dataKey="hour" stroke="#64748b" fontSize={11} />
        <YAxis stroke="#64748b" fontSize={11} />
        <Tooltip {...tooltipStyle} />
        <Legend wrapperStyle={{ fontSize: 12 }} />
        <Line type="monotone" dataKey="successes" stroke="#10b981" strokeWidth={2} name="Success" dot={false} />
        <Line type="monotone" dataKey="failures" stroke="#ef4444" strokeWidth={2} name="Failed" dot={false} />
      </LineChart>
    </ResponsiveContainer>
  );
}

export function UrlDistributionChart() {
  const [data, setData] = useState([]);

  useEffect(() => {
    const load = async () => {
      try {
        const res = await getByUrl();
        setData(res.data.slice(0, 12));
      } catch { /* noop */ }
    };
    load();
    const interval = setInterval(load, 60000);
    return () => clearInterval(interval);
  }, []);

  if (data.length === 0) return <div className="text-dark-500 text-center py-8">No data yet</div>;

  return (
    <ResponsiveContainer width="100%" height={300}>
      <BarChart data={data} layout="vertical">
        <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
        <XAxis type="number" stroke="#64748b" fontSize={11} />
        <YAxis dataKey="subdomain" type="category" width={70} stroke="#64748b" fontSize={11} />
        <Tooltip {...tooltipStyle} />
        <Legend wrapperStyle={{ fontSize: 12 }} />
        <Bar dataKey="successes" fill="#10b981" name="Success" radius={[0, 4, 4, 0]} />
        <Bar dataKey="total" fill="#334155" name="Total" radius={[0, 4, 4, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}

export function ProxyDistributionChart() {
  const [data, setData] = useState([]);

  useEffect(() => {
    const load = async () => {
      try {
        const res = await getByProxy();
        setData(
          res.data.map((d) => ({
            name: `${d.proxy_city} (${d.proxy_country})`,
            value: d.total,
            successes: d.successes,
          }))
        );
      } catch { /* noop */ }
    };
    load();
  }, []);

  if (data.length === 0) return <div className="text-dark-500 text-center py-8">No data yet</div>;

  return (
    <ResponsiveContainer width="100%" height={300}>
      <PieChart>
        <Pie
          data={data}
          dataKey="value"
          nameKey="name"
          cx="50%"
          cy="50%"
          outerRadius={100}
          label={({ name, percent }) => `${name} ${((percent || 0) * 100).toFixed(0)}%`}
          labelLine={{ stroke: '#64748b' }}
        >
          {data.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
        </Pie>
        <Tooltip {...tooltipStyle} />
      </PieChart>
    </ResponsiveContainer>
  );
}

export function LatencyChart({ hours = 24 }) {
  const [data, setData] = useState([]);

  useEffect(() => {
    const load = async () => {
      try {
        const res = await getTimeline(hours);
        setData(
          res.data
            .map((d) => ({
              hour: d.hour.split(' ')[1]?.slice(0, 5) || d.hour,
              avg_latency: Math.round(d.avg_latency || 0),
            }))
            .filter((d) => d.avg_latency > 0)
        );
      } catch { /* noop */ }
    };
    load();
  }, [hours]);

  if (data.length === 0) return <div className="text-dark-500 text-center py-8">No data yet</div>;

  return (
    <ResponsiveContainer width="100%" height={300}>
      <LineChart data={data}>
        <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
        <XAxis dataKey="hour" stroke="#64748b" fontSize={11} />
        <YAxis stroke="#64748b" fontSize={11} unit="ms" />
        <Tooltip {...tooltipStyle} />
        <Line type="monotone" dataKey="avg_latency" stroke="#3b82f6" strokeWidth={2} name="Avg latency" dot={false} />
      </LineChart>
    </ResponsiveContainer>
  );
}
