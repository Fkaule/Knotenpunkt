/* Feste Bauteile. Raster in Metern (FEM.GRID), Knoten (i, j) mit j nach oben, Lasten in N.
   Lasten so bemessen, dass das volle Raster im mittleren Profil als Fachwerk zu gut 50 % ausgelastet ist
   (scripts/kalibrieren.js); beim Tor so, dass Stützen und Riegel allein als Rahmen erst im dicksten Profil halten.
   Fürs Zeichnen: margin [oben, rechts, unten, links] und dim [Abstand der Bemaßung unten, seitlich] in Rasterfeldern,
   dimSide 'right' setzt die Höhenbemaßung nach rechts;
   stamp: 'unten', wenn oben rechts Stäbe stehen und unten rechts frei ist. */
const LEVELS = (() => {
  const range = (a, b) => Array.from({ length: b - a + 1 }, (_, k) => a + k);
  const kran = { name: 'Kran', note: 'Mast unten eingespannt, die Last hängt am Ende des Auslegers.',
    nx: 7, ny: 7, cut: [], margin: [0.5, 1.8, 1.1, 1.1], dim: [0.75, 0.6], stamp: 'unten',
    supports: [{ kind: 'wand', nodes: range(0, 2).map(i => [i, 0]), side: 'bottom', fix: 7 }],
    loads: [{ node: [7, 5], fx: 0, fy: -38000 }] };
  for (let x = 2; x < 7; x++) for (let y = 0; y < 5; y++) kran.cut.push([x, y]);
  return [
    { name: 'Tor', note: 'Stützen und Riegel sind vorgegeben, unten gelenkig gelagert, der Wind drückt oben links. Als Fachwerk ist das leere Tor beweglich, als Rahmen trägt es über Biegung, wenn die Profile dick genug sind.',
      nx: 3, ny: 3, margin: [0.6, 1.2, 1.3, 0.6], dim: [0.95, 0.75], dimSide: 'right',
      supports: [{ kind: 'fest', nodes: [[0, 0], [3, 0]], side: 'bottom', fix: 3 }],
      loads: [{ node: [0, 3], fx: 5000, fy: 0 }],
      frozen: [...range(0, 2).map(j => [0, j, 0, j + 1]), ...range(0, 2).map(j => [3, j, 3, j + 1]), ...range(0, 2).map(i => [i, 3, i + 1, 3])] },
    { name: 'Brücke', note: 'Festlager links, Loslager rechts. Die Fahrbahn unten bleibt, an jedem ihrer Knoten hängt eine Last.',
      nx: 10, ny: 3, margin: [0.5, 0.9, 2.3, 1.2], dim: [1.85, 0.75],
      supports: [{ kind: 'fest', nodes: [[0, 0]], side: 'bottom', fix: 3 }, { kind: 'los', nodes: [[10, 0]], side: 'bottom', fix: 2 }],
      loads: range(1, 9).map(i => ({ node: [i, 0], fx: 0, fy: -34000 })),
      frozen: range(0, 9).map(i => [i, 0, i + 1, 0]) },
    { name: 'Kragarm', note: 'Links in der Wand eingespannt, rechts unten hängt die Last. Der Klassiker.',
      nx: 8, ny: 4, margin: [0.5, 1.8, 1.9, 1.2], dim: [1.5, 0.75],
      supports: [{ kind: 'wand', nodes: range(0, 4).map(j => [0, j]), side: 'left', fix: 7 }],
      loads: [{ node: [8, 0], fx: 0, fy: -90000 }] },
    kran,
  ];
})();
if (typeof module !== 'undefined') module.exports = LEVELS;
