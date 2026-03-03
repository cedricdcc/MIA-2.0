import "./rdf-adapter.js";
import "./rdf-display.js";

class RdfDisplayWrapper extends HTMLElement {
  static get observedAttributes() {
    return [
      "src",
      "subject",
      "shape-src",
      "template-id",
      "template-styles",
      "display-mode",
    ];
  }

  constructor() {
    super();
    this.attachShadow({ mode: "open" });
    this._handleLoaded = this._handleLoaded.bind(this);
    this._handleError = this._handleError.bind(this);
  }

  connectedCallback() {
    this.shadowRoot.innerHTML = `
      <rdf-display>
        <rdf-adapter no-shadow></rdf-adapter>
      </rdf-display>
    `;
    this._display = this.shadowRoot.querySelector("rdf-display");
    this._adapter = this.shadowRoot.querySelector("rdf-adapter");
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

  _setOrRemove(el, name, value) {
    if (!el) return;
    if (value == null) el.removeAttribute(name);
    else el.setAttribute(name, value);
  }

  _syncAttributes() {
    if (!this._display || !this._adapter) return;
    this._setOrRemove(this._display, "template-id", this.getAttribute("template-id"));
    this._setOrRemove(this._display, "template-styles", this.getAttribute("template-styles"));
    this._setOrRemove(this._display, "display-mode", this.getAttribute("display-mode"));

    this._setOrRemove(this._adapter, "src", this.getAttribute("src"));
    this._setOrRemove(this._adapter, "subject", this.getAttribute("subject"));
    this._setOrRemove(this._adapter, "shape-src", this.getAttribute("shape-src"));
  }

  _handleLoaded(event) {
    const path = typeof event.composedPath === "function" ? event.composedPath() : [];
    const fromInternal = path.includes(this._adapter) || path.includes(this._display);
    // External injection support (e.g. template-builder preview dispatching rdf-loaded directly on wrapper).
    if (event.detail?.__fromWrapper || fromInternal || !this._display) return;
    this._display.dispatchEvent(
      new CustomEvent("rdf-loaded", {
        detail: { ...(event.detail || {}), __fromWrapper: true },
        bubbles: true,
        composed: true,
      }),
    );
  }

  _handleError(event) {
    const path = typeof event.composedPath === "function" ? event.composedPath() : [];
    const fromInternal = path.includes(this._adapter) || path.includes(this._display);
    // External injection support (e.g. template-builder preview dispatching rdf-error directly on wrapper).
    if (event.detail?.__fromWrapper || fromInternal || !this._display) return;
    this._display.dispatchEvent(
      new CustomEvent("rdf-error", {
        detail: { ...(event.detail || { message: "Unknown RDF display error" }), __fromWrapper: true },
        bubbles: true,
        composed: true,
      }),
    );
  }
}

if (!customElements.get("rdf-display-wrapper")) {
  customElements.define("rdf-display-wrapper", RdfDisplayWrapper);
}

export default RdfDisplayWrapper;
