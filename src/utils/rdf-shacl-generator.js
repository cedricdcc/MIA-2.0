/**
 * SHACL Shape Generator from RDF Triplestore
 *
 * Utilities to automatically generate SHACL shapes from an RDF dataset
 * by analyzing the data structure, properties, values, and constraints.
 *
 * Usage:
 *   import { generateShaclShapes } from './rdf-shacl-generator.js';
 *   const shapes = await generateShaclShapes(store, options);
 *   const ttl = shapes.serialize();
 */

import { Store, DataFactory, Writer, Parser } from "n3";

const df = DataFactory;

// Standard namespace IRIs
const NS = {
  rdf: "http://www.w3.org/1999/02/22-rdf-syntax-ns#",
  rdfs: "http://www.w3.org/2000/01/rdf-schema#",
  xsd: "http://www.w3.org/2001/XMLSchema#",
  sh: "http://www.w3.org/ns/shacl#",
  rdfx: "http://example.org/rdfx#", // Extended RDF predicates
};

/**
 * Extract all distinct classes (rdf:type values) from the store
 * @param {Store} store - N3 Store with RDF data
 * @returns {Term[]} Array of class IRIs
 */
export function extractClasses(store) {
  const classesByValue = new Map();
  const typeQuads = store.match(
    null,
    df.namedNode(NS.rdf + "type"),
    null,
    null,
  );

  for (const quad of typeQuads) {
    if (quad.object.termType === "NamedNode") {
      classesByValue.set(quad.object.value, quad.object);
    }
  }

  return Array.from(classesByValue.values());
}

/**
 * Extract all properties used by instances of a given class
 * @param {Store} store - N3 Store
 * @param {Term} classNode - Class IRI
 * @returns {Set<Term>} Set of property IRIs
 */
export function extractPropertiesForClass(store, classNode) {
  const propertiesByValue = new Map();
  const instances = store.match(
    null,
    df.namedNode(NS.rdf + "type"),
    classNode,
    null,
  );

  for (const quad of instances) {
    const instanceQuads = store.match(quad.subject, null, null, null);
    for (const instanceQuad of instanceQuads) {
      // Exclude rdf:type
      if (instanceQuad.predicate.value !== NS.rdf + "type") {
        propertiesByValue.set(instanceQuad.predicate.value, instanceQuad.predicate);
      }
    }
  }

  return new Set(propertiesByValue.values());
}

/**
 * Determine the node kind (IRI, Literal, BlankNode) distribution for a property
 * @param {Store} store - N3 Store
 * @param {Term} classNode - Class IRI
 * @param {Term} property - Property IRI
 * @returns {Object} Stats object { iris, literals, blanks, total }
 */
export function analyzePropertyNodeKind(store, classNode, property) {
  const stats = { iris: 0, literals: 0, blanks: 0, total: 0 };

  const instances = store.match(
    null,
    df.namedNode(NS.rdf + "type"),
    classNode,
    null,
  );

  for (const instanceQuad of instances) {
    const valueQuads = store.match(instanceQuad.subject, property, null, null);
    for (const valueQuad of valueQuads) {
      stats.total++;
      if (valueQuad.object.termType === "NamedNode") {
        stats.iris++;
      } else if (valueQuad.object.termType === "Literal") {
        stats.literals++;
      } else if (valueQuad.object.termType === "BlankNode") {
        stats.blanks++;
      }
    }
  }

  return stats;
}

/**
 * Get the dominant node kind for a property
 * @param {Object} nodeKindStats - Result from analyzePropertyNodeKind
 * @returns {string|null} 'IRI', 'Literal', 'BlankNode', or null if mixed
 */
export function getDominantNodeKind(nodeKindStats) {
  const { iris, literals, blanks, total } = nodeKindStats;
  if (total === 0) return null;

  const dominant = Math.max(iris, literals, blanks);
  if (dominant === iris) return "IRI";
  if (dominant === literals) return "Literal";
  if (dominant === blanks) return "BlankNode";
  return null;
}

/**
 * Extract distinct datatypes for a literal property
 * @param {Store} store - N3 Store
 * @param {Term} classNode - Class IRI
 * @param {Term} property - Property IRI
 * @returns {Set<Term>} Set of datatype IRIs
 */
