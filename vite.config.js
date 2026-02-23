import { defineConfig } from "vite";

export default defineConfig({
  // Serve static files from public/ during development
  publicDir: "public",

  build: {
    // Output to dist/
    outDir: "dist",
    // Minify for production
    minify: "esbuild",
    lib: {
      entry: {
        "rdf-adapter": "src/components/rdf-adapter.js",
        "rdf-display": "src/components/rdf-display.js",
      },
      formats: ["es"],
    },
    rollupOptions: {
      // Externalise n3 and lit so users can choose their own versions
      external: ["n3", "lit"],
    },
  },

  // Web Worker support
  worker: {
    format: "es",
  },

  // Test configuration (Vitest)
  test: {
    environment: "jsdom",
    globals: true,
    coverage: {
      provider: "v8",
      reporter: ["text", "lcov"],
    },
  },
});
