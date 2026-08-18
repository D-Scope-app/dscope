import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { nodePolyfills } from "vite-plugin-node-polyfills";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = fileURLToPath(new URL(".", import.meta.url));

export default defineConfig({
  envPrefix: ["VITE_", "PUBLIC_"],
  base: "./",
  root: resolve(rootDir, "frontend"),
  publicDir: false,
  plugins: [
    react(),
    // @aztec/wallet-sdk and @aztec/aztec.js ship browser-facing code that
    // still imports small Node core helpers such as util.inspect, assert and tty.
    // Vite externalizes those modules by default for browser builds, which breaks
    // the MVP bundle. Keep the polyfill scoped to the MVP frontend build.
    nodePolyfills({
      include: ["assert", "buffer", "process", "stream", "tty", "util"],
      globals: {
        Buffer: true,
        global: true,
        process: true,
      },
      protocolImports: true,
    }),
  ],
  server: {
    proxy: {
      "/mvp/": {
        target: "http://127.0.0.1:8787",
        changeOrigin: true,
      },
      "/internal/": {
        target: "http://127.0.0.1:8787",
        changeOrigin: true,
      },
      "/surveys/": {
        target: "http://127.0.0.1:8787",
        changeOrigin: true,
      },
      "/verification-sessions/": {
        target: "http://127.0.0.1:8787",
        changeOrigin: true,
      },
      "/health": {
        target: "http://127.0.0.1:8787",
        changeOrigin: true,
      },
    },
  },
  build: {
    outDir: resolve(rootDir, "public/mvp"),
    emptyOutDir: true,
    rollupOptions: {
      input: resolve(rootDir, "frontend/mvp.html"),
    },
  },
});
