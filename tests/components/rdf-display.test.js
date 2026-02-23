/**
 * rdf-display.test.js
 *
 * Unit tests for the <rdf-display> Lit custom element.
 * Runs in a jsdom environment via Vitest.
 *
 * Tests cover:
 *  - Component registration
 *  - Default list rendering on rdf-loaded event
 *  - Grid and table display modes
 *  - Custom <template> rendering (template-id attribute)
 *  - Error display on rdf-error event
 *  - Attribute-based display-mode changes
 *  - Direct triples property setter
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import "../../src/components/rdf-display.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Wait for Lit to finish its async render cycle. */
async function updateComplete(el) {
  return el.updateComplete;
}

function makeTriples(...pairs) {
  return pairs.map(([p, o], i) => ({
    subject: `https://example.org/s${i}`,
    predicate: p,
    object: o,
  }));
}

function fireRdfLoaded(target, triples) {
  target.dispatchEvent(
    new CustomEvent("rdf-loaded", {
      detail: { triples },
      bubbles: true,
      composed: true,
    })
  );
}

function fireRdfError(target, message) {
  target.dispatchEvent(
    new CustomEvent("rdf-error", {
      detail: { message },
      bubbles: true,
      composed: true,
    })
  );
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("<rdf-display>", () => {
  let el;

  beforeEach(async () => {
    el = document.createElement("rdf-display");
    document.body.appendChild(el);
    await updateComplete(el);
  });

  afterEach(() => {
    if (el && el.parentNode) el.parentNode.removeChild(el);
  });

  // ---- Registration --------------------------------------------------------

  it("is registered as a custom element", () => {
    expect(customElements.get("rdf-display")).toBeDefined();
  });

  // ---- Default state -------------------------------------------------------

  it("shows 'no data' message when no triples loaded", async () => {
    await updateComplete(el);
    expect(el.shadowRoot.querySelector(".rdf-empty")).not.toBeNull();
  });

  // ---- List mode (default) -------------------------------------------------

  it("renders a list on rdf-loaded event (default mode)", async () => {
    const triples = makeTriples(
      ["http://purl.org/dc/terms/title", "Hello World"],
      ["https://schema.org/url", "https://example.org/page"]
    );
    fireRdfLoaded(el, triples);
    await updateComplete(el);

    const shadow = el.shadowRoot;
    expect(shadow.querySelector(".rdf-list")).not.toBeNull();

    const dts = shadow.querySelectorAll("dt");
    const dds = shadow.querySelectorAll("dd");
    expect(dts).toHaveLength(2);
    expect(dds).toHaveLength(2);

    // First item: literal object rendered as text
    expect(dds[0].textContent.trim()).toBe("Hello World");

    // Second item: URI object rendered as anchor
    const anchor = dds[1].querySelector("a");
    expect(anchor).not.toBeNull();
    expect(anchor.href).toBe("https://example.org/page");
  });

  it("shortens predicate URIs in list mode", async () => {
    fireRdfLoaded(el, makeTriples(["http://purl.org/dc/terms/title", "X"]));
    await updateComplete(el);

    const dt = el.shadowRoot.querySelector("dt");
    expect(dt.textContent.trim()).toBe("title");
    expect(dt.title).toBe("http://purl.org/dc/terms/title");
  });

  // ---- Grid mode -----------------------------------------------------------

  it("renders cards in grid mode", async () => {
    el.setAttribute("display-mode", "grid");
    fireRdfLoaded(
      el,
      makeTriples(
        ["http://purl.org/dc/terms/title", "Dataset"],
        ["https://schema.org/name", "Name"]
      )
    );
    await updateComplete(el);

    expect(el.shadowRoot.querySelector(".rdf-grid")).not.toBeNull();
    const cards = el.shadowRoot.querySelectorAll(".rdf-card");
    expect(cards).toHaveLength(2);
    expect(cards[0].querySelector(".predicate").textContent.trim()).toBe(
      "title"
    );
    expect(cards[0].querySelector(".object").textContent.trim()).toBe("Dataset");
  });

  // ---- Table mode ----------------------------------------------------------

  it("renders a table in table mode", async () => {
    el.setAttribute("display-mode", "table");
    fireRdfLoaded(
      el,
      makeTriples(["http://purl.org/dc/terms/title", "My Title"])
    );
    await updateComplete(el);

    const table = el.shadowRoot.querySelector("table.rdf-table");
    expect(table).not.toBeNull();

    const rows = table.querySelectorAll("tbody tr");
    expect(rows).toHaveLength(1);
    expect(rows[0].querySelectorAll("td")[0].textContent.trim()).toBe("title");
    expect(rows[0].querySelectorAll("td")[1].textContent.trim()).toBe(
      "My Title"
    );
  });

  // ---- Template mode -------------------------------------------------------

  it("renders using a custom <template> when template-id is set", async () => {
    // Create a <template> in the document
    const tmpl = document.createElement("template");
    tmpl.id = "my-triple-tmpl";
    tmpl.innerHTML = `<div class="custom-row"><b>{predicate-short}</b>: {object}</div>`;
    document.body.appendChild(tmpl);

    el.setAttribute("template-id", "my-triple-tmpl");
    fireRdfLoaded(
      el,
      makeTriples(["http://purl.org/dc/terms/title", "Template Value"])
    );
    await updateComplete(el);

    const host = el.shadowRoot.querySelector(".rdf-template-host");
    expect(host).not.toBeNull();

    const row = host.querySelector(".custom-row");
    expect(row).not.toBeNull();
    expect(row.textContent).toContain("title");
    expect(row.textContent).toContain("Template Value");

    // Cleanup
    tmpl.remove();
  });

  it("fills {predicate-class} and {object-is-uri} placeholders", async () => {
    const tmpl = document.createElement("template");
    tmpl.id = "placeholder-tmpl";
    tmpl.innerHTML = `<div class="t {predicate-class}" data-is-uri="{object-is-uri}">
      <span class="obj-text">{object}</span>
      <a class="obj-link" href="{object}">{object-short}</a>
    </div>`;
    document.body.appendChild(tmpl);

    el.setAttribute("template-id", "placeholder-tmpl");
    fireRdfLoaded(el, [
      {
        subject: "https://example.org/s",
        predicate: "http://purl.org/dc/terms/title",
        object: "My Title",
      },
      {
        subject: "https://example.org/s",
        predicate: "http://www.w3.org/2004/02/skos/core#member",
        object: "https://example.org/dataset/1",
      },
    ]);
    await updateComplete(el);

    const host = el.shadowRoot.querySelector(".rdf-template-host");

    // First triple: literal object
    const titleDiv = host.querySelector(".t.title");
    expect(titleDiv).not.toBeNull();
    expect(titleDiv.dataset.isUri).toBe("false");
    expect(titleDiv.querySelector(".obj-text").textContent).toBe("My Title");

    // Second triple: URI object
    const memberDiv = host.querySelector(".t.member");
    expect(memberDiv).not.toBeNull();
    expect(memberDiv.dataset.isUri).toBe("true");
    expect(memberDiv.querySelector(".obj-link").getAttribute("href")).toBe(
      "https://example.org/dataset/1"
    );
    expect(memberDiv.querySelector(".obj-link").textContent).toBe("1");

    tmpl.remove();
  });

  it("injects template-styles into the shadow root", async () => {
    const tmpl = document.createElement("template");
    tmpl.id = "styled-tmpl";
    tmpl.innerHTML = `<div class="triple {predicate-class}">{object}</div>`;
    document.body.appendChild(tmpl);

    const styleEl = document.createElement("style");
    styleEl.id = "styled-tmpl-css";
    styleEl.textContent = `.triple.title { color: red; }`;
    document.body.appendChild(styleEl);

    el.setAttribute("template-id", "styled-tmpl");
    el.setAttribute("template-styles", "styled-tmpl-css");
    fireRdfLoaded(
      el,
      makeTriples(["http://purl.org/dc/terms/title", "Styled"])
    );
    await updateComplete(el);

    const injected = el.shadowRoot.querySelector(
      "[data-injected-styles='styled-tmpl-css']"
    );
    expect(injected).not.toBeNull();
    expect(injected.textContent).toContain(".triple.title");

    tmpl.remove();
    styleEl.remove();
  });

  it("does not duplicate injected styles on re-render", async () => {
    const tmpl = document.createElement("template");
    tmpl.id = "nodup-tmpl";
    tmpl.innerHTML = `<div>{object}</div>`;
    document.body.appendChild(tmpl);

    const styleEl = document.createElement("style");
    styleEl.id = "nodup-css";
    styleEl.textContent = `.triple { color: blue; }`;
    document.body.appendChild(styleEl);

    el.setAttribute("template-id", "nodup-tmpl");
    el.setAttribute("template-styles", "nodup-css");
    fireRdfLoaded(el, makeTriples(["http://example.org/p", "v1"]));
    await updateComplete(el);
    // Trigger a second render
    fireRdfLoaded(el, makeTriples(["http://example.org/p", "v2"]));
    await updateComplete(el);

    const injected = el.shadowRoot.querySelectorAll(
      "[data-injected-styles='nodup-css']"
    );
    expect(injected).toHaveLength(1);

    tmpl.remove();
    styleEl.remove();
  });

  it("shows an error when template-id refers to a missing element", async () => {
    el.setAttribute("template-id", "non-existent-template");
    fireRdfLoaded(el, makeTriples(["http://example.org/p", "v"]));
    await updateComplete(el);

    const host = el.shadowRoot.querySelector(".rdf-template-host");
    expect(host).not.toBeNull();
    expect(host.textContent).toContain("non-existent-template");
  });

  // ---- Error handling ------------------------------------------------------

  it("shows error on rdf-error event", async () => {
    fireRdfError(el, "Network failure");
    await updateComplete(el);

    const errEl = el.shadowRoot.querySelector(".rdf-error");
    expect(errEl).not.toBeNull();
    expect(errEl.textContent).toBe("Network failure");
  });

  it("clears error on subsequent rdf-loaded event", async () => {
    fireRdfError(el, "Oops");
    await updateComplete(el);

    fireRdfLoaded(
      el,
      makeTriples(["http://purl.org/dc/terms/title", "Recovered"])
    );
    await updateComplete(el);

    expect(el.shadowRoot.querySelector(".rdf-error")).toBeNull();
    expect(el.shadowRoot.querySelector(".rdf-list")).not.toBeNull();
  });

  // ---- Direct property setter ----------------------------------------------

  it("renders when triples property is set directly", async () => {
    el.triples = makeTriples(["http://purl.org/dc/terms/title", "Direct"]);
    await updateComplete(el);

    expect(el.shadowRoot.querySelector(".rdf-list")).not.toBeNull();
    const dds = el.shadowRoot.querySelectorAll("dd");
    expect(dds[0].textContent.trim()).toBe("Direct");
  });
});
