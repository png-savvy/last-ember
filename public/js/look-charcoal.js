// Last Ember - graphics style "Charcoal and ember". Its own drawing for the dead, the survivors and the builds: black
// charcoal silhouettes on a grey page, outlines gone over twice with a shaking hand, lines that "boil" a few times a
// second the way hand-drawn animation does. Classic's art is not used here (only rare late builds fall back to it, in grey).
(function (root) {
  'use strict';
  const R = root.Renderer;
  if (!R) return;
  const GD = root.GD, { CELL } = GD, TAU = Math.PI * 2;
  const INK = '#09090b', PAPER = '#e9e5da', MID = '#8d8a83';
  const hash = (a, b) => { let n = (a * 374761393 + b * 668265263) | 0; n = (n ^ (n >>> 13)) * 1274126177 | 0; return ((n ^ (n >>> 16)) >>> 0) / 4294967296; };
  const mk = (w, h) => { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; };
  // every kind of dead has its own outline. w/l: torso half-width and half-length (in radii), head size, arm reach,
  // and one mark that makes it itself.
  const SHAPE = {
    walker: { w: 0.95, l: 0.7, h: 0.5, arm: 1.35 }, runner: { w: 0.7, l: 0.85, h: 0.46, arm: 1.5, mark: 'streak' },
    crawler: { w: 0.62, l: 1.25, h: 0.42, arm: 1.9, mark: 'crawl' }, brute: { w: 1.2, l: 0.8, h: 0.36, arm: 1.3, armW: 0.5 },
    bloater: { w: 1.08, l: 1.08, h: 0.4, arm: 1.2, armW: 0.22, mark: 'belly' }, screamer: { w: 0.66, l: 0.6, h: 0.56, arm: 1.1, mark: 'scream' },
    leaper: { w: 0.7, l: 0.9, h: 0.44, arm: 1.7, mark: 'legs' }, ironhide: { w: 1.0, l: 0.8, h: 0.44, arm: 1.3, mark: 'plates' },
    splitter: { w: 1.0, l: 0.8, h: 0.42, arm: 1.3, mark: 'seam' }, splitling: { w: 0.8, l: 0.7, h: 0.55, arm: 1.3 },
    tarborn: { w: 1.05, l: 0.95, h: 0.42, arm: 1.25, armW: 0.42, mark: 'drip' }, juggernaut: { w: 1.1, l: 1.0, h: 0.34, arm: 1.2, armW: 0.5, mark: 'horns' },
    broodmother: { w: 1.15, l: 1.15, h: 0.3, arm: 1.1, armW: 0.24, mark: 'eggs' }, boss: { w: 1.1, l: 0.95, h: 0.4, arm: 1.4, armW: 0.46, mark: 'spikes' },
    smoker: { w: 1.0, l: 1.0, h: 0.42, arm: 1.2, mark: 'belly' }, disruptor: { w: 0.85, l: 0.75, h: 0.48, arm: 1.3, mark: 'aerial' },
    colossus: { w: 1.05, l: 0.85, h: 0.3, arm: 1.25, armW: 0.55, mark: 'plates' }, gravecaller: { w: 0.8, l: 0.7, h: 0.48, arm: 1.2, mark: 'robe' },
    gorefly: { w: 0.6, l: 0.9, h: 0.5, arm: 0, mark: 'wings' },
    wyrm: { seg: 1, head: 1 }, gorewyrm: { seg: 1, head: 1 }, wyrmseg: { seg: 1 }, goreseg: { seg: 1 },
  };
  // a closed, wobbly outline: an ellipse whose edge the hand could not keep steady
  function blob(c, cx, cy, rx, ry, seed, n, amt) {
    c.beginPath();
    for (let i = 0; i <= n; i++) {
      const a = (i % n) / n * TAU, k = 1 + (hash(seed, i % n) - 0.5) * amt, x = cx + Math.cos(a) * rx * k, y = cy + Math.sin(a) * ry * k;
      i ? c.lineTo(x, y) : c.moveTo(x, y);
    }
    c.closePath();
  }
  const look = {
    fxInk: '233,229,218',
    // what flies is pastel dust: red grit knocked off the stick
    fleck(R_, c, p, bile) { const t = Math.max(0, p.life / p.max); c.globalAlpha = 0.9 * t + 0.1; c.fillStyle = bile ? '#161618' : '#b3160f'; for (let k = 0; k < 3; k++) c.fillRect(p.x - p.vx * 0.012 * k + (k - 1) * 1.5, p.y - p.vy * 0.012 * k, p.size * (1.3 - k * 0.3), p.size * (1.3 - k * 0.3)); c.globalAlpha = 1; },
    // the dead: a figure blocked in black, then half rubbed out with the side of the hand
    body(R_, d, e, r, torn) {
      d.globalAlpha = 0.7; d.fillStyle = INK; blob(d, 0, 0, r * 1.05, r * 0.8, (e.x + e.y) | 0, 10, 0.3); d.fill(); blob(d, r * 0.9, r * 0.2, r * 0.5, r * 0.5, e.x | 0, 8, 0.25); d.fill();
      d.strokeStyle = INK; d.lineCap = 'round'; d.lineWidth = r * 0.26; d.globalAlpha = 0.65; d.beginPath(); d.moveTo(0, -r * 0.6); d.lineTo(r * (torn ? 2.0 : 1.3), -r * 1.2); d.moveTo(0, r * 0.6); d.lineTo(r * 1.2, r * (torn ? 2.0 : 1.3)); d.stroke();
      for (let k = 0; k < 4; k++) { d.strokeStyle = 'rgba(190,186,176,0.3)'; d.lineWidth = r * 0.5; d.beginPath(); d.moveTo(-r * 1.4, -r * 0.6 + k * r * 0.4); d.lineTo(r * 1.8, -r * 0.2 + k * r * 0.4); d.stroke(); }       // the rub
      d.strokeStyle = 'rgba(9,9,11,0.5)'; d.lineWidth = 1; d.globalAlpha = 0.8; for (let k = 0; k < 6; k++) { d.beginPath(); d.moveTo(-r * 1.2 + k * r * 0.4, -r); d.lineTo(-r * 0.9 + k * r * 0.4, r); d.stroke(); }
      d.globalAlpha = 1;
    },
    // blood: red pastel dragged across the page with a thumb. Strokes laid over each other, then smudged one way.
    splat(R_, d, x, y, r, bile, alpha, ang) {
      const rnd = (a, b) => a + Math.random() * (b - a), dir = ang === undefined ? rnd(0, TAU) : ang, cols = bile ? ['#141416', '#232326'] : ['#b3160f', '#8f100c', '#c8201a'];
      d.lineCap = 'round';
      for (let i = 0, n = 3 + Math.round(r / 3); i < n; i++) {
        const a = dir + rnd(-0.5, 0.5), ox = rnd(-r, r) * 0.45, oy = rnd(-r, r) * 0.45, l = r * rnd(0.6, 1.5);
        d.strokeStyle = cols[(Math.random() * cols.length) | 0]; d.globalAlpha = alpha * rnd(0.3, 0.75); d.lineWidth = rnd(1.2, 2 + r * 0.16);
        d.beginPath(); d.moveTo(x + ox - Math.cos(a) * l * 0.4, y + oy - Math.sin(a) * l * 0.4); d.lineTo(x + ox + Math.cos(a) * l * 0.6, y + oy + Math.sin(a) * l * 0.6); d.stroke();
      }
      if (r > 7) {                                             // the smudge: a wide, faint drag that thins out
        for (let k = 0; k < 5; k++) { d.strokeStyle = cols[0]; d.globalAlpha = alpha * (0.2 - k * 0.035); d.lineWidth = r * (0.9 - k * 0.12); d.beginPath(); d.moveTo(x + Math.cos(dir) * r * k * 0.5, y + Math.sin(dir) * r * k * 0.5); d.lineTo(x + Math.cos(dir) * r * (k * 0.5 + 0.7), y + Math.sin(dir) * r * (k * 0.5 + 0.7)); d.stroke(); }
        if (r > 12 && !bile) {                                 // and where the thumb came down at the end of the drag, its print
          const fx = x + Math.cos(dir) * r * 2.6, fy = y + Math.sin(dir) * r * 2.6; d.strokeStyle = cols[1]; d.lineWidth = 0.9;
          for (let k = 1; k <= 6; k++) { d.globalAlpha = alpha * 0.55; d.beginPath(); d.ellipse(fx, fy, k * 1.9, k * 2.6, dir, 0.4 * k, 0.4 * k + 4.6); d.stroke(); }
        }
        d.strokeStyle = 'rgba(214,210,200,0.5)'; d.lineWidth = 2.2; d.globalAlpha = 1;                                    // then the rubber, dragged back through it
        for (let k = 0; k < 2; k++) { const o = rnd(-r, r) * 0.6; d.beginPath(); d.moveTo(x - Math.sin(dir) * o - Math.cos(dir) * r, y + Math.cos(dir) * o - Math.sin(dir) * r); d.lineTo(x - Math.sin(dir) * o + Math.cos(dir) * r * 1.8, y + Math.cos(dir) * o + Math.sin(dir) * r * 1.8); d.stroke(); }
        d.fillStyle = cols[0]; for (let k = 0, n = 6 + r; k < n; k++) { d.globalAlpha = alpha * rnd(0.2, 0.6); d.fillRect(x + rnd(-r, r) * 1.6, y + rnd(-r, r) * 1.6, rnd(0.8, 1.8), rnd(0.8, 1.8)); }      // pastel dust
      }
    },
    hudFont: '"Segoe Print", "Bradley Hand", "Chalkboard SE", "Comic Sans MS", cursive', titleFont: '700 PXpx "Segoe Print", "Bradley Hand", "Chalkboard SE", cursive',
    fxHot: true, dark: '7,7,9', eye: '#f4f1e8',
    zombie(R_, c, z) {
      const za = z.vis === undefined ? 1 : z.vis;
      if (z.burrowed) { R_.drawBurrow(c, z); return; }
      const S = SHAPE[z.type] || SHAPE.walker, r = z.r, air = z.air || 0, hit = z.hitT > 0;
      const boil = (z.id * 17 + Math.floor(R_.time * 7)) | 0;                 // the line changes 7 times a second
      const body = hit ? PAPER : INK, edge = hit ? INK : 'rgba(9,9,11,0.55)', lite = hit ? INK : 'rgba(233,229,218,0.75)';
      c.save(); c.globalAlpha = za; c.translate(z.x, z.y);
      c.fillStyle = 'rgba(0,0,0,' + (0.42 - air * 0.2) + ')'; blob(c, 4 + air * 10, 6 + air * 14, r * 1.1, r * 0.95, z.id, 9, 0.3); c.fill();   // a smudge for a shadow
      if (air) c.translate(0, -air * 16);
      const sc = 1 + air * 0.35; c.scale(sc, sc);
      // what it is carrying: every status is a different pencil mark around it
      c.lineCap = 'round';
      if (z.champ) { c.strokeStyle = PAPER; c.lineWidth = 1.6; for (let k = 0; k < 2; k++) { blob(c, 0, 0, r * 1.32, r * 1.32, boil + k, 14, 0.12); c.stroke(); } }
      if (z.rage > 0) { c.strokeStyle = INK; c.lineWidth = 2.2; c.beginPath(); for (let i = 0; i <= 18; i++) { const a = i / 18 * TAU, d = r * (i % 2 ? 1.75 : 1.3); c.lineTo(Math.cos(a + boil) * d, Math.sin(a + boil) * d); } c.stroke(); }
      if (z.chill > 0 || z.stunImm > 0 || z.raised) { c.strokeStyle = PAPER; c.lineWidth = 1.2; c.setLineDash(z.chill > 0 ? [2, 5] : z.raised ? [1, 7] : [7, 4]); c.beginPath(); c.arc(0, 0, r * 1.22, 0, TAU); c.stroke(); c.setLineDash([]); }
      c.rotate(z.ang || 0);
      const wob = Math.sin(z.wob || 0), lunge = Math.max(0, z.lunge || 0);
      if (S.seg) {                         // wyrm: armoured plates, legs ticked in either side
        c.strokeStyle = INK; c.lineWidth = 2;
        for (const sd of [-1, 1]) for (const k of [-0.45, 0.1, 0.6]) { c.beginPath(); c.moveTo(k * r, sd * r * 0.5); c.lineTo(k * r - 3 + wob * 3 * sd, sd * r * 1.25); c.stroke(); }
        c.fillStyle = body; blob(c, 0, 0, r * (S.head ? 1.15 : 0.95), r * 0.82, boil, 10, 0.16); c.fill();
        c.strokeStyle = lite; c.lineWidth = 1.2; for (const k of [-0.4, 0, 0.4]) { c.beginPath(); c.moveTo(k * r, -r * 0.6); c.quadraticCurveTo(k * r + r * 0.2, 0, k * r, r * 0.6); c.stroke(); }
        if (S.head) { c.strokeStyle = INK; c.lineWidth = 3; c.beginPath(); c.moveTo(r * 0.8, -r * 0.4); c.lineTo(r * 1.6, -r * 0.15 - wob * 3); c.moveTo(r * 0.8, r * 0.4); c.lineTo(r * 1.6, r * 0.15 + wob * 3); c.stroke(); c.fillStyle = PAPER; c.beginPath(); c.arc(r * 0.7, -r * 0.3, 2, 0, TAU); c.arc(r * 0.7, r * 0.3, 2, 0, TAU); c.fill(); }
        c.restore(); c.globalAlpha = 1; return;
      }
      // speed lines dragged out behind it
      c.strokeStyle = 'rgba(9,9,11,0.5)'; c.lineWidth = 1;
      for (let k = 0, n = S.mark === 'streak' ? 7 : 4; k < n; k++) { const y = (hash(boil, k) - 0.5) * r * 1.8, l = r * (0.7 + hash(boil, k + 9) * (S.mark === 'streak' ? 2 : 1)); c.beginPath(); c.moveTo(-r * S.l * 0.8, y); c.lineTo(-r * S.l * 0.8 - l, y + (hash(boil, k + 20) - 0.5) * 4); c.stroke(); }
      if (S.mark === 'robe') { c.fillStyle = body; c.beginPath(); c.moveTo(r * 0.2, -r * 0.8); c.lineTo(-r * 1.9, -r * 1.0 + wob * 2); c.lineTo(-r * 1.5, 0); c.lineTo(-r * 1.9, r * 1.0 - wob * 2); c.lineTo(r * 0.2, r * 0.8); c.fill(); }
      if (S.mark === 'legs') { c.strokeStyle = body; c.lineWidth = r * 0.3; c.beginPath(); c.moveTo(-r * 0.4, -r * 0.5); c.lineTo(-r * 1.1, -r * 1.2); c.lineTo(-r * 1.7, -r * 0.7); c.moveTo(-r * 0.4, r * 0.5); c.lineTo(-r * 1.1, r * 1.2); c.lineTo(-r * 1.7, r * 0.7); c.stroke(); }
      if (S.mark === 'wings') { c.strokeStyle = INK; c.lineWidth = 1; c.fillStyle = 'rgba(233,229,218,0.5)'; const f = Math.sin(R_.time * 50 + z.id) * 0.4; for (const sd of [-1, 1]) { c.save(); c.rotate(sd * (0.9 + f)); c.beginPath(); c.ellipse(-r * 0.2, sd * r, r * 1.2, r * 0.45, 0, 0, TAU); c.fill(); c.stroke(); c.restore(); } }
      // arms: one always ahead of the other (the shamble), claws ticked on the end
      if (S.arm) {
        c.strokeStyle = body; c.lineWidth = r * (S.armW || 0.32);
        for (const sd of [-1, 1]) {
          const lead = sd * wob * 0.22, reach = r * (S.arm + lead + lunge * 0.5), y0 = sd * r * S.w * 0.85, y1 = sd * r * (S.mark === 'crawl' ? 0.9 : 0.42), ex = reach * 0.55, ey = sd * r * (S.w * 0.9 + 0.12);
          c.beginPath(); c.moveTo(0, y0); c.lineTo(ex, ey); c.lineTo(reach, y1); c.stroke();
          c.lineWidth = 1.5; c.beginPath(); for (let f = -1; f <= 1; f++) { c.moveTo(reach, y1); c.lineTo(reach + r * 0.34, y1 + f * r * 0.2); } c.stroke(); c.lineWidth = r * (S.armW || 0.32);
        }
      }
      // the body: solid charcoal, then the outline gone over twice more
      c.fillStyle = body; blob(c, 0, 0, r * S.l, r * S.w, boil, 11, 0.2); c.fill();
      c.strokeStyle = edge; c.lineWidth = 1.2; for (let k = 1; k <= 2; k++) { blob(c, hash(boil, k) * 2 - 1, hash(boil, k + 4) * 2 - 1, r * S.l * 1.04, r * S.w * 1.04, boil + k * 7, 11, 0.24); c.stroke(); }
      // ribs and rags: lines lifted back out of the black with the eraser
      c.strokeStyle = lite; c.lineWidth = 1;
      c.beginPath(); for (let k = -2; k <= 2; k++) { const x = -r * S.l * 0.25 + (hash(z.id, k + 5) - 0.5) * 3; c.moveTo(x, k * r * S.w * 0.3 - 2); c.lineTo(x + r * S.l * 0.5, k * r * S.w * 0.3 + (hash(z.id, k + 12) - 0.5) * 5); } c.stroke();
      if (S.mark === 'plates') { c.fillStyle = MID; c.strokeStyle = hit ? INK : PAPER; c.lineWidth = 1.2; for (const [x, y] of [[-0.3, -0.5], [-0.3, 0.5], [0.25, 0]]) { c.beginPath(); c.rect(x * r - r * 0.26, y * r - r * 0.26, r * 0.52, r * 0.52); c.fill(); c.stroke(); } }
      if (S.mark === 'belly') { c.strokeStyle = lite; c.lineWidth = 1.3; blob(c, -r * 0.1, 0, r * 0.6, r * 0.6, z.id, 9, 0.2); c.stroke(); c.beginPath(); c.moveTo(-r * 0.5, 0); c.lineTo(r * 0.3, r * 0.1); c.stroke(); }
      if (S.mark === 'eggs') { c.strokeStyle = lite; c.lineWidth = 1.1; for (let k = 0; k < 6; k++) { c.beginPath(); c.arc((hash(z.id, k) - 0.6) * r * 1.3, (hash(z.id, k + 8) - 0.5) * r * 1.3, r * 0.17, 0, TAU); c.stroke(); } }
      if (S.mark === 'seam') { c.strokeStyle = lite; c.lineWidth = 1.4; c.setLineDash([3, 3]); c.beginPath(); c.moveTo(-r * 0.7, 0); c.lineTo(r * 0.9, 0); c.stroke(); c.setLineDash([]); }
      if (S.mark === 'drip') { c.fillStyle = INK; for (let k = 0; k < 7; k++) { const a = hash(z.id, k) * TAU, d = r * (1.15 + hash(boil, k) * 0.5); c.beginPath(); c.arc(Math.cos(a) * d, Math.sin(a) * d, 1.2 + hash(z.id, k + 3) * 2.2, 0, TAU); c.fill(); } }
      if (S.mark === 'spikes' || S.mark === 'horns') { c.fillStyle = body; const n = S.mark === 'horns' ? 2 : 9; for (let k = 0; k < n; k++) { const a = S.mark === 'horns' ? (k ? 0.5 : -0.5) : Math.PI * 0.5 + k / (n - 1) * Math.PI, d0 = r * 0.85, d1 = r * (S.mark === 'horns' ? 1.75 : 1.5); c.beginPath(); c.moveTo(Math.cos(a - 0.16) * d0, Math.sin(a - 0.16) * d0); c.lineTo(Math.cos(a) * d1, Math.sin(a) * d1); c.lineTo(Math.cos(a + 0.16) * d0, Math.sin(a + 0.16) * d0); c.fill(); } }
      if (S.mark === 'aerial') { c.strokeStyle = PAPER; c.lineWidth = 1.2; c.beginPath(); let x = 0, y = 0; c.moveTo(x, y); for (let k = 0; k < 5; k++) { x -= r * 0.3; y = (k % 2 ? 1 : -1) * r * (0.5 + hash(boil, k) * 0.5); c.lineTo(x, y); } c.stroke(); }
      if (S.mark === 'robe') { c.strokeStyle = PAPER; c.lineWidth = 1.6; c.beginPath(); c.moveTo(-r * 0.3, r * 0.95); c.lineTo(r * 1.6 + lunge * 4, r * 0.8); c.stroke(); c.fillStyle = PAPER; c.beginPath(); c.arc(r * 1.7 + lunge * 4, r * 0.8, 3, 0, TAU); c.fill(); }
      // the head hangs forward and rolls as it walks; hollow eyes are the paper showing through
      const hx = r * (S.l * 0.72 + (S.mark === 'crawl' ? 0.2 : 0)), hy = wob * r * 0.1, hr = r * S.h;
      c.fillStyle = body; blob(c, hx, hy, hr, hr, boil + 3, 9, 0.18); c.fill();
      c.strokeStyle = edge; c.lineWidth = 1; blob(c, hx + 0.6, hy - 0.6, hr * 1.06, hr * 1.06, boil + 5, 9, 0.2); c.stroke();
      c.fillStyle = hit ? INK : PAPER; const er = Math.max(1.1, hr * 0.2);
      c.beginPath(); c.arc(hx + hr * 0.42, hy - hr * 0.38, er, 0, TAU); c.arc(hx + hr * 0.42, hy + hr * 0.38, er, 0, TAU); if (S.mark === 'spikes') c.arc(hx + hr * 0.7, hy, er, 0, TAU); c.fill();
      if (S.mark === 'scream') { c.beginPath(); c.ellipse(hx + hr * 0.75, hy, hr * 0.28, hr * 0.45, 0, 0, TAU); c.fill(); c.strokeStyle = 'rgba(9,9,11,0.6)'; c.lineWidth = 1; for (let k = -2; k <= 2; k++) { c.beginPath(); c.moveTo(hx + hr * 1.4, hy + k * 3); c.lineTo(hx + hr * 2.3 + hash(boil, k + 3) * 5, hy + k * 7); c.stroke(); } }
      else { c.strokeStyle = hit ? INK : PAPER; c.lineWidth = 0.9; c.beginPath(); c.moveTo(hx + hr * 0.8, hy - hr * 0.25); c.lineTo(hx + hr * 0.8, hy + hr * 0.25); c.stroke(); }      // the slit of a jaw
      c.restore(); c.globalAlpha = 1;
      if (z.lit && R_.dark > 0.3) { c.strokeStyle = 'rgba(233,229,218,0.5)'; c.lineWidth = 1.2; c.setLineDash([3, 4]); c.beginPath(); c.arc(z.x, z.y - air * 16, r + 5, 0, TAU); c.stroke(); c.setLineDash([]); }
    },
    // the living are the opposite of the dead: bare paper inside a firm black line
    player(R_, c, p) {
      const boil = (Math.floor(R_.time * 7) + p.x * 0.01) | 0;
      c.save(); c.translate(p.x, p.y);
      if (p.down) {
        c.rotate(1.2 + p.x);
        c.fillStyle = 'rgba(0,0,0,0.4)'; blob(c, 0, 0, 22, 16, 3, 10, 0.3); c.fill();
        c.fillStyle = MID; c.strokeStyle = INK; c.lineWidth = 1.6; blob(c, 0, 0, 15, 9, 5, 10, 0.12); c.fill(); c.stroke(); c.beginPath(); c.arc(13, 0, 6, 0, TAU); c.fill(); c.stroke();
        c.restore(); return;
      }
      c.fillStyle = 'rgba(0,0,0,0.45)'; blob(c, 4, 6, 15, 13, 7, 9, 0.25); c.fill();
      c.rotate(p.aim);
      const sw = p.moving ? Math.sin(p.walk) * 6 : 0, kick = p.flash > 0 ? -2.5 : 0, hurt = p.hurtT > 0.2;
      const G = (R.int && R.int.GUNLOOK && (R.int.GUNLOOK[p.cur] || R.int.GUNLOOK.pistol)) || { len: 16, w: 5 };
      c.fillStyle = INK; c.beginPath(); c.ellipse(sw, -6.5, 6.5, 3.8, 0, 0, TAU); c.ellipse(-sw, 6.5, 6.5, 3.8, 0, 0, TAU); c.fill();        // boots
      c.fillRect(8 + kick, 3 - G.w / 2 + 1, G.len + 2, Math.max(3, G.w * 0.8));                                                        // the gun: one black bar
      c.lineCap = 'round'; c.strokeStyle = INK; c.lineWidth = 6.6; c.beginPath(); c.moveTo(1, 10); c.lineTo(13 + kick, 5); c.moveTo(2, -10); c.lineTo(Math.min(20, 9 + G.len * 0.6) + kick, 2.5); c.stroke();
      c.strokeStyle = PAPER; c.lineWidth = 3.8; c.stroke();                                                                             // sleeves: paper inside a line
      c.fillStyle = hurt ? INK : PAPER; c.strokeStyle = INK; c.lineWidth = 1.7;
      c.beginPath(); c.roundRect(-13, -7, 7, 14, 3); c.fill(); c.stroke();                                                               // pack
      for (let k = 0; k < 2; k++) { blob(c, 0, 0, 9.5, 13, boil + k, 12, k ? 0.1 : 0.05); if (!k) c.fill(); c.stroke(); }                 // shoulders
      c.beginPath(); c.moveTo(-4, -9); c.lineTo(-4, 9); c.moveTo(-1, -11); c.lineTo(-1, 11); c.lineWidth = 0.8; c.stroke(); c.lineWidth = 1.7;
      c.beginPath(); c.arc(2.5, 0, 6.8, 0, TAU); c.fill(); c.stroke();                                                                  // head
      c.fillStyle = INK; c.beginPath(); c.arc(1.5, 0, 6.9, 1.15, TAU - 1.15); c.fill();                                                  // hair
      c.restore();
    },
    // builds: pale boxes drawn with a ruler nobody had, hatched on the shadow side
    sprite(R_, id) {
      const def = GD.STRUCTS[id];
      if (!def) return null;
      const turret = GD.TURRET_IDS.indexOf(id) >= 0;
      const known = { wood: 1, steel: 1, bunker: 1, gate: 1, fence: 1, wire: 1, spikes: 1, mine: 1, lamp: 1, lure: 1, medic: 1, trail: 1, ward: 1 };
      if (!known[id] && !(turret && (def.gun || id === 'turret' || id === 'cannon' || id === 'napalm' || id === 'tesla'))) return null;
      const S = 3, cv = mk(CELL * S, CELL * S), g = cv.getContext('2d'), sd = id.length * 13 + id.charCodeAt(0);
      g.scale(S, S); g.lineCap = 'round'; g.lineJoin = 'round';
      const rough = (x0, y0, x1, y1, k) => { g.beginPath(); g.moveTo(x0 + (hash(sd, k) - 0.5) * 2, y0 + (hash(sd, k + 1) - 0.5) * 2); g.lineTo(x1 + (hash(sd, k + 2) - 0.5) * 2, y1 + (hash(sd, k + 3) - 0.5) * 2); g.stroke(); };
      const box = (x, y, w, h, fill, n) => { g.fillStyle = fill; g.fillRect(x, y, w, h); g.strokeStyle = INK; for (let k = 0; k < (n || 3); k++) { g.lineWidth = 0.7 + hash(sd, k + 40) * 0.9; rough(x, y, x + w, y, k * 16); rough(x + w, y, x + w, y + h, k * 16 + 4); rough(x + w, y + h, x, y + h, k * 16 + 8); rough(x, y + h, x, y, k * 16 + 12); } };
      const hatch = (x, y, w, h, n, a) => { g.strokeStyle = `rgba(9,9,11,${a || 0.55})`; g.lineWidth = 0.6; g.beginPath(); for (let k = 0; k < n; k++) { const t = k / n; g.moveTo(x + w * t + 3, y + h); g.lineTo(x + w * t + (hash(sd, k + 70) - 0.5) * 2 + w * 0.22 + 3, y + h * (0.45 + hash(sd, k + 90) * 0.2)); } g.stroke(); };
      if (id === 'wood') { box(2, 2, 36, 36, '#a9a59b'); g.strokeStyle = INK; g.lineWidth = 0.8; for (let k = 1; k < 4; k++) rough(3, 2 + k * 9, 37, 2 + k * 9, k * 5 + 100); g.lineWidth = 2.2; rough(5, 34, 35, 6, 130); g.lineWidth = 0.6; rough(6, 35.5, 36, 7.5, 134); hatch(2, 2, 34, 36, 9, 0.4); }
      else if (id === 'steel') { box(1.5, 1.5, 37, 37, '#c9c5ba', 4); g.strokeStyle = INK; g.lineWidth = 0.7; for (let k = 1; k < 6; k++) rough(2 + k * 6, 3, 2 + k * 6, 37, k * 5 + 100); g.fillStyle = INK; for (const [x, y] of [[6, 6], [34, 6], [6, 34], [34, 34]]) { g.beginPath(); g.arc(x, y, 1.3, 0, TAU); g.fill(); } hatch(2, 2, 34, 36, 12); }
      else if (id === 'bunker') { box(1, 1, 38, 38, '#dcd8cd', 5); g.fillStyle = 'rgba(9,9,11,0.6)'; for (let k = 0; k < 46; k++) g.fillRect(3 + hash(sd, k) * 34, 3 + hash(sd, k + 50) * 34, 0.9, 0.9); g.strokeStyle = INK; g.lineWidth = 0.8; rough(22, 2, 25, 12, 200); rough(25, 12, 21, 20, 204); rough(21, 20, 27, 30, 208); hatch(2, 12, 34, 26, 14, 0.6); }
      else if (id === 'gate') { box(2, 2, 36, 36, '#b9b5ab'); g.strokeStyle = INK; g.lineWidth = 2; for (let k = 0; k < 3; k++) { g.beginPath(); g.moveTo(11, 13 + k * 8.5); g.lineTo(20, 8 + k * 8.5); g.lineTo(29, 13 + k * 8.5); g.stroke(); } }
      else if (id === 'fence') { g.strokeStyle = INK; g.lineWidth = 2.6; rough(5, 3, 5, 37, 1); rough(35, 3, 35, 37, 5); g.lineWidth = 0.9; for (let k = 0; k < 4; k++) rough(5, 8 + k * 8, 35, 8 + k * 8, 20 + k * 4); g.strokeStyle = PAPER; g.lineWidth = 1.6; g.beginPath(); g.moveTo(15, 6); g.lineTo(21, 16); g.lineTo(16, 18); g.lineTo(24, 30); g.stroke(); }
      else if (id === 'wire') { g.strokeStyle = INK; g.lineWidth = 0.9; for (let rw = 0; rw < 3; rw++) { g.beginPath(); for (let x = 2; x <= 38; x += 1) g.lineTo(x, 9 + rw * 11 + Math.sin(x * 0.9 + rw) * 5 * Math.cos(x * 0.31)); g.stroke(); } g.lineWidth = 2; rough(4, 4, 4, 36, 1); rough(36, 4, 36, 36, 5); }
      else if (id === 'spikes') { box(4, 4, 32, 32, '#9a968d', 2); g.fillStyle = INK; for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) { const x = 9.5 + i * 7, y = 10.5 + j * 7; g.beginPath(); g.moveTo(x - 2, y + 2); g.lineTo(x, y - 3); g.lineTo(x + 2, y + 2); g.fill(); } }
      else if (id === 'mine') { g.fillStyle = 'rgba(0,0,0,0.4)'; g.beginPath(); g.arc(22, 23, 10, 0, TAU); g.fill(); g.fillStyle = '#7d7a73'; g.strokeStyle = INK; g.lineWidth = 1.4; blob(g, 20, 20, 10, 10, sd, 10, 0.1); g.fill(); g.stroke(); rough(14, 14, 26, 26, 1); rough(26, 14, 14, 26, 5); }
      else if (id === 'lamp') { g.fillStyle = 'rgba(0,0,0,0.4)'; g.beginPath(); g.arc(22, 23, 11, 0, TAU); g.fill(); g.fillStyle = PAPER; g.strokeStyle = INK; g.lineWidth = 1.5; blob(g, 20, 20, 10, 10, sd, 10, 0.08); g.fill(); g.stroke(); g.lineWidth = 0.9; for (let k = 0; k < 8; k++) { const a = k / 8 * TAU; rough(20 + Math.cos(a) * 12, 20 + Math.sin(a) * 12, 20 + Math.cos(a) * 17, 20 + Math.sin(a) * 17, k * 4); } }
      else if (id === 'lure') { box(5, 9, 30, 22, '#a9a59b'); g.strokeStyle = INK; g.lineWidth = 1.2; g.beginPath(); g.arc(15, 20, 6, 0, TAU); g.stroke(); rough(31, 9, 37, 1, 300); for (let k = 0; k < 3; k++) rough(25, 14 + k * 5, 31, 14 + k * 5, 310 + k * 4); }
      else if (id === 'medic') { box(4, 4, 32, 32, PAPER, 4); g.fillStyle = INK; g.fillRect(16.5, 9, 7, 22); g.fillRect(9, 16.5, 22, 7); }
      else if (id === 'trail') { g.strokeStyle = 'rgba(9,9,11,0.6)'; g.lineWidth = 3; for (let k = 0; k < 5; k++) rough(5 + hash(sd, k) * 8, 8 + k * 6, 27 + hash(sd, k + 5) * 8, 10 + k * 6, k * 4 + 400); }
      else if (id === 'ward') { g.fillStyle = 'rgba(0,0,0,0.4)'; g.beginPath(); g.ellipse(23, 25, 11, 8, 0, 0, TAU); g.fill(); g.strokeStyle = INK; g.lineWidth = 3; rough(20, 5, 20, 37, 1); g.fillStyle = PAPER; g.lineWidth = 1.2; for (const y of [9, 19, 29]) { g.beginPath(); g.arc(20, y, 5, 0, TAU); g.fill(); g.stroke(); g.fillStyle = INK; g.fillRect(17.4, y - 1.4, 2, 2); g.fillRect(20.8, y - 1.4, 2, 2); g.fillStyle = PAPER; } }
      else { box(3, 3, 34, 34, '#77746d', 3); g.fillStyle = '#b9b5ab'; g.strokeStyle = INK; g.lineWidth = 1.3; blob(g, 20, 20, 12.5, 12.5, sd, 12, 0.08); g.fill(); g.stroke(); hatch(3, 3, 32, 34, 8, 0.5); }      // turret mount
      return cv;
    },
    // returns true when it has drawn the whole build itself
    struct(R_, c, s, alpha, noBase) {
      const def = GD.STRUCTS[s.id], x = s.cx * CELL, y = s.cy * CELL;
      const gunny = def.gun || s.id === 'turret' || s.id === 'cannon' || s.id === 'napalm';
      if (!gunny && !def.wall && !({ wire: 1, spikes: 1, mine: 1, lamp: 1, medic: 1, trail: 1 })[s.id]) return false;
      c.globalAlpha = alpha === undefined ? 1 : alpha;
      if (!noBase) c.drawImage(R_.sprite(s.id), x, y, CELL, CELL);
      if (alpha === undefined && def.wall && s.maxhp && s.hp < s.maxhp * 0.7) {             // damage: cracks scratched across it
        const k = 1 - s.hp / s.maxhp; c.strokeStyle = INK; c.lineWidth = 1.4; c.beginPath();
        for (let i = 0, n = Math.ceil(k * 5); i < n; i++) { let px = x + 6 + hash(s.uid, i) * 28, py = y + 4; c.moveTo(px, py); for (let j = 0; j < 4; j++) { px += (hash(s.uid, i * 7 + j) - 0.5) * 12; py += 8; c.lineTo(px, py); } }
        c.stroke();
      }
      if (gunny) {
        const G = (R.int && R.int.GUNLOOK && R.int.GUNLOOK[s.gun || def.gun]) || { len: s.id === 'cannon' ? 22 : 18, w: s.id === 'cannon' ? 10 : 6 }, kick = s.flash > 0 ? -2.5 : 0;
        c.save(); c.translate(s.x, s.y); c.rotate(s.ang || 0); c.lineCap = 'round';
        c.strokeStyle = INK; c.lineWidth = Math.max(4, G.w * 0.8); c.beginPath(); c.moveTo(2 + kick, 0); c.lineTo(G.len + 4 + kick, 0); c.stroke();
        c.strokeStyle = PAPER; c.lineWidth = 0.9; c.beginPath(); c.moveTo(4 + kick, -1.2); c.lineTo(G.len + kick, -1.2); c.stroke();
        c.fillStyle = INK; blob(c, 0, 0, 8, 8, s.uid, 9, 0.12); c.fill(); c.fillStyle = PAPER; c.beginPath(); c.arc(-1, 0, 2, 0, TAU); c.fill();
        c.restore();
        if (alpha === undefined && R_.showOwners && def.gun) { const nm = def.name.replace(' Turret', ''); c.font = 'bold 11px "Segoe UI", sans-serif'; c.textAlign = 'center'; c.fillStyle = INK; c.fillText(nm, s.x, s.y + 32); }
      } else if (s.id === 'mine' && Math.sin(R_.time * 6 + s.uid) > 0.4) { c.fillStyle = PAPER; c.beginPath(); c.arc(s.x, s.y, 2.4, 0, TAU); c.fill(); }
      if (alpha === undefined && R_.showOwners) { c.fillStyle = R_.ownerColor(s.owner); c.fillRect(x + 2, y + 2, 5, 5); }
      if (s.hitT > 0 && alpha === undefined) { c.globalAlpha = 0.7; c.fillStyle = PAPER; c.fillRect(x + 2, y + 2, CELL - 4, CELL - 4); }
      c.globalAlpha = 1;
      return true;
    },
    // drawn before any build: every wall throws the same hard black shadow down and to the right, as if cut from card
    under(R_, c, sim) {
      c.fillStyle = 'rgba(5,5,7,0.78)';
      for (const s of sim.structs) { const d = GD.STRUCTS[s.id]; if (d && d.block && !d.husk) c.fillRect(s.cx * CELL + 6, s.cy * CELL + 7, CELL, CELL); }
    },
    // the campfire: stacked tongues of flame, redrawn 7 times a second, the only saturated shapes on the page
    flames(R_, c, fireS) {
      if (fireS <= 0) return;
      const F = root.SIM.FIRE, b = Math.floor(R_.time * 7);
      c.globalCompositeOperation = 'source-over';
      const cols = ['#a8140e', '#d8401a', '#f2781c', '#ffa62e', '#ffd066', '#fff3cc'];
      for (let i = 0; i < 6; i++) {
        const w = (13 - i * 2) * fireS, h = (30 - i * 4.2) * fireS, lean = (hash(b, i) - 0.5) * 9, x = F.x + (hash(b, i + 9) - 0.5) * 4, y = F.y + 7 - i * 1.2;
        c.globalAlpha = 0.92; c.fillStyle = cols[i];
        c.beginPath(); c.moveTo(x - w, y); c.quadraticCurveTo(x - w * 1.05, y - h * 0.5, x + lean, y - h); c.quadraticCurveTo(x + w * 1.05, y - h * 0.45, x + w, y); c.quadraticCurveTo(x, y + w * 0.7, x - w, y); c.fill();
      }
      c.globalAlpha = 0.8; c.strokeStyle = '#1a0a06'; c.lineWidth = 1.1; c.lineCap = 'round';         // a few dark strokes for the logs
      for (let k = 0; k < 3; k++) { c.beginPath(); c.moveTo(F.x - 15 + hash(b, k + 20) * 4, F.y + 6 + k * 2.5); c.lineTo(F.x + 15 - hash(b, k + 30) * 4, F.y + 9 - k * 2); c.stroke(); }
      c.globalAlpha = 1; c.globalCompositeOperation = 'lighter';
    },
    // above the grey layer, in colour: the tracers are the only warm lines on the page
    over(R_, c, sim) {
      c.lineCap = 'round'; c.strokeStyle = 'rgba(255,170,60,0.95)'; c.lineWidth = 1.7; c.beginPath();
      for (const b of sim.bullets) { if (b.kind !== 'bullet' || b.wid === 'saw') continue; const sp = Math.hypot(b.vx, b.vy) || 1, tl = b.wid === 'sniper' || b.wid === 'rail' ? 70 : 30; c.moveTo(b.x, b.y); c.lineTo(b.x - b.vx / sp * tl, b.y - b.vy / sp * tl); }
      c.stroke();
    },
  };
  R.LOOKS = R.LOOKS || {};
  R.LOOKS.charcoal = look;
  R.SHAPES = SHAPE;                 // the outline table (proportions per enemy type) is shared by the other looks
})(window);
