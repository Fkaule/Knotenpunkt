// FE-Kern gegen Handrechnung: Kragbalken, Zweistab, Rahmen ohne Diagonale, Knicklänge, Algorithmus
const test = require("node:test");
const assert = require("node:assert");
const FEM = require("../src/fem.js");

const near = (a, b, tol, msg) => assert.ok(Math.abs(a / b - 1) < tol, `${msg}: ${a} statt ${b}`);
const only = (L, list) => { const on = new Uint8Array(L.nB); for (const b of list) on[L.barAt(...b)] = 1; return on; };
const F = 1000, P1 = FEM.PROFILES[0];   // only() setzt das kleinste Profil

test("Kragbalken aus vier Stäben: Rahmen wie Balkentheorie, Fachwerk beweglich", () => {
  const L = FEM.level({ nx: 4, ny: 1, supports: [{ kind: "wand", nodes: [[0, 0], [0, 1]], side: "left", fix: 7 }],
    loads: [{ node: [4, 0], fx: 0, fy: -F }] });
  const on = only(L, [[0, 0, 1, 0], [1, 0, 2, 0], [2, 0, 3, 0], [3, 0, 4, 0]]);
  const r = FEM.analyze(L, on, "frame"), Lb = 4 * FEM.GRID;
  assert.ok(r.disp, "Rahmen gerechnet");
  near(-r.disp[L.id(4, 0) * 3 + 1], F * Lb ** 3 / (3 * FEM.E * P1.I), 1e-5, "Durchbiegung");
  const k = L.barAt(0, 0, 1, 0);
  near(Math.abs(r.M[2 * k]), F * Lb, 1e-5, "Einspannmoment");
  near(r.util[k], F * Lb / P1.W / FEM.RE, 1e-5, "Auslastung");
  assert.strictEqual(FEM.analyze(L, on, "truss").reason, "mechanismus");
});

test("Zweistab: Stabkräfte wie Knotengleichgewicht, Druckstab knickt nach Euler", () => {
  // Knoten (1, 1) hängt an zwei Diagonalen zu den Festlagern (0, 0) und (2, 0)
  const L = FEM.level({ nx: 2, ny: 1, supports: [{ kind: "fest", nodes: [[0, 0], [2, 0]], side: "bottom", fix: 3 }],
    loads: [{ node: [1, 1], fx: 0, fy: -F }] });
  const on = only(L, [[0, 0, 1, 1], [2, 0, 1, 1]]);
  for (const model of ["truss", "frame"]) {
    const r = FEM.analyze(L, on, model);
    for (const b of [[0, 0, 1, 1], [2, 0, 1, 1]]) near(r.N[L.barAt(...b)], -F / Math.SQRT2, model === "truss" ? 1e-6 : 1e-3, `Stabkraft ${model}`);   // Rahmen: etwas Biegung aus der Längung
  }
  const r = FEM.analyze(L, on, "truss"), k = L.barAt(0, 0, 1, 1);
  const N = F / Math.SQRT2;   // Diagonale: Knicklast knapp über der Fließgrenze, es zählt die größere Auslastung
  near(r.util[k], Math.max(N / P1.A / FEM.RE, N / FEM.ncr(P1, Math.SQRT2 * FEM.GRID)), 1e-6, "Auslastung Druckstab");
  // Zug statt Druck: nur Fließen zählt
  const L2 = FEM.level({ nx: 2, ny: 1, supports: [{ kind: "fest", nodes: [[0, 1], [2, 1]], side: "top", fix: 3 }],
    loads: [{ node: [1, 0], fx: 0, fy: -F }] });
  const r2 = FEM.analyze(L2, only(L2, [[0, 1, 1, 0], [2, 1, 1, 0]]), "truss");
  near(r2.util[L2.barAt(0, 1, 1, 0)], F / Math.SQRT2 / P1.A / FEM.RE, 1e-6, "Zugstab");
});

