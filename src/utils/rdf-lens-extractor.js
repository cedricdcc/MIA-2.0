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

const {
  namedNode,
  blankNode,
  literal,
  quad: makeQuad,
  defaultGraph,
} = DataFactory;

const RDF_TYPE = "http://www.w3.org/1999/02/22-rdf-syntax-ns#type";
const RDF_FIRST = "http://www.w3.org/1999/02/22-rdf-syntax-ns#first";
const RDF_REST = "http://www.w3.org/1999/02/22-rdf-syntax-ns#rest";
const RDF_NIL = "http://www.w3.org/1999/02/22-rdf-syntax-ns#nil";
const SH_NODE_SHAPE = "http://www.w3.org/ns/shacl#NodeShape";
const SH_TARGET_CLASS = "http://www.w3.org/ns/shacl#targetClass";
const SH_PROPERTY = "http://www.w3.org/ns/shacl#property";
const SH_NAME = "http://www.w3.org/ns/shacl#name";
const SH_PATH = "http://www.w3.org/ns/shacl#path";
const SH_MAX_COUNT = "http://www.w3.org/ns/shacl#maxCount";
const SH_CLASS = "http://www.w3.org/ns/shacl#class";
const SH_DATATYPE = "http://www.w3.org/ns/shacl#datatype";

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
    ),
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
 *  2. For each shape, finds matching subjects via sh:targetClass or sh:targetNode
 *  3. Runs the corresponding lens over each subject
 *  4. Returns a map of class IRI → array of extracted plain JS objects
 *
 * @param {import("@rdfjs/types").Quad[]} dataQuads - The RDF data to extract from
 * @param {import("@rdfjs/types").Quad[]} shapeQuads - SHACL shape definitions
 * @returns {{ [classIri: string]: unknown[] }}
 */
export function extractWithShapes(dataQuads, shapeQuads) {
  const { lenses, shapes } = extractShapes(shapeQuads);
  const fallbackShapes = parseSimpleShapes(shapeQuads);

  /** @type {{ [classIri: string]: unknown[] }} */
  const result = {};

  for (const shape of shapes) {
    const classIri = shape.ty.value;
    const lens = lenses[classIri];
    if (!lens) continue;

    // Find all subjects typed as this class
    const matchingSubjects = dataQuads
      .filter(
        (q) => q.predicate.value === RDF_TYPE && q.object.value === classIri,
      )
      .map((q) => q.subject);

    const extracted = [];
    for (const subjectTerm of matchingSubjects) {
      try {
        extracted.push(normalizeExtractedValue(lens.execute({ id: subjectTerm, quads: dataQuads }), dataQuads));
      } catch {
        const fallback = extractSubjectWithFallbackShape(
          subjectTerm,
          classIri,
          dataQuads,
          fallbackShapes,
        );
        if (fallback !== undefined) extracted.push(fallback);
      }
    }

    if (extracted.length > 0) {
      result[classIri] = extracted;
    }
  }

  for (const [classIri, shape] of fallbackShapes) {
    if (result[classIri]) continue;
    const matchingSubjects = dataQuads
      .filter(
        (q) => q.predicate.value === RDF_TYPE && q.object.value === classIri,
      )
      .map((q) => q.subject);
    const extracted = matchingSubjects
      .map((subjectTerm) =>
        extractSubjectWithFallbackShape(
          subjectTerm,
          classIri,
          dataQuads,
          fallbackShapes,
        ),
      )
      .filter((x) => x !== undefined);

    if (extracted.length > 0 && shape.fields.length > 0) {
      result[classIri] = extracted;
    }
  }

  return result;
}

function termKey(term) {
  return `${term.termType}:${term.value}`;
}

function parseSimpleShapes(shapeQuads) {
  const bySubject = new Map();
  for (const q of shapeQuads) {
    const key = termKey(q.subject);
    if (!bySubject.has(key)) bySubject.set(key, []);
    bySubject.get(key).push(q);
  }

  const out = new Map();
  for (const [shapeKey, quads] of bySubject) {
    const isNodeShape = quads.some(
      (q) =>
        q.predicate.value === RDF_TYPE &&
        q.object.value === SH_NODE_SHAPE,
    );
    if (!isNodeShape) continue;

    const targetClass = quads.find((q) => q.predicate.value === SH_TARGET_CLASS)
      ?.object?.value;
    if (!targetClass) continue;

    const propertyTerms = quads
      .filter((q) => q.predicate.value === SH_PROPERTY)
      .map((q) => q.object);
    const fields = propertyTerms
      .map((propertyTerm) => parseSimpleProperty(propertyTerm, bySubject))
      .filter(Boolean);

    out.set(targetClass, { id: shapeKey, fields });
  }

  return out;
}

function parseSimpleProperty(propertyTerm, bySubject) {
  const propQuads = bySubject.get(termKey(propertyTerm)) || [];
  const name =
    propQuads.find((q) => q.predicate.value === SH_NAME)?.object?.value || null;
  const pathTerm = propQuads.find((q) => q.predicate.value === SH_PATH)?.object;
  const path = parsePath(pathTerm, bySubject);
  if (!name || path.length === 0) return null;

  const maxCountRaw = propQuads.find((q) => q.predicate.value === SH_MAX_COUNT)
    ?.object?.value;
  const maxCount =
    maxCountRaw !== undefined ? Number.parseInt(maxCountRaw, 10) : null;
  const classIri = propQuads.find((q) => q.predicate.value === SH_CLASS)?.object
    ?.value;
  const datatype = propQuads.find((q) => q.predicate.value === SH_DATATYPE)
    ?.object?.value;

  return {
    name,
    path,
    maxCount: Number.isFinite(maxCount) ? maxCount : null,
    classIri: classIri || null,
    datatype: datatype || null,
  };
}

