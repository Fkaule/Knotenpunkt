/* Feste Bauteile. Raster in Metern (FEM.GRID), Knoten (i, j) mit j nach oben, Lasten in N.
   Lasten so bemessen, dass das volle Stabwerk als Fachwerk zu gut 50 % ausgelastet ist (scripts/kalibrieren.js).
   Fürs Zeichnen: margin [oben, rechts, unten, links] und dim [Abstand der Bemaßung unten, links] in Rasterfeldern;
   stamp: 'unten', wenn oben rechts Stäbe stehen und unten rechts frei ist. */
const LEVELS = (() => {
  const range = (a, b) => Array.from({ length: b - a + 1 }, (_, k) => a + k);
  const kran = { name: 'Kran', note: 'Mast unten eingespannt, die Last hängt am Ende des Auslegers.',
    nx: 7, ny: 7, cut: [], margin: [0.5, 1.8, 1.1, 1.1], dim: [0.75, 0.6], stamp: 'unten',
    supports: [{ kind: 'wand', nodes: range(0, 2).map(i => [i, 0]), side: 'bottom', fix: 7 }],
    loads: [{ node: [7, 5], fx: 0, fy: -19000 }] };
  for (let x = 2; x < 7; x++) for (let y = 0; y < 5; y++) kran.cut.push([x, y]);
  return [
    { name: 'Brücke', note: 'Festlager links, Loslager rechts. Die Fahrbahn unten bleibt, an jedem ihrer Knoten hängt eine Last.',
      nx: 10, ny: 3, margin: [0.5, 0.9, 2.3, 1.2], dim: [1.85, 0.75],
      supports: [{ kind: 'fest', nodes: [[0, 0]], side: 'bottom', fix: 3 }, { kind: 'los', nodes: [[10, 0]], side: 'bottom', fix: 2 }],
      loads: range(1, 9).map(i => ({ node: [i, 0], fx: 0, fy: -17000 })),
      frozen: range(0, 9).map(i => [i, 0, i + 1, 0]) },
    { name: 'Kragarm', note: 'Links in der Wand eingespannt, rechts unten hängt die Last. Der Klassiker.',
      nx: 8, ny: 4, margin: [0.5, 1.8, 1.9, 1.2], dim: [1.5, 0.75],
      supports: [{ kind: 'wand', nodes: range(0, 4).map(j => [0, j]), side: 'left', fix: 7 }],
      loads: [{ node: [8, 0], fx: 0, fy: -45000 }] },
    kran,
  ];
})();
if (typeof module !== 'undefined') module.exports = LEVELS;
