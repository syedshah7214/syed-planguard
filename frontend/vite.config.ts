import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// In development, API calls are proxied to the PlanGuard API on :8100.
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5174,
    proxy: {
      "/api": "http://localhost:8100",
      "/health": "http://localhost:8100",
      "/openapi.json": "http://localhost:8100",
      "/docs": "http://localhost:8100",
    },
  },
});