export function extractDatatypes(store, classNode, property) {
  const datatypes = new Set();
  const instances = store.match(
    null,
    df.namedNode(NS.rdf + "type"),
    classNode,
    null,
  );

  for (const instanceQuad of instances) {
    const valueQuads = store.match(instanceQuad.subject, property, null, null);
    for (const valueQuad of valueQuads) {
      if (
        valueQuad.object.termType === "Literal" &&
        valueQuad.object.datatype
      ) {
        datatypes.add(valueQuad.object.datatype);
      }
    }
  }

  return datatypes;
}

/**
 * Extract distinct language tags for a literal property
 * @param {Store} store - N3 Store
 * @param {Term} classNode - Class IRI
 * @param {Term} property - Property IRI
 * @returns {Set<string>} Set of language tags
 */
export function extractLanguageTags(store, classNode, property) {
  const languages = new Set();
  const instances = store.match(
    null,
    df.namedNode(NS.rdf + "type"),
    classNode,
    null,
  );

  for (const instanceQuad of instances) {
    const valueQuads = store.match(instanceQuad.subject, property, null, null);
    for (const valueQuad of valueQuads) {
      if (
        valueQuad.object.termType === "Literal" &&
        valueQuad.object.language
      ) {
        languages.add(valueQuad.object.language);
      }
    }
  }

  return languages;
}

/**
 * Extract distinct object classes for an IRI/object property
 * @param {Store} store - N3 Store
 * @param {Term} classNode - Subject class IRI
 * @param {Term} property - Property IRI
 * @returns {Set<Term>} Set of object class IRIs
 */
export function extractObjectClasses(store, classNode, property) {
  const objClasses = new Set();
  const instances = store.match(
    null,
    df.namedNode(NS.rdf + "type"),
    classNode,
    null,
  );

  for (const instanceQuad of instances) {
    const valueQuads = store.match(instanceQuad.subject, property, null, null);
    for (const valueQuad of valueQuads) {
      if (
        valueQuad.object.termType === "NamedNode" ||
        valueQuad.object.termType === "BlankNode"
      ) {
        const typeQuads = store.match(
          valueQuad.object,
          df.namedNode(NS.rdf + "type"),
          null,
          null,
        );
        for (const typeQuad of typeQuads) {
          if (typeQuad.object.termType === "NamedNode") {
            objClasses.add(typeQuad.object);
          }
        }
      }
    }
  }

  return objClasses;
}

/**
 * Calculate cardinality constraints for a property
 * @param {Store} store - N3 Store
 * @param {Term} classNode - Class IRI
 * @param {Term} property - Property IRI
 * @returns {Object} Stats object { minCount, maxCount, instances }
 */
export function calculateCardinality(store, classNode, property) {
  const instances = store.match(
    null,
    df.namedNode(NS.rdf + "type"),
    classNode,
    null,
  );
  const counts = [];
  let totalInstances = 0;

  for (const instanceQuad of instances) {
    totalInstances++;
    let count = 0;
    const valueQuads = store.match(instanceQuad.subject, property, null, null);
    for (const _ of valueQuads) {
      count++;
    }
    counts.push(count);
  }

  if (counts.length === 0) {
    return { minCount: 0, maxCount: 0, instances: 0 };
  }

  const minCount = Math.min(...counts);
  const maxCount = Math.max(...counts);

  return { minCount, maxCount, instances: totalInstances };
}

/**
 * Extract distinct values for enumeration (sh:in)
 * @param {Store} store - N3 Store
 * @param {Term} classNode - Class IRI
 * @param {Term} property - Property IRI
 * @param {number} limit - Max enumeration size (default 5)
 * @returns {Term[]|null} Array of values or null if too many
 */
