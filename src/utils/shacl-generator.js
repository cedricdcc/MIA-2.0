/**
 * shacl-generator.js
 *
 * Utility to analyze an RDF triplestore and automatically generate
 * SHACL shape definitions based on the discovered schema.
 *
 * Usage:
 *   import { generateShaclShapes } from './shacl-generator.js';
 *
 *   const quads = [...];  // Your N3 quads
 *   const shaclTurtle = generateShaclShapes(quads, {
 *     shapePrefix: 'ex',
 *     shapeNamespace: 'http://example.org/shapes#',
 *     includeCardinality: true,
 *     closed: false
 *   });
 *
 *   console.log(shaclTurtle);
 */

const RDF_TYPE = "http://www.w3.org/1999/02/22-rdf-syntax-ns#type";
const XSD_STRING = "http://www.w3.org/2001/XMLSchema#string";
const XSD_INTEGER = "http://www.w3.org/2001/XMLSchema#integer";
const XSD_DECIMAL = "http://www.w3.org/2001/XMLSchema#decimal";
const XSD_BOOLEAN = "http://www.w3.org/2001/XMLSchema#boolean";
const XSD_DATE = "http://www.w3.org/2001/XMLSchema#date";
const XSD_DATETIME = "http://www.w3.org/2001/XMLSchema#dateTime";

/**
 * Analyze the triplestore and build a schema map
 * @param {Array} quads - N3 quads array
 * @returns {Object} Schema analysis
 */
function analyzeSchema(quads) {
  const schema = {
    classes: new Map(), // className -> Set of instances
    properties: new Map(), // className -> Map<predicate, propertyInfo>
    instances: new Map(), // instance IRI -> Set of classes
    resourceTypes: new Map(), // resource IRI -> rdf:type values
  };

  // First pass: Find all typed resources
  for (const quad of quads) {
    if (quad.predicate.value === RDF_TYPE) {
      const subject = quad.subject.value;
      const type = quad.object.value;

      // Track instances per class
      if (!schema.classes.has(type)) {
        schema.classes.set(type, new Set());
      }
      schema.classes.get(type).add(subject);

      // Track classes per instance
      if (!schema.instances.has(subject)) {
        schema.instances.set(subject, new Set());
      }
      schema.instances.get(subject).add(type);

      // Track resource types
      if (!schema.resourceTypes.has(subject)) {
        schema.resourceTypes.set(subject, new Set());
      }
      schema.resourceTypes.get(subject).add(type);
    }
  }

  // Second pass: Analyze properties for each class
  for (const [className, instances] of schema.classes.entries()) {
    const classProps = new Map();

    for (const instance of instances) {
      // Find all properties for this instance
      for (const quad of quads) {
        if (
          quad.subject.value === instance &&
          quad.predicate.value !== RDF_TYPE
        ) {
          const predicate = quad.predicate.value;

          if (!classProps.has(predicate)) {
            classProps.set(predicate, {
              predicate,
              values: [],
              datatypes: new Set(),
              isObjectProperty: false,
              objectClasses: new Set(),
              minCount: 0,
              maxCount: 0,
              instanceCounts: new Map(), // instance -> count
            });
          }

          const propInfo = classProps.get(predicate);
          propInfo.values.push(quad.object.value);

          // Track counts per instance
          if (!propInfo.instanceCounts.has(instance)) {
            propInfo.instanceCounts.set(instance, 0);
          }
          propInfo.instanceCounts.set(
            instance,
            propInfo.instanceCounts.get(instance) + 1,
          );

          // Determine if it's an object property or datatype property
          if (
            quad.object.termType === "NamedNode" ||
            quad.object.termType === "BlankNode"
          ) {
            // Check if the object is a typed resource
            const objectTypes = schema.resourceTypes.get(quad.object.value);
            if (objectTypes && objectTypes.size > 0) {
              propInfo.isObjectProperty = true;
              objectTypes.forEach((type) => propInfo.objectClasses.add(type));
            }
          } else if (quad.object.termType === "Literal") {
            const datatype = quad.object.datatype?.value || XSD_STRING;
            propInfo.datatypes.add(datatype);
          }
        }
      }
    }

    // Calculate cardinality after analyzing all instances
    for (const [predicate, propInfo] of classProps.entries()) {
      const counts = Array.from(propInfo.instanceCounts.values());
      propInfo.minCount = Math.min(...counts);
      propInfo.maxCount = Math.max(...counts);
    }

    schema.properties.set(className, classProps);
  }

  return schema;
}

