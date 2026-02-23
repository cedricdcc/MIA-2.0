/**
 * rdf-display.js
 *
 * <rdf-display> – a Lit-based wrapper component that receives parsed RDF data
 * (via the `rdf-loaded` CustomEvent from a slotted <rdf-adapter>) and renders
 * it in a configurable presentation mode.
 *
 * Attributes:
 *   display-mode     – "list" (default) | "grid" | "table"
 *   template-id      – ID of a <template> element in the document; when set, each
 *                      triple is rendered by cloning that template and filling in
 *                      {subject}, {predicate}, {predicate-short}, {predicate-class},
 *                      {object}, {object-short}, {object-is-uri} placeholders.
 *   template-styles  – ID of a <style> element in the document; its CSS is injected
 *                      into the shadow root so it can style the cloned template content.
 *
 * Events listened for (bubbling from slotted children):
 *   rdf-loaded  – sets internal `triples` and triggers re-render
 *   rdf-error   – displays the error message
 *
 * Usage – composition with rdf-adapter:
 *   <rdf-display display-mode="grid">
 *     <rdf-adapter src="/data.ttl"></rdf-adapter>
 *   </rdf-display>
 *
 * Usage – direct event:
 *   display.triples = [{ subject, predicate, object }, …];
 */

import { LitElement, html, css } from "lit";
import { isUri, shortenUri } from "../utils/rdf-utils.js";

export class RdfDisplay extends LitElement {
  // ---------------------------------------------------------------------------
  // Styles
  // ---------------------------------------------------------------------------

  static styles = css`
    :host {
      display: block;
      font-family: sans-serif;
      font-size: 0.95rem;
      color: #222;
    }

    /* ---- Hidden slot: keeps the slotted rdf-adapter running but invisible -- */
    slot {
      display: none;
    }

    /* ---- List mode (default) ---------------------------------------------- */
    .rdf-list dl {
      margin: 0;
      padding: 0;
    }
    .rdf-list dt {
      font-weight: bold;
      color: #555;
      margin-top: 0.5rem;
      font-size: 0.85em;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .rdf-list dd {
      margin: 0 0 0 1rem;
      color: #222;
      word-break: break-word;
    }

    /* ---- Grid mode --------------------------------------------------------- */
    .rdf-grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
      gap: 0.75rem;
    }
    .rdf-card {
      border: 1px solid #ddd;
      border-radius: 4px;
      padding: 0.75rem;
      background: #fafafa;
    }
    .rdf-card .predicate {
      font-weight: bold;
      font-size: 0.8em;
      color: #555;
      margin-bottom: 0.25rem;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .rdf-card .object {
      color: #222;
      word-break: break-word;
    }

    /* ---- Table mode -------------------------------------------------------- */
    .rdf-table {
      width: 100%;
      border-collapse: collapse;
      font-size: 0.9em;
    }
    .rdf-table th,
    .rdf-table td {
      text-align: left;
      padding: 0.5rem 0.75rem;
      border: 1px solid #ddd;
    }
    .rdf-table th {
      background: #f0f0f0;
      font-weight: bold;
      color: #444;
    }
    .rdf-table tr:nth-child(even) td {
      background: #f9f9f9;
    }

    /* ---- Shared ------------------------------------------------------------ */
    a {
      color: #2c5f8a;
      text-decoration: none;
    }
    a:hover {
      text-decoration: underline;
    }
    .rdf-empty {
      color: #888;
      font-style: italic;
    }
    .rdf-error {
      color: #c00;
    }
  `;

  // ---------------------------------------------------------------------------
  // Reactive properties
  // ---------------------------------------------------------------------------

