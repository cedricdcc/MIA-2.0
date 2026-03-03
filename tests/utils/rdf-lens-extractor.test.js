/**
 * rdf-lens-extractor.test.js
 *
 * Unit tests for src/utils/rdf-lens-extractor.js
 *
 * Tests verify:
 *  - toRdfQuads correctly reconstructs RDFJS quads from worker-serialised format
 *  - createPredicateLens returns a working predicate lens
 *  - extractWithLens runs a lens against a quad store
 *  - extractWithShapes extracts plain JS objects using SHACL shapes
 */

import { describe, it, expect } from "vitest";
import { Parser } from "n3";
import {
  toRdfQuads,
  createPredicateLens,
  extractWithLens,
  extractWithShapes,
} from "../../src/utils/rdf-lens-extractor.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Parse Turtle into N3 Quad objects. */
function parseTurtle(ttl) {
  return new Parser({ format: "text/turtle" }).parse(ttl);
}

/**
 * Simulate the serialisation that rdf-parser-worker.js performs, now
 * including datatype/language for Literal terms.
 */
function serializeQuads(quads) {
  return quads.map((q) => ({
    subject: { value: q.subject.value, termType: q.subject.termType },
    predicate: { value: q.predicate.value, termType: q.predicate.termType },
    object: {
      value: q.object.value,
      termType: q.object.termType,
      datatype: q.object.datatype
        ? {
            value: q.object.datatype.value,
            termType: q.object.datatype.termType,
          }
        : undefined,
      language: q.object.language || undefined,
    },
    graph: { value: q.graph.value, termType: q.graph.termType },
  }));
}

// ---------------------------------------------------------------------------
// toRdfQuads
// ---------------------------------------------------------------------------