/**
 * Generate a safe local name from a URI
 * @param {string} uri - The URI to convert
 * @returns {string} Safe local name
 */
function uriToLocalName(uri) {
  // Extract the last part after # or /
  const match = uri.match(/[#/]([^#/]+)$/);
  if (match) {
    // Clean up the name: remove special chars, ensure it starts with a letter
    let name = match[1]
      .replace(/[^a-zA-Z0-9_-]/g, "_")
      .replace(/^[^a-zA-Z]+/, "");
    return name || "Shape";
  }
  return "Shape";
}

/**
 * Get a prefixed name from a URI based on common namespaces
 * @param {string} uri - The URI
 * @param {Object} prefixes - Namespace prefixes map (namespace: prefix)
 * @returns {string} Prefixed name or full URI in angle brackets
 */
function getPrefixedName(uri, prefixes) {
  for (const [namespace, prefix] of Object.entries(prefixes)) {
    if (uri.startsWith(namespace)) {
      const localName = uri.substring(namespace.length);
      return `${prefix}:${localName}`;
    }
  }
  return `<${uri}>`;
}

/**
 * Detect common namespaces from URIs
 * @param {Map} classes - Classes map
 * @param {Map} properties - Properties map
 * @returns {Object} Namespace prefixes
 */
function detectNamespaces(classes, properties) {
  const namespaces = new Map();
  const commonPrefixes = {
    "http://www.w3.org/ns/shacl#": "sh",
    "http://www.w3.org/2001/XMLSchema#": "xsd",
    "http://www.w3.org/1999/02/22-rdf-syntax-ns#": "rdf",
    "http://www.w3.org/2000/01/rdf-schema#": "rdfs",
    "http://purl.org/dc/terms/": "dct",
    "http://xmlns.com/foaf/0.1/": "foaf",
    "http://www.w3.org/ns/dcat#": "dcat",
    "http://schema.org/": "schema",
    "http://www.opengis.net/ont/geosparql#": "geosparql",
  };

  // Add common prefixes
  for (const [ns, prefix] of Object.entries(commonPrefixes)) {
    namespaces.set(prefix, ns);
  }

  // Detect namespaces from class URIs
  for (const classUri of classes.keys()) {
    const match = classUri.match(/^(.+[#/])[^#/]+$/);
    if (match) {
      const ns = match[1];
      if (!Array.from(namespaces.values()).includes(ns)) {
        // Find a good prefix
        const nsMatch = ns.match(/\/([^/]+)[/#]?$/);
        if (nsMatch) {
          const prefix = nsMatch[1].toLowerCase().substring(0, 8);
          namespaces.set(prefix, ns);
        }
      }
    }
  }

  // Convert to object with namespace as key
  const result = {};
  for (const [prefix, ns] of namespaces.entries()) {
    result[ns] = prefix;
  }

  return result;
}

/**
 * Generate property name from predicate URI
 * @param {string} predicate - Property URI
 * @returns {string} Property name
 */
function generatePropertyName(predicate) {
  const match = predicate.match(/[#/]([^#/]+)$/);
  if (match) {
    // Convert camelCase or kebab-case to readable form
    return match[1].replace(/_/g, "").replace(/-/g, "");
  }
  return "property";
}

/**
 * Generate SHACL shape in Turtle format
 * @param {Array} quads - N3 quads
 * @param {Object} options - Generation options
 * @returns {string} SHACL shape in Turtle format
 */
export function generateShaclShapes(quads, options = {}) {
  const {
    shapePrefix = "ex",
    shapeNamespace = "http://example.org/shapes#",
    includeCardinality = true,
    closed = false,
    minInstancesPerClass = 1, // Only generate shapes for classes with at least this many instances
  } = options;

  const schema = analyzeSchema(quads);
  const prefixes = detectNamespaces(schema.classes, schema.properties);
  prefixes[shapeNamespace] = shapePrefix;

  let turtle = "";

  // Write prefix declarations
  turtle += "# Auto-generated SHACL shapes\n";
  turtle += "# Generated on: " + new Date().toISOString() + "\n\n";

  for (const [namespace, prefix] of Object.entries(prefixes)) {
    turtle += `@prefix ${prefix}: <${namespace}> .\n`;
  }
  turtle += "\n";

  // Generate shapes for each class
  for (const [className, instances] of schema.classes.entries()) {
    if (instances.size < minInstancesPerClass) {
      continue; // Skip classes with too few instances
    }

    const classProps = schema.properties.get(className);
    if (!classProps || classProps.size === 0) {
      continue; // Skip classes with no properties
    }

    // Generate shape name
    const shapeName = `${shapePrefix}:${uriToLocalName(className)}Shape`;

    turtle += "# " + "─".repeat(60) + "\n";
    turtle += `# Shape for ${getPrefixedName(className, prefixes)}\n`;
    turtle += `# Found ${instances.size} instance(s)\n`;
    turtle += "# " + "─".repeat(60) + "\n\n";

    turtle += `${shapeName}\n`;
    turtle += `    a sh:NodeShape ;\n`;
    turtle += `    sh:targetClass ${getPrefixedName(className, prefixes)} ;\n\n`;

    // Generate properties
    const propArray = Array.from(classProps.values());
    for (let i = 0; i < propArray.length; i++) {
      const prop = propArray[i];
      const isLast = i === propArray.length - 1;

      turtle += `    sh:property [\n`;
      turtle += `        sh:name "${generatePropertyName(prop.predicate)}" ;\n`;
      turtle += `        sh:path ${getPrefixedName(prop.predicate, prefixes)} ;\n`;

      // Add datatype or class constraint
      if (prop.isObjectProperty && prop.objectClasses.size > 0) {
        const objectClass = Array.from(prop.objectClasses)[0];
        turtle += `        sh:class ${getPrefixedName(objectClass, prefixes)} ;\n`;
        // Could add sh:node reference if we want nested shapes
        const nestedShapeName = `${shapePrefix}:${uriToLocalName(objectClass)}Shape`;
        turtle += `        # sh:node ${nestedShapeName} ;\n`;
      } else if (prop.datatypes.size > 0) {
        const datatype = Array.from(prop.datatypes)[0];
        turtle += `        sh:datatype ${getPrefixedName(datatype, prefixes)} ;\n`;
      } else {
        // IRI or unknown
        turtle += `        sh:nodeKind sh:IRI ;\n`;
      }

      // Add cardinality constraints
      if (includeCardinality) {
        if (prop.minCount > 0) {
          turtle += `        sh:minCount ${prop.minCount} ;\n`;
        }
        if (prop.maxCount > 0 && prop.maxCount === prop.minCount) {
          turtle += `        sh:maxCount ${prop.maxCount} ;\n`;
        }
      }

      turtle += `    ]${isLast ? "" : " ;"}\n`;
      turtle += isLast ? "" : "\n";
    }

    // Add closing punctuation
    if (closed) {
      turtle += ` ;\n    sh:closed ${closed} .\n`;
    } else {
      turtle += ` .\n`;
    }

    turtle += "\n";
  }

  return turtle;
}

/**
 * Generate SHACL shapes from RDF text
 * @param {string} rdfText - RDF content (Turtle, JSON-LD, etc.)
 * @param {string} format - RDF format ('text/turtle', 'application/ld+json', etc.)
 * @param {Object} options - Generation options
 * @returns {Promise<string>} SHACL shape in Turtle format
 */
export async function generateShaclFromRdf(
  rdfText,
  format = "text/turtle",
  options = {},
) {
  const { Parser } = await import("n3");

  return new Promise((resolve, reject) => {
    const parser = new Parser({ format });
    const quads = [];

    parser.parse(rdfText, (error, quad, prefixes) => {
      if (error) {
        reject(error);
      } else if (quad) {
        quads.push(quad);
      } else {
        // Parsing complete
        const shaclTurtle = generateShaclShapes(quads, options);
        resolve(shaclTurtle);
      }
    });
  });
}

/**
 * Generate SHACL shapes from a remote RDF source
 * @param {string} url - URL to fetch RDF from
 * @param {Object} options - Generation options
 * @returns {Promise<string>} SHACL shape in Turtle format
 */
export async function generateShaclFromUrl(url, options = {}) {
  console.log(`Fetching RDF from: ${url}`);

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

  if (contentType.includes("application/ld+json")) {
    format = "application/ld+json";
  } else if (contentType.includes("application/rdf+xml")) {
    format = "application/rdf+xml";
  } else if (contentType.includes("application/n-triples")) {
    format = "application/n-triples";
  }

  const text = await response.text();
  console.log(`Received ${text.length} bytes as ${format}`);

  return generateShaclFromRdf(text, format, options);
}

export default {
  generateShaclShapes,
  generateShaclFromRdf,
  generateShaclFromUrl,
};
