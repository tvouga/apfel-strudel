import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  // Local dev: forward same-origin /api calls to the Express server (server/).
  // In production on Cloudflare Pages, /api/* is served by Pages Functions.
  server: {
    proxy: {
      '/api': 'http://localhost:8787',
    },
  },
})
