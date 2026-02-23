import { defineConfig } from "vite";

/**
 * Vite plugin: serve RDF file types with their correct MIME types during
 * development.  Without this, Vite's static file server falls back to
 * text/plain for .ttl, .n3 and .jsonld, which would cause the rdf-fetcher's
 * Content-Type check to fail.
 */
function rdfMimeTypes() {
  const map = {
    ".ttl": "text/turtle; charset=utf-8",
    ".n3": "text/n3; charset=utf-8",
    ".jsonld": "application/ld+json",
    ".nt": "application/n-triples",
    ".nq": "application/n-quads",
  };
  return {
    name: "rdf-mime-types",
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        // Only set the header if it hasn't been sent yet and the extension
        // is one of the known RDF types (explicit allowlist avoids matching
        // ambiguous multi-dot paths like "archive.ttl.bak").
        if (!res.headersSent) {
          const match = req.url?.split("?")[0].match(/\.(ttl|n3|jsonld|nt|nq)$/i);
          if (match) {
            res.setHeader("Content-Type", map[`.${match[1].toLowerCase()}`]);
          }
        }
        next();
      });
    },
  };
}

export default defineConfig({
  plugins: [rdfMimeTypes()],

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
