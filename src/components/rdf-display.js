/**
 * rdf-display.js
 *
 * <rdf-display> – a Lit-based wrapper component that receives parsed RDF data
 * (via the `rdf-loaded` CustomEvent from a slotted <rdf-adapter>) and renders
 * it in a configurable presentation mode.
 *
 * Attributes:
 *   display-mode     – "list" (default) | "grid" | "table"
 *   template-id      – ID of a <template> element in the document.  Two rendering modes:
 *
 *     LEGACY MODE (no data-rdf-predicate attributes in the template):
 *       The template is cloned once per triple; all {token} placeholders are replaced.
 *
 *     BLOCK MODE (at least one element with data-rdf-predicate="<full-predicate-uri>"
 *                 OR data-rdf-path="<pred1URI> <pred2URI> …" for multi-hop paths):
 *       The template is rendered ONCE for the full triple set.  Each annotated element
 *       is resolved against the triple set at its nesting scope:
 *         • data-rdf-predicate – direct single-step predicate match
 *         • data-rdf-path      – space-separated predicate URIs; multi-hop traversal
 *                                always starts from the subjects in the current scope
 *       Nested annotated elements (sub-blocks) are resolved using the matched object
 *       URI or blank-node ID as the new subject scope, enabling cards-within-cards etc.
 *       Multi-valued predicates / path results automatically repeat the element.
 *       Elements with no matching triples are silently removed.
 *       Optional refinement attributes:
 *         data-rdf-filter-lang="<lang>"       e.g. "en"
 *         data-rdf-filter-type="<type>"       one of uri|image|datetime|date|integer|decimal|boolean|string
 *         data-rdf-filter-contains="<pat>"    case-insensitive regex (or plain substring) match on object value
 *         data-rdf-limit="<N>"                keep only the first N matches (1 = single element)
 *
 *     Supported {token} placeholders in both modes:
 *       {subject}, {predicate}, {predicate-short}, {predicate-class},
 *       {object}, {object-short}, {object-is-uri},
 *       {object-type} (uri|datetime|date|integer|decimal|boolean|string),
 *       {object-datatype} (full XSD datatype URI or empty),
 *       {object-lang} (language tag e.g. "en" or empty)
 *   template-styles  – ID of a <style> element in the document; its CSS is injected
 *                      into the shadow root so it can style the cloned template content.
 *
 * Events listened for (bubbling from slotted children):
 *   rdf-loaded  – sets internal `triples` / `_allTriples` and triggers re-render
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

const DISPLAY_LOG = "[rdf-display]";

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
    lensObject: { state: true },
    _error: { state: true },
    /** Full unfiltered graph (from rdf-loaded.allTriples) — used for property-path resolution. */
    _allTriples: { state: true },
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
    this.lensObject = null;
    this._error = null;
    this._allTriples = null;

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
    this.lensObject = event.detail?.lensObject ?? null;
    // allTriples (full unfiltered graph) is used for property-path resolution in block mode.
    // Falls back to triples when not provided (e.g. when triples property is set directly).
    this._allTriples = event.detail?.allTriples ?? null;
    console.info(`${DISPLAY_LOG} rdf-loaded`, {
      triples: this.triples.length,
      allTriples: this._allTriples?.length ?? this.triples.length,
      lensClasses: Object.keys(this.lensObject || {}),
    });
  }

  _handleRdfError(event) {
    this._error = event.detail?.message ?? "An unknown error occurred";
    console.error(`${DISPLAY_LOG} rdf-error`, { message: this._error });
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

    // ── Block mode: template has at least one [data-rdf-predicate] or [data-rdf-path] element ──
    if (tmpl.content.querySelector("[data-rdf-predicate],[data-rdf-path]")) {
      console.info(`${DISPLAY_LOG} render:template-mode`, { mode: "block", templateId: this.templateId });
      _renderBlockTemplate(host, tmpl, this.triples, this._allTriples ?? this.triples);
      return;
    }

    // ── Lens mode: when lens extraction data is available, render once from flat object ──
    const lensRows = this.lensObject ? _collectLensRows(this.lensObject) : [];
    const wantsLensPlaceholders = tmpl.innerHTML.includes("{lens:");
    if (wantsLensPlaceholders && lensRows.length) {
      console.info(`${DISPLAY_LOG} render:template-mode`, {
        mode: "lens",
        templateId: this.templateId,
        rows: lensRows.length,
      });
      for (const row of lensRows) {
        const clone = tmpl.content.cloneNode(true);
        _fillLensPlaceholders(clone, row);
        host.appendChild(clone);
      }
      return;
    }

    // ── Legacy mode: clone once per triple ──
    console.info(`${DISPLAY_LOG} render:template-mode`, {
      mode: "legacy-triple",
      templateId: this.templateId,
      rows: this.triples.length,
    });
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
        "{object-type}": _detectObjectType(triple.object ?? "", triple.objectDatatype ?? null),
        "{object-datatype}": triple.objectDatatype ?? "",
        "{object-lang}": triple.objectLang ?? "",
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
// Helper: infer object value type from XSD datatype or heuristics
// Returns one of: "uri" | "datetime" | "date" | "integer" | "decimal" | "boolean" | "string"
// ---------------------------------------------------------------------------

function _detectObjectType(value, datatype) {
  if (datatype) {
    const dt = datatype.toLowerCase();
    if (dt.includes("datetime") || dt.includes("gyear")) return "datetime";
    if (dt.includes("date") && !dt.includes("datetime")) return "date";
    if (
      dt.includes("integer") ||
      dt.includes("long") ||
      dt.includes("short") ||
      dt.includes("byte") ||
      (dt.endsWith("int") && !dt.includes("string"))
    )
      return "integer";
    if (
      dt.includes("decimal") ||
      dt.includes("float") ||
      dt.includes("double")
    )
      return "decimal";
    if (dt.includes("boolean")) return "boolean";
    if (dt.includes("anyuri")) return "uri";
    return "string";
  }
  if (isUri(value)) {
    // Auto-detect image URLs by file extension
    const clean = value.split("?")[0].split("#")[0];
    const ext = clean.split(".").pop().toLowerCase();
    if (["jpg","jpeg","png","gif","webp","svg","avif","bmp","ico"].includes(ext)) return "image";
    return "uri";
  }
  if (/^\d{4}-\d{2}-\d{2}T/.test(value)) return "datetime";
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return "date";
  if (/^-?\d+$/.test(value.trim())) return "integer";
  if (/^-?\d+\.\d+$/.test(value.trim())) return "decimal";
  if (/^(true|false)$/i.test(value.trim())) return "boolean";
  return "string";
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
// Helper: build token replacement map for a single triple
// ---------------------------------------------------------------------------

function _buildTokenMap(triple) {
  return {
    "{subject}":         triple.subject ?? "",
    "{predicate}":       triple.predicate ?? "",
    "{predicate-short}": shortenUri(triple.predicate ?? ""),
    "{predicate-class}": _toCssClass(triple.predicate ?? ""),
    "{object}":          triple.object ?? "",
    "{object-short}":    shortenUri(triple.object ?? ""),
    "{object-is-uri}":   isUri(triple.object ?? "") ? "true" : "false",
    "{object-type}":     _detectObjectType(triple.object ?? "", triple.objectDatatype ?? null),
    "{object-datatype}": triple.objectDatatype ?? "",
    "{object-lang}":     triple.objectLang ?? "",
  };
}

// ---------------------------------------------------------------------------
// Helper: apply token replacements to an Element (its own attrs + descendants).
// Unlike _fillPlaceholders (which works on DocumentFragment), this also handles
// the attributes on the root element itself.
// ---------------------------------------------------------------------------

function _applyTokensToElement(el, tokenMap) {
  // Text nodes inside the element's subtree
  const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
  const textNodes = [];
  while (walker.nextNode()) textNodes.push(walker.currentNode);
  for (const node of textNodes) {
    let text = node.nodeValue;
    for (const [k, v] of Object.entries(tokenMap)) text = text.split(k).join(v);
    node.nodeValue = text;
  }

  // Attributes on the root element itself AND all descendants
  const elements = [el, ...el.querySelectorAll("*")];
  for (const child of elements) {
    for (const attr of Array.from(child.attributes)) {
      let value = attr.value;
      for (const [k, v] of Object.entries(tokenMap)) value = value.split(k).join(v);
      if (value !== attr.value) attr.value = value;
    }
  }
}

// ---------------------------------------------------------------------------
// Block-template rendering (replaces simple loop with recursive sub-block support)
//
// _renderBlockTemplate – entry point; renders template ONCE for the scope.
// _resolveAnnotatedElements – recursively resolves [data-rdf-predicate] and
//   [data-rdf-path] elements within a container.
// _resolveInner – fills tokens on a matched element and recurses into its
//   annotated children using the matched object URI as the new subject scope.
// _resolvePropertyPath – multi-hop property path traversal through the graph.
// ---------------------------------------------------------------------------

function _renderBlockTemplate(host, tmpl, triples, allTriples) {
  const clone = tmpl.content.cloneNode(true);

  _resolveAnnotatedElements(clone, triples, allTriples);

  // Clear any remaining {token} placeholders in structural/layout elements
  if (triples.length > 0) {
    _fillPlaceholders(clone, {
      "{subject}":         triples[0].subject ?? "",
      "{predicate}":       "",
      "{predicate-short}": "",
      "{predicate-class}": "",
      "{object}":          "",
      "{object-short}":    "",
      "{object-is-uri}":   "false",
      "{object-type}":     "string",
      "{object-datatype}": "",
      "{object-lang}":     "",
    });
  }

  host.appendChild(clone);
}

/**
 * Processes all top-level annotated elements ([data-rdf-predicate] or
 * [data-rdf-path]) within `container`, leaving nested annotated elements
 * to be resolved recursively when their parent is filled.
 *
 * @param {DocumentFragment|Element} container
 * @param {Array} scopeTriples  – triples at the current scope (subject-filtered)
 * @param {Array} allTriples    – full graph (for property-path resolution)
 */
function _resolveAnnotatedElements(container, scopeTriples, allTriples) {
  const SELECTOR = "[data-rdf-predicate],[data-rdf-path]";

  // Collect ALL annotated descendants, then keep only top-level ones
  // (i.e. not already nested inside another annotated element in this container).
  const allAnnotated = [...container.querySelectorAll(SELECTOR)];
  const topLevel = allAnnotated.filter(el => {
    let p = el.parentNode;
    while (p && p !== container) {
      if (
        p.hasAttribute &&
        (p.hasAttribute("data-rdf-predicate") || p.hasAttribute("data-rdf-path"))
      ) {
        return false; // ancestor is annotated → skip; handled in recursive call
      }
      p = p.parentNode;
    }
    return true;
  });

  // Build the set of subjects at the current scope for path resolution
  const subjectSet = [...new Set(scopeTriples.map(t => t.subject))];

  for (const el of topLevel) {
    const predUri    = el.getAttribute("data-rdf-predicate");
    const pathStr    = el.getAttribute("data-rdf-path");
    const filterLang = el.getAttribute("data-rdf-filter-lang") || null;
    const filterType = el.getAttribute("data-rdf-filter-type") || null;

    // Strip annotation attrs so they don't leak into the rendered output
    el.removeAttribute("data-rdf-predicate");
    el.removeAttribute("data-rdf-path");
    el.removeAttribute("data-rdf-filter-lang");
    el.removeAttribute("data-rdf-filter-type");

    // ── Build candidate match set ──
    let matches;
    if (pathStr) {
      // Multi-hop property path: space-separated predicate URIs
      const steps = pathStr.trim().split(/\s+/).filter(Boolean);
      matches = _resolvePropertyPath(allTriples, subjectSet, steps);
    } else if (predUri) {
      matches = scopeTriples.filter(t => t.predicate === predUri);
    } else {
      matches = [...scopeTriples];
    }

    // Apply optional refinement filters
    if (filterLang)
      matches = matches.filter(t => (t.objectLang ?? "") === filterLang);
    if (filterType)
      matches = matches.filter(
        t => _detectObjectType(t.object ?? "", t.objectDatatype ?? null) === filterType
      );

    // data-rdf-filter-contains: case-insensitive regex (or substring) on the object value
    const filterContains = el.getAttribute("data-rdf-filter-contains") || null;
    el.removeAttribute("data-rdf-filter-contains");
    if (filterContains) {
      try {
        const re = new RegExp(filterContains, "i");
        matches = matches.filter(t => re.test(t.object ?? ""));
      } catch (_) {
        matches = matches.filter(t => (t.object ?? "").includes(filterContains));
      }
    }

    // data-rdf-limit: keep only the first N matches
    const limitStr = el.getAttribute("data-rdf-limit") || null;
    el.removeAttribute("data-rdf-limit");
    const limitN = limitStr !== null ? parseInt(limitStr, 10) : NaN;
    if (!isNaN(limitN) && limitN > 0) matches = matches.slice(0, limitN);

    if (matches.length === 0) { el.remove(); continue; }

    // Keep a raw-token clone for list repetition BEFORE any filling
    const baseClone = el.cloneNode(true);

    // Fill first match (and recurse into its sub-blocks)
    _resolveInner(el, matches[0], allTriples);

    // Repeat from the base clone for each additional match
    let insertRef = el;
    for (let i = 1; i < matches.length; i++) {
      const extra = baseClone.cloneNode(true);
      _resolveInner(extra, matches[i], allTriples);
      if (insertRef.parentNode) {
        insertRef.parentNode.insertBefore(extra, insertRef.nextSibling);
      }
      insertRef = extra;
    }
  }
}

/**
 * Fills tokens on `el` for a single matched triple and recursively resolves
 * any annotated sub-elements using the match's object URI as the new subject scope.
 *
 * @param {Element} el
 * @param {Object}  triple
 * @param {Array}   allTriples
 */
function _isBlankNode(v) {
  return typeof v === "string" && v.startsWith("_:");
}

function _resolveInner(el, triple, allTriples) {
  const objUri = triple.object ?? "";
  if (isUri(objUri) || _isBlankNode(objUri)) {
    // Resolve inner annotated elements with the matched object as the new subject scope
    // (works for both regular URIs and blank-node identifiers)
    const innerTriples = allTriples.filter(t => t.subject === objUri);
    _resolveAnnotatedElements(el, innerTriples, allTriples);
  } else {
    // Object is a literal — any inner annotated elements have no subject scope
    _resolveAnnotatedElements(el, [], allTriples);
  }
  // Apply tokens AFTER inner blocks have been resolved (token fill is safe now)
  _applyTokensToElement(el, _buildTokenMap(triple));
}

/**
 * Resolves a multi-hop property path through the graph.
 * path = [pred1, pred2, …] starting from `startSubjects`.
 * Traverses both URI-valued and blank-node-valued intermediate objects.
 * Returns the final-step matching triples.
 *
 * @param {Array}  allTriples
 * @param {Array}  startSubjects  – array of subject URI / blank-node strings
 * @param {Array}  pathSteps      – array of predicate URI strings
 * @returns {Array}
 */
function _resolvePropertyPath(allTriples, startSubjects, pathSteps) {
  if (!pathSteps.length) return [];
  let subjects = new Set(startSubjects.filter(Boolean));

  for (let i = 0; i < pathSteps.length; i++) {
    const pred = pathSteps[i];
    const matches = allTriples.filter(
      t => subjects.has(t.subject) && t.predicate === pred
    );
    if (i === pathSteps.length - 1) {
      return matches; // Final step — return the matched triples
    }
    // Intermediate step — follow URI and blank-node objects as new subjects
    subjects = new Set(matches.map(t => t.object).filter(o => isUri(o) || _isBlankNode(o)));
    if (!subjects.size) return []; // Dead-end path
  }
  return [];
}

function _collectLensRows(lensObject) {
  if (!lensObject || typeof lensObject !== "object") return [];
  const collected = [];
  for (const group of Object.values(lensObject)) {
    if (Array.isArray(group)) {
      for (const row of group) {
        if (row && typeof row === "object") collected.push(row);
      }
    }
  }
  return collected;
}

function _fillLensPlaceholders(fragment, lensRow) {
  const replacements = {};
  for (const [key, value] of Object.entries(lensRow)) {
    const strValue = Array.isArray(value)
      ? value.map((v) => (v && typeof v === "object" ? JSON.stringify(v) : String(v ?? ""))).join(", ")
      : (value && typeof value === "object" ? JSON.stringify(value) : String(value ?? ""));
    replacements[`{lens:${key}}`] = strValue;
  }
  if (Object.keys(replacements).length === 0) return;
  _fillPlaceholders(fragment, replacements);
}

// ---------------------------------------------------------------------------
// Register
// ---------------------------------------------------------------------------

if (!customElements.get("rdf-display")) {
  customElements.define("rdf-display", RdfDisplay);
}

export default RdfDisplay;