  static properties = {
    /** Array of { subject, predicate, object } plain-string objects. */
    triples: { type: Array },
    /** "list" | "grid" | "table" */
    displayMode: { type: String, attribute: "display-mode" },
    /** ID of a <template> element for custom per-triple rendering. */
    templateId: { type: String, attribute: "template-id" },
    /**
     * ID of a <style> element in the page.  Its CSS text is injected into the
     * shadow root so it can style the cloned template content (which lives
     * inside the shadow DOM and is therefore not reachable by page-level CSS).
     */
    templateStyles: { type: String, attribute: "template-styles" },
    _error: { state: true },
  };

  // ---------------------------------------------------------------------------
  // Lifecycle
  // ---------------------------------------------------------------------------

  constructor() {
    super();
    this.triples = [];
    this.displayMode = "list";
    this.templateId = null;
    this.templateStyles = null;
    this._error = null;

    this._handleRdfLoaded = this._handleRdfLoaded.bind(this);
    this._handleRdfError = this._handleRdfError.bind(this);
  }

  connectedCallback() {
    super.connectedCallback();
    // Register on the host element so events bubbling from any slotted
    // <rdf-adapter> child are caught. The adapter's _load() is always async
    // (network fetch + parse), so these listeners are in place well before
    // any rdf-loaded / rdf-error events can fire.
    this.addEventListener("rdf-loaded", this._handleRdfLoaded);
    this.addEventListener("rdf-error", this._handleRdfError);
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    this.removeEventListener("rdf-loaded", this._handleRdfLoaded);
    this.removeEventListener("rdf-error", this._handleRdfError);
  }

  // ---------------------------------------------------------------------------
  // Event handlers
  // ---------------------------------------------------------------------------

  _handleRdfLoaded(event) {
    this._error = null;
    this.triples = event.detail?.triples ?? [];
  }

  _handleRdfError(event) {
    this._error = event.detail?.message ?? "An unknown error occurred";
  }

  // ---------------------------------------------------------------------------
  // Render helpers
  // ---------------------------------------------------------------------------

  _renderValue(value) {
    if (isUri(value)) {
      return html`<a href="${value}" target="_blank" rel="noopener noreferrer"
        >${shortenUri(value)}</a
      >`;
    }
    return html`${value}`;
  }

  _renderList() {
    return html`
      <div class="rdf-list">
        <dl>
          ${this.triples.map(
            ({ predicate, object }) => html`
              <dt title="${predicate}">${shortenUri(predicate)}</dt>
              <dd>${this._renderValue(object)}</dd>
            `
          )}
        </dl>
      </div>
    `;
  }

  _renderGrid() {
    return html`
      <div class="rdf-grid">
        ${this.triples.map(
          ({ predicate, object }) => html`
            <div class="rdf-card">
              <div class="predicate" title="${predicate}">
                ${shortenUri(predicate)}
              </div>
              <div class="object">${this._renderValue(object)}</div>
            </div>
          `
        )}
      </div>
    `;
  }

  _renderTable() {
    return html`
      <table class="rdf-table">
        <thead>
          <tr>
            <th>Predicate</th>
            <th>Object</th>
          </tr>
        </thead>
        <tbody>
          ${this.triples.map(
            ({ predicate, object }) => html`
              <tr>
                <td title="${predicate}">${shortenUri(predicate)}</td>
                <td>${this._renderValue(object)}</td>
              </tr>
            `
          )}
        </tbody>
      </table>
    `;
  }

  /**
   * When `template-id` is set, return a placeholder div that `updated()`
   * will fill with cloned template instances.
   */
  _renderWithTemplate() {
    return html`<div class="rdf-template-host"></div>`;
  }

  // ---------------------------------------------------------------------------
  // Main render
  // ---------------------------------------------------------------------------

  render() {
    return html`
      <!-- Always keep the slot so rdf-adapter stays connected (hidden by CSS) -->
      <slot></slot>

      ${this._error
        ? html`<span class="rdf-error">${this._error}</span>`
        : !this.triples.length
        ? html`<span class="rdf-empty">No RDF data loaded yet.</span>`
        : this.templateId
        ? this._renderWithTemplate()
        : this.displayMode === "grid"
        ? this._renderGrid()
        : this.displayMode === "table"
        ? this._renderTable()
        : this._renderList()}
    `;
  }

