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

  it("fills {predicate-class} and {object-is-uri} placeholders", async () => {    const tmpl = document.createElement("template");
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

  // ---- {object-type}, {object-datatype}, {object-lang} tokens ---------------

  it("fills {object-type} with 'string' for plain literals", async () => {
    const tmpl = document.createElement("template");
    tmpl.id = "otype-tmpl";
    tmpl.innerHTML = `<div class="t" data-type="{object-type}">{object}</div>`;
    document.body.appendChild(tmpl);

    el.setAttribute("template-id", "otype-tmpl");
    fireRdfLoaded(el, [
      { subject: "https://s", predicate: "https://p", object: "hello" },
    ]);
    await updateComplete(el);

    const div = el.shadowRoot.querySelector(".rdf-template-host .t");
    expect(div).not.toBeNull();
    expect(div.dataset.type).toBe("string");

    tmpl.remove();
  });

  it("fills {object-type} with 'uri' for URI objects", async () => {
    const tmpl = document.createElement("template");
    tmpl.id = "otype-uri-tmpl";
    tmpl.innerHTML = `<div class="t" data-type="{object-type}"></div>`;
    document.body.appendChild(tmpl);

    el.setAttribute("template-id", "otype-uri-tmpl");
    fireRdfLoaded(el, [
      { subject: "https://s", predicate: "https://p", object: "https://example.org/x" },
    ]);
    await updateComplete(el);

    const div = el.shadowRoot.querySelector(".rdf-template-host .t");
    expect(div.dataset.type).toBe("uri");

    tmpl.remove();
  });

  it("fills {object-type} with 'integer' when objectDatatype contains 'integer'", async () => {
    const tmpl = document.createElement("template");
    tmpl.id = "otype-int-tmpl";
    tmpl.innerHTML = `<div class="t" data-type="{object-type}">{object}</div>`;
    document.body.appendChild(tmpl);

    el.setAttribute("template-id", "otype-int-tmpl");
    fireRdfLoaded(el, [
      {
        subject: "https://s",
        predicate: "https://p",
        object: "42",
        objectDatatype: "http://www.w3.org/2001/XMLSchema#integer",
      },
    ]);
    await updateComplete(el);

    const div = el.shadowRoot.querySelector(".rdf-template-host .t");
    expect(div.dataset.type).toBe("integer");

    tmpl.remove();
  });

  it("fills {object-datatype} with the datatype URI", async () => {
    const tmpl = document.createElement("template");
    tmpl.id = "odatatype-tmpl";
    tmpl.innerHTML = `<div class="t" data-dt="{object-datatype}"></div>`;
    document.body.appendChild(tmpl);

    el.setAttribute("template-id", "odatatype-tmpl");
    fireRdfLoaded(el, [
      {
        subject: "https://s",
        predicate: "https://p",
        object: "2024-01-15",
        objectDatatype: "http://www.w3.org/2001/XMLSchema#date",
      },
    ]);
    await updateComplete(el);

    const div = el.shadowRoot.querySelector(".rdf-template-host .t");
    expect(div.dataset.dt).toBe("http://www.w3.org/2001/XMLSchema#date");

    tmpl.remove();
  });

  it("fills {object-lang} with the language tag", async () => {
    const tmpl = document.createElement("template");
    tmpl.id = "olang-tmpl";
    tmpl.innerHTML = `<div class="t" data-lang="{object-lang}"></div>`;
    document.body.appendChild(tmpl);

    el.setAttribute("template-id", "olang-tmpl");
    fireRdfLoaded(el, [
      {
        subject: "https://s",
        predicate: "https://p",
        object: "Hello",
        objectLang: "en",
      },
    ]);
    await updateComplete(el);

    const div = el.shadowRoot.querySelector(".rdf-template-host .t");
    expect(div.dataset.lang).toBe("en");

    tmpl.remove();
  });

  it("fills {object-type} with 'datetime' for ISO date-time heuristic", async () => {
    const tmpl = document.createElement("template");
    tmpl.id = "otype-dt-tmpl";
    tmpl.innerHTML = `<div class="t" data-type="{object-type}"></div>`;
    document.body.appendChild(tmpl);

    el.setAttribute("template-id", "otype-dt-tmpl");
    fireRdfLoaded(el, [
      { subject: "https://s", predicate: "https://p", object: "2024-03-15T10:00:00" },
    ]);
    await updateComplete(el);

    const div = el.shadowRoot.querySelector(".rdf-template-host .t");
    expect(div.dataset.type).toBe("datetime");

    tmpl.remove();
  });

  // ---- Block-template mode (data-rdf-predicate) ----------------------------

  it("block template: renders each annotated element with its matching predicate", async () => {
    const tmpl = document.createElement("template");
    tmpl.id = "block-basic-tmpl";
    tmpl.innerHTML = `
      <h2 class="block-title" data-rdf-predicate="http://purl.org/dc/terms/title">{object}</h2>
      <p class="block-desc" data-rdf-predicate="http://purl.org/dc/terms/description">{object}</p>
    `;
    document.body.appendChild(tmpl);

    el.setAttribute("template-id", "block-basic-tmpl");
    fireRdfLoaded(el, [
      { subject: "https://s", predicate: "http://purl.org/dc/terms/title", object: "My Title" },
      { subject: "https://s", predicate: "http://purl.org/dc/terms/description", object: "My Desc" },
    ]);
    await updateComplete(el);

    const host = el.shadowRoot.querySelector(".rdf-template-host");
    const title = host.querySelector("h2.block-title");
    const desc  = host.querySelector("p.block-desc");
    expect(title).not.toBeNull();
    expect(title.textContent.trim()).toBe("My Title");
    expect(desc).not.toBeNull();
    expect(desc.textContent.trim()).toBe("My Desc");

    tmpl.remove();
  });

  it("block template: repeats annotated element for multi-valued (list) predicates", async () => {
    const tmpl = document.createElement("template");
    tmpl.id = "block-list-tmpl";
    tmpl.innerHTML = `
      <a class="block-member" data-rdf-predicate="http://www.w3.org/2004/02/skos/core#member"
         href="{object}">{object-short}</a>
    `;
    document.body.appendChild(tmpl);

    el.setAttribute("template-id", "block-list-tmpl");
    fireRdfLoaded(el, [
      { subject: "https://s", predicate: "http://www.w3.org/2004/02/skos/core#member", object: "https://example.org/1" },
      { subject: "https://s", predicate: "http://www.w3.org/2004/02/skos/core#member", object: "https://example.org/2" },
      { subject: "https://s", predicate: "http://www.w3.org/2004/02/skos/core#member", object: "https://example.org/3" },
    ]);
    await updateComplete(el);

    const members = el.shadowRoot.querySelectorAll(".rdf-template-host a.block-member");
    expect(members).toHaveLength(3);
    expect(members[0].getAttribute("href")).toBe("https://example.org/1");
    expect(members[2].getAttribute("href")).toBe("https://example.org/3");

    tmpl.remove();
  });

  it("block template: removes annotated element when no matching triples", async () => {
    const tmpl = document.createElement("template");
    tmpl.id = "block-remove-tmpl";
    tmpl.innerHTML = `
      <h2 class="block-title" data-rdf-predicate="http://purl.org/dc/terms/title">{object}</h2>
      <p class="block-desc" data-rdf-predicate="http://purl.org/dc/terms/description">{object}</p>
    `;
    document.body.appendChild(tmpl);

    el.setAttribute("template-id", "block-remove-tmpl");
    // Only provide title, no description
    fireRdfLoaded(el, [
      { subject: "https://s", predicate: "http://purl.org/dc/terms/title", object: "Title Only" },
    ]);
    await updateComplete(el);

    const host = el.shadowRoot.querySelector(".rdf-template-host");
    expect(host.querySelector("h2.block-title")).not.toBeNull();
    // Description element removed because no matching triple exists
    expect(host.querySelector("p.block-desc")).toBeNull();

    tmpl.remove();
  });

  it("block template: data-rdf-filter-lang filters by language tag", async () => {
    const tmpl = document.createElement("template");
    tmpl.id = "block-lang-tmpl";
    tmpl.innerHTML = `
      <p class="title-en" data-rdf-predicate="http://purl.org/dc/terms/title"
         data-rdf-filter-lang="en">{object}</p>
      <p class="title-fr" data-rdf-predicate="http://purl.org/dc/terms/title"
         data-rdf-filter-lang="fr">{object}</p>
    `;
    document.body.appendChild(tmpl);

    el.setAttribute("template-id", "block-lang-tmpl");
    fireRdfLoaded(el, [
      { subject: "https://s", predicate: "http://purl.org/dc/terms/title", object: "Hello", objectLang: "en" },
      { subject: "https://s", predicate: "http://purl.org/dc/terms/title", object: "Bonjour", objectLang: "fr" },
    ]);
    await updateComplete(el);

    const host = el.shadowRoot.querySelector(".rdf-template-host");
    const enEl = host.querySelector("p.title-en");
    const frEl = host.querySelector("p.title-fr");
    expect(enEl).not.toBeNull();
    expect(enEl.textContent.trim()).toBe("Hello");
    expect(frEl).not.toBeNull();
    expect(frEl.textContent.trim()).toBe("Bonjour");

    tmpl.remove();
  });

  // ---- Direct property setter ----------------------------------------------

  it("renders when triples property is set directly", async () => {
    el.triples = makeTriples(["http://purl.org/dc/terms/title", "Direct"]);
    await updateComplete(el);

    expect(el.shadowRoot.querySelector(".rdf-list")).not.toBeNull();
    const dds = el.shadowRoot.querySelectorAll("dd");
    expect(dds[0].textContent.trim()).toBe("Direct");
  });

  // ---- Property path (data-rdf-path) ---------------------------------------

  it("block template: data-rdf-path resolves two-hop property path", async () => {
    const tmpl = document.createElement("template");
    tmpl.id = "block-path-tmpl";
    tmpl.innerHTML = `<span class="creator-name" data-rdf-path="http://purl.org/dc/terms/creator http://xmlns.com/foaf/0.1/name">{object}</span>`;
    document.body.appendChild(tmpl);

    el.setAttribute("template-id", "block-path-tmpl");
    // Dispatch with allTriples so the second hop can be resolved
    el.dispatchEvent(new CustomEvent("rdf-loaded", {
      detail: {
        triples: [
          { subject: "https://s", predicate: "http://purl.org/dc/terms/creator", object: "https://creator-uri" },
        ],
        allTriples: [
          { subject: "https://s",           predicate: "http://purl.org/dc/terms/creator", object: "https://creator-uri" },
          { subject: "https://creator-uri", predicate: "http://xmlns.com/foaf/0.1/name",   object: "Alice Smith" },
        ],
      },
      bubbles: true,
      composed: true,
    }));
    await updateComplete(el);

    const host = el.shadowRoot.querySelector(".rdf-template-host");
    const span = host.querySelector("span.creator-name");
    expect(span).not.toBeNull();
    expect(span.textContent.trim()).toBe("Alice Smith");

    tmpl.remove();
  });

  it("block template: data-rdf-path removes element when path has no match", async () => {
    const tmpl = document.createElement("template");
    tmpl.id = "block-path-nomatch-tmpl";
    tmpl.innerHTML = `<span class="missing" data-rdf-path="http://example.org/unknown http://example.org/name">{object}</span>`;
    document.body.appendChild(tmpl);

    el.setAttribute("template-id", "block-path-nomatch-tmpl");
    el.dispatchEvent(new CustomEvent("rdf-loaded", {
      detail: {
        triples:    [{ subject: "https://s", predicate: "http://purl.org/dc/terms/title", object: "T" }],
        allTriples: [{ subject: "https://s", predicate: "http://purl.org/dc/terms/title", object: "T" }],
      },
      bubbles: true, composed: true,
    }));
    await updateComplete(el);

    const host = el.shadowRoot.querySelector(".rdf-template-host");
    expect(host.querySelector("span.missing")).toBeNull();

    tmpl.remove();
  });

  // ---- Sub-blocks (nested annotated elements) --------------------------------

  it("block template: nested annotated element (sub-block) resolved from parent match object", async () => {
    const tmpl = document.createElement("template");
    tmpl.id = "block-subblock-tmpl";
    tmpl.innerHTML = `
      <div class="section-card"
           data-rdf-predicate="http://www.w3.org/2004/02/skos/core#member">
        <span class="member-label"
              data-rdf-predicate="http://www.w3.org/2000/01/rdf-schema#label">{object}</span>
      </div>
    `;
    document.body.appendChild(tmpl);

    el.setAttribute("template-id", "block-subblock-tmpl");
    el.dispatchEvent(new CustomEvent("rdf-loaded", {
      detail: {
        // Outer scope: collection has 2 members
        triples: [
          { subject: "https://col", predicate: "http://www.w3.org/2004/02/skos/core#member", object: "https://member-a" },
          { subject: "https://col", predicate: "http://www.w3.org/2004/02/skos/core#member", object: "https://member-b" },
        ],
        // Full graph: each member has a label
        allTriples: [
          { subject: "https://col",      predicate: "http://www.w3.org/2004/02/skos/core#member",    object: "https://member-a" },
          { subject: "https://col",      predicate: "http://www.w3.org/2004/02/skos/core#member",    object: "https://member-b" },
          { subject: "https://member-a", predicate: "http://www.w3.org/2000/01/rdf-schema#label",    object: "Member A" },
          { subject: "https://member-b", predicate: "http://www.w3.org/2000/01/rdf-schema#label",    object: "Member B" },
        ],
      },
      bubbles: true, composed: true,
    }));
    await updateComplete(el);

    const host = el.shadowRoot.querySelector(".rdf-template-host");
    const cards = host.querySelectorAll(".section-card");
    expect(cards).toHaveLength(2);
    const labels = host.querySelectorAll(".member-label");
    expect(labels).toHaveLength(2);
    const texts = [...labels].map(l => l.textContent.trim()).sort();
    expect(texts).toEqual(["Member A", "Member B"]);

    tmpl.remove();
  });

  // ---- Image type detection -------------------------------------------------

  it("{object-type} is 'image' for URI with image file extension", async () => {
    const tmpl = document.createElement("template");
    tmpl.id = "block-image-tmpl";
    tmpl.innerHTML = `<div class="img-wrap" data-rdf-predicate="http://xmlns.com/foaf/0.1/depiction" data-type="{object-type}"></div>`;
    document.body.appendChild(tmpl);

    el.setAttribute("template-id", "block-image-tmpl");
    fireRdfLoaded(el, [
      { subject: "https://s", predicate: "http://xmlns.com/foaf/0.1/depiction", object: "https://example.org/photo.jpg" },
    ]);
    await updateComplete(el);

    const host = el.shadowRoot.querySelector(".rdf-template-host");
    const wrap = host.querySelector(".img-wrap");
    expect(wrap).not.toBeNull();
    expect(wrap.getAttribute("data-type")).toBe("image");

    tmpl.remove();
  });
});
