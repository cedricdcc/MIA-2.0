/**
 * dom-adapter.test.js
 *
 * Unit tests for src/utils/dom-adapter.js
 * Runs in a jsdom environment via Vitest.
 */

import { describe, it, expect, beforeEach } from "vitest";
import {
  renderTriples,
  clearContent,
  showLoading,
  hideLoading,
  showError,
} from "../../src/utils/dom-adapter.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeContainer() {
  const div = document.createElement("div");
  document.body.appendChild(div);
  return div;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("renderTriples", () => {
  let container;

  beforeEach(() => {
    container = makeContainer();
  });

  it("renders a <dl> with dt/dd pairs", () => {
    renderTriples(container, [
      {
        predicate: "http://purl.org/dc/terms/title",
        object: "My Dataset",
      },
    ]);

    const dl = container.querySelector("dl.rdf-triples");
    expect(dl).not.toBeNull();
    const dt = dl.querySelector("dt.rdf-predicate");
    const dd = dl.querySelector("dd.rdf-object");
    expect(dt).not.toBeNull();
    expect(dd).not.toBeNull();
    expect(dd.textContent).toBe("My Dataset");
  });

  it("renders URIs as anchor elements", () => {
    renderTriples(container, [
      {
        predicate: "https://schema.org/url",
        object: "https://example.org/page",
      },
    ]);

    const a = container.querySelector("a");
    expect(a).not.toBeNull();
    expect(a.href).toBe("https://example.org/page");
  });

  it("renders plain literals as text", () => {
    renderTriples(container, [
      { predicate: "http://purl.org/dc/terms/title", object: "Plain text" },
    ]);

    const dd = container.querySelector("dd.rdf-object");
    expect(dd.querySelector("a")).toBeNull();
    expect(dd.textContent).toBe("Plain text");
  });

  it("does nothing when triples array is empty", () => {
    renderTriples(container, []);
    expect(container.querySelector("dl")).toBeNull();
  });

  it("does nothing when target is null", () => {
    expect(() => renderTriples(null, [{ predicate: "p", object: "o" }])).not.toThrow();
  });
});

describe("clearContent", () => {
  it("removes rdf-triples elements", () => {
    const container = makeContainer();
    renderTriples(container, [{ predicate: "p", object: "o" }]);
    expect(container.querySelector(".rdf-triples")).not.toBeNull();

    clearContent(container);
    expect(container.querySelector(".rdf-triples")).toBeNull();
  });
});

describe("showLoading / hideLoading", () => {
  it("adds and removes the loading indicator", () => {
    const container = makeContainer();
    showLoading(container);
    expect(container.querySelector(".rdf-loading")).not.toBeNull();

    hideLoading(container);
    expect(container.querySelector(".rdf-loading")).toBeNull();
  });
});

describe("showError", () => {
  it("adds an error element with the message", () => {
    const container = makeContainer();
    showError(container, "Something went wrong");

    const el = container.querySelector(".rdf-error");
    expect(el).not.toBeNull();
    expect(el.textContent).toBe("Something went wrong");
  });
});
