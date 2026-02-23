/**
 * rdf-fetcher.js
 *
 * Async helper for fetching RDF resources with:
 *  - Accept-header negotiation (Turtle, JSON-LD, N-Triples)
 *  - Cache API caching to avoid redundant network requests
 *  - Graceful error handling
 *
 * Content-Type matching is intentionally lenient: if a server returns a
 * generic type (text/plain, application/octet-stream, or no Content-Type)
 * the response is still accepted for the first format we requested.  This
 * avoids false-negatives from static file servers (e.g. Vite's dev server)
 * that do not know RDF-specific MIME types.
 */

const CACHE_NAME = "rdf-fetcher-v1";

/** Ordered list of RDF MIME types to try, most preferred first. */
const RDF_FORMATS = [
  "text/turtle",
  "application/ld+json",
  "application/n-triples",
  "text/n3",
];

/**
 * Fetch an RDF resource at `url`, negotiating the best available format.
 *
 * Returns `{ text, format, url }` on success.
 * Throws an Error if no supported format could be retrieved.
 *
 * @param {string} url
 * @param {{ formats?: string[], bypassCache?: boolean }} [options]
 * @returns {Promise<{ text: string, format: string, url: string }>}
 */
export async function fetchRdf(url, options = {}) {
  const formats = options.formats ?? RDF_FORMATS;
  const bypassCache = options.bypassCache ?? false;

  // Try the Cache API when available and not bypassed
  const cache = await _openCache();

  for (const format of formats) {
    const cacheKey = `${url}|${format}`;

    if (cache && !bypassCache) {
      const cached = await cache.match(cacheKey);
      if (cached) {
        const text = await cached.text();
        return { text, format, url };
      }
    }

    try {
      const response = await fetch(url, {
        headers: { Accept: format },
      });

      if (!response.ok) continue;

      const contentType = response.headers.get("Content-Type") ?? "";
      const mimeBase = format.split(";")[0].trim();

      // Accept if the server confirms the requested type OR if it returns a
      // generic type (text/plain, application/octet-stream, empty).  Many
      // static servers — including Vite's dev server — do not know RDF MIME
      // types and fall back to text/plain for .ttl, .n3, etc.
      const isMatch = contentType.includes(mimeBase);
      const isGeneric =
        !contentType ||
        contentType.includes("text/plain") ||
        contentType.includes("application/octet-stream");
      if (!isMatch && !isGeneric) continue;

      const text = await response.text();

      if (cache && !bypassCache) {
        // Store a plain-text clone in the cache
        const toCache = new Response(text, {
          headers: { "Content-Type": "text/plain" },
        });
        await cache.put(cacheKey, toCache);
      }

      return { text, format, url };
    } catch (_err) {
      // Network error for this format – try the next one
    }
  }

  throw new Error(`Could not fetch RDF from ${url} in any supported format`);
}

/**
 * Clear the RDF fetch cache.
 * @returns {Promise<void>}
 */
export async function clearCache() {
  if (typeof caches === "undefined") return;
  await caches.delete(CACHE_NAME);
}

async function _openCache() {
  if (typeof caches === "undefined") return null;
  try {
    return await caches.open(CACHE_NAME);
  } catch (_err) {
    return null;
  }
}
