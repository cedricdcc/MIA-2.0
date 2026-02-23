/**
 * rdf-parser-worker.js
 *
 * Web Worker script – receives RDF text, parses it with N3.js, and posts the
 * resulting quads back to the main thread as plain serialisable objects.
 *
 * Message in:  { id: number, text: string, format: string, baseIRI?: string }
 * Message out: { id: number, quads: Array } | { id: number, error: string }
 */

import { Parser } from "n3";

self.addEventListener("message", (event) => {
  const { id, text, format, baseIRI } = event.data;

  try {
    const parser = new Parser({ format, baseIRI: baseIRI || undefined });
    const quads = parser.parse(text);

    // Serialise quads to plain objects so they cross the structured-clone
    // boundary without issues (N3.Quad instances are not plain objects).
    const serialised = quads.map((q) => ({
      subject: { value: q.subject.value, termType: q.subject.termType },
      predicate: { value: q.predicate.value, termType: q.predicate.termType },
      object: { value: q.object.value, termType: q.object.termType },
      graph: { value: q.graph.value, termType: q.graph.termType },
    }));

    self.postMessage({ id, quads: serialised });
  } catch (err) {
    self.postMessage({ id, error: err.message ?? String(err) });
  }
});