export function extractEnumerationValues(
  store,
  classNode,
  property,
  limit = 5,
) {
  const values = new Set();
  const instances = store.match(
    null,
    df.namedNode(NS.rdf + "type"),
    classNode,
    null,
  );

  for (const instanceQuad of instances) {
    if (values.size >= limit) break;
    const valueQuads = store.match(instanceQuad.subject, property, null, null);
    for (const valueQuad of valueQuads) {
      values.add(valueQuad.object);
      if (values.size >= limit) break;
    }
  }

  // Continue counting to check if we have too many unique values
  let totalUnique = values.size;
  for (const instanceQuad of instances) {
    const valueQuads = store.match(instanceQuad.subject, property, null, null);
    for (const valueQuad of valueQuads) {
      if (!values.has(valueQuad.object)) {
        totalUnique++;
      }
    }
  }

  // Return enumeration only if distinct values fit within limit
  return totalUnique <= limit ? Array.from(values) : null;
}

/**
 * Get instance count for a class
 * @param {Store} store - N3 Store
 * @param {Term} classNode - Class IRI
 * @returns {number} Instance count
 */
export function getClassInstanceCount(store, classNode) {
  let count = 0;
  const quads = store.match(
    null,
    df.namedNode(NS.rdf + "type"),
    classNode,
    null,
  );
  for (const _ of quads) {
    count++;
  }
  return count;
}

/**
 * Create a SHACL NodeShape for a class with all inferred constraints
 * @param {Store} store - N3 Store with RDF data
 * @param {Term} classNode - Class IRI
 * @param {Object} options - Configuration options
 *   - shapeNamespace: base URI for shape nodes (default: http://example.org/shapes/)
 *   - includeCardinality: include minCount/maxCount (default: true)
 *   - includeEnumeration: include sh:in for small value sets (default: true)
 *   - enumerationLimit: max values for enumeration (default: 5)
 * @returns {Object} { shapeNode, quads } - Shape node and generated quads
 */
export function buildNodeShapeForClass(store, classNode, options = {}) {
  const {
    shapeNamespace = "http://example.org/shapes/",
    includeCardinality = true,
    includeEnumeration = true,
    enumerationLimit = 5,
  } = options;

  const quads = [];
  const localName = localNameFromIRI(classNode.value);
  const shapeNode = df.namedNode(`${shapeNamespace}${localName}Shape`);

  // sh:NodeShape declaration
  quads.push(
    df.quad(
      shapeNode,
      df.namedNode(NS.rdf + "type"),
      df.namedNode(NS.sh + "NodeShape"),
    ),
  );

  // sh:targetClass
  quads.push(
    df.quad(shapeNode, df.namedNode(NS.sh + "targetClass"), classNode),
  );

  // Extract and add property shapes
  const properties = extractPropertiesForClass(store, classNode);

  for (const property of properties) {
    const propShape = df.blankNode();
    quads.push(df.quad(shapeNode, df.namedNode(NS.sh + "property"), propShape));

    // sh:path
    quads.push(df.quad(propShape, df.namedNode(NS.sh + "path"), property));

    // Analyze node kind
    const nodeKindStats = analyzePropertyNodeKind(store, classNode, property);
    const dominantKind = getDominantNodeKind(nodeKindStats);

    if (dominantKind && nodeKindStats.total > 0) {
      const nodeKindMap = {
        IRI: df.namedNode(NS.sh + "IRI"),
        Literal: df.namedNode(NS.sh + "Literal"),
        BlankNode: df.namedNode(NS.sh + "BlankNode"),
      };

      quads.push(
        df.quad(
          propShape,
          df.namedNode(NS.sh + "nodeKind"),
          nodeKindMap[dominantKind],
        ),
      );

      // Add datatype constraints for literals
      if (dominantKind === "Literal") {
        const datatypes = extractDatatypes(store, classNode, property);
        if (datatypes.size === 1) {
          const datatype = Array.from(datatypes)[0];
          quads.push(
            df.quad(propShape, df.namedNode(NS.sh + "datatype"), datatype),
          );
        }

        // Language constraints
        const languages = extractLanguageTags(store, classNode, property);
        if (languages.size > 0) {
          const langArray = Array.from(languages).map((lang) =>
            df.literal(lang, df.namedNode(NS.rdf + "langString")),
          );
          quads.push(
            df.quad(
              propShape,
              df.namedNode(NS.sh + "languageIn"),
              createRdfList(langArray, quads),
            ),
          );
        }
      }

      // Add class constraints for IRIs
      if (dominantKind === "IRI") {
        const objClasses = extractObjectClasses(store, classNode, property);
        if (objClasses.size === 1) {
          const objClass = Array.from(objClasses)[0];
          quads.push(
            df.quad(propShape, df.namedNode(NS.sh + "class"), objClass),
          );
        } else if (objClasses.size > 1) {
          // Multiple classes: add first one, or consider creating OR constraint
          const firstClass = Array.from(objClasses)[0];
          quads.push(
            df.quad(propShape, df.namedNode(NS.sh + "class"), firstClass),
          );
        }
      }
    }

    // Cardinality constraints
    if (includeCardinality) {
      const card = calculateCardinality(store, classNode, property);
      if (card.minCount > 0) {
        quads.push(
          df.quad(
            propShape,
            df.namedNode(NS.sh + "minCount"),
            df.literal(card.minCount, df.namedNode(NS.xsd + "integer")),
          ),
        );
      }
      if (card.maxCount > 0 && card.maxCount <= card.instances) {
        quads.push(
          df.quad(
            propShape,
            df.namedNode(NS.sh + "maxCount"),
            df.literal(card.maxCount, df.namedNode(NS.xsd + "integer")),
          ),
        );
      }
    }

    // Enumeration constraint
    if (includeEnumeration && dominantKind === "Literal") {
      const enumValues = extractEnumerationValues(
        store,
        classNode,
        property,
        enumerationLimit,
      );
      if (enumValues) {
        quads.push(
          df.quad(
            propShape,
            df.namedNode(NS.sh + "in"),
            createRdfList(enumValues, quads),
          ),
        );
      }
    }
  }

  return { shapeNode, quads };
}

