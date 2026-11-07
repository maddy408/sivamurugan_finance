import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const apiTarget = env.VITE_API_BASE_URL || 'http://127.0.0.1:8000';

  return {
    plugins: [react()],
    base: './',
    build: {
      outDir: '../web',
      emptyOutDir: true,
    },
    server: {
      host: true,
      port: 5173,
      strictPort: false,
      proxy: {
        '/api': {
          target: apiTarget,
          changeOrigin: true,
          secure: false,
          configure: (proxy) => {
            proxy.on('error', (err, req, res) => {
              if (res.writeHead && !res.headersSent) {
                res.writeHead(503, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({
                  message: 'Cannot reach PHP backend API (port 8000). Please ensure PHP server is running.',
                  error_code: 'BACKEND_UNREACHABLE',
                }));
              }
            });
          },
        },
        '/storage': {
          target: apiTarget,
          changeOrigin: true,
          secure: false,
        },
      },
    },
  };
});
