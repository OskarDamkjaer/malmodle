export function localR2() {
  const objects = new Map();
  return {
    async put(key, body, { httpMetadata = {} } = {}) {
      objects.set(key, { body: String(body), httpMetadata });
    },
    async get(key) {
      return objects.get(key) ?? null;
    },
  };
}
