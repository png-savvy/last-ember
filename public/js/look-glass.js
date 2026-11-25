// Last Ember - graphics style "Stained glass". The camp as a cathedral window: the ground is a mosaic of leaded panes
// (deep blue far away, amber where the campfire stands like the sun behind the glass), and every figure and build is
// made of flat jewel-coloured pieces held in thick black lead. Damage does not dent glass: it cracks it.
(function (root) {
  'use strict';
  const R = root.Renderer;
  if (!R) return;
  const GD = root.GD, { CELL, W, H } = GD, FIRE = root.SIM.FIRE, TAU = Math.PI * 2;
  const LEAD = '#07070a';
  const hash = (a, b) => { let n = (a * 374761393 + b * 668265263) | 0; n = (n ^ (n >>> 13)) * 1274126177 | 0; return ((n ^ (n >>> 16)) >>> 0) / 4294967296; };
  const mk = (w, h) => { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; };
  const shape = (t) => (R.SHAPES && (R.SHAPES[t] || R.SHAPES.walker)) || { w: 0.95, l: 0.7, h: 0.5, arm: 1.35 };
  // each kind of dead is cut from its own colour of glass: the hue of its classic colour, pushed to a jewel
  const HUE = {};
  function hue(type) {
    if (HUE[type] !== undefined) return HUE[type];
    const hex = ((R.int && R.int.ZLOOK && (R.int.ZLOOK[type] || R.int.ZLOOK.walker)) || {}).body || '#5d7a4a', n = parseInt(hex.slice(1), 16);
    const r = (n >> 16) / 255, g = ((n >> 8) & 255) / 255, b = (n & 255) / 255, mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn || 1e-6;
    let h = mx === r ? ((g - b) / d) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
    return (HUE[type] = Math.round((h * 60 + 360) % 360));
  }
  // a piece of glass: filled, then leaded
  const pane = (c, fill, lw) => { c.fillStyle = fill; c.fill(); c.strokeStyle = LEAD; c.lineWidth = lw || 2.4; c.lineJoin = 'round'; c.stroke(); };
  const look = {
    // what flies: splinters of red glass, turning over and catching the light
    fleck(R_, c, p, bile) { const t = Math.max(0, p.life / p.max), q = (1 - t) * 14 + p.size, s = 2.5 + p.size * 1.8; c.fillStyle = bile ? '#56a84e' : (Math.sin(q * 3) > 0.6 ? '#ffd0d0' : '#d42024'); c.strokeStyle = LEAD; c.lineWidth = 0.8; c.beginPath(); c.moveTo(p.x + Math.cos(q) * s, p.y + Math.sin(q) * s); c.lineTo(p.x + Math.cos(q + 2.3) * s * 0.8, p.y + Math.sin(q + 2.3) * s * 0.8); c.lineTo(p.x + Math.cos(q + 4.1) * s * 0.5, p.y + Math.sin(q + 4.1) * s * 0.5); c.closePath(); c.fill(); c.stroke(); },
    // the dead: the figure has fallen out of the window. A heap of its own coloured glass, and the hole it left
    body(R_, d, e, r, torn) {
      const h = hue(e.ztype || 'walker'), n = torn ? 14 : 9, sp = torn ? 2.4 : 1.3;
      d.globalAlpha = 0.95; d.lineJoin = 'round';
      for (let i = 0; i < n; i++) {
        const a = Math.random() * TAU, dist = Math.sqrt(Math.random()) * r * sp, sx = Math.cos(a) * dist, sy = Math.sin(a) * dist * 0.8, s = r * (0.25 + Math.random() * 0.4), rot = Math.random() * TAU;
        d.beginPath(); for (let k = 0; k < 3 + (i % 2); k++) { const q = rot + k * (TAU / (3 + (i % 2))) + (Math.random() - 0.5) * 0.5; k ? d.lineTo(sx + Math.cos(q) * s, sy + Math.sin(q) * s) : d.moveTo(sx + Math.cos(q) * s, sy + Math.sin(q) * s); } d.closePath();
        d.fillStyle = e.burn ? `hsl(20,60%,${14 + i * 2}%)` : `hsl(${h},${55 + (i % 3) * 8}%,${26 + (i % 4) * 8}%)`; d.fill(); d.strokeStyle = LEAD; d.lineWidth = 1.5; d.stroke();
      }
      d.strokeStyle = 'rgba(255,255,255,0.5)'; d.lineWidth = 0.7; d.beginPath(); for (let i = 0; i < 4; i++) { const a = Math.random() * TAU; d.moveTo(Math.cos(a) * r * 0.3, Math.sin(a) * r * 0.3); d.lineTo(Math.cos(a) * r * 0.7, Math.sin(a) * r * 0.5); } d.stroke();
      d.globalAlpha = 1;
    },
    // blood: the window breaks. Shards of red glass, each in its own lead, lie where it happened, and the pane cracks.
    splat(R_, d, x, y, r, bile, alpha, ang) {
      const rnd = (a, b) => a + Math.random() * (b - a), cols = bile ? ['#3f8a3a', '#56a84e'] : ['#c0181c', '#e02a2e', '#8a0f12'];
      d.lineJoin = 'round'; d.globalAlpha = Math.min(1, alpha * 1.3);
      for (let i = 0, n = r < 8 ? 2 : 4 + Math.round(r / 3); i < n; i++) {
        const a = ang === undefined ? rnd(0, TAU) : ang + rnd(-0.9, 0.9), dist = r * rnd(0.1, ang === undefined ? 1.5 : 2.6), sx = x + Math.cos(a) * dist, sy = y + Math.sin(a) * dist, s = rnd(2.5, 4 + r * 0.3), rot = rnd(0, TAU);
        d.beginPath(); for (let k = 0; k < 3; k++) { const q = rot + k * 2.1 + rnd(-0.4, 0.4), l = s * rnd(0.6, 1.2); k ? d.lineTo(sx + Math.cos(q) * l, sy + Math.sin(q) * l) : d.moveTo(sx + Math.cos(q) * l, sy + Math.sin(q) * l); } d.closePath();
        d.fillStyle = cols[(Math.random() * cols.length) | 0]; d.fill(); d.strokeStyle = LEAD; d.lineWidth = 1.2; d.stroke();
        d.strokeStyle = 'rgba(255,255,255,0.5)'; d.lineWidth = 0.6; d.beginPath(); d.moveTo(sx - s * 0.3, sy - s * 0.2); d.lineTo(sx + s * 0.1, sy - s * 0.35); d.stroke();        // a glint
      }
      if (r > 14) {                                             // a hole knocked clean through: raw daylight in a ragged gap
        d.globalAlpha = 0.9; d.beginPath(); for (let i = 0; i < 6; i++) { const q = i / 6 * TAU + rnd(-0.3, 0.3), k = r * rnd(0.25, 0.5); i ? d.lineTo(x + Math.cos(q) * k, y + Math.sin(q) * k) : d.moveTo(x + Math.cos(q) * k, y + Math.sin(q) * k); } d.closePath();
        d.fillStyle = '#fff6d0'; d.fill(); d.strokeStyle = LEAD; d.lineWidth = 1.4; d.stroke();
      }
      if (r > 10) {                                             // a kill cracks the pane it happened on
        d.strokeStyle = 'rgba(255,255,255,0.55)'; d.lineWidth = 0.9; d.lineCap = 'round'; d.beginPath();
        for (let i = 0, n = 3 + (r / 8 | 0); i < n; i++) { let a = rnd(0, TAU), px = x, py = y; d.moveTo(px, py); for (let k = 0; k < 3; k++) { a += rnd(-0.5, 0.5); px += Math.cos(a) * r * rnd(0.6, 1.1); py += Math.sin(a) * r * rnd(0.6, 1.1); d.lineTo(px, py); } }
        d.stroke();
      }
    },
    dark: '5,6,26', darkK: 0.92, eye: '#ffe26a', filter: 'saturate(1.45) contrast(1.12)', corpse: '#3c3358',
    hudFont: '"Palatino Linotype", Palatino, "Book Antiqua", Georgia, serif', titleFont: '700 PXpx "Palatino Linotype", Palatino, Georgia, serif',
    blood: ['#c0181c', '#a81216', '#d42024', '#b4141a', '#9c1014', '#cc1c20'], bile: ['#3f8a3a', '#347a30', '#4a9a44', '#2f6e2c'],
    ground(R_, g) {
      const rnd = (a, b) => a + Math.random() * (b - a);
      const N = 32, M = 18, pt = [];
      for (let j = 0; j <= M; j++) for (let i = 0; i <= N; i++) pt.push([i * W / N + (i % N ? rnd(-19, 19) : 0), j * H / M + (j % M ? rnd(-19, 19) : 0)]);
      g.fillStyle = LEAD; g.fillRect(0, 0, W, H); g.lineJoin = 'round';
      for (let j = 0; j < M; j++) for (let i = 0; i < N; i++) {
        const a = pt[j * (N + 1) + i], b = pt[j * (N + 1) + i + 1], c = pt[(j + 1) * (N + 1) + i + 1], d = pt[(j + 1) * (N + 1) + i];
        const cx = (a[0] + c[0]) / 2, cy = (a[1] + c[1]) / 2, k = Math.max(0, 1 - Math.hypot(cx - FIRE.x, cy - FIRE.y) / 300), v = Math.random();
        const edge = i === 0 || j === 0 || i === N - 1 || j === M - 1;
        const hh = edge ? ((i + j) % 2 ? 2 : 44) : k > 0.14 ? 26 + v * 24 : v < 0.6 ? 214 + v * 60 : v < 0.8 ? 268 + v * 20 : 150 + v * 24;
        const ll = edge ? 26 : k > 0.14 ? 20 + k * 30 + v * 7 : 9 + v * 11, ss = edge ? 78 : k > 0.14 ? 86 : 62 + v * 16;
        const lg = g.createLinearGradient(a[0], a[1], c[0], c[1]); lg.addColorStop(0, `hsl(${hh},${ss}%,${ll + 9}%)`); lg.addColorStop(1, `hsl(${hh},${ss}%,${ll - 4}%)`);
        g.beginPath(); g.moveTo(a[0], a[1]); g.lineTo(b[0], b[1]); g.lineTo(c[0], c[1]); g.lineTo(d[0], d[1]); g.closePath();
        g.fillStyle = lg; g.fill();
        g.save(); g.clip(); g.strokeStyle = 'rgba(255,255,255,0.07)'; g.lineWidth = 1;                    // the streaks of hand-made glass
        for (let q = 0; q < 4; q++) { const x = a[0] + rnd(-10, 60), y = a[1] + rnd(-10, 60); g.beginPath(); g.moveTo(x, y); g.lineTo(x + rnd(14, 40), y + rnd(8, 26)); g.stroke(); }
        for (let q = 0; q < 3; q++) { g.fillStyle = 'rgba(255,255,255,0.06)'; g.beginPath(); g.arc(cx + rnd(-24, 24), cy + rnd(-24, 24), rnd(0.6, 1.6), 0, TAU); g.fill(); }    // seeds (bubbles)
        g.restore();
        g.beginPath(); g.moveTo(a[0], a[1]); g.lineTo(b[0], b[1]); g.lineTo(c[0], c[1]); g.lineTo(d[0], d[1]); g.closePath();
        g.strokeStyle = LEAD; g.lineWidth = 4; g.stroke();
      }
      g.strokeStyle = 'rgba(120,120,140,0.16)'; g.lineWidth = 0.8;                                          // a glint along the lead
      for (let j = 0; j < M; j++) for (let i = 0; i < N; i++) { const a = pt[j * (N + 1) + i], b = pt[j * (N + 1) + i + 1]; g.beginPath(); g.moveTo(a[0], a[1] - 1.2); g.lineTo(b[0], b[1] - 1.2); g.stroke(); }
    },
    zombie(R_, c, z) {
      const za = z.vis === undefined ? 1 : z.vis;
      if (z.burrowed) { R_.drawBurrow(c, z); return; }
      const S = shape(z.type), r = z.r, air = z.air || 0, hit = z.hitT > 0, h = hue(z.type);
      const A = hit ? '#f6f2e4' : z.burn > 0 ? `hsl(18,80%,34%)` : `hsl(${h},62%,38%)`, B = hit ? '#e2dcc8' : z.burn > 0 ? `hsl(30,85%,46%)` : `hsl(${h},58%,50%)`, D = hit ? '#cfc8b0' : `hsl(${h},60%,26%)`;
      c.save(); c.globalAlpha = za; c.translate(z.x, z.y - air * 16);
      const sc = 1 + air * 0.35; c.scale(sc, sc);
      c.lineCap = 'round';
      if (z.champ) { c.strokeStyle = '#f2b230'; c.lineWidth = 3; c.beginPath(); c.arc(0, 0, r * 1.38, 0, TAU); c.stroke(); c.strokeStyle = LEAD; c.lineWidth = 1; c.beginPath(); c.arc(0, 0, r * 1.5, 0, TAU); c.stroke(); }
      if (z.rage > 0) { c.fillStyle = 'rgba(210,30,30,0.4)'; c.beginPath(); for (let i = 0; i < 12; i++) { const a = i / 12 * TAU, d = r * (i % 2 ? 1.75 : 1.25); c.lineTo(Math.cos(a) * d, Math.sin(a) * d); } c.fill(); }
      if (z.chill > 0) { c.fillStyle = 'rgba(150,215,255,0.4)'; c.beginPath(); c.arc(0, 0, r * 1.28, 0, TAU); c.fill(); }
      if (z.raised) { c.fillStyle = 'rgba(150,100,220,0.35)'; c.beginPath(); c.arc(0, 0, r * 1.4, 0, TAU); c.fill(); }
      c.rotate(z.ang || 0);
      const wob = Math.sin(z.wob || 0), lunge = Math.max(0, z.lunge || 0);
      if (S.seg) {
        const L = r * (S.head ? 1.15 : 0.95);
        c.beginPath(); c.ellipse(0, 0, L, r * 0.85, 0, 0, TAU); pane(c, A);
        c.strokeStyle = LEAD; c.lineWidth = 1.6; c.beginPath(); for (const k of [-0.35, 0.3]) { c.moveTo(k * L, -r * 0.8); c.lineTo(k * L, r * 0.8); } c.stroke();
        c.lineWidth = 2.4; c.beginPath(); for (const sd of [-1, 1]) for (const k of [-0.4, 0.3]) { c.moveTo(k * r, sd * r * 0.8); c.lineTo(k * r - 3, sd * r * 1.3); } if (S.head) { c.moveTo(r, -r * 0.4); c.lineTo(r * 1.6, -r * 0.1 - wob * 3); c.moveTo(r, r * 0.4); c.lineTo(r * 1.6, r * 0.1 + wob * 3); } c.stroke();
        if (S.head) { c.fillStyle = '#ffe26a'; c.beginPath(); c.arc(r * 0.6, -r * 0.3, 2.2, 0, TAU); c.arc(r * 0.6, r * 0.3, 2.2, 0, TAU); c.fill(); }
        c.restore(); c.globalAlpha = 1; return;
      }
      if (S.mark === 'robe') { c.beginPath(); c.moveTo(r * 0.2, -r * 0.8); c.lineTo(-r * 1.9, -r); c.lineTo(-r * 1.4, 0); c.lineTo(-r * 1.9, r); c.lineTo(r * 0.2, r * 0.8); c.closePath(); pane(c, D); }
      if (S.mark === 'wings') { const f = Math.sin(R_.time * 50 + z.id) * 0.4; for (const sd of [-1, 1]) { c.save(); c.rotate(sd * (0.9 + f)); c.beginPath(); c.ellipse(-r * 0.2, sd * r, r * 1.2, r * 0.45, 0, 0, TAU); pane(c, 'rgba(200,225,255,0.55)', 1.4); c.restore(); } }
      if (S.mark === 'spikes' || S.mark === 'horns') { const n = S.mark === 'horns' ? 2 : 9; for (let k = 0; k < n; k++) { const a = S.mark === 'horns' ? (k ? 0.5 : -0.5) : Math.PI * 0.5 + k / (n - 1) * Math.PI, d0 = r * 0.85, d1 = r * (S.mark === 'horns' ? 1.8 : 1.5); c.beginPath(); c.moveTo(Math.cos(a - 0.2) * d0, Math.sin(a - 0.2) * d0); c.lineTo(Math.cos(a) * d1, Math.sin(a) * d1); c.lineTo(Math.cos(a + 0.2) * d0, Math.sin(a + 0.2) * d0); c.closePath(); pane(c, k % 2 ? '#f2b230' : '#d8d2c0', 1.6); } }
      if (S.arm) {                           // arms: a strip of glass inside a strip of lead
        const aw = r * (S.armW || 0.32);
        const P = () => { c.beginPath(); for (const sd of [-1, 1]) { const reach = r * (S.arm + sd * wob * 0.22 + lunge * 0.5); c.moveTo(0, sd * r * S.w * 0.85); c.lineTo(reach * 0.55, sd * r * (S.w * 0.9 + 0.12)); c.lineTo(reach, sd * r * (S.mark === 'crawl' ? 0.9 : 0.42)); } };
        c.strokeStyle = LEAD; c.lineWidth = aw + 3.6; P(); c.stroke(); c.strokeStyle = B; c.lineWidth = aw; P(); c.stroke();
      }
      // the body: two panes with a lead line between them, like a figure in a window
      c.beginPath(); c.ellipse(0, 0, r * S.l, r * S.w, 0, 0, TAU); pane(c, A, 2.6);
      c.save(); c.beginPath(); c.ellipse(0, 0, r * S.l, r * S.w, 0, 0, TAU); c.clip(); c.fillStyle = D; c.fillRect(-r * 2, 0, r * 4, r * 2);
      c.strokeStyle = LEAD; c.lineWidth = 1.8; c.beginPath(); c.moveTo(-r * 2, 0); c.lineTo(r * 2, 0); if (S.mark === 'plates' || S.mark === 'belly' || S.mark === 'eggs') { c.moveTo(-r * 0.1, -r * 2); c.lineTo(-r * 0.1, r * 2); } c.stroke();
      c.fillStyle = 'rgba(255,255,255,0.22)'; c.beginPath(); c.ellipse(-r * 0.1, -r * S.w * 0.5, r * S.l * 0.5, r * S.w * 0.2, 0, 0, TAU); c.fill(); c.restore();       // light through the glass
      c.beginPath(); c.ellipse(0, 0, r * S.l, r * S.w, 0, 0, TAU); c.strokeStyle = LEAD; c.lineWidth = 2.6; c.stroke();
      const hx = r * (S.l * 0.72 + (S.mark === 'crawl' ? 0.2 : 0)), hy = wob * r * 0.1, hr = r * S.h;
      c.beginPath(); c.arc(hx, hy, hr, 0, TAU); pane(c, B, 2.4);
      c.fillStyle = hit ? LEAD : '#ffe26a'; const er = Math.max(1.3, hr * 0.24);
      c.beginPath(); c.arc(hx + hr * 0.36, hy - hr * 0.4, er, 0, TAU); c.arc(hx + hr * 0.36, hy + hr * 0.4, er, 0, TAU); c.fill();
      if (S.mark === 'robe') { c.strokeStyle = LEAD; c.lineWidth = 3.4; c.beginPath(); c.moveTo(-r * 0.3, r); c.lineTo(r * 1.7 + lunge * 4, r * 0.8); c.stroke(); c.beginPath(); c.arc(r * 1.8 + lunge * 4, r * 0.8, 3.6, 0, TAU); pane(c, '#b98cff', 1.4); }
      if (z.hp < z.maxhp * 0.5) { c.strokeStyle = 'rgba(255,255,255,0.8)'; c.lineWidth = 0.8; c.beginPath(); for (let k = 0; k < 3; k++) { const a = hash(z.id, k) * TAU; c.moveTo(0, 0); c.lineTo(Math.cos(a) * r * 0.5, Math.sin(a) * r * 0.5); c.lineTo(Math.cos(a + 0.3) * r * 0.85, Math.sin(a + 0.3) * r * 0.85); } c.stroke(); }     // half dead: the glass has cracked
      c.restore(); c.globalAlpha = 1;
    },
    player(R_, c, p) {
      c.save(); c.translate(p.x, p.y);
      if (p.down) { c.rotate(1.2 + p.x); c.beginPath(); c.ellipse(0, 0, 15, 9, 0, 0, TAU); pane(c, p.color); c.beginPath(); c.arc(13, 0, 6, 0, TAU); pane(c, '#e8c8a0'); c.strokeStyle = '#fff'; c.lineWidth = 0.9; c.beginPath(); c.moveTo(-8, -4); c.lineTo(0, 1); c.lineTo(7, -3); c.moveTo(0, 1); c.lineTo(-2, 7); c.stroke(); c.restore(); return; }
      c.rotate(p.aim);
      const sw = p.moving ? Math.sin(p.walk) * 6 : 0, kick = p.flash > 0 ? -2.5 : 0, hurt = p.hurtT > 0.2;
      const G = (R.int && R.int.GUNLOOK && (R.int.GUNLOOK[p.cur] || R.int.GUNLOOK.pistol)) || { len: 16, w: 5 };
      c.fillStyle = LEAD; c.beginPath(); c.ellipse(sw, -6.5, 6.5, 4, 0, 0, TAU); c.ellipse(-sw, 6.5, 6.5, 4, 0, 0, TAU); c.fill();
      c.lineCap = 'round'; const P = () => { c.beginPath(); c.moveTo(1, 10); c.lineTo(13 + kick, 5); c.moveTo(2, -10); c.lineTo(Math.min(20, 9 + G.len * 0.6) + kick, 2.5); };
      c.strokeStyle = LEAD; c.lineWidth = 8.4; P(); c.stroke(); c.strokeStyle = p.color; c.lineWidth = 4.6; P(); c.stroke();
      c.beginPath(); c.rect(8 + kick, 1.8, G.len + 3, Math.max(3.6, G.w * 0.75)); pane(c, '#9aa6b4', 1.6);
      c.beginPath(); c.ellipse(0, 0, 9.5, 13, 0, 0, TAU); pane(c, hurt ? '#fff' : p.color, 2.6);
      c.strokeStyle = LEAD; c.lineWidth = 1.6; c.beginPath(); c.moveTo(-9, 0); c.lineTo(9, 0); c.stroke();
      c.fillStyle = 'rgba(255,255,255,0.3)'; c.beginPath(); c.ellipse(-1, -6.5, 5, 3, 0, 0, TAU); c.fill();
      c.beginPath(); c.arc(2.5, 0, 6.6, 0, TAU); pane(c, hurt ? '#fff' : '#f0d2a8', 2.2);
      c.strokeStyle = '#f2b230'; c.lineWidth = 1.6; c.beginPath(); c.arc(1.5, 0, 9.4, 2.2, TAU - 2.2); c.stroke();       // the living get a halo
      c.restore();
    },
    sprite(R_, id) {
      const def = GD.STRUCTS[id]; if (!def) return null;
      const turret = GD.TURRET_IDS.indexOf(id) >= 0;
      const known = { wood: 1, steel: 1, bunker: 1, gate: 1, fence: 1, wire: 1, spikes: 1, mine: 1, lamp: 1, lure: 1, medic: 1, trail: 1, ward: 1 };
      if (!known[id] && !(turret && (def.gun || id === 'turret' || id === 'cannon' || id === 'napalm' || id === 'tesla'))) return null;
      const S = 3, cv = mk(CELL * S, CELL * S), g = cv.getContext('2d');
      g.scale(S, S); g.lineJoin = 'round'; g.lineCap = 'round';
      const piece = (pts, fill) => { g.beginPath(); pts.forEach((p, i) => (i ? g.lineTo(p[0], p[1]) : g.moveTo(p[0], p[1]))); g.closePath(); const lg = g.createLinearGradient(pts[0][0], pts[0][1], pts[0][0] + 14, pts[0][1] + 18); lg.addColorStop(0, fill[0]); lg.addColorStop(1, fill[1]); g.fillStyle = lg; g.fill(); g.strokeStyle = LEAD; g.lineWidth = 1.7; g.stroke(); };
      const frame = () => { g.strokeStyle = LEAD; g.lineWidth = 3; g.strokeRect(1.5, 1.5, 37, 37); g.strokeStyle = 'rgba(160,160,180,0.3)'; g.lineWidth = 0.6; g.strokeRect(2.6, 2.6, 34.8, 34.8); };
      const circle = (x, y, r, fill) => { g.beginPath(); g.arc(x, y, r, 0, TAU); g.fillStyle = fill; g.fill(); g.strokeStyle = LEAD; g.lineWidth = 1.7; g.stroke(); };
      if (id === 'wood') { const a = ['#c98a3a', '#8a5420'], b = ['#e0a850', '#a86a28']; piece([[2, 2], [38, 2], [2, 38]], a); piece([[38, 2], [38, 38], [2, 38]], b); piece([[12, 12], [28, 12], [28, 28], [12, 28]], ['#f2c060', '#c88a30']); frame(); }
      else if (id === 'steel') { const a = ['#b8cbe0', '#6f88a8'], b = ['#93abc8', '#52698a']; piece([[2, 2], [20, 2], [20, 20], [2, 20]], a); piece([[20, 2], [38, 2], [38, 20], [20, 20]], b); piece([[2, 20], [20, 20], [20, 38], [2, 38]], b); piece([[20, 20], [38, 20], [38, 38], [20, 38]], a); circle(20, 20, 5, '#e8eef6'); frame(); }
      else if (id === 'bunker') { const a = ['#e6e0d2', '#a8a294'], b = ['#c8c2b4', '#8a8478']; piece([[20, 2], [38, 20], [20, 38], [2, 20]], a); piece([[2, 2], [20, 2], [2, 20]], b); piece([[20, 2], [38, 2], [38, 20]], b); piece([[38, 20], [38, 38], [20, 38]], b); piece([[2, 20], [20, 38], [2, 38]], b); piece([[20, 11], [29, 20], [20, 29], [11, 20]], ['#f4f0e6', '#c0baa8']); frame(); g.strokeStyle = LEAD; g.lineWidth = 4.4; g.strokeRect(2.2, 2.2, 35.6, 35.6); }
      else if (id === 'gate') { piece([[2, 2], [38, 2], [38, 38], [2, 38]], ['#3fae5a', '#1f6a34']); for (let k = 0; k < 3; k++) piece([[10, 14 + k * 8.5], [20, 8 + k * 8.5], [30, 14 + k * 8.5], [20, 12.5 + k * 8.5]], ['#b8f0a0', '#6ac86a']); frame(); }
      else if (id === 'fence') { piece([[5, 4], [35, 4], [35, 36], [5, 36]], ['rgba(255,226,106,0.5)', 'rgba(242,178,48,0.35)']); g.strokeStyle = LEAD; g.lineWidth = 1.5; g.beginPath(); for (let k = 1; k < 4; k++) { g.moveTo(5, 4 + k * 8); g.lineTo(35, 4 + k * 8); } g.moveTo(15, 6); g.lineTo(21, 16); g.lineTo(16, 18); g.lineTo(25, 32); g.stroke(); }
      else if (id === 'wire') { g.strokeStyle = LEAD; g.lineWidth = 2.6; g.beginPath(); for (let rw = 0; rw < 3; rw++) { for (let x = 2; x <= 38; x += 6) x === 2 ? g.moveTo(x, 9 + rw * 11) : g.lineTo(x, 9 + rw * 11 + ((x / 6) % 2 ? -4 : 4)); } g.stroke(); g.strokeStyle = '#c8d4e4'; g.lineWidth = 1; g.stroke(); }
      else if (id === 'spikes') { piece([[4, 4], [36, 4], [36, 36], [4, 36]], ['#6a7284', '#3c4354']); for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) piece([[10 + i * 10 - 3.4, 13 + j * 10], [10 + i * 10, 6 + j * 10], [10 + i * 10 + 3.4, 13 + j * 10]], ['#f0f4fa', '#b0bccc']); }
      else if (id === 'mine') { circle(20, 20, 10, '#b4141a'); circle(20, 20, 4.5, '#f2b230'); }
      else if (id === 'lamp') { for (let k = 0; k < 8; k++) { const a0 = k / 8 * TAU, a1 = (k + 1) / 8 * TAU; piece([[20, 20], [20 + Math.cos(a0) * 16, 20 + Math.sin(a0) * 16], [20 + Math.cos(a1) * 16, 20 + Math.sin(a1) * 16]], k % 2 ? ['#ffe890', '#f2c040'] : ['#fff6c8', '#ffd860']); } circle(20, 20, 6, '#fffbe0'); }
      else if (id === 'lure') { piece([[5, 9], [35, 9], [35, 31], [5, 31]], ['#5a9a6a', '#2f6a3c']); circle(15, 20, 6, '#1c2c20'); circle(28, 16, 2.4, '#f2b230'); }
      else if (id === 'medic') { piece([[3, 3], [37, 3], [37, 37], [3, 37]], ['#f6f2e6', '#d0cab8']); piece([[16, 8], [24, 8], [24, 32], [16, 32]], ['#d42024', '#9c1014']); piece([[8, 16], [32, 16], [32, 24], [8, 24]], ['#d42024', '#9c1014']); frame(); }
      else if (id === 'trail') { for (let k = 0; k < 3; k++) piece([[5, 7 + k * 10], [35, 9 + k * 10], [34, 15 + k * 10], [6, 13 + k * 10]], ['rgba(212,32,36,0.75)', 'rgba(156,16,20,0.75)']); }
      else if (id === 'ward') { g.strokeStyle = LEAD; g.lineWidth = 4; g.beginPath(); g.moveTo(20, 4); g.lineTo(20, 37); g.stroke(); for (const y of [9, 19, 29]) circle(20, y, 5, '#f0ead8'); }
      else { const hot = id === 'tesla' ? ['#8fd8ff', '#3a8ad0'] : ['#8a94a8', '#4a5468']; piece([[3, 3], [37, 3], [37, 37], [3, 37]], ['#2c3350', '#181c34']); for (let k = 0; k < 6; k++) { const a0 = k / 6 * TAU, a1 = (k + 1) / 6 * TAU; piece([[20, 20], [20 + Math.cos(a0) * 13, 20 + Math.sin(a0) * 13], [20 + Math.cos(a1) * 13, 20 + Math.sin(a1) * 13]], k % 2 ? hot : ['#c8d0e0', '#7a86a0']); } frame(); }      // turret mount: a small rose window
      return cv;
    },
    struct(R_, c, s, alpha, noBase) {
      const def = GD.STRUCTS[s.id], x = s.cx * CELL, y = s.cy * CELL;
      const gunny = def.gun || s.id === 'turret' || s.id === 'cannon' || s.id === 'napalm';
      if (!gunny && !def.wall && !({ wire: 1, spikes: 1, mine: 1, lamp: 1, medic: 1, trail: 1 })[s.id]) return false;
      c.globalAlpha = alpha === undefined ? 1 : alpha;
      if (!noBase) c.drawImage(R_.sprite(s.id), x, y, CELL, CELL);
      if (alpha === undefined && s.maxhp && s.hp < s.maxhp * 0.85 && (def.wall || gunny)) {       // damage: cracks spread from where it was struck
        const k = 1 - s.hp / s.maxhp, ox = x + 8 + hash(s.uid, 1) * 24, oy = y + 8 + hash(s.uid, 2) * 24;
        c.strokeStyle = 'rgba(255,255,255,0.85)'; c.lineWidth = 0.9; c.lineCap = 'round'; c.beginPath();
        for (let i = 0, n = 2 + Math.ceil(k * 7); i < n; i++) { const a = hash(s.uid, i + 5) * TAU, len = 6 + k * 26 * (0.5 + hash(s.uid, i + 20) * 0.5); let px = ox, py = oy; c.moveTo(px, py); for (let j = 1; j <= 3; j++) { px = ox + Math.cos(a + (hash(s.uid, i * 3 + j) - 0.5) * 0.7) * len * j / 3; py = oy + Math.sin(a + (hash(s.uid, i * 3 + j) - 0.5) * 0.7) * len * j / 3; c.lineTo(Math.max(x + 2, Math.min(x + CELL - 2, px)), Math.max(y + 2, Math.min(y + CELL - 2, py))); } }
        c.stroke();
        if (k > 0.6) { c.fillStyle = LEAD; c.beginPath(); c.moveTo(ox, oy); c.lineTo(ox + 7, oy - 3); c.lineTo(ox + 4, oy + 6); c.fill(); }                                        // a piece has fallen out
      }
      if (gunny) {
        const G = (R.int && R.int.GUNLOOK && R.int.GUNLOOK[s.gun || def.gun]) || { len: s.id === 'cannon' ? 22 : 18, w: s.id === 'cannon' ? 10 : 6 }, kick = s.flash > 0 ? -2.5 : 0, bw = Math.max(4.5, G.w * 0.85);
        c.save(); c.translate(s.x, s.y); c.rotate(s.ang || 0);
        c.beginPath(); c.rect(2 + kick, -bw / 2, G.len + 3, bw); pane(c, s.flash > 0 ? '#ffe890' : '#aab6c8', 2);
        c.beginPath(); c.arc(0, 0, 7, 0, TAU); pane(c, s.emp ? '#3a4050' : '#d42024', 2);
        c.restore();
        if (alpha === undefined && R_.showOwners && def.gun) { const nm = def.name.replace(' Turret', ''); c.font = 'bold 11px Palatino, Georgia, serif'; c.textAlign = 'center'; c.fillStyle = '#000'; c.fillText(nm, s.x + 1, s.y + 33); c.fillStyle = '#ffe9a8'; c.fillText(nm, s.x, s.y + 32); }
      }
      if (alpha === undefined && R_.showOwners) { c.fillStyle = R_.ownerColor(s.owner); c.fillRect(x + 3, y + 3, 5, 5); }
      if (s.hitT > 0 && alpha === undefined) { c.globalAlpha = 0.6; c.fillStyle = '#fff'; c.fillRect(x + 3, y + 3, CELL - 6, CELL - 6); }
      c.globalAlpha = 1;
      return true;
    },
    // light comes through the window: a gold wash from the fire, and each flashlight a pale shaft
    over(R_, c, sim) {
      const nk = R_.nightK || 0, fk = sim.fireMax ? Math.max(0, Math.min(1, sim.fireHp / sim.fireMax)) : 1;
      c.globalCompositeOperation = 'lighter';
      if (!(sim.phase === 'over' && fk <= 0)) R_.glow(c, FIRE.x, FIRE.y, 340 * (1 + 0.05 * Math.sin(R_.time * 9)), (0.16 + 0.2 * nk) * (0.5 + 0.5 * fk), '255,170,60');
      if (nk > 0.1) for (const p of sim.players) if (!p.away && !p.down) R_.cone(c, p.x, p.y, p.aim, 560, 0.36, 0.14 * nk);
      c.lineCap = 'round'; c.strokeStyle = 'rgba(255,240,180,0.95)'; c.lineWidth = 2.2; c.beginPath();
      for (const b of sim.bullets) { if (b.kind !== 'bullet' || b.wid === 'saw') continue; const sp = Math.hypot(b.vx, b.vy) || 1, tl = b.wid === 'sniper' || b.wid === 'rail' ? 70 : 28; c.moveTo(b.x, b.y); c.lineTo(b.x - b.vx / sp * tl, b.y - b.vy / sp * tl); }
      c.stroke();
      c.globalCompositeOperation = 'source-over';
    },
    // fire is shards of orange and gold glass; the campfire is the sun at the middle of the window
    hot(R_, c, fireS) {
      c.globalCompositeOperation = 'source-over';
      for (const p of R_.parts) {
        const t = Math.max(0, Math.min(1, p.life / p.max));
        if (p.k === 'fire' || p.k === 'acid') { c.globalAlpha = 0.85 * t; c.fillStyle = p.k === 'acid' ? '#6ac86a' : t > 0.6 ? '#ffd860' : t > 0.3 ? '#f28a20' : '#c0381a'; const s = p.size * (0.35 + t * 0.4); c.beginPath(); c.moveTo(p.x, p.y - s); c.lineTo(p.x + s * 0.7, p.y); c.lineTo(p.x, p.y + s); c.lineTo(p.x - s * 0.7, p.y); c.fill(); }
        else if (p.k === 'spark' || p.k === 'ember') { c.globalAlpha = t; c.fillStyle = '#ffe890'; c.fillRect(p.x - 1.2, p.y - 1.2, 2.4, 2.4); }
      }
      c.globalAlpha = 1;
      if (fireS > 0) {
        const t = R_.time, n = 12;
        for (let i = 0; i < n; i++) {
          const a0 = i / n * TAU + t * 0.25, a1 = (i + 1) / n * TAU + t * 0.25, am = (a0 + a1) / 2, d = (i % 2 ? 26 : 38 + Math.sin(t * 6 + i) * 5) * fireS;
          c.beginPath(); c.moveTo(FIRE.x + Math.cos(a0) * 11, FIRE.y + Math.sin(a0) * 11); c.lineTo(FIRE.x + Math.cos(am) * d, FIRE.y + Math.sin(am) * d); c.lineTo(FIRE.x + Math.cos(a1) * 11, FIRE.y + Math.sin(a1) * 11); c.closePath(); pane(c, i % 2 ? '#f28a20' : '#ffc840', 1.6);
        }
        c.beginPath(); c.arc(FIRE.x, FIRE.y, 11 * fireS + 1, 0, TAU); pane(c, '#fff3b0', 2);
        c.beginPath(); c.arc(FIRE.x, FIRE.y, 5 * fireS, 0, TAU); pane(c, '#d42024', 1.4);
      }
      c.globalCompositeOperation = 'lighter';
    },
  };
  R.LOOKS = R.LOOKS || {};
  R.LOOKS.glass = look;
})(window);
