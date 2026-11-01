import React from 'react';
import ProxyTable from '../components/ProxyTable';
import WorldMap from '../components/WorldMap';

export default function Proxies() {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold">Proxy Management</h2>
        <p className="text-dark-400">Monitor and control your proxy pool</p>
      </div>
      <ProxyTable />
      <WorldMap proxies={[]} />
    </div>
  );
}
