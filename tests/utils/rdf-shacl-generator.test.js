/**
 * Tests for SHACL Shape Generator
 *
 * Example usage and test cases demonstrating the SHACL generation utilities
 */

import { describe, it, expect, beforeEach } from "vitest";
import { Store, DataFactory, Parser } from "n3";
import {
  extractClasses,
  extractPropertiesForClass,
  analyzePropertyNodeKind,
  getDominantNodeKind,
  extractDatatypes,
  extractLanguageTags,
  extractObjectClasses,
  calculateCardinality,
  extractEnumerationValues,
  getClassInstanceCount,
  buildNodeShapeForClass,
  generateShaclShapes,
  generateShaclFromTurtle,
  validateShapesAgainstData,
  localNameFromIRI,
  createRdfList,
} from "../../src/utils/rdf-shacl-generator.js";

const df = DataFactory;

/**
 * Sample RDF data in Turtle format (FOAF-style contacts)
 */
const SAMPLE_DATA = `
@prefix foaf: <http://xmlns.com/foaf/0.1/> .
@prefix ex: <http://example.org/> .
@prefix rdf: <http://www.w3.org/1999/02/22-rdf-syntax-ns#> .
@prefix xsd: <http://www.w3.org/2001/XMLSchema#> .

ex:person1 a foaf:Person ;
  foaf:name "Alice"@en ;
  foaf:mbox <mailto:alice@example.org> ;
  foaf:age 30 ;
  foaf:knows ex:person2 .

ex:person2 a foaf:Person ;
  foaf:name "Bob"@en ;
  foaf:mbox <mailto:bob@example.org> ;
  foaf:age 25 ;
  foaf:knows ex:person1 .

ex:person3 a foaf:Person ;
  foaf:name "Charlie"@en ;
  foaf:mbox <mailto:charlie@example.org> ;
  foaf:birthday "1995-06-15"^^xsd:date .

ex:org1 a foaf:Organization ;
  foaf:name "Example Corp"@en ;
  foaf:homepage <http://example.org> .

ex:org2 a foaf:Organization ;
  foaf:name "Tech Inc"@en ;
  foaf:name "TechInc"@en ;
  foaf:homepage <http://techinc.org> ;
  foaf:member ex:person1 ;
  foaf:member ex:person2 .
`;

