/**
 * test-marine-lens.js
 *
 * Standalone test script for experimenting with rdf-lens extraction
 * on the MarineInfo collection data.
 *
 * Usage: node test-marine-lens.js
 */

import { Parser } from "n3";
import {
  toRdfQuads,
  extractWithShapes,
} from "./src/utils/rdf-lens-extractor.js";

const MARINE_COLLECTION_URL = "https://marineinfo.org/id/collection/619";

/**
 * Define your SHACL shape here.
 * Using simple local namespaces like the unit tests
 */
const SHACL_SHAPE = `
@prefix sh:  <http://www.w3.org/ns/shacl#> .
@prefix xsd: <http://www.w3.org/2001/XMLSchema#> .
@prefix dct: <http://purl.org/dc/terms/> .
@prefix schema: <https://schema.org/> .
@prefix dcat: <http://www.w3.org/ns/dcat#> .

[] a sh:NodeShape ;
  sh:targetClass dcat:Catalog ;
  sh:property [
    sh:datatype xsd:string ;
    sh:name "title" ;
    sh:path dct:title ;
    sh:minCount 1 ;
    sh:maxCount 1
  ] , [
    sh:datatype xsd:string ;
    sh:name "name" ;
    sh:path schema:name ;
    sh:minCount 1 ;
    sh:maxCount 1
  ] , [
    sh:datatype xsd:string ;
    sh:name "description" ;
    sh:path dct:description ;
    sh:maxCount 1
  ] , [
    sh:datatype xsd:anyURI ;
    sh:name "publisher" ;
    sh:path dct:publisher ;
    sh:maxCount 1
  ] , [
    sh:datatype xsd:string ;
    sh:name "identifier" ;
    sh:path dct:identifier ;
    sh:maxCount 1
  ] , [
    sh:datatype xsd:anyURI ;
    sh:name "keywords" ;
    sh:path schema:keywords
  ] .
`;

/**
 * Serialize N3 quads the same way as the unit tests do
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

/**
 * Fetch RDF data from a URL
 */
async function fetchRdf(url) {
  console.log(`Fetching: ${url}`);
  const response = await fetch(url, {
    headers: {
      Accept:
        "text/turtle, application/rdf+xml, application/ld+json, application/n-triples, */*;q=0.5",
    },
  });

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${response.statusText}`);
  }

  const contentType = response.headers.get("content-type") || "";
  let format = "text/turtle";

  if (contentType.includes("application/ld+json"))
    format = "application/ld+json";
  else if (contentType.includes("application/rdf+xml"))
    format = "application/rdf+xml";
  else if (contentType.includes("application/n-triples"))
    format = "application/n-triples";

  const text = await response.text();
  console.log(`Received ${text.length} bytes as ${format}`);

  return { text, format };
}

/**
 * Parse RDF text into N3 quads
 */
function parseRdf(text, format) {
  return new Promise((resolve, reject) => {
    const parser = new Parser({ format });
    const quads = [];

    parser.parse(text, (error, quad, prefixes) => {
      if (error) {
        reject(error);
      } else if (quad) {
        quads.push(quad);
      } else {
        resolve(quads);
      }
    });
  });
}

/**
 * Display quads in a readable format
 */
function displayQuads(quads, limit = 10) {
  console.log(
    `\n=== First ${Math.min(limit, quads.length)} of ${quads.length} quads ===`,
  );
  for (let i = 0; i < Math.min(limit, quads.length); i++) {
    const q = quads[i];
    console.log(`  ${q.subject.value}`);
    console.log(`    ${q.predicate.value} ${q.object.value}`);
  }
  if (quads.length > limit) {
    console.log(`  ... and ${quads.length - limit} more`);
  }
}

/**
 * Find all rdf:type declarations in the data
 */
function findTypes(quads) {
  const RDF_TYPE = "http://www.w3.org/1999/02/22-rdf-syntax-ns#type";
  const types = new Map();

  for (const q of quads) {
    if (q.predicate.value === RDF_TYPE) {
      const subject = q.subject.value;
      if (!types.has(subject)) {
        types.set(subject, []);
      }
      types.get(subject).push(q.object.value);
    }
  }

  return types;
}

/**
 * Main execution
 */
async function main() {
  try {
    console.log("=".repeat(80));
    console.log("MarineInfo Lens Extraction Test");
    console.log("=".repeat(80));

    // Step 1: Fetch the data
    const { text, format } = await fetchRdf(MARINE_COLLECTION_URL);

    // Step 2: Parse data into N3 quads
    console.log("\n--- Parsing data quads ---");
    const dataQuads = await parseRdf(text, format);
    console.log(`✓ Parsed ${dataQuads.length} data quads`);

    // Display sample of the data
    displayQuads(dataQuads, 15);

    // Step 3: Find all types in the data
    console.log("\n--- RDF Types in the data ---");
    const types = findTypes(dataQuads);
    console.log(`Found ${types.size} typed resources:`);
    for (const [subject, typeList] of types) {
      console.log(`  ${subject}`);
      typeList.forEach((t) => console.log(`    → ${t}`));
    }

    // Step 4: Parse the SHACL shape
    console.log("\n--- Parsing SHACL shape ---");
    const shapeQuads = await parseRdf(SHACL_SHAPE, "text/turtle");
    console.log(`✓ Parsed ${shapeQuads.length} shape quads`);
    console.log("\nShape definition:");
    for (const q of shapeQuads) {
      console.log(
        `  ${q.subject.value} ${q.predicate.value} ${q.object.value}`,
      );
    }

    // Step 5: Convert to RDFJS format for rdf-lens
    console.log("\n--- Converting to RDFJS format ---");
    const dataRdfQuads = toRdfQuads(serializeQuads(dataQuads));

    const shapeRdfQuads = toRdfQuads(serializeQuads(shapeQuads));

    console.log(`✓ Converted data quads: ${dataRdfQuads.length}`);
    console.log(`✓ Converted shape quads: ${shapeRdfQuads.length}`);

    // Step 6: Extract with shapes
    console.log("\n--- Extracting with SHACL shapes ---");
    const result = extractWithShapes(dataRdfQuads, shapeRdfQuads);

    console.log("\n=== EXTRACTION RESULTS ===");
    console.log(JSON.stringify(result, null, 2));

    // Summary
    console.log("\n=== SUMMARY ===");
    const classCount = Object.keys(result).length;
    if (classCount === 0) {
      console.log("⚠ No data extracted!");
      console.log("\nPossible reasons:");
      console.log(
        "1. The data doesn't contain rdf:type declarations matching sh:targetClass",
      );
      console.log("2. The shape properties don't match the data predicates");
      console.log("3. Required fields (sh:minCount 1) are missing in the data");
      console.log(
        "\nTip: Check the 'RDF Types in the data' section above and adjust",
      );
      console.log("     your SHACL shape's sh:targetClass accordingly.");
    } else {
      console.log(`✓ Successfully extracted data for ${classCount} class(es)`);
      for (const [cls, items] of Object.entries(result)) {
        console.log(`  ${cls}: ${items.length} item(s)`);
      }
    }

    console.log("\n" + "=".repeat(80));
  } catch (error) {
    console.error("\n❌ Error:", error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

// Run the script
main();
