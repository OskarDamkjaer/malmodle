const LIGHT = { answer: '#2e9e4f', context: '#111111', hit: '#c8102e', tap: '#111111', outline: '#55524c' };
const DARK = { answer: '#4cd07d', context: '#7aa7ff', hit: '#ff5c5c', tap: '#ffffff', outline: '#c9d1dc' };

export const STYLES = {
  tidning: {
    label: 'Tidning',
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
    marks: LIGHT,
  },
  papper: {
    label: 'Papper',
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
    marks: LIGHT,
  },
  klar: {
    label: 'Klar',
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
    marks: LIGHT,
  },
  terrang: {
    label: 'Terräng',
    map: {
      background: '#fbfbf7',
      residential: 'rgba(0,0,0,0)',
      water: '#9fd0ee',
      green: '#cfe8b8',
      motorway: '#f28c38',
      major: '#fcd56b',
      minor: '#ffffff',
      casing: '#9b9b9b',
      rail: '#333333',
      building: '#bdb6ae',
      boundary: '#7a4d8f',
      text: '#222222',
      halo: '#fbfbf7',
      patterns: 0.5,
    },
    marks: LIGHT,
  },
  sjokort: {
    label: 'Sjökort',
    map: {
      background: '#f5ecd2',
      residential: 'rgba(0,0,0,0)',
      water: '#bfe0ea',
      green: '#e3e6c4',
      motorway: '#c89f6e',
      major: '#e7d3b0',
      minor: '#fbf6e8',
      casing: '#b8a789',
      rail: '#8c7b62',
      building: '#e6d7b4',
      boundary: '#6e5d43',
      text: '#3d3320',
      halo: '#f5ecd2',
      patterns: 0.4,
    },
    marks: LIGHT,
  },
  blyerts: {
    label: 'Blyerts',
    map: {
      background: '#fafafa',
      residential: 'rgba(0,0,0,0)',
      water: '#c4c4c4',
      green: '#efefef',
      motorway: '#ffffff',
      major: '#ffffff',
      minor: '#ffffff',
      casing: '#9a9a9a',
      rail: '#8a8a8a',
      building: '#e6e6e6',
      boundary: '#555555',
      text: '#333333',
      halo: '#fafafa',
      patterns: 0.2,
    },
    marks: LIGHT,
  },
  natt: {
    label: 'Natt',
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
    marks: DARK,
  },
  ritning: {
    label: 'Ritning',
    map: {
      background: '#1d3f6e',
      residential: 'rgba(0,0,0,0)',
      water: '#163257',
      green: '#1c4f63',
      motorway: '#e8f0ff',
      major: '#c9d8f0',
      minor: '#8fa9cf',
      casing: '#1d3f6e',
      rail: '#9fb6d8',
      building: '#2a5689',
      boundary: '#c9d8f0',
      text: '#e8f0ff',
      halo: '#1d3f6e',
      patterns: 0.15,
    },
    marks: DARK,
  },
};

export const DEFAULT_STYLE = 'tidning';
export const STYLE_KEY = 'malmo-style';

export const styleNamed = (name) => (Object.hasOwn(STYLES, name) ? name : DEFAULT_STYLE);

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