function parsePath(pathTerm, bySubject) {
  if (!pathTerm) return [];
  if (pathTerm.termType === "NamedNode") return [pathTerm.value];
  if (pathTerm.termType !== "BlankNode") return [];
  return readRdfList(pathTerm, bySubject, []).filter(
    (term) => term.termType === "NamedNode",
  ).map((term) => term.value);
}

function readRdfList(startTerm, bySubject, trail = []) {
  if (!startTerm || startTerm.value === RDF_NIL) return [];
  const key = termKey(startTerm);
  if (trail.includes(key)) return [];
  const nodeQuads = bySubject.get(key) || [];
  const first = nodeQuads.find((q) => q.predicate.value === RDF_FIRST)?.object;
  const rest = nodeQuads.find((q) => q.predicate.value === RDF_REST)?.object;
  if (!first || !rest) return [];
  return [first, ...readRdfList(rest, bySubject, [...trail, key])];
}

function extractSubjectWithFallbackShape(subjectTerm, classIri, dataQuads, shapeMap, trail = []) {
  if (!subjectTerm) return undefined;
  const loopKey = `${classIri}|${termKey(subjectTerm)}`;
  if (trail.includes(loopKey)) return undefined;
  const shape = shapeMap.get(classIri);
  if (!shape) return undefined;

  const out = {};
  for (const field of shape.fields) {
    const terms = resolvePath(subjectTerm, field.path, dataQuads);
    const expanded = terms.flatMap((term) => expandRdfListTerm(term, dataQuads));
    const values = expanded
      .map((term) => {
        if (field.classIri) {
          return extractSubjectWithFallbackShape(
            term,
            field.classIri,
            dataQuads,
            shapeMap,
            [...trail, loopKey],
          );
        }
        return convertTermValue(term, field.datatype);
      })
      .filter((value) => value !== undefined);

    // `maxCount 0` means the field should not be present; skip assigning output.
    if (field.maxCount === 0) {
      continue;
    }
    if (field.maxCount !== null && field.maxCount < 2) {
      if (values.length > 0) out[field.name] = values[0];
    } else if (values.length > 0) {
      out[field.name] = values;
    }
  }

  return Object.keys(out).length > 0 ? out : undefined;
}

function resolvePath(startTerm, path, dataQuads) {
  let current = [startTerm];
  for (const predicateUri of path) {
    current = current.flatMap((term) =>
      dataQuads
        .filter(
          (q) =>
            q.subject.termType === term.termType &&
            q.subject.value === term.value &&
            q.predicate.value === predicateUri,
        )
        .map((q) => q.object),
    );
    if (current.length === 0) break;
  }
  return current;
}

function expandRdfListTerm(term, dataQuads, trail = []) {
  if (!term || term.value === RDF_NIL) return [];
  const loopKey = termKey(term);
  if (trail.includes(loopKey)) return [term];
  const first = dataQuads.find(
    (q) =>
      q.subject.termType === term.termType &&
      q.subject.value === term.value &&
      q.predicate.value === RDF_FIRST,
  )?.object;
  const rest = dataQuads.find(
    (q) =>
      q.subject.termType === term.termType &&
      q.subject.value === term.value &&
      q.predicate.value === RDF_REST,
  )?.object;
  if (!first || !rest) return [term];
  return [
    first,
    ...expandRdfListTerm(rest, dataQuads, [...trail, loopKey]),
  ];
}

function convertTermValue(term, datatypeHint = null) {
  if (!term) return undefined;
  if (term.termType === "Literal") {
    const datatype = (datatypeHint || term.datatype?.value || "").toLowerCase();
    if (datatype === "http://www.w3.org/2001/xmlschema#integer") {
      return Number.parseInt(term.value, 10);
    }
    if (
      datatype === "http://www.w3.org/2001/xmlschema#decimal" ||
      datatype === "http://www.w3.org/2001/xmlschema#double" ||
      datatype === "http://www.w3.org/2001/xmlschema#float"
    ) {
      return Number.parseFloat(term.value);
    }
    if (datatype === "http://www.w3.org/2001/xmlschema#boolean") {
      return term.value === "true";
    }
    if (datatype === "http://www.w3.org/2001/xmlschema#datetime") {
      return new Date(term.value);
    }
    return term.value;
  }
  return term.value;
}

function normalizeExtractedValue(value, dataQuads) {
  if (Array.isArray(value)) {
    return value.map((item) => normalizeExtractedValue(item, dataQuads));
  }
  if (!value || typeof value !== "object") return value;
  if (typeof value.termType === "string" && typeof value.value === "string") {
    const expanded = expandRdfListTerm(value, dataQuads);
    if (
      expanded.length > 1 ||
      (expanded.length === 1 && expanded[0].value !== value.value)
    ) {
      return expanded.map((term) => normalizeExtractedValue(term, dataQuads));
    }
    return convertTermValue(value);
  }
  const out = {};
  for (const [key, item] of Object.entries(value)) {
    out[key] = normalizeExtractedValue(item, dataQuads);
  }
  return out;
}
