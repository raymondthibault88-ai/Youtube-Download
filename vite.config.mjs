import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  base: './',
  plugins: [
    react(),
    {
      name: 'development-csp',
      apply: 'serve',
      transformIndexHtml(html) {
        return html.replace("style-src 'self'", "style-src 'self' 'unsafe-inline'");
      }
    }
  ],
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
