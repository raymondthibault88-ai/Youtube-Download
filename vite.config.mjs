import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  base: './',
  plugins: [react()],
  build: {
    target: 'es2020',
    sourcemap: false,
    minify: 'oxc',
    cssCodeSplit: false,
    reportCompressedSize: false
  },
  server: {
    port: 5173,
    strictPort: true
  }
});
