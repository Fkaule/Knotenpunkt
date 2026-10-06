/* FE-Kern für Stabwerke: ebene Stäbe zwischen Rasterknoten, wahlweise als Fachwerk (Gelenkknoten, nur Normalkraft)
   oder als Rahmen (biegesteife Knoten, Euler-Bernoulli-Balken). Linear gerechnet, dazu eine Kinematikprüfung und eine
   Stabilitätsprüfung (elastische plus geometrische Steifigkeit). Band-Cholesky. Kein DOM. */
const FEM = (() => {
  const GRID = 1000;                       // Rasterweite in mm
  const E = 210000, RE = 235;              // Stahl S235, MPa
  // Querschnitte: Quadratrohre nach EN 10219-2 (Eckradien außen 2t, innen t), A in mm², I in mm⁴, W in mm³, Masse in kg
  // je mm Stab. Ein Stabwerk ist ein Array mit einem Wert je Stab: 0 kein Stab, sonst die Nummer des Profils (1 bis 3).
  const PROFILES = [[40, 3, 420.8, 93.2e3, 4.66e3], [60, 4, 854.8, 435.5e3, 14.52e3], [80, 5, 1435.6, 1314.4e3, 32.86e3]]
    .map(([b, t, A, I, W]) => ({ name: `${b} × ${b} × ${t}`, b, t, A, I, W, kgmm: A * 7.85e-6 }));
  const prof = x => PROFILES[x - 1];
  const ncr = (p, Lk) => Math.PI ** 2 * E * p.I / (Lk * Lk);   // Euler, beidseitig gelenkig
  // Auslastung eines Stabs mit Profil p: Fließen (Normal- plus Biegespannung, M = größtes Endmoment) oder Knicken.
  // Ergebnis [Auslastung, knickt]
  function barUtil(p, N, M, Lk) {
    const uy = (Math.abs(N) / p.A + M / p.W) / RE, uk = N < 0 ? -N / ncr(p, Lk) : 0;
    return [Math.max(uy, uk), uk > uy];
  }
  // Federn an jedem Freiheitsgrad, so weich, dass ein tragfähiges Stabwerk sie nicht merkt. Sie halten die Matrix regulär;
  // nehmen sie einen nennenswerten Teil der Arbeit der Last auf, ist das Stabwerk beweglich (Mechanismus).
  const KS_T = 1e-11 * E * PROFILES[0].A / GRID, KS_R = 1e-11 * E * PROFILES[0].I / GRID, MECH = 0.01;
  // Pivot unter TOL: in dieser Richtung hält nichts (beweglich oder instabil). KC: Querhalt an Durchlaufstellen in den Prüfungen.
  const TOL = 1e-8 * E * PROFILES[0].A / GRID, KC = E * PROFILES[0].A / GRID;
  const MODE = 1e6;   // Bewegungs- und Knickformen: größte Verschiebung in mm (beliebig groß, das Zeichnen skaliert)

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

  // Tragende Stäbe: am Lager, in einem Teil mit Last. Teile, die nur über einen einzigen Knoten am Rest hängen und weder
  // Lager noch Last enthalten, tragen nichts (am einzigen Anschluss kann keine Kraft wirken); dazu zählen lose Enden.
  function carrying(L, conn) {
    const fe = Uint8Array.from(conn), keep = new Uint8Array(L.nN);
    for (const n of L.supportNodes) keep[n] = 1;
    for (const n of L.loadNodes) keep[n] = 1;
    for (let changed = true; changed;) {
      changed = false;
      for (let q = 0; q < L.nN; q++) {
        const comp = new Uint8Array(L.nB);
        for (const k0 of L.nodeBars[q]) {
          if (!fe[k0] || comp[k0]) continue;
          // alle Stäbe, die ohne den Knoten q mit k0 zusammenhängen
          const part = [k0], seen = new Set([q]);
          let anchored = false;
          comp[k0] = 1;
          for (let i = 0; i < part.length; i++) for (const m of [L.bars[part[i]].a, L.bars[part[i]].b]) {
            if (seen.has(m)) continue;
            seen.add(m);
            if (keep[m]) anchored = true;
            for (const k of L.nodeBars[m]) if (fe[k] && !comp[k]) { comp[k] = 1; part.push(k); }
          }
          if (!anchored) { for (const k of part) fe[k] = 0; changed = true; }
        }
      }
    }
    return reach(L, fe, L.loadNodes);
  }

  // Hält der Knoten n quer zum Stab b (Lager in beiden Richtungen, die quer zum Stab zählen)?
  const heldAcross = (L, n, b) => (Math.abs(b.s) < 1e-9 || (L.fix[n] & 1)) && (Math.abs(b.c) < 1e-9 || (L.fix[n] & 2));
  // Durchlaufstellen: Knoten mit genau zwei tragenden Stäben in einer Linie, quer nicht gelagert. Dort ist kein Knoten,
  // der Stabzug läuft als ein Profil durch. Ergebnis Map Knoten -> Querrichtung [tx, ty]
  function passNodes(L, fe) {
    const out = new Map();
    for (let n = 0; n < L.nN; n++) {
      const ks = L.nodeBars[n].filter(k => fe[k]);
      if (ks.length !== 2) continue;
      const [p, q] = ks.map(k => L.bars[k]);
      if (Math.abs(p.c * q.s - p.s * q.c) > 1e-9 || heldAcross(L, n, p)) continue;
      out.set(n, [-p.s, p.c]);
    }
    return out;
  }
  // Knicklänge: gerader Stabzug über Durchlaufstellen bis zum nächsten Knoten, an dem ein Stab quer ansetzt oder ein
  // Lager quer hält. Ob dieser Knoten wirklich hält, prüft die Stabilitätsprüfung in analyze.
  function bucklingLength(L, fe, k, pass = passNodes(L, fe)) {
    let len = L.bars[k].len;
    for (const start of [L.bars[k].a, L.bars[k].b]) {
      let n = start, cur = k;
      while (pass.has(n)) {
        const o = L.nodeBars[n].find(q => fe[q] && q !== cur), bo = L.bars[o];
        len += bo.len; cur = o; n = bo.a === n ? bo.b : bo.a;
      }
    }
    return len;
  }

  // Fachwerk: An Durchlaufstellen hat die Querrichtung nur die Hilfsfeder. Fürs Zeichnen dort die Querverschiebung linear
  // zwischen den Enden des Stabzugs einsetzen, der Stabzug ist ein durchlaufendes Profil. keep: Stabzüge mit einer solchen
  // Durchlaufstelle bleiben, wie sie sind (dort greift eine Last quer an, der Zug gibt an dieser Stelle wirklich nach).
  function straighten(L, fe, pass, disp, keep = null) {
    const done = new Uint8Array(L.nN);
    for (const [q0, [tx, ty]] of pass) {
      if (done[q0]) continue;
      // Knoten des Zugs der Reihe nach, mit Abstand vom ersten Ende
      const walk = (n, cur) => {
        const out = [];
        while (pass.has(n)) {
          const o = L.nodeBars[n].find(q => fe[q] && q !== cur), bo = L.bars[o];
          n = bo.a === n ? bo.b : bo.a; cur = o; out.push([n, bo.len]);
        }
        return out;
      };
      const [k1, k2] = L.nodeBars[q0].filter(k => fe[k]);
      const left = walk(q0, k2).reverse(), right = walk(q0, k1);
      // left: vom Knoten q0 über k1 weg (umgedreht: Ende zuerst), right: über k2 weg
      const chain = [...left.map(([n]) => n), q0, ...right.map(([n]) => n)];
      const lens = [...left.map(([, l]) => l), L.bars[k1].len, ...right.map(([, l]) => l)];
      if (keep && chain.some(n => pass.has(n) && keep[n])) { chain.forEach(n => { done[n] = 1; }); continue; }
      let s = 0;
      const pos = chain.map((_, i) => (i ? (s += lens[i - 1]) : 0));
      const total = pos[pos.length - 1], a = chain[0], b = chain[chain.length - 1];
      const ta = disp[a * 3] * tx + disp[a * 3 + 1] * ty, tb = disp[b * 3] * tx + disp[b * 3 + 1] * ty;
      chain.forEach((n, i) => {
        if (!pass.has(n)) return;
        done[n] = 1;
        const t = pos[i] / total, d = (1 - t) * ta + t * tb - (disp[n * 3] * tx + disp[n * 3 + 1] * ty);
        disp[n * 3] += d * tx; disp[n * 3 + 1] += d * ty;
      });
    }
  }

  let band = new Float64Array(0), band2 = new Float64Array(0);

  // model: 'truss' (Fachwerk) oder 'frame' (Rahmen); quick: ohne Bewegungs- und Knickform (für Bemessung und Gegner)
  function analyze(L, on, model, quick = false) {
    const t0 = performance.now(), frame = model === 'frame', nd = frame ? 3 : 2;
    const conn = attached(L, on);
    const res = { ok: false, reason: '', model, on: Uint8Array.from(on), conn, fe: null, pass: new Uint8Array(L.nN),
      util: new Float64Array(L.nB), N: new Float64Array(L.nB), M: new Float64Array(L.nB * 2), Lk: new Float64Array(L.nB),
      fail: new Uint8Array(L.nB), maxUtil: 0, maxBar: -1, disp: null, lambda: NaN, mass: mass(L, on, conn), dofs: 0, bars: 0, ms: 0 };
    const hit = new Set();
    L.bars.forEach((b, k) => { if (conn[k]) { hit.add(b.a); hit.add(b.b); } });
    if (!L.loadNodes.every(n => hit.has(n))) { res.reason = 'lastpfad'; return res; }
    const fe = res.fe = carrying(L, conn), pass = passNodes(L, fe);
    for (const q of pass.keys()) res.pass[q] = 1;

    // Freiheitsgrade: je aktivem Knoten u, v (und beim Rahmen die Verdrehung)
    const eq = new Int32Array(L.nN * 3).fill(-1), active = new Uint8Array(L.nN);
    L.bars.forEach((b, k) => { if (fe[k]) active[b.a] = active[b.b] = 1; });
    let n = 0;
    for (let q = 0; q < L.nN; q++) if (active[q]) for (let d = 0; d < nd; d++) if (!(L.fix[q] & (1 << d))) eq[q * 3 + d] = n++;
    const els = [];
    let bw = 1;
    L.bars.forEach((b, k) => {
      if (!fe[k]) return;
      const dof = [];
      for (const q of [b.a, b.b]) for (let d = 0; d < nd; d++) dof.push(eq[q * 3 + d]);
      let lo = Infinity, hi = -1;
      for (const p of dof) if (p >= 0) { lo = Math.min(lo, p); hi = Math.max(hi, p); }
      if (hi >= 0) bw = Math.max(bw, hi - lo);
      const p = prof(on[k]);
      els.push({ k, b, p, dof, K: frame ? frameK(b, p) : trussK(b, p), N: 0 });
    });
    const w = bw + 1;
    if (band.length < n * w) { band = new Float64Array(n * w); band2 = new Float64Array(n * w); }
    const ks = new Float64Array(n);
    for (let q = 0; q < L.nN; q++) for (let d = 0; d < nd; d++) { const p = eq[q * 3 + d]; if (p >= 0) ks[p] = d < 2 ? KS_T : KS_R; }
    const geoK = (el, N) => frame ? frameKG(el.b, N) : trussKG(el.b, N);

    // Band-Matrix (obere Hälfte, Zeile p hält K[p][p..p+bw]): elastisch, dazu wahlweise geometrisch (geo(el) liefert die
    // Normalkraft oder null) und der Querhalt an Durchlaufstellen (nur Fachwerk, dort gilt das Knicken des Stabzugs)
    const put = (A, p, q, v) => { if (p >= 0 && q >= 0) A[Math.min(p, q) * w + Math.abs(q - p)] += v; };
    function build(A, geo, hold) {
      A.fill(0, 0, n * w);
      for (const el of els) {
        const m = el.dof.length, G = geo && geo(el) != null ? geoK(el, geo(el)) : null;
        for (let a = 0; a < m; a++) for (let c = a; c < m; c++) {
          const v = el.K[a * m + c] + (G ? G[a * m + c] : 0);
          if (el.dof[a] === el.dof[c]) put(A, el.dof[a], el.dof[c], c === a ? v : 2 * v);
          else put(A, el.dof[a], el.dof[c], v);
        }
      }
      for (let p = 0; p < n; p++) A[p * w] += ks[p];
      if (hold) for (const [q, [tx, ty]] of pass) {
        const du = eq[q * 3], dv = eq[q * 3 + 1];
        put(A, du, du, KC * tx * tx); put(A, dv, dv, KC * ty * ty); put(A, du, dv, KC * tx * ty);
      }
    }
    // Cholesky A = U^T U (in place). Bricht beim ersten Pivot unter thr ab; Ergebnis: kleinster Pivot bzw. der Abbruchwert
    function factor(A, thr) {
      let min = Infinity;
      for (let i = 0; i < n; i++) {
        const r = i * w, m = Math.min(bw, n - 1 - i);
        if (!(A[r] > thr)) return A[r];
        min = Math.min(min, A[r]);
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
      return min;
    }
    function solve(A, x) {
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
    }
    // Verschiebungen je Knoten (u, v in mm, Verdrehung in rad) aus einem Lösungsvektor; im Fachwerk Stabzüge gerade
    const toDisp = (x, straight, keep) => {
      const d = new Float64Array(L.nN * 3);
      for (let q = 0; q < L.nN; q++) for (let e = 0; e < nd; e++) { const p = eq[q * 3 + e]; if (p >= 0) d[q * 3 + e] = x[p]; }
      if (straight && !frame) straighten(L, fe, pass, d, keep);
      return d;
    };
    // kleinste Eigenform von A φ = λ B φ per inverser Iteration (A zerlegt; ohne B: B = Einheitsmatrix)
    function inverse(A, Bmul, iters) {
      let x = Float64Array.from({ length: n }, (_, i) => 1 + ((i * 7919) % 13) / 13), lam = NaN;
      for (let it = 0; it < iters; it++) {
        const y = Bmul ? Bmul(x) : x.slice(), z = y.slice();
        solve(A, z);
        let num = 0, den = 0, mx = 0;
        for (let i = 0; i < n; i++) { num += x[i] * y[i]; den += z[i] * y[i]; mx = Math.max(mx, Math.abs(z[i])); }
        lam = num / den;
        if (!(mx > 0)) break;
        for (let i = 0; i < n; i++) x[i] = z[i] / mx;
      }
      return { x, lam };
    }
    // Form auf MODE skalieren (größte Knotenverschiebung)
    const scaled = d => {
      let m = 0;
      for (let q = 0; q < L.nN; q++) m = Math.max(m, Math.hypot(d[q * 3], d[q * 3 + 1]));
      if (m > 0) for (let i = 0; i < d.length; i++) d[i] *= MODE / m;
      return d;
    };
    res.dofs = n; res.bars = els.length;
    const done = reason => { res.reason = reason; res.ms = performance.now() - t0; return res; };

    // 1. Lineare Lösung mit den Hilfsfedern
    const A = band, x = new Float64Array(n);
    build(A, null, false);
    const p0 = factor(A, 0);
    if (!(p0 > 0)) return done('mechanismus');
    for (const q of L.loadNodes) {
      if (eq[q * 3] >= 0) x[eq[q * 3]] += L.fx[q];
      if (eq[q * 3 + 1] >= 0) x[eq[q * 3 + 1]] += L.fy[q];
    }
    const f = Float64Array.from(x);
    solve(A, x);
    // Mechanismus, den die Last anregt: die weichen Federn nehmen einen nennenswerten Teil der Arbeit auf.
    // Lasten, die nur auf Lagern sitzen, leisten keine Arbeit; dann entscheidet allein die Kinematikprüfung.
    let work = 0, spring = 0, fsum = 0;
    for (let p = 0; p < n; p++) { work += f[p] * x[p]; spring += ks[p] * x[p] * x[p]; fsum += Math.abs(f[p]); }
    // Bewegungsform zeigen: Stabzüge über Durchlaufstellen gerade (die Stütze des Tors dreht sich als Ganzes um ihr Fußgelenk),
    // außer dort, wo die Last selbst an einer Durchlaufstelle quer angreift
    if (fsum > 0 && (!(work > 0) || spring > MECH * work)) {
      const loaded = new Uint8Array(L.nN);
      for (const q of L.loadNodes) loaded[q] = 1;
      res.disp = toDisp(x, true, loaded);
      return done('mechanismus');
    }
    const disp = toDisp(x, false);

    // 2. Schnittgrößen und Auslastung je Stab: Fließen (Normal- plus Biegespannung) oder Knicken (Euler, Stabzug)
    let nY = 0, nK = 0;
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
      const Lk = bucklingLength(L, fe, k, pass), [util, knickt] = barUtil(p, N, Math.max(Math.abs(M1), Math.abs(M2)), Lk);
      el.N = N;
      res.N[k] = N; res.M[2 * k] = M1; res.M[2 * k + 1] = M2; res.Lk[k] = Lk; res.util[k] = util;
      if (util > 1) { res.fail[k] = knickt ? 2 : 1; if (knickt) nK++; else nY++; }
      if (util > res.maxUtil) { res.maxUtil = util; res.maxBar = k; }
    }
    res.nYield = nY; res.nBuckle = nK;

    // 3. Kinematik, unabhängig von der Last: Gibt es eine Bewegung, die keinen Stab dehnt (und keinen Rahmenstab biegt)?
    // Im Fachwerk sind die Durchlaufstellen dabei quer gehalten. Im Rahmen ist das die Matrix aus Schritt 1.
    let kin = p0;
    if (!frame) { build(A, null, true); kin = factor(A, 0); }
    if (!(kin >= TOL)) {
      if (!quick) res.disp = scaled(toDisp(inverse(A, null, 4).x, true));   // A ist zerlegt (die Hilfsfedern halten sie positiv)
      return done('mechanismus');
    }

    // 4. Stabilität: elastische plus geometrische Steifigkeit (Druck macht weich, Zug steif). Nicht positiv definit heißt:
    // Das Tragwerk weicht unter den Druckkräften als Ganzes aus, auch wenn jeder Stabzug für sich nicht knickt. Geprüft wird
    // nur, wenn die Stäbe für sich halten; sonst ist das Urteil schon gefallen. Ohne quick dazu Knickform und kritischer
    // Lastfaktor λ aus (K + K_G,Zug) φ = λ (-K_G,Druck) φ.
    const fails = res.maxUtil > 1, compressed = els.some(el => el.N < 0);
    let unstable = false;
    if (!fails && compressed) { build(A, el => el.N, !frame); unstable = !(factor(A, TOL) >= TOL); }
    if (!quick && compressed) {
      const B = band2;
      build(B, el => el.N > 0 ? el.N : null, !frame);
      factor(B, 0);
      const Bmul = v => {
        const y = new Float64Array(n);
        for (const el of els) if (el.N < 0) {
          const G = geoK(el, el.N), m = el.dof.length;
          for (let a = 0; a < m; a++) {
            const pa = el.dof[a];
            if (pa < 0) continue;
            for (let c = 0; c < m; c++) { const pc = el.dof[c]; if (pc >= 0) y[pa] -= G[a * m + c] * v[pc]; }
          }
        }
        return y;
      };
      const { x: phi, lam } = inverse(B, Bmul, 30);
      res.lambda = lam;
      if (unstable) res.disp = scaled(toDisp(phi, true));
    } else if (!compressed) res.lambda = Infinity;
    if (unstable) return done('stabil');

    res.disp = quick || frame ? disp : (straighten(L, fe, pass, disp), disp);
    res.ok = !fails;
    return done(res.ok ? '' : res.fail[res.maxBar] === 2 ? 'knicken' : 'spannung');
  }

  function trussK(b, p) {
    const k = E * p.A / b.len, cc = b.c * b.c * k, cs = b.c * b.s * k, ss = b.s * b.s * k;
    return [cc, cs, -cc, -cs, cs, ss, -cs, -ss, -cc, -cs, cc, cs, -cs, -ss, cs, ss];
  }
  // Geometrische Steifigkeit des Fachwerkstabs (N positiv als Zug): N/L quer zum Stab
  function trussKG(b, N) {
    const g = N / b.len, xx = b.s * b.s * g, xy = -b.s * b.c * g, yy = b.c * b.c * g;
    return [xx, xy, -xx, -xy, xy, yy, -xy, -yy, -xx, -xy, xx, xy, -xy, -yy, xy, yy];
  }
  // Rahmenelement: lokale Steifigkeit, gedreht ins globale System (K = T^T Kl T)
  function frameK(b, p) {
    const L = b.len, a = E * p.A / L, EI = E * p.I, k1 = 12 * EI / L ** 3, k2 = 6 * EI / L ** 2, k3 = 4 * EI / L, k4 = 2 * EI / L;
    return rotate(b, [a, 0, 0, -a, 0, 0, 0, k1, k2, 0, -k1, k2, 0, k2, k3, 0, -k2, k4,
      -a, 0, 0, a, 0, 0, 0, -k1, -k2, 0, k1, -k2, 0, k2, k4, 0, -k2, k3]);
  }
  // Geometrische Steifigkeit des Rahmenelements, konsistent zum kubischen Ansatz (N positiv als Zug)
  function frameKG(b, N) {
    const L = b.len, g = N / L, a = 6 / 5 * g, c = L / 10 * g, d = 2 * L * L / 15 * g, e = -L * L / 30 * g;
    return rotate(b, [0, 0, 0, 0, 0, 0, 0, a, c, 0, -a, c, 0, c, d, 0, -c, e,
      0, 0, 0, 0, 0, 0, 0, -a, -c, 0, a, -c, 0, c, e, 0, -c, d]);
  }
  function rotate(b, Kl) {
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
  // wird nur noch vergrößert, damit es nicht hin und her springt. Versagt die Stabilität des Ganzen, werden die
  // gedrückten Stäbe vergrößert. Stäbe, die nichts tragen, fallen weg (gesperrte bekommen das kleinste Profil).
  // Reicht es nicht, einmal neu mit dem kleinsten Profil beginnen. Ergebnis { on, res } oder null.
  // Generator: liefert nach jeder Rechnung einmal, damit die Oberfläche atmen kann.
  function* size(L, on, model, retry = true) {
    const cur = Uint8Array.from(on);
    for (let it = 0; it < 16; it++) {
      const r = analyze(L, cur, model, true);
      yield;
      if (!r.disp || r.reason === 'mechanismus') return null;
      let changed = false;
      if (r.reason === 'stabil') {
        for (let k = 0; k < L.nB; k++) if (cur[k] && r.fe[k] && r.N[k] < 0 && cur[k] < PROFILES.length) { cur[k]++; changed = true; }
        if (changed) continue;
        break;
      }
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
      if (!changed) { if (r.ok) return { on: cur, res: r }; break; }
    }
    return retry ? yield* size(L, Uint8Array.from(on, x => x ? 1 : 0), model, false) : null;
  }

  // Gegner: alle Stäbe im mittleren Profil, bemessen. Dann immer den am geringsten ausgelasteten Stab entfernen und neu
  // bemessen, solange es hält und leichter wird; was beim Entfernen beweglich wird oder nicht mehr hält, wird nicht wieder
  // versucht. noise stört die Reihenfolge zufällig (seed: wiederholbar).
  function* descend(L, model, noise, seed) {
    let best = yield* size(L, Uint8Array.from(L.domain, () => 2), model);
    if (!best) return null;
    let s = seed;
    const rnd = () => (s = (s * 16807) % 2147483647) / 2147483647;
    const tabu = new Uint8Array(L.nB);
    for (;;) {
      const cand = [], key = new Float64Array(L.nB);
      for (let k = 0; k < L.nB; k++) if (best.on[k] && !L.frozen[k] && !tabu[k]) { cand.push(k); key[k] = best.res.util[k] * (1 + noise * (rnd() - 0.5)); }
      cand.sort((a, b) => key[a] - key[b]);
      const m = mass(L, best.on);
      let next = null;
      for (const k of cand) {
        const trial = Uint8Array.from(best.on);
        trial[k] = 0;
        const t = yield* size(L, trial, model);
        if (!t) tabu[k] = 1;
        else if (mass(L, t.on) < m - 1e-6) { next = t; break; }
      }
      if (!next) break;
      best = next;
    }
    return best;
  }
  // Der gierige Weg hängt vom Start ab. Darum mehrere Läufe: im eigenen Modell, im anderen Modell (dessen Ergebnis wird im
  // eigenen neu bemessen) und zwei mit gestörter Reihenfolge; das leichteste Ergebnis gewinnt. Zum Schluss je Stab ein
  // Profil kleiner versuchen. Ergebnis { res, on }.
  function* optimize(L, model) {
    let best = null;
    const runs = [[model, 0, 1], [model === 'truss' ? 'frame' : 'truss', 0, 1], [model, 0.5, 4711], [model, 0.5, 815]];
    for (const [m, noise, seed] of runs) {
      let r = yield* descend(L, m, noise, seed);
      if (r && m !== model) r = yield* size(L, r.on, model);
      if (r && (!best || mass(L, r.on) < mass(L, best.on) - 1e-6)) best = r;
    }
    if (!best) { const on = Uint8Array.from(L.domain, () => 2); return { res: analyze(L, on, model), on }; }
    const order = Array.from(best.on.keys()).filter(k => best.on[k] > 1).sort((a, b) => best.res.util[a] - best.res.util[b]);
    for (const k of order) {
      const trial = Uint8Array.from(best.on);
      trial[k]--;
      const r = analyze(L, trial, model, true);
      yield;
      if (r.ok) best = { on: trial, res: r };
    }
    return { res: best.res, on: best.on };
  }

  return { GRID, E, RE, PROFILES, ncr, barUtil, level, reach, attached, length, mass, carrying, passNodes, bucklingLength,
    analyze, localU, size, optimize };
})();
if (typeof module !== 'undefined') module.exports = FEM;
