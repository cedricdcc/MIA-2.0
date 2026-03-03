/**
 * SHACL Shape Generator - Usage Guide and Examples
 *
 * This file demonstrates practical usage patterns for generating SHACL shapes
 * from RDF triplestores using the rdf-shacl-generator utilities.
 */

import { Store, Parser, Writer, DataFactory } from "n3";
import * as fs from "fs/promises";
import {
  generateShaclShapes,
  generateShaclFromTurtle,
  extractClasses,
  buildNodeShapeForClass,
  validateShapesAgainstData,
} from "./rdf-shacl-generator.js";

const df = DataFactory;

// ============================================================================
// EXAMPLE 1: Generate SHACL from Turtle File
// ============================================================================

/**
 * Load an RDF Turtle file and generate SHACL shapes
 * @param {string} filePath - Path to .ttl file
 * @param {Object} options - Generator options
 * @returns {Promise<string>} Generated SHACL as Turtle
 */
export async function generateShaclFromFile(filePath, options = {}) {
  try {
    // Read the Turtle file
    const turtleContent = await fs.readFile(filePath, "utf-8");

    // Generate SHACL shapes
    const shapes = await generateShaclFromTurtle(turtleContent, {
      shapeNamespace: options.shapeNamespace || "http://example.org/shapes/",
      includeCardinality: options.includeCardinality !== false,
      includeEnumeration: options.includeEnumeration !== false,
      enumerationLimit: options.enumerationLimit || 5,
    });

    return await shapes.serialize();
  } catch (error) {
    console.error("Error generating SHACL from file:", error);
    throw error;
  }
}

// ============================================================================
// EXAMPLE 2: Generate SHACL and Save to File
// ============================================================================

/**
 * Generate SHACL shapes and save to output file
 * @param {string} inputPath - Path to input .ttl file
 * @param {string} outputPath - Path to output .ttl file
 * @param {Object} options - Generator options
 */
export async function generateAndSaveShaclShapes(
  inputPath,
  outputPath,
  options = {},
) {
  try {
    const shaclTurtle = await generateShaclFromFile(inputPath, options);
    await fs.writeFile(outputPath, shaclTurtle, "utf-8");
    console.log(`✓ Generated SHACL shapes saved to: ${outputPath}`);
    return shaclTurtle;
  } catch (error) {
    console.error("Error:", error);
    throw error;
  }
}

// ============================================================================
// EXAMPLE 3: Interactive SHACL Generation with Custom Configuration
// ============================================================================

/**
 * Generate SHACL with detailed progress reporting
 * @param {string} turtleContent - RDF content in Turtle format
 * @param {Object} options - Generator options
 * @returns {Promise<Object>} Result with shapes, statistics, and serialization
 */
export async function generateShaclWithReport(turtleContent, options = {}) {
  console.log("📊 Starting SHACL shape generation...\n");

  const store = new Store();
  let quadCount = 0;

  return new Promise((resolve, reject) => {
    const parser = new Parser();

    parser.parse(turtleContent, (error, quad) => {
      if (error) {
        reject(error);
      } else if (quad) {
        store.add(quad);
        quadCount++;
      } else {
        // Parsing complete
        console.log(`✓ Parsed ${quadCount} RDF quads\n`);

        // Extract classes
        const classes = extractClasses(store);
        console.log(`📦 Found ${classes.length} classes:`);
        classes.forEach((c) => console.log(`   - ${c.value}`));
        console.log();

        // Generate shapes
        console.log("🔨 Generating SHACL shapes...");
        const shapes = generateShaclShapes(store, {
          shapeNamespace:
            options.shapeNamespace || "http://example.org/shapes/",
          includeCardinality: options.includeCardinality !== false,
          includeEnumeration: options.includeEnumeration !== false,
          enumerationLimit: options.enumerationLimit || 5,
        });

        console.log(`✓ Generated ${shapes.quads.length} SHACL quads`);
        console.log(`✓ Created ${classes.length} shape(s)\n`);

        // Validation
        console.log("🔍 Validating shapes...");
        const report = validateShapesAgainstData(store, shapes.store);
        if (report.valid) {
          console.log("✓ Shapes validated successfully\n");
        } else {
          console.warn("⚠ Validation warnings:");
          report.errors.forEach((err) => console.warn(`   - ${err}`));
          console.log();
        }

        // Serialize
        shapes.serialize().then((turtle) => {
          console.log("📝 Serialization complete\n");
          resolve({
            shapes,
            turtle,
            statistics: {
              inputQuads: quadCount,
              outputQuads: shapes.quads.length,
              classes: classes.length,
              valid: report.valid,
            },
          });
        });
      }
    });
  });
}

