// FE-Kern gegen Handrechnung: Kragbalken, Zweistab, Rahmen ohne Diagonale, Knicklänge, Algorithmus
const test = require("node:test");
const assert = require("node:assert");
const FEM = require("../src/fem.js");

const near = (a, b, tol, msg) => assert.ok(Math.abs(a / b - 1) < tol, `${msg}: ${a} statt ${b}`);
const only = (L, list) => { const on = new Uint8Array(L.nB); for (const b of list) on[L.barAt(...b)] = 1; return on; };
const F = 1000;

test("Kragbalken aus vier Stäben: Rahmen wie Balkentheorie, Fachwerk beweglich", () => {
  const L = FEM.level({ nx: 4, ny: 1, supports: [{ kind: "wand", nodes: [[0, 0], [0, 1]], side: "left", fix: 7 }],
    loads: [{ node: [4, 0], fx: 0, fy: -F }] });
  const on = only(L, [[0, 0, 1, 0], [1, 0, 2, 0], [2, 0, 3, 0], [3, 0, 4, 0]]);
  const r = FEM.analyze(L, on, "frame"), Lb = 4 * FEM.GRID;
  assert.ok(r.disp, "Rahmen gerechnet");
  near(-r.disp[L.id(4, 0) * 3 + 1], F * Lb ** 3 / (3 * FEM.E * FEM.INERTIA), 1e-5, "Durchbiegung");
  const k = L.barAt(0, 0, 1, 0);
  near(Math.abs(r.M[2 * k]), F * Lb, 1e-5, "Einspannmoment");
  near(r.util[k], F * Lb / FEM.WEL / FEM.RE, 1e-5, "Auslastung");
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
  near(r.util[k], Math.max(N / FEM.AREA / FEM.RE, N / FEM.ncr(Math.SQRT2 * FEM.GRID)), 1e-6, "Auslastung Druckstab");
  // Zug statt Druck: nur Fließen zählt
  const L2 = FEM.level({ nx: 2, ny: 1, supports: [{ kind: "fest", nodes: [[0, 1], [2, 1]], side: "top", fix: 3 }],
    loads: [{ node: [1, 0], fx: 0, fy: -F }] });
  const r2 = FEM.analyze(L2, only(L2, [[0, 1, 1, 0], [2, 1, 1, 0]]), "truss");
  near(r2.util[L2.barAt(0, 1, 1, 0)], F / Math.SQRT2 / FEM.AREA / FEM.RE, 1e-6, "Zugstab");
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
  const u = r.disp[L.id(0, 1) * 3], h = FEM.GRID, EI = FEM.E * FEM.INERTIA;
  assert.ok(u > F * h ** 3 / (24 * EI) && u < F * h ** 3 / (6 * EI), "Kopfverschiebung plausibel");
});

test("Lose Enden und abgetrennte Stäbe tragen nicht, Fachwerk wird dadurch nicht beweglich", () => {
  const L = FEM.level({ nx: 2, ny: 1, supports: [{ kind: "fest", nodes: [[0, 0], [2, 0]], side: "bottom", fix: 3 }],
    loads: [{ node: [1, 1], fx: 0, fy: -F }] });
  const on = only(L, [[0, 0, 1, 1], [2, 0, 1, 1], [1, 1, 1, 0], [0, 1, 1, 1]]);   // Stummel nach unten und nach links
  const r = FEM.analyze(L, on, "truss");
  assert.ok(r.ok);
  assert.strictEqual(r.fe[L.barAt(1, 1, 1, 0)], 0);
  assert.strictEqual(r.conn[L.barAt(0, 1, 1, 1)], 1);
  assert.strictEqual(FEM.analyze(L, only(L, [[0, 0, 1, 1]]), "truss").reason, "mechanismus");
  assert.strictEqual(FEM.analyze(L, only(L, [[0, 1, 1, 1]]), "frame").reason, "lastpfad");
});

test("Knicklänge läuft über Knoten ohne Querstab hinweg", () => {
  const L = FEM.level({ nx: 3, ny: 1, supports: [{ kind: "fest", nodes: [[0, 0]], side: "left", fix: 3 }],
    loads: [{ node: [3, 0], fx: -F, fy: 0 }] });
  const chain = only(L, [[0, 0, 1, 0], [1, 0, 2, 0], [2, 0, 3, 0]]);
  assert.strictEqual(FEM.bucklingLength(L, chain, L.barAt(1, 0, 2, 0)), 3 * FEM.GRID);
  const braced = only(L, [[0, 0, 1, 0], [1, 0, 2, 0], [2, 0, 3, 0], [1, 0, 1, 1]]);
  assert.strictEqual(FEM.bucklingLength(L, braced, L.barAt(1, 0, 2, 0)), 2 * FEM.GRID);
  assert.strictEqual(FEM.bucklingLength(L, braced, L.barAt(0, 0, 1, 0)), FEM.GRID);
  // ungestützte 3 m: Knicken maßgebend
  const r = FEM.analyze(L, chain, "frame");
  near(r.util[L.barAt(1, 0, 2, 0)], F / FEM.ncr(3 * FEM.GRID), 1e-6, "Knick-Auslastung");
});

test("Algorithmus entfernt Stäbe und das Ergebnis hält", () => {
  const L = FEM.level({ nx: 6, ny: 2, supports: [{ kind: "fest", nodes: [[0, 0]], side: "bottom", fix: 3 },
    { kind: "los", nodes: [[6, 0]], side: "bottom", fix: 2 }], loads: [{ node: [3, 0], fx: 0, fy: -40000 }] });
  for (const model of ["truss", "frame"]) {
    const g = FEM.eso(L, model);
    let s;
    do s = g.next(); while (!s.done);
    assert.ok(s.value.res.ok && s.value.order.length > 10, `${model}: ${s.value.order.length} Stäbe entfernt`);
    assert.ok(FEM.analyze(L, s.value.on, model).ok);
  }
});
