/* Spiel: Entwurf, Aufdecken als Fachwerk oder Rahmen, Gegner. Zeichnet auf ein Canvas im Stil einer technischen Zeichnung. */
(() => {
  const { GRID, KG_MM } = FEM;
  const $ = id => document.getElementById(id);
  const cv = $('cv'), ctx = cv.getContext('2d'), wrap = $('wrap');
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const MONO = '"IBM Plex Mono", Menlo, monospace';
  const fmt = (x, d = 0) => x.toLocaleString('de-DE', { minimumFractionDigits: d, maximumFractionDigits: d });
  const clamp01 = x => Math.max(0, Math.min(1, x));
  const count = a => a.reduce((n, x) => n + (x ? 1 : 0), 0);
  // Nur Bequemlichkeit je Gerät (gewähltes Rechenmodell); ohne Speicher geht alles weiter
  const store = {
    get: k => { try { return JSON.parse(localStorage.getItem('knotenpunkt-' + k)); } catch { return null; } },
    set: (k, v) => { try { localStorage.setItem('knotenpunkt-' + k, JSON.stringify(v)); } catch {} },
  };
  const NAME = { truss: 'Fachwerk', frame: 'Rahmen' };
  const other = m => m === 'truss' ? 'frame' : 'truss';

  // Farbskala ohne Gelb: blau, türkis, grün, orange, rot; über 100 % magenta
  const STOPS = [[0, [38, 60, 150]], [0.2, [44, 110, 214]], [0.4, [24, 164, 196]], [0.6, [52, 178, 116]],
    [0.8, [239, 136, 44]], [1, [222, 50, 42]]];
  const ramp = u => {
    for (let i = 1; i < STOPS.length; i++) if (u <= STOPS[i][0]) {
      const [a, ca] = STOPS[i - 1], [b, cb] = STOPS[i], f = (u - a) / (b - a);
      return `rgb(${ca.map((c, k) => Math.round(c + f * (cb[k] - c))).join(',')})`;
    }
    return 'rgb(222,50,42)';
  };
  const BANDS = Array.from({ length: 10 }, (_, b) => ramp((b + 0.5) / 10));
  const OVER = '#ff2e88';
  const bandOf = u => u > 1 ? OVER : BANDS[Math.min(9, Math.floor(Math.max(0, u) * 10))];

  // model: Rechenmodell, das gewertet wird; shown: Modell in der Ergebnisansicht; res: Ergebnis je Modell
  const st = { li: 0, def: null, L: null, on: null, conn: null, undo: [], phase: 'design', probes: 1,
    model: store.get('model') === 'frame' ? 'frame' : 'truss', shown: 'truss', res: null, view: { mode: 'blind' }, resultView: null,
    hover: -1, drag: null, tool: 'rect', eso: {}, esoRun: null, animId: 0, busy: false };
  let G = null;
  const C = {};
  // eingespart in Prozent der Stablänge (gleiches Profil, also der Masse); was nicht am Lager hängt, fällt ab
  const removedPct = conn => 100 * (1 - FEM.length(st.L, conn) / st.L.total);
  const kg = len => len * KG_MM;

  function readColors() {
    const cs = getComputedStyle(document.documentElement);
    for (const t of ['sheet', 'ink', 'ink2', 'rule', 'grid', 'steel', 'steel2', 'hatch', 'accent', 'loose', 'bad'])
      C[t] = cs.getPropertyValue('--' + t).trim();
  }

  // ---------- Geometrie ----------
  const kN = ld => Math.round(Math.hypot(ld.fx, ld.fy) / 100) / 10;
  const kNtxt = ld => `${fmt(kN(ld), kN(ld) % 1 ? 1 : 0)} kN`;
  const sameLoads = d => d.loads.every(l => l.fx === d.loads[0].fx && l.fy === d.loads[0].fy);
  const loadText = d => d.loads.length === 1 ? `F = ${kNtxt(d.loads[0])}`
    : sameLoads(d) ? `${d.loads.length} × ${kNtxt(d.loads[0])}` : d.loads.map(kNtxt).join(', ');

  // Ränder [oben, rechts, unten, links] und Abstand der Bemaßung [unten, links] in Rasterfeldern. Die Schrift hat eine
  // Mindestgröße: auf schmalen Bildschirmen ist sie größer als vorgesehen, dann wachsen Ränder und Bemaßungsabstand mit.
  function frame(s) {
    const d = st.def, [t, r, b, l] = d.margin, ex = Math.max(12, s * 0.2) / s - 0.2;
    const below = d.loads.length > 1 && sameLoads(d);   // gemeinsame Beschriftung unter den Lastpfeilen
    let right = r;
    if (!below) {
      ctx.save(); ctx.font = `600 ${Math.max(12, s * 0.2)}px ${MONO}`;
      for (const ld of d.loads) right = Math.max(right, ld.node[0] - d.nx + 0.3 + ctx.measureText(`F = ${kNtxt(ld)}`).width / s);
      ctx.restore();
    }
    const rows = below ? 2 : 1;
    return { m: [t, right, b + rows * ex, l + ex], dim: [d.dim[0] + rows * ex, d.dim[1]] };
  }
  function layout() {
    const d = st.def, W = wrap.clientWidth, maxH = Math.max(260, Math.min(innerHeight * 0.62, 640));
    if (!W) return;
    const fit = m => Math.min(W / (d.nx + m[3] + m[1]), maxH / (d.ny + m[0] + m[2]));
    let s = fit(d.margin), F;
    for (let pass = 0; pass < 3; pass++) { F = frame(s); s = fit(F.m); }
    const [mt, mr, mb, ml] = F.m, H = Math.round(s * (d.ny + mt + mb)), dpr = devicePixelRatio || 1;
    cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr);
    cv.style.width = W + 'px'; cv.style.height = H + 'px';
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    G = { s, W, H, ox: (W - s * (d.nx + ml + mr)) / 2 + s * ml, oy: s * (mt + d.ny), dim: F.dim };
  }
  const P = ([i, j]) => [G.ox + i * G.s, G.oy - j * G.s];   // Rasterpunkt in Pixel
  const bw = () => Math.max(3, G.s * 0.07);                // Strichstärke eines Stabs
  // Knotenlage in Pixel mit überhöhter Verschiebung (scale: Überhöhung, u in mm)
  const nodeXY = (r, n, scale) => {
    const [x, y] = P(st.L.ij[n]);
    return !scale || !r.disp ? [x, y] : [x + scale * r.disp[n * 3] / GRID * G.s, y - scale * r.disp[n * 3 + 1] / GRID * G.s];
  };
  // Punkte eines verformten Stabs: Fachwerk gerade, Rahmen als Biegelinie (kubisch, aus Knotenverschiebung und -verdrehung)
  function barPts(r, k, scale) {
    const b = st.L.bars[k], A = nodeXY(r, b.a, scale), B = nodeXY(r, b.b, scale);
    if (r.model !== 'frame' || !scale) return [A, B];
    const d = r.disp, ul = FEM.localU(b, [d[b.a * 3], d[b.a * 3 + 1], d[b.a * 3 + 2], d[b.b * 3], d[b.b * 3 + 1], d[b.b * 3 + 2]]);
    const [x0, y0] = P(st.L.ij[b.a]), [x1, y1] = P(st.L.ij[b.b]), Lb = b.len, f = scale / GRID * G.s, out = [];
    for (let i = 0; i <= 10; i++) {
      const t = i / 10, ax = (1 - t) * ul[0] + t * ul[3];
      const v = (1 - 3 * t * t + 2 * t ** 3) * ul[1] + (t - 2 * t * t + t ** 3) * Lb * ul[2] + (3 * t * t - 2 * t ** 3) * ul[4] + (t ** 3 - t * t) * Lb * ul[5];
      const gx = ax * b.c - v * b.s, gy = ax * b.s + v * b.c;
      out.push([x0 + (x1 - x0) * t + f * gx, y0 + (y1 - y0) * t - f * gy]);
    }
    return out;
  }
  function niceScale(r) {
    let m = 0;
    for (let n = 0; n < st.L.nN; n++) m = Math.max(m, Math.hypot(r.disp[n * 3], r.disp[n * 3 + 1]));
    if (!m) return 0;
    const raw = 0.35 * GRID / m, p = 10 ** Math.floor(Math.log10(raw));
    if (raw < 1) return raw;
    return [5, 3, 2, 1.5, 1].map(f => f * p).find(x => x <= raw);
  }
  const mid = k => { const b = st.L.bars[k]; return [(b.p[0] + b.q[0]) / 2, (b.p[1] + b.q[1]) / 2]; };

  // ---------- Zeichnen ----------
  function render() {
    if (!G) return;
    ctx.clearRect(0, 0, G.W, G.H);
    drawGround();
    drawSupports();
    if (st.view.mode === 'blind') {
      drawBars(st.on, st.conn, st.model);
      drawHover();
    } else drawResult(st.view);
    if (st.drag) drawDrag();
    drawLoads(st.view);
    drawDims();
  }
  const line = pts => { ctx.moveTo(...pts[0]); for (let i = 1; i < pts.length; i++) ctx.lineTo(...pts[i]); };

  // Raster: jede Stelle, an der ein Stab sitzen kann, als dünne Linie
  function drawGround() {
    const L = st.L;
    ctx.save(); ctx.strokeStyle = C.grid; ctx.lineWidth = 1; ctx.beginPath();
    for (const b of L.bars) line([P(b.p), P(b.q)]);
    ctx.stroke();
    ctx.fillStyle = C.rule;
    for (let n = 0; n < L.nN; n++) if (L.ij[n]) { const [x, y] = P(L.ij[n]); ctx.fillRect(x - 1.5, y - 1.5, 3, 3); }
    ctx.restore();
  }

  // Stäbe im Entwurf: Stahl mit Umriss, gesperrte dunkler; ohne Verbindung zum Lager rot gestrichelt.
  // Knoten: Fachwerk als Gelenk (Kreis), Rahmen als steifer Knoten (Quadrat)
  function drawBars(on, conn, model, only = () => true) {
    const L = st.L, w = bw(), set = [], loose = [];
    for (let k = 0; k < L.nB; k++) if (on[k] && only(k)) (conn[k] ? set : loose).push(k);
    ctx.save(); ctx.lineCap = 'round';
    ctx.strokeStyle = C.ink; ctx.lineWidth = w + 2.5; ctx.beginPath();
    for (const k of set) line([P(L.bars[k].p), P(L.bars[k].q)]);
    ctx.stroke();
    for (const [frz, col] of [[0, C.steel], [1, C.steel2]]) {
      ctx.strokeStyle = col; ctx.lineWidth = w; ctx.beginPath();
      for (const k of set) if (L.frozen[k] === frz) line([P(L.bars[k].p), P(L.bars[k].q)]);
      ctx.stroke();
    }
    ctx.restore();
    drawLoose(loose);
    const nodes = new Set();
    for (const k of set) { nodes.add(L.bars[k].a); nodes.add(L.bars[k].b); }
    drawNodes(nodes, model, n => P(L.ij[n]));
  }
  function drawLoose(list) {
    if (!list.length) return;
    ctx.save(); ctx.setLineDash([5, 4]); ctx.strokeStyle = C.loose; ctx.lineWidth = Math.max(2, bw() * 0.6); ctx.beginPath();
    for (const k of list) line([P(st.L.bars[k].p), P(st.L.bars[k].q)]);
    ctx.stroke(); ctx.restore();
  }
  function drawNodes(nodes, model, pos) {
    const w = bw();
    ctx.save(); ctx.lineWidth = 1.5; ctx.strokeStyle = C.ink;
    for (const n of nodes) {
      const [x, y] = pos(n);
      ctx.beginPath();
      if (model === 'truss') { ctx.arc(x, y, w * 0.72, 0, 7); ctx.fillStyle = C.sheet; ctx.fill(); ctx.stroke(); }
      else { const h = w * 0.85; ctx.fillStyle = C.ink; ctx.fillRect(x - h, y - h, 2 * h, 2 * h); }
    }
    ctx.restore();
  }
  // Maus über einem Stab: was ein Klick tut (blau: entfernen, gestrichelt: einsetzen)
  function drawHover() {
    const k = st.hover;
    if (k < 0 || st.drag || !editable() || st.L.frozen[k]) return;
    const b = st.L.bars[k];
    ctx.save(); ctx.lineCap = 'round'; ctx.strokeStyle = C.accent; ctx.lineWidth = bw();
    if (!st.on[k]) ctx.setLineDash([6, 5]);
    ctx.beginPath(); line([P(b.p), P(b.q)]); ctx.stroke(); ctx.restore();
  }
  // Vorschau beim Ziehen: Stäbe, die sich ändern, und Rechteck oder Linie
  function drawDrag() {
    const d = st.drag;
    if (d.kind === 'brush') return;
    const list = d.kind === 'rect' ? rectBars(d) : lineBars(d).bars;
    ctx.save(); ctx.lineCap = 'round'; ctx.lineWidth = bw();
    for (const k of list) {
      const b = st.L.bars[k];
      ctx.strokeStyle = d.paint ? C.accent : C.sheet; ctx.globalAlpha = d.paint ? 0.75 : 0.85;
      ctx.beginPath(); line([P(b.p), P(b.q)]); ctx.stroke();
    }
    ctx.globalAlpha = 1; ctx.setLineDash([6, 4]); ctx.strokeStyle = C.accent; ctx.lineWidth = 2;
    if (d.kind === 'rect' && !isClick(d)) {
      const [x0, y0] = P(d.p0), [x1, y1] = P(d.p1);
      ctx.strokeRect(Math.min(x0, x1), Math.min(y0, y1), Math.abs(x1 - x0), Math.abs(y1 - y0));
    }
    if (d.kind === 'line') { const { a, b } = lineBars(d); ctx.beginPath(); line([P(a), P(b)]); ctx.stroke(); }
    ctx.restore();
  }

  // Ergebnisansicht: verformte Stäbe in Farbe der Auslastung, Aufdeck-Wisch, Versagen
  function drawResult(v) {
    const L = st.L, r = v.res, w = bw();
    const falling = k => v.fall && v.fall.p > 0 && v.fall.set[k];
    if (!r.disp) {
      drawBars(v.on, r.conn, r.model, k => !falling(k));
    } else {
      const mech = r.reason === 'mechanismus', sweepX = v.sweep == null ? Infinity : v.sweep * L.def.nx;
      const scale = v.scale * (v.defo == null ? 1 : v.defo), shown = k => r.fe[k] && !falling(k) && mid(k)[0] <= sweepX;
      drawBars(v.on, r.conn, r.model, k => !falling(k) && !shown(k));   // noch nicht aufgedeckt oder trägt nichts
      if (scale) {   // unverformte Lage
        ctx.save(); ctx.setLineDash([5, 4]); ctx.strokeStyle = C.ink2; ctx.lineWidth = 1; ctx.beginPath();
        for (let k = 0; k < L.nB; k++) if (r.fe[k]) line([P(L.bars[k].p), P(L.bars[k].q)]);
        ctx.stroke(); ctx.restore();
      }
      const pts = [];
      for (let k = 0; k < L.nB; k++) if (shown(k)) pts[k] = barPts(r, k, scale);
      ctx.save(); ctx.lineCap = 'round'; ctx.lineJoin = 'round';
      ctx.strokeStyle = 'rgba(8,16,28,0.55)'; ctx.lineWidth = w + 2.5; ctx.beginPath();
      pts.forEach(p => p && line(p));
      ctx.stroke();
      const pulse = 0.25 + 0.2 * Math.sin((v.t || 0) / 70);
      pts.forEach((p, k) => {
        if (!p) return;
        ctx.strokeStyle = mech ? C.steel : bandOf(r.util[k]); ctx.lineWidth = w;
        ctx.beginPath(); line(p); ctx.stroke();
        if (r.util[k] > 1) {
          ctx.strokeStyle = `rgba(255,255,255,${pulse})`; ctx.beginPath(); line(p); ctx.stroke();
          if (r.fail[k] === 2) drawBuckle(p, w); else drawCrack(p, w);
        }
      });
      ctx.restore();
      const nodes = new Set();
      pts.forEach((p, k) => { if (p) { nodes.add(L.bars[k].a); nodes.add(L.bars[k].b); } });
      drawNodes(nodes, r.model, n => nodeXY(r, n, scale));
      if (!mech && sweepX >= L.def.nx && !(v.fall && v.fall.p > 0)) drawMax(r, pts[r.maxBar]);
    }
    if (v.loose) drawFalling(v.loose.set, v.loose.p, () => C.steel);
    else drawLoose(Array.from({ length: L.nB }, (_, k) => k).filter(k => v.on[k] && !r.conn[k]));
    if (v.fall) drawFalling(v.fall.set, v.fall.p, k => r.disp && r.fe[k] && r.reason !== 'mechanismus' ? bandOf(r.util[k]) : C.steel);
  }
  // Knicken: Stab seitlich ausgebaucht; Fließen: Riss quer über die Stabmitte
  function drawBuckle(p, w) {
    const [a, b] = [p[0], p.at(-1)], dx = b[0] - a[0], dy = b[1] - a[1], l = Math.hypot(dx, dy) || 1, amp = l * 0.12;
    ctx.save(); ctx.strokeStyle = C.sheet; ctx.lineWidth = Math.max(1.5, w * 0.35); ctx.setLineDash([3, 3]); ctx.beginPath();
    for (let i = 0; i <= 12; i++) {
      const t = i / 12, s = amp * Math.sin(Math.PI * t), x = a[0] + dx * t - dy / l * s, y = a[1] + dy * t + dx / l * s;
      i ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
    }
    ctx.stroke(); ctx.restore();
  }
  function drawCrack(p, w) {
    const m = p[Math.floor(p.length / 2)], [a, b] = [p[0], p.at(-1)], dx = b[0] - a[0], dy = b[1] - a[1], l = Math.hypot(dx, dy) || 1;
    const nx = -dy / l, ny = dx / l, tx = dx / l, ty = dy / l, h = w * 1.3;
    ctx.save(); ctx.strokeStyle = C.sheet; ctx.lineWidth = Math.max(1.5, w * 0.3); ctx.beginPath();
    ctx.moveTo(m[0] - nx * h, m[1] - ny * h); ctx.lineTo(m[0] + tx * w * 0.4, m[1] + ty * w * 0.4);
    ctx.lineTo(m[0] - tx * w * 0.3, m[1] - ty * w * 0.3); ctx.lineTo(m[0] + nx * h, m[1] + ny * h);
    ctx.stroke(); ctx.restore();
  }
  function drawFalling(set, p, color) {
    if (p <= 0 || !set.some(Boolean)) return;
    const s = G.s, w = bw();
    ctx.save(); ctx.globalAlpha = 1 - clamp01((p - 0.65) / 0.35); ctx.lineCap = 'round';
    for (let k = 0; k < st.L.nB; k++) if (set[k]) {
      const b = st.L.bars[k], [x0, y0] = P(b.p), [x1, y1] = P(b.q), cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
      const h = ((k * 2654435761) >>> 0) / 4294967296;
      ctx.save();
      ctx.translate(cx + (h - 0.5) * s * 1.5 * p, cy + p * p * (G.H * 0.9 + s * 2 * h));
      ctx.rotate((h - 0.5) * 2.4 * p);
      ctx.strokeStyle = C.ink; ctx.lineWidth = w + 2.5;
      ctx.beginPath(); ctx.moveTo(x0 - cx, y0 - cy); ctx.lineTo(x1 - cx, y1 - cy); ctx.stroke();
      ctx.strokeStyle = color(k); ctx.lineWidth = w; ctx.stroke();
      ctx.restore();
    }
    ctx.restore();
  }
  function drawMax(r, pts) {
    if (r.maxBar < 0 || !pts) return;
    const [cx, cy] = pts[Math.floor(pts.length / 2)], txt = `Max ${fmt(100 * r.maxUtil)} %${r.fail[r.maxBar] === 2 || (r.N[r.maxBar] < 0 && knickt(r, r.maxBar)) ? ' Knicken' : ''}`;
    ctx.save(); ctx.font = `600 ${Math.max(11, G.s * 0.2)}px ${MONO}`;
    const w = ctx.measureText(txt).width + 12, h = Math.max(18, G.s * 0.3);
    const lx = Math.min(Math.max(4, cx + G.s * 0.3), G.W - w - 4), ly = Math.min(Math.max(4, cy - G.s * 0.45 - h), G.H - h - 4);
    ctx.strokeStyle = C.ink; ctx.lineWidth = 1.2;
    ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(lx, ly + h); ctx.stroke();
    ctx.fillStyle = C.sheet; ctx.fillRect(lx, ly, w, h); ctx.strokeRect(lx, ly, w, h);
    ctx.fillStyle = C.ink; ctx.textBaseline = 'middle'; ctx.fillText(txt, lx + 6, ly + h / 2);
    ctx.beginPath(); ctx.arc(cx, cy, 3, 0, 7); ctx.fill();
    ctx.restore();
  }
  // maßgebend ist Knicken, nicht Fließen?
  const knickt = (r, k) => {
    const N = r.N[k], sig = Math.abs(N) / FEM.AREA + Math.max(Math.abs(r.M[2 * k]), Math.abs(r.M[2 * k + 1])) / FEM.WEL;
    return N < 0 && r.util[k] > sig / FEM.RE + 1e-12;
  };

  // Lagersymbole wie in der Technischen Mechanik
  const OUT = { left: [-1, 0], right: [1, 0], top: [0, 1], bottom: [0, -1] };
  function drawSupports() {
    const s = G.s;
    ctx.save(); ctx.strokeStyle = C.ink; ctx.fillStyle = C.sheet;
    for (const sp of st.def.supports) {
      const n = OUT[sp.side];
      if (sp.kind === 'wand') {
        // Wandlinie über die eingespannten Knoten hinaus, Schraffur nach außen
        const t = [Math.abs(n[1]), Math.abs(n[0])], key = q => q[0] * t[0] + q[1] * t[1];
        const ns = sp.nodes.slice().sort((p, q) => key(p) - key(q)), a = ns[0], b = ns.at(-1);
        let A = P([a[0] - t[0] * 0.3, a[1] - t[1] * 0.3]), B = P([b[0] + t[0] * 0.3, b[1] + t[1] * 0.3]);
        if (A[1] > B[1]) [A, B] = [B, A];
        ctx.lineWidth = Math.max(2, s * 0.04); ctx.beginPath(); ctx.moveTo(...A); ctx.lineTo(...B); ctx.stroke();
        const len = Math.hypot(B[0] - A[0], B[1] - A[1]), hs = s * 0.18, hx = (n[0] + Math.abs(n[1])) * hs, hy = (Math.abs(n[0]) - n[1]) * hs;
        ctx.lineWidth = 1; ctx.beginPath();
        for (let q = 0; q < len; q += s * 0.12) {
          const x = A[0] + (B[0] - A[0]) * q / len, y = A[1] + (B[1] - A[1]) * q / len;
          ctx.moveTo(x, y); ctx.lineTo(x + hx, y + hy);
        }
        ctx.stroke();
      } else for (const node of sp.nodes) {
        const [cx, cy] = P(node), h = s * 0.42, w = s * 0.5;
        ctx.save(); ctx.translate(cx, cy); ctx.rotate({ bottom: 0, top: Math.PI, right: -Math.PI / 2, left: Math.PI / 2 }[sp.side]);
        ctx.lineWidth = Math.max(1.5, s * 0.025);
        ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(-w / 2, h); ctx.lineTo(w / 2, h); ctx.closePath();
        ctx.fill(); ctx.stroke();
        const gy = h + (sp.kind === 'los' ? s * 0.1 : 0);
        ctx.beginPath(); ctx.moveTo(-w * 0.75, gy); ctx.lineTo(w * 0.75, gy); ctx.stroke();
        ctx.lineWidth = 1; ctx.beginPath();
        for (let x = -w * 0.75; x < w * 0.75; x += s * 0.1) { ctx.moveTo(x + s * 0.1, gy); ctx.lineTo(x, gy + s * 0.1); }
        ctx.stroke();
        ctx.restore();
      }
    }
    ctx.restore();
  }

  // Lasten hängen am Knoten (Pfeil vom Knoten weg in Lastrichtung); gleiche Lasten bekommen eine gemeinsame Beschriftung
  function drawLoads(v) {
    const s = G.s, d = st.def, r = v.res && v.res.disp && v.res.reason !== 'mechanismus' ? v.res : null;
    const scale = r ? (v.scale || 0) * (v.defo == null ? 1 : v.defo) : 0, len = 0.8, hl = s * 0.2, hw = s * 0.09;
    ctx.save(); ctx.strokeStyle = C.accent; ctx.fillStyle = C.accent; ctx.lineWidth = Math.max(2, s * 0.04);
    ctx.font = `600 ${Math.max(12, s * 0.2)}px ${MONO}`; ctx.textBaseline = 'middle';
    const tips = d.loads.map(ld => {
      const F = Math.hypot(ld.fx, ld.fy), ux = ld.fx / F, uy = -ld.fy / F, [x0, y0] = nodeXY(r || {}, st.L.id(...ld.node), scale);
      const bx = x0 + ux * s * 0.12, by = y0 + uy * s * 0.12, tx = bx + ux * s * len, ty = by + uy * s * len;
      ctx.beginPath(); ctx.moveTo(bx, by); ctx.lineTo(tx - ux * hl, ty - uy * hl); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(tx, ty);
      ctx.lineTo(tx - ux * hl - uy * hw, ty - uy * hl + ux * hw); ctx.lineTo(tx - ux * hl + uy * hw, ty - uy * hl - ux * hw);
      ctx.closePath(); ctx.fill();
      return [tx, ty];
    });
    if (d.loads.length > 1 && sameLoads(d)) {
      const t = tips[Math.floor(tips.length / 2)];
      ctx.textAlign = 'center'; ctx.fillText(`je F = ${kNtxt(d.loads[0])}`, t[0], t[1] + Math.max(12, s * 0.2) * 0.5 + s * 0.12);
    } else tips.forEach(([tx, ty], i) => { ctx.textAlign = 'left'; ctx.fillText(`F = ${kNtxt(d.loads[i])}`, tx + s * 0.12, ty - s * 0.1); });
    ctx.restore();
  }

  // Gesamtmaße unten und links, in mm
  function drawDims() {
    const d = st.def, s = G.s, a = Math.max(5, s * 0.1), [xd0, yd0] = [G.ox - G.dim[1] * s, G.oy + G.dim[0] * s];
    const x0 = G.ox, x1 = G.ox + d.nx * s, y0 = G.oy, yt = G.oy - d.ny * s;
    const head = (x, y, ux, uy) => {
      ctx.beginPath(); ctx.moveTo(x, y);
      ctx.lineTo(x - ux * a - uy * a * 0.3, y - uy * a + ux * a * 0.3); ctx.lineTo(x - ux * a + uy * a * 0.3, y - uy * a - ux * a * 0.3);
      ctx.closePath(); ctx.fill();
    };
    ctx.save(); ctx.strokeStyle = C.ink2; ctx.fillStyle = C.ink2; ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(x0, y0 + s * 0.1); ctx.lineTo(x0, yd0 + a); ctx.moveTo(x1, y0 + s * 0.1); ctx.lineTo(x1, yd0 + a);
    ctx.moveTo(x0 - s * 0.1, y0); ctx.lineTo(xd0 - a, y0); ctx.moveTo(x0 - s * 0.1, yt); ctx.lineTo(xd0 - a, yt);
    ctx.moveTo(x0, yd0); ctx.lineTo(x1, yd0); ctx.moveTo(xd0, y0); ctx.lineTo(xd0, yt);
    ctx.stroke();
    head(x0, yd0, -1, 0); head(x1, yd0, 1, 0); head(xd0, y0, 0, 1); head(xd0, yt, 0, -1);
    ctx.font = `500 ${Math.max(11, s * 0.19)}px ${MONO}`; ctx.textAlign = 'center'; ctx.textBaseline = 'bottom';
    ctx.fillText(String(d.nx * GRID), (x0 + x1) / 2, yd0 - 3);
    ctx.translate(xd0 - 3, (y0 + yt) / 2); ctx.rotate(-Math.PI / 2); ctx.fillText(String(d.ny * GRID), 0, 0);
    ctx.restore();
  }

  // ---------- Oberfläche ----------
  const editable = () => (st.phase === 'design' || st.phase === 'probe') && !st.busy;

  function failWhy(r) {
    if (r.reason === 'lastpfad') return 'Die Last hat keine Verbindung zum Lager.';
    if (r.reason === 'mechanismus') return r.model === 'truss'
      ? 'Das Fachwerk ist beweglich: Ein Feld ohne Dreieck oder ein Knoten ohne Querstab gibt unter der Last nach (Mechanismus).'
      : 'Das Stabwerk ist beweglich, die Lagerung reicht nicht.';
    const parts = [];
    if (r.nYield) parts.push(r.nYield === 1 ? 'ein Stab fließt' : `${r.nYield} Stäbe fließen`);
    if (r.nBuckle) parts.push(r.nBuckle === 1 ? 'ein Druckstab knickt' : `${r.nBuckle} Druckstäbe knicken`);
    const t = parts.join(', ');
    return `${t[0].toUpperCase() + t.slice(1)}, max. Auslastung ${fmt(100 * r.maxUtil)} %.`;
  }
  const statusText = r => r.ok ? `max. Auslastung ${fmt(100 * r.maxUtil)} %, hält.` : failWhy(r);
  function showFem(r, scale) {
    let t = '';
    if (r.reason === 'mechanismus') t = `${NAME[r.model]}: Steifigkeitsmatrix nur mit den Hilfsfedern regulär, das Stabwerk ist beweglich.`;
    else if (r.disp) t = `${NAME[r.model]}: ${fmt(r.bars)} Stäbe, ${fmt(r.dofs)} Freiheitsgrade, gelöst in ${fmt(r.ms, 1)} ms` +
      (!scale ? '.' : scale >= 1 ? `. Verformung ${fmt(scale, scale % 1 ? 1 : 0)}-fach überhöht.` : '. Verformung verkleinert dargestellt.');
    $('femline').textContent = t;
    $('legend').hidden = !r.disp || r.reason === 'mechanismus';
  }

  function panel() {
    const L = st.L, d = st.def, e = esoNow();
    const conn = st.phase === 'eso' && e ? e.res.conn : st.conn;
    $('tb-name').textContent = d.name;
    $('tb-profile').textContent = FEM.PROFILE;
    $('tb-load').textContent = loadText(d);
    $('tb-size').textContent = `${d.nx} × ${d.ny} m, Raster 1 m`;
    $('tb-bars').textContent = `${count(conn)} von ${L.nB}`;
    $('tb-mass').textContent = `${fmt(kg(FEM.length(L, conn)))} von ${fmt(kg(L.total))} kg`;
    $('tb-removed').textContent = `${fmt(removedPct(conn), 1)} %`;
    $('tb-probe').textContent = st.probes ? `${st.probes} übrig` : 'verbraucht';
    $('tb-sheet').textContent = `${st.li + 1} von ${LEVELS.length}`;
  }

  function controls() {
    const design = st.phase === 'design' || st.phase === 'probe';
    $('act-design').hidden = !design;
    $('act-result').hidden = design;
    for (const b of document.querySelectorAll('.actions .btn')) b.disabled = st.busy;
    if (!st.busy) {
      $('b-probe').disabled = !st.probes || $('live').checked;
      $('b-undo').disabled = !st.undo.length;
      $('b-eso').disabled = !esoNow();
    }
    $('b-probe').textContent = `Probe-Rechnung (${st.probes})`;
    $('b-eso').textContent = st.phase === 'eso' ? 'Mein Ergebnis' : 'Lösung des Algorithmus';
    $('live').disabled = !design || st.busy;
    for (const id of ['t-rect', 't-brush', 't-line']) $(id).disabled = !design || st.busy;
    // im Entwurf: welches Modell gewertet wird; nach dem Abgeben: welches Modell gezeigt wird
    const m = design ? st.model : st.shown;
    $('model-label').textContent = design ? 'Rechnen als' : 'Ansicht';
    $('g-truss').setAttribute('aria-pressed', String(m === 'truss'));
    $('g-frame').setAttribute('aria-pressed', String(m === 'frame'));
    $('g-truss').disabled = $('g-frame').disabled = st.busy;
    cv.classList.toggle('locked', !design);
  }

  // Nach jeder Änderung im Entwurf
  function refresh() {
    st.conn = FEM.attached(st.L, st.on);
    const loose = st.on.some((x, k) => x && !st.conn[k]);
    const hint = loose ? '<p>Rot gestrichelte Stäbe haben keine Verbindung zum Lager und fallen beim Abgeben ab.</p>' : '';
    if ($('live').checked) {
      const r = FEM.analyze(st.L, st.on, st.model);
      st.view = { mode: 'result', res: r, on: st.on, scale: 0 };
      showFem(r, 0);
      $('verdict').innerHTML = `<p>Live als ${NAME[st.model]}: ${statusText(r)}</p>${hint}`;
    } else if (st.phase === 'design') {
      st.view = { mode: 'blind' };
      $('legend').hidden = true;
      $('femline').textContent = '';
      $('verdict').innerHTML = `<p>${st.def.note}</p>${hint}`;
    }
    panel(); controls(); render();
  }

  function loadLevel(i) {
    st.animId++;
    st.li = i; st.def = LEVELS[i]; st.L = FEM.level(st.def);
    st.on = st.L.domain.slice(); st.undo = []; st.probes = 1; st.phase = 'design'; st.busy = false;
    st.drag = null; st.hover = -1;
    $('stamp').hidden = true;
    document.querySelectorAll('#levels button').forEach((b, k) => b.setAttribute('aria-pressed', String(k === i)));
    layout(); refresh(); startEso();
  }

  const pushUndo = () => { st.undo.push(st.on.slice()); if (st.undo.length > 200) st.undo.shift(); };
  function setBars(list, val) {
    const ch = list.filter(k => !st.L.frozen[k] && st.on[k] !== val);
    if (!ch.length) return false;
    for (const k of ch) st.on[k] = val;
    st.phase = 'design';
    return true;
  }
  function undo() {
    if (!st.undo.length || !editable()) return;
    st.on = st.undo.pop(); st.phase = 'design'; refresh();
  }

  function probe() {
    if (!st.probes || !editable()) return;
    st.probes--;
    const r = FEM.analyze(st.L, st.on, st.model);
    st.phase = 'probe';
    st.view = { mode: 'result', res: r, on: st.on, scale: 0 };
    showFem(r, 0);
    $('verdict').innerHTML = `<p>Probe-Rechnung als ${NAME[st.model]}: ${statusText(r)} Die Farben verschwinden, sobald Sie weiterarbeiten.</p>`;
    panel(); controls(); render();
  }

  function play(dur, frame, done) {
    const id = ++st.animId, t0 = performance.now();
    const step = now => {
      if (id !== st.animId) return;
      const t = Math.max(0, now - t0);
      try { frame(Math.min(t, dur)); } catch (e) { console.error(e); }
      if (t < dur) requestAnimationFrame(step); else done();
    };
    requestAnimationFrame(step);
  }

  function stamp(ok) {
    const el = $('stamp');
    if (!el.hidden) return;
    el.textContent = ok ? 'HÄLT' : 'BRUCH';
    el.className = 'stamp ' + (ok ? 'ok' : 'bad') + (st.def.stamp === 'unten' ? ' unten' : '') + (reduce ? '' : ' hit');
    el.hidden = false;
  }

  function submit() {
    if (!editable()) return;
    $('verdict').innerHTML = '<p>Rechnet …</p>';
    st.res = { truss: FEM.analyze(st.L, st.on, 'truss'), frame: FEM.analyze(st.L, st.on, 'frame') };
    st.shown = st.model; st.phase = 'result';
    reveal(st.res[st.model], st.on, true, verdict);
  }

  // Deckt ein Ergebnis auf; full: mit Wisch von links (sonst gleich die Verformung). done läuft nach der Animation.
  function reveal(r, on, full, done) {
    const L = st.L, stress = !!r.disp && r.reason !== 'mechanismus', mech = r.reason === 'mechanismus' && !!r.disp;
    st.busy = true;
    const loose = Uint8Array.from(on, (x, k) => x && !r.conn[k] ? 1 : 0);
    // Was beim Versagen abfällt: versagende Stäbe und alles, was dann nicht mehr am Lager hängt; beim Mechanismus alles Tragende
    let fall = null;
    if (stress && !r.ok) {
      const keep = FEM.attached(L, Uint8Array.from(on, (x, k) => x && r.conn[k] && !(r.util[k] > 1) ? 1 : 0));
      fall = Uint8Array.from(on, (x, k) => r.conn[k] && (!keep[k] || r.util[k] > 1) ? 1 : 0);
    } else if (mech) fall = Uint8Array.from(r.fe);
    let scale = 0;
    if (stress) scale = niceScale(r);
    if (mech) { let m = 0; for (let n = 0; n < L.nN; n++) m = Math.max(m, Math.hypot(r.disp[n * 3], r.disp[n * 3 + 1])); scale = m ? 0.45 * GRID / m : 0; }
    const v = st.view = { mode: 'result', res: r, on, scale, sweep: stress && full ? 0 : 1, defo: 0, t: 0,
      loose: { set: loose, p: 0 }, fall: fall && { set: fall, p: 0 } };
    showFem(r, stress ? scale : 0);
    $('stamp').hidden = true;
    panel(); controls();
    const T1 = stress && full ? 700 : 0, T2 = T1 + (stress || mech ? 1000 : 300), TB = T2 + 300, TE = fall ? TB + 1400 : T2 + 300;
    const finish = () => {
      v.sweep = 1; v.defo = 1; v.loose.p = 1; if (v.fall) v.fall.p = 1;
      st.busy = false; stamp(r.ok); done(r); controls(); render();
    };
    if (reduce) return finish();
    play(TE, t => {
      v.t = t;
      v.loose.p = clamp01(t / 900);
      if (stress) {
        v.sweep = T1 ? clamp01(t / T1) : 1;
        const d = (t - T1) / (T2 - T1);
        v.defo = d <= 0 ? 0 : d >= 1 ? 1 : 1 - Math.exp(-4 * d) * Math.cos(9 * d);   // gedämpftes Einschwingen
      } else if (mech) v.defo = clamp01(t / T2) ** 2;   // der Mechanismus gibt nach
      if (t >= T2 - 150) stamp(r.ok);
      if (v.fall) v.fall.p = clamp01((t - TB) / 1300);
      render();
    }, finish);
  }

  // Ergebnis: Wertung im gewählten Modell, dazu das andere Modell und der Algorithmus
  function verdict() {
    const m = st.model, r = st.res[m], o = st.res[other(m)], rem = removedPct(r.conn), e = st.eso[esoKey()];
    let h = r.ok
      ? `<p><span class="t-ok">Hält als ${NAME[m]}.</span> Max. Auslastung ${fmt(100 * r.maxUtil)} %. Sie haben ${fmt(rem, 1)} % der Masse eingespart, ${fmt(kg(FEM.length(st.L, r.conn)))} statt ${fmt(kg(st.L.total))} kg.</p>`
      : `<p><span class="t-bad">Versagt als ${NAME[m]}.</span> ${failWhy(r)} Gewertet: 0 %.</p>`;
    h += `<p>Als ${NAME[other(m)]} gerechnet: ${o.ok ? `<span class="t-ok">hält</span>, max. Auslastung ${fmt(100 * o.maxUtil)} %.` : `<span class="t-bad">versagt.</span> ${failWhy(o)}`}` +
      ` Oben bei „Ansicht“ schalten Sie zwischen beiden um.</p>`;
    if (!e) h += '<p>Der Algorithmus rechnet noch …</p>';
    else if (e.res.ok) {
      const er = removedPct(e.res.conn);
      let cmp = '';
      if (r.ok) cmp = rem > er + 1e-9 ? 'Algorithmus geschlagen!' : rem > er - 1e-9 ? 'Gleichstand mit dem Algorithmus.' : er - rem <= 5 ? 'Knapp dran.' : 'Da geht noch was.';
      h += `<p>Algorithmus (ESO, als ${NAME[m]}): ${fmt(er, 1)} % eingespart, max. Auslastung ${fmt(100 * e.res.maxUtil)} %. ${cmp}</p>`;
    }
    $('verdict').innerHTML = h;
  }

  // Umschalten des Modells: im Entwurf das gewertete Modell, nach dem Abgeben nur die Ansicht
  function setModel(m) {
    if (st.busy) return;
    if (st.phase === 'design' || st.phase === 'probe') {
      if (m === st.model) return;
      st.model = m; store.set('model', m);
      if (st.phase === 'probe') st.phase = 'design';
      refresh(); startEso();
      return;
    }
    if (m === st.shown) return;
    st.shown = m;
    if (st.phase === 'eso') return showEso();
    reveal(st.res[m], st.on, false, () => verdict());
  }

  // ---------- Algorithmus ----------
  const esoKey = () => st.li + '-' + st.model;
  const esoNow = () => st.eso[esoKey()];
  function showEso() {
    const e = esoNow(), m = st.shown;
    e.inModel = e.inModel || {};
    const r = e.inModel[m] = e.inModel[m] || FEM.analyze(st.L, e.on, m);
    reveal(r, e.on, false, () => {
      const er = removedPct(e.res.conn);
      $('verdict').innerHTML = `<p>Lösung der Evolutionären Strukturoptimierung, optimiert als ${NAME[st.model]}: ${fmt(er, 1)} % eingespart, ` +
        `${e.order.length} Stäbe entfernt.</p><p>Als ${NAME[m]} gerechnet: ${r.ok ? `<span class="t-ok">hält</span>, max. Auslastung ${fmt(100 * r.maxUtil)} %.` : `<span class="t-bad">versagt.</span> ${failWhy(r)}`}</p>`;
    });
  }
  function toggleEso() {
    if (!esoNow() || st.busy) return;
    if (st.phase === 'eso') {
      st.phase = 'result';
      reveal(st.res[st.shown], st.on, false, verdict);
    } else {
      st.phase = 'eso';
      showEso();
    }
  }
  // ESO läuft im Hintergrund in kleinen Zeitscheiben, damit das Zeichnen flüssig bleibt
  function startEso() {
    const key = esoKey();
    if (st.eso[key] || (st.esoRun && st.esoRun.key === key)) return;
    const gen = FEM.eso(st.L, st.model), run = st.esoRun = { key };
    const pump = () => {
      if (st.esoRun !== run) return;
      const t0 = performance.now();
      let s;
      do s = gen.next(); while (!s.done && performance.now() - t0 < 12);
      if (!s.done) return void setTimeout(pump, 0);
      st.eso[key] = s.value; st.esoRun = null;
      if (esoKey() === key && st.phase === 'result' && !st.busy) verdict();
      controls();
    };
    setTimeout(pump, 300);
  }

  // ---------- Eingabe ----------
  // Rechteck: aufziehen, beim Loslassen wechseln alle Stäbe, deren Mitte darin liegt; Antippen wechselt einen Stab.
  // Pinsel: jeder überstrichene Stab. Linie: von Knoten zu Knoten, auf 0°, 45°, 90° und 135° gerastet.
  // Wer auf einem fehlenden Stab beginnt, setzt Stäbe ein, sonst wird entfernt.
  const gridPt = e => { const b = cv.getBoundingClientRect(); return [(e.clientX - b.left - G.ox) / G.s, (G.oy - e.clientY + b.top) / G.s]; };
  function barNear([x, y], tol) {
    let best = -1, bd = tol;
    st.L.bars.forEach((b, k) => {
      const [x0, y0] = b.p, dx = b.q[0] - x0, dy = b.q[1] - y0, t = clamp01(((x - x0) * dx + (y - y0) * dy) / (dx * dx + dy * dy));
      const dd = Math.hypot(x - x0 - t * dx, y - y0 - t * dy);
      if (dd < bd) { bd = dd; best = k; }
    });
    return best;
  }
  const tol = e => e.pointerType === 'touch' ? 0.3 : 0.2;
  const isClick = d => Math.hypot(d.p1[0] - d.p0[0], d.p1[1] - d.p0[1]) < 0.15;
  function rectBars(d) {
    const x0 = Math.min(d.p0[0], d.p1[0]), x1 = Math.max(d.p0[0], d.p1[0]), y0 = Math.min(d.p0[1], d.p1[1]), y1 = Math.max(d.p0[1], d.p1[1]);
    if (isClick(d)) return d.k >= 0 && !st.L.frozen[d.k] && st.on[d.k] !== d.paint ? [d.k] : [];
    const out = [];
    for (let k = 0; k < st.L.nB; k++) {
      const [mx, my] = mid(k);
      if (mx >= x0 && mx <= x1 && my >= y0 && my <= y1 && !st.L.frozen[k] && st.on[k] !== d.paint) out.push(k);
    }
    return out;
  }
  // Linie: Startknoten a, Endknoten b und die Stäbe dazwischen, die sich ändern
  function lineBars(d) {
    const a = [Math.round(d.p0[0]), Math.round(d.p0[1])], dx = d.p1[0] - a[0], dy = d.p1[1] - a[1];
    const o = Math.round(Math.atan2(dy, dx) / (Math.PI / 4)), u = [Math.round(Math.cos(o * Math.PI / 4)), Math.round(Math.sin(o * Math.PI / 4))];
    let n = Math.max(0, Math.round(u[0] && u[1] ? (Math.abs(dx) + Math.abs(dy)) / 2 : Math.abs(u[0] ? dx : dy)));
    const inside = ([i, j]) => i >= 0 && j >= 0 && i <= st.def.nx && j <= st.def.ny;
    while (n > 0 && !inside([a[0] + u[0] * n, a[1] + u[1] * n])) n--;
    const all = [];
    for (let t = 0; t < n; t++) {
      const k = st.L.barAt(a[0] + u[0] * t, a[1] + u[1] * t, a[0] + u[0] * (t + 1), a[1] + u[1] * (t + 1));
      if (k >= 0) all.push(k);
    }
    if (d.paint == null && all.length) d.paint = st.on[all[0]] ? 0 : 1;
    return { a, b: [a[0] + u[0] * n, a[1] + u[1] * n], bars: all.filter(k => !st.L.frozen[k] && st.on[k] !== d.paint) };
  }
  const lockedMsg = () => { $('verdict').innerHTML = '<p>Dieser Stab ist gesperrt: Er gehört zur Fahrbahn und bleibt.</p>'; };

  cv.addEventListener('pointerdown', e => {
    if (!editable() || !G) return;
    const p = gridPt(e), k = barNear(p, tol(e));
    e.preventDefault();
    cv.setPointerCapture(e.pointerId);
    if (st.tool === 'line') { st.drag = { kind: 'line', p0: p, p1: p, paint: null }; render(); return; }
    const paint = k >= 0 && !st.on[k] ? 1 : 0;
    if (st.tool === 'rect') { st.drag = { kind: 'rect', p0: p, p1: p, k, paint }; render(); return; }
    pushUndo();
    st.drag = { kind: 'brush', last: p, paint, changed: false, tol: tol(e) };
    if (k >= 0) { if (st.L.frozen[k]) lockedMsg(); else st.drag.changed = setBars([k], paint); }
    if (st.drag.changed) refresh();
  });
  cv.addEventListener('pointermove', e => {
    if (!G) return;
    const p = gridPt(e), d = st.drag;
    if (!d) {
      if (e.pointerType === 'mouse' && editable()) { const k = barNear(p, 0.2); if (k !== st.hover) { st.hover = k; render(); } }
      return;
    }
    if (d.kind === 'brush') {   // Zwischenpunkte, damit schnelle Striche keine Stäbe überspringen
      const [x0, y0] = d.last, n = Math.ceil(Math.hypot(p[0] - x0, p[1] - y0) / 0.1) || 1, hit = new Set();
      for (let i = 1; i <= n; i++) { const k = barNear([x0 + (p[0] - x0) * i / n, y0 + (p[1] - y0) * i / n], d.tol); if (k >= 0) hit.add(k); }
      d.last = p;
      if (setBars([...hit], d.paint)) { d.changed = true; refresh(); }
      return;
    }
    d.p1 = p; render();
  });
  cv.addEventListener('pointerup', () => {
    const d = st.drag;
    st.drag = null;
    if (!d) return;
    if (d.kind === 'brush') { if (!d.changed) st.undo.pop(); return; }
    const list = d.kind === 'rect' ? rectBars(d) : lineBars(d).bars;
    if (d.kind === 'rect' && isClick(d) && d.k >= 0 && st.L.frozen[d.k]) lockedMsg();
    if (!list.length) return render();
    pushUndo(); setBars(list, d.paint); refresh();
  });
  cv.addEventListener('pointercancel', () => { if (st.drag && st.drag.kind === 'brush' && !st.drag.changed) st.undo.pop(); st.drag = null; render(); });
  cv.addEventListener('pointerleave', () => { if (st.hover >= 0) { st.hover = -1; render(); } });
  addEventListener('keydown', e => {
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'z') { e.preventDefault(); undo(); return; }
    if (e.metaKey || e.ctrlKey || e.altKey || /^(INPUT|SELECT|TEXTAREA)$/.test(e.target.tagName)) return;
    const tool = { r: 'rect', p: 'brush', l: 'line' }[e.key.toLowerCase()];
    if (tool) setTool(tool);
  });

  const setTool = t => {
    st.tool = t;
    $('t-rect').setAttribute('aria-pressed', String(t === 'rect'));
    $('t-brush').setAttribute('aria-pressed', String(t === 'brush'));
    $('t-line').setAttribute('aria-pressed', String(t === 'line'));
  };
  $('t-rect').onclick = () => setTool('rect');
  $('t-brush').onclick = () => setTool('brush');
  $('t-line').onclick = () => setTool('line');
  $('g-truss').onclick = () => setModel('truss');
  $('g-frame').onclick = () => setModel('frame');
  $('b-submit').onclick = submit;
  $('b-probe').onclick = probe;
  $('b-undo').onclick = undo;
  $('b-reset').onclick = () => {
    if (!editable() || st.on.every(x => x)) return;
    pushUndo(); st.on = st.L.domain.slice(); st.phase = 'design'; refresh();
  };
  $('b-clear').onclick = () => {
    if (!editable()) return;
    const empty = Uint8Array.from(st.L.frozen);
    if (st.on.every((x, k) => x === empty[k])) return;
    pushUndo(); st.on = empty; st.phase = 'design'; refresh();
  };
  $('b-retry').onclick = () => {
    if (st.busy) return;
    st.animId++; st.on = st.L.domain.slice(); st.undo = []; st.probes = 1; st.phase = 'design';
    $('stamp').hidden = true; refresh();
  };
  $('b-eso').onclick = toggleEso;
  $('b-next').onclick = () => { if (!st.busy) loadLevel((st.li + 1) % LEVELS.length); };
  $('live').onchange = () => { if (editable()) { st.phase = 'design'; refresh(); } };

  $('levels').innerHTML = LEVELS.map((d, i) => `<button type="button" data-i="${i}">${i + 1} ${d.name}</button>`).join('');
  $('levels').onclick = e => { const b = e.target.closest('button'); if (b && !st.busy) loadLevel(+b.dataset.i); };

  $('legend').innerHTML = '<span class="lg-t">Auslastung je Stab in %</span><ol>' +
    BANDS.map((c, b) => `<li><i style="background:${c}"></i><span>${b % 2 ? '' : fmt(10 * b)}</span></li>`).join('') +
    `<li><i style="background:${OVER}"></i><span>100</span></li></ol><span>über 100 % fließt der Stab oder knickt</span>`;

  const repaint = () => { readColors(); render(); };
  matchMedia('(prefers-color-scheme: dark)').addEventListener('change', repaint);
  new MutationObserver(repaint).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
  new ResizeObserver(() => { if (wrap.clientWidth && (!G || Math.abs(wrap.clientWidth - G.W) > 1)) { layout(); render(); } }).observe(wrap);
  addEventListener('resize', () => { layout(); render(); });
  if (document.fonts) document.fonts.ready.then(render);

  readColors();
  loadLevel(0);
})();
