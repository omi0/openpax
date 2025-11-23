import { defineConfig } from "vite";

/** The tiny loader restaurants paste into their site. Built separately as a classic script. */
export default defineConfig({
  build: {
    outDir: "dist",
    emptyOutDir: false,
    lib: {
      entry: "src/embed/embed.ts",
      name: "SitliEmbed",
      formats: ["iife"],
      fileName: () => "embed.js",
    },
    minify: true,
  },
});
