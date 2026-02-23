import { defineConfig } from "vite";
import { fileURLToPath } from "url";
import { resolve } from "path";

const __dirname = fileURLToPath(new URL(".", import.meta.url));

/**
 * Vite configuration for building the GitHub Pages demo site.
 *
 * Unlike the library build (vite.config.js), this config:
 *  - Uses public/ as the Vite root so HTML entry points resolve correctly.
 *  - Aliases /src → the real src/ directory so the script imports in the
 *    HTML pages (e.g. /src/components/rdf-adapter.js) are bundled.
 *  - Bundles all dependencies (lit, n3) so the pages are self-contained.
 *  - Uses /MIA-2.0/ as the base path to match the gh-pages URL.
 *  - Outputs to site/ (deployed by the GitHub Actions workflow).
 *
 * Static assets (rdf-data/, playground/, dist/) are copied separately
 * by the workflow after this build completes.
 */
export default defineConfig({
  root: "public",
  base: "/MIA-2.0/",

  // Static files are handled manually in the workflow; skip publicDir here
  // to avoid copying public/ twice and to prevent raw HTML from shadowing
  // the processed entry-point HTML files.
  publicDir: false,

  resolve: {
    alias: {
      // Map /src imports in HTML pages to the real src/ directory
      "/src": resolve(__dirname, "src"),
    },
  },

  build: {
    outDir: resolve(__dirname, "site"),
    emptyOutDir: true,
    rollupOptions: {
      input: {
        index: resolve(__dirname, "public/index.html"),
        "marineinfo-collection": resolve(
          __dirname,
          "public/templates/marineinfo-collection.html"
        ),
      },
    },
  },
});