test("Feld ohne Diagonale: als Fachwerk beweglich, als Rahmen trägt es über Biegung", () => {
  const L = FEM.level({ nx: 1, ny: 1, supports: [{ kind: "wand", nodes: [[0, 0], [1, 0]], side: "bottom", fix: 7 }],
    loads: [{ node: [0, 1], fx: F, fy: 0 }] });
  const portal = only(L, [[0, 0, 0, 1], [1, 0, 1, 1], [0, 1, 1, 1]]);
  assert.strictEqual(FEM.analyze(L, portal, "truss").reason, "mechanismus");
  const r = FEM.analyze(L, portal, "frame");
  assert.ok(r.ok, "Rahmen hält");
  // Mit Diagonale ist es auch als Fachwerk steif
  const braced = only(L, [[0, 0, 0, 1], [1, 0, 1, 1], [0, 1, 1, 1], [0, 0, 1, 1]]);
  assert.ok(FEM.analyze(L, braced, "truss").ok);
  // Eingespannter Rahmen, Riegel starr gegen Stiele: Kopfverschiebung zwischen F h³/(24 EI) und F h³/(6 EI)
  const u = r.disp[L.id(0, 1) * 3], h = FEM.GRID, EI = FEM.E * P1.I;
  assert.ok(u > F * h ** 3 / (24 * EI) && u < F * h ** 3 / (6 * EI), "Kopfverschiebung plausibel");
});

test("Lose Enden: im Fachwerk verschieblich (sie drehen sich um ihren Knoten), im Rahmen steif angeschlossen und ohne Last", () => {
  const L = FEM.level({ nx: 2, ny: 1, supports: [{ kind: "fest", nodes: [[0, 0], [2, 0]], side: "bottom", fix: 3 }],
    loads: [{ node: [1, 1], fx: 0, fy: -F }] });
  const on = only(L, [[0, 0, 1, 1], [2, 0, 1, 1], [1, 1, 1, 0], [0, 1, 1, 1]]);   // Stummel nach unten und nach links
  assert.strictEqual(FEM.analyze(L, on, "truss").reason, "mechanismus");
  assert.ok(FEM.analyze(L, only(L, [[0, 0, 1, 1], [2, 0, 1, 1]]), "truss").ok);   // ohne die Stummel hält es
  const r = FEM.analyze(L, on, "frame");
  assert.ok(r.ok);
  assert.strictEqual(r.fe[L.barAt(1, 1, 1, 0)], 0);
  assert.strictEqual(r.conn[L.barAt(0, 1, 1, 1)], 1);
  assert.strictEqual(FEM.analyze(L, only(L, [[0, 0, 1, 1]]), "truss").reason, "mechanismus");
  assert.strictEqual(FEM.analyze(L, only(L, [[0, 1, 1, 1]]), "frame").reason, "lastpfad");
});

test("Knicklänge läuft über Knoten ohne Querstab hinweg, im Rahmen wie im Fachwerk", () => {
  const L = FEM.level({ nx: 3, ny: 1, supports: [{ kind: "fest", nodes: [[0, 0]], side: "left", fix: 3 }],
    loads: [{ node: [3, 0], fx: -F, fy: 0 }] });
  const chain = only(L, [[0, 0, 1, 0], [1, 0, 2, 0], [2, 0, 3, 0]]);
  assert.strictEqual(FEM.bucklingLength(L, chain, L.barAt(1, 0, 2, 0)), 3 * FEM.GRID);
  const braced = only(L, [[0, 0, 1, 0], [1, 0, 2, 0], [2, 0, 3, 0], [1, 0, 1, 1]]);
  assert.strictEqual(FEM.bucklingLength(L, braced, L.barAt(1, 0, 2, 0)), 2 * FEM.GRID);
  assert.strictEqual(FEM.bucklingLength(L, braced, L.barAt(0, 0, 1, 0)), FEM.GRID);
  // ungestützte 3 m: Knicken maßgebend
  const r = FEM.analyze(L, chain, "frame");
  near(r.util[L.barAt(1, 0, 2, 0)], F / FEM.ncr(P1, 3 * FEM.GRID), 1e-6, "Knick-Auslastung");
  // auch im Fachwerk: der gerade Stabzug läuft durch, kein Gelenk an den Zwischenknoten
  near(FEM.analyze(L, chain, "truss").util[L.barAt(1, 0, 2, 0)], F / FEM.ncr(P1, 3 * FEM.GRID), 1e-6, "Knick-Auslastung Fachwerk");
});

