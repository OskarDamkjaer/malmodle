export const FLAGS = ['pin'];
export const FLAGS_KEY = 'malmo-flags';
export const FLAGS_PARAM = 'flaggor';

function stored(text) {
  try {
    const names = JSON.parse(text);
    return Array.isArray(names) ? names : [];
  } catch {
    return [];
  }
}

export function readFlags(hash, saved) {
  const params = new URLSearchParams(hash.replace(/^#/, ''));
  const asked = params.get(FLAGS_PARAM);
  params.delete(FLAGS_PARAM);
  const names = asked === null ? stored(saved) : asked.split(',').map((n) => n.trim());
  return {
    on: FLAGS.filter((flag) => names.includes(flag)),
    changed: asked !== null,
    hash: params.toString(),
  };
}