// ============================================================================
// EXAMPLE 4: Programmatic SHACL Generation for Specific Classes
// ============================================================================

/**
 * Generate SHACL shapes only for selected classes
 * @param {Store} rdfStore - N3 Store with RDF data
 * @param {string[]} classUris - Array of class IRIs to generate shapes for
 * @param {Object} options - Generator options
 * @returns {Object} Store with selected shapes
 */
export function generateShaclForSelectedClasses(
  rdfStore,
  classUris,
  options = {},
) {
  const customShapesStore = new Store();

  classUris.forEach((classUri) => {
    const classNode = df.namedNode(classUri);
    const { quads } = buildNodeShapeForClass(rdfStore, classNode, options);
    quads.forEach((quad) => customShapesStore.add(quad));
  });

  return customShapesStore;
}

// ============================================================================
// EXAMPLE 5: SHACL Generation with Custom Prefixes
// ============================================================================

/**
 * Generate SHACL with custom namespace prefixes
 * @param {string} turtleContent - RDF content
 * @param {Object} customPrefixes - Custom prefix mappings
 * @returns {Promise<string>} Serialized SHACL with custom prefixes
 */
export async function generateShaclWithCustomPrefixes(
  turtleContent,
  customPrefixes = {},
) {
  const shapes = await generateShaclFromTurtle(turtleContent);

  return shapes.serialize({
    ex: "http://example.org/",
    foaf: "http://xmlns.com/foaf/0.1/",
    skos: "http://www.w3.org/2004/02/skos/core#",
    dcat: "http://www.w3.org/ns/dcat#",
    ...customPrefixes,
  });
}

// ============================================================================
// EXAMPLE 6: Batch SHACL Generation from Multiple Files
// ============================================================================

/**
 * Generate SHACL shapes from multiple RDF files
 * @param {string} inputDirectory - Directory containing .ttl files
 * @param {string} outputDirectory - Directory for generated .ttl files
 */
export async function generateShaclBatch(inputDirectory, outputDirectory) {
  try {
    // Create output directory if it doesn't exist
    await fs.mkdir(outputDirectory, { recursive: true });

    // Get all .ttl files
    const files = await fs.readdir(inputDirectory);
    const ttlFiles = files.filter((f) => f.endsWith(".ttl"));

    console.log(`Found ${ttlFiles.length} RDF files to process\n`);

    for (const file of ttlFiles) {
      const inputPath = `${inputDirectory}/${file}`;
      const outputPath = `${outputDirectory}/shapes_${file}`;

      console.log(`Processing: ${file}`);
      try {
        await generateAndSaveShaclShapes(inputPath, outputPath);
      } catch (error) {
        console.error(`  ✗ Failed: ${error.message}`);
      }
    }

    console.log("\n✓ Batch processing complete");
  } catch (error) {
    console.error("Batch processing error:", error);
    throw error;
  }
}

// ============================================================================
// EXAMPLE 7: Incremental SHACL Generation
// ============================================================================

/**
 * Generate SHACL incrementally as data is added
 * Class that manages RDF store and shapes
 */
export class IncrementalShaclGenerator {
  constructor(options = {}) {
    this.rdfStore = new Store();
    this.options = {
      shapeNamespace: "http://example.org/shapes/",
      includeCardinality: true,
      includeEnumeration: true,
      enumerationLimit: 5,
      ...options,
    };
  }

  /**
   * Add RDF quads to the store
   * @param {Quad[]} quads - Array of N3 quads
   */
  addQuads(quads) {
    quads.forEach((quad) => this.rdfStore.add(quad));
  }

  /**
   * Add RDF from Turtle string
   * @param {string} turtleContent - Turtle format RDF
   */
  addTurtle(turtleContent) {
    return new Promise((resolve, reject) => {
      const parser = new Parser();
      parser.parse(turtleContent, (error, quad) => {
        if (error) reject(error);
        else if (quad) this.rdfStore.add(quad);
        else resolve();
      });
    });
  }

