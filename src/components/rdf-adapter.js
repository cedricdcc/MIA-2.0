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
 *   rdf-loaded  – { detail: { triples: Array<{subject,predicate,object,objectDatatype?,objectLang?}> } }
 *   rdf-error   – { detail: { message: string, url?: string } }
 */

import { fetchRdf } from "../utils/rdf-fetcher.js";
import { parseRdf } from "../utils/rdf-parser.js";
import { extractWithShapes, toRdfQuads } from "../utils/rdf-lens-extractor.js";
import {
  renderTriples,
  clearContent,
  showLoading,
  hideLoading,
  showError,
} from "../utils/dom-adapter.js";

const ADAPTER_LOG = "[rdf-adapter]";

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
    console.info(`${ADAPTER_LOG} load:start`, { urls });

    if (urls.length === 0) {
      hideLoading(this._root);
      showError(this._root, "No RDF source found. Add a src attribute or a <link rel=\"describedby\"> element.");
      return;
    }

    const subjectFilter = this.getAttribute("subject") ?? null;
    console.info(`${ADAPTER_LOG} load:config`, {
      subjectFilter,
      shapeSrc: this.getAttribute("shape-src") ?? null,
    });

    try {
      const displayTriples = []; // subject-filtered (for rendering & display)
      const fullTriples    = []; // all parsed triples (for property-path resolution)
      const rawQuads       = []; // serialised quads for lens-based extraction
      let lensObject = null;

      for (const url of urls) {
        if (signal.aborted) break;
        try {
          const { text, format } = await fetchRdf(url);
          console.info(`${ADAPTER_LOG} fetch:ok`, { url, format, bytes: text.length });
          if (signal.aborted) break;

          const quads = await parseRdf(text, format, url);
          console.info(`${ADAPTER_LOG} parse:ok`, { url, quads: quads.length });
          if (signal.aborted) break;

          for (const quad of quads) {
            rawQuads.push(quad);
            const triple = {
              subject: quad.subject.value,
              predicate: quad.predicate.value,
              object: quad.object.value,
              objectDatatype: quad.object.datatype?.value ?? null,
              objectLang: quad.object.language ?? null,
            };
            fullTriples.push(triple);
            if (!subjectFilter || triple.subject === subjectFilter) {
              displayTriples.push(triple);
            }
          }
        } catch (err) {
          console.error(`${ADAPTER_LOG} source:error`, { url, message: err.message });
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
        const shapeSrc = this.getAttribute("shape-src");
        if (shapeSrc && rawQuads.length) {
          try {
            const { text, format } = await fetchRdf(shapeSrc);
            console.info(`${ADAPTER_LOG} shape:fetch:ok`, {
              shapeSrc,
              format,
              bytes: text.length,
            });
            let shapeRawQuads;
            try {
              shapeRawQuads = await parseRdf(text, format, shapeSrc);
              console.info(`${ADAPTER_LOG} shape:parse:ok`, {
                shapeSrc,
                quads: shapeRawQuads.length,
              });
            } catch (err) {
              throw new Error(`shape parse failed: ${err.message}`);
            }
            try {
              lensObject = extractWithShapes(
                toRdfQuads(rawQuads),
                toRdfQuads(shapeRawQuads),
              );
              console.info(`${ADAPTER_LOG} lens:extract:ok`, {
                shapeSrc,
                classes: Object.keys(lensObject || {}),
                rows: Object.values(lensObject || {}).reduce(
                  (sum, list) => sum + (Array.isArray(list) ? list.length : 0),
                  0,
                ),
              });
            } catch (err) {
              throw new Error(`shape extraction failed: ${err.message}`);
            }
          } catch (err) {
            console.error(`${ADAPTER_LOG} shape:error`, {
              shapeSrc,
              message: err.message,
            });
            this.dispatchEvent(
              new CustomEvent("rdf-error", {
                detail: { message: `Failed to extract lens data from shape-src: ${err.message}`, url: shapeSrc },
                bubbles: true,
                composed: true,
              })
            );
          }
        }

        hideLoading(this._root);
        renderTriples(this._root, displayTriples);
        console.info(`${ADAPTER_LOG} load:complete`, {
          triples: displayTriples.length,
          allTriples: fullTriples.length,
          rawQuads: rawQuads.length,
          hasLensObject: !!lensObject,
        });
        this.dispatchEvent(
          new CustomEvent("rdf-loaded", {
            detail: { triples: displayTriples, allTriples: fullTriples, rawQuads, lensObject },
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
