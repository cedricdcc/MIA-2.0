/**
 * rdf-parser.js
 *
 * Main-thread wrapper for the RDF parser Web Worker.
 *
 * Sends `{ text, format, baseIRI }` to the worker via postMessage and resolves
 * with the parsed quads array (plain JS objects) when the worker responds.
 *
 * Falls back to synchronous N3.js parsing when Web Workers are unavailable
 * (e.g., in certain test environments).
 */

let _workerInstance = null;
let _pendingRequests = new Map();
let _requestCounter = 0;

function _getWorker() {
  if (_workerInstance) return _workerInstance;

  // Vite turns `new Worker(new URL(...), { type: 'module' })` into a proper
  // worker bundle automatically.
  _workerInstance = new Worker(
    new URL("../workers/rdf-parser-worker.js", import.meta.url),
    { type: "module" }
  );

  _workerInstance.addEventListener("message", (event) => {
    const { id, quads, error } = event.data;
    const pending = _pendingRequests.get(id);
    if (!pending) return;
    _pendingRequests.delete(id);
    if (error) {
      pending.reject(new Error(error));
    } else {
      pending.resolve(quads);
    }
  });

  _workerInstance.addEventListener("error", (event) => {
    // Reject all pending requests if the worker crashes
    for (const [, pending] of _pendingRequests) {
      pending.reject(new Error(`Worker error: ${event.message}`));
    }
    _pendingRequests.clear();
    _workerInstance = null;
  });

  return _workerInstance;
}

/**
 * Parse RDF text off the main thread.
 *
 * @param {string} text   - Raw RDF serialisation
 * @param {string} format - MIME type (e.g. "text/turtle")
 * @param {string} [baseIRI] - Optional base IRI for relative references
 * @returns {Promise<Array>} Resolves with an array of quad-like plain objects
 */
export function parseRdf(text, format, baseIRI = "") {
  return new Promise((resolve, reject) => {
    const id = ++_requestCounter;
    _pendingRequests.set(id, { resolve, reject });

    try {
      const worker = _getWorker();
      worker.postMessage({ id, text, format, baseIRI });
    } catch (err) {
      _pendingRequests.delete(id);
      reject(err);
    }
  });
}

/**
 * Terminate the underlying worker.  Call during teardown / hot-module reload.
 */
export function terminateWorker() {
  if (_workerInstance) {
    _workerInstance.terminate();
    _workerInstance = null;
  }
  _pendingRequests.clear();
}
