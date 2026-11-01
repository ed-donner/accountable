import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

const webPort = Number(process.env.ACCOUNTABLE_WEB_PORT ?? 5173);
const apiPort = Number(process.env.ACCOUNTABLE_API_PORT ?? 8765);

export default defineConfig({
  plugins: [react(), tailwindcss()],
  // The tests set their own cache so they can't disturb a running copy.
  cacheDir: process.env.ACCOUNTABLE_VITE_CACHE ?? "node_modules/.vite",
  server: {
    host: "127.0.0.1",
    port: webPort,
    strictPort: true,
    proxy: { "/api": `http://127.0.0.1:${apiPort}` },
  },
  // Listed up front, or Vite finds them during a first visit and reloads the page.
  optimizeDeps: {
    include: [
      "react",
      "react-dom",
      "react-dom/client",
      "react-router",
      "react-router/dom",
      "@tanstack/react-query",
      "@tanstack/react-table",
      "recharts",
      "@dnd-kit/core",
      "radix-ui",
      "cmdk",
      "react-hook-form",
      "@hookform/resolvers/zod",
      "zod",
      "date-fns",
      "sonner",
      "lucide-react",
    ],
  },
  test: {
    environment: "jsdom",
    include: ["src/**/*.test.{ts,tsx}", "../scripts/*.test.mjs"],
    setupFiles: ["src/test-setup.ts"],
    restoreMocks: true,
  },
});
