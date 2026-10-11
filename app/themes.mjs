export const THEMES = {
  papper: {
    label: 'Papper',
    themeColor: '#f3eee7',
    map: {
      background: '#f3eee7',
      residential: 'rgba(0,0,0,0)',
      water: '#a8c6e6',
      green: '#d5e3c4',
      motorway: '#f2b77c',
      major: '#f8e2a4',
      minor: '#ffffff',
      casing: '#d8cdbf',
      rail: '#b8ad9f',
      building: '#e4dccf',
      boundary: '#8f8576',
      text: '#6b5d4d',
      halo: '#f3eee7',
      patterns: 0.8,
    },
    marks: { answer: '#1f6f5c', context: '#2f5f9a', hit: '#b4442a', tap: '#201d19', outline: '#8a7a68' },
  },
  natt: {
    label: 'Natt',
    themeColor: '#12151a',
    map: {
      background: '#12151a',
      residential: 'rgba(0,0,0,0)',
      water: '#0d2536',
      green: '#16241d',
      motorway: '#5a4a39',
      major: '#3a4250',
      minor: '#232831',
      casing: '#0b0d10',
      rail: '#353b45',
      building: '#1b2028',
      boundary: '#4a5160',
      text: '#97a2b1',
      halo: '#12151a',
      patterns: 0.12,
    },
    marks: { answer: '#5fd3a5', context: '#7aa7ff', hit: '#ff7a59', tap: '#ffffff', outline: '#6b7686' },
  },
  tidning: {
    label: 'Tidning',
    themeColor: '#f4f1ea',
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
  },
  klar: {
    label: 'Klar',
    themeColor: '#f7f4ec',
    map: {
      background: '#f7f4ec',
      residential: 'rgba(0,0,0,0)',
      water: '#74b8ff',
      green: '#bfe6a6',
      motorway: '#ff9d42',
      major: '#ffd84a',
      minor: '#ffffff',
      casing: '#e2d6c0',
      rail: '#b7ab97',
      building: '#ece4d5',
      boundary: '#6d6457',
      text: '#4a3f33',
      halo: '#ffffff',
      patterns: 1,
    },
    marks: { answer: '#1a8c5b', context: '#2b59ff', hit: '#e8462f', tap: '#1b1b1f', outline: '#7a6d5c' },
  },
};

export const DEFAULT_THEME = 'tidning';

export function themeFromPath(pathname) {
  const first = pathname.split('/').filter(Boolean)[0];
  return first && THEMES[first] ? first : DEFAULT_THEME;
}

export function themePath(name) {
  return name === DEFAULT_THEME ? '/' : `/${name}/`;
}

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