test("Prüfbefund: loses Dreieck am Mittelknoten eines Druckstabs hält nichts (Rahmen: Knicken über die ganze Länge, Fachwerk: verschieblich)", () => {
  const L = FEM.level({ nx: 2, ny: 1, supports: [{ kind: "fest", nodes: [[0, 0]], side: "left", fix: 3 },
    { kind: "los", nodes: [[2, 0]], side: "right", fix: 2 }], loads: [{ node: [2, 0], fx: -80000, fy: 0 }] });
  const on = only(L, [[0, 0, 1, 0], [1, 0, 2, 0], [1, 0, 1, 1], [1, 1, 2, 1], [1, 0, 2, 1]]);
  const r = FEM.analyze(L, on, "frame");
  assert.strictEqual(r.fe[L.barAt(1, 0, 1, 1)], 0, "Dreieck trägt nicht");
  assert.strictEqual(r.Lk[L.barAt(0, 0, 1, 0)], 2 * FEM.GRID, "Knicklänge über beide Stäbe");
  assert.strictEqual(r.reason, "knicken");
  assert.strictEqual(FEM.analyze(L, on, "truss").reason, "mechanismus");   // im Fachwerk dreht sich das Dreieck um den Knoten
});

test("Prüfbefund: Sprosse zwischen zwei Druckketten hält im Fachwerk nichts (beweglich)", () => {
  const L = FEM.level({ nx: 2, ny: 1, supports: [{ kind: "fest", nodes: [[0, 0], [0, 1]], side: "left", fix: 3 },
    { kind: "los", nodes: [[2, 0], [2, 1]], side: "right", fix: 2 }],
    loads: [{ node: [2, 0], fx: -10000, fy: 0 }, { node: [2, 1], fx: -10000, fy: 0 }] });
  const on = only(L, [[0, 0, 1, 0], [1, 0, 2, 0], [0, 1, 1, 1], [1, 1, 2, 1], [1, 0, 1, 1]]);
  assert.strictEqual(FEM.analyze(L, on, "truss").reason, "mechanismus");
  // mit einer Diagonale im ersten Feld sind die Mittelknoten gehalten
  on[L.barAt(0, 0, 1, 1)] = 1;
  assert.ok(FEM.analyze(L, on, "truss").ok);
});

test("Kragstütze mit freiem Kopf: Rahmen knickt nach Euler-Fall 1 (Stabilität), Fachwerk ist beweglich", () => {
  const L = FEM.level({ nx: 1, ny: 3, supports: [{ kind: "wand", nodes: [[0, 0]], side: "bottom", fix: 7 }],
    loads: [{ node: [0, 3], fx: 0, fy: -1 }] });
  const col = only(L, [[0, 0, 0, 1], [0, 1, 0, 2], [0, 2, 0, 3]]), h = 3 * FEM.GRID;
  const Ncr1 = Math.PI ** 2 * FEM.E * P1.I / (4 * h * h);
  const at = F => { const d = JSON.parse(JSON.stringify(L.def)); d.loads[0].fy = -F; const Lf = FEM.level(d); return FEM.analyze(Lf, col, "frame"); };
  assert.ok(at(0.9 * Ncr1).ok, "unter der Knicklast hält sie");
  const r = at(1.1 * Ncr1);
  assert.strictEqual(r.reason, "stabil");
  near(r.lambda, 1 / 1.1, 0.02, "kritischer Lastfaktor");
  assert.strictEqual(FEM.analyze(L, col, "truss").reason, "mechanismus");
});

test("Zweigelenkrahmen unter Vertikallast knickt seitwärts (Stabilität), obwohl jeder Stab für sich hält", () => {
  const mk = F => FEM.level({ nx: 3, ny: 3, supports: [{ kind: "fest", nodes: [[0, 0], [3, 0]], side: "bottom", fix: 3 }],
    loads: [{ node: [0, 3], fx: 0, fy: -F }, { node: [3, 3], fx: 0, fy: -F }] });
  const portal = L => { const on = new Uint8Array(L.nB);
    for (let j = 0; j < 3; j++) { on[L.barAt(0, j, 0, j + 1)] = 1; on[L.barAt(3, j, 3, j + 1)] = 1; }
    for (let i = 0; i < 3; i++) on[L.barAt(i, 3, i + 1, 3)] = 3;
    return on; };
  const weak = FEM.analyze(mk(2000), portal(mk(2000)), "frame");
  assert.ok(weak.ok, "kleine Last hält");
  assert.ok(weak.lambda > 1, "Lastfaktor über 1");
  const big = FEM.analyze(mk(8000), portal(mk(8000)), "frame");
  assert.ok(big.util.every(u => u < 1), "jeder Stab für sich hält");
  assert.strictEqual(big.reason, "stabil");
});

