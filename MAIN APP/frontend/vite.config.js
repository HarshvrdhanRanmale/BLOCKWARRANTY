import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

const demoHost = 'ago-trend-north-pockets.trycloudflare.com'
const apiProxy = {
  '/api': {
    target: 'http://localhost:5001',
    changeOrigin: false,
  },
}

export default defineConfig({
  plugins: [react(), tailwindcss()],
  cacheDir: './node_modules/.vite-blockwarranty',
  server: {
    // Temporary Cloudflare address used for the supervised multi-user demo.
    // Cloudflare Quick Tunnels use a new random subdomain each time. The
    // backend still restricts RPC methods and rate limits the local demo.
    allowedHosts: ['.trycloudflare.com'],
    proxy: apiProxy,
  },
  // The public demo uses the bundled production app, not the slower Vite
  // development server. Keep the API proxy here so the wallet relay remains
  // same-origin for every visitor.
  preview: {
    host: '0.0.0.0',
    port: 5173,
    strictPort: true,
    allowedHosts: ['.trycloudflare.com'],
    proxy: apiProxy,
  },
  resolve: {
    alias: {
      // Web3Auth v11 / ethers.js require these Node built-in polyfills in browser
      buffer: 'buffer',
    },
  },
  define: {
    // Required for ethers.js and Web3Auth in browser environment
    global: 'globalThis',
  },
  optimizeDeps: {
    include: ['buffer'],
    esbuildOptions: {
      define: {
        global: 'globalThis',
      },
    },
  },
  build: {
    // Keep each current release separate from a preview process that may still
    // hold the previous output folder open on Windows.
    outDir: 'dist-release',
    commonjsOptions: {
      transformMixedEsModules: true,
    },
  },
})
