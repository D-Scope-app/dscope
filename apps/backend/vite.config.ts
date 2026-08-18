import { defineConfig } from "vite";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = fileURLToPath(new URL(".", import.meta.url));

export default defineConfig({
  base: "./",
  root: resolve(rootDir, "frontend"),
  publicDir: false,
  build: {
    outDir: resolve(rootDir, "public/verify-real"),
    emptyOutDir: true,
    rollupOptions: {
      input: resolve(rootDir, "frontend/verify-real.html"),
    },
  },
});
