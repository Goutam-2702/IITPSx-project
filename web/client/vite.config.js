import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

/*
 * The dev server proxies /api to the Express backend, so the frontend uses
 * relative URLs and there is no CORS or port juggling during the demo.
 */
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    strictPort: false,
    watch: {
      usePolling: true
    },
    proxy: {
      '/api': {
        target: 'http://localhost:4000',
        changeOrigin: true
      }
    }
  },
  build: { outDir: 'dist', sourcemap: false }
});