test("Last direkt auf dem Lager ist kein Mechanismus", () => {
  const L = FEM.level({ nx: 2, ny: 1, supports: [{ kind: "fest", nodes: [[0, 0]], side: "bottom", fix: 3 },
    { kind: "los", nodes: [[2, 0]], side: "bottom", fix: 2 }], loads: [{ node: [2, 0], fx: 0, fy: -1000 }] });
  const r = FEM.analyze(L, only(L, [[0, 0, 1, 1], [1, 1, 2, 0], [0, 0, 1, 0], [1, 0, 2, 0]]), "truss");
  assert.ok(r.ok, r.reason);
});

test("Lagerung, die die Last zufällig nicht anregt, ist trotzdem beweglich", () => {
  const L = FEM.level({ nx: 2, ny: 1, supports: [{ kind: "los", nodes: [[0, 0], [2, 0]], side: "bottom", fix: 2 }],
    loads: [{ node: [1, 1], fx: 0, fy: -1000 }] });
  const on = only(L, [[0, 0, 1, 1], [1, 1, 2, 0], [0, 0, 1, 0], [1, 0, 2, 0]]);
  for (const model of ["truss", "frame"]) assert.strictEqual(FEM.analyze(L, on, model).reason, "mechanismus", model);
});

test("Größeres Profil: steifer, weniger ausgelastet, schwerer", () => {
  const L = FEM.level({ nx: 4, ny: 1, supports: [{ kind: "wand", nodes: [[0, 0], [0, 1]], side: "left", fix: 7 }],
    loads: [{ node: [4, 0], fx: 0, fy: -F }] });
  const bars = [[0, 0, 1, 0], [1, 0, 2, 0], [2, 0, 3, 0], [3, 0, 4, 0]], k = L.barAt(0, 0, 1, 0);
  const res = FEM.PROFILES.map((p, i) => { const on = only(L, bars).map(x => x ? i + 1 : 0); return [FEM.analyze(L, on, "frame"), FEM.mass(L, on)]; });
  FEM.PROFILES.forEach((p, i) => {
    near(res[i][0].util[k], F * 4 * FEM.GRID / p.W / FEM.RE, 1e-5, `Auslastung ${p.name}`);
    near(res[i][1], 4 * FEM.GRID * p.kgmm, 1e-9, `Masse ${p.name}`);
  });
  assert.ok(res[2][0].util[k] < res[1][0].util[k] && res[1][0].util[k] < res[0][0].util[k]);
});

test("Bemessen: kleinstes Profil, das hält; lose Stäbe fallen weg", () => {
  const L = FEM.level({ nx: 2, ny: 1, supports: [{ kind: "fest", nodes: [[0, 0], [2, 0]], side: "bottom", fix: 3 }],
    loads: [{ node: [1, 1], fx: 0, fy: -150000 }] });
  const on = only(L, [[0, 0, 1, 1], [2, 0, 1, 1], [0, 1, 1, 1]]);
  const g = FEM.size(L, on, "truss");
  let s;
  do s = g.next(); while (!s.done);
  const r = s.value;
  assert.ok(r && r.res.ok, "bemessen hält");
  assert.strictEqual(r.on[L.barAt(0, 1, 1, 1)], 0, "loser Stab fällt weg");
  // Druck je Diagonale 106 kN: 40 × 3 reicht nicht (Fließgrenze 104 kN), 60 × 4 reicht
  const k = L.barAt(0, 0, 1, 1);
  assert.strictEqual(r.on[k], 2);
  near(r.res.N[k], -150000 / Math.SQRT2, 1e-6, "Stabkraft");
});

