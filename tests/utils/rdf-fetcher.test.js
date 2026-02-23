/**
 * rdf-fetcher.test.js
 *
 * Unit tests for src/utils/rdf-fetcher.js
 * Runs in a jsdom environment via Vitest.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { fetchRdf } from "../../src/utils/rdf-fetcher.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeFetchMock(responseMap) {
  return vi.fn(async (url, options = {}) => {
    const accept = (options.headers ?? {})["Accept"] ?? "";
    const key = `${url}|${accept}`;

    if (responseMap[key]) {
      const { body, contentType, ok = true, status = 200 } = responseMap[key];
      return {
        ok,
        status,
        headers: {
          get: (name) =>
            name.toLowerCase() === "content-type" ? contentType : null,
        },
        text: async () => body,
      };
    }

    // Default: network failure
    throw new Error("Network error");
  });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("fetchRdf", () => {
  beforeEach(() => {
    // Stub global caches to avoid Cache API usage in jsdom
    vi.stubGlobal("caches", undefined);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("fetches and returns the first matching format", async () => {
    const ttlBody = `<https://example.org/s> <https://example.org/p> "o" .`;
    global.fetch = makeFetchMock({
      "https://example.org/data.ttl|text/turtle": {
        body: ttlBody,
        contentType: "text/turtle; charset=utf-8",
      },
    });

    const result = await fetchRdf("https://example.org/data.ttl", {
      formats: ["text/turtle"],
    });

    expect(result.text).toBe(ttlBody);
    expect(result.format).toBe("text/turtle");
    expect(result.url).toBe("https://example.org/data.ttl");
  });

  it("falls through to the next format when the first fails", async () => {
    const jsonldBody = JSON.stringify({ "@id": "https://example.org/x" });
    global.fetch = makeFetchMock({
      "https://example.org/data|application/ld+json": {
        body: jsonldBody,
        contentType: "application/ld+json",
      },
    });

    const result = await fetchRdf("https://example.org/data", {
      formats: ["text/turtle", "application/ld+json"],
    });

    expect(result.format).toBe("application/ld+json");
    expect(result.text).toBe(jsonldBody);
  });

  it("throws when no format succeeds", async () => {
    global.fetch = makeFetchMock({});

    await expect(
      fetchRdf("https://example.org/missing", { formats: ["text/turtle"] })
    ).rejects.toThrow("Could not fetch RDF");
  });

  it("throws when server returns non-ok status", async () => {
    global.fetch = makeFetchMock({
      "https://example.org/gone|text/turtle": {
        body: "",
        contentType: "text/turtle",
        ok: false,
        status: 404,
      },
    });

    await expect(
      fetchRdf("https://example.org/gone", { formats: ["text/turtle"] })
    ).rejects.toThrow("Could not fetch RDF");
  });

  it("throws when content-type does not match accept", async () => {
    global.fetch = makeFetchMock({
      "https://example.org/wrong|text/turtle": {
        body: "<html></html>",
        contentType: "text/html",
        ok: true,
      },
    });

    await expect(
      fetchRdf("https://example.org/wrong", { formats: ["text/turtle"] })
    ).rejects.toThrow("Could not fetch RDF");
  });
});
