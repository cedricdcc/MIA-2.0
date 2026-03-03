/**
 * roundtrip-example.js
 *
 * Full round-trip demonstration:
 * 1. Load RDF data from a URI
 * 2. Auto-generate SHACL shapes from the data
 * 3. Use rdf-lens to extract structured objects
 *
 * Usage: node roundtrip-example.js [URI]
 *
 * Example:
 *   node roundtrip-example.js https://data.emobon.embrc.eu/metadata.ttl
 *   node roundtrip-example.js ./public/rdf-data/marineinfo-collection.ttl
 */

import { Parser } from "n3";
import { readFile } from "fs/promises";
import {
  toRdfQuads,
  extractWithShapes,
} from "./src/utils/rdf-lens-extractor.js";
import { generateShaclShapes } from "./src/utils/shacl-generator.js";

// Default URI if none provided
const DEFAULT_URI = "https://data.emobon.embrc.eu/metadata.ttl";

/**
 * Fetch RDF data from a URL or local file
 * @param {string} uri - URL or file path
 * @returns {Promise<{text: string, format: string}>}
 */
async function fetchRdf(uri) {
  console.log(`📥 Fetching RDF data from: ${uri}`);

  // Check if it's a local file path
  if (uri.startsWith("./") || uri.startsWith("../") || uri.includes(":\\")) {
    try {
      const text = await readFile(uri, "utf-8");
      console.log(`✓ Loaded ${text.length} bytes from local file`);
      return { text, format: "text/turtle" };
    } catch (error) {
      throw new Error(`Failed to read local file: ${error.message}`);
    }
  }

  // Fetch from URL
  const response = await fetch(uri, {
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

  if (contentType.includes("application/ld+json")) {
    format = "application/ld+json";
  } else if (contentType.includes("application/rdf+xml")) {
    format = "application/rdf+xml";
  } else if (contentType.includes("application/n-triples")) {
    format = "application/n-triples";
  }

  const text = await response.text();
  console.log(`✓ Received ${text.length} bytes as ${format}`);

  return { text, format };
}

/**
 * Parse RDF text into N3 quads
 * @param {string} text - RDF content
 * @param {string} format - RDF format
 * @returns {Promise<Array>} N3 quads
 */
function parseRdf(text, format) {
  return new Promise((resolve, reject) => {
    const parser = new Parser({ format });
    const quads = [];

    parser.parse(text, (error, quad) => {
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
 * Serialize N3 quads for rdf-lens
 * @param {Array} quads - N3 quads
 * @returns {Array} Serialized quads
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
 * Analyze RDF data to find classes and properties
 * @param {Array} quads - N3 quads
 * @returns {Object} Schema information
 */
function analyzeSchema(quads) {
  const RDF_TYPE = "http://www.w3.org/1999/02/22-rdf-syntax-ns#type";
  const classes = new Map();
  const properties = new Set();
  const instances = new Set();

  for (const quad of quads) {
    if (quad.predicate.value === RDF_TYPE) {
      const type = quad.object.value;
      if (!classes.has(type)) {
        classes.set(type, 0);
      }
      classes.set(type, classes.get(type) + 1);
      instances.add(quad.subject.value);
    }
    properties.add(quad.predicate.value);
  }

  return {
    totalTriples: quads.length,
    classes: Array.from(classes.entries()).map(([uri, count]) => ({
      uri,
      count,
    })),
    propertiesCount: properties.size,
    instancesCount: instances.size,
  };
}

/**
 * Display a summary box
 * @param {string} title - Box title
 * @param {Object} content - Content to display
 */
function displayBox(title, content) {
  const width = 80;
  const line = "═".repeat(width);
  const titleLine = `╔${line}╗`;
  const bottomLine = `╚${line}╝`;

  console.log("\n" + titleLine);
  console.log(`║ ${title.padEnd(width - 2)} ║`);
  console.log(`╠${line}╣`);

  if (typeof content === "string") {
    const lines = content.split("\n");
    lines.forEach((line) => {
      console.log(`║ ${line.padEnd(width - 2)} ║`);
    });
  } else {
    const text = JSON.stringify(content, null, 2);
    const lines = text.split("\n");
    lines.forEach((line) => {
      if (line.length > width - 4) {
        line = line.substring(0, width - 7) + "...";
      }
      console.log(`║ ${line.padEnd(width - 2)} ║`);
    });
  }

  console.log(bottomLine);
}

/**
 * Main execution
 */
async function main() {
  const startTime = Date.now();

  // Get URI from command line or use default
  const uri = process.argv[2] || DEFAULT_URI;

  console.log("\n" + "═".repeat(80));
  console.log("  🔄 RDF ROUND-TRIP: LOAD → GENERATE SHACL → EXTRACT");
  console.log("═".repeat(80));

  try {
    // ========================================
    // STEP 1: Fetch RDF Data
    // ========================================
    console.log("\n📍 STEP 1: Fetch RDF Data");
    console.log("─".repeat(80));

    const { text, format } = await fetchRdf(uri);

    // ========================================
    // STEP 2: Parse RDF Data
    // ========================================
    console.log("\n📍 STEP 2: Parse RDF Data");
    console.log("─".repeat(80));

    console.log(`🔄 Parsing RDF as ${format}...`);
    const dataQuads = await parseRdf(text, format);
    console.log(`✓ Parsed ${dataQuads.length} triples`);

    // Analyze the schema
    const schema = analyzeSchema(dataQuads);
    displayBox("SCHEMA ANALYSIS", {
      totalTriples: schema.totalTriples,
      classesFound: schema.classes.length,
      uniqueProperties: schema.propertiesCount,
      instances: schema.instancesCount,
      topClasses: schema.classes.slice(0, 5).map((c) => ({
        class: c.uri.split(/[#/]/).pop(),
        instances: c.count,
      })),
    });

    // ========================================
    // STEP 3: Generate SHACL Shapes
    // ========================================
    console.log("\n📍 STEP 3: Generate SHACL Shapes");
    console.log("─".repeat(80));

    console.log("🔄 Analyzing data structure...");
    const shaclText = generateShaclShapes(dataQuads, {
      shapePrefix: "generated",
      shapeNamespace: "http://generated.example.org/shapes#",
      includeCardinality: true,
      minInstancesPerClass: 1,
    });

    console.log(`✓ Generated SHACL shapes (${shaclText.length} characters)`);

    // Display the generated SHACL (first 20 lines)
    const shaclLines = shaclText.split("\n");
    console.log("\n📄 Generated SHACL Shapes (preview):");
    console.log("┌" + "─".repeat(78) + "┐");
    shaclLines.slice(0, 20).forEach((line) => {
      const displayLine =
        line.length > 76 ? line.substring(0, 73) + "..." : line;
      console.log(`│ ${displayLine.padEnd(76)} │`);
    });
    if (shaclLines.length > 20) {
      console.log(
        `│ ... ${shaclLines.length - 20} more lines ...`.padEnd(78) + "│",
      );
    }
    console.log("└" + "─".repeat(78) + "┘");

    // ========================================
    // STEP 4: Parse SHACL Shapes
    // ========================================
    console.log("\n📍 STEP 4: Parse SHACL Shapes");
    console.log("─".repeat(80));

    console.log("🔄 Parsing generated SHACL shapes...");
    const shapeQuads = await parseRdf(shaclText, "text/turtle");
    console.log(`✓ Parsed ${shapeQuads.length} shape triples`);

    // ========================================
    // STEP 5: Convert to RDFJS Format
    // ========================================
    console.log("\n📍 STEP 5: Convert to RDFJS Format");
    console.log("─".repeat(80));

    console.log("🔄 Converting quads to RDFJS format...");
    const dataRdfQuads = toRdfQuads(serializeQuads(dataQuads));
    const shapeRdfQuads = toRdfQuads(serializeQuads(shapeQuads));
    console.log(`✓ Converted ${dataRdfQuads.length} data quads`);
    console.log(`✓ Converted ${shapeRdfQuads.length} shape quads`);

    // ========================================
    // STEP 6: Extract with rdf-lens
    // ========================================
    console.log("\n📍 STEP 6: Extract Structured Data with rdf-lens");
    console.log("─".repeat(80));

    console.log("🔄 Running rdf-lens extraction...");
    const result = extractWithShapes(dataRdfQuads, shapeRdfQuads);

    // Count extracted objects
    let totalObjects = 0;
    const extractionSummary = {};

    for (const [className, items] of Object.entries(result)) {
      const count = Array.isArray(items) ? items.length : 1;
      totalObjects += count;
      extractionSummary[className.split(/[#/]/).pop()] = count;
    }

    console.log(
      `✓ Extracted ${totalObjects} objects across ${Object.keys(result).length} classes`,
    );

    displayBox("EXTRACTION SUMMARY", extractionSummary);

    // ========================================
    // STEP 7: Display Results
    // ========================================
    console.log("\n📍 STEP 7: Display Extracted Data");
    console.log("─".repeat(80));

    console.log("\n📦 Extracted Objects (JSON):\n");
    console.log(JSON.stringify(result, null, 2));

    // ========================================
    // Summary
    // ========================================
    const endTime = Date.now();
    const duration = ((endTime - startTime) / 1000).toFixed(2);

    console.log("\n" + "═".repeat(80));
    console.log("  ✅ ROUND-TRIP COMPLETED SUCCESSFULLY");
    console.log("═".repeat(80));

    console.log("\n📊 Final Statistics:");
    console.log(`   • Source URI:        ${uri}`);
    console.log(`   • Total Triples:     ${schema.totalTriples}`);
    console.log(`   • Classes Found:     ${schema.classes.length}`);
    console.log(`   • Shapes Generated:  ${schema.classes.length}`);
    console.log(`   • Objects Extracted: ${totalObjects}`);
    console.log(`   • Execution Time:    ${duration}s`);

    if (totalObjects === 0) {
      console.log("\n⚠️  WARNING: No objects were extracted!");
      console.log("    This might happen if:");
      console.log("    • The data doesn't match the generated shape patterns");
      console.log("    • Required properties (sh:minCount 1) are missing");
      console.log("    • The rdf:type declarations don't match sh:targetClass");
      console.log(
        "\n    💡 Tip: Review the generated SHACL shapes above and adjust",
      );
      console.log("           the minInstancesPerClass option if needed.");
    }

    console.log("\n" + "═".repeat(80) + "\n");
  } catch (error) {
    console.error("\n❌ ERROR:", error.message);
    console.error("\n" + error.stack);
    process.exit(1);
  }
}

// Run the script
main();
