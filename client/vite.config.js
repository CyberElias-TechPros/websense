import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 3000,
    host: '0.0.0.0',
    // Dev proxy: frontend on :3000 → backend. Backend port is configurable
    // via VITE_BACKEND_PORT (default 3001 — the server/docker default).
    proxy: {
      '/api': {
        target: `http://localhost:${process.env.VITE_BACKEND_PORT || 3001}`,
        changeOrigin: true,
      },
      '/socket.io': {
        target: `http://localhost:${process.env.VITE_BACKEND_PORT || 3001}`,
        changeOrigin: true,
        ws: true,
      },
    },
  },
  build: {
    outDir: 'dist',
    chunkSizeWarningLimit: 1200,
  },
});