test("Algorithmus entfernt Stäbe, bemisst die Profile und das Ergebnis hält", () => {
  const L = FEM.level({ nx: 6, ny: 2, supports: [{ kind: "fest", nodes: [[0, 0]], side: "bottom", fix: 3 },
    { kind: "los", nodes: [[6, 0]], side: "bottom", fix: 2 }], loads: [{ node: [3, 0], fx: 0, fy: -40000 }] });
  for (const model of ["truss", "frame"]) {
    const g = FEM.optimize(L, model);
    let s;
    do s = g.next(); while (!s.done);
    const e = s.value;
    const removed = L.nB - e.on.filter(Boolean).length;
    assert.ok(e.res.ok && removed > 10, `${model}: ${removed} Stäbe entfernt`);
    assert.ok(FEM.analyze(L, e.on, model).ok);
    assert.ok(FEM.mass(L, e.on) < FEM.mass(L, Uint8Array.from(L.domain, () => 2)) / 2, `${model}: deutlich leichter als das volle Raster`);
  }
});

test("Bewegungsform im Fachwerk: Stütze des leeren Tors dreht sich gerade um das Fußgelenk, Querlast an einer Durchlaufstelle knickt den Zug", () => {
  const LEVELS = require("../src/levels.js");
  const L = FEM.level(LEVELS[0]), r = FEM.analyze(L, Uint8Array.from(L.frozen), "truss");
  assert.strictEqual(r.reason, "mechanismus");
  const u = (i, j) => r.disp[L.id(i, j) * 3];
  for (const x of [0, 3]) for (const j of [1, 2]) near(u(x, j), u(x, 3) * j / 3, 1e-6, `Stütze x = ${x}, Knoten ${j}`);
  // zwei Stäbe in einer Linie, dazwischen die Last quer: dort gibt der Zug nach, das bleibt sichtbar
  const K = FEM.level({ nx: 2, ny: 1, supports: [{ kind: "fest", nodes: [[0, 0], [2, 0]], side: "bottom", fix: 3 }],
    loads: [{ node: [1, 0], fx: 0, fy: -F }] });
  const k = FEM.analyze(K, only(K, [[0, 0, 1, 0], [1, 0, 2, 0]]), "truss");
  assert.strictEqual(k.reason, "mechanismus");
  assert.ok(k.disp[K.id(1, 0) * 3 + 1] < 0, "Lastknoten bewegt sich nach unten");
});

test("Stäbe zählen wie in der Statik: ein gerader Stabzug über Durchlaufstellen ist ein Stab", () => {
  const LEVELS = require("../src/levels.js");
  const L = FEM.level(LEVELS[0]);   // Tor: Stützen und Riegel aus je drei Rasterstäben
  assert.strictEqual(FEM.members(L, L.frozen).length, 3);
  const quer = Uint8Array.from(L.frozen);
  quer[L.barAt(0, 1, 1, 1)] = 1;   // Querstab teilt die linke Stütze
  assert.strictEqual(FEM.members(L, quer).length, 5);
  const diag = Uint8Array.from(L.frozen);
  for (const b of [[0, 0, 1, 1], [1, 1, 2, 2], [2, 2, 3, 3]]) diag[L.barAt(...b)] = 1;   // Diagonale von Ecke zu Ecke: ein Stab
  assert.strictEqual(FEM.members(L, diag).length, 4);
});