/**
 * Extract local name from an IRI
 * @param {string} iri - Full IRI
 * @returns {string} Local name
 */
export function localNameFromIRI(iri) {
  const hash = iri.lastIndexOf("#");
  if (hash !== -1) return iri.slice(hash + 1);
  const slash = iri.lastIndexOf("/");
  if (slash !== -1) return iri.slice(slash + 1);
  return iri;
}

/**
 * Create an RDF list (rdf:List) and add quads to array
 * @param {Term[]} items - Array of items
 * @param {Quad[]} quads - Quads array to add to
 * @returns {Term} Head node of the list
 */
export function createRdfList(items, quads) {
  if (items.length === 0) {
    return df.namedNode(NS.rdf + "nil");
  }

  const nodes = items.map(() => df.blankNode());

  for (let i = 0; i < items.length; i++) {
    quads.push(
      df.quad(
        nodes[i],
        df.namedNode(NS.rdf + "type"),
        df.namedNode(NS.rdf + "List"),
      ),
    );

    quads.push(df.quad(nodes[i], df.namedNode(NS.rdf + "first"), items[i]));

    quads.push(
      df.quad(
        nodes[i],
        df.namedNode(NS.rdf + "rest"),
        i < items.length - 1 ? nodes[i + 1] : df.namedNode(NS.rdf + "nil"),
      ),
    );
  }

  return nodes[0];
}

/**
 * Main function: Generate complete SHACL shapes from a triplestore
 * @param {Store} store - N3 Store with RDF data
 * @param {Object} options - Configuration options
 *   - compactMode: use named shapes + sh:node (default: false)
 *   - noBlankNodes: when compactMode is enabled, skip list-based constraints that require blank nodes
 * @returns {Object} { store, serialize } method to serialize to Turtle
 */
