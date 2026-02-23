/**
 * rdf-parser.test.js
 *
 * Unit tests for the RDF parsing logic (N3.js).
 *
 * Because Web Workers are not available in jsdom/Node, we test the N3 Parser
 * directly — which is what the worker delegates to — so the parsing logic is
 * fully covered without spinning up a worker.
 */

import { describe, it, expect } from "vitest";
import { Parser } from "n3";

// ---------------------------------------------------------------------------
// Helper
// ---------------------------------------------------------------------------

function parse(text, format = "text/turtle") {
  const parser = new Parser({ format });
  return parser.parse(text);
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("RDF parsing (N3.js)", () => {
  it("parses a simple Turtle triple", () => {
    const ttl = `<https://example.org/s> <https://example.org/p> "hello" .`;
    const quads = parse(ttl);

    expect(quads).toHaveLength(1);
    expect(quads[0].subject.value).toBe("https://example.org/s");
    expect(quads[0].predicate.value).toBe("https://example.org/p");
    expect(quads[0].object.value).toBe("hello");
  });

  it("parses Turtle with prefixes", () => {
    const ttl = `
      @prefix dct: <http://purl.org/dc/terms/> .
      <https://example.org/ds> dct:title "My Dataset" .
    `;
    const quads = parse(ttl);

    expect(quads).toHaveLength(1);
    expect(quads[0].predicate.value).toBe(
      "http://purl.org/dc/terms/title"
    );
    expect(quads[0].object.value).toBe("My Dataset");
  });

  it("parses multiple triples", () => {
    const ttl = `
      @prefix foaf: <http://xmlns.com/foaf/0.1/> .
      <https://example.org/alice> foaf:name "Alice" ;
                                   foaf:age  "30"^^<http://www.w3.org/2001/XMLSchema#integer> .
    `;
    const quads = parse(ttl);
    expect(quads).toHaveLength(2);
  });

  it("throws on malformed Turtle", () => {
    expect(() => parse("this is not valid turtle !!")).toThrow();
  });

  it("parses N-Triples format", () => {
    const nt = `<https://example.org/s> <https://example.org/p> <https://example.org/o> .\n`;
    const quads = parse(nt, "application/n-triples");

    expect(quads).toHaveLength(1);
    expect(quads[0].object.termType).toBe("NamedNode");
  });

  it("returns an empty array for an empty document", () => {
    const quads = parse("");
    expect(quads).toHaveLength(0);
  });
});
