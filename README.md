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
│   │   ├── rdf-adapter.js        # <rdf-adapter> custom element (fetch + parse + render)
│   │   └── rdf-display.js        # <rdf-display> Lit wrapper (presentation layer)
│   ├── utils/
│   │   ├── rdf-fetcher.js        # fetch() with Cache API caching
│   │   ├── rdf-parser.js         # main-thread wrapper for the worker
│   │   ├── rdf-utils.js          # shared URI helpers (isUri, shortenUri)
│   │   └── dom-adapter.js        # batched DocumentFragment-based DOM updates
│   └── workers/
│       └── rdf-parser-worker.js  # Web Worker – N3.js RDF parsing
├── tests/
│   ├── components/
│   │   ├── rdf-adapter.test.js
│   │   └── rdf-display.test.js
│   └── utils/
│       ├── rdf-fetcher.test.js
│       ├── rdf-parser.test.js
│       ├── rdf-utils.test.js
│       └── dom-adapter.test.js
├── public/
│   ├── index.html                # demo page (all modes + template)
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

Add the scripts to your page and use the components:

```html
<!-- Option 1: standalone rdf-adapter (auto-discovers describedby link) -->
<link rel="describedby" href="/path/to/data.ttl" type="text/turtle" />
<rdf-adapter></rdf-adapter>

<!-- Option 2: rdf-display wrapper – list mode (default) -->
<rdf-display>
  <rdf-adapter src="https://example.org/data.ttl"></rdf-adapter>
</rdf-display>

<!-- Option 3: rdf-display – grid mode -->
<rdf-display display-mode="grid">
  <rdf-adapter src="https://example.org/data.ttl"></rdf-adapter>
</rdf-display>

<!-- Option 4: rdf-display – table mode -->
<rdf-display display-mode="table">
  <rdf-adapter src="https://example.org/data.ttl"></rdf-adapter>
</rdf-display>

<!-- Option 5: rdf-display with a custom <template> -->
<template id="my-triple">
  <div><strong>{predicate-short}</strong>: {object}</div>
</template>

<rdf-display template-id="my-triple">
  <rdf-adapter src="https://example.org/data.ttl"></rdf-adapter>
</rdf-display>

<!-- Option 6: filter by subject URI -->
<rdf-display display-mode="table">
  <rdf-adapter
    src="https://example.org/data.ttl"
    subject="https://example.org/my-resource"
  ></rdf-adapter>
</rdf-display>

<script type="module" src="dist/rdf-adapter.js"></script>
<script type="module" src="dist/rdf-display.js"></script>
```

### `<rdf-adapter>` attributes

| Attribute   | Description |
|-------------|-------------|
| `src`       | Explicit URL of an RDF resource to load |
| `subject`   | Filter rendered triples to those with this subject URI |
| `no-shadow` | Render into light DOM instead of a Shadow Root |

### `<rdf-adapter>` events dispatched

| Event        | `detail` shape | Description |
|--------------|----------------|-------------|
| `rdf-loaded` | `{ triples: [{subject, predicate, object}] }` | Fired after parsing succeeds |
| `rdf-error`  | `{ message, url? }` | Fired when a fetch or parse fails |

### `<rdf-display>` attributes

| Attribute      | Values | Description |
|----------------|--------|-------------|
| `display-mode` | `list` (default) · `grid` · `table` | How triples are presented |
| `template-id`  | ID of a `<template>` element | Custom per-triple template with `{subject}`, `{predicate}`, `{predicate-short}`, `{object}`, `{object-short}` placeholders |

### Custom template placeholders

When `template-id` is set, the matching `<template>` element is cloned once per
triple and these tokens are replaced with actual values:

| Placeholder | Value |
|-------------|-------|
| `{subject}` | Full subject URI |
| `{predicate}` | Full predicate URI |
| `{predicate-short}` | Last fragment / path segment of predicate |
| `{object}` | Full object value |
| `{object-short}` | Last fragment / path segment of object (for URIs) |

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