test("Abzählkriterium: abgezählt verschieblich heißt im Spiel immer beweglich; Ausnahmefälle findet die Kinematikprüfung", () => {
  const LEVELS = require("../src/levels.js");
  // Tor: Stützen und Riegel; als Fachwerk 2·4 - 3 - 4 = 1 (verschieblich), als Rahmen 3·4 - 3·3 - 4 = -1 (einfach unbestimmt)
  const L = FEM.level(LEVELS[0]);
  assert.deepStrictEqual(FEM.counting(L, L.frozen, "truss"), { k: 4, s: 3, r: 4, f: 1 });
  assert.deepStrictEqual(FEM.counting(L, L.frozen, "frame"), { k: 4, s: 3, r: 4, f: -1 });
  // mit Diagonale statisch bestimmt; ein loser Stab dazu macht das Fachwerk verschieblich (2·5 - 5 - 4 = 1), im Spiel ebenso
  const diag = Uint8Array.from(L.frozen);
  for (const b of [[0, 0, 1, 1], [1, 1, 2, 2], [2, 2, 3, 3]]) diag[L.barAt(...b)] = 1;
  assert.strictEqual(FEM.counting(L, diag, "truss").f, 0);
  assert.ok(FEM.analyze(L, diag, "truss").ok);
  const lose = Uint8Array.from(diag);
  lose[L.barAt(0, 3, 1, 2)] = 1;
  assert.strictEqual(FEM.counting(L, lose, "truss").f, 1);
  assert.strictEqual(FEM.analyze(L, lose, "truss").reason, "mechanismus");
  assert.ok(FEM.analyze(L, lose, "frame").ok);
  // Zufallsentwürfe an allen festen Bauteilen: f > 0 muss beweglich sein
  let seed = 7, ausnahme = 0;
  const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  for (const d of LEVELS) {
    const M = FEM.level(d);
    for (let t = 0; t < 60; t++) {
      const p = 0.15 + 0.8 * rnd(), on = new Uint8Array(M.nB);
      for (let b = 0; b < M.nB; b++) on[b] = M.frozen[b] || rnd() < p ? 1 + Math.floor(rnd() * 3) : 0;
      for (const model of ["truss", "frame"]) {
        const r = FEM.analyze(M, on, model, true);
        if (r.reason === "lastpfad") continue;
        const c = FEM.counting(M, r.conn, model), beweglich = r.reason === "mechanismus";
        assert.ok(!(c.f > 0) || beweglich, `${d.name} ${model}: abgezählt f = ${c.f}, im Spiel ${r.reason || "hält"}`);
        if (c.f <= 0 && beweglich) ausnahme++;
      }
    }
  }
  assert.ok(ausnahme > 0, "Ausnahmefälle kommen vor und werden erkannt");
});

test("Ausgabe: Lagerkräfte im Gleichgewicht, Spannung und Knicklast je Stab; Eigengewicht als Last", () => {
  const L = FEM.level({ nx: 2, ny: 1, supports: [{ kind: "fest", nodes: [[0, 0], [2, 0]], side: "bottom", fix: 3 }],
    loads: [{ node: [1, 1], fx: 0, fy: -F }] });
  const on = only(L, [[0, 0, 1, 1], [2, 0, 1, 1]]);
  for (const model of ["truss", "frame"]) {
    const r = FEM.analyze(L, on, model), R = new Map(r.react.map(([q, x, y]) => [q, [x, y]]));
    near(R.get(L.id(0, 0))[0], F / 2, model === "truss" ? 1e-6 : 1e-2, `${model}: Ax`);
    near(R.get(L.id(0, 0))[1], F / 2, 1e-6, `${model}: Ay`);
    near(-R.get(L.id(2, 0))[0], F / 2, model === "truss" ? 1e-6 : 1e-2, `${model}: Bx`);
    near(R.get(L.id(2, 0))[1], F / 2, 1e-6, `${model}: By`);
  }
  const r = FEM.analyze(L, on, "truss"), k = L.barAt(0, 0, 1, 1);
  near(r.sigma[k], F / Math.SQRT2 / P1.A, 1e-6, "Spannung |N| / A");
  near(r.ncr[k], Math.PI ** 2 * FEM.E * P1.I / (2 * FEM.GRID ** 2), 1e-9, "Knicklast nach Euler");
  // mit Eigengewicht tragen die Lager zusätzlich die Masse beider Stäbe mal g
  L.opts = { gravity: true, buckling: true };
  const g = FEM.analyze(L, on, "truss");
  near(g.react.reduce((a, [, , y]) => a + y, 0), F + FEM.mass(L, on) * 9.81, 1e-9, "Lager tragen Last und Eigengewicht");
});

test("Knicken ausgeschaltet: ein Druckstab, der knickt, hält, solange er nicht fließt", () => {
  // gerader Stabzug über drei Felder, links Festlager, rechts Loslager (hält quer), Druck 40 kN längs: Knicklast 21,5 kN
  const L = FEM.level({ nx: 3, ny: 1, supports: [{ kind: "fest", nodes: [[0, 0]], side: "left", fix: 3 },
    { kind: "los", nodes: [[3, 0]], side: "bottom", fix: 2 }], loads: [{ node: [3, 0], fx: -40000, fy: 0 }] });
  const on = only(L, [[0, 0, 1, 0], [1, 0, 2, 0], [2, 0, 3, 0]]);
  for (const model of ["truss", "frame"]) {
    L.opts = { gravity: false, buckling: true };
    assert.strictEqual(FEM.analyze(L, on, model).reason, "knicken", `${model} mit Knicken`);
    L.opts = { gravity: false, buckling: false };
    const r = FEM.analyze(L, on, model);
    assert.ok(r.ok, `${model} ohne Knicken: ${r.reason}`);
    near(r.ncr[L.barAt(1, 0, 2, 0)], Math.PI ** 2 * FEM.E * P1.I / (3 * FEM.GRID) ** 2, 1e-9, "Knicklast weiter zur Info");
  }
});

