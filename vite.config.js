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
      entry: "src/components/rdf-adapter.js",
      name: "RdfAdapter",
      fileName: "rdf-adapter",
      formats: ["es", "umd"],
    },
    rollupOptions: {
      // Externalise n3 so users can choose their own version
      external: ["n3"],
      output: {
        globals: {
          n3: "N3",
        },
        exports: "named",
      },
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