export function generateShaclShapes(store, options = {}) {
  if (options.compactMode) {
    return generateShaclShapesCompact(store, options);
  }

  const shapesStore = new Store();
  const classes = extractClasses(store);

  const allQuads = [];

  for (const classNode of classes) {
    const { quads } = buildNodeShapeForClass(store, classNode, options);
    allQuads.push(...quads);
  }

  for (const quad of allQuads) {
    shapesStore.add(quad);
  }

  return {
    store: shapesStore,
    quads: allQuads,

    /**
     * Serialize shapes to Turtle format
     * @param {Object} prefixes - Optional custom prefixes
     * @returns {Promise<string>} Turtle string
     */
    serialize(prefixes = {}) {
      return new Promise((resolve, reject) => {
        const writer = new Writer({
          prefixes: {
            rdf: NS.rdf + "#",
            rdfs: NS.rdfs,
            sh: NS.sh,
            xsd: NS.xsd,
            ...prefixes,
          },
        });

        for (const quad of allQuads) {
          writer.addQuad(quad);
        }

        writer.end((error, result) => {
          if (error) reject(error);
          else resolve(result);
        });
      });
    },

    /**
     * Get shape nodes for a specific class
     * @param {Term} classNode
     * @returns {Term|null}
     */
    getShapeForClass(classNode) {
      const localName = localNameFromIRI(classNode.value);
      const shapeNamespace =
        options.shapeNamespace || "http://example.org/shapes/";
      return df.namedNode(`${shapeNamespace}${localName}Shape`);
    },
  };
}

/**
 * Generate SHACL shapes in compact mode using named property shapes and sh:node references.
 * Much more elegant: no inline blank nodes, reusable property definitions.
 *
 * Example output:
 *   PersonShape a sh:NodeShape ;
 *     sh:targetClass foaf:Person ;
 *     sh:node namePropertyShape ;
 *     sh:node emailPropertyShape .
 *   namePropertyShape a sh:PropertyShape ;
 *     sh:path foaf:name ;
 *     sh:nodeKind sh:Literal ;
 *     sh:minCount 1 .
 *
 * @param {Store} store - N3 Store with RDF data
 * @param {Object} options - Configuration options
 * @returns {Object} { store, serialize, quads } method
 */
