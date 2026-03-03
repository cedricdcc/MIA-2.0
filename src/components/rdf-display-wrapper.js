import "./rdf-display.js";

class RdfDisplayWrapper extends HTMLElement {
  static get observedAttributes() {
    return ["template-id", "template-styles", "display-mode", "lens-namespace"];
  }

  constructor() {
    super();
    this.attachShadow({ mode: "open" });
    this._handleLoaded = this._handleLoaded.bind(this);
    this._handleError = this._handleError.bind(this);
  }

  connectedCallback() {
    this.shadowRoot.innerHTML = `<rdf-display></rdf-display>`;
    this._display = this.shadowRoot.querySelector("rdf-display");
    this._syncAttributes();
    this.addEventListener("rdf-loaded", this._handleLoaded);
    this.addEventListener("rdf-error", this._handleError);
  }

  disconnectedCallback() {
    this.removeEventListener("rdf-loaded", this._handleLoaded);
    this.removeEventListener("rdf-error", this._handleError);
  }

  attributeChangedCallback() {
    this._syncAttributes();
  }

  _syncAttributes() {
    if (!this._display) return;
    for (const attr of RdfDisplayWrapper.observedAttributes) {
      const value = this.getAttribute(attr);
      if (value == null) this._display.removeAttribute(attr);
      else this._display.setAttribute(attr, value);
    }
  }

  _handleLoaded(event) {
    if (event.target === this._display || event.detail?.__fromWrapper) return;
    const lensObject = event.detail?.lensObject ?? null;
    const lensNamespace =
      this.getAttribute("lens-namespace") || "https://example.org/lens/";
    const triplesFromLens = _lensObjectToTriples(lensObject, lensNamespace);
    this._display.dispatchEvent(
      new CustomEvent("rdf-loaded", {
        detail: {
          ...event.detail,
          triples: triplesFromLens.length ? triplesFromLens : event.detail?.triples || [],
          allTriples:
            triplesFromLens.length ? triplesFromLens : event.detail?.allTriples || event.detail?.triples || [],
          lensObject,
          __fromWrapper: true,
        },
        bubbles: true,
        composed: true,
      }),
    );
  }

  _handleError(event) {
    if (event.target === this._display || event.detail?.__fromWrapper) return;
    this._display.dispatchEvent(
      new CustomEvent("rdf-error", {
        detail: { ...(event.detail || { message: "Unknown RDF display error" }), __fromWrapper: true },
        bubbles: true,
        composed: true,
      }),
    );
  }
}

function _lensObjectToTriples(lensObject, namespace = "https://example.org/lens/") {
  const triples = [];
  if (!lensObject || typeof lensObject !== "object") return triples;
  let groupIndex = 0;
  for (const rows of Object.values(lensObject)) {
    groupIndex += 1;
    if (!Array.isArray(rows)) continue;
    rows.forEach((row, rowIndex) => {
      if (!row || typeof row !== "object") return;
      const subject =
        row.id || row.uri || `${namespace}row/${groupIndex}/${rowIndex + 1}`;
      for (const [key, rawValue] of Object.entries(row)) {
        if (rawValue === undefined || rawValue === null) continue;
        const value = Array.isArray(rawValue)
          ? rawValue.map((v) => (typeof v === "object" ? JSON.stringify(v) : String(v))).join(", ")
          : typeof rawValue === "object"
            ? JSON.stringify(rawValue)
            : String(rawValue);
        triples.push({
          subject,
          predicate: `${namespace}property/${encodeURIComponent(key)}`,
          object: value,
        });
      }
    });
  }
  return triples;
}

if (!customElements.get("rdf-display-wrapper")) {
  customElements.define("rdf-display-wrapper", RdfDisplayWrapper);
}

export default RdfDisplayWrapper;