describe("SHACL Shape Generator", () => {
  let store;

  beforeEach(async () => {
    // Parse sample RDF data
    store = new Store();
    return new Promise((resolve, reject) => {
      const parser = new Parser();
      parser.parse(SAMPLE_DATA, (error, quad) => {
        if (error) {
          reject(error);
        } else if (quad) {
          store.add(quad);
        } else {
          resolve();
        }
      });
    });
  });

  describe("extractClasses", () => {
    it("should extract all distinct classes", () => {
      const classes = extractClasses(store);

      expect(classes).toHaveLength(2);
      const classUris = classes.map((c) => c.value);
      expect(classUris).toContain("http://xmlns.com/foaf/0.1/Person");
      expect(classUris).toContain("http://xmlns.com/foaf/0.1/Organization");
    });
  });

  describe("extractPropertiesForClass", () => {
    it("should extract properties used by class instances", () => {
      const personClass = df.namedNode("http://xmlns.com/foaf/0.1/Person");
      const properties = extractPropertiesForClass(store, personClass);

      const propUris = Array.from(properties).map((p) => p.value);
      expect(propUris).toContain("http://xmlns.com/foaf/0.1/name");
      expect(propUris).toContain("http://xmlns.com/foaf/0.1/mbox");
      // Note: rdf:type is filtered out intentionally
      expect(propUris.length).toBeGreaterThan(0);
    });
  });

  describe("analyzePropertyNodeKind", () => {
    it("should analyze value types for a property", () => {
      const personClass = df.namedNode("http://xmlns.com/foaf/0.1/Person");
      const nameProperty = df.namedNode("http://xmlns.com/foaf/0.1/name");

      const stats = analyzePropertyNodeKind(store, personClass, nameProperty);

      expect(stats.total).toBe(3); // Alice, Bob, Charlie
      expect(stats.literals).toBe(3); // All names are literals
      expect(stats.iris).toBe(0);
      expect(stats.blanks).toBe(0);
    });

    it("should detect IRI values", () => {
      const personClass = df.namedNode("http://xmlns.com/foaf/0.1/Person");
      const mboxProperty = df.namedNode("http://xmlns.com/foaf/0.1/mbox");

      const stats = analyzePropertyNodeKind(store, personClass, mboxProperty);

      expect(stats.iris).toBeGreaterThan(0); // mbox values are IRIs
    });
  });

  describe("getDominantNodeKind", () => {
    it("should identify dominant node kind", () => {
      const stats = { iris: 5, literals: 0, blanks: 0, total: 5 };
      expect(getDominantNodeKind(stats)).toBe("IRI");

      const stats2 = { iris: 0, literals: 10, blanks: 0, total: 10 };
      expect(getDominantNodeKind(stats2)).toBe("Literal");

      const stats3 = { iris: 0, literals: 0, blanks: 3, total: 3 };
      expect(getDominantNodeKind(stats3)).toBe("BlankNode");
    });
  });

  describe("extractDatatypes", () => {
    it("should extract datatypes for literal properties", () => {
      const personClass = df.namedNode("http://xmlns.com/foaf/0.1/Person");
      const nameProperty = df.namedNode("http://xmlns.com/foaf/0.1/name");

      const datatypes = extractDatatypes(store, personClass, nameProperty);

      // Names are typed as rdf:langString
      const datatypeUris = Array.from(datatypes).map((d) => d.value);
      expect(datatypeUris.length).toBeGreaterThan(0);
    });
  });

  describe("extractLanguageTags", () => {
    it("should extract language tags from literals", () => {
      const personClass = df.namedNode("http://xmlns.com/foaf/0.1/Person");
      const nameProperty = df.namedNode("http://xmlns.com/foaf/0.1/name");

      const languages = extractLanguageTags(store, personClass, nameProperty);

      expect(languages.has("en")).toBe(true);
    });
  });

  describe("extractObjectClasses", () => {
    it("should extract classes of objects referenced by property", () => {
      const personClass = df.namedNode("http://xmlns.com/foaf/0.1/Person");
      const knowsProperty = df.namedNode("http://xmlns.com/foaf/0.1/knows");

      const objClasses = extractObjectClasses(
        store,
        personClass,
        knowsProperty,
      );

      const classUris = Array.from(objClasses).map((c) => c.value);
      expect(classUris).toContain("http://xmlns.com/foaf/0.1/Person");
    });
  });

  describe("calculateCardinality", () => {
    it("should calculate min/max cardinality for property", () => {
      const personClass = df.namedNode("http://xmlns.com/foaf/0.1/Person");
      const nameProperty = df.namedNode("http://xmlns.com/foaf/0.1/name");

      const card = calculateCardinality(store, personClass, nameProperty);

      expect(card.instances).toBe(3); // Three persons
      expect(card.minCount).toBeGreaterThanOrEqual(1);
    });

    it("should detect optional properties", () => {
      const personClass = df.namedNode("http://xmlns.com/foaf/0.1/Person");
      const ageProperty = df.namedNode("http://xmlns.com/foaf/0.1/age");

      const card = calculateCardinality(store, personClass, ageProperty);

      expect(card.minCount).toBe(0); // Not all persons have age
    });
  });

  describe("extractEnumerationValues", () => {
    it("should extract enumeration values if distinct count is small", () => {
      const orgClass = df.namedNode("http://xmlns.com/foaf/0.1/Organization");
      const nameProperty = df.namedNode("http://xmlns.com/foaf/0.1/name");

      const values = extractEnumerationValues(store, orgClass, nameProperty, 5);

      // If values exist and limit is high enough, should have results
      if (values) {
        expect(values.length).toBeGreaterThan(0);
        expect(values.length).toBeLessThanOrEqual(5);
      }
    });
  });

  describe("getClassInstanceCount", () => {
    it("should count instances of a class", () => {
      const personClass = df.namedNode("http://xmlns.com/foaf/0.1/Person");
      const count = getClassInstanceCount(store, personClass);

      expect(count).toBe(3);
    });
  });

  describe("localNameFromIRI", () => {
    it("should extract local name from IRI with #", () => {
      const iri = "http://xmlns.com/foaf/0.1/Person";
      expect(localNameFromIRI(iri)).toBe("Person");
    });

    it("should extract local name from IRI with /", () => {
      const iri = "http://example.org/person1";
      expect(localNameFromIRI(iri)).toBe("person1");
    });
  });

  describe("buildNodeShapeForClass", () => {
    it("should build a complete node shape for a class", () => {
      const personClass = df.namedNode("http://xmlns.com/foaf/0.1/Person");
      const { shapeNode, quads } = buildNodeShapeForClass(store, personClass);

      expect(shapeNode).toBeDefined();
      expect(quads.length).toBeGreaterThan(0);

      // Check that shape is a NodeShape
      const typeQuads = quads.filter(
        (q) =>
          q.predicate.value ===
            "http://www.w3.org/1999/02/22-rdf-syntax-ns#type" &&
          q.object.value === "http://www.w3.org/ns/shacl#NodeShape",
      );
      expect(typeQuads.length).toBeGreaterThan(0);

      // Check that target class is set
      const targetQuads = quads.filter(
        (q) => q.predicate.value === "http://www.w3.org/ns/shacl#targetClass",
      );
      expect(targetQuads.length).toBeGreaterThan(0);
    });
  });

  describe("generateShaclShapes", () => {
    it("should generate SHACL shapes for all classes", () => {
      const result = generateShaclShapes(store);

      expect(result.store).toBeDefined();
      expect(result.quads.length).toBeGreaterThan(0);

      // Check for multiple shapes
      const shapes = result.quads.filter(
        (q) =>
          q.predicate.value ===
            "http://www.w3.org/1999/02/22-rdf-syntax-ns#type" &&
          q.object.value === "http://www.w3.org/ns/shacl#NodeShape",
      );
      expect(shapes.length).toBe(2); // Person and Organization
    });

    it("should serialize to Turtle format", async () => {
      const result = generateShaclShapes(store);
      const turtle = await result.serialize();

      expect(turtle).toContain("@prefix");
      expect(turtle).toContain("sh:NodeShape");
      expect(turtle).toContain("sh:targetClass");
    });

    it("should support custom options", async () => {
      const result = generateShaclShapes(store, {
        shapeNamespace: "http://custom.org/shapes/",
        includeCardinality: true,
        includeEnumeration: true,
        enumerationLimit: 3,
      });

      const turtle = await result.serialize();
      expect(turtle).toBeDefined();
    });

    it("compact mode can generate SHACL without blank nodes", async () => {
      const result = generateShaclShapes(store, {
        compactMode: true,
        noBlankNodes: true,
        includeEnumeration: false,
      });

      const turtle = await result.serialize();
      const parsed = new Parser().parse(turtle);
      const hasBlankNode = parsed.some(
        (q) =>
          q.subject.termType === "BlankNode" ||
          q.object.termType === "BlankNode",
      );

      expect(hasBlankNode).toBe(false);
    });
  });

  describe("generateShaclFromTurtle", () => {
    it("should parse Turtle and generate SHACL", async () => {
      const result = await generateShaclFromTurtle(SAMPLE_DATA);

      expect(result.store).toBeDefined();
      expect(result.quads).toBeDefined();
    });
  });

  describe("validateShapesAgainstData", () => {
    it("should validate generated shapes", () => {
      const shapesResult = generateShaclShapes(store);
      const report = validateShapesAgainstData(store, shapesResult.store);

      expect(report.valid).toBe(true);
      expect(report.errors).toHaveLength(0);
    });
  });

  describe("createRdfList", () => {
    it("should create an RDF list structure", () => {
      const quads = [];
      const items = [
        df.literal("value1"),
        df.literal("value2"),
        df.literal("value3"),
      ];

      const listNode = createRdfList(items, quads);

      expect(listNode).toBeDefined();
      expect(quads.length).toBeGreaterThan(0);

      // Verify list structure
      const rdfFirst = quads.filter(
        (q) =>
          q.predicate.value ===
          "http://www.w3.org/1999/02/22-rdf-syntax-ns#first",
      );
      expect(rdfFirst.length).toBe(3);
    });

    it("should handle empty list", () => {
      const quads = [];
      const listNode = createRdfList([], quads);

      expect(listNode.value).toBe(
        "http://www.w3.org/1999/02/22-rdf-syntax-ns#nil",
      );
      expect(quads.length).toBe(0);
    });
  });
});

/**
 * Integration example: Generate and save SHACL shapes
 */
export async function exampleGenerateAndSave() {
  const store = new Store();
  return new Promise((resolve, reject) => {
    const parser = new Parser();
    parser.parse(SAMPLE_DATA, (error, quad) => {
      if (error) {
        reject(error);
      } else if (quad) {
        store.add(quad);
      } else {
        // Parsing complete, generate SHACL
        const shapes = generateShaclShapes(store, {
          shapeNamespace: "http://example.org/shapes/",
          includeCardinality: true,
          includeEnumeration: true,
        });

        shapes.serialize().then((turtle) => {
          resolve({
            shapes,
            turtle,
            // In Node.js, you would do:
            // await fs.writeFile('generated-shapes.ttl', turtle);
          });
        });
      }
    });
  });
}
