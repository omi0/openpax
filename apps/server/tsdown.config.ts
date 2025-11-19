import { defineConfig } from "tsdown";

export default defineConfig({
  entry: { index: "src/index.ts" },
  format: "esm",
  platform: "node",
  target: "node24",
  outDir: "dist",
  clean: true,
  sourcemap: true,
  // Bundle workspace packages; keep npm dependencies external (installed in the image).
  deps: { neverBundle: true, alwaysBundle: [/^@sitli\//] },
});
