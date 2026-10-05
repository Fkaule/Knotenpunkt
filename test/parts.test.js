// Zufallsbauteile und Baukasten: gleiche Nummer gleiches Bauteil, jedes ist lösbar, Codes überstehen den Weg durch den Link
const test = require("node:test");
const assert = require("node:assert");
const FEM = require("../src/fem.js");
const PARTS = require("../src/parts.js");

// volles Raster im mittleren Profil
const full = (def, model) => { const L = FEM.level(def); return FEM.analyze(L, Uint8Array.from(L.domain, () => 2), model, true); };

test("Gleiche Nummer, gleiches Bauteil", () => {
  for (const nr of [1, 42, 4711, 99999]) assert.deepStrictEqual(PARTS.generate(nr), PARTS.generate(nr));
});

test("Jedes Zufallsbauteil ist lösbar: volles Raster hält als Fachwerk und als Rahmen, Last in glatten Beträgen", () => {
  for (let nr = 1; nr <= 150; nr++) {
    const d = PARTS.generate(nr);
    assert.ok(d, `Nr. ${nr} erzeugt`);
    assert.ok(d.nx <= PARTS.MAX_N && d.ny <= PARTS.MAX_N, `Nr. ${nr} passt in den Baukasten`);
    for (const model of ["truss", "frame"]) assert.ok(full(d, model).ok, `Nr. ${nr} hält als ${model}`);
    assert.ok(d.util > 0.4 && d.util < 0.66, `Nr. ${nr}: Auslastung ${d.util}`);   // unter 50 % nur an der Obergrenze 200 kN
    for (const l of d.loads) {
      const kn = Math.hypot(l.fx, l.fy) / 1000;
      assert.ok(kn > 0.5 - 1e-9 && kn < PARTS.MAX_KN + 1e-9, `Nr. ${nr}: ${kn} kN`);   // schräge Lasten mit Rundungsrest
    }
  }
});

// Rahmen 4 × 2 Felder, zwei getrennte Einspannungen unten, Last oben, Fahrbahn unten gesperrt
const cells = n => new Uint8Array(n).fill(1);
const raw = () => ({ nx: 4, ny: 2, cells: cells(8), auto: false,
  supports: [{ kind: "wand", side: "bottom", nodes: [[0, 0], [1, 0]] }, { kind: "wand", side: "bottom", nodes: [[3, 0], [4, 0]] }],
  loads: [{ node: [2, 2], deg: -90, kn: 12.5 }], frozen: [[0, 0, 1, 0], [1, 0, 2, 0]] });

test("Code: hin und zurück gleich, getrennte Einspannungen bleiben getrennt", () => {
  const code = PARTS.encode(raw()), back = PARTS.decode(code);
  assert.strictEqual(PARTS.encode(back), code);
  assert.deepStrictEqual(back.supports.map(s => s.nodes), [[[0, 0], [1, 0]], [[3, 0], [4, 0]]]);
  assert.strictEqual(back.loads[0].kn, 12.5);
  assert.strictEqual(back.frozen.length, 2);
  const def = PARTS.fromCode(code);
  assert.ok(def && def.code === code);
  assert.strictEqual(PARTS.fromCode(code.slice(0, -3) + "!!!"), null);
});

test("Baukasten meldet, was fehlt", () => {
  const err = patch => PARTS.build({ ...raw(), ...patch }).error;
  assert.strictEqual(err({ cells: new Uint8Array(8) }), "leer");
  assert.strictEqual(err({ cells: Uint8Array.from([1, 0, 0, 1, 0, 0, 0, 0]) }), "zerfallen");
  assert.strictEqual(err({ supports: [] }), "lager");
  assert.strictEqual(err({ loads: [] }), "last");
  assert.strictEqual(err({ supports: [{ kind: "los", side: "bottom", nodes: [[0, 0]] }] }), "beweglich");
  assert.strictEqual(err({ loads: [{ node: [1, 0], deg: -90, kn: 10 }] }), "direkt");
  // Kragarm 4 × 1, 200 kN am Ende: Gurtkraft 800 kN, das hält kein Raster
  assert.strictEqual(err({ nx: 4, ny: 1, cells: cells(4), supports: [{ kind: "wand", side: "left", nodes: [[0, 0], [0, 1]] }],
    loads: [{ node: [4, 0], deg: -90, kn: 200 }], frozen: [] }), "voll");
  assert.strictEqual(err({ loads: [{ node: [9, 9], deg: -90, kn: 10 }] }), "knoten");
  assert.strictEqual(err({}), undefined);
  // automatisch bemessen: glatter Betrag, volles Raster zu etwa 55 % ausgelastet
  const { def } = PARTS.build({ ...raw(), auto: true });
  assert.ok(def.util > 0.4 && def.util < 0.66, `Auslastung ${def.util}`);
});
