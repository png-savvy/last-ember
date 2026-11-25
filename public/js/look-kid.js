// Last Ember - graphics style "A child drew this". The youngest survivor is drawing what happens, in wax crayon on a
// page of lined paper: stick people seen from the side (she does not know about top-down), a house-shaped camp, a sun.
// She redraws the page every dawn, and the drawings get darker: tally marks for the nights, words, black scribble.
(function (root) {
  'use strict';
  const R = root.Renderer;
  if (!R) return;
  const GD = root.GD, { CELL, W, H } = GD, FIRE = root.SIM.FIRE, TAU = Math.PI * 2;
  const hash = (a, b) => { let n = (a * 374761393 + b * 668265263) | 0; n = (n ^ (n >>> 13)) * 1274126177 | 0; return ((n ^ (n >>> 16)) >>> 0) / 4294967296; };
  const mk = (w, h) => { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; };
  const shape = (t) => (R.SHAPES && (R.SHAPES[t] || R.SHAPES.walker)) || { w: 0.95, l: 0.7, h: 0.5, arm: 1.35 };
  const CRAY = ['#3f9a3a', '#7a4fb0', '#e07a1a', '#5a6a78', '#c8408a', '#2a8a8a', '#8a6a2a', '#4a5ad0'];
  const crayonOf = (type) => CRAY[(type.length * 7 + type.charCodeAt(0) + type.charCodeAt(type.length - 1)) % CRAY.length];
  // wax crayon: the same line gone over twice, never in quite the same place, a little see-through
  function wax(c, col, lw, path, seed) {
    c.strokeStyle = col; c.lineCap = 'round'; c.lineJoin = 'round';
    for (let k = 0; k < 2; k++) { c.globalAlpha *= k ? 0.6 : 0.9; c.lineWidth = lw * (k ? 0.6 : 1); c.save(); c.translate((hash(seed, k) - 0.5) * 2.2, (hash(seed, k + 3) - 0.5) * 2.2); c.beginPath(); path(); c.stroke(); c.restore(); }
  }
  // colouring in: back-and-forth strokes that do not stay inside the lines
  function scribble(c, col, x, y, w, h, n, seed, lw) {
    c.strokeStyle = col; c.lineWidth = lw || 2.6; c.lineCap = 'round'; c.beginPath();
    for (let k = 0; k <= n; k++) { const t = k / n, px = x + t * w + (hash(seed, k) - 0.5) * 3; k ? c.lineTo(px, k % 2 ? y - 1.5 : y + h + 1.5) : c.moveTo(px, y); }
    c.stroke();
  }
  const look = {
    fxInk: '208,28,20', fxOver: true,
    // what flies off is not blood. It is drawings: teardrops she has outlined, little stars, zigzags, tumbling as they go
    fleck(R_, c, p, bile) {
      const kind = ((p.size * 97) | 0) % 3, t = Math.max(0, p.life / p.max), a = Math.atan2(p.vy, p.vx), s = 3 + p.size * 1.6, col = bile ? '#7a9a1a' : kind === 1 ? '#f07a1a' : '#d01c14';
      c.save(); c.translate(p.x, p.y); c.rotate(kind === 0 ? a : a + (1 - t) * 9); c.globalAlpha = 0.95; c.strokeStyle = col; c.lineWidth = 1.8; c.lineCap = 'round'; c.lineJoin = 'round'; c.beginPath();
      if (kind === 0) { c.moveTo(s * 1.4, 0); c.quadraticCurveTo(-s * 0.2, -s, -s, 0); c.quadraticCurveTo(-s * 0.2, s, s * 1.4, 0); }                 // a drop, outlined
      else if (kind === 1) { for (let i = 0; i <= 10; i++) { const q = i / 10 * TAU, d = i % 2 ? s * 0.5 : s * 1.2; c.lineTo(Math.cos(q) * d, Math.sin(q) * d); } }      // a star
      else { c.moveTo(-s, -s * 0.5); c.lineTo(-s * 0.3, s * 0.5); c.lineTo(s * 0.3, -s * 0.5); c.lineTo(s, s * 0.5); }                                  // a zigzag
      c.stroke(); c.restore(); c.globalAlpha = 1;
    },
    // the dead, as she draws them: a stick person lying down with X eyes and its tongue out, scribbled over
    body(R_, d, e, r, torn) {
      const col = crayonOf(e.ztype || 'walker'), s = r * 1.0;
      d.globalAlpha = 0.9;
      wax(d, col, Math.max(2.4, r * 0.22), () => {
        if (torn) { d.moveTo(-s * 1.2, -s * 0.9); d.lineTo(-s * 0.4, -s * 1.4); d.moveTo(s * 0.9, s * 1.0); d.lineTo(s * 1.7, s * 0.6); d.moveTo(-s * 1.5, s * 0.8); d.lineTo(-s * 0.8, s * 1.3); d.moveTo(-s * 0.4, 0); d.lineTo(s * 0.3, 0.1 * s); }      // in bits
        else { d.moveTo(-s * 1.2, 0); d.lineTo(s * 0.5, 0); d.moveTo(-s * 1.2, 0); d.lineTo(-s * 2.0, -s * 0.6); d.moveTo(-s * 1.2, 0); d.lineTo(-s * 2.0, s * 0.6); d.moveTo(-s * 0.1, 0); d.lineTo(-s * 0.5, -s * 0.9); d.moveTo(-s * 0.1, 0); d.lineTo(-s * 0.5, s * 0.9); }
        const hx = torn ? s * 1.6 : s * 1.0, hy = torn ? -s * 1.1 : 0; d.moveTo(hx + s * 0.5, hy); d.arc(hx, hy, s * 0.5, 0, TAU);
      }, (e.x * 3 + e.y) | 0);
      const hx = torn ? s * 1.6 : s * 1.0, hy = torn ? -s * 1.1 : 0, q = s * 0.14;
      d.globalAlpha = 0.9; wax(d, '#151515', 1.5, () => { for (const o of [-0.2, 0.2]) { d.moveTo(hx - q, hy + o * s - q); d.lineTo(hx + q, hy + o * s + q); d.moveTo(hx + q, hy + o * s - q); d.lineTo(hx - q, hy + o * s + q); } }, 3);
      d.globalAlpha = 0.9; wax(d, '#e0507a', 2, () => { d.moveTo(hx + s * 0.3, hy); d.lineTo(hx + s * 0.75, hy + s * 0.1); }, 5);              // tongue
      d.globalAlpha = 1;
    },
    // blood: red crayon, pressed hard. A scribble where it happened; a kill gets crossed out, and sometimes she writes a word.
    splat(R_, d, x, y, r, bile, alpha, ang) {
      const rnd = (a, b) => a + Math.random() * (b - a), col = bile ? '#7a9a1a' : '#d01c14', w = r * rnd(1.6, 2.4), h = r * rnd(0.9, 1.4), rot = ang === undefined ? rnd(-0.5, 0.5) : ang;
      d.save(); d.translate(x, y); d.rotate(rot);
      for (let k = 0; k < 2; k++) { d.globalAlpha = Math.min(1, alpha * (k ? 0.5 : 0.85)); scribble(d, col, -w / 2 + k * 2, -h / 2, w, h, Math.max(3, Math.round(w / 2.6)), (x * 7 + y * 3 + k) | 0, 2.2 + r * 0.06); }
      d.restore();
      // drawn drops landing all round: outlines only, she has not coloured them in
      d.strokeStyle = col; d.lineWidth = 1.7; d.lineCap = 'round';
      for (let i = 0, n = 2 + Math.round(r / 4); i < n; i++) { const a = ang === undefined ? rnd(0, TAU) : ang + rnd(-0.8, 0.8), dist = r * rnd(1.2, 3), px = x + Math.cos(a) * dist, py = y + Math.sin(a) * dist, s2 = rnd(2.5, 5); d.globalAlpha = 0.85; d.beginPath(); d.moveTo(px + Math.cos(a) * s2 * 1.5, py + Math.sin(a) * s2 * 1.5); d.quadraticCurveTo(px - Math.sin(a) * s2, py + Math.cos(a) * s2, px - Math.cos(a) * s2, py - Math.sin(a) * s2); d.quadraticCurveTo(px + Math.sin(a) * s2, py - Math.cos(a) * s2, px + Math.cos(a) * s2 * 1.5, py + Math.sin(a) * s2 * 1.5); d.stroke(); }
      if (r > 11) {
        // a kill is a comic-book POW: a spiky burst with lines flying out of it
        d.globalAlpha = 0.45; scribble(d, '#f2c21a', x - r * 0.9, y - r * 0.6, r * 1.8, r * 1.2, Math.round(r * 0.7), (x + y) | 0, 3);
        d.globalAlpha = 0.9; d.strokeStyle = bile ? col : '#f07a1a'; d.lineWidth = 2.4; d.lineJoin = 'round'; d.beginPath(); for (let i = 0; i <= 14; i++) { const q = i / 14 * TAU, dd = r * (i % 2 ? 1.0 : 1.9) * rnd(0.85, 1.15); i ? d.lineTo(x + Math.cos(q) * dd, y + Math.sin(q) * dd) : d.moveTo(x + Math.cos(q) * dd, y + Math.sin(q) * dd); } d.closePath(); d.stroke();
        d.strokeStyle = '#151515'; d.lineWidth = 1.6; d.beginPath(); for (let i = 0; i < 9; i++) { const q = rnd(0, TAU); d.moveTo(x + Math.cos(q) * r * 2.2, y + Math.sin(q) * r * 2.2); d.lineTo(x + Math.cos(q) * r * rnd(2.8, 3.6), y + Math.sin(q) * r * rnd(2.8, 3.6)); } d.stroke();
        d.globalAlpha = 0.85; d.strokeStyle = '#151515'; d.lineWidth = 2.6; d.lineCap = 'round'; const s = r * 0.9;
        d.beginPath(); d.moveTo(x - s, y - s); d.lineTo(x + s + rnd(-2, 2), y + s); d.moveTo(x + s, y - s); d.lineTo(x - s + rnd(-2, 2), y + s); d.stroke();
        if (Math.random() < 0.4) { d.fillStyle = col; d.font = '700 ' + Math.round(13 + r * 0.3) + 'px "Comic Sans MS", "Chalkboard SE", cursive'; d.textAlign = 'center'; d.save(); d.translate(x, y - r * 1.5); d.rotate(rnd(-0.25, 0.25)); d.fillText(['POW', 'got it', 'dead', 'BANG', 'no more', 'go away', 'splat'][(Math.random() * 7) | 0], 0, 0); d.restore(); }
      }
    },
    dark: '20,18,44', darkK: 0.95, eye: '#fff07a', hudPlate: true, corpse: '#6a6a70',
    hudFont: '"Comic Sans MS", "Chalkboard SE", "Segoe Print", cursive', titleFont: '700 PXpx "Comic Sans MS", "Chalkboard SE", "Segoe Print", cursive',
    blood: ['#d01c14', '#c01610', '#e02a1e', '#b81410', '#d8241a', '#c81a12'], bile: ['#7a9a1a', '#6a8a14', '#8aaa24', '#5e7c10'],
    // she draws the page again each morning
    event(R_, e, sim) {
      const n = e.type === 'dawn' ? (e.night || 1) - 1 : e.type === 'nightStart' ? (e.night || 1) - 1 : e.type === 'loaded' ? (e.night || 1) - 1 : -1;
      if (n < 0 || n === R_.kidNight) return;
      R_.kidNight = n; R_.groundImg = null; R_.paintGround(); R_.bakeGround();
    },
    reset(R_) { if (R_.kidNight) { R_.kidNight = 0; R_.groundImg = null; R_.paintGround(); R_.bakeGround(); } },
    ground(R_, g) {
      const rnd = (a, b) => a + Math.random() * (b - a), n = R_.kidNight || 0, fear = Math.min(1, n / 18);
      g.fillStyle = '#fbf8ee'; g.fillRect(0, 0, W, H);
      g.strokeStyle = 'rgba(86,138,216,0.42)'; g.lineWidth = 1.2; g.beginPath(); for (let y = CELL; y < H; y += CELL) { g.moveTo(0, y); g.lineTo(W, y); } g.stroke();       // ruled lines, one per build row
      g.strokeStyle = 'rgba(224,70,70,0.5)'; g.lineWidth = 1.6; g.beginPath(); g.moveTo(CELL * 2, 0); g.lineTo(CELL * 2, H); g.stroke();
      for (const y of [150, 540, 930]) { g.fillStyle = '#e9e4d6'; g.beginPath(); g.arc(34, y, 11, 0, TAU); g.fill(); g.strokeStyle = 'rgba(0,0,0,0.12)'; g.stroke(); }          // punched holes
      g.lineCap = 'round';
      for (let i = 0; i < 260; i++) {                           // grass, coloured in where she had the patience
        const x = rnd(90, W - 20), y = rnd(20, H - 20); if (Math.hypot(x - FIRE.x, y - FIRE.y) < 230) continue;
        g.globalAlpha = rnd(0.25, 0.5) * (1 - fear * 0.5); { const w = rnd(30, 80); scribble(g, Math.random() < 0.5 ? '#4aa63e' : '#6cbc4a', x, y, w, rnd(9, 18), Math.round(w / 3.4), i, 2.8); }
      }
      g.globalAlpha = 0.5; for (let i = 0; i < 40; i++) { const w = rnd(46, 90); scribble(g, '#c89a5a', FIRE.x - 190 + rnd(0, 330), FIRE.y - 150 + rnd(0, 280), w, rnd(9, 15), Math.round(w / 3.6), i + 500, 3); }    // the yard
      g.globalAlpha = 1;
      const tree = (x, y, s) => { g.globalAlpha = 0.9; wax(g, '#7a4a20', 5, () => { g.moveTo(x, y + 26); g.lineTo(x + 1, y - 4); }, s); g.globalAlpha = 0.75; for (let k = 0; k < 3; k++) wax(g, fear > 0.6 && k === 2 ? '#1a1a1a' : '#2f8a34', 4, () => { for (let q = 0; q < 16; q++) { const a = q * 0.9 + k, d = 8 + q * 0.9; g.lineTo(x + Math.cos(a) * d, y - 12 + Math.sin(a) * d); } }, s + k * 9); g.globalAlpha = 1; };
      let t = 0; for (let x = 130; x < W - 30; x += rnd(70, 110)) { tree(x, rnd(8, 22), t++); tree(x, H - rnd(34, 46), t++); } for (let y = 110; y < H - 90; y += rnd(80, 120)) { tree(rnd(98, 112), y, t++); tree(W - rnd(22, 34), y, t++); }
      // the sun: a yellow circle with rays... crossed out harder every night
      g.globalAlpha = 0.9; wax(g, '#f2c21a', 6, () => { g.arc(W - 130, 110, 34, 0, TAU); }, 1); wax(g, '#f2c21a', 4, () => { for (let k = 0; k < 10; k++) { const a = k / 10 * TAU; g.moveTo(W - 130 + Math.cos(a) * 44, 110 + Math.sin(a) * 44); g.lineTo(W - 130 + Math.cos(a) * 64, 110 + Math.sin(a) * 64); } }, 2);
      g.globalAlpha = 0.85; for (let k = 0; k < Math.min(9, n); k++) scribble(g, '#151515', W - 190 + (k % 3) * 8, 60 + k * 9, 120, 12, 9, k + 60, 3.4);
      // what she writes
      g.globalAlpha = 0.9; g.fillStyle = '#2a3a8a'; g.font = '700 34px "Comic Sans MS", "Chalkboard SE", "Segoe Print", cursive'; g.textAlign = 'left';
      g.save(); g.translate(130, 196); g.rotate(-0.03); g.fillText(n < 3 ? 'our camp' : n < 8 ? 'our camp.  they come at nite' : n < 14 ? 'dont let the fire go out' : 'THEY DONT STOP', 0, 0); g.restore();
      g.strokeStyle = '#2a3a8a'; g.lineWidth = 3.4; g.beginPath(); for (let k = 0; k < Math.min(40, n); k++) { const x = 134 + k * 13 + Math.floor(k / 5) * 12, y = 224; if (k % 5 === 4) { g.moveTo(x - 56, y + 26); g.lineTo(x - 2, y + 2); } else { g.moveTo(x, y); g.lineTo(x + rnd(-2, 2), y + 28); } } g.stroke();      // one mark for every night she has counted
      if (n >= 5) { g.fillStyle = '#d01c14'; g.font = '700 26px "Comic Sans MS", "Chalkboard SE", cursive'; g.save(); g.translate(FIRE.x + 90, FIRE.y - 170); g.rotate(0.05); g.fillText('fire = safe', 0, 0); g.restore(); }
      g.globalAlpha = 0.5 + fear * 0.4; for (let i = 0, m = Math.round(fear * 70); i < m; i++) { const e = (rnd(0, 4)) | 0, x = e === 0 ? rnd(86, 150) : e === 1 ? rnd(W - 90, W - 10) : rnd(90, W), y = e === 2 ? rnd(0, 46) : e === 3 ? rnd(H - 50, H - 4) : rnd(0, H); scribble(g, '#151515', x, y, rnd(30, 90), rnd(10, 22), 10, i + 900, 3.6); }       // the dark closing in round the edges
      g.globalAlpha = 1;
    },
    // the dead: stick people in one crayon each, arms out in front, crosses for eyes
    zombie(R_, c, z) {
      const za = z.vis === undefined ? 1 : z.vis;
      if (z.burrowed) { R_.drawBurrow(c, z); return; }
      const S = shape(z.type), r = z.r, air = z.air || 0, col = z.hitT > 0 ? '#d01c14' : z.burn > 0 ? '#e07a1a' : crayonOf(z.type);
      const boil = (z.id * 13 + Math.floor(R_.time * 6)) | 0, dir = Math.cos(z.ang || 0) >= 0 ? 1 : -1, wob = Math.sin(z.wob || 0), lunge = Math.max(0, z.lunge || 0), s = r * (1 + air * 0.35);
      c.save(); c.translate(z.x, z.y - air * 16); c.scale(dir, 1);
      if (z.champ) { c.globalAlpha = za; wax(c, '#f2c21a', 3, () => { c.moveTo(-s * 0.6, -s * 2.3); c.lineTo(-s * 0.5, -s * 2.9); c.lineTo(-s * 0.15, -s * 2.5); c.lineTo(0.1 * s, -s * 3.0); c.lineTo(s * 0.4, -s * 2.5); c.lineTo(s * 0.7, -s * 2.9); c.lineTo(s * 0.7, -s * 2.3); }, boil); }      // a crown
      if (z.chill > 0) { c.globalAlpha = za * 0.5; scribble(c, '#6ab8f0', -s, -s * 1.6, s * 2, s * 2.6, 7, z.id, 3); }
      if (z.raised) { c.globalAlpha = za * 0.4; scribble(c, '#9a60d0', -s, -s * 1.6, s * 2, s * 2.6, 6, z.id + 3, 3); }
      c.globalAlpha = za;
      const lw = Math.max(2.4, r * (S.armW ? 0.36 : 0.22));
      if (S.seg) { wax(c, col, lw, () => { c.arc(0, 0, s * 0.9, 0, TAU); c.moveTo(-s * 0.5, s * 0.8); c.lineTo(-s * 0.7, s * 1.5); c.moveTo(s * 0.5, s * 0.8); c.lineTo(s * 0.7, s * 1.5); if (S.head) { c.moveTo(s * 0.3, -s * 0.9); c.lineTo(s * 0.8, -s * 1.7); c.moveTo(-s * 0.1, -s * 0.9); c.lineTo(s * 0.1, -s * 1.8); } }, boil); if (S.head) { c.fillStyle = '#151515'; c.beginPath(); c.arc(s * 0.3, -s * 0.15, 2.4, 0, TAU); c.arc(-s * 0.3, -s * 0.15, 2.4, 0, TAU); c.fill(); wax(c, '#151515', 2, () => { c.moveTo(-s * 0.4, s * 0.3); c.lineTo(-s * 0.15, s * 0.5); c.lineTo(s * 0.1, s * 0.3); c.lineTo(s * 0.35, s * 0.5); }, boil + 2); } c.restore(); c.globalAlpha = 1; return; }
      if (S.mark === 'wings') { wax(c, '#5a6a78', 2, () => { const f = Math.sin(R_.time * 40 + z.id) > 0 ? 1 : 0.4; c.moveTo(0, 0); c.quadraticCurveTo(-s * 1.4, -s * 2.4 * f, -s * 2, -s * 0.4); c.moveTo(0, 0); c.quadraticCurveTo(s * 1.4, -s * 2.4 * f, s * 2, -s * 0.4); }, boil); wax(c, col, lw + 1, () => { c.arc(0, 0, s * 0.6, 0, TAU); }, boil + 1); c.restore(); c.globalAlpha = 1; return; }
      const lying = S.mark === 'crawl', hy = lying ? -s * 0.2 : -s * 1.55, hx = lying ? s * 1.0 : s * 0.1, hr = s * Math.max(0.42, S.h * 0.95), step = wob * s * 0.35;
      wax(c, col, lw, () => {
        if (lying) { c.moveTo(-s * 0.9, 0); c.lineTo(s * 0.6, 0); c.moveTo(s * 0.4, 0); c.lineTo(s * (1.5 + lunge * 0.4 + wob * 0.2), s * 0.45); c.moveTo(s * 0.4, 0); c.lineTo(s * (1.4 - wob * 0.2), -s * 0.5); }
        else {
          c.moveTo(0, -s * 1.1); c.lineTo(0, s * 0.25);                                                         // body
          c.moveTo(0, s * 0.25); c.lineTo(-s * 0.45 + step, s * 1.25); c.moveTo(0, s * 0.25); c.lineTo(s * 0.45 - step, s * 1.25);      // legs
          c.moveTo(0, -s * 0.75); c.lineTo(s * (1.05 + lunge * 0.4), -s * (0.85 + wob * 0.12)); c.moveTo(0, -s * 0.55); c.lineTo(s * (0.95 + lunge * 0.4), -s * (0.45 - wob * 0.12));   // both arms out in front
          if (S.mark === 'belly' || S.mark === 'eggs' || S.armW) { c.moveTo(s * 0.62, -s * 0.35); c.arc(0, -s * 0.35, s * 0.62, 0, TAU); }                 // a big tummy for the fat ones
          if (S.mark === 'robe') { c.moveTo(0, -s * 1.0); c.lineTo(-s * 0.8, s * 1.2); c.lineTo(s * 0.7, s * 1.2); c.closePath(); }
          if (S.mark === 'streak' || S.mark === 'legs') { for (let k = 0; k < 3; k++) { c.moveTo(-s * 0.5, -s * (0.9 - k * 0.5)); c.lineTo(-s * 1.4, -s * (0.9 - k * 0.5)); } }                   // whoosh lines: this one is fast
        }
        c.moveTo(hx + hr, hy); c.arc(hx, hy, hr, 0, TAU);
        if (S.mark === 'horns' || S.mark === 'spikes') { c.moveTo(hx - hr * 0.6, hy - hr * 0.8); c.lineTo(hx - hr * 0.9, hy - hr * 1.9); c.moveTo(hx + hr * 0.6, hy - hr * 0.8); c.lineTo(hx + hr * 0.9, hy - hr * 1.9); }
      }, boil);
      if (S.mark === 'plates') { c.globalAlpha = za * 0.8; scribble(c, '#5a6a78', -s * 0.5, -s * 1.0, s, s * 1.1, 6, z.id, 2.4); c.globalAlpha = za; }
      // the face: X eyes, and a mouth that says what it is
      const e = Math.max(1.8, hr * 0.26);
      wax(c, '#151515', 1.6, () => { for (const ex of [-0.38, 0.38]) { c.moveTo(hx + ex * hr - e, hy - hr * 0.2 - e); c.lineTo(hx + ex * hr + e, hy - hr * 0.2 + e); c.moveTo(hx + ex * hr + e, hy - hr * 0.2 - e); c.lineTo(hx + ex * hr - e, hy - hr * 0.2 + e); } if (S.mark === 'scream') { c.moveTo(hx + hr * 0.3, hy + hr * 0.45); c.arc(hx, hy + hr * 0.45, hr * 0.3, 0, TAU); } else { c.moveTo(hx - hr * 0.45, hy + hr * 0.5); c.lineTo(hx - hr * 0.15, hy + hr * 0.35); c.lineTo(hx + hr * 0.15, hy + hr * 0.5); c.lineTo(hx + hr * 0.45, hy + hr * 0.35); } }, boil + 5);
      if (z.rage > 0 || r > 25) wax(c, '#151515', 2, () => { c.moveTo(hx - hr * 0.8, hy - hr * 0.75); c.lineTo(hx - hr * 0.1, hy - hr * 0.45); c.moveTo(hx + hr * 0.8, hy - hr * 0.75); c.lineTo(hx + hr * 0.1, hy - hr * 0.45); }, boil + 7);        // angry eyebrows
      if (z.hp < z.maxhp * 0.5) { c.globalAlpha = za * 0.8; scribble(c, '#d01c14', -s * 0.4, -s * 0.8, s * 0.8, s * 0.6, 5, z.id + 9, 2.2); }
      c.restore(); c.globalAlpha = 1;
    },
    // us: stick people too, in our own colours, smiling (so far)
    player(R_, c, p) {
      const boil = (Math.floor(R_.time * 6) + ((p.x / 50) | 0)) | 0, dir = Math.cos(p.aim) >= 0 ? 1 : -1, s = 13;
      c.save(); c.translate(p.x, p.y);
      if (p.down) { c.globalAlpha = 0.8; scribble(c, '#d01c14', -20, 2, 40, 12, 8, 5, 3); c.globalAlpha = 1; wax(c, p.color, 3.6, () => { c.moveTo(-16, 6); c.lineTo(8, 6); c.moveTo(22, 6); c.arc(14, 6, 7, 0, TAU); c.moveTo(-6, 6); c.lineTo(-12, -4); c.moveTo(-16, 6); c.lineTo(-24, 0); }, 3); c.restore(); c.globalAlpha = 1; return; }
      const step = p.moving ? Math.sin(p.walk) * 5 : 0, hy = -s * 1.5, hurt = p.hurtT > 0.2;
      wax(c, hurt ? '#d01c14' : p.color, 4.8, () => { c.moveTo(0, -s * 1.0); c.lineTo(0, s * 0.3); c.moveTo(0, s * 0.3); c.lineTo(-6 + step, s * 1.3); c.moveTo(0, s * 0.3); c.lineTo(6 - step, s * 1.3); c.moveTo(8, hy); c.arc(0, hy, 8, 0, TAU); }, boil);
      const ax = Math.cos(p.aim), ay = Math.sin(p.aim), G = (R.int && R.int.GUNLOOK && (R.int.GUNLOOK[p.cur] || R.int.GUNLOOK.pistol)) || { len: 16 }, kick = p.flash > 0 ? -3 : 0;
      wax(c, hurt ? '#d01c14' : p.color, 3.4, () => { c.moveTo(0, -s * 0.6); c.lineTo(ax * 12, -s * 0.5 + ay * 12); }, boil + 1);                                      // the arm points where she aims
      wax(c, '#151515', 4.4, () => { c.moveTo(ax * (10 + kick), -s * 0.5 + ay * (10 + kick)); c.lineTo(ax * (16 + G.len + kick), -s * 0.5 + ay * (16 + G.len + kick)); c.moveTo(ax * (12 + kick), -s * 0.5 + ay * (12 + kick)); c.lineTo(ax * (12 + kick) - ay * 5 * dir, -s * 0.5 + ay * (12 + kick) + ax * 5 * dir); }, boil + 2);     // gun
      wax(c, '#7a4a20', 2.2, () => { for (let k = -2; k <= 2; k++) { c.moveTo(k * 2.6, hy - 7); c.lineTo(k * 3.4, hy - 12 - (k % 2 ? 2 : 0)); } }, 9);                 // hair
      c.fillStyle = '#151515'; c.beginPath(); c.arc(-3, hy - 1, 1.5, 0, TAU); c.arc(3, hy - 1, 1.5, 0, TAU); c.fill();
      wax(c, '#151515', 1.5, () => { if (p.hp < p.maxhp * 0.4) c.arc(0, hy + 6, 3.4, Math.PI + 0.4, TAU - 0.4); else c.arc(0, hy + 2, 3.6, 0.4, Math.PI - 0.4); }, 11);    // she stops smiling when she is hurt
      c.restore(); c.globalAlpha = 1;
    },
    sprite(R_, id) {
      const def = GD.STRUCTS[id]; if (!def) return null;
      const turret = GD.TURRET_IDS.indexOf(id) >= 0;
      const known = { wood: 1, steel: 1, bunker: 1, gate: 1, fence: 1, wire: 1, spikes: 1, mine: 1, lamp: 1, lure: 1, medic: 1, trail: 1, ward: 1 };
      if (!known[id] && !(turret && (def.gun || id === 'turret' || id === 'cannon' || id === 'napalm' || id === 'tesla'))) return null;
      const S = 3, cv = mk(CELL * S, CELL * S), g = cv.getContext('2d'), sd = id.length * 13 + id.charCodeAt(0);
      g.scale(S, S);
      const box = (col, fill) => { g.globalAlpha = 0.6; scribble(g, fill, 4, 5, 32, 30, 11, sd, 3.2); g.globalAlpha = 1; wax(g, col, 2.8, () => { g.moveTo(3, 3); g.lineTo(37, 4); g.lineTo(36, 37); g.lineTo(4, 36); g.closePath(); }, sd); g.globalAlpha = 1; };
      const L = (col, lw, fn, k) => { g.globalAlpha = 1; wax(g, col, lw, fn, sd + (k || 0)); g.globalAlpha = 1; };
      if (id === 'wood') { box('#7a4a20', '#c08a4a'); L('#7a4a20', 2.4, () => { g.moveTo(5, 5); g.lineTo(35, 35); g.moveTo(35, 5); g.lineTo(5, 35); }, 3); }
      else if (id === 'steel') { box('#4a5a6a', '#9aa8b8'); L('#4a5a6a', 1.8, () => { for (const [x, y] of [[9, 9], [31, 9], [9, 31], [31, 31]]) { g.moveTo(x + 2, y); g.arc(x, y, 2, 0, TAU); } }, 3); }
      else if (id === 'bunker') { box('#3a3a3a', '#b8b4aa'); L('#3a3a3a', 1.6, () => { g.moveTo(4, 14); g.lineTo(36, 14); g.moveTo(4, 26); g.lineTo(36, 26); g.moveTo(20, 4); g.lineTo(20, 14); g.moveTo(12, 14); g.lineTo(12, 26); g.moveTo(28, 14); g.lineTo(28, 26); g.moveTo(20, 26); g.lineTo(20, 36); }, 3); }
      else if (id === 'gate') { box('#2f8a34', '#9ad08a'); L('#2f8a34', 2.2, () => { g.moveTo(11, 36); g.lineTo(11, 16); g.quadraticCurveTo(20, 5, 29, 16); g.lineTo(29, 36); g.moveTo(26, 26); g.arc(25, 26, 1.2, 0, TAU); }, 3); }
      else if (id === 'fence') { L('#3a3a3a', 3, () => { g.moveTo(6, 4); g.lineTo(6, 36); g.moveTo(34, 4); g.lineTo(34, 36); }, 1); L('#f2c21a', 2, () => { for (let k = 0; k < 4; k++) { g.moveTo(6, 9 + k * 8); g.lineTo(34, 9 + k * 8); } }, 3); L('#f2c21a', 2.4, () => { g.moveTo(16, 6); g.lineTo(22, 16); g.lineTo(17, 18); g.lineTo(25, 31); }, 5); }
      else if (id === 'wire') { L('#5a6a78', 1.8, () => { for (let rw = 0; rw < 3; rw++) { g.moveTo(3, 9 + rw * 11); for (let x = 3; x <= 37; x += 4) g.arc(x + 2, 9 + rw * 11, 2.6, Math.PI, TAU * 1.5); } }, 3); }
      else if (id === 'spikes') { L('#3a3a3a', 2.2, () => { for (let rw = 0; rw < 3; rw++) { g.moveTo(4, 14 + rw * 10); for (let x = 0; x < 6; x++) { g.lineTo(7 + x * 5.6, 6 + rw * 10); g.lineTo(9.8 + x * 5.6, 14 + rw * 10); } } }, 3); }
      else if (id === 'mine') { g.globalAlpha = 0.7; scribble(g, '#d01c14', 12, 12, 16, 16, 7, sd, 3); L('#151515', 2.4, () => { g.moveTo(30, 20); g.arc(20, 20, 10, 0, TAU); g.moveTo(20, 14); g.lineTo(20, 22); g.moveTo(20, 25); g.lineTo(20, 26); }, 3); }
      else if (id === 'lamp') { g.globalAlpha = 0.7; scribble(g, '#f2c21a', 12, 12, 16, 16, 7, sd, 3.4); L('#e0a010', 2.4, () => { g.moveTo(28, 20); g.arc(20, 20, 8, 0, TAU); for (let k = 0; k < 8; k++) { const a = k / 8 * TAU; g.moveTo(20 + Math.cos(a) * 11, 20 + Math.sin(a) * 11); g.lineTo(20 + Math.cos(a) * 17, 20 + Math.sin(a) * 17); } }, 3); }
      else if (id === 'lure') { box('#2f8a34', '#b8e0a8'); L('#151515', 1.8, () => { g.moveTo(20, 20); g.arc(15, 20, 5, 0, TAU); g.moveTo(31, 5); g.lineTo(37, -1); for (let k = 0; k < 3; k++) { g.moveTo(26, 13 + k * 5); g.lineTo(32, 13 + k * 5); } }, 3); }
      else if (id === 'medic') { box('#3a3a3a', '#ffffff'); L('#d01c14', 5, () => { g.moveTo(20, 9); g.lineTo(20, 31); g.moveTo(9, 20); g.lineTo(31, 20); }, 3); }
      else if (id === 'trail') { g.globalAlpha = 0.55; scribble(g, '#d01c14', 4, 10, 32, 20, 9, sd, 3.4); }
      else if (id === 'ward') { L('#7a4a20', 3, () => { g.moveTo(20, 16); g.lineTo(20, 38); }, 1); L('#151515', 2.2, () => { g.moveTo(30, 11); g.arc(20, 11, 10, 0, TAU); g.moveTo(14, 8); g.lineTo(18, 11); g.moveTo(26, 8); g.lineTo(22, 11); g.moveTo(15, 16); g.lineTo(17, 14); g.lineTo(20, 16); g.lineTo(23, 14); g.lineTo(25, 16); }, 3); }       // a scary face on a stick
      else { box('#2a3a8a', '#a8b8f0'); L('#2a3a8a', 2.6, () => { g.moveTo(30, 20); g.arc(20, 20, 10, 0, TAU); }, 3); }
      return cv;
    },
    struct(R_, c, s, alpha, noBase) {
      const def = GD.STRUCTS[s.id], x = s.cx * CELL, y = s.cy * CELL;
      const gunny = def.gun || s.id === 'turret' || s.id === 'cannon' || s.id === 'napalm';
      if (!gunny && !def.wall && !({ wire: 1, spikes: 1, mine: 1, lamp: 1, medic: 1, trail: 1 })[s.id]) return false;
      const a0 = alpha === undefined ? 1 : alpha;
      c.globalAlpha = a0;
      if (!noBase) c.drawImage(R_.sprite(s.id), x, y, CELL, CELL);
      if (alpha === undefined && s.maxhp && s.hp < s.maxhp * 0.75 && (def.wall || gunny)) { const k = 1 - s.hp / s.maxhp; c.globalAlpha = 0.5 + k * 0.4; scribble(c, '#151515', x + 4, y + 6, CELL - 8, CELL - 14, 3 + Math.ceil(k * 9), s.uid, 2.6); }      // broken things get scribbled out
      if (gunny) { const ax = Math.cos(s.ang || 0), ay = Math.sin(s.ang || 0), kick = s.flash > 0 ? -3 : 0; c.globalAlpha = a0; wax(c, '#151515', 4.6, () => { c.moveTo(s.x + ax * (2 + kick), s.y + ay * (2 + kick)); c.lineTo(s.x + ax * (24 + kick), s.y + ay * (24 + kick)); }, s.uid); if (s.flash > 0) { c.globalAlpha = a0; c.fillStyle = '#d01c14'; c.font = '700 13px "Comic Sans MS", cursive'; c.textAlign = 'center'; c.fillText('pew', s.x + ax * 34, s.y + ay * 34 - 6); } }
      c.globalAlpha = a0;
      if (alpha === undefined && R_.showOwners) { c.fillStyle = R_.ownerColor(s.owner); c.fillRect(x + 2, y + 2, 5, 5); }
      if (s.hitT > 0 && alpha === undefined) { c.globalAlpha = 0.6; scribble(c, '#d01c14', x + 4, y + 10, CELL - 8, 18, 6, s.uid + 5, 3); }
      c.globalAlpha = 1;
      return true;
    },
    over(R_, c, sim) {
      c.lineCap = 'round'; c.strokeStyle = 'rgba(21,21,21,0.85)'; c.lineWidth = 2.2; c.setLineDash([8, 7]); c.beginPath();
      for (const b of sim.bullets) { if (b.kind !== 'bullet' || b.wid === 'saw') continue; const sp = Math.hypot(b.vx, b.vy) || 1, tl = b.wid === 'sniper' || b.wid === 'rail' ? 90 : 46; c.moveTo(b.x, b.y); c.lineTo(b.x - b.vx / sp * tl, b.y - b.vy / sp * tl); }
      c.stroke(); c.setLineDash([]);
    },
    // fire: red, orange and yellow zigzags, gone over and over
    hot(R_, c, fireS) {
      c.globalCompositeOperation = 'source-over';
      for (const p of R_.parts) {
        const t = Math.max(0, Math.min(1, p.life / p.max));
        if (p.k === 'fire' || p.k === 'acid') { c.globalAlpha = 0.7 * t; c.strokeStyle = p.k === 'acid' ? '#7a9a1a' : t > 0.5 ? '#f2a01a' : '#d8401a'; c.lineWidth = 2.4; c.lineCap = 'round'; const s = p.size * 0.6; c.beginPath(); c.moveTo(p.x - s, p.y + s); c.lineTo(p.x - s * 0.3, p.y - s); c.lineTo(p.x + s * 0.3, p.y + s * 0.4); c.lineTo(p.x + s, p.y - s); c.stroke(); }
        else if (p.k === 'spark' || p.k === 'ember') { c.globalAlpha = t; c.fillStyle = '#f2a01a'; c.beginPath(); c.arc(p.x, p.y, p.size, 0, TAU); c.fill(); }
      }
      if (fireS > 0) {
        const b = Math.floor(R_.time * 6);
        [['#d01c14', 30, 4.6], ['#f07a1a', 22, 4], ['#f2c21a', 13, 3.4]].forEach(([col, h, lw], i) => {
          c.globalAlpha = 0.9; wax(c, col, lw, () => { const w = (20 - i * 5) * fireS; c.moveTo(FIRE.x - w, FIRE.y + 10); for (let k = 0; k <= 6; k++) { const x = FIRE.x - w + k * w / 3, up = k % 2 === 0; c.lineTo(x + (hash(b, k + i * 7) - 0.5) * 4, FIRE.y + 10 - (up ? 4 : h * fireS * (0.6 + hash(b, k + i * 11) * 0.5))); } }, b + i * 3);
        });
        c.globalAlpha = 1; wax(c, '#7a4a20', 4, () => { c.moveTo(FIRE.x - 18, FIRE.y + 16); c.lineTo(FIRE.x + 18, FIRE.y + 9); c.moveTo(FIRE.x - 18, FIRE.y + 9); c.lineTo(FIRE.x + 18, FIRE.y + 16); }, 4);
      }
      c.globalAlpha = 1; c.globalCompositeOperation = 'lighter';
    },
  };
  R.LOOKS = R.LOOKS || {};
  R.LOOKS.kid = look;
})(window);
