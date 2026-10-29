import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: { host: true, proxy: { '/api': 'http://localhost:8787', '/tonconnect-manifest.json': 'http://localhost:8787' } },
  build: {
    chunkSizeWarningLimit: 1500,

  },
});
