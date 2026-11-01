import React from 'react';
import UrlTable from '../components/UrlTable';

export default function Urls() {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold">URL Management</h2>
        <p className="text-dark-400">Manage target URLs and priorities</p>
      </div>
      <UrlTable />
    </div>
  );
}