test("Nullstäbe: nur Stäbe ohne Kraft, eine kleine Kraft ist kein Nullstab", () => {
  const LEVELS = require("../src/levels.js");
  const L = FEM.level(LEVELS[0]), on = Uint8Array.from(L.frozen);
  for (const b of [[0, 0, 1, 1], [1, 1, 2, 2], [2, 2, 3, 3]]) on[L.barAt(...b)] = 1;
  // Fachwerk: Am Knoten oben links greift die Last längs des Riegels an, die Stütze bleibt kraftfrei (Nullstab)
  const t = FEM.analyze(L, on, "truss"), links = [[0, 0, 0, 1], [0, 1, 0, 2], [0, 2, 0, 3]].map(b => L.barAt(...b));
  for (const k of links) assert.strictEqual(t.zero[k], 1, "linke Stütze ist Nullstab");
  assert.strictEqual(t.zero[L.barAt(0, 0, 1, 1)], 0, "Diagonale trägt");
  // Rahmen: dieselbe Stütze trägt eine kleine Kraft und Biegung, sie ist kein Nullstab
  const f = FEM.analyze(L, on, "frame");
  for (const k of links) {
    assert.ok(Math.abs(f.N[k]) > 0 && Math.abs(f.N[k]) < 0.01 * F, `kleine Kraft ${f.N[k]}`);
    assert.strictEqual(f.zero[k], 0, "kleine Kraft ist kein Nullstab");
  }
  // Kragbalken im Rahmen: keine Normalkraft, aber Biegung. Das ist kein Nullstab (zero 2), auch wenn nirgends Normalkraft wirkt
  const K = FEM.level({ nx: 4, ny: 1, supports: [{ kind: "wand", nodes: [[0, 0], [0, 1]], side: "left", fix: 7 }],
    loads: [{ node: [4, 0], fx: 0, fy: -F }] });
  const kb = [[0, 0, 1, 0], [1, 0, 2, 0], [2, 0, 3, 0], [3, 0, 4, 0]], r = FEM.analyze(K, only(K, kb), "frame");
  for (const b of kb) assert.strictEqual(r.zero[K.barAt(...b)], 2, "Kragbalken trägt auf Biegung");
});

test("Eigengewicht im Fachwerk: Ein gerader Stabzug gibt sein Gewicht an seine Enden ab wie ein Einfeldträger", () => {
  // Stabzug über zwei Durchlaufstellen, rechts das schwerste Profil; quer an den Durchlaufstellen wäre er beweglich
  const L = FEM.level({ nx: 3, ny: 1, supports: [{ kind: "fest", nodes: [[0, 0]], side: "left", fix: 3 },
    { kind: "los", nodes: [[3, 0]], side: "bottom", fix: 2 }], loads: [{ node: [3, 0], fx: -4000, fy: 0 }] });
  const segs = [[0, 0, 1, 0], [1, 0, 2, 0], [2, 0, 3, 0]], on = only(L, segs);
  on[L.barAt(2, 0, 3, 0)] = 3;
  L.opts = { gravity: true, buckling: true };
  const r = FEM.analyze(L, on, "truss"), R = new Map(r.react.map(([q, , y]) => [q, y]));
  assert.ok(r.ok, `Fachwerk mit Eigengewicht: ${r.reason}`);
  const w = segs.map(b => FEM.mass(L, on, only(L, [b])) * 9.81), right = w.reduce((a, wi, i) => a + wi * (i + 0.5) / 3, 0);
  near(R.get(L.id(3, 0)), right, 1e-9, "rechtes Lager");
  near(R.get(L.id(0, 0)), w[0] + w[1] + w[2] - right, 1e-9, "linkes Lager");
  for (const b of segs) near(r.N[L.barAt(...b)], -4000, 1e-9, "Stabkraft im ganzen Zug gleich");
});

