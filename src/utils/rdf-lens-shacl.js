/**
 * Build SHACL Turtle from block-template path descriptors.
 *
 * Each descriptor represents one extracted field:
 *   { path: string[], name?: string, isList?: boolean, filterType?: string }
 */

function lastPathSegment(uri) {
  if (!uri) return "field";
  const hash = uri.lastIndexOf("#");
  if (hash !== -1) return uri.slice(hash + 1);
  const slash = uri.lastIndexOf("/");
  if (slash !== -1 && slash < uri.length - 1) return uri.slice(slash + 1);
  return uri;
}

function mapFilterTypeToXsd(filterType) {
  switch ((filterType || "").toLowerCase()) {
    case "integer":
      return "xsd:integer";
    case "decimal":
      return "xsd:decimal";
    case "boolean":
      return "xsd:boolean";
    case "date":
      return "xsd:date";
    case "datetime":
      return "xsd:dateTime";
    case "uri":
      return "xsd:anyURI";
    case "string":
      return "xsd:string";
    default:
      return null;
  }
}

function pathToShaclPath(path) {
  if (path.length === 1) return `<${path[0]}>`;
  return `( ${path.map((p) => `<${p}>`).join(" ")} )`;
}

function escapeTurtleString(value) {
  return String(value)
    .replace(/\\/g, "\\\\")
    .replace(/\n/g, "\\n")
    .replace(/\r/g, "\\r")
    .replace(/"/g, '\\"');
}

/**
 * @param {Array<{ path: string[], name?: string, isList?: boolean, filterType?: string }>} descriptors
 * @param {{ shapeIri?: string, targetClassIri?: string }} [options]
 * @returns {string}
 */
export function buildShaclFromDescriptors(descriptors, options = {}) {
  const shapeIri = options.shapeIri || "https://example.org/shapes/GeneratedShape";
  const targetClassIri =
    options.targetClassIri || "https://example.org/model/GeneratedResource";

  const dedup = new Map();
  for (const d of descriptors) {
    if (!Array.isArray(d.path) || d.path.length === 0) continue;
    const key = d.path.join(" ");
    if (!dedup.has(key)) {
      dedup.set(key, {
        path: d.path,
        name: d.name || lastPathSegment(d.path[d.path.length - 1]),
        isList: !!d.isList,
        filterType: d.filterType || "",
      });
      continue;
    }
    const current = dedup.get(key);
    current.isList = current.isList || !!d.isList;
    if (!current.filterType && d.filterType) current.filterType = d.filterType;
  }

  const properties = [...dedup.values()].map((d) => {
    const datatype = mapFilterTypeToXsd(d.filterType);
    return [
      "  sh:property [",
      `    sh:name "${escapeTurtleString(d.name)}" ;`,
      `    sh:path ${pathToShaclPath(d.path)} ;`,
      datatype ? `    sh:datatype ${datatype} ;` : null,
      d.isList ? null : "    sh:maxCount 1 ;",
      "  ] ;",
    ]
      .filter(Boolean)
      .join("\n");
  });

  if (properties.length === 0) return "";

  return [
    "@prefix sh:  <http://www.w3.org/ns/shacl#> .",
    "@prefix xsd: <http://www.w3.org/2001/XMLSchema#> .",
    "",
    `<${shapeIri}> a sh:NodeShape ;`,
    `  sh:targetClass <${targetClassIri}> ;`,
    properties.join("\n"),
    "  .",
    "",
  ].join("\n");
}