export function generateShaclShapesCompact(store, options = {}) {
  const {
    shapeNamespace = "http://example.org/shapes/",
    propertyShapeNamespace = "http://example.org/propertyShapes/",
    includeCardinality = true,
    includeEnumeration = true,
    enumerationLimit = 5,
    noBlankNodes = false,
  } = options;

  const shapesStore = new Store();
  const allQuads = [];
  const propertyShapes = new Map(); // Cache property shapes by signature

  /**
   * Create a signature for a property shape to enable reuse across classes
   */
  function createPropertySignature(property, propOptions) {
    const languages = propOptions.languages
      ? Array.from(propOptions.languages).sort().join(",")
      : "";
    const enumValues = propOptions.enumValues
      ? propOptions.enumValues
          .map((v) => `${v.termType}:${v.value}:${v.language || ""}:${v.datatype?.value || ""}`)
          .sort()
          .join(",")
      : "";
    return [
      property.value,
      propOptions.nodeKind || "",
      propOptions.datatype?.value || "",
      propOptions.objClass?.value || "",
      propOptions.minCount ?? "",
      propOptions.maxCount ?? "",
      languages,
      enumValues,
    ].join("|");
  }

  /**
   * Get or create a named property shape with all constraints
   */
  function getOrCreatePropertyShape(property, propOptions) {
    const sig = createPropertySignature(property, propOptions);

    if (propertyShapes.has(sig)) {
      return propertyShapes.get(sig);
    }

    const propLocalName = localNameFromIRI(property.value);
    const nodeKindSuffix = propOptions.nodeKind
      ? `_${propOptions.nodeKind}`
      : "";
    const datatypeSuffix = propOptions.datatype
      ? `_${localNameFromIRI(propOptions.datatype.value)}`
      : "";
    const classSuffix = propOptions.objClass
      ? `_${localNameFromIRI(propOptions.objClass.value)}`
      : "";
    // FNV-1a 32-bit hash: offset basis 2166136261 and prime 16777619.
    let signatureHash = 2166136261;
    for (let i = 0; i < sig.length; i++) {
      signatureHash ^= sig.charCodeAt(i);
      signatureHash = Math.imul(signatureHash, 16777619);
    }
    // Include signature length + hash to reduce practical collision chance.
    const hashSuffix = `${sig.length}_${(signatureHash >>> 0).toString(36)}`;
    const shapeNodeName = `${propLocalName}${nodeKindSuffix}${datatypeSuffix}${classSuffix}_${hashSuffix}PropertyShape`;
    const shapeNode = df.namedNode(`${propertyShapeNamespace}${shapeNodeName}`);

    const quads = [];

    // sh:PropertyShape declaration
    quads.push(
      df.quad(
        shapeNode,
        df.namedNode(NS.rdf + "type"),
        df.namedNode(NS.sh + "PropertyShape"),
      ),
    );

    // sh:path
    quads.push(df.quad(shapeNode, df.namedNode(NS.sh + "path"), property));

    // sh:nodeKind
    if (propOptions.nodeKind) {
      const nodeKindMap = {
        IRI: df.namedNode(NS.sh + "IRI"),
        Literal: df.namedNode(NS.sh + "Literal"),
        BlankNode: df.namedNode(NS.sh + "BlankNode"),
      };
      quads.push(
        df.quad(
          shapeNode,
          df.namedNode(NS.sh + "nodeKind"),
          nodeKindMap[propOptions.nodeKind],
        ),
      );
    }

    // sh:datatype
    if (propOptions.datatype) {
      quads.push(
        df.quad(
          shapeNode,
          df.namedNode(NS.sh + "datatype"),
          propOptions.datatype,
        ),
      );
    }

    // sh:class
    if (propOptions.objClass) {
      quads.push(
        df.quad(shapeNode, df.namedNode(NS.sh + "class"), propOptions.objClass),
      );
    }

    // sh:minCount
    if (propOptions.minCount !== undefined && propOptions.minCount > 0) {
      quads.push(
        df.quad(
          shapeNode,
          df.namedNode(NS.sh + "minCount"),
          df.literal(propOptions.minCount, df.namedNode(NS.xsd + "integer")),
        ),
      );
    }

    // sh:maxCount
    if (propOptions.maxCount !== undefined && propOptions.maxCount > 0) {
      quads.push(
        df.quad(
          shapeNode,
          df.namedNode(NS.sh + "maxCount"),
          df.literal(propOptions.maxCount, df.namedNode(NS.xsd + "integer")),
        ),
      );
    }

    // sh:languageIn
    if (!noBlankNodes && propOptions.languages && propOptions.languages.size > 0) {
      const langArray = Array.from(propOptions.languages).map((lang) =>
        df.literal(lang, df.namedNode(NS.rdf + "langString")),
      );
      quads.push(
        df.quad(
          shapeNode,
          df.namedNode(NS.sh + "languageIn"),
          createRdfList(langArray, quads),
        ),
      );
    }

    // sh:in (enumeration)
    if (!noBlankNodes && propOptions.enumValues && propOptions.enumValues.length > 0) {
      quads.push(
        df.quad(
          shapeNode,
          df.namedNode(NS.sh + "in"),
          createRdfList(propOptions.enumValues, quads),
        ),
      );
    }

    allQuads.push(...quads);
    propertyShapes.set(sig, shapeNode);
    return shapeNode;
  }

  // Extract all classes
  const classes = extractClasses(store);

  // Build node shapes with sh:node references instead of inline sh:property
  for (const classNode of classes) {
    const shapeNode = df.namedNode(
      `${shapeNamespace}${localNameFromIRI(classNode.value)}Shape`,
    );

    // sh:NodeShape
    allQuads.push(
      df.quad(
        shapeNode,
        df.namedNode(NS.rdf + "type"),
        df.namedNode(NS.sh + "NodeShape"),
      ),
    );

    // sh:targetClass
    allQuads.push(
      df.quad(shapeNode, df.namedNode(NS.sh + "targetClass"), classNode),
    );

    // Extract and process properties
    const properties = extractPropertiesForClass(store, classNode);

    for (const property of properties) {
      // Analyze property
      const nodeKindStats = analyzePropertyNodeKind(store, classNode, property);
      const dominantKind = getDominantNodeKind(nodeKindStats);

      if (!dominantKind || nodeKindStats.total === 0) continue;

      const propOptions = { nodeKind: dominantKind };

      // Extract type-specific constraints
      if (dominantKind === "Literal") {
        const datatypes = extractDatatypes(store, classNode, property);
        if (datatypes.size === 1) {
          propOptions.datatype = Array.from(datatypes)[0];
        }

        const languages = extractLanguageTags(store, classNode, property);
        if (languages.size > 0) {
          propOptions.languages = languages;
        }

        if (includeEnumeration) {
          const enumValues = extractEnumerationValues(
            store,
            classNode,
            property,
            enumerationLimit,
          );
          if (enumValues) {
            propOptions.enumValues = enumValues;
          }
        }
      } else if (dominantKind === "IRI") {
        const objClasses = extractObjectClasses(store, classNode, property);
        if (objClasses.size === 1) {
          propOptions.objClass = Array.from(objClasses)[0];
        }
      }

      // Cardinality
      if (includeCardinality) {
        const card = calculateCardinality(store, classNode, property);
        if (card.minCount > 0) {
          propOptions.minCount = card.minCount;
        }
        if (card.maxCount > 0 && card.maxCount <= card.instances) {
          propOptions.maxCount = card.maxCount;
        }
      }

      // Get or create property shape and reference it
      const propShapeNode = getOrCreatePropertyShape(property, propOptions);

      // Use sh:node instead of sh:property for compact mode
      allQuads.push(
        df.quad(shapeNode, df.namedNode(NS.sh + "node"), propShapeNode),
      );
    }
  }

  // Add all quads to store
  for (const quad of allQuads) {
    shapesStore.add(quad);
  }

  return {
    store: shapesStore,
    quads: allQuads,

    /**
     * Serialize shapes to Turtle format
     * @param {Object} prefixes - Optional custom prefixes
     * @returns {Promise<string>} Turtle string
     */
    serialize(prefixes = {}) {
      return new Promise((resolve, reject) => {
        const writer = new Writer({
          prefixes: {
            rdf: NS.rdf + "#",
            rdfs: NS.rdfs,
            sh: NS.sh,
            xsd: NS.xsd,
            ...prefixes,
          },
        });

        for (const quad of allQuads) {
          writer.addQuad(quad);
        }

        writer.end((error, result) => {
          if (error) reject(error);
          else resolve(result);
        });
      });
    },

    /**
     * Get shape nodes for a specific class
     * @param {Term} classNode
     * @returns {Term|null}
     */
    getShapeForClass(classNode) {
      const localName = localNameFromIRI(classNode.value);
      return df.namedNode(`${shapeNamespace}${localName}Shape`);
    },
  };
}

