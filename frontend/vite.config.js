import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
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
  },
});