  // ---------------------------------------------------------------------------
  // Post-render: populate custom template host
  // ---------------------------------------------------------------------------

  updated() {
    // Inject custom template styles into the shadow root (idempotent).
    this._injectTemplateStyles();

    if (!this.templateId || !this.triples.length) return;

    const host = this.shadowRoot?.querySelector(".rdf-template-host");
    if (!host) return;

    host.innerHTML = "";

    const tmpl = document.getElementById(this.templateId);
    if (!tmpl) {
      host.textContent = `Template #${this.templateId} not found.`;
      return;
    }

    for (const triple of this.triples) {
      const clone = tmpl.content.cloneNode(true);
      _fillPlaceholders(clone, {
        "{subject}": triple.subject ?? "",
        "{predicate}": triple.predicate ?? "",
        "{predicate-short}": shortenUri(triple.predicate ?? ""),
        "{predicate-class}": _toCssClass(triple.predicate ?? ""),
        "{object}": triple.object ?? "",
        "{object-short}": shortenUri(triple.object ?? ""),
        "{object-is-uri}": isUri(triple.object ?? "") ? "true" : "false",
      });
      host.appendChild(clone);
    }
  }

  // ---------------------------------------------------------------------------
  // Inject page <style> into shadow root for template styling
  // ---------------------------------------------------------------------------

  /**
   * If `template-styles` is set, inject the referenced <style> element's CSS
   * into the shadow root.  The injection is idempotent (runs once per unique
   * style ID).
   */
  _injectTemplateStyles() {
    if (!this.templateStyles || !this.shadowRoot) return;
    const markerAttr = `data-injected-styles`;
    const markerVal = this.templateStyles;
    if (this.shadowRoot.querySelector(`[${markerAttr}="${markerVal}"]`)) return;
    const sourceEl = document.getElementById(this.templateStyles);
    if (!sourceEl) return;
    const style = document.createElement("style");
    style.setAttribute(markerAttr, markerVal);
    style.textContent = sourceEl.textContent;
    this.shadowRoot.prepend(style);
  }
}

// ---------------------------------------------------------------------------
// Helper: convert a URI to a CSS-safe class name
// e.g. "http://purl.org/dc/terms/title" → "title"
//      "http://www.w3.org/2004/02/skos/core#member" → "member"
// ---------------------------------------------------------------------------

function _toCssClass(uri) {
  const short = shortenUri(uri);
  // One pass: non-alphanumeric chars → "-", then trim leading/trailing "-"
  const cls = short.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  return cls || "rdf-prop";
}

// ---------------------------------------------------------------------------
// Helper: fill {placeholder} tokens in a DocumentFragment's text nodes
// and element attribute values.
// ---------------------------------------------------------------------------

function _fillPlaceholders(fragment, replacements) {
  // Text nodes
  const walker = document.createTreeWalker(fragment, NodeFilter.SHOW_TEXT);
  const textNodes = [];
  while (walker.nextNode()) textNodes.push(walker.currentNode);

  for (const node of textNodes) {
    let text = node.nodeValue;
    for (const [key, val] of Object.entries(replacements)) {
      text = text.split(key).join(val);
    }
    node.nodeValue = text;
  }

  // Attribute values (e.g. href="{object}")
  const elements = fragment.querySelectorAll("*");
  for (const el of elements) {
    for (const attr of Array.from(el.attributes)) {
      let value = attr.value;
      for (const [key, val] of Object.entries(replacements)) {
        value = value.split(key).join(val);
      }
      if (value !== attr.value) attr.value = value;
    }
  }
}

// ---------------------------------------------------------------------------
// Register
// ---------------------------------------------------------------------------

if (!customElements.get("rdf-display")) {
  customElements.define("rdf-display", RdfDisplay);
}

export default RdfDisplay;
