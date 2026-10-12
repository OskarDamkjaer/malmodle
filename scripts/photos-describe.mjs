import { readFile, writeFile } from 'node:fs/promises';
import { files, toPhoto } from './lib/commons.mjs';

const QUEUE = 'data/cache/photos/final-queue.json';
const HIDDEN = /^(CC-|GFDL|Self-published|Files? (with|by|from|uploaded)|Pages with|Media (with|needing)|Uploaded with|Taken with|Photographs taken on|Images (with|from)|Wikimedia|Panoramio files|Flickr)/i;

const decode = (t) => t && t.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#0?39;/g, "'").replace(/&amp;/g, '&').replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim();

const queue = JSON.parse(await readFile(QUEUE, 'utf8'));
const ids = [...new Set(queue.items.flatMap((i) => i.alternatives.filter((a) => a.source === 'commons').map((a) => a.id)))];
const meta = new Map((await files(ids)).map(toPhoto).filter(Boolean).map((p) => [p.id, p]));
let described = 0;
for (const item of queue.items) {
  for (const a of item.alternatives) {
    const p = meta.get(a.id);
    if (!p) continue;
    a.description = decode(p.description) || null;
    a.categories = p.categories.filter((c) => !HIDDEN.test(c));
    if (p.description) described++;
  }
}
await writeFile(QUEUE, JSON.stringify(queue));
console.log(`${ids.length} Commons photos, ${meta.size} found, ${described} with a description`);
