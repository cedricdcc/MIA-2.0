/**
 * rdf-lens-extractor.js
 *
 * Middle layer that bridges MIA's parsed quad format with the rdf-lens
 * library, enabling lens-based and SHACL-shape-based data extraction.
 *
 * Typical usage:
 *
 *   import { toRdfQuads, createPredicateLens, extractWithLens, extractWithShapes }
 *     from "./rdf-lens-extractor.js";
 *
 *   // From an rdf-loaded event:
 *   element.addEventListener("rdf-loaded", ({ detail: { rawQuads } }) => {
 *     const quads = toRdfQuads(rawQuads);
 *
 *     // Simple predicate lens
 *     const titleLens = createPredicateLens("http://purl.org/dc/terms/title");
 *     const titles = extractWithLens(titleLens, subjectIri, quads);
 *
 *     // Or SHACL-shape driven extraction
 *     const result = extractWithShapes(quads, shapeQuads);
 *   });
 */

import { DataFactory } from "n3";
import { pred, extractShapes } from "rdf-lens";

const { namedNode, blankNode, literal, quad: makeQuad, defaultGraph } = DataFactory;

// ---------------------------------------------------------------------------
// Quad reconstruction
// ---------------------------------------------------------------------------

/**
 * Convert a serialised term (plain object from the RDF parser worker) back to
 * a proper RDFJS-compatible term produced by N3's DataFactory.
 *
 * @param {{ value: string, termType: string, datatype?: { value: string }, language?: string }} term
 * @returns {import("@rdfjs/types").Term}
 */
function toRdfTerm(term) {
  switch (term.termType) {
    case "NamedNode":
      return namedNode(term.value);
    case "BlankNode":
      return blankNode(term.value);
    case "Literal": {
      const dt = term.datatype ? namedNode(term.datatype.value) : undefined;
      return literal(term.value, term.language || dt);
    }
    case "DefaultGraph":
      return defaultGraph();
    default:
      return namedNode(term.value);
  }
}

/**
 * Convert an array of serialised quads (as produced by `rdf-parser-worker.js`)
 * into proper RDFJS `Quad` objects that can be passed to rdf-lens functions.
 *
 * @param {Array<{
 *   subject: { value: string, termType: string },
 *   predicate: { value: string, termType: string },
 *   object: { value: string, termType: string, datatype?: { value: string }, language?: string },
 *   graph: { value: string, termType: string }
 * }>} serializedQuads - Quads from the RDF parser worker or `rdf-loaded` rawQuads
 * @returns {import("@rdfjs/types").Quad[]}
 */
export function toRdfQuads(serializedQuads) {
  return serializedQuads.map((q) =>
    makeQuad(
      toRdfTerm(q.subject),
      toRdfTerm(q.predicate),
      toRdfTerm(q.object),
      toRdfTerm(q.graph),
    )
  );
}

// ---------------------------------------------------------------------------
// Lens factories
// ---------------------------------------------------------------------------

/**
 * Create a `BasicLensM` that follows a single predicate from the current node.
 *
 * @param {string} predicateUri - Absolute URI of the predicate to follow
 * @returns {import("rdf-lens").BasicLensM<import("rdf-lens").Cont, import("rdf-lens").Cont>}
 */
export function createPredicateLens(predicateUri) {
  return pred(namedNode(predicateUri));
}

// ---------------------------------------------------------------------------
// Execution helpers
// ---------------------------------------------------------------------------

/**
 * Execute a lens starting from `subjectIri` over the given quads, returning
 * all matched `Cont` containers.
 *
 * @param {import("rdf-lens").BasicLensM<import("rdf-lens").Cont, import("rdf-lens").Cont>} lens
 * @param {string} subjectIri - IRI of the starting subject node
 * @param {import("@rdfjs/types").Quad[]} rdfQuads - Proper RDFJS quads (use `toRdfQuads` if needed)
 * @returns {import("rdf-lens").Cont[]}
 */
export function extractWithLens(lens, subjectIri, rdfQuads) {
  return lens.execute({ id: namedNode(subjectIri), quads: rdfQuads });
}

// ---------------------------------------------------------------------------
// SHACL-shape extraction
// ---------------------------------------------------------------------------

/**
 * Extract structured objects from RDF data guided by SHACL shapes.
 *
 * Given data quads and shape quads (both as RDFJS `Quad[]`), this function:
 *  1. Parses the shapes with rdf-lens's `extractShapes`
 *  2. For each shape that has a `sh:targetClass`, finds all matching subjects
 *  3. Runs the corresponding lens over each subject
 *  4. Returns a map of class IRI → array of extracted plain JS objects
 *
 * @param {import("@rdfjs/types").Quad[]} dataQuads - The RDF data to extract from
 * @param {import("@rdfjs/types").Quad[]} shapeQuads - SHACL shape definitions
 * @returns {{ [classIri: string]: unknown[] }}
 */
export function extractWithShapes(dataQuads, shapeQuads) {
  const { lenses, shapes } = extractShapes(shapeQuads);

  /** @type {{ [classIri: string]: unknown[] }} */
  const result = {};

  for (const shape of shapes) {
    const classIri = shape.ty.value;
    const lens = lenses[classIri];
    if (!lens) continue;

    // Find all subjects typed as this class
    const RDF_TYPE = "http://www.w3.org/1999/02/22-rdf-syntax-ns#type";
    const matchingSubjects = dataQuads
      .filter(
        (q) =>
          q.predicate.value === RDF_TYPE &&
          q.object.value === classIri
      )
      .map((q) => q.subject);

    const extracted = [];
    for (const subjectTerm of matchingSubjects) {
      try {
        extracted.push(lens.execute({ id: subjectTerm, quads: dataQuads }));
      } catch {
        // Skip subjects that don't satisfy the shape (e.g. missing required fields)
      }
    }

    if (extracted.length > 0) {
      result[classIri] = extracted;
    }
  }

  return result;
}
