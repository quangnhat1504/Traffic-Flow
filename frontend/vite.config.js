import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  const backendTarget = env.VITE_API_BASE_URL || env.VITE_BACKEND_TARGET || "http://100.115.216.86:8000";

  return {
    plugins: [react()],
    server: {
      host: "127.0.0.1",
      port: 5173,
      proxy: {
        "/api": backendTarget,
        "/videos": backendTarget,
        "/tasks": backendTarget,
        "/live": backendTarget,
        "/static": backendTarget,
        "/health": backendTarget,
        "/ready": backendTarget,
      },
    },
  };
});
