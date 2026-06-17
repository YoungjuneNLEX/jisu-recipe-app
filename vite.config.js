import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'

export default defineConfig({
  plugins: [react()],
  server: {
    host: true,
    proxy: {
      '/api/youtube': {
        target: 'https://www.youtube.com',
        changeOrigin: true,
        rewrite: path => path.replace(/^\/api\/youtube/, ''),
        headers: { 'User-Agent': UA },
      },
      '/api/ytimg': {
        target: 'https://i.ytimg.com',
        changeOrigin: true,
        rewrite: path => path.replace(/^\/api\/ytimg/, ''),
        headers: { 'User-Agent': UA },
      },
    },
  },
})
