/**
 * rdf-utils.js
 *
 * Shared URI-handling helpers used by both dom-adapter and rdf-display.
 */

/**
 * Returns true if `value` looks like an absolute http(s) URI.
 * @param {string} value
 * @returns {boolean}
 */
export function isUri(value) {
  return typeof value === "string" && /^https?:\/\//i.test(value);
}

/**
 * Return the last meaningful segment of a URI:
 *  - fragment identifier (after `#`) if present
 *  - last path segment (after `/`) otherwise
 *  - the full value when neither is applicable
 *
 * @param {string} uri
 * @returns {string}
 */
export function shortenUri(uri) {
  if (!uri) return "";
  const hash = uri.lastIndexOf("#");
  if (hash !== -1) return uri.slice(hash + 1);
  const slash = uri.lastIndexOf("/");
  if (slash !== -1 && slash < uri.length - 1) return uri.slice(slash + 1);
  return uri;
}
