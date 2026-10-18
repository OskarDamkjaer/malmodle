export function localR2() {
  const objects = new Map();
  return {
    async put(key, body, { httpMetadata = {}, onlyIf = {} } = {}) {
      const old = objects.get(key);
      if (old && onlyIf.uploadedBefore && old.uploaded >= onlyIf.uploadedBefore) return null;
      const object = { body: String(body), httpMetadata, uploaded: onlyIf.uploadedBefore ?? new Date() };
      objects.set(key, object);
      return object;
    },
    async get(key) {
      return objects.get(key) ?? null;
    },
  };
}
