// Auslastung der vollen Stabwerke und Ergebnis des Algorithmus je Bauteil und Rechenmodell: node scripts/kalibrieren.js
const FEM = require("../src/fem.js");
const LEVELS = require("../src/levels.js");
for (const def of LEVELS) {
  const L = FEM.level(def), F = def.loads.reduce((a, l) => a + Math.hypot(l.fx, l.fy), 0);
  const line = [`${def.name}: ${L.nB} Stäbe, ${def.loads.length} × ${Math.hypot(def.loads[0].fx, def.loads[0].fy) / 1000} kN`];
  for (const model of ["truss", "frame"]) {
    const r = FEM.analyze(L, L.domain, model), t0 = Date.now(), g = FEM.eso(L, model);
    let s, n = 0;
    do { s = g.next(); n++; } while (!s.done);
    const e = s.value, pct = 100 * (1 - FEM.length(L, e.on) / L.total);
    line.push(`  ${model}: voll ${(100 * r.maxUtil).toFixed(1)} %, ESO ${pct.toFixed(1)} % entfernt (${e.order.length} Stäbe, ${n} Rechnungen, ${Date.now() - t0} ms), max ${(100 * e.res.maxUtil).toFixed(0)} %` +
      `, als ${model === "truss" ? "Rahmen" : "Fachwerk"}: ${(o => o.ok ? "hält " + (100 * o.maxUtil).toFixed(0) + " %" : o.reason)(FEM.analyze(L, e.on, model === "truss" ? "frame" : "truss"))}`);
  }
  console.log(line.join("\n"));
}