  /**
   * Get current SHACL shapes
   * @returns {Promise<string>} Serialized SHACL Turtle
   */
  async getShaclTurtle() {
    const shapes = generateShaclShapes(this.rdfStore, this.options);
    return shapes.serialize();
  }

  /**
   * Get statistics about current data and shapes
   * @returns {Object} Statistics
   */
  getStatistics() {
    let quadCount = 0;
    for (const _ of this.rdfStore.match(null, null, null, null)) {
      quadCount++;
    }

    const classes = extractClasses(this.rdfStore);
    return {
      totalQuads: quadCount,
      classes: classes.length,
      classUris: classes.map((c) => c.value),
    };
  }
}

// ============================================================================
// EXAMPLE 8: Integration with Existing RDF Lens Code
// ============================================================================

/**
 * Generate SHACL from an already-parsed RDF lens dataset
 * @param {Store} lensStore - RDF lens store with lens definitions
 * @param {Store} dataStore - Data RDF store
 * @returns {Promise<Object>} SHACL shapes object
 */
export async function generateShaclFromLensedData(lensStore, dataStore) {
  // The lens store might contain lens definitions
  // We generate shapes from the actual data in dataStore
  const shapes = generateShaclShapes(dataStore, {
    shapeNamespace: "http://example.org/auto-shapes/",
    includeCardinality: true,
  });

  return {
    shapes,
    turtle: await shapes.serialize(),
    lensStore, // Original lens definitions
  };
}

// ============================================================================
// EXAMPLE 9: SHACL Generation with Error Handling
// ============================================================================

/**
 * Safe SHACL generation with comprehensive error handling
 * @param {string} turtleContent - RDF content
 * @returns {Promise<Object>} Result with success flag and data/error
 */
export async function generateShaclSafely(turtleContent) {
  const result = {
    success: false,
    data: null,
    error: null,
    warnings: [],
  };

  try {
    // Validate input
    if (!turtleContent || typeof turtleContent !== "string") {
      throw new Error("Invalid Turtle content: must be a non-empty string");
    }

    // Parse and generate
    const shapes = await generateShaclFromTurtle(turtleContent);

    // Check for data issues
    if (shapes.quads.length === 0) {
      result.warnings.push("No RDF classes found in input data");
    }

    // Serialize
    const turtle = await shapes.serialize();

    if (!turtle || turtle.length === 0) {
      throw new Error("Serialization produced empty output");
    }

    result.success = true;
    result.data = {
      turtle,
      quadCount: shapes.quads.length,
    };
  } catch (error) {
    result.error = {
      message: error.message,
      stack: error.stack,
    };
  }

  return result;
}

// ============================================================================
// EXAMPLE 10: Command-Line Interface
// ============================================================================

/**
 * CLI entrypoint for SHACL generation
 * Usage: node rdf-shacl-generator-examples.js <input.ttl> [output.ttl]
 */
export async function cliMain() {
  const args = process.argv.slice(2);

  if (args.length === 0) {
    console.log(`
Usage: node rdf-shacl-generator-examples.js <input.ttl> [output.ttl]

Examples:
  node rdf-shacl-generator-examples.js data.ttl
  node rdf-shacl-generator-examples.js data.ttl shapes.ttl

Options can be set via environment variables:
  SHAPE_NAMESPACE - Base URI for shapes (default: http://example.org/shapes/)
  INCLUDE_CARDINALITY - Include min/max counts (default: true)
  INCLUDE_ENUMERATION - Include value enumerations (default: true)
    `);
    return;
  }

  const inputPath = args[0];
  const outputPath = args[1] || `${inputPath.replace(/\.ttl$/, "")}_shapes.ttl`;

  const options = {
    shapeNamespace: process.env.SHAPE_NAMESPACE || "http://example.org/shapes/",
    includeCardinality: process.env.INCLUDE_CARDINALITY !== "false",
    includeEnumeration: process.env.INCLUDE_ENUMERATION !== "false",
  };

  try {
    console.log("🚀 SHACL Shape Generator\n");
    const result = await generateShaclWithReport(
      await fs.readFile(inputPath, "utf-8"),
      options,
    );
    await fs.writeFile(outputPath, result.turtle, "utf-8");
    console.log(`✅ Success! Shapes saved to: ${outputPath}`);
  } catch (error) {
    console.error("❌ Error:", error.message);
    process.exit(1);
  }
}

// Run CLI if this file is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  cliMain();
}
