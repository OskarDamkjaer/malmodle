import { DEV_MOUNTS, MOUNTS } from './site.mjs';

const root = new URL('../../', import.meta.url);
const dirs = [...MOUNTS, ...DEV_MOUNTS].filter((m) => m.dir).sort((a, b) => b.url.length - a.url.length);
const served = dirs.map((m) => new URL(`${m.dir}/`, root).href);

export async function resolve(specifier, context, next) {
  const fromSite = served.some((dir) => context.parentURL?.startsWith(dir));
  const mount = fromSite && specifier.startsWith('/') ? dirs.find((m) => specifier.startsWith(m.url)) : null;
  if (!mount) return next(specifier, context);
  return next(new URL(`${mount.dir}/${specifier.slice(mount.url.length)}`, root).href, context);
}
