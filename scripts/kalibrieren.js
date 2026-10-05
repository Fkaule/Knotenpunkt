// Je Bauteil: Auslastung des vollen Rasters (mittleres Profil) und Ergebnis des Gegners je Rechenmodell:
// node scripts/kalibrieren.js
const FEM = require("../src/fem.js");
const LEVELS = require("../src/levels.js");
const kg = x => x.toFixed(0) + " kg";
for (const def of LEVELS) {
  const L = FEM.level(def), full = Uint8Array.from(L.domain, () => 2);
  console.log(`${def.name}: ${L.nB} Stäbe, volles Raster 60 × 4 ${kg(FEM.mass(L, full))}`);
  for (const model of ["truss", "frame"]) {
    const r = FEM.analyze(L, full, model), t0 = Date.now(), g = FEM.optimize(L, model);
    let s, n = 0;
    do { s = g.next(); n++; } while (!s.done);
    const e = s.value, o = FEM.analyze(L, e.on, model === "truss" ? "frame" : "truss");
    const cnt = [1, 2, 3].map(p => e.on.filter(x => x === p).length).join("/");
    console.log(`  ${model}: voll ${(100 * r.maxUtil).toFixed(0)} %; Gegner ${kg(FEM.mass(L, e.on))} (${cnt} Stäbe S/M/L, ${n} Rechnungen, ${Date.now() - t0} ms), ` +
      `max ${(100 * e.res.maxUtil).toFixed(0)} %, im anderen Modell ${o.ok ? "hält " + (100 * o.maxUtil).toFixed(0) + " %" : o.reason + " " + (100 * o.maxUtil).toFixed(0) + " %"}`);
  }
}
