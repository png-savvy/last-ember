// Last Ember - graphics style "Cross-stitch sampler". The game is embroidered: a sheet of linen lies over the world
// with an X-shaped hole for every stitch (8 px), so whatever is drawn underneath shows only as crosses of thread.
// Figures are flat blocks of colour; as they move, the stitches they pass under change colour, like animated needlework.
// Nothing is ever unpicked: every kill leaves a loose end of red thread lying on the cloth until the run ends.
(function (root) {
  'use strict';
  const R = root.Renderer;
  if (!R) return;
  const GD = root.GD, { CELL, W, H } = GD, FIRE = root.SIM.FIRE, TAU = Math.PI * 2, ST = 8;
  const LINEN = '#e6dcc2';
  const hash = (a, b) => { let n = (a * 374761393 + b * 668265263) | 0; n = (n ^ (n >>> 13)) * 1274126177 | 0; return ((n ^ (n >>> 16)) >>> 0) / 4294967296; };
  const mk = (w, h) => { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; };
  const shape = (t) => (R.SHAPES && (R.SHAPES[t] || R.SHAPES.walker)) || { w: 0.95, l: 0.7, h: 0.5, arm: 1.35 };
  // thread colours for the dead: the hue of each kind's classic colour, in a dark skein so it shows on the pale field
  const SK = {};
  function skein(type) {
    if (SK[type]) return SK[type];
    const hex = ((R.int && R.int.ZLOOK && (R.int.ZLOOK[type] || R.int.ZLOOK.walker)) || {}).body || '#5d7a4a', n = parseInt(hex.slice(1), 16);
    const r = (n >> 16) / 255, g = ((n >> 8) & 255) / 255, b = (n & 255) / 255, mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn || 1e-6;
    const h = Math.round((((mx === r ? ((g - b) / d) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4) * 60) + 360) % 360);
    return (SK[type] = [`hsl(${h},48%,24%)`, `hsl(${h},42%,38%)`]);
  }
  function drawCloth(g) {
    g.globalCompositeOperation = 'source-over'; g.clearRect(0, 0, W, H);
    const t = mk(ST, ST), q = t.getContext('2d');
    q.fillStyle = LINEN; q.fillRect(0, 0, ST, ST);
    q.fillStyle = 'rgba(120,104,70,0.2)'; q.fillRect(0, 0, ST, 1); q.fillRect(0, 0, 1, ST);                       // the weave
    q.fillStyle = 'rgba(255,255,255,0.22)'; q.fillRect(0, 4, ST, 1);
    q.globalCompositeOperation = 'destination-out'; q.lineCap = 'round'; q.lineWidth = 2.5; q.strokeStyle = '#000';     // one stitch: two strokes of thread
    q.beginPath(); q.moveTo(1.3, 1.3); q.lineTo(6.7, 6.7); q.moveTo(6.7, 1.3); q.lineTo(1.3, 6.7); q.stroke();
    q.globalCompositeOperation = 'source-over';
    q.strokeStyle = 'rgba(255,255,255,0.28)'; q.lineWidth = 0.7; q.beginPath(); q.moveTo(1.6, 1.2); q.lineTo(6.6, 6.2); q.stroke();        // sheen on the top thread
    q.strokeStyle = 'rgba(0,0,0,0.3)'; q.beginPath(); q.moveTo(6.9, 1.9); q.lineTo(1.9, 6.9); q.stroke();                                 // and the shadow where they cross
    g.fillStyle = g.createPattern(t, 'repeat'); g.fillRect(0, 0, W, H);
  }
  const sq = (c, x, y, s, col) => { c.fillStyle = col; c.fillRect(x - s / 2, y - s / 2, s, s); };
  const look = {
    fxInk: '240,192,32', fxDash: [8, 8],
    // what flies is thread: whole stitches thrown loose (drawn under the cloth, so they show as crosses on the move)
    fleck(R_, c, p, bile) { c.fillStyle = bile ? '#8a9a2a' : '#c2182b'; c.fillRect(Math.floor(p.x / ST) * ST, Math.floor(p.y / ST) * ST, ST, ST); },
    // the dead: the figure is still in the cloth, but half its stitches have been pulled, and what is left has faded
    body(R_, d, e, r, torn) {
      const T = skein(e.ztype || 'walker'), n = Math.max(2, Math.round(r / 4.5));
      d.setTransform(1, 0, 0, 1, 0, 0);                         // stitches follow the weave, not the fall of the body
      const x0 = Math.floor(e.x / ST) * ST, y0 = Math.floor(e.y / ST) * ST;
      for (let j = -n; j <= n; j++) for (let i = -n - 1; i <= n + 1; i++) {
        if (i * i * 0.55 + j * j > n * n || hash(i + (e.x | 0), j + (e.y | 0)) < (torn ? 0.55 : 0.34)) continue;
        d.globalAlpha = 0.85; d.fillStyle = hash(i, j + (e.x | 0)) < 0.5 ? T[1] : '#8a8474'; d.fillRect(x0 + i * ST, y0 + j * ST, ST, ST);
      }
      d.globalAlpha = 1;
    },
    // blood: worked into the picture as red stitches, a cluster of crosses where each wound landed (kills also leave a loose thread)
    splat(R_, d, x, y, r, bile, alpha, ang) {
      const cols = bile ? ['#6f7a1e', '#8a9a2a'] : ['#c2182b', '#a81424', '#d8304a'], n = Math.max(1, Math.round(r * r / 26));
      for (let i = 0; i < n; i++) {
        const a = ang === undefined ? Math.random() * TAU : ang + (Math.random() - 0.5) * 1.6, dist = Math.sqrt(Math.random()) * r * (ang === undefined ? 1.3 : 2.2);
        d.globalAlpha = 1; d.fillStyle = cols[(Math.random() * cols.length) | 0];
        d.fillRect(Math.floor((x + Math.cos(a) * dist) / ST) * ST, Math.floor((y + Math.sin(a) * dist) / ST) * ST, ST, ST);
      }
    },
    dark: '16,20,56', darkK: 0.86, eye: '#ffe26a', filter: 'saturate(1.5) contrast(1.08)', filterGround: true, corpse: '#4a3a3a',
    hudFont: '"Courier New", Courier, monospace', titleFont: '700 PXpx "Courier New", Courier, monospace',
    blood: ['#c2182b', '#a81424', '#d42034', '#b01628', '#98101e', '#cc1c30'], bile: ['#6f7a1e', '#606a18', '#7d8826', '#565e14'],
    overlay(R_) { const cv = mk(W, H); drawCloth(cv.getContext('2d')); R_.clothCtx = cv.getContext('2d'); return cv; },
    reset(R_) { if (R_.clothCtx) drawCloth(R_.clothCtx); },
    // a kill is never unpicked: a loose end of red thread is left lying on the cloth, with a knot where it happened
    event(R_, e) {
      if (e.type !== 'die' || !R_.clothCtx || R_.gore === 0) return;
      const g = R_.clothCtx, n = (R_.threads = (R_.threads || 0) + 1);
      if (n > 1400) return;                                  // the cloth only holds so much
      let x = e.x, y = e.y, a = Math.random() * TAU;
      g.strokeStyle = '#b3182a'; g.lineWidth = 1.5; g.lineCap = 'round';
      g.beginPath(); g.moveTo(x, y);
      for (let k = 0, m = 3 + ((Math.random() * 4) | 0) + (e.r > 20 ? 4 : 0); k < m; k++) { a += (Math.random() - 0.5) * 2.2; const nx = x + Math.cos(a) * 14, ny = y + Math.sin(a) * 14; g.quadraticCurveTo(x + Math.cos(a + 1) * 8, y + Math.sin(a + 1) * 8, nx, ny); x = nx; y = ny; }
      g.stroke();
      g.strokeStyle = 'rgba(60,6,12,0.5)'; g.lineWidth = 0.6; g.stroke();
      g.fillStyle = '#8a1020'; g.beginPath(); g.arc(e.x, e.y, 2.2, 0, TAU); g.fill();
      if (Math.random() < 0.14) {                            // now and then the needle is left in the work, still threaded
        const q = Math.random() * TAU, L = 26, nx = x + Math.cos(q) * L, ny = y + Math.sin(q) * L;
        g.strokeStyle = 'rgba(0,0,0,0.3)'; g.lineWidth = 2.2; g.beginPath(); g.moveTo(x + 1.5, y + 2); g.lineTo(nx + 1.5, ny + 2); g.stroke();
        g.strokeStyle = '#d8dce2'; g.lineWidth = 1.8; g.beginPath(); g.moveTo(x, y); g.lineTo(nx, ny); g.stroke();
        g.strokeStyle = '#6a7078'; g.lineWidth = 0.8; g.beginPath(); g.ellipse(x + Math.cos(q) * 3, y + Math.sin(q) * 3, 2.4, 0.9, q, 0, TAU); g.stroke();
      }
    },
    ground(R_, g) {
      const cols = ['#8fae6a', '#a3bd7c', '#7c9c5c', '#b2c888'], earth = ['#c9a878', '#b8966a', '#d6b88a'];
      for (let y = 0; y < H; y += ST) for (let x = 0; x < W; x += ST) {
        const cx = x / ST, cy = y / ST, v = hash((cx / 6) | 0, (cy / 6) | 0) * 0.6 + hash((cx / 2) | 0, (cy / 2) | 0) * 0.25 + hash(cx, cy) * 0.15, d = Math.hypot(x - FIRE.x, y - FIRE.y);
        let col = cols[Math.min(3, (v * 4) | 0)];
        if (d < 150 + hash(cx, cy + 7) * 70) col = earth[(hash(cx, cy + 3) * 3) | 0];
        else { const f = hash(cx + 11, cy + 5); if (f > 0.9975) col = '#d8405a'; else if (f > 0.995) col = '#f0d050'; else if (f > 0.9925) col = '#f4f0e0'; }      // flowers, one stitch each
        g.fillStyle = col; g.fillRect(x, y, ST, ST);
      }
      const tree = (x, y) => { g.fillStyle = '#2f5a34'; for (let k = 0; k < 4; k++) g.fillRect(x - (k + 1) * ST / 2, y + k * ST, (k + 1) * ST, ST); g.fillStyle = '#5a3a20'; g.fillRect(x - ST / 2, y + 4 * ST, ST, ST); };     // a row of little firs, as on every sampler
      for (let x = ST * 6; x < W - ST * 4; x += ST * 9) { tree(x, ST * 5); tree(x + ST * 4, H - ST * 11); }
      for (let y = ST * 14; y < H - ST * 14; y += ST * 9) { tree(ST * 7, y); tree(W - ST * 7, y + ST * 4); }
      const band = (x, y, w, h, hor) => { for (let i = 0; i < (hor ? w : h) / ST; i++) { const z = i % 4; g.fillStyle = z === 0 ? '#b3182a' : z === 2 ? '#23306a' : LINEN; if (hor) { g.fillRect(x + i * ST, y, ST, ST * 3); g.fillStyle = '#23306a'; g.fillRect(x + i * ST, y + (z < 2 ? 0 : ST * 2), ST, ST); } else { g.fillRect(x, y + i * ST, ST * 3, ST); g.fillStyle = '#23306a'; g.fillRect(x + (z < 2 ? 0 : ST * 2), y + i * ST, ST, ST); } } };
      band(0, 0, W, 0, true); band(0, H - ST * 3, W, 0, true); band(0, 0, 0, H, false); band(W - ST * 3, 0, 0, H, false);
      g.fillStyle = 'rgba(35,48,106,0.55)'; g.font = '700 46px "Courier New", monospace'; g.textAlign = 'center';
      try { g.letterSpacing = '14px'; } catch (e) { /* older browsers */ }
      g.fillText('KEEP THE FIRE BURNING', W / 2, H - ST * 15); g.fillText('A B C D E F  ·  NIGHT AFTER NIGHT  ·  1 2 3 4', W / 2, ST * 19);
    },
    zombie(R_, c, z) {
      const za = z.vis === undefined ? 1 : z.vis;
      if (z.burrowed) { R_.drawBurrow(c, z); return; }
      const S = shape(z.type), r = z.r, air = z.air || 0, hit = z.hitT > 0, T = skein(z.type);
      const A = hit ? '#fffdf2' : z.burn > 0 ? '#b8501a' : T[0], B = hit ? '#fffdf2' : z.burn > 0 ? '#e8902a' : T[1];
      const ca = Math.cos(z.ang || 0), sa = Math.sin(z.ang || 0), x = z.x, y = z.y - air * 16, wob = Math.sin(z.wob || 0), lunge = Math.max(0, z.lunge || 0);
      c.globalAlpha = za;
      const big = r * 2 * (1 + air * 0.35);
      if (z.champ) sq(c, x, y, big * 1.5, '#e8b020');
      if (z.rage > 0) sq(c, x, y, big * 1.5, '#d42034');
      if (z.chill > 0) sq(c, x, y, big * 1.4, '#9ad0f0');
      if (z.raised) sq(c, x, y, big * 1.4, '#9a70d0');
      if (S.seg) { sq(c, x, y, big * 0.95, A); sq(c, x, y, big * 0.45, B); if (S.head) { sq(c, x + ca * r, y + sa * r, r * 1.1, B); sq(c, x + ca * r * 1.2 - sa * 5, y + sa * r * 1.2 + ca * 5, 5, '#ffe26a'); sq(c, x + ca * r * 1.2 + sa * 5, y + sa * r * 1.2 - ca * 5, 5, '#ffe26a'); } c.globalAlpha = 1; return; }
      const bw = big * (0.72 + 0.2 * (S.w - 0.9));
      if (S.mark === 'wings') { const f = Math.sin(R_.time * 40 + z.id) > 0 ? 1 : 0.5; sq(c, x - sa * r * 1.4 * f, y + ca * r * 1.4 * f, r * 1.2, '#dfe8f4'); sq(c, x + sa * r * 1.4 * f, y - ca * r * 1.4 * f, r * 1.2, '#dfe8f4'); }
      if (S.mark === 'robe') sq(c, x - ca * r * 1.1, y - sa * r * 1.1, big * 0.8, A);
      if (S.arm) for (const sd of [-1, 1]) {            // hands: a block each, one ahead of the other
        const reach = r * (S.arm * 0.82 + sd * wob * 0.25 + lunge * 0.5), off = r * 0.62;
        sq(c, x + ca * reach - sa * off * sd, y + sa * reach + ca * off * sd, Math.max(5, r * (S.armW ? 0.75 : 0.5)), B);
      }
      sq(c, x, y, bw + 5, '#1a1410'); sq(c, x, y, bw, A);       // backstitched in black
      if (S.mark === 'belly' || S.mark === 'eggs') sq(c, x - ca * 2, y - sa * 2, bw * 0.5, B);
      if (S.mark === 'plates') { sq(c, x - sa * bw * 0.26, y + ca * bw * 0.26, bw * 0.3, '#c9d2dc'); sq(c, x + sa * bw * 0.26, y - ca * bw * 0.26, bw * 0.3, '#c9d2dc'); }
      if (S.mark === 'horns' || S.mark === 'spikes') for (const sd of [-1, 1]) sq(c, x + ca * r * 1.2 - sa * r * 0.8 * sd, y + sa * r * 1.2 + ca * r * 0.8 * sd, 6, '#f4f0e0');
      const hx = x + ca * r * 0.78, hy = y + sa * r * 0.78, hs = Math.max(8, r * S.h * 2);
      sq(c, hx, hy, hs, B);
      const e = hs * 0.28; sq(c, hx + ca * hs * 0.2 - sa * e, hy + sa * hs * 0.2 + ca * e, 3.4, hit ? '#23306a' : '#ffe26a'); sq(c, hx + ca * hs * 0.2 + sa * e, hy + sa * hs * 0.2 - ca * e, 3.4, hit ? '#23306a' : '#ffe26a');
      c.globalAlpha = 1;
    },
    player(R_, c, p) {
      if (p.down) { sq(c, p.x, p.y, 34, '#c2182b'); sq(c, p.x, p.y, 20, p.color); return; }
      const ca = Math.cos(p.aim), sa = Math.sin(p.aim), kick = p.flash > 0 ? -3 : 0, sw = p.moving ? (Math.sin(p.walk) > 0 ? 4 : -4) : 0;
      const G = (R.int && R.int.GUNLOOK && (R.int.GUNLOOK[p.cur] || R.int.GUNLOOK.pistol)) || { len: 16 };
      sq(c, p.x - ca * 4 + sa * (6 + sw), p.y - sa * 4 - ca * (6 + sw), 8, '#3a2a1c'); sq(c, p.x - ca * 4 - sa * (6 - sw), p.y - sa * 4 + ca * (6 - sw), 8, '#3a2a1c');     // boots
      for (let k = 0, n = Math.max(2, Math.round(G.len / 7)); k < n; k++) sq(c, p.x + ca * (14 + kick + k * 7) - sa * 3, p.y + sa * (14 + kick + k * 7) + ca * 3, 6, '#2a2e38');   // the gun: a row of dark stitches
      sq(c, p.x, p.y, 30, '#23306a');                       // a navy outline row, so the living stand out from the field
      sq(c, p.x, p.y, 22, p.hurtT > 0.2 ? '#fffdf2' : p.color);
      sq(c, p.x + ca * 5, p.y + sa * 5, 13, '#f0cfa8');
      sq(c, p.x + ca * 1, p.y + sa * 1, 9, '#5a3a20');
    },
    // builds are 5 x 5 stitch motifs, as a sampler would chart them
    sprite(R_, id) {
      const def = GD.STRUCTS[id]; if (!def) return null;
      const turret = GD.TURRET_IDS.indexOf(id) >= 0;
      const M = {
        wood: ['abcba', 'bcccb', 'ccacc', 'bcccb', 'abcba', { a: '#5a3a20', b: '#8a5a2c', c: '#b07a3c' }],
        steel: ['aaaaa', 'abcba', 'acbca', 'abcba', 'aaaaa', { a: '#3a4a66', b: '#8ea0bc', c: '#c2cede' }],
        bunker: ['aaaaa', 'abbba', 'abcba', 'abbba', 'aaaaa', { a: '#4a4a4a', b: '#a8a498', c: '#e0dcd0' }],
        gate: ['aaaaa', 'abcba', 'acbca', 'abcba', 'aaaaa', { a: '#1f5a30', b: '#3f9a50', c: '#b8e8a0' }],
        fence: ['a...a', 'abbba', 'a.c.a', 'abbba', 'a...a', { a: '#3a3a3a', b: '#e8c020', c: '#fff0a0' }],
        wire: ['.....', 'a.a.a', '.a.a.', 'a.a.a', '.....', { a: '#8a909c' }],
        spikes: ['.....', '.a.a.', '.....', '.a.a.', '.....', { a: '#f4f0e0' }],
        mine: ['.....', '.aaa.', '.aba.', '.aaa.', '.....', { a: '#4a5238', b: '#d42034' }],
        lamp: ['..a..', '.aba.', 'abcba', '.aba.', '..a..', { a: '#e8c020', b: '#fff0a0', c: '#ffffff' }],
        lure: ['.....', 'aaaaa', 'abaca', 'aaaaa', '.....', { a: '#3f6a44', b: '#1c2c20', c: '#e8c020' }],
        medic: ['aaaaa', 'aabaa', 'abbba', 'aabaa', 'aaaaa', { a: '#f4f0e0', b: '#d42034' }],
        trail: ['.....', 'a.a.a', '.....', '.a.a.', '.....', { a: '#c2182b' }],
        ward: ['..a..', '.aba.', '..a..', '.aba.', '..c..', { a: '#f4f0e0', b: '#23306a', c: '#5a3a20' }],
        turret: ['aaaaa', 'ab.ba', 'a.c.a', 'ab.ba', 'aaaaa', { a: '#23306a', b: '#8ea0bc', c: '#d42034' }],
      };
      const m = M[id] || (turret && (def.gun || id === 'cannon' || id === 'napalm' || id === 'tesla') ? M.turret : null);
      if (!m) return null;
      const cv = mk(CELL, CELL), g = cv.getContext('2d'), pal = m[5];
      for (let j = 0; j < 5; j++) for (let i = 0; i < 5; i++) { const k = m[j][i]; if (k !== '.') { g.fillStyle = pal[k]; g.fillRect(i * ST, j * ST, ST, ST); } }
      return cv;
    },
    struct(R_, c, s, alpha, noBase) {
      const def = GD.STRUCTS[s.id], x = s.cx * CELL, y = s.cy * CELL;
      const gunny = def.gun || s.id === 'turret' || s.id === 'cannon' || s.id === 'napalm';
      if (!gunny && !def.wall && !({ wire: 1, spikes: 1, mine: 1, lamp: 1, medic: 1, trail: 1 })[s.id]) return false;
      c.globalAlpha = alpha === undefined ? 1 : alpha;
      if (!noBase) c.drawImage(R_.sprite(s.id), x, y, CELL, CELL);
      if (alpha === undefined && s.maxhp && s.hp < s.maxhp * 0.8 && (def.wall || gunny)) {       // damage: stitches come out, one by one, and the linen shows
        const k = 1 - s.hp / s.maxhp; c.fillStyle = LINEN;
        for (let i = 0, n = Math.ceil(k * 14); i < n; i++) c.fillRect(x + ((hash(s.uid, i) * 5) | 0) * ST, y + ((hash(s.uid, i + 31) * 5) | 0) * ST, ST, ST);
      }
      if (gunny) { const ca = Math.cos(s.ang || 0), sa = Math.sin(s.ang || 0), kick = s.flash > 0 ? -3 : 0; for (let k = 1; k <= 3; k++) sq(c, s.x + ca * (k * 7 + kick), s.y + sa * (k * 7 + kick), 7, s.flash > 0 && k === 3 ? '#ffe26a' : '#f4f0e0'); }
      if (alpha === undefined && R_.showOwners) { c.fillStyle = R_.ownerColor(s.owner); c.fillRect(x, y, ST, ST); }
      if (s.hitT > 0 && alpha === undefined) { c.globalAlpha = 0.7; c.fillStyle = '#fffdf2'; c.fillRect(x, y, CELL, CELL); }
      c.globalAlpha = 1;
      return true;
    },
    // shots are a running stitch of gold thread, drawn over the cloth
    over(R_, c, sim) {
      c.lineCap = 'butt'; c.strokeStyle = '#f0c020'; c.lineWidth = 2.4; c.setLineDash([7, 5]); c.beginPath();
      for (const b of sim.bullets) { if (b.kind !== 'bullet' || b.wid === 'saw') continue; const sp = Math.hypot(b.vx, b.vy) || 1, tl = b.wid === 'sniper' || b.wid === 'rail' ? 90 : 44; c.moveTo(b.x, b.y); c.lineTo(b.x - b.vx / sp * tl, b.y - b.vy / sp * tl); }
      c.stroke(); c.setLineDash([]);
    },
    // fire: a charted flame motif that alternates between two patterns, and sparks one stitch big
    hot(R_, c, fireS) {
      c.globalCompositeOperation = 'source-over';
      for (const p of R_.parts) {
        const t = Math.max(0, Math.min(1, p.life / p.max));
        if (p.k === 'fire') sq(c, p.x, p.y, ST, t > 0.6 ? '#ffd040' : t > 0.3 ? '#f08020' : '#c2381a');
        else if (p.k === 'acid') sq(c, p.x, p.y, ST, '#8a9a2a');
        else if (p.k === 'spark' || p.k === 'ember') sq(c, p.x, p.y, 5, '#ffe26a');
      }
      if (fireS > 0) {
        const F = Math.floor(R_.time * 3) % 2 ? ['..a..', '.aba.', '.abba', 'abcba', 'abcba', '.aaa.'] : ['.a...', '.aa..', 'abba.', 'abcba', 'abcba', '.aaa.'], pal = { a: '#d8401a', b: '#f08a20', c: '#ffd850' };
        const n = fireS > 0.7 ? 6 : 4, x0 = Math.floor(FIRE.x / ST) * ST - 2 * ST, y0 = Math.floor(FIRE.y / ST) * ST - (n - 2) * ST;
        for (let j = 6 - n; j < 6; j++) for (let i = 0; i < 5; i++) { const k = F[j][i]; if (k !== '.') { c.fillStyle = pal[k]; c.fillRect(x0 + i * ST, y0 + (j - (6 - n)) * ST, ST, ST); } }
      }
      c.globalCompositeOperation = 'lighter';
    },
  };
  R.LOOKS = R.LOOKS || {};
  R.LOOKS.stitch = look;
})(window);
