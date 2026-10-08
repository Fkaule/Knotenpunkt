/* Modelle zum Ansehen (Link #modell-Name): Nachrechnungen mit freien Knotenlagen, eigenem Werkstoff und eigenen
   Querschnitten. Format siehe FEM.free; material geht an FEM.make. Fürs Zeichnen wie bei den festen Bauteilen margin und dim. */
const MODELLE = (() => {
  // Strommast nach einem Ansys-Modell aus der Nichtlinearen Strukturmechanik (2026): Vorderwand als halber 3D-Mast
  // (symmetrisch, trägt F/2), Eckstiele gerade von ±1,25 m zur Spitze bei 10 m, Kreuzungen der Diagonalen verbunden.
  // Profil 2 trägt zusätzlich das Gewicht der Seitenwand (gleicher Querschnitt, doppelte Masse).
  const leg = z => 1.25 * (1 - z / 10), d = 20, A = Math.PI * d * d / 4;
  const rund = (b, kg) => ({ name: 'Vollrund 20 mm', b, A, I: Math.PI * d ** 4 / 64, W: Math.PI * d ** 3 / 32, kgmm: kg * A * 7.85e-6, w: 1 });   // w: Strichstärke wie Profil 1
  const nodes = { top: [0, 10], tL: [-3, 7], tR: [3, 7], mL: [-1.6875, 7.7], mR: [1.6875, 7.7], k1: [0, 2.5], k2: [0, 6], k3: [0, 8] };
  for (const z of [0, 4, 7, 8.5]) { nodes['L' + z] = [-leg(z), z]; nodes['R' + z] = [leg(z), z]; }
  const S = 1, W = 2;   // Eckstiele und Traverse, Wandverband
  const strommast = {
    name: 'Strommast', note: 'Nachrechnung eines Ansys-Modells aus der Nichtlinearen Strukturmechanik: Vorderwand des Gittermasts, Vollrund 20 mm, E = 200 GPa, Re = 250 MPa, Füße eingespannt, mit Eigengewicht. Die Vorderwand trägt die Hälfte der Last an der Traversenspitze (Traglast in Ansys 6,48 kN, hier F/2 = 3,24 kN).',
    material: { E: 200000, RE: 250, profiles: [rund('Ø20', 1), rund('Ø20 Verband', 2)] },
    nodes, nsub: 8, opts: { gravity: true, buckling: true }, model: 'frame',
    members: [
      ['L0', 'L4', S], ['L4', 'L7', S], ['L7', 'L8.5', S], ['L8.5', 'top', S], ['R0', 'R4', S], ['R4', 'R7', S], ['R7', 'R8.5', S], ['R8.5', 'top', S],
      ['L4', 'R4', W], ['L7', 'R7', W], ['L8.5', 'R8.5', W],
      ['L0', 'k1', W], ['k1', 'R4', W], ['R0', 'k1', W], ['k1', 'L4', W], ['L4', 'k2', W], ['k2', 'R7', W],
      ['R4', 'k2', W], ['k2', 'L7', W], ['L7', 'k3', W], ['k3', 'R8.5', W], ['R7', 'k3', W], ['k3', 'L8.5', W],
      ['tL', 'L7', S], ['tL', 'mL', S], ['mL', 'L8.5', S], ['mL', 'L7', S], ['tR', 'R7', S], ['tR', 'mR', S], ['mR', 'R8.5', S], ['mR', 'R7', S],
    ],
    supports: [{ kind: 'wand', nodes: ['L0'], side: 'bottom', fix: 7 }, { kind: 'wand', nodes: ['R0'], side: 'bottom', fix: 7 }],
    loads: [{ node: 'tR', fx: 0, fy: -3240 }],
    margin: [0.5, 1.2, 1.9, 1.0], dim: [1.45, 0.7],
  };
  return { strommast };
})();
if (typeof module !== 'undefined') module.exports = MODELLE;
