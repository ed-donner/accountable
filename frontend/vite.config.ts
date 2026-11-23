/// <reference types="vitest/config" />
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// The backend's port and our own can be moved for the end-to-end tests.
const apiPort = process.env.ACCOUNTABLE_API_PORT ?? "8000";
const webPort = Number(process.env.ACCOUNTABLE_WEB_PORT ?? "5173");

export default defineConfig({
  plugins: [react()],
  server: {
    port: webPort,
    strictPort: true,
    host: "localhost",
    proxy: {
      "/api": { target: `http://127.0.0.1:${apiPort}`, changeOrigin: true },
    },
  },
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./src/test-setup.ts"],
    css: false,
    coverage: {
      provider: "v8",
      include: ["src/**/*.{ts,tsx}"],
      exclude: [
        "src/**/*.test.{ts,tsx}",
        "src/test-setup.ts",
        "src/shared/test-utils.tsx",
        "src/shared/api-types.ts",
      ],
      thresholds: { lines: 80, statements: 80, functions: 80, branches: 80 },
    },
  },
});
