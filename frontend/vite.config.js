import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  build: {
    outDir: '../backend/public',
    emptyOutDir: true,
  },
  server: {
    host: true, // 监听 0.0.0.0，便于用内网 IP（如 10.x）访问；通知里 UIAUTO_PUBLIC_BASE_URL 才能用局域网地址
    port: 5173,
    proxy: {
      '/api': { target: 'http://localhost:3001', changeOrigin: true },
      '/results': { target: 'http://localhost:3001', changeOrigin: true },
    },
  },
});
