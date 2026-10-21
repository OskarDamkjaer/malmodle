export const PALETTE = {
  map: {
    background: '#f4f1ea',
    residential: 'rgba(0,0,0,0)',
    water: '#c7d1d4',
    green: '#e0e2d5',
    motorway: '#ffffff',
    major: '#ffffff',
    minor: '#fbfaf6',
    casing: '#8f8a80',
    rail: '#77736b',
    building: '#e4dfd5',
    boundary: '#55524c',
    text: '#2b2925',
    halo: '#f4f1ea',
    patterns: 0.35,
  },
  marks: { answer: '#2e9e4f', context: '#111111', hit: '#c8102e', tap: '#111111', outline: '#55524c' },
};

const GROUPS = [
  ['background', /^background$/, 'background-color'],
  ['residential', /^landuse_residential$/, 'fill-color'],
  ['water', /^water$/, 'fill-color'],
  ['water', /^waterway_/, 'line-color'],
  ['green', /^(park|landcover_(wood|grass|sand)|landuse_(pitch|track|cemetery|school|hospital))$/, 'fill-color'],
  ['green', /^park_outline$/, 'line-color'],
  ['casing', /_casing$/, 'line-color'],
  ['rail', /rail/, 'line-color'],
  ['motorway', /^(road|tunnel|bridge)_motorway(_link)?$/, 'line-color'],
  ['major', /^(road|tunnel|bridge)_(trunk_primary|secondary_tertiary|link)$/, 'line-color'],
  ['minor', /^(road|tunnel|bridge)_(minor|street|service_track|path_pedestrian)$/, 'line-color'],
  ['building', /^building$/, 'fill-color'],
  ['boundary', /^boundary_/, 'line-color'],
];

export function paintFor(layer, palette) {
  const out = {};
  for (const [key, pattern, property] of GROUPS) {
    if (!pattern.test(layer.id) || palette[key] == null) continue;
    if (property === 'line-color' && layer.type !== 'line') continue;
    if (property === 'fill-color' && layer.type !== 'fill') continue;
    out[property] = palette[key];
    if (key === 'green' && layer.type === 'fill') out['fill-opacity'] = 1;
    break;
  }
  if (layer.type === 'fill' && layer.paint?.['fill-pattern'] && palette.patterns != null) {
    out['fill-opacity'] = palette.patterns;
  }
  if (layer.type === 'symbol') {
    out['text-color'] = palette.text;
    out['text-halo-color'] = palette.halo;
  }
  return out;
}
