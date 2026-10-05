/* Zufallsbauteile und Baukasten: Aus einer Nummer entsteht auf jedem Gerät dasselbe Bauteil (Raster, Lager, Lasten,
   gesperrte Stäbe). Die Lasten werden wie bei den festen Bauteilen bemessen: Das volle Raster im mittleren Profil ist als
   Fachwerk zu etwa 55 % ausgelastet, gerundet auf einen glatten Betrag (rund 42 bis 64 %). Kein DOM. */
const PARTS = (FEM => {
  const NICE = [0.5, 1, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10, 12, 15, 20, 25, 30, 40, 50, 60, 80, 100, 120, 150, 200];   // kN
  const TARGET = 0.55;   // Auslastung des vollen Rasters
  const MAX_N = 12, MAX_KN = 200;   // größtes Raster in Feldern, größte Last
  const S2 = Math.SQRT1_2;
  // Lastrichtungen in 45°-Schritten ohne Winkelfunktionen, damit alle Geräte bitgenau dasselbe rechnen
  const DIR = { 0: [1, 0], 45: [S2, S2], 90: [0, 1], 135: [-S2, S2], 180: [-1, 0], '-45': [S2, -S2], '-90': [0, -1], '-135': [-S2, -S2] };

  // Zufallszahlen aus der Nummer (mulberry32)
  function rng(seed) {
    let a = seed >>> 0;
    const next = () => {
      a = (a + 0x6D2B79F5) >>> 0;
      let t = Math.imul(a ^ (a >>> 15), a | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
    return {
      int: (lo, hi) => hi <= lo ? lo : lo + Math.floor(next() * (hi - lo + 1)),
      pick: a => a[Math.floor(next() * a.length)],
      chance: p => next() < p,
    };
  }

  // Raster aus Feldern, y nach oben; node(i, j): Knoten gehört zum Bauteil (ein Feld daneben)
  function grid(nx, ny, v = 1) {
    const c = new Uint8Array(nx * ny).fill(v);
    const has = (x, y) => x >= 0 && y >= 0 && x < nx && y < ny && c[x + y * nx] === 1;
    const fill = (x0, y0, w, h, val) => {
      for (let y = Math.max(0, y0); y < Math.min(ny, y0 + h); y++) for (let x = Math.max(0, x0); x < Math.min(nx, x0 + w); x++) c[x + y * nx] = val;
    };
    const node = (i, j) => has(i, j) || has(i - 1, j) || has(i, j - 1) || has(i - 1, j - 1);
    return { nx, ny, c, has, fill, node };
  }
  const range = (a, b) => Array.from({ length: Math.max(0, b - a + 1) }, (_, k) => a + k);
  const wall = (nodes, side) => ({ kind: 'wand', nodes, side, fix: 7 });
  // Das Loslager hält nur senkrecht zur Auflagefläche
  const pin = (kind, node, side) => ({ kind, nodes: [node], side, fix: kind === 'fest' ? 3 : side === 'left' || side === 'right' ? 1 : 2 });
  const load = (node, deg, kn = 1) => ({ node, deg, fx: DIR[deg][0] * 1000 * kn, fy: DIR[deg][1] * 1000 * kn });
  const column = (g, i) => range(0, g.ny).filter(j => g.node(i, j));   // Knoten auf der senkrechten Linie x = i
  const row = (g, j) => range(0, g.nx).filter(i => g.node(i, j));

  // ---------- Bauformen ----------
  function kragarm(R) {
    const nx = R.int(5, 9), ny = R.int(2, 4), left = R.chance(0.7), g = grid(nx, ny);
    if (ny >= 3 && R.chance(0.4)) {   // zum freien Ende hin verjüngt
      const w = R.int(1, Math.floor(nx / 3)), h = R.int(1, ny - 2);
      g.fill(left ? nx - w : 0, R.chance(0.5) ? ny - h : 0, w, h, 0);
    }
    const ex = left ? nx : 0, ys = column(g, ex), y = R.pick([ys[0], ys[0], ys[ys.length - 1], ys[ys.length >> 1]]);
    return { name: 'Kragarm', note: `${left ? 'Links' : 'Rechts'} eingespannt, die Last greift am freien Ende an.`, g,
      supports: [wall(column(g, left ? 0 : nx).map(j => [left ? 0 : nx, j]), left ? 'left' : 'right')],
      loads: [load([ex, y], R.pick([-90, -90, -90, 90, -45, -135]))] };
  }

  function traeger(R) {
    const nx = R.int(6, 11), ny = R.int(2, 4), g = grid(nx, ny);
    const oL = R.pick([0, 0, 0, 1, 2]), oR = R.pick([0, 0, 0, 1, 2]), xa = oL, xb = nx - oR, festLeft = R.chance(0.6);
    const supports = [pin(festLeft ? 'fest' : 'los', [xa, 0], 'bottom'), pin(festLeft ? 'los' : 'fest', [xb, 0], 'bottom')];
    const mode = R.pick(['fahrbahn', 'fahrbahn', 'oben', 'unten', 'kragende']);
    let loads, frozen = [], how;
    if (mode === 'fahrbahn') {   // Fahrbahn unten bleibt, an jedem ihrer Knoten zwischen den Lagern eine Last
      frozen = range(0, nx - 1).map(i => [i, 0, i + 1, 0]);
      loads = range(xa + 1, xb - 1).map(i => load([i, 0], -90));
      how = 'die Fahrbahn unten bleibt, an jedem ihrer Knoten zwischen den Lagern hängt eine Last';
    } else if (mode === 'kragende' && Math.max(oL, oR) >= 1) {
      loads = [load([oL >= oR ? 0 : nx, ny], -90)];
      how = 'am Kragende drückt die Last';
    } else {
      const top = mode !== 'unten', x = R.int(xa + 1, xb - 1);
      loads = [load([x, top ? ny : 0], top ? R.pick([-90, -90, -90, -45, -135]) : -90)];
      if (R.chance(0.4) && xb - x >= 3) loads.push(load([R.int(x + 2, xb - 1), top ? ny : 0], -90));
      how = top ? 'die Last drückt von oben' : 'unten hängt die Last';
    }
    return { name: 'Träger', note: `Festlager ${festLeft ? 'links' : 'rechts'}, Loslager ${festLeft ? 'rechts' : 'links'}, ${how}.`, g,
      supports, loads, frozen };
  }

  // an der Wand, Arm oben oder unten
  function konsole(R) {
    const nx = R.int(4, 8), ny = R.int(4, 7), wl = R.int(1, 2), wa = R.int(1, 2), left = R.chance(0.6), armTop = R.chance(0.6);
    const g = grid(nx, ny, 0), ya = armTop ? ny - wa : 0, ex = left ? nx : 0;
    g.fill(left ? 0 : nx - wl, 0, wl, ny, 1); g.fill(0, ya, nx, wa, 1);
    return { name: 'Konsole', note: `${left ? 'Links' : 'Rechts'} an der Wand befestigt, am Ende des Arms greift die Last an.`, g,
      supports: [wall(column(g, left ? 0 : nx).map(j => [left ? 0 : nx, j]), left ? 'left' : 'right')],
      loads: [load([ex, R.int(ya, ya + wa)], R.pick([-90, -90, -90, left ? -45 : -135]))] };
  }

  // oben an der Decke, Schenkel nach unten, Arm unten zur Seite
  function winkel(R) {
    const nx = R.int(4, 7), ny = R.int(4, 7), wl = R.int(1, 2), wa = R.int(1, 2), left = R.chance(0.5);
    const g = grid(nx, ny, 0), lx = left ? 0 : nx - wl, ex = left ? nx : 0;
    g.fill(lx, 0, wl, ny, 1); g.fill(0, 0, nx, wa, 1);
    return { name: 'Winkel', note: 'Oben an der Decke eingespannt, die Last greift am Ende des Schenkels an.', g,
      supports: [wall(range(lx, lx + wl).map(i => [i, ny]), 'top')],
      loads: [load([ex, R.int(0, wa)], R.pick([-90, -90, -90, left ? -45 : -135]))] };
  }

  // zwei Stützen und ein Riegel, innen frei; manchmal sind Stützen und Riegel vorgegeben
  function rahmen(R) {
    const nx = R.int(3, 7), ny = R.int(3, 5), g = grid(nx, ny), open = nx >= 4 && R.chance(0.5);
    if (open) g.fill(1, 0, nx - 2, ny - 1, 0);   // lichter Raum: Stützen und Riegel je ein Feld breit
    const clamped = R.chance(0.4), fromLeft = R.chance(0.5), mode = R.pick(['wind', 'wind', 'riegel', 'ecke']);
    const supports = clamped ? [wall([[0, 0], [1, 0]], 'bottom'), wall([[nx - 1, 0], [nx, 0]], 'bottom')]
      : [pin('fest', [0, 0], 'bottom'), pin(R.chance(0.5) ? 'fest' : 'los', [nx, 0], 'bottom')];
    let loads;
    if (mode === 'wind') loads = [load([fromLeft ? 0 : nx, ny], fromLeft ? 0 : 180)];
    else if (mode === 'riegel') loads = range(1, nx - 1).filter(i => R.chance(0.5)).slice(0, 2).map(i => load([i, ny], -90));
    else loads = [load([fromLeft ? 0 : nx, ny], fromLeft ? -45 : -135)];
    if (!loads.length) loads = [load([nx >> 1, ny], -90)];
    const given = !open && R.chance(0.5);   // wie beim Tor: Stützen und Riegel gesperrt
    const frozen = given ? [...range(0, ny - 1).map(j => [0, j, 0, j + 1]), ...range(0, ny - 1).map(j => [nx, j, nx, j + 1]),
      ...range(0, nx - 1).map(i => [i, ny, i + 1, ny])] : [];
    return { name: 'Rahmen', g, supports, loads, frozen,
      note: `Zwei Stützen, ${clamped ? 'unten eingespannt' : 'auf Lagern'}, ${mode === 'wind' ? 'Wind von der Seite'
        : mode === 'riegel' ? 'Last auf dem Riegel' : 'schräge Last an der Ecke'}${given ? ', Stützen und Riegel vorgegeben' : ''}${open ? ', innen frei' : ''}.` };
  }

  // unten eingespannt, frei stehend oder mit Arm (Galgen)
  function mast(R) {
    const w = R.int(1, 2), h = R.int(4, 7);
    if (R.chance(0.5)) {
      const la = R.int(2, 4), ha = R.int(1, 2), right = R.chance(0.5), nx = w + la, g = grid(nx, h, 0);
      const mx = right ? 0 : la, ex = right ? nx : 0;
      g.fill(mx, 0, w, h, 1); g.fill(right ? w : 0, h - ha, la, ha, 1);
      return { name: 'Galgen', note: 'Unten eingespannt, am Ende des Arms hängt die Last.', g,
        supports: [wall(range(mx, mx + w).map(i => [i, 0]), 'bottom')], loads: [load([ex, h - ha], -90)] };
    }
    const g = grid(w, h), fromLeft = R.chance(0.5), wind = R.chance(0.67);
    return { name: 'Mast', note: `Unten eingespannt, oben ${wind ? 'drückt der Wind von der Seite' : 'drückt eine schräge Last'}.`, g,
      supports: [wall(range(0, w).map(i => [i, 0]), 'bottom')],
      loads: [load([fromLeft ? 0 : w, h], wind ? (fromLeft ? 0 : 180) : (fromLeft ? -45 : -135))] };
  }

  // oben an der Decke befestigt, die Last hängt unten neben der Befestigung
  function haenger(R) {
    const nx = R.int(4, 8), ny = R.int(2, 4), g = grid(nx, ny), ww = R.int(1, 2), wx = R.int(0, nx - ww);
    const away = range(0, nx).filter(i => i < wx - 1 || i > wx + ww + 1);
    const x = away.length ? R.pick(away) : (wx > nx - wx - ww ? 0 : nx);
    return { name: 'Hänger', note: 'Oben an der Decke befestigt, unten hängt die Last.', g,
      supports: [wall(range(wx, wx + ww).map(i => [i, ny]), 'top')], loads: [load([x, 0], -90)] };
  }

  const FORMS = [kragarm, kragarm, traeger, traeger, traeger, konsole, winkel, rahmen, rahmen, mast, mast, haenger];
  const cutOf = g => { const cut = []; for (let k = 0; k < g.c.length; k++) if (!g.c[k]) cut.push([k % g.nx, Math.floor(k / g.nx)]); return cut; };
  // Felder hängen über Knoten zusammen (auch über Ecken: dort gibt es gemeinsame Knoten und Stäbe)
  function connected(g) {
    const start = g.c.indexOf(1), seen = new Uint8Array(g.c.length), stack = [start];
    seen[start] = 1;
    let n = 1;
    while (stack.length) {
      const k = stack.pop(), x = k % g.nx, y = (k - x) / g.nx;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        const X = x + dx, Y = y + dy, q = X + Y * g.nx;
        if (g.has(X, Y) && !seen[q]) { seen[q] = 1; n++; stack.push(q); }
      }
    }
    return n === g.c.reduce((a, b) => a + b, 0);
  }
  // Lager und Lasten an Knoten des Bauteils, keine doppelt
  function itemsError(g, def) {
    const seen = new Set();
    for (const s of def.supports) for (const [i, j] of s.nodes) {
      if (!g.node(i, j)) return 'knoten';
      if (seen.has(i + ',' + j)) return 'doppelt';
      seen.add(i + ',' + j);
    }
    const ls = new Set();
    for (const l of def.loads) {
      if (!g.node(...l.node)) return 'knoten';
      if (ls.has(l.node.join(','))) return 'doppelt';
      ls.add(l.node.join(','));
    }
    return '';
  }

  // Volles Raster im mittleren Profil rechnen (als Fachwerk); Grund, wenn es nicht taugt
  function full(def, model = 'truss') {
    const L = FEM.level(def);
    return FEM.analyze(L, Uint8Array.from(L.domain, () => 2), model, true);
  }
  // Warum das volle Raster nicht taugt: beweglich (Lagerung reicht nicht), direkt (alle Lasten sitzen auf Lagern, kein Stab
  // trägt etwas)
  const unusable = r => r.reason === 'mechanismus' || r.reason === 'lastpfad' ? 'beweglich' : r.reason === '' && !(r.maxUtil > 0) ? 'direkt' : '';
  // Lasten so skalieren, dass das volle Raster zu gut 50 % ausgelastet ist (linear: Auslastung wächst mit der Last).
  // Gründe dazu: stark oder schwach (Last über 200 oder unter 0,5 kN), voll (als Rahmen oder Fachwerk hält es nicht)
  function scale(def) {
    const r = full(def), why = unusable(r) || (r.reason === 'stabil' ? 'beweglich' : '');
    if (why) return why;
    const want = TARGET / r.maxUtil;   // kN je Last
    if (want > NICE[NICE.length - 1] * 1.3) return 'stark';
    if (want < NICE[0] / 1.3) return 'schwach';
    // nächster glatter Betrag im Verhältnis (ohne Logarithmus, der nicht auf allen Geräten bitgenau gleich ist)
    const off = v => Math.max(v / want, want / v);
    let F = NICE[0];
    for (const v of NICE) if (off(v) < off(F)) F = v;
    for (const ld of def.loads) { ld.fx *= F; ld.fy *= F; }
    def.util = r.maxUtil * F;
    return full(def, 'frame').ok && full(def).ok ? '' : 'voll';
  }
  // Beträge stehen fest: nur prüfen, ob das volle Raster gelagert ist und in beiden Modellen hält
  function check(def) {
    const r = full(def), why = unusable(r);
    if (why) return why;
    if (!r.ok || !full(def, 'frame').ok) return 'voll';
    def.util = r.maxUtil;
    return '';
  }

  function generate(nr) {
    for (let attempt = 0; attempt < 40; attempt++) {
      const R = rng(nr * 7919 + attempt * 104729), p = R.pick(FORMS)(R), g = p.g;
      if (!p.loads.length || p.supports.some(s => !s.nodes.length) || !connected(g)) continue;
      const def = { name: p.name, nr, note: p.note, nx: g.nx, ny: g.ny, cut: cutOf(g), supports: p.supports,
        loads: p.loads.map(({ node, fx, fy }) => ({ node, fx, fy })), frozen: p.frozen || [] };
      if (itemsError(g, def)) continue;
      if (!scale(def)) return def;
    }
    return null;
  }

  // ---------- eigene Bauteile (Baukasten) ----------
  // Rohform: { nx, ny, cells (1 = Feld gehört dazu), supports: [{ kind, side, nodes }], loads: [{ node, deg, kn }],
  // frozen: [[i0, j0, i1, j1], ...], auto }. auto: alle Lasten gleich groß und so bemessen wie bei den festen Bauteilen.
  // shape: daraus ein Bauteil wie die festen, ohne Prüfung (bei auto jede Last 1 kN)
  function shape(raw) {
    const g = grid(raw.nx, raw.ny, 0);
    g.c.set(raw.cells);
    return { nx: g.nx, ny: g.ny, cut: cutOf(g),
      supports: raw.supports.map(s => s.kind === 'wand' ? wall(s.nodes, s.side) : pin(s.kind, s.nodes[0], s.side)),
      loads: raw.loads.map(l => { const { node, fx, fy } = load(l.node, l.deg, raw.auto ? 1 : l.kn); return { node, fx, fy }; }),
      frozen: raw.frozen.slice() };
  }
  // build: prüfen und bei auto die Lasten bemessen. Ergebnis { def } oder { error }:
  // leer, zerfallen, lager, last, knoten, doppelt, beweglich, direkt, stark oder schwach (auto), voll
  function build(raw) {
    const g = grid(raw.nx, raw.ny, 0);
    g.c.set(raw.cells);
    if (!g.c.some(Boolean)) return { error: 'leer' };
    if (!connected(g)) return { error: 'zerfallen' };
    if (!raw.supports.length) return { error: 'lager' };
    if (!raw.loads.length) return { error: 'last' };
    const def = { name: 'Eigenes Bauteil', note: 'Selbst gebaut.', ...shape(raw) };
    const error = itemsError(g, def) || (raw.auto ? scale(def) : check(def));
    return error ? { error } : { def };
  }
  // Code für Link und Wettkampf: Version, Breite und Höhe (Basis 36), Felder (6 Bit je Zeichen); je Lager Art, Seite, i, j;
  // je Last i, j, Richtung in 45°-Schritten, Betrag in 0,1 kN (drei Zeichen Basis 36); gesperrte Stäbe als Bits in der
  // Reihenfolge der Stäbe des Bauteils. Beträge stehen im Code fest.
  const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
  const SIDES = { L: 'left', R: 'right', T: 'top', B: 'bottom' }, KINDS = { w: 'wand', f: 'fest', l: 'los' };
  const DEGS = [0, 45, 90, 135, 180, -135, -90, -45];
  const letter = (map, v) => Object.keys(map).find(k => map[k] === v);
  const bits = a => { let s = ''; for (let i = 0; i < a.length; i += 6) { let v = 0; for (let b = 0; b < 6; b++) v = v * 2 + (a[i + b] ? 1 : 0); s += B64[v]; } return s; };
  const unbits = (s, n) => {
    const out = new Uint8Array(n);
    for (let i = 0; i < s.length; i++) { const v = B64.indexOf(s[i]); if (v < 0) return null; for (let b = 0; b < 6; b++) if (i * 6 + b < n) out[i * 6 + b] = (v >> (5 - b)) & 1; }
    return out;
  };
  const b36 = n => n.toString(36);
  function encode(raw) {
    const L = FEM.level(shape({ ...raw, auto: false })), fz = new Uint8Array(L.nB);
    for (const f of raw.frozen) { const k = L.barAt(...f); if (k >= 0) fz[k] = 1; }
    return '1' + b36(raw.nx) + b36(raw.ny) + '.' + bits(raw.cells) + '.' +
      raw.supports.flatMap(s => s.nodes.map(([i, j]) => letter(KINDS, s.kind) + letter(SIDES, s.side) + b36(i) + b36(j))).join('') + '.' +
      raw.loads.map(l => b36(l.node[0]) + b36(l.node[1]) + DEGS.indexOf(l.deg) + b36(Math.round(l.kn * 10)).padStart(3, '0')).join('') + '.' +
      (fz.some(Boolean) ? bits(fz) : '');
  }
  function decode(code) {
    const m = /^1([0-9a-c])([0-9a-c])\.([A-Za-z0-9_-]+)\.((?:[wfl][LRTB][0-9a-c]{2})+)\.((?:[0-9a-c]{2}[0-7][0-9a-z]{3})+)\.([A-Za-z0-9_-]*)$/.exec(String(code));
    if (!m) return null;
    const nx = parseInt(m[1], 36), ny = parseInt(m[2], 36);
    if (!nx || !ny || m[3].length !== Math.ceil(nx * ny / 6)) return null;
    const cells = unbits(m[3], nx * ny);
    if (!cells) return null;
    // aufeinanderfolgende Knoten einer Einspannung, die auf einer Linie aneinandergrenzen, bilden eine Einspannung
    const supports = [];
    for (const t of m[4].match(/.{4}/g)) {
      const kind = KINDS[t[0]], side = SIDES[t[1]], node = [parseInt(t[2], 36), parseInt(t[3], 36)];
      const g = supports.at(-1), q = g && g.nodes.at(-1), v = side === 'left' || side === 'right';
      if (kind === 'wand' && g && g.kind === 'wand' && g.side === side && (v ? q[0] === node[0] && Math.abs(q[1] - node[1]) === 1
        : q[1] === node[1] && Math.abs(q[0] - node[0]) === 1)) g.nodes.push(node);
      else supports.push({ kind, side, nodes: [node] });
    }
    const loads = m[5].match(/.{6}/g).map(t => ({ node: [parseInt(t[0], 36), parseInt(t[1], 36)], deg: DEGS[+t[2]], kn: parseInt(t.slice(3), 36) / 10 }));
    if (loads.some(l => !(l.kn >= 0.1 && l.kn <= MAX_KN))) return null;
    const raw = { nx, ny, cells, supports, loads, frozen: [], auto: false };
    if (m[6]) {
      const L = FEM.level(shape(raw)), fz = unbits(m[6], L.nB);
      if (!fz) return null;
      raw.frozen = L.bars.map((b, k) => fz[k] ? [...b.p, ...b.q] : null).filter(Boolean);
    }
    return raw;
  }
  // fertiges Bauteil aus einem Code, oder null
  function fromCode(code) {
    const raw = decode(code), b = raw && build(raw);
    if (!b || !b.def) return null;
    b.def.code = code;
    return b.def;
  }

  return { MAX_N, MAX_KN, DIR, DEGS, generate, shape, build, encode, decode, fromCode };
})(typeof module !== 'undefined' ? require('./fem.js') : FEM);
if (typeof module !== 'undefined') module.exports = PARTS;
