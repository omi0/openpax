import preact from "@preact/preset-vite";
import { defineConfig } from "vite";

export default defineConfig({
  base: "/widget/",
  plugins: [preact()],
  server: {
    port: 5174,
    proxy: { "/api": "http://localhost:3000" },
  },
  build: {
    outDir: "dist",
    emptyOutDir: true,
    sourcemap: true,
  },
});
