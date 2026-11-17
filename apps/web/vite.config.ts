import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

export default defineConfig({
  plugins: [react()],
  server: {
    // The UI calls /api/...; Vite forwards it to the Nest API.
    proxy: {
      '/api': {
        target: process.env.API_URL ?? 'http://localhost:3000',
        rewrite: (path) => path.replace(/^\/api/, ''),
      },
    },
  },
})
