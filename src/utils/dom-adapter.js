/**
 * dom-adapter.js
 *
 * Utilities for applying RDF-derived data to the DOM.
 *
 * Batches all mutations through a DocumentFragment to minimise reflows, then
 * appends the fragment in a single operation.
 */

/**
 * Render a list of `{ predicate, object }` pairs into a target element.
 *
 * Each pair becomes a `<dl>` term / description entry.
 *
 * @param {HTMLElement} target
 * @param {Array<{ predicate: string, object: string }>} triples
 */
export function renderTriples(target, triples) {
  if (!target || !Array.isArray(triples) || triples.length === 0) return;

  const fragment = document.createDocumentFragment();
  const dl = document.createElement("dl");
  dl.className = "rdf-triples";

  for (const { predicate, object } of triples) {
    const dt = document.createElement("dt");
    dt.className = "rdf-predicate";
    dt.textContent = _shortenUri(predicate);
    dt.title = predicate;

    const dd = document.createElement("dd");
    dd.className = "rdf-object";

    if (_isUri(object)) {
      const a = document.createElement("a");
      a.href = object;
      a.textContent = _shortenUri(object);
      a.rel = "noopener noreferrer";
      a.target = "_blank";
      dd.appendChild(a);
    } else {
      dd.textContent = object;
    }

    dl.appendChild(dt);
    dl.appendChild(dd);
  }

  fragment.appendChild(dl);
  target.appendChild(fragment);
}

/**
 * Clear all RDF-generated content inside `target`.
 *
 * @param {HTMLElement} target
 */
export function clearContent(target) {
  if (!target) return;
  const existing = target.querySelectorAll(".rdf-triples");
  for (const el of existing) el.remove();
}

/**
 * Display a loading indicator inside `target`.
 *
 * @param {HTMLElement} target
 */
export function showLoading(target) {
  if (!target) return;
  const el = document.createElement("span");
  el.className = "rdf-loading";
  el.textContent = "Loading…";
  target.appendChild(el);
}

/**
 * Remove the loading indicator from `target`.
 *
 * @param {HTMLElement} target
 */
export function hideLoading(target) {
  if (!target) return;
  const existing = target.querySelectorAll(".rdf-loading");
  for (const el of existing) el.remove();
}

/**
 * Display an error message inside `target`.
 *
 * @param {HTMLElement} target
 * @param {string} message
 */
export function showError(target, message) {
  if (!target) return;
  const el = document.createElement("span");
  el.className = "rdf-error";
  el.textContent = message;
  target.appendChild(el);
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function _isUri(value) {
  return typeof value === "string" && /^https?:\/\//i.test(value);
}

function _shortenUri(uri) {
  if (!uri) return "";
  // Return just the fragment or last path segment
  const hash = uri.lastIndexOf("#");
  if (hash !== -1) return uri.slice(hash + 1);
  const slash = uri.lastIndexOf("/");
  if (slash !== -1 && slash < uri.length - 1) return uri.slice(slash + 1);
  return uri;
}
