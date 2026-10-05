/* FE-Kern für Stabwerke: ebene Stäbe zwischen Rasterknoten, wahlweise als Fachwerk (Gelenkknoten, nur Normalkraft)
   oder als Rahmen (biegesteife Knoten, Euler-Bernoulli-Balken). Band-Cholesky. Kein DOM. */
const FEM = (() => {
  const GRID = 1000;                       // Rasterweite in mm
  const E = 210000, RE = 235;              // Stahl S235, MPa
  // Querschnitte: Quadratrohre, scharfkantig gerechnet (A in mm², I in mm⁴, W in mm³, Masse in kg je mm Stab).
  // Ein Stabwerk ist ein Array mit einem Wert je Stab: 0 kein Stab, sonst die Nummer des Profils (1 bis 3).
  const PROFILES = [[40, 3], [60, 4], [80, 5]].map(([b, t]) => {
    const bi = b - 2 * t, A = b * b - bi * bi, I = (b ** 4 - bi ** 4) / 12;
    return { name: `${b} × ${b} × ${t}`, b, t, A, I, W: I / (b / 2), kgmm: A * 7.85e-6 };
  });
  const prof = x => PROFILES[x - 1];
  const ncr = (p, Lk) => Math.PI ** 2 * E * p.I / (Lk * Lk);   // Euler, beidseitig gelenkig
  // Auslastung eines Stabs mit Profil p: Fließen (Normal- plus Biegespannung, M = größtes Endmoment) oder Knicken.
  // Lk = Infinity: Der Druckstab läuft über ein Gelenk ohne seitlichen Halt und knickt dort aus, schon bei kleiner Kraft
  // (unter 1 N gilt als kraftlos). Ergebnis [Auslastung, Art: 1 Fließen, 2 Knicken, 3 Gelenk knickt aus]
  function barUtil(p, N, M, Lk) {
    const uy = (Math.abs(N) / p.A + M / p.W) / RE;
    const uk = N >= 0 ? 0 : Number.isFinite(Lk) ? -N / ncr(p, Lk) : N < -1 ? Infinity : 0;
    return [Math.max(uy, uk), uk === Infinity ? 3 : uk > uy ? 2 : 1];
  }
  // Federn an jedem Freiheitsgrad, so weich, dass ein tragfähiges Stabwerk sie nicht merkt. Sie halten die Matrix regulär;
  // nehmen sie einen nennenswerten Teil der Arbeit der Last auf, ist das Stabwerk beweglich (Mechanismus).
  const KS_T = 1e-11 * E * PROFILES[0].A / GRID, KS_R = 1e-11 * E * PROFILES[0].I / GRID, MECH = 0.01;

  // Level aufbereiten. def: nx, ny (Rasterfelder), cut (Felder ohne Stäbe), supports [{ kind, nodes, side, fix }]
  // (fix: 1 u, 2 v, 4 Verdrehung), loads [{ node, fx, fy }] in N, frozen [[i0, j0, i1, j1], ...] (gesperrte Stäbe)
  function level(def) {
    const { nx, ny } = def;
    const cut = new Set((def.cut || []).map(([x, y]) => x + ',' + y));
    const cell = (x, y) => x >= 0 && y >= 0 && x < nx && y < ny && !cut.has(x + ',' + y);
    // Knotennummer entlang der kurzen Seite hält die Bandbreite klein
    const id = nx >= ny ? (i, j) => i * (ny + 1) + j : (i, j) => j * (nx + 1) + i;
    const nN = (nx + 1) * (ny + 1), ij = new Array(nN).fill(null);
    for (let i = 0; i <= nx; i++) for (let j = 0; j <= ny; j++)
      if (cell(i, j) || cell(i - 1, j) || cell(i, j - 1) || cell(i - 1, j - 1)) ij[id(i, j)] = [i, j];
    const bars = [], key = new Map();
    const add = (i0, j0, i1, j1) => {
      const k = [i0, j0, i1, j1].join(','), k2 = [i1, j1, i0, j0].join(',');
      if (key.has(k) || key.has(k2)) return;
      const dx = (i1 - i0) * GRID, dy = (j1 - j0) * GRID, len = Math.hypot(dx, dy);
      key.set(k, bars.length);
      bars.push({ a: id(i0, j0), b: id(i1, j1), p: [i0, j0], q: [i1, j1], len, c: dx / len, s: dy / len });
    };
    for (let x = 0; x < nx; x++) for (let y = 0; y < ny; y++) if (cell(x, y)) {
      add(x, y, x + 1, y); add(x, y + 1, x + 1, y + 1); add(x, y, x, y + 1); add(x + 1, y, x + 1, y + 1);
      add(x, y, x + 1, y + 1); add(x + 1, y, x, y + 1);
    }
    const nB = bars.length, barAt = (i0, j0, i1, j1) => key.get([i0, j0, i1, j1].join(',')) ?? key.get([i1, j1, i0, j0].join(',')) ?? -1;
    const frozen = new Uint8Array(nB);
    for (const f of def.frozen || []) { const k = barAt(...f); if (k >= 0) frozen[k] = 1; }
    const fix = new Uint8Array(nN), fx = new Float64Array(nN), fy = new Float64Array(nN), supportNodes = [], loadNodes = [];
    for (const s of def.supports) for (const [i, j] of s.nodes) { fix[id(i, j)] |= s.fix; supportNodes.push(id(i, j)); }
    for (const l of def.loads) { const n = id(...l.node); fx[n] += l.fx; fy[n] += l.fy; if (!loadNodes.includes(n)) loadNodes.push(n); }
    const nodeBars = Array.from({ length: nN }, () => []);
    bars.forEach((b, k) => { nodeBars[b.a].push(k); nodeBars[b.b].push(k); });
    const domain = new Uint8Array(nB).fill(1);
    const total = bars.reduce((a, b) => a + b.len, 0);
    return { def, nx, ny, nN, ij, id, bars, nB, barAt, frozen, fix, fx, fy, supportNodes, loadNodes, nodeBars, domain, total };
  }

  // Stäbe, die über Knoten mit den Startknoten verbunden sind (nur Stäbe aus set)
  function reach(L, set, seeds) {
    const seenN = new Uint8Array(L.nN), out = new Uint8Array(L.nB), stack = [];
    for (const n of seeds) if (!seenN[n]) { seenN[n] = 1; stack.push(n); }
    while (stack.length) {
      const n = stack.pop();
      for (const k of L.nodeBars[n]) if (set[k] && !out[k]) {
        out[k] = 1;
        const m = L.bars[k].a === n ? L.bars[k].b : L.bars[k].a;
        if (!seenN[m]) { seenN[m] = 1; stack.push(m); }
      }
    }
    return out;
  }
  // Was über Stäbe am Lager hängt
  const attached = (L, on) => reach(L, on, L.supportNodes);
  // Länge der Stäbe in mm und Masse in kg; set wählt Stäbe aus (Standard: alle vorhandenen)
  const length = (L, set) => L.bars.reduce((a, b, k) => a + (set[k] ? b.len : 0), 0);
  const mass = (L, on, set = on) => L.bars.reduce((a, b, k) => a + (on[k] && set[k] ? b.len * prof(on[k]).kgmm : 0), 0);

  // Tragende Stäbe: am Lager, in einem Teil mit Last, ohne lose Enden (Stäbe, die an einem Knoten ohne Lager, Last und
  // weitere Stäbe enden, tragen nichts)
  function carrying(L, conn) {
    const fe = Uint8Array.from(conn), deg = new Int32Array(L.nN), keep = new Uint8Array(L.nN);
    for (const n of L.supportNodes) keep[n] = 1;
    for (const n of L.loadNodes) keep[n] = 1;
    L.bars.forEach((b, k) => { if (fe[k]) { deg[b.a]++; deg[b.b]++; } });
    const stack = [];
    for (let n = 0; n < L.nN; n++) if (deg[n] === 1 && !keep[n]) stack.push(n);
    while (stack.length) {
      const n = stack.pop();
      if (deg[n] !== 1) continue;
      const k = L.nodeBars[n].find(q => fe[q]);
      fe[k] = 0; deg[n] = 0;
      const m = L.bars[k].a === n ? L.bars[k].b : L.bars[k].a;
      if (--deg[m] === 1 && !keep[m]) stack.push(m);
    }
    return reach(L, fe, L.loadNodes);
  }

  // Knicklänge: gerader Stabzug bis zum nächsten Knoten, an dem ein Lager sitzt oder ein Stab quer ansetzt (Rahmen: der
  // steife Knoten trägt durch). Im Fachwerk ist jeder Knoten ein Gelenk: Läuft der Stab über einen Knoten ohne Querstab, hat
  // dieser keinen seitlichen Halt (Ausnahmefall), unter Druck knickt er dort aus; Ergebnis Infinity. Vorgegebene, gesperrte
  // Stäbe laufen als ein Profil durch (Fahrbahn, Stützen und Riegel des Tors).
  function bucklingLength(L, fe, k, model = 'frame') {
    let len = 0;
    for (const start of [L.bars[k].a, L.bars[k].b]) {
      let n = start, cur = k;
      for (;;) {
        const here = L.nodeBars[n].filter(q => fe[q] && q !== cur);
        if (L.fix[n] || here.length !== 1) break;
        const o = here[0], bo = L.bars[o], bc = L.bars[cur];
        if (Math.abs(bo.c * bc.s - bo.s * bc.c) > 1e-9) break;   // nicht in einer Linie
        if (model === 'truss' && !(L.frozen[o] && L.frozen[cur])) return Infinity;
        len += bo.len; cur = o; n = bo.a === n ? bo.b : bo.a;
      }
    }
    return L.bars[k].len + len;
  }

  let band = new Float64Array(0);

  // model: 'truss' (Fachwerk) oder 'frame' (Rahmen)
  function analyze(L, on, model) {
    const t0 = performance.now(), frame = model === 'frame', nd = frame ? 3 : 2;
    const conn = attached(L, on);
    const res = { ok: false, reason: '', model, on: Uint8Array.from(on), conn, fe: null, util: new Float32Array(L.nB),
      N: new Float64Array(L.nB), M: new Float64Array(L.nB * 2), Lk: new Float64Array(L.nB), fail: new Uint8Array(L.nB),
      maxUtil: 0, maxBar: -1, disp: null, mass: mass(L, on, conn), dofs: 0, bars: 0, ms: 0 };
    const hit = new Set();
    L.bars.forEach((b, k) => { if (conn[k]) { hit.add(b.a); hit.add(b.b); } });
    if (!L.loadNodes.every(n => hit.has(n))) { res.reason = 'lastpfad'; return res; }
    const fe = res.fe = carrying(L, conn);

    // Freiheitsgrade: je aktivem Knoten u, v (und beim Rahmen die Verdrehung)
    const eq = new Int32Array(L.nN * 3).fill(-1), active = new Uint8Array(L.nN);
    L.bars.forEach((b, k) => { if (fe[k]) active[b.a] = active[b.b] = 1; });
    let n = 0;
    for (let q = 0; q < L.nN; q++) if (active[q]) for (let d = 0; d < nd; d++) if (!(L.fix[q] & (1 << d))) eq[q * 3 + d] = n++;
    const els = [];
    let bw = 0;
    L.bars.forEach((b, k) => {
      if (!fe[k]) return;
      const dof = [];
      for (const q of [b.a, b.b]) for (let d = 0; d < nd; d++) dof.push(eq[q * 3 + d]);
      let lo = Infinity, hi = -1;
      for (const p of dof) if (p >= 0) { lo = Math.min(lo, p); hi = Math.max(hi, p); }
      if (hi >= 0) bw = Math.max(bw, hi - lo);
      const p = prof(on[k]);
      els.push({ k, b, p, dof, K: frame ? frameK(b, p) : trussK(b, p) });
    });

    const w = bw + 1;
    if (band.length < n * w) band = new Float64Array(n * w);
    const A = band;
    A.fill(0, 0, n * w);
    for (const el of els) {
      const m = el.dof.length;
      for (let a = 0; a < m; a++) {
        const p = el.dof[a];
        if (p < 0) continue;
        for (let c = 0; c < m; c++) { const q = el.dof[c]; if (q >= p) A[p * w + q - p] += el.K[a * m + c]; }
      }
    }
    const ks = new Float64Array(n);
    for (let q = 0; q < L.nN; q++) for (let d = 0; d < nd; d++) { const p = eq[q * 3 + d]; if (p >= 0) ks[p] = d < 2 ? KS_T : KS_R; }
    for (let p = 0; p < n; p++) A[p * w] += ks[p];
    const x = new Float64Array(n);
    for (const q of L.loadNodes) {
      if (eq[q * 3] >= 0) x[eq[q * 3]] += L.fx[q];
      if (eq[q * 3 + 1] >= 0) x[eq[q * 3 + 1]] += L.fy[q];
    }
    const f = Float64Array.from(x);

    // Cholesky A = U^T U (in place), dann Vorwärts- und Rückwärtseinsetzen
    for (let i = 0; i < n; i++) {
      const r = i * w, m = Math.min(bw, n - 1 - i);
      if (!(A[r] > 0)) { res.reason = 'mechanismus'; return res; }
      const d = Math.sqrt(A[r]);
      A[r] = d;
      for (let k = 1; k <= m; k++) A[r + k] /= d;
      for (let k = 1; k <= m; k++) {
        const g = A[r + k];
        if (g === 0) continue;
        const row = (i + k) * w - k;
        for (let l = k; l <= m; l++) A[row + l] -= g * A[r + l];
      }
    }
    for (let i = 0; i < n; i++) {
      const r = i * w, m = Math.min(bw, n - 1 - i);
      const yi = (x[i] /= A[r]);
      for (let k = 1; k <= m; k++) x[i + k] -= A[r + k] * yi;
    }
    for (let i = n - 1; i >= 0; i--) {
      const r = i * w, m = Math.min(bw, n - 1 - i);
      let s = x[i];
      for (let k = 1; k <= m; k++) s -= A[r + k] * x[i + k];
      x[i] = s / A[r];
    }

    // Verschiebungen je Knoten (u, v in mm, Verdrehung in rad) fürs Zeichnen
    const disp = res.disp = new Float64Array(L.nN * 3);
    for (let q = 0; q < L.nN; q++) for (let d = 0; d < nd; d++) { const p = eq[q * 3 + d]; if (p >= 0) disp[q * 3 + d] = x[p]; }
    res.dofs = n; res.bars = els.length;

    // Mechanismus: die weichen Federn nehmen einen nennenswerten Teil der Arbeit auf
    let work = 0, spring = 0;
    for (let p = 0; p < n; p++) { work += f[p] * x[p]; spring += ks[p] * x[p] * x[p]; }
    if (!(work > 0) || spring > MECH * work) { res.reason = 'mechanismus'; res.ms = performance.now() - t0; return res; }

    // Schnittgrößen und Auslastung je Stab: Fließen (Normal- plus Biegespannung) oder Knicken (Euler)
    let nY = 0, nK = 0, nH = 0;
    for (const el of els) {
      const { k, b, p } = el, u = el.dof.map((q, i) => disp[(i < nd ? b.a : b.b) * 3 + (i % nd)]);
      let N, M1 = 0, M2 = 0;
      if (!frame) N = E * p.A / b.len * (b.c * (u[2] - u[0]) + b.s * (u[3] - u[1]));
      else {
        const ul = localU(b, u), EI = E * p.I, Lb = b.len;
        N = E * p.A / Lb * (ul[3] - ul[0]);
        const dv = 6 * EI / (Lb * Lb) * (ul[1] - ul[4]);   // Endmomente aus Kl * ul
        M1 = dv + EI / Lb * (4 * ul[2] + 2 * ul[5]);
        M2 = dv + EI / Lb * (2 * ul[2] + 4 * ul[5]);
      }
      const Lk = bucklingLength(L, fe, k, model), [util, kind] = barUtil(p, N, Math.max(Math.abs(M1), Math.abs(M2)), Lk);
      res.N[k] = N; res.M[2 * k] = M1; res.M[2 * k + 1] = M2; res.Lk[k] = Lk; res.util[k] = util;
      if (util > 1) { res.fail[k] = kind; if (kind === 3) nH++; else if (kind === 2) nK++; else nY++; }
      if (util > res.maxUtil) { res.maxUtil = util; res.maxBar = k; }
    }
    res.ok = res.maxUtil <= 1;
    res.reason = res.ok ? '' : res.fail[res.maxBar] >= 2 ? 'knicken' : 'spannung';
    res.nYield = nY; res.nBuckle = nK; res.nHinge = nH;
    res.ms = performance.now() - t0;
    return res;
  }

  function trussK(b, p) {
    const k = E * p.A / b.len, cc = b.c * b.c * k, cs = b.c * b.s * k, ss = b.s * b.s * k;
    return [cc, cs, -cc, -cs, cs, ss, -cs, -ss, -cc, -cs, cc, cs, -cs, -ss, cs, ss];
  }
  // Rahmenelement: lokale Steifigkeit, gedreht ins globale System (K = T^T Kl T)
  function frameK(b, p) {
    const L = b.len, a = E * p.A / L, EI = E * p.I, k1 = 12 * EI / L ** 3, k2 = 6 * EI / L ** 2, k3 = 4 * EI / L, k4 = 2 * EI / L;
    const Kl = [a, 0, 0, -a, 0, 0, 0, k1, k2, 0, -k1, k2, 0, k2, k3, 0, -k2, k4,
      -a, 0, 0, a, 0, 0, 0, -k1, -k2, 0, k1, -k2, 0, k2, k4, 0, -k2, k3];
    const T = tmat(b), K = new Array(36).fill(0);
    for (let i = 0; i < 6; i++) for (let j = 0; j < 6; j++) {
      let s = 0;
      for (let p = 0; p < 6; p++) if (T[p * 6 + i]) for (let q = 0; q < 6; q++) if (T[q * 6 + j]) s += T[p * 6 + i] * Kl[p * 6 + q] * T[q * 6 + j];
      K[i * 6 + j] = s;
    }
    return K;
  }
  function tmat(b) {
    const T = new Array(36).fill(0);
    for (const o of [0, 3]) {
      T[o * 6 + o] = b.c; T[o * 6 + o + 1] = b.s; T[(o + 1) * 6 + o] = -b.s; T[(o + 1) * 6 + o + 1] = b.c; T[(o + 2) * 6 + o + 2] = 1;
    }
    return T;
  }
  // globale Knotenwerte (u1, v1, t1, u2, v2, t2) in lokale (längs, quer, Verdrehung)
  const localU = (b, u) => [b.c * u[0] + b.s * u[1], -b.s * u[0] + b.c * u[1], u[2], b.c * u[3] + b.s * u[4], -b.s * u[3] + b.c * u[4], u[5]];

  // Bemessen (fully stressed design): Jeder tragende Stab bekommt das kleinste Profil, das mit seinen Schnittgrößen hält.
  // Die Kräfte lagern sich mit den Steifigkeiten um, also wiederholen, bis sich nichts mehr ändert; ab dem achten Durchgang
  // wird nur noch vergrößert, damit es nicht hin und her springt. Stäbe, die nichts tragen, fallen weg (gesperrte bekommen
  // das kleinste Profil). Ergebnis { on, res } oder null, wenn es beweglich ist oder auch das größte Profil nicht reicht.
  // Generator: liefert nach jeder Rechnung einmal, damit die Oberfläche atmen kann.
  function* size(L, on, model) {
    const cur = Uint8Array.from(on);
    for (let it = 0; it < 16; it++) {
      const r = analyze(L, cur, model);
      yield;
      if (!r.disp || r.reason === 'mechanismus') return null;
      let changed = false;
      for (let k = 0; k < L.nB; k++) {
        if (!cur[k]) continue;
        let need;
        if (!r.fe[k]) need = L.frozen[k] ? 1 : 0;
        else {
          const M = Math.max(Math.abs(r.M[2 * k]), Math.abs(r.M[2 * k + 1]));
          need = PROFILES.findIndex(p => barUtil(p, r.N[k], M, r.Lk[k])[0] <= 1) + 1 || PROFILES.length;
          if (it >= 8) need = Math.max(need, cur[k]);
        }
        if (need !== cur[k]) { cur[k] = need; changed = true; }
      }
      if (!changed) return r.ok ? { on: cur, res: r } : null;
    }
    return null;
  }

  // Gegner: alle Stäbe im mittleren Profil, bemessen. Dann immer den am geringsten ausgelasteten Stab entfernen und neu
  // bemessen, solange es hält und leichter wird. Was beim Entfernen beweglich wird oder nicht mehr hält, wird nicht wieder
  // versucht (mit weniger Stäben wird es nicht besser). Ergebnis { res, on, order }.
  function* optimize(L, model) {
    const start = Uint8Array.from(L.domain, () => 2);
    let best = yield* size(L, start, model);
    if (!best) return { res: analyze(L, start, model), on: start, order: [] };
    const order = [], tabu = new Uint8Array(L.nB);
    for (;;) {
      const cand = [];
      for (let k = 0; k < L.nB; k++) if (best.on[k] && !L.frozen[k] && !tabu[k]) cand.push(k);
      cand.sort((a, b) => best.res.util[a] - best.res.util[b]);
      const m = mass(L, best.on);
      let next = null;
      for (const k of cand) {
        const trial = Uint8Array.from(best.on);
        trial[k] = 0;
        const t = yield* size(L, trial, model);
        if (!t) tabu[k] = 1;
        else if (mass(L, t.on) < m - 1e-6) { next = t; order.push(k); break; }
      }
      if (!next) break;
      best = next;
    }
    return { res: best.res, on: best.on, order };
  }

  return { GRID, E, RE, PROFILES, ncr, barUtil, level, reach, attached, length, mass, carrying, bucklingLength,
    analyze, localU, size, optimize };
})();
if (typeof module !== 'undefined') module.exports = FEM;
