import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

// In development the API runs separately (uvicorn on :8000); Vite proxies /api to it
// so the browser sees a single origin, exactly like production.
export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: 5173,
    proxy: {
      "/api": { target: process.env.VITE_PROXY_TARGET ?? "http://127.0.0.1:8000", changeOrigin: true },
    },
  },
  build: {
    rolldownOptions: {
      output: {
        // Vendor code changes far less often than app code: separate chunks cache better.
        codeSplitting: {
          groups: [
            { name: "charts", test: /node_modules[\\/](recharts|d3-|victory-vendor|es-toolkit|@reduxjs|react-redux|redux|immer|reselect)/, priority: 2 },
            { name: "react", test: /node_modules[\\/](react|react-dom|react-router|scheduler|@tanstack)[\\/]/, priority: 1 },
          ],
        },
      },
    },
  },
  test: {
    environment: "jsdom",
    setupFiles: ["./src/test/setup.ts"],
    css: false,
  },
});