/**
 * Load RDF data from Turtle string and generate SHACL
 * @param {string} turtleContent - Turtle RDF content
 * @param {Object} options - Configuration options
 * @returns {Promise<Object>} Result with store and serialize method
 */
export async function generateShaclFromTurtle(turtleContent, options = {}) {
  return new Promise((resolve, reject) => {
    const parser = new Parser();
    const store = new Store();

    parser.parse(turtleContent, (error, quad) => {
      if (error) reject(error);
      if (quad) store.add(quad);
    });

    const shapes = generateShaclShapes(store, options);
    resolve(shapes);
  });
}

/**
 * Validate that the generated shapes are consistent with the data
 * @param {Store} dataStore - Original RDF store
 * @param {Store} shapesStore - Generated SHACL shapes
 * @returns {Object} Validation report { valid, errors }
 */
export function validateShapesAgainstData(dataStore, shapesStore) {
  const report = { valid: true, errors: [] };

  // Get all shapes
  const shapeQuads = shapesStore.match(
    null,
    df.namedNode(NS.rdf + "type"),
    df.namedNode(NS.sh + "NodeShape"),
    null,
  );

  for (const shapeQuad of shapeQuads) {
    const shapeNode = shapeQuad.subject;
    const targetClassQuads = shapesStore.match(
      shapeNode,
      df.namedNode(NS.sh + "targetClass"),
      null,
      null,
    );

    for (const targetClassQuad of targetClassQuads) {
      const targetClass = targetClassQuad.object;

      // Check if target class exists in data
      const instances = dataStore.match(
        null,
        df.namedNode(NS.rdf + "type"),
        targetClass,
        null,
      );

      let hasInstances = false;
      for (const _ of instances) {
        hasInstances = true;
        break;
      }

      if (!hasInstances) {
        report.valid = false;
        report.errors.push(
          `Target class ${targetClass.value} has no instances in data`,
        );
      }
    }
  }

  return report;
}
