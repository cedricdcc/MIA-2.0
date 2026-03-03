# SHACL Generator - Quick Start Guide

## 30-Second Overview

Generate SHACL shape constraints from your RDF data in seconds:

```javascript
import { generateShaclFromTurtle } from './src/utils/rdf-shacl-generator.js';

const turtleData = `
  @prefix ex: <http://example.org/> .
  @prefix foaf: <http://xmlns.com/foaf/0.1/> .
  
  ex:alice a foaf:Person ; foaf:name "Alice" ; foaf:age 30 .
  ex:bob a foaf:Person ; foaf:name "Bob" ; foaf:age 25 .
`;

const shapes = await generateShaclFromTurtle(turtleData);
const ttl = await shapes.serialize();
console.log(ttl);  // 👈 SHACL shapes!
```

## Installation

Already included! Your `package.json` has `n3` as a dependency.

## 5-Minute Examples

### 1️⃣ Load File → Generate → Save

```javascript
import fs from 'fs/promises';
import { generateShaclFromTurtle } from './src/utils/rdf-shacl-generator.js';

const input = await fs.readFile('my-data.ttl', 'utf-8');
const shapes = await generateShaclFromTurtle(input);
const output = await shapes.serialize();
await fs.writeFile('my-shapes.ttl', output);
```

### 2️⃣ Analyze Your Data

```javascript
import { Store, Parser } from 'n3';
import {
  extractClasses,
  extractPropertiesForClass,
  calculateCardinality,
} from './src/utils/rdf-shacl-generator.js';

const store = new Store();
const parser = new Parser();
// ... load your RDF data into store ...

const classes = extractClasses(store);
classes.forEach(cls => {
  const props = extractPropertiesForClass(store, cls);
  console.log(`Class: ${cls.value}`);
  props.forEach(prop => {
    const card = calculateCardinality(store, cls, prop);
    console.log(`  - ${prop.value} [min: ${card.minCount}, max: ${card.maxCount}]`);
  });
});
```

### 3️⃣ Custom Configuration

```javascript
const shapes = await generateShaclFromTurtle(data, {
  shapeNamespace: 'http://myapp.org/shapes/',      // Custom shape URIs
  includeCardinality: true,                          // min/max counts
  includeEnumeration: true,                          // value lists
  enumerationLimit: 10,                              // max enumerated values
});
```

### 4️⃣ Incremental Building

```javascript
import { IncrementalShaclGenerator } from './src/utils/rdf-shacl-generator-examples.js';

const gen = new IncrementalShaclGenerator();

// Add data as it becomes available
await gen.addTurtle(batchData1);
await gen.addTurtle(batchData2);

// Always get current shapes
const shapes = await gen.getShaclTurtle();
const stats = gen.getStatistics();
console.log(`Classes: ${stats.classes}`);
```

## Generated SHACL Example

**Input RDF:**
```turtle
@prefix foaf: <http://xmlns.com/foaf/0.1/> .
@prefix ex: <http://example.org/> .

ex:person1 a foaf:Person ;
  foaf:name "Alice"@en ;
  foaf:mbox <mailto:alice@example.org> ;
  foaf:age 30 .
```

**Generated SHACL:**
```turtle
@prefix sh: <http://www.w3.org/ns/shacl#> .

PersonShape a sh:NodeShape ;
  sh:targetClass <http://xmlns.com/foaf/0.1/Person> ;
  sh:property [
    sh:path foaf:name ;
    sh:nodeKind sh:Literal ;
    sh:minCount 1 ;
  ] ;
  sh:property [
    sh:path foaf:mbox ;
    sh:nodeKind sh:IRI ;
    sh:minCount 1 ;
  ] ;
  sh:property [
    sh:path foaf:age ;
    sh:nodeKind sh:Literal ;
    sh:datatype xsd:integer ;
  ] .
```

## Key Functions at a Glance

