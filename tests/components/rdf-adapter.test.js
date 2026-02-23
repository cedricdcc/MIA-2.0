/**
 * rdf-adapter.test.js
 *
 * Unit tests for the <rdf-adapter> custom element.
 * Runs in a jsdom environment via Vitest.
 *
 * The Web Worker and network layer are mocked so tests are fast and
 * deterministic.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// ---------------------------------------------------------------------------
// Mock dependencies before importing the component
// ---------------------------------------------------------------------------

vi.mock("../../src/utils/rdf-fetcher.js", () => ({
  fetchRdf: vi.fn(),
}));

vi.mock("../../src/utils/rdf-parser.js", () => ({
  parseRdf: vi.fn(),
  terminateWorker: vi.fn(),
}));

import { fetchRdf } from "../../src/utils/rdf-fetcher.js";
import { parseRdf } from "../../src/utils/rdf-parser.js";

// Import the component *after* mocks are set up
import "../../src/components/rdf-adapter.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeQuad(s, p, o) {
  return {
    subject: { value: s, termType: "NamedNode" },
    predicate: { value: p, termType: "NamedNode" },
    object: { value: o, termType: "Literal" },
    graph: { value: "", termType: "DefaultGraph" },
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("<rdf-adapter>", () => {
  let el;

  beforeEach(() => {
    vi.clearAllMocks();
    // Remove any leftover <link rel="describedby"> elements
    document
      .querySelectorAll('link[rel="describedby"]')
      .forEach((l) => l.remove());
  });

  afterEach(() => {
    if (el && el.parentNode) el.parentNode.removeChild(el);
  });

  it("is registered as a custom element", () => {
    expect(customElements.get("rdf-adapter")).toBeDefined();
  });

  it("shows an error when no source is found", async () => {
    el = document.createElement("rdf-adapter");
    el.setAttribute("no-shadow", "");
    document.body.appendChild(el);

    // Wait for microtask queue to flush
    await new Promise((r) => setTimeout(r, 0));

    expect(el.querySelector(".rdf-error")).not.toBeNull();
  });

  it("renders triples from the src attribute", async () => {
    fetchRdf.mockResolvedValueOnce({
      text: "",
      format: "text/turtle",
      url: "https://example.org/data.ttl",
    });
    parseRdf.mockResolvedValueOnce([
      makeQuad(
        "https://example.org/s",
        "http://purl.org/dc/terms/title",
        "Hello"
      ),
    ]);

    el = document.createElement("rdf-adapter");
    el.setAttribute("no-shadow", "");
    el.setAttribute("src", "https://example.org/data.ttl");
    document.body.appendChild(el);

    await new Promise((r) => setTimeout(r, 50));

    expect(fetchRdf).toHaveBeenCalledWith("https://example.org/data.ttl");
    const dl = el.querySelector("dl.rdf-triples");
    expect(dl).not.toBeNull();
  });

  it("filters triples by the subject attribute", async () => {
    fetchRdf.mockResolvedValueOnce({
      text: "",
      format: "text/turtle",
      url: "https://example.org/data.ttl",
    });
    parseRdf.mockResolvedValueOnce([
      makeQuad("https://example.org/match", "http://example.org/p", "yes"),
      makeQuad("https://example.org/other", "http://example.org/p", "no"),
    ]);

    el = document.createElement("rdf-adapter");
    el.setAttribute("no-shadow", "");
    el.setAttribute("src", "https://example.org/data.ttl");
    el.setAttribute("subject", "https://example.org/match");
    document.body.appendChild(el);

    await new Promise((r) => setTimeout(r, 50));

    const dds = el.querySelectorAll("dd.rdf-object");
    // Only the matching triple should appear
    expect(dds).toHaveLength(1);
    expect(dds[0].textContent).toBe("yes");
  });

  it("discovers sources from <link rel='describedby'>", async () => {
    const link = document.createElement("link");
    link.rel = "describedby";
    link.href = "https://example.org/meta.ttl";
    document.head.appendChild(link);

    fetchRdf.mockResolvedValueOnce({
      text: "",
      format: "text/turtle",
      url: "https://example.org/meta.ttl",
    });
    parseRdf.mockResolvedValueOnce([
      makeQuad("https://example.org/s", "https://schema.org/name", "Name"),
    ]);

    el = document.createElement("rdf-adapter");
    el.setAttribute("no-shadow", "");
    document.body.appendChild(el);

    await new Promise((r) => setTimeout(r, 50));

    expect(fetchRdf).toHaveBeenCalledWith("https://example.org/meta.ttl");

    // Cleanup
    link.remove();
  });

  it("dispatches rdf-loaded event with triples after successful parse", async () => {
    fetchRdf.mockResolvedValueOnce({
      text: "",
      format: "text/turtle",
      url: "https://example.org/data.ttl",
    });
    parseRdf.mockResolvedValueOnce([
      makeQuad("https://example.org/s", "http://purl.org/dc/terms/title", "Hi"),
    ]);

    el = document.createElement("rdf-adapter");
    el.setAttribute("no-shadow", "");
    el.setAttribute("src", "https://example.org/data.ttl");

    let loadedDetail = null;
    el.addEventListener("rdf-loaded", (e) => {
      loadedDetail = e.detail;
    });

    document.body.appendChild(el);
    await new Promise((r) => setTimeout(r, 50));

    expect(loadedDetail).not.toBeNull();
    expect(loadedDetail.triples).toHaveLength(1);
    expect(loadedDetail.triples[0].subject).toBe("https://example.org/s");
    expect(loadedDetail.triples[0].predicate).toBe(
      "http://purl.org/dc/terms/title"
    );
    expect(loadedDetail.triples[0].object).toBe("Hi");
  });

  it("dispatches rdf-error event when fetchRdf rejects", async () => {
    fetchRdf.mockRejectedValueOnce(new Error("fetch failed"));

    el = document.createElement("rdf-adapter");
    el.setAttribute("no-shadow", "");
    el.setAttribute("src", "https://example.org/broken.ttl");

    let errorDetail = null;
    el.addEventListener("rdf-error", (e) => {
      errorDetail = e.detail;
    });

    document.body.appendChild(el);
    await new Promise((r) => setTimeout(r, 50));

    expect(errorDetail).not.toBeNull();
    expect(errorDetail.message).toContain("fetch failed");
  });
});

