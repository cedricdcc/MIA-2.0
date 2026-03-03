/**
 * generate-shacl-example.js
 *
 * Example script showing how to use the SHACL shape generator.
 * This script analyzes an RDF triplestore and automatically generates
 * SHACL shape definitions.
 *
 * Usage: node generate-shacl-example.js
 */

import {
  generateShaclShapes,
  generateShaclFromRdf,
  generateShaclFromUrl,
} from "./src/utils/shacl-generator.js";
import { Parser } from "n3";

// Example 1: Generate from local RDF data
const EXAMPLE_RDF_DATA = `
@prefix dcat:  <http://www.w3.org/ns/dcat#> .
@prefix dct:   <http://purl.org/dc/terms/> .
@prefix foaf:  <http://xmlns.com/foaf/0.1/> .
@prefix xsd:   <http://www.w3.org/2001/XMLSchema#> .
@prefix schema: <http://schema.org/> .

<http://example.org/catalog/1>
    a dcat:Catalog ;
    dct:identifier "catalog-001" ;
    dct:title "Example Data Catalog" ;
    dct:description "A sample catalog for testing" ;
    dcat:dataset <http://example.org/dataset/1>, <http://example.org/dataset/2> ;
    dct:creator <http://example.org/person/john> .

<http://example.org/dataset/1>
    a dcat:Dataset ;
    dct:title "Dataset One" ;
    dct:description "First example dataset" ;
    dcat:distribution <http://example.org/dist/1> ;
    schema:dateCreated "2024-01-15"^^xsd:date .

<http://example.org/dataset/2>
    a dcat:Dataset ;
    dct:title "Dataset Two" ;
    dct:description "Second example dataset" ;
    dcat:distribution <http://example.org/dist/2> ;
    schema:dateCreated "2024-02-20"^^xsd:date .

<http://example.org/dist/1>
    a dcat:Distribution ;
    dcat:accessURL <http://example.org/data/file1.csv> ;
    dct:format "text/csv" .

<http://example.org/dist/2>
    a dcat:Distribution ;
    dcat:accessURL <http://example.org/data/file2.json> ;
    dct:format "application/json" .

<http://example.org/person/john>
    a foaf:Person ;
    foaf:name "John Doe" ;
    foaf:mbox <mailto:john@example.org> .
`;

/**
 * Parse RDF text into quads
 */
async function parseRdfToQuads(rdfText, format = "text/turtle") {
  return new Promise((resolve, reject) => {
    const parser = new Parser({ format });
    const quads = [];

    parser.parse(rdfText, (error, quad, prefixes) => {
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
 * Example 1: Generate from parsed quads
 */
async function example1_FromQuads() {
  console.log("=".repeat(80));
  console.log("Example 1: Generate SHACL from parsed quads");
  console.log("=".repeat(80));

  const quads = await parseRdfToQuads(EXAMPLE_RDF_DATA);
  console.log(`✓ Parsed ${quads.length} quads from example data\n`);

  const shaclShape = generateShaclShapes(quads, {
    shapePrefix: "ex",
    shapeNamespace: "http://example.org/shapes#",
    includeCardinality: true,
    closed: false,
  });

  console.log(shaclShape);
  console.log("=".repeat(80));
}

/**
 * Example 2: Generate directly from RDF text
 */
async function example2_FromRdfText() {
  console.log("\n" + "=".repeat(80));
  console.log("Example 2: Generate SHACL directly from RDF text");
  console.log("=".repeat(80));

  const shaclShape = await generateShaclFromRdf(
    EXAMPLE_RDF_DATA,
    "text/turtle",
    {
      shapePrefix: "my",
      shapeNamespace: "http://my-shapes.example.org/",
      includeCardinality: true,
      minInstancesPerClass: 1,
    },
  );

  console.log(shaclShape);
  console.log("=".repeat(80));
}

/**
 * Example 3: Generate from remote URL
 */
async function example3_FromUrl() {
  console.log("\n" + "=".repeat(80));
  console.log("Example 3: Generate SHACL from remote RDF source");
  console.log("=".repeat(80));

  const MARINE_COLLECTION_URL = "https://data.emobon.embrc.eu/metadata.ttl";

  try {
    const shaclShape = await generateShaclFromUrl(MARINE_COLLECTION_URL, {
      shapePrefix: "emobon",
      shapeNamespace: "http://example.org/emobon/shapes#",
      includeCardinality: true,
      minInstancesPerClass: 1,
    });

    console.log(shaclShape);
    console.log("\n✓ Successfully generated SHACL shapes from remote URL");
  } catch (error) {
    console.error("❌ Error fetching from URL:", error.message);
    console.log(
      "(This is expected if you're offline or the URL is unreachable)",
    );
  }

  console.log("=".repeat(80));
}

/**
 * Example 4: Load from local file
 */
async function example4_FromLocalFile() {
  console.log("\n" + "=".repeat(80));
  console.log("Example 4: Generate SHACL from local file");
  console.log("=".repeat(80));

  try {
    const fs = await import("fs/promises");
    const rdfContent = await fs.readFile(
      "./public/rdf-data/marineinfo-collection.ttl",
      "utf-8",
    );

    const shaclShape = await generateShaclFromRdf(rdfContent, "text/turtle", {
      shapePrefix: "marine",
      shapeNamespace: "http://marine.example.org/shapes#",
      includeCardinality: true,
    });

    console.log(shaclShape);
    console.log("\n✓ Successfully generated SHACL shapes from local file");
  } catch (error) {
    console.error("❌ Error reading local file:", error.message);
    console.log("(File may not exist at the specified path)");
  }

  console.log("=".repeat(80));
}

/**
 * Main execution
 */
async function main() {
  try {
    await example1_FromQuads();
    await example2_FromRdfText();

    // Uncomment to try remote fetching (requires network)
    // await example3_FromUrl();

    // Uncomment to try local file (if you have the file)
    // await example4_FromLocalFile();

    console.log("\n✓ All examples completed successfully!");
    console.log("\nTip: You can now use the generated SHACL shapes with");
    console.log("     extractWithShapes() from rdf-lens-extractor.js");
  } catch (error) {
    console.error("\n❌ Error:", error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

// Run the examples
main();
