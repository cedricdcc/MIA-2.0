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
    case "image":
      return "xsd:anyURI";
    case "string":
      return "xsd:string";
    default:
      return null;
  }
}

function formatDatatype(datatype, filterType) {
  if (datatype) {
    if (datatype.startsWith("xsd:")) return datatype;
    return `<${datatype}>`;
  }
  return mapFilterTypeToXsd(filterType);
}

function formatIri(value, prefixes = {}) {
  if (!value) return value;
  for (const [prefix, iri] of Object.entries(prefixes)) {
    if (iri && value.startsWith(iri)) {
      return `${prefix}:${value.slice(iri.length)}`;
    }
  }
  return `<${value}>`;
}

function pathToShaclPath(path, prefixes) {
  if (path.length === 1) return formatIri(path[0], prefixes);
  return `( ${path.map((p) => formatIri(p, prefixes)).join(" ")} )`;
}

function escapeTurtleString(value) {
  return String(value)
    .replace(/\\/g, "\\\\")
    .replace(/\n/g, "\\n")
    .replace(/\r/g, "\\r")
    .replace(/"/g, '\\"');
}

export function buildShaclFromDescriptors(descriptors, options = {}) {
  const shapeIri = options.shapeIri || "https://example.org/shapes/GeneratedShape";
  const targetClassIri =
    options.targetClassIri || "https://example.org/model/GeneratedResource";
  const prefixes = options.prefixes || {};

  const dedup = new Map();
  for (const d of descriptors || []) {
    if (!Array.isArray(d.path) || d.path.length === 0) continue;
    const key = d.path.join(" ");
    if (!dedup.has(key)) {
      dedup.set(key, {
        path: d.path,
        name: d.name || lastPathSegment(d.path[d.path.length - 1]),
        isList: !!d.isList,
        filterType: d.filterType || "",
        datatype: d.datatype || "",
      });
      continue;
    }
    const current = dedup.get(key);
    current.isList = current.isList || !!d.isList;
    if (!current.filterType && d.filterType) current.filterType = d.filterType;
    if (!current.datatype && d.datatype) current.datatype = d.datatype;
  }

  const properties = [...dedup.values()].map((d) => {
    const datatype = formatDatatype(d.datatype, d.filterType);
    return [
      "  sh:property [",
      `    sh:name "${escapeTurtleString(d.name)}" ;`,
      `    sh:path ${pathToShaclPath(d.path, prefixes)} ;`,
      datatype ? `    sh:datatype ${datatype} ;` : null,
      "    sh:minCount 1 ;",
      d.isList ? null : "    sh:maxCount 1",
      "  ] ;",
    ]
      .filter(Boolean)
      .join("\n");
  });

  if (!properties.length) return "";

  const prefixLines = {
    sh: "http://www.w3.org/ns/shacl#",
    xsd: "http://www.w3.org/2001/XMLSchema#",
    ...prefixes,
  };

  return [
    ...Object.entries(prefixLines).map(([p, iri]) => `@prefix ${p}: <${iri}> .`),
    "",
    `${formatIri(shapeIri, prefixes)} a sh:NodeShape ;`,
    `  sh:targetClass ${formatIri(targetClassIri, prefixes)} ;`,
    properties.join("\n"),
    "  .",
    "",
  ].join("\n");
}
