/**
 * rdf-adapter.js
 *
 * <rdf-adapter> custom element.
 *
 * Discovers RDF source URLs from:
 *  1. The `src` attribute on the element itself.
 *  2. `<link rel="describedby" href="…">` elements in the document head.
 *
 * Fetches and parses each source off the main thread (via the RDF parser
 * worker), then renders the resulting triples into its shadow root.
 *
 * Attributes:
 *   src        – explicit RDF URL (optional)
 *   subject    – filter triples by subject URI (optional)
 *   no-shadow  – disable Shadow DOM (render into light DOM instead)
 *
 * Events dispatched (bubble + composed):
 *   rdf-loaded  – { detail: { triples: Array<{subject,predicate,object}> } }
 *   rdf-error   – { detail: { message: string, url?: string } }
 */

import { fetchRdf } from "../utils/rdf-fetcher.js";
import { parseRdf } from "../utils/rdf-parser.js";
import {
  renderTriples,
  clearContent,
  showLoading,
  hideLoading,
  showError,
} from "../utils/dom-adapter.js";

export class RdfAdapter extends HTMLElement {
  static get observedAttributes() {
    return ["src", "subject"];
  }

  constructor() {
    super();
    this._root = null;
    this._abortController = null;
  }

  connectedCallback() {
    const useShadow = !this.hasAttribute("no-shadow");
    this._root = useShadow
      ? this.attachShadow({ mode: "open" })
      : this;

    this._load();
  }

  disconnectedCallback() {
    this._abort();
  }

  attributeChangedCallback(name, oldValue, newValue) {
    if (oldValue !== null && oldValue !== newValue) {
      this._load();
    }
  }

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  _abort() {
    if (this._abortController) {
      this._abortController.abort();
      this._abortController = null;
    }
  }

  async _load() {
    if (!this._root) return;

    this._abort();
    this._abortController = new AbortController();
    const signal = this._abortController.signal;

    clearContent(this._root);
    showLoading(this._root);

    const urls = this._discoverSources();

    if (urls.length === 0) {
      hideLoading(this._root);
      showError(this._root, "No RDF source found. Add a src attribute or a <link rel=\"describedby\"> element.");
      return;
    }

    const subjectFilter = this.getAttribute("subject") ?? null;

    try {
      const allTriples = [];

      for (const url of urls) {
        if (signal.aborted) break;
        try {
          const { text, format } = await fetchRdf(url);
          if (signal.aborted) break;

          const quads = await parseRdf(text, format, url);
          if (signal.aborted) break;

          for (const quad of quads) {
            if (subjectFilter && quad.subject.value !== subjectFilter) continue;
            allTriples.push({
              subject: quad.subject.value,
              predicate: quad.predicate.value,
              object: quad.object.value,
            });
          }
        } catch (err) {
          if (!signal.aborted) {
            showError(this._root, `Failed to load ${url}: ${err.message}`);
            this.dispatchEvent(
              new CustomEvent("rdf-error", {
                detail: { message: err.message, url },
                bubbles: true,
                composed: true,
              })
            );
          }
        }
      }

      if (!signal.aborted) {
        hideLoading(this._root);
        renderTriples(this._root, allTriples);
        this.dispatchEvent(
          new CustomEvent("rdf-loaded", {
            detail: { triples: allTriples },
            bubbles: true,
            composed: true,
          })
        );
      }
    } catch (err) {
      if (!signal.aborted) {
        hideLoading(this._root);
        showError(this._root, err.message);
      }
    }
  }

  _discoverSources() {
    const sources = [];

    const explicit = this.getAttribute("src");
    if (explicit) sources.push(explicit);

    // Discover <link rel="describedby"> in the document
    const links = document.querySelectorAll('link[rel="describedby"]');
    for (const link of links) {
      const href = link.getAttribute("href");
      if (href && !sources.includes(href)) sources.push(href);
    }

    return sources;
  }
}

// Register the custom element
if (!customElements.get("rdf-adapter")) {
  customElements.define("rdf-adapter", RdfAdapter);
}

export default RdfAdapter;
