import { describe, it, expect } from "vitest";
import { buildShaclFromDescriptors } from "../../src/utils/rdf-lens-shacl.js";

describe("buildShaclFromDescriptors", () => {
  it("builds a shape with single-step and multi-hop paths", () => {
    const ttl = buildShaclFromDescriptors([
      { path: ["http://purl.org/dc/terms/title"], name: "title" },
      {
        path: [
          "http://www.w3.org/2004/02/skos/core#member",
          "http://www.w3.org/2000/01/rdf-schema#label",
        ],
        name: "memberLabel",
      },
    ]);

    expect(ttl).toContain("sh:path <http://purl.org/dc/terms/title>");
    expect(ttl).toContain(
      "sh:path ( <http://www.w3.org/2004/02/skos/core#member> <http://www.w3.org/2000/01/rdf-schema#label> )"
    );
  });

  it("maps filter types to xsd datatype and maxCount", () => {
    const ttl = buildShaclFromDescriptors([
      {
        path: ["https://example.org/x"],
        name: "x",
        filterType: "integer",
      },
      {
        path: ["https://example.org/tags"],
        name: "tags",
        isList: true,
      },
    ]);

    expect(ttl).toContain("sh:datatype xsd:integer");
    expect(ttl).toContain('sh:name "x"');
    expect(ttl).toContain('sh:name "tags"');
    expect(ttl).toContain("sh:maxCount 1");
  });

  it("deduplicates same path and keeps list cardinality", () => {
    const ttl = buildShaclFromDescriptors([
      { path: ["https://example.org/p"], name: "p", isList: false },
      { path: ["https://example.org/p"], name: "p2", isList: true },
    ]);

    const occurrences = ttl.match(/sh:path <https:\/\/example.org\/p>/g) || [];
    expect(occurrences).toHaveLength(1);
    expect(ttl).not.toContain("sh:maxCount 1");
  });

  it("returns empty string when no valid descriptors are provided", () => {
    expect(buildShaclFromDescriptors([])).toBe("");
    expect(buildShaclFromDescriptors([{ path: [] }])).toBe("");
  });
});