| Function | Purpose | Returns |
|----------|---------|---------|
| `generateShaclShapes(store)` | Main function to generate shapes | Shapes object with `serialize()` |
| `generateShaclFromTurtle(ttl)` | Parse + generate in one step | Promise → Shapes object |
| `extractClasses(store)` | List all RDF classes | Array of class IRIs |
| `extractPropertiesForClass(store, cls)` | Properties used by a class | Set of property IRIs |
| `calculateCardinality(store, cls, prop)` | Min/max counts | `{ minCount, maxCount, instances }` |
| `analyzePropertyNodeKind(store, cls, prop)` | Value type distribution | `{ iris, literals, blanks, total }` |
| `extractDatatypes(store, cls, prop)` | Literal datatypes | Set of datatype IRIs |
| `validateShapesAgainstData(data, shapes)` | Verify consistency | `{ valid, errors }` |

## Common Patterns

### Pattern 1: Generate from N3 Store

```javascript
import { Store, Parser } from 'n3';
import { generateShaclShapes } from './src/utils/rdf-shacl-generator.js';

const store = new Store();
const parser = new Parser();

// Parse data
parser.parse(turtleString, (error, quad) => {
  if (quad) store.add(quad);
});

// Generate shapes
const shapes = generateShaclShapes(store);
const ttl = await shapes.serialize();
```

### Pattern 2: Per-Class Shape Generation

```javascript
import { DataFactory } from 'n3';
import { buildNodeShapeForClass } from './src/utils/rdf-shacl-generator.js';

const df = DataFactory;
const myClass = df.namedNode('http://example.org/MyClass');

const { shapeNode, quads } = buildNodeShapeForClass(store, myClass);
console.log(`Created: ${shapeNode.value}`);
```

### Pattern 3: Batch Processing

```javascript
import fs from 'fs/promises';
import path from 'path';
import { generateShaclFromTurtle } from './src/utils/rdf-shacl-generator.js';

const inputDir = './rdf-files';
const outputDir = './shapes';

const files = await fs.readdir(inputDir);
for (const file of files.filter(f => f.endsWith('.ttl'))) {
  const input = await fs.readFile(path.join(inputDir, file), 'utf-8');
  const shapes = await generateShaclFromTurtle(input);
  const ttl = await shapes.serialize();
  await fs.writeFile(path.join(outputDir, `shapes_${file}`), ttl);
}
```

## What Gets Generated?

The generator infers and includes:

✅ **NodeShapes** for each RDF class  
✅ **PropertyShapes** for each property  
✅ **sh:nodeKind** (IRI, Literal, BlankNode)  
✅ **sh:datatype** for literals  
✅ **sh:minCount / sh:maxCount** for cardinality  
✅ **sh:languageIn** for multilingual literals  
✅ **sh:class** for object properties  
✅ **sh:in** for enumerated values (if ≤ limit)  

## Testing Your Shapes

With SHACL validator:

```javascript
import SHACLValidator from 'rdf-validate-shacl';

const validator = new SHACLValidator(shapesStore);
const report = validator.validate(dataStore);

if (report.conforms) {
  console.log('✓ Data conforms to shapes');
} else {
  console.log('✗ Violations:');
  report.results.forEach(r => console.log(`  - ${r.message}`));
}
```

## Troubleshooting

| Issue | Solution |
|-------|----------|
| No classes found | Ensure RDF has `rdf:type` declarations |
| Empty shapes | Check that the store has RDF data |
| Memory issues with large data | Use incremental addition or SPARQL endpoints |
| Wrong cardinality detected | Verify all instances are in the store |

## Next Steps

- Read [SHACL-GENERATOR.md](./SHACL-GENERATOR.md) for detailed API docs
- Check [rdf-shacl-generator.test.js](../tests/utils/rdf-shacl-generator.test.js) for more examples
- See [rdf-shacl-generator-examples.js](./rdf-shacl-generator-examples.js) for advanced patterns

## API Cheat Sheet

```javascript
// Main entry points
generateShaclShapes(store, options)
generateShaclFromTurtle(turtleString, options)

// Analysis functions
extractClasses(store)
extractPropertiesForClass(store, classNode)
analyzePropertyNodeKind(store, classNode, property)
calculateCardinality(store, classNode, property)
extractDatatypes(store, classNode, property)
extractLanguageTags(store, classNode, property)
extractObjectClasses(store, classNode, property)

// Building
buildNodeShapeForClass(store, classNode, options)
createRdfList(items, quads)

// Utilities
localNameFromIRI(iri)
getDominantNodeKind(stats)
validateShapesAgainstData(dataStore, shapesStore)
```

---

**Questions?** Check the full docs or examples files!
