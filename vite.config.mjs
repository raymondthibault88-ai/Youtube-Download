import { randomBytes } from 'node:crypto';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ command, isPreview }) => {
  // Vite injects styles during development. Authorize its tags with a nonce
  // generated for this server, while keeping the packaged policy unchanged.
  const nonce = command === 'serve' && !isPreview ? randomBytes(24).toString('base64') : undefined;
  return {
    base: './',
    html: nonce ? { cspNonce: nonce } : undefined,
    plugins: [
      react(),
      {
        name: 'development-csp',
        apply: 'serve',
        transformIndexHtml: {
          order: 'pre',
          handler(html, context) {
            if (!context.server || !nonce) return html;
            return html.replace(
              /(?:script-src|style-src) 'self'/g,
              (directive) => `${directive} 'nonce-${nonce}'`
            );
          }
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
      strictPort: true,
      watch: {
        ignored: ['**/release/**', '**/dist/**', '**/test-results/**', '**/playwright-report/**']
      }
    }
  };
});
