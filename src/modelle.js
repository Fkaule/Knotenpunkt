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
  // Fahrradrahmen: klassischer Diamantrahmen aus Stahl, Größe etwa 56 cm (Sitzrohr 73,5°, Steuerrohr 73°, Oberrohr bis
  // zur Mitte des Steuerrohrs, Kettenstreben 410 mm, Tretlager 70 mm unter der Hinterachse), vereinfacht wie in der TM: das
  // Steuerrohr ist ein Knoten in seiner Mitte, dort das Loslager (ohne Gabel und Vorderrad). So sind es zwei Dreiecke, als
  // Fachwerk statisch bestimmt. Knotenlagen in dm (grid 100 mm), damit Lager und Pfeile zur Größe passen. Ketten- und
  // Sitzstreben sind Paare: in der Ebene ein Stab mit doppeltem Querschnitt. Rohre ohne Konifizierung.
  const fahrrad = (() => {
    const z = x => String(x).replace('.', ',');
    const rohr = (D, t, w, paar) => {
      const di = D - 2 * t, A = Math.PI / 4 * (D * D - di * di), I = Math.PI / 64 * (D ** 4 - di ** 4), n = paar ? 2 : 1;
      return { name: `${paar ? '2 × ' : ''}Rohr ${z(D)} × ${z(t)}`, b: `Ø${z(D)}${paar ? ' (Paar)' : ''}`, A: n * A, I: n * I, W: n * 2 * I / D,
        kgmm: n * A * 7.85e-6, w };
    };
    const deg = Math.PI / 180, sitz = 73.5 * deg, lenk = 73 * deg, dm = (x, y) => [x * 10, y * 10];
    const ST = [-0.55 / Math.tan(sitz), 0.55], H = [0.39 + 0.07 * Math.cos(lenk), 0.55 - 0.07 * Math.sin(lenk)];   // Steuerrohr 140 mm, Mitte
    const RA = [-Math.sqrt(0.41 ** 2 - 0.07 ** 2), 0.07];
    const U = 1, O = 2, K = 3, S = 4;   // Sitz- und Unterrohr, Oberrohr, Ketten-, Sitzstreben
    return {
      name: 'Fahrradrahmen', note: 'Klassischer Diamantrahmen aus Stahl (CrMo, angenommen E = 210 GPa, Re = 600 MPa, Rohre ohne ' +
        'Konifizierung), Größe etwa 56 cm, vereinfacht wie in der TM: Das Steuerrohr ist ein Knoten, dort sitzt das Loslager. ' +
        'Hinterachse Festlager. Fahrer etwa 80 kg (800 N) ganz auf dem Sattel, statisch, am Sitzknoten. Ketten- und Sitzstreben ' +
        'sind Paare, in der Ebene zusammengefasst. Zwei Dreiecke: als Fachwerk statisch bestimmt, als Rahmen mit Biegung in den ' +
        'steifen Knoten.',
      material: { E: 210000, RE: 600, grid: 100,
        profiles: [rohr(28.6, 0.8, 1.4), rohr(25.4, 0.8, 1.25), rohr(22, 0.8, 1.1, 1), rohr(16, 0.8, 0.8, 1)] },
      nodes: { BB: [0, 0], RA: dm(...RA), ST: dm(...ST), H: dm(...H) },
      nsub: 6, opts: { gravity: false, buckling: true }, model: 'truss',
      members: [['BB', 'ST', U], ['BB', 'H', U], ['ST', 'H', O], ['RA', 'BB', K], ['RA', 'ST', S]],
      supports: [{ kind: 'fest', nodes: ['RA'], side: 'bottom', fix: 3 }, { kind: 'los', nodes: ['H'], side: 'bottom', fix: 2 }],
      loads: [{ node: 'ST', fx: 0, fy: -800 }],
      margin: [0.5, 0.8, 1.4, 1.5], dim: [1.0, 1.0],
    };
  })();
  return { strommast, fahrrad };
})();
if (typeof module !== 'undefined') module.exports = MODELLE;
