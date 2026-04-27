import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

const backend = `http://127.0.0.1:${process.env.BACKEND_PORT ?? 4567}`;

export default defineConfig({
  plugins: [react()],
  build: {
    outDir: "dist",
    emptyOutDir: true,
  },
  server: {
    port: 5173,
    proxy: {
      "/api": backend,
      "/events": backend,
    },
  },
  test: {
    globals: true,
    environment: "jsdom",
    setupFiles: ["./src/test-setup.ts"],
    pool: "vmForks",
  },
});
