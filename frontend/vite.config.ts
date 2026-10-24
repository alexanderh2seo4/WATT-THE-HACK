import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  // pre-bundling breaks maplibre-gl v6's separate worker file URL in dev
  optimizeDeps: { exclude: ['maplibre-gl'] },
  server: {
    proxy: { '/api': process.env.API_URL ?? 'http://localhost:8000' }, // API_URL: run against another backend port
  },
})
