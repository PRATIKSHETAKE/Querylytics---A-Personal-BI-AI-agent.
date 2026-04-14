import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite' // Add this line

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(), // Add this line
  ],
  optimizeDeps: {
    include: ['plotly.js-dist'] // Forces Vite to bundle Plotly correctly
  },
  server: {
    host: '0.0.0.0', // Expose to local network
    proxy: {
      // Any request starting with /api will be sent to the backend
      '/api': {
        target: 'http://127.0.0.1:8000', // Points to the backend        
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api/, ''),
      },
    },
  },
})