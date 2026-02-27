# Creating templates for `<rdf-display>`

`<rdf-display>` supports a fully customisable per-triple HTML template.
This document explains how the template system works, all available
placeholder tokens, and walks through the real-world MarineInfo collection
example in this folder.

---

## Table of contents

1. [How templates work](#how-templates-work)
2. [All placeholder tokens](#all-placeholder-tokens)
3. [Styling inside shadow DOM: `template-styles`](#styling-inside-shadow-dom-template-styles)
4. [Handling list-valued predicates](#handling-list-valued-predicates)
5. [Showing / hiding per-predicate content with CSS](#showing--hiding-per-predicate-content-with-css)
6. [MarineInfo collection template walkthrough](#marineinfo-collection-template-walkthrough)
7. [Quick-start snippet](#quick-start-snippet)
8. [Block templates → SHACL shapes (playground)](#block-templates--shacl-shapes-playground)
9. [Using lens flat objects with `rdf-display` templates](#using-lens-flat-objects-with-rdf-display-templates)
10. [What is still needed for full lens-mode support](#what-is-still-needed-for-full-lens-mode-support)

---

## How templates work

When you set `template-id="my-tmpl"` on `<rdf-display>`, the component:

1. Locates the `<template id="my-tmpl">` element in the page.
2. For **every RDF triple** received from the adapter, clones the template's
   content with `content.cloneNode(true)`.
3. Replaces all `{placeholder}` tokens in text nodes and attribute values.
4. Appends the filled clone into a `<div class="rdf-template-host">` inside
   the component's shadow root.

So if a dataset has 20 triples, your template is cloned and filled 20 times,
producing 20 sibling elements inside `.rdf-template-host`.

```
[rdf-adapter fetches + parses RDF]
        ↓  rdf-loaded event  { triples: [{subject, predicate, object}, …] }
[rdf-display receives event]
        ↓  for each triple
        ↓    clone <template id="my-tmpl">
        ↓    fill {placeholder} tokens
        ↓    append to .rdf-template-host (inside shadow DOM)
```

---

## All placeholder tokens

| Token | Replaced with | Example value |
|-------|---------------|---------------|
| `{subject}` | Full subject URI | `https://marineinfo.org/id/collection/619` |
| `{predicate}` | Full predicate URI | `http://purl.org/dc/terms/title` |
| `{predicate-short}` | Last fragment or path segment of the predicate | `title` |
| `{predicate-class}` | CSS-safe class derived from the predicate (lowercase, hyphens) | `title`, `member`, `subject`, `type` |
| `{object}` | Full object value (URI or literal string) | `Marine Biodiversity Collection` |
| `{object-short}` | Last fragment or path segment (URIs); same as `{object}` for literals | `619`, `Marine Biodiversity Collection` |
| `{object-is-uri}` | `"true"` if the object is an `http(s)://` URI, otherwise `"false"` | `true` |

### `{predicate-class}` derivation

The predicate URI is converted to a CSS-safe class by:
1. Taking the fragment (after `#`) or last path segment (after `/`)
2. Lowercasing
3. Replacing non-alphanumeric characters with `-`
4. Collapsing multiple `-` into one and trimming

Examples:

| Predicate URI | `{predicate-short}` | `{predicate-class}` |
|---------------|---------------------|---------------------|
| `http://purl.org/dc/terms/title` | `title` | `title` |
| `http://purl.org/dc/terms/subject` | `subject` | `subject` |
| `http://www.w3.org/2004/02/skos/core#member` | `member` | `member` |
| `http://www.w3.org/1999/02/22-rdf-syntax-ns#type` | `type` | `type` |
| `https://schema.org/url` | `url` | `url` |
| `http://xmlns.com/foaf/0.1/name` | `name` | `name` |
| `http://purl.org/dc/terms/spatial` | `spatial` | `spatial` |

---

## Styling inside shadow DOM: `template-styles`

Because template content is **rendered inside the shadow root** of
`<rdf-display>`, page-level CSS cannot reach the cloned elements.

Use the `template-styles` attribute to inject a `<style>` element from the
page into the shadow root:

```html
<!-- 1. Define your template CSS in a named <style> element -->
<style id="my-styles">
  .triple.title { font-size: 1.5rem; font-weight: bold; }
  .triple.subject { background: #e3f2fd; border-radius: 12px; padding: .2em .7em; }
</style>

<!-- 2. Point rdf-display at both the template and the styles -->
<rdf-display
  template-id="my-tmpl"
  template-styles="my-styles"
>
  <rdf-adapter src="data.ttl"></rdf-adapter>
</rdf-display>
```

The injection is **idempotent**: the style element is added once and never
duplicated, even when triples change.

---

## Handling list-valued predicates

In RDF, a property that logically holds a list (e.g. keywords, collection
members, contributors) is represented as **multiple triples with the same
predicate**:

```turtle
<https://example.org/collection/1>
    dct:subject  "marine biodiversity" ;
    dct:subject  "North Sea" ;          ← same predicate, different object
    dct:subject  "oceanography" ;

    skos:member  <https://example.org/dataset/1> ;
    skos:member  <https://example.org/dataset/2> ;   ← same pattern
    skos:member  <https://example.org/dataset/3> .
```

After parsing, these become six triples.  `<rdf-display>` clones the template
six times, once per triple.  The resulting DOM looks like:

```html
<div class="triple subject" …>marine biodiversity</div>
<div class="triple subject" …>North Sea</div>
<div class="triple subject" …>oceanography</div>
<div class="triple member" …><a href="…/dataset/1">dataset/1</a></div>
<div class="triple member" …><a href="…/dataset/2">dataset/2</a></div>
<div class="triple member" …><a href="…/dataset/3">dataset/3</a></div>
```

Because all `.subject` divs are siblings in a flex container, `display:
inline-flex` causes them to **flow side-by-side** and wrap automatically —
no JavaScript grouping required.

Similarly, all `.member` divs share a fixed percentage width, so they form a
**responsive card grid** purely through CSS flex-wrap.

**Key insight**: you don't need to iterate over a JavaScript array.
The RDF list structure maps 1-to-1 onto repeated cloned elements in the DOM,
and CSS arranges them visually.

---

## Showing / hiding per-predicate content with CSS

A recommended template structure is:

```html
<template id="my-tmpl">
  <div class="triple {predicate-class}"
       data-predicate="{predicate}"
       data-is-uri="{object-is-uri}">
    <span class="label">{predicate-short}</span>
    <span class="value-text">{object}</span>
    <a class="value-link"
       href="{object}"
       target="_blank"
       rel="noopener noreferrer">{object-short}</a>
  </div>
</template>
```

Then use CSS to:

### 1. Start with all triples hidden
```css
.triple { display: none; }
```
Only explicitly styled predicates will appear.  Unknown predicates are safely
ignored without breaking the layout.

### 2. Show and style specific predicates
```css
.triple.title {
  display: block;
  width: 100%;
  font-size: 1.5rem;
  font-weight: bold;
}
.triple.subject {
  display: inline-flex;
  background: #e3f2fd;
  border-radius: 14px;
  padding: .3em .85em;
}
```

### 3. Show URIs as links, literals as text
```css
/* URI object: show the link, hide the text span */
.triple[data-is-uri="true"]  .value-text { display: none; }

/* Literal object: show the text span, hide the link */
.triple[data-is-uri="false"] .value-link { display: none; }
```

### 4. Reorder sections with `order` (flex only)
```css
.rdf-template-host { display: flex; flex-wrap: wrap; }

.triple.type        { order: 1;  width: 100%; }
.triple.title       { order: 2;  width: 100%; }
.triple.description { order: 3;  width: 100%; }
.triple.subject     { order: 4;  }   /* auto-width → chips wrap side by side */
.triple.member      { order: 5;  width: calc(33.33% - .35rem); }  /* grid */
.triple.creator     { order: 6;  }
.triple.url         { order: 10; width: 100%; }
```

---

## MarineInfo collection template walkthrough

The template in this folder (`marineinfo-collection.html`) is designed for
the VLIZ/IMIS RDF data model used by
[MarineInfo.org](https://marineinfo.org/id/collection/619).

### Key predicates in an IMIS `skos:Collection`

| Predicate | CSS class | RDF nature | Visual treatment |
|-----------|-----------|------------|-----------------|
| `rdf:type` | `type` | single | small badge ("📚 skos:Collection") |
| `dct:title` | `title` | single | large heading |
| `dct:description` | `description` | single | prose paragraph |
| `dct:subject` | `subject` | **list** | coloured keyword chips |
| `dct:spatial` | `spatial` | single or list | green location chip |
| `dct:language` | `language` | single | pink language badge |
| `skos:member` | `member` | **list** | responsive card grid |
| `dct:creator` | `creator` | single or list | purple person badge |
| `dct:contributor` | `contributor` | **list** | purple person badge |
| `dct:publisher` | `publisher` | single | orange org badge |
| `dct:rights` | `rights` | single | © rights notice |
| `dct:created` | `created` | single | date metadata |
| `dct:modified` | `modified` | single | date metadata |
| `schema:url` | `url` | single | "View on MarineInfo" button |

### The "list" predicates highlighted

```turtle
# Five dataset members → five .triple.member divs → CSS card grid
skos:member  <https://marineinfo.org/id/dataset/4507> ;
skos:member  <https://marineinfo.org/id/dataset/6201> ;
skos:member  <https://marineinfo.org/id/dataset/6983> ;
skos:member  <https://marineinfo.org/id/dataset/7104> ;
skos:member  <https://marineinfo.org/id/dataset/7892> ;

# Six keyword subjects → six .triple.subject divs → CSS chip row
dct:subject  "marine biodiversity" ;
dct:subject  "North Sea" ;
dct:subject  "species occurrence" ;
dct:subject  "environmental monitoring" ;
dct:subject  "benthic ecology" ;
dct:subject  "oceanography" ;
```

The template CSS for members uses `width: calc(33.33% - .35rem)` inside a
`display: flex; flex-wrap: wrap` host — three cards per row on desktop,
automatically stacking on mobile.

---

## Quick-start snippet

Copy this as a starting point and adjust the CSS rules for your own
predicates:

```html
<!-- 1. Template CSS (injected into shadow DOM) -->
<style id="my-triple-styles">
  .rdf-template-host {
    display: flex;
    flex-wrap: wrap;
    gap: .5rem;
    padding: 1.5rem;
  }
  .triple { display: none; }

  /* Add one block per predicate class you want to render */
  .triple.title {
    display: block;
    width: 100%;
    font-size: 1.5rem;
    font-weight: bold;
  }
  .triple.description {
    display: block;
    width: 100%;
    line-height: 1.6;
  }
  .triple.subject {
    display: inline-flex;
    background: #e3f2fd;
    border-radius: 14px;
    padding: .3em .85em;
    font-size: .8rem;
  }
  .triple.member {
    display: flex;
    width: calc(33% - .35rem);
    min-width: 160px;
    border: 1px solid #ddd;
    border-radius: 6px;
    padding: .75rem 1rem;
  }

  /* URI vs literal switching */
  .triple[data-is-uri="true"]  .value-text { display: none; }
  .triple[data-is-uri="false"] .value-link { display: none; }
</style>

<!-- 2. Per-triple template -->
<template id="my-triple">
  <div class="triple {predicate-class}"
       data-predicate="{predicate}"
       data-is-uri="{object-is-uri}">
    <span class="label">{predicate-short}</span>
    <span class="value-text">{object}</span>
    <a class="value-link"
       href="{object}"
       target="_blank"
       rel="noopener noreferrer">{object-short}</a>
  </div>
</template>

<!-- 3. Component -->
<rdf-display
  template-id="my-triple"
  template-styles="my-triple-styles"
>
  <rdf-adapter src="path/to/data.ttl"></rdf-adapter>
</rdf-display>

<script type="module" src="/src/components/rdf-adapter.js"></script>
<script type="module" src="/src/components/rdf-display.js"></script>
```

---

## Block templates → SHACL shapes (playground)

The playground block editor now generates a SHACL file (`rdf-shapes.ttl`) from
the same predicate/path mappings used in block mode.

### Mapping diagram

```text
Block editor canvas
  ├─ heading            data-rdf-predicate=".../title"
  ├─ tag-cloud          data-rdf-predicate=".../subject"
  └─ section            data-rdf-predicate=".../member"
       └─ subheading    data-rdf-predicate=".../label"

↓ collect mapping descriptors

[
  { path: [title], isList: false },
  { path: [subject], isList: true  },
  { path: [member, label], isList: false }
]

↓ SHACL generation

sh:property [ sh:path <.../title>; sh:maxCount 1; ... ]
sh:property [ sh:path <.../subject>; ... ]
sh:property [ sh:path ( <.../member> <.../label> ); ... ]
```

### What gets downloaded

When you click **Download** after generating from blocks:

- `rdf-template.html`
- `rdf-standalone.html`
- `rdf-shapes.ttl` (new)

---

## Using lens flat objects with `rdf-display` templates

`rdf-display` template tokens (`{predicate}`, `{object}`, etc.) are
triple-oriented. Lens output from SHACL extraction is object-oriented.

```text
Triples today:
  [{subject,predicate,object,...}, ...]

Lens output:
  { title: "...", subject: ["...","..."], memberLabel: "..." }
```

For compatibility with current templates, convert lens objects to display
triples first (middle-layer responsibility), then feed those triples into
template rendering.

---

## What is still needed for full lens-mode support

```text
Current
  rdf-adapter -> rdf-loaded({ triples, allTriples, rawQuads })
  rdf-display <- consumes triples

Added
  rdf-lens middle layer:
    rawQuads -> RDFJS quads -> SHACL lens extraction -> flat object

Next (full integration)
  1) Add a dedicated "lens-data" input mode to rdf-display
  2) Add template bindings for object fields (e.g. {field:title})
  3) Add repeat syntax for array fields (e.g. member[])
  4) Provide optional field-to-predicate mapping for backward-compatible CSS classes
```