describe("toRdfQuads", () => {
  it("converts NamedNode subjects, predicates and objects", () => {
    const source = parseTurtle(
      "<https://example.org/s> <https://example.org/p> <https://example.org/o> .",
    );
    const serialized = serializeQuads(source);
    const quads = toRdfQuads(serialized);

    expect(quads).toHaveLength(1);
    expect(quads[0].subject.termType).toBe("NamedNode");
    expect(quads[0].subject.value).toBe("https://example.org/s");
    expect(quads[0].predicate.value).toBe("https://example.org/p");
    expect(quads[0].object.value).toBe("https://example.org/o");
  });

  it("preserves plain string Literal values", () => {
    const source = parseTurtle(
      '<https://example.org/s> <https://example.org/p> "hello" .',
    );
    const quads = toRdfQuads(serializeQuads(source));

    expect(quads[0].object.termType).toBe("Literal");
    expect(quads[0].object.value).toBe("hello");
  });

  it("preserves typed Literal datatype", () => {
    const source = parseTurtle(
      '<https://example.org/s> <https://example.org/p> "42"^^<http://www.w3.org/2001/XMLSchema#integer> .',
    );
    const quads = toRdfQuads(serializeQuads(source));

    expect(quads[0].object.termType).toBe("Literal");
    expect(quads[0].object.datatype.value).toBe(
      "http://www.w3.org/2001/XMLSchema#integer",
    );
  });

  it("preserves language-tagged Literal", () => {
    const source = parseTurtle(
      '<https://example.org/s> <https://example.org/p> "hello"@en .',
    );
    const quads = toRdfQuads(serializeQuads(source));

    expect(quads[0].object.termType).toBe("Literal");
    expect(quads[0].object.language).toBe("en");
  });

  it("preserves BlankNode subjects", () => {
    const source = parseTurtle(
      "[] <https://example.org/p> <https://example.org/o> .",
    );
    const quads = toRdfQuads(serializeQuads(source));

    expect(quads[0].subject.termType).toBe("BlankNode");
  });

  it("returns an empty array for empty input", () => {
    expect(toRdfQuads([])).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// createPredicateLens
// ---------------------------------------------------------------------------

describe("createPredicateLens", () => {
  it("returns a lens that follows the given predicate", () => {
    const source = parseTurtle(`
      @prefix dct: <http://purl.org/dc/terms/> .
      <https://example.org/ds> dct:title "My Dataset" .
    `);
    const quads = toRdfQuads(serializeQuads(source));
    const titleLens = createPredicateLens("http://purl.org/dc/terms/title");

    const results = titleLens.execute({
      id: quads[0].subject,
      quads,
    });

    expect(results).toHaveLength(1);
    expect(results[0].id.value).toBe("My Dataset");
  });

  it("returns an empty array when the predicate has no matches", () => {
    const source = parseTurtle(
      "<https://example.org/s> <https://example.org/p> <https://example.org/o> .",
    );
    const quads = toRdfQuads(serializeQuads(source));
    const missingLens = createPredicateLens("http://example.org/missing");

    const results = missingLens.execute({ id: quads[0].subject, quads });
    expect(results).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// extractWithLens
// ---------------------------------------------------------------------------

describe("extractWithLens", () => {
  it("extracts values reachable via a predicate lens", () => {
    const source = parseTurtle(`
      @prefix foaf: <http://xmlns.com/foaf/0.1/> .
      <https://example.org/alice> foaf:name "Alice" ;
                                   foaf:name "Alice Liddell" .
    `);
    const quads = toRdfQuads(serializeQuads(source));
    const nameLens = createPredicateLens("http://xmlns.com/foaf/0.1/name");

    const results = extractWithLens(
      nameLens,
      "https://example.org/alice",
      quads,
    );

    expect(results.length).toBeGreaterThanOrEqual(1);
    const values = results.map((c) => c.id.value);
    expect(values).toContain("Alice");
  });

  it("supports chained lenses for multi-hop traversal", () => {
    const source = parseTurtle(`
      @prefix foaf: <http://xmlns.com/foaf/0.1/> .
      <https://example.org/alice> foaf:knows <https://example.org/bob> .
      <https://example.org/bob>   foaf:name  "Bob" .
    `);
    const quads = toRdfQuads(serializeQuads(source));
    const knowsNameLens = createPredicateLens(
      "http://xmlns.com/foaf/0.1/knows",
    ).thenFlat(createPredicateLens("http://xmlns.com/foaf/0.1/name"));

    const results = extractWithLens(
      knowsNameLens,
      "https://example.org/alice",
      quads,
    );

    expect(results).toHaveLength(1);
    expect(results[0].id.value).toBe("Bob");
  });
});

// ---------------------------------------------------------------------------
// extractWithShapes
// ---------------------------------------------------------------------------

describe("extractWithShapes", () => {
  it("extracts a plain JS object for a simple SHACL shape", () => {
    const dataTtl = `
      @prefix ex: <https://example.org/> .
      @prefix xsd: <http://www.w3.org/2001/XMLSchema#> .
      ex:point1 a ex:Point ;
                ex:x 5 ;
                ex:y 8 .
    `;

    const shapeTtl = `
      @prefix sh:  <http://www.w3.org/ns/shacl#> .
      @prefix ex:  <https://example.org/> .
      @prefix xsd: <http://www.w3.org/2001/XMLSchema#> .

      [] a sh:NodeShape ;
         sh:targetClass ex:Point ;
         sh:property [
           sh:name "x" ;
           sh:path ex:x ;
           sh:datatype xsd:integer ;
           sh:maxCount 1 ;
           sh:minCount 1
         ] , [
           sh:name "y" ;
           sh:path ex:y ;
           sh:datatype xsd:integer ;
           sh:maxCount 1 ;
           sh:minCount 1
         ] .
    `;

    const dataQuads = toRdfQuads(serializeQuads(parseTurtle(dataTtl)));
    const shapeQuads = toRdfQuads(serializeQuads(parseTurtle(shapeTtl)));

    const result = extractWithShapes(dataQuads, shapeQuads);

    expect(result["https://example.org/Point"]).toHaveLength(1);
    const point = result["https://example.org/Point"][0];
    expect(point.x).toBe(5);
    expect(point.y).toBe(8);
  });

  it("returns an empty object when no subjects match any shape", () => {
    const dataTtl = `
      @prefix ex: <https://example.org/> .
      ex:thing ex:prop "value" .
    `;
    const shapeTtl = `
      @prefix sh: <http://www.w3.org/ns/shacl#> .
      @prefix ex: <https://example.org/> .
      [] a sh:NodeShape ;
         sh:targetClass ex:Other .
    `;

    const dataQuads = toRdfQuads(serializeQuads(parseTurtle(dataTtl)));
    const shapeQuads = toRdfQuads(serializeQuads(parseTurtle(shapeTtl)));

    const result = extractWithShapes(dataQuads, shapeQuads);
    expect(Object.keys(result)).toHaveLength(0);
  });

  it("extracts list-based key/value pairs with fallback shape parsing", () => {
    const dataTtl = `
      @prefix ex: <https://example.org/> .
      ex:doc a ex:Doc ;
        ex:meta (
          [ ex:key "author" ; ex:value "alice" ]
          [ ex:key "year" ; ex:value "2024" ]
        ) .
    `;

    const shapeTtl = `
      @prefix sh:  <http://www.w3.org/ns/shacl#> .
      @prefix ex:  <https://example.org/> .

      [] a sh:NodeShape ;
         sh:targetClass ex:Pair ;
         sh:property [
           sh:name "key" ;
           sh:path ex:key ;
           sh:maxCount 1 ;
           sh:minCount 1
         ] , [
           sh:name "value" ;
           sh:path ex:value ;
           sh:maxCount 1 ;
           sh:minCount 1
         ] .

      [] a sh:NodeShape ;
         sh:targetClass ex:Doc ;
         sh:property [
           sh:name "meta" ;
           sh:path ex:meta ;
           sh:class ex:Pair
         ] .
    `;

    const dataQuads = toRdfQuads(serializeQuads(parseTurtle(dataTtl)));
    const shapeQuads = toRdfQuads(serializeQuads(parseTurtle(shapeTtl)));

    const result = extractWithShapes(dataQuads, shapeQuads);
    expect(result["https://example.org/Doc"]).toHaveLength(1);
    expect(result["https://example.org/Doc"][0]).toEqual({
      meta: [
        { key: "author", value: "alice" },
        { key: "year", value: "2024" },
      ],
    });
  });
});
