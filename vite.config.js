import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  base: './',
  plugins: [react()],
  build: {
    target: 'es2020',
    sourcemap: false,
    minify: 'esbuild',
    cssMinify: 'esbuild',
    cssCodeSplit: false,
    reportCompressedSize: false
  },
  esbuild: {
    drop: ['console', 'debugger']
  },
  server: {
    port: 5173,
    strictPort: true
  }
});
