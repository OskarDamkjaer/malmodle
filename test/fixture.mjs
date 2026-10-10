const square = (x, y, size = 0.01) => ({
  type: 'Polygon',
  coordinates: [[[x, y], [x + size, y], [x + size, y + size], [x, y + size], [x, y]]],
});

export function fixture() {
  const items = [];
  for (let i = 0; i < 6; i++) {
    for (let j = 0; j < 6; j++) {
      const x = 12.95 + i * 0.01;
      const y = 55.57 + j * 0.01;
      items.push({ name: `Område ${i}-${j}`, kind: 'area', label: 'Delområde', point: [x + 0.005, y + 0.005], geometry: square(x, y) });
    }
  }
  for (let i = 0; i < 12; i++) {
    const y = 55.572 + i * 0.005;
    items.push({
      name: `Gata ${i}`, kind: 'street', label: 'Gata', point: [12.98, y],
      geometry: { type: 'MultiLineString', coordinates: [[[12.951, y], [13.009, y]]] },
    });
  }
  for (let i = 0; i < 16; i++) {
    const p = [12.952 + (i % 4) * 0.015, 55.571 + Math.floor(i / 4) * 0.015];
    items.push({ name: `Plats ${i}`, kind: 'landmark', label: 'Sevärdhet', point: p, geometry: { type: 'Point', coordinates: p } });
  }
  for (let i = 0; i < 5; i++) {
    const p = [12.955 + i * 0.012, 55.6];
    items.push({ name: `Bro ${i}`, kind: 'bridge', label: 'Bro', point: p, geometry: { type: 'Point', coordinates: p } });
  }
  return items;
}
