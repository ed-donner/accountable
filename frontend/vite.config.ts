/// <reference types="vitest/config" />
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// The backend port: 8000 in development (D1). The end-to-end tests run their own backend on another port.
const apiPort = process.env.ACCOUNTABLE_API_PORT ?? '8000'

export default defineConfig({
  plugins: [react()],
  server: {
    port: Number(process.env.ACCOUNTABLE_WEB_PORT ?? 5173),
    strictPort: true,
    proxy: { '/api': `http://127.0.0.1:${apiPort}` },
  },
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test-setup.ts'],
    // A stray .only would skip every other test and still pass, so it always fails the run.
    allowOnly: false,
    css: { modules: { classNameStrategy: 'non-scoped' } },
  },
})
