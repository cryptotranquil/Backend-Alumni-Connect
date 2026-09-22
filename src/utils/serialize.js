/** Convert Firestore timestamps and Date objects into JSON-safe ISO strings. */
function toIso(value) {
  if (!value) return value;
  if (typeof value.toDate === "function") {
    return value.toDate().toISOString();
  }
  if (value instanceof Date) return value.toISOString();
  return value;
}

function serialize(value) {
  if (value == null) return value;
  if (typeof value.toDate === "function" || value instanceof Date) {
    return toIso(value);
  }
  if (Array.isArray(value)) return value.map(serialize);
  if (typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [key, serialize(item)]),
    );
  }
  return value;
}

module.exports = { serialize, toIso };
