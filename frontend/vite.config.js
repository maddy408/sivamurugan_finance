import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  // Relative asset paths so the built app works under any Apache sub-path
  // (e.g. http://localhost/siva-murugan-chit-fund/web/).
  base: './',
  build: {
    // Ship the production build straight into ../web (served by Apache).
    outDir: '../web',
    emptyOutDir: true,
  },
  server: {
    port: 5173,
    strictPort: false,
  },
});
