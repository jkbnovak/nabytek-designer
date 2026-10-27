import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    // API server (server/index.ts) drží klíč ke Claude API mimo prohlížeč.
    proxy: { '/api': 'http://localhost:8787' },
  },
})
