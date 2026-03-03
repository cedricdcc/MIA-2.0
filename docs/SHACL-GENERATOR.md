# SHACL Shape Generator - Documentation

## Overview

The SHACL Shape Generator is a utility module for automatically generating [SHACL (Shapes Constraint Language)](https://www.w3.org/TR/shacl/) shapes from RDF triplestores. It analyzes existing RDF data and infers structural constraints (classes, properties, cardinalities, datatypes) to create reusable SHACL shape definitions.

## Features

- **Automatic Class Detection**: Discovers all RDF classes (via `rdf:type`) in the dataset
- **Property Analysis**: Extracts properties used by each class with statistical analysis
- **Datatype Inference**: Determines literal datatypes and language tags
- **Cardinality Constraints**: Calculates min/max occurrence counts for properties
- **Node Kind Detection**: Identifies whether properties contain IRIs, literals, or blank nodes
- **Value Enumeration**: Suggests `sh:in` constraints for properties with few distinct values
- **Object Class Detection**: Infers target classes for object properties
- **Comprehensive Validation**: Validates generated shapes against source data
- **Multiple Serialization Formats**: Output as Turtle, N-Triples, or RDF/XML
- **Incremental Generation**: Build shapes as data is added
- **Batch Processing**: Generate shapes from multiple files

## Installation

The module uses `n3` (already in your `package.json`):

```bash
npm install  # n3 is already a dependency
```

If using SPARQL endpoints instead of in-memory stores, you may want to add:
```bash
npm install @comunica/query-sparql
```

## Core Functions

### 1. `generateShaclShapes(store, options)`

Generate SHACL shapes for all classes in an RDF store.

**Parameters:**
- `store` (n3.Store): RDF store containing the data
- `options` (Object):
  - `shapeNamespace` (string): Base URI for shape nodes (default: `http://example.org/shapes/`)
  - `includeCardinality` (boolean): Include min/max counts (default: `true`)
  - `includeEnumeration` (boolean): Include enumeration constraints (default: `true`)
  - `enumerationLimit` (number): Max values for enumeration (default: `5`)

**Returns:**
```javascript
{
  store,           // n3.Store with generated SHACL quads
  quads,           // Array of generated quads
  serialize(prefixes),  // async function to serialize to Turtle
  getShapeForClass(classNode)  // Get shape for a specific class
}
```

**Example:**
```javascript
import { generateShaclShapes } from './rdf-shacl-generator.js';

const shapes = generateShaclShapes(rdfStore, {
  shapeNamespace: 'http://example.org/shapes/',
  includeCardinality: true,
});

const turtle = await shapes.serialize();
```

### 2. `generateShaclFromTurtle(turtleContent, options)`

Parse RDF Turtle and generate SHACL shapes in one step.

**Parameters:**
- `turtleContent` (string): RDF data in Turtle format
- `options` (Object): Same as `generateShaclShapes`

**Returns:** Promise resolving to shapes object (see above)

**Example:**
```javascript
import { generateShaclFromTurtle } from './rdf-shacl-generator.js';

const turtleData = `
@prefix ex: <http://example.org/> .
@prefix foaf: <http://xmlns.com/foaf/0.1/> .

ex:person1 a foaf:Person ;
  foaf:name "Alice" ;
  foaf:mbox <mailto:alice@example.org> .
`;

const shapes = await generateShaclFromTurtle(turtleData);
const ttl = await shapes.serialize();
console.log(ttl);
```

### 3. `extractClasses(store)`

Get all distinct classes from the RDF store.

**Returns:** Array of RDF Term objects (IRIs)

```javascript
const classes = extractClasses(store);
classes.forEach(cls => console.log(cls.value));
```

### 4. `extractPropertiesForClass(store, classNode)`

Get all properties used by instances of a given class.

**Returns:** Set of RDF Term objects (property IRIs)

```javascript
const personClass = df.namedNode('http://xmlns.com/foaf/0.1/Person');
const properties = extractPropertiesForClass(store, personClass);
```

### 5. `analyzePropertyNodeKind(store, classNode, property)`

Analyze the distribution of value types (IRI, Literal, BlankNode) for a property.

**Returns:** 
```javascript
{
  iris: number,      // Count of IRI objects
  literals: number,  // Count of literal objects
  blanks: number,    // Count of blank node objects
  total: number      // Total value count
}
```

**Example:**
```javascript
const stats = analyzePropertyNodeKind(store, personClass, nameProperty);
console.log(`IRIs: ${stats.iris}, Literals: ${stats.literals}`);
```

### 6. `extractDatatypes(store, classNode, property)`

Get distinct datatypes for a literal property.

**Returns:** Set of RDF datatype URIs

```javascript
const datatypes = extractDatatypes(store, personClass, nameProperty);
datatypes.forEach(dt => console.log(dt.value));
```

### 7. `extractLanguageTags(store, classNode, property)`

Get distinct language tags for a property.

**Returns:** Set of language tag strings

```javascript
const languages = extractLanguageTags(store, personClass, nameProperty);
// Result: Set { 'en', 'fr', 'de' }
```

### 8. `calculateCardinality(store, classNode, property)`

Calculate minimum and maximum occurrence counts for a property.

**Returns:**
```javascript
{
  minCount: number,    // Minimum occurrences per instance
  maxCount: number,    // Maximum occurrences per instance
  instances: number    // Total instances of the class
}
```

**Example:**
```javascript
const card = calculateCardinality(store, personClass, emailProperty);
if (card.minCount > 0) {
  console.log('All persons have at least one email');
}
```

### 9. `buildNodeShapeForClass(store, classNode, options)`

Create a complete SHACL NodeShape for a specific class with all inferred constraints.

**Returns:** `{ shapeNode, quads }`

```javascript
const { shapeNode, quads } = buildNodeShapeForClass(store, personClass);
console.log(`Created shape: ${shapeNode.value}`);
```

### 10. `validateShapesAgainstData(dataStore, shapesStore)`

Validate that generated shapes are consistent with the source data.

**Returns:**
```javascript
{
  valid: boolean,
  errors: string[]
}
```

**Example:**
```javascript
const report = validateShapesAgainstData(dataStore, shapesStore);
if (!report.valid) {
  report.errors.forEach(err => console.warn(err));
}
```

## Usage Examples

### Example 1: Basic Shape Generation

```javascript
import { Store, Parser } from 'n3';
import { generateShaclShapes } from './rdf-shacl-generator.js';

// Create store and parse RDF
const store = new Store();
const parser = new Parser();
const rdfContent = `
  @prefix ex: <http://example.org/> .
  @prefix foaf: <http://xmlns.com/foaf/0.1/> .
  
  ex:alice a foaf:Person ; foaf:name "Alice" ; foaf:age 30 .
  ex:bob a foaf:Person ; foaf:name "Bob" ; foaf:age 25 .
`;

parser.parse(rdfContent, (error, quad) => {
  if (quad) store.add(quad);
});

// Generate shapes
const shapes = generateShaclShapes(store);
const turtle = await shapes.serialize();
console.log(turtle);
```

### Example 2: Generate and Save to File (Node.js)

```javascript
import fs from 'fs/promises';
import { generateShaclFromTurtle } from './rdf-shacl-generator.js';

const input = await fs.readFile('data.ttl', 'utf-8');
const shapes = await generateShaclFromTurtle(input);
const output = await shapes.serialize();
await fs.writeFile('shapes.ttl', output);
console.log('✓ Shapes saved to shapes.ttl');
```

### Example 3: Incremental Shape Building

```javascript
import { IncrementalShaclGenerator } from './rdf-shacl-generator-examples.js';

const generator = new IncrementalShaclGenerator({
  shapeNamespace: 'http://myapp.org/shapes/',
  includeCardinality: true,
});

// Add data gradually
await generator.addTurtle(data1);
await generator.addTurtle(data2);

// Get current shapes anytime
const shapes = await generator.getShaclTurtle();
const stats = generator.getStatistics();
console.log(`Generated shapes for ${stats.classes} classes`);
```

### Example 4: Custom Analysis

```javascript
import {
  extractClasses,
  extractPropertiesForClass,
  calculateCardinality,
} from './rdf-shacl-generator.js';

const classes = extractClasses(store);

for (const cls of classes) {
  console.log(`\n📦 ${cls.value}`);
  
  const props = extractPropertiesForClass(store, cls);
  for (const prop of props) {
    const card = calculateCardinality(store, cls, prop);
    console.log(
      `  └─ ${prop.value} [min=${card.minCount}, max=${card.maxCount}]`
    );
  }
}
```

## Generated SHACL Output

The utility generates SHACL shapes with the following structure:

```turtle
@prefix sh: <http://www.w3.org/ns/shacl#> .
@prefix ex: <http://example.org/> .

ex:PersonShape a sh:NodeShape ;
  sh:targetClass ex:Person ;
  sh:property [
    sh:path ex:name ;
    sh:nodeKind sh:Literal ;
    sh:datatype <http://www.w3.org/2001/XMLSchema#string> ;
    sh:minCount 1 ;
    sh:maxCount 1 ;
  ] ;
  sh:property [
    sh:path ex:email ;
    sh:nodeKind sh:IRI ;
    sh:minCount 1 ;
  ] ;
  sh:property [
    sh:path ex:knows ;
    sh:nodeKind sh:IRI ;
    sh:class ex:Person ;
  ] .
```

## Configuration Options

### Global Options

When calling `generateShaclShapes()` or `generateShaclFromTurtle()`:

```javascript
{
  // Base namespace for generated shape IRIs
  shapeNamespace: 'http://example.org/shapes/',
  
  // Include cardinality constraints (minCount/maxCount)
  includeCardinality: true,
  
  // Include enumeration constraints (sh:in)
  includeEnumeration: true,
  
  // Maximum distinct values before disabling enumeration
  enumerationLimit: 5
}
```

## Performance Considerations

- **Large Datasets**: For datasets with millions of triples, consider:
  - Using SPARQL endpoints with sampling (LIMIT/OFFSET)
  - Processing classes in batches
  - Setting lower enumeration limits
  
- **Memory Usage**: In-memory stores load entire datasets. For large files:
  - Parse and add quads incrementally
  - Use SPARQL endpoints via Comunica
  - Process in multiple passes

## Limitations

1. **Inference**: Does not perform OWL/RDFS inference. Only analyzes explicit data.
2. **RDF:type Requirement**: Classes must be declared with `rdf:type`.
3. **No Property Domains/Ranges**: Cannot infer from RDFS/OWL property definitions.
4. **Blank Node Handling**: Limited support for complex blank node patterns.
5. **List Detection**: RDF lists are treated as blank nodes, not special.

## Extending the Generator

### Custom Namespace Handling

```javascript
function generateWithCustomNamespaces(store, customPrefixes) {
  const shapes = generateShaclShapes(store);
  return shapes.serialize(customPrefixes);
}
```

### Adding Custom Constraints

```javascript
import { buildNodeShapeForClass } from './rdf-shacl-generator.js';

function addCustomConstraints(store, classNode, customRules) {
  const { quads } = buildNodeShapeForClass(store, classNode);
  
  // Add custom quads based on customRules
  const df = DataFactory;
  customRules.forEach(rule => {
    quads.push(df.quad(rule.subject, rule.predicate, rule.object));
  });
  
  return quads;
}
```

### Integration with SHACL Validators

```javascript
import SHACLValidator from 'rdf-validate-shacl';

const validator = new SHACLValidator(shapesStore);
const report = validator.validate(dataStore);
console.log(report.conforms); // true or false
```

## Testing

Run the included tests:

```bash
npm test tests/utils/rdf-shacl-generator.test.js
```

See `rdf-shacl-generator.test.js` for comprehensive test examples.

## Related Documentation

- [SHACL Specification](https://www.w3.org/TR/shacl/)
- [N3 Library](https://github.com/rdfjs/N3.js)
- [RDF Validation with SHACL](https://www.w3.org/TR/shacl/)
- [RDF Lens (your project)](https://github.com/cedricdcc/MIA-2.0)

## Contributing

For issues or improvements, please refer to the project repository.

## License

ISC (as per package.json)
