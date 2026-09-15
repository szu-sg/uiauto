import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const apiTarget = env.VITE_API_PROXY || 'http://localhost:3001';

  return {
    plugins: [react()],
    build: {
      outDir: '../backend/public',
      emptyOutDir: true,
    },
    server: {
      host: true,
      port: 5180,
      strictPort: true,
      open: true,
      proxy: {
        '/api': { target: apiTarget, changeOrigin: true },
        '/results': { target: apiTarget, changeOrigin: true },
        '/ws': { target: apiTarget, ws: true, changeOrigin: true },
      },
    },
  };
});
