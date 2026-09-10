import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  // Relative asset paths so the built app works under any Apache sub-path
  // (e.g. http://localhost/siva-murugan-chit-fund/web/).
  base: './',
  server: {
    port: 5173,
    strictPort: false,
  },
});
