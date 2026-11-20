/// <reference types="vitest/config" />
import path from "node:path";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

const webPort = Number(process.env.ACCOUNTABLE_WEB_PORT ?? 5173);
const apiPort = Number(process.env.ACCOUNTABLE_API_PORT ?? 8000);

// Every internal address is 127.0.0.1, never localhost: Node looks up
// localhost as ::1 first, while the backend listens on 127.0.0.1 (plan, risk 3).
export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "./src"),
    },
  },
  cacheDir: process.env.ACCOUNTABLE_VITE_CACHE ?? "node_modules/.vite",
  server: {
    host: "127.0.0.1",
    port: webPort,
    strictPort: true,
    proxy: {
      "/api": `http://127.0.0.1:${apiPort}`,
    },
  },
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./src/test/setup.ts"],
    env: { TZ: "America/Los_Angeles" },
    // The form tests open Radix popovers several times and take about 2 seconds.
    // With npm run dev and the end-to-end servers busy at the same time, one
    // passed Vitest's default 5 seconds, so the limit leaves room for that.
    testTimeout: 15_000,
    // A test left as .only would quietly skip the rest, so npm test refuses it.
    allowOnly: false,
    coverage: {
      provider: "v8",
      // Every source file counts, including ones no unit test loads.
      include: ["src/**/*.{ts,tsx}"],
      exclude: ["src/test/**", "src/main.tsx"],
      reporter: ["text-summary"],
      thresholds: { lines: 80 },
    },
  },
});
