import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// In dev, the backend's routes are proxied so no CORS setup is needed. /demo and /tracker.js are proxied too, so the
// Demo page's sample store (an iframe) and its tracker are same-origin with the dashboard, exactly as in production.
const backend = process.env.VITE_DEV_API || 'http://localhost:4000';
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/api': backend,
      '/demo': backend,
      '/tracker.js': backend,
      '/socket.io': { target: backend, ws: true },
    },
  },
});
