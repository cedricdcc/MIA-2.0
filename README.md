# MIA 2.0

Second iteration of the Marine Info Affordances (MIA) project.

MIA 2.0 is a modular, standards-based **RDF web-adapter** built as a native
Web Component. It discovers RDF descriptions linked from a page via
`<link rel="describedby">`, fetches them with HTTP content-negotiation, parses
them off the main thread in a Web Worker, and renders the resulting triples
into the DOM.

---

## Folder structure

```
MIA-2.0/
├── src/
│   ├── components/
│   │   └── rdf-adapter.js        # <rdf-adapter> custom element
│   ├── utils/
│   │   ├── rdf-fetcher.js        # fetch() with Cache API caching
│   │   ├── rdf-parser.js         # main-thread wrapper for the worker
│   │   └── dom-adapter.js        # batched DocumentFragment-based DOM updates
│   └── workers/
│       └── rdf-parser-worker.js  # Web Worker – N3.js RDF parsing
├── tests/
│   ├── components/
│   │   └── rdf-adapter.test.js
│   └── utils/
│       ├── rdf-fetcher.test.js
│       ├── rdf-parser.test.js
│       └── dom-adapter.test.js
├── public/
│   ├── index.html                # demo page
│   └── rdf-data/
│       ├── example.ttl           # sample Turtle data
│       └── example.jsonld        # sample JSON-LD data
├── dist/                         # build output (git-ignored)
├── vite.config.js
├── package.json
└── README.md
```

---

## Quick start

```bash
npm install

# Development server (with HMR)
npm run dev

# Run unit tests
npm test

# Production build (outputs to dist/)
npm run build
```

---

## Usage

Add the script to your page and use the `<rdf-adapter>` element:

```html
<!-- Option 1: signpost RDF via link header -->
<link rel="describedby" href="/path/to/data.ttl" type="text/turtle" />
<rdf-adapter></rdf-adapter>

<!-- Option 2: explicit src attribute -->
<rdf-adapter src="https://example.org/data.ttl"></rdf-adapter>

<!-- Option 3: filter by subject URI -->
<rdf-adapter
  src="https://example.org/data.ttl"
  subject="https://example.org/my-resource"
></rdf-adapter>

<script type="module" src="dist/rdf-adapter.es.js"></script>
```

### Attributes

| Attribute   | Description |
|-------------|-------------|
| `src`       | Explicit URL of an RDF resource to load |
| `subject`   | Filter rendered triples to those with this subject URI |
| `no-shadow` | Render into light DOM instead of a Shadow Root |

---

## RDF strategy

| Concern | Approach |
|---------|----------|
| Transport | `fetch()` with `Accept` header negotiation (Turtle → JSON-LD → N-Triples) |
| Caching | Browser Cache API (`rdf-fetcher-v1` cache) |
| Parsing | N3.js inside a Web Worker (main thread never blocks) |
| DOM updates | Batched via `DocumentFragment` – single reflow per load cycle |
| Formats | `text/turtle`, `application/ld+json`, `application/n-triples`, `text/n3` |

---

## Development

```bash
# Watch mode tests
npm run test:watch

# Preview production build
npm run preview
```

---

## Credits

Based on [MIA](https://github.com/vliz-be-opsci/MIA) by Cedric Decruw / VLIZ.
