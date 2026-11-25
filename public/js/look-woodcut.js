// Last Ember - graphics style "Woodcut print". A plague-year broadsheet: the block is black ink, everything is cut
// out of it in bone-white lines, and there is one spot colour, red, for blood and eyes. Light is not a glow here:
// it is rays carved out of the dark around the fire, the lamps and each flashlight. Nothing is shaded, only hatched.
(function (root) {
  'use strict';
  const R = root.Renderer;
  if (!R) return;
  const GD = root.GD, { CELL, W, H } = GD, FIRE = root.SIM.FIRE, TAU = Math.PI * 2;
  const INK = '#0d0b09', BONE = '#e6d9bc', RED = '#c01a14';
  const hash = (a, b) => { let n = (a * 374761393 + b * 668265263) | 0; n = (n ^ (n >>> 13)) * 1274126177 | 0; return ((n ^ (n >>> 16)) >>> 0) / 4294967296; };
  const mk = (w, h) => { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; };
  const shape = (t) => (R.SHAPES && (R.SHAPES[t] || R.SHAPES.walker)) || { w: 0.95, l: 0.7, h: 0.5, arm: 1.35 };
  // a gouge-cut outline: straight facets, never a curve (the knife does not turn easily in the grain)
  function facet(c, cx, cy, rx, ry, seed, n) {
    c.beginPath();
    for (let i = 0; i < n; i++) { const a = (i + 0.5 * (seed & 1)) / n * TAU, k = 0.9 + hash(seed, i) * 0.2; i ? c.lineTo(cx + Math.cos(a) * rx * k, cy + Math.sin(a) * ry * k) : c.moveTo(cx + Math.cos(a) * rx * k, cy + Math.sin(a) * ry * k); }
    c.closePath();
  }
  function rays(c, x, y, r0, r1, a0, a1, n, seed, lw) {
    c.strokeStyle = BONE; c.lineCap = 'butt';
    for (let i = 0; i < n; i++) {
      const a = a0 + (i + hash(seed, i) * 0.6) / n * (a1 - a0), d1 = r0 + (r1 - r0) * (0.35 + hash(seed + 7, i) * 0.65), d0 = r0 * (1 + hash(seed + 3, i) * 0.5);
      c.lineWidth = lw * (0.5 + hash(seed + 11, i) * 1.3);
      c.beginPath(); c.moveTo(x + Math.cos(a) * d0, y + Math.sin(a) * d0); c.lineTo(x + Math.cos(a) * d1, y + Math.sin(a) * d1); c.stroke();
    }
  }
  const look = {
    fxInk: '230,217,188', fxDash: [10, 6],
    // what flies: red darts, each a single cut of the knife
    fleck(R_, c, p, bile) { const a = Math.atan2(p.vy, p.vx), s = 3 + p.size * 2.2; c.fillStyle = bile ? '#b9ad90' : RED; c.beginPath(); c.moveTo(p.x + Math.cos(a) * s, p.y + Math.sin(a) * s); c.lineTo(p.x - Math.cos(a) * s - Math.sin(a) * s * 0.3, p.y - Math.sin(a) * s + Math.cos(a) * s * 0.3); c.lineTo(p.x - Math.cos(a) * s + Math.sin(a) * s * 0.3, p.y - Math.sin(a) * s - Math.cos(a) * s * 0.3); c.fill(); },
    // the dead, as on a plague sheet: laid out flat in bone, hatched across, a cross cut beside them
    body(R_, d, e, r, torn) {
      d.globalAlpha = 0.92; d.fillStyle = '#cfc3a6'; d.strokeStyle = INK; d.lineWidth = 1.4; d.lineJoin = 'miter';
      facet(d, 0, 0, r * 1.15, r * 0.6, (e.x | 0) + 1, 8); d.fill(); d.stroke(); facet(d, r * (torn ? 2.0 : 1.35), torn ? r * 0.8 : 0, r * 0.45, r * 0.45, e.y | 0, 7); d.fill(); d.stroke();
      d.strokeStyle = INK; d.lineWidth = 1.1; d.beginPath(); for (let k = -4; k <= 4; k++) { d.moveTo(k * r * 0.24 - r * 0.2, -r * 0.55); d.lineTo(k * r * 0.24 + r * 0.2, r * 0.55); } d.stroke();
      d.strokeStyle = '#cfc3a6'; d.lineWidth = 2.4; d.beginPath(); d.moveTo(-r * 1.9, -r * 0.9); d.lineTo(-r * 1.9, r * 0.5); d.moveTo(-r * 2.4, -r * 0.45); d.lineTo(-r * 1.4, -r * 0.45); d.stroke();     // the cross
      d.globalAlpha = 1;
    },
    // blood: a second colour on the press. Every wound is a burst of red wedges gouged outward, never a soft shape.
    splat(R_, d, x, y, r, bile, alpha, ang) {
      const rnd = (a, b) => a + Math.random() * (b - a), col = bile ? '#b9ad90' : '#c01a14';
      d.fillStyle = col; d.strokeStyle = col; d.globalAlpha = Math.min(1, alpha * 1.4); d.lineCap = 'butt';
      if (r < 8) {                                              // a graze: three short parallel cuts
        const a = ang === undefined ? rnd(0, TAU) : ang; d.lineWidth = 1.4;
        d.beginPath(); for (let k = -1; k <= 1; k++) { const ox = -Math.sin(a) * k * 3, oy = Math.cos(a) * k * 3; d.moveTo(x + ox, y + oy); d.lineTo(x + ox + Math.cos(a) * rnd(5, 11), y + oy + Math.sin(a) * rnd(5, 11)); } d.stroke();
        return;
      }
      d.beginPath(); for (let i = 0; i < 7; i++) { const a = i / 7 * TAU, k = r * rnd(0.3, 0.55); i ? d.lineTo(x + Math.cos(a) * k, y + Math.sin(a) * k) : d.moveTo(x + Math.cos(a) * k, y + Math.sin(a) * k); } d.fill();       // the core
      // the red block never quite lines up with the black one: a ghost of the same burst, printed a hair off
      d.strokeStyle = '#7a100c'; d.lineWidth = 1; d.globalAlpha = 0.6; d.beginPath(); for (let i = 0; i <= 14; i++) { const q = i / 14 * TAU, k = r * (i % 2 ? 0.7 : 1.9); i ? d.lineTo(x + 4 + Math.cos(q) * k, y + 3 + Math.sin(q) * k) : d.moveTo(x + 4 + Math.cos(q) * k, y + 3 + Math.sin(q) * k); } d.stroke();
      d.fillStyle = col; for (let i = 0, m = 6 + (r | 0); i < m; i++) { d.globalAlpha = rnd(0.5, 1); const q = rnd(0, TAU), k = r * rnd(1.8, 3.4); d.fillRect(x + Math.cos(q) * k, y + Math.sin(q) * k, rnd(1, 2.6), rnd(1, 2.6)); }     // ink spat off the block
      d.globalAlpha = Math.min(1, alpha * 1.4);
      const n = 9 + Math.round(r / 3), a0 = ang === undefined ? 0 : ang, spread = ang === undefined ? TAU : 2.2;
      for (let i = 0; i < n; i++) {
        const a = a0 + (i / n - 0.5) * spread + rnd(-0.1, 0.1), l = r * rnd(1.1, ang === undefined ? 2.2 : 3.2), w = rnd(0.05, 0.13);
        d.beginPath(); d.moveTo(x + Math.cos(a - w) * r * 0.5, y + Math.sin(a - w) * r * 0.5); d.lineTo(x + Math.cos(a) * l, y + Math.sin(a) * l); d.lineTo(x + Math.cos(a + w) * r * 0.5, y + Math.sin(a + w) * r * 0.5); d.fill();
      }
    },
    hudFont: 'Georgia, "Times New Roman", serif', titleFont: '900 PXpx Georgia, "Times New Roman", serif',
    fxHot: true, dark: '5,4,3', eye: RED, bloodFx: RED, bileFx: '#9a9076', corpse: '#b9ad90',
    blood: ['#c01a14', '#a81410', '#d02218', '#b01812', '#981210', '#c8201a'], bile: ['#8f8568', '#7d7458', '#9a9072', '#857b5e'],
    filter: 'grayscale(1) contrast(1.9) sepia(1) saturate(0.55) brightness(0.96)',            // anything not cut for this style still prints in two inks
    // the block itself: black, with the field cut into it as small strokes
    ground(R_, g) {
      const rnd = (a, b) => a + Math.random() * (b - a);
      g.fillStyle = INK; g.fillRect(0, 0, W, H);
      g.strokeStyle = BONE; g.lineCap = 'butt';
      for (let i = 0; i < 5200; i++) {                       // grass: two cuts meeting in a V
        const x = rnd(0, W), y = rnd(0, H), d = Math.hypot(x - FIRE.x, y - FIRE.y);
        if (d < 150) continue;
        g.globalAlpha = rnd(0.25, 0.6); g.lineWidth = rnd(0.7, 1.3);
        const s = rnd(3, 6); g.beginPath(); g.moveTo(x - s * 0.5, y - s); g.lineTo(x, y); g.lineTo(x + s * 0.6, y - s * 0.9); g.stroke();
      }
      for (let i = 0; i < 700; i++) {                        // furrows: short level cuts, as on old map plates
        const x = rnd(0, W), y = rnd(0, H); if (Math.hypot(x - FIRE.x, y - FIRE.y) < 110) continue;
        g.globalAlpha = rnd(0.15, 0.35); g.lineWidth = 0.8; g.beginPath(); g.moveTo(x, y); g.lineTo(x + rnd(8, 26), y + rnd(-1, 1)); g.stroke();
      }
      g.globalAlpha = 0.5; g.lineWidth = 1;                  // the trodden ring round the fire: dotted circles
      for (const rr of [60, 96, 136]) { g.setLineDash([rnd(2, 5), rnd(7, 12)]); g.beginPath(); g.arc(FIRE.x, FIRE.y, rr, 0, TAU); g.stroke(); }
      g.setLineDash([]);
      for (let i = 0; i < 80; i++) {                         // stones: an outline and three cuts of shade
        const x = rnd(20, W - 20), y = rnd(20, H - 20), r = rnd(4, 9);
        g.globalAlpha = 0.85; g.fillStyle = INK; g.lineWidth = 1.2; facet(g, x, y, r, r * 0.7, i, 6); g.fill(); g.stroke();
        g.lineWidth = 0.7; g.beginPath(); for (let k = 0; k < 3; k++) { g.moveTo(x - r * 0.1 + k * 2.2, y + r * 0.45); g.lineTo(x + r * 0.3 + k * 2.2, y - r * 0.1); } g.stroke();
      }
      g.globalAlpha = 1;
      const tree = (x, y, r, sd) => {                        // the wood: scalloped crowns, each hatched on its dark side
        g.fillStyle = INK; g.strokeStyle = BONE; g.lineWidth = 1.5;
        g.beginPath(); for (let k = 0; k <= 9; k++) { const a = k / 9 * TAU, a2 = (k + 0.5) / 9 * TAU; if (!k) g.moveTo(x + Math.cos(a) * r, y + Math.sin(a) * r); g.quadraticCurveTo(x + Math.cos(a2 - TAU / 18) * r * 1.3, y + Math.sin(a2 - TAU / 18) * r * 1.3, x + Math.cos(a) * r, y + Math.sin(a) * r); }
        g.fill(); g.stroke();
        g.lineWidth = 0.8; g.beginPath(); for (let k = 0; k < 7; k++) { const yy = y - r * 0.6 + k * r * 0.2; g.moveTo(x + r * 0.05, yy); g.lineTo(x + r * (0.5 + hash(sd, k) * 0.3), yy + r * 0.12); } g.stroke();
      };
      let n = 0;
      for (let x = -10; x < W + 40; x += rnd(40, 64)) { tree(x, rnd(-18, -2), rnd(26, 38), n++); tree(x, H + rnd(2, 18), rnd(26, 38), n++); }
      for (let y = -10; y < H + 40; y += rnd(40, 64)) { tree(rnd(-18, -2), y, rnd(26, 38), n++); tree(W + rnd(2, 18), y, rnd(26, 38), n++); }
      for (let i = 0; i < 2600; i++) { g.fillStyle = `rgba(230,217,188,${rnd(0.04, 0.2)})`; g.fillRect(rnd(0, W), rnd(0, H), 1.2, 1.2); }     // where the ink did not take
    },
    zombie(R_, c, z) {
      const za = z.vis === undefined ? 1 : z.vis;
      if (z.burrowed) { R_.drawBurrow(c, z); return; }
      const S = shape(z.type), r = z.r, air = z.air || 0, hit = z.hitT > 0;
      const fill = hit ? INK : BONE, cut = hit ? BONE : INK;                    // struck: the print inverts
      c.save(); c.globalAlpha = za; c.translate(z.x, z.y - air * 16);
      const sc = 1 + air * 0.35; c.scale(sc, sc);
      c.lineCap = 'butt'; c.lineJoin = 'miter';
      if (z.champ || z.rage > 0) { c.strokeStyle = BONE; c.lineWidth = 1.5; c.beginPath(); for (let i = 0; i <= 16; i++) { const a = i / 16 * TAU, d = r * (i % 2 ? 1.7 : 1.35); c.lineTo(Math.cos(a) * d, Math.sin(a) * d); } c.stroke(); }
      if (z.chill > 0 || z.stunImm > 0 || z.raised) { c.strokeStyle = BONE; c.lineWidth = 1.1; c.setLineDash(z.chill > 0 ? [2, 4] : [6, 3]); c.beginPath(); c.arc(0, 0, r * 1.28, 0, TAU); c.stroke(); c.setLineDash([]); }
      c.rotate(z.ang || 0);
      const wob = Math.sin(z.wob || 0), lunge = Math.max(0, z.lunge || 0);
      if (S.seg) {
        c.fillStyle = fill; c.strokeStyle = INK; c.lineWidth = 1.4; facet(c, 0, 0, r * (S.head ? 1.15 : 0.95), r * 0.85, z.id, 7); c.fill(); c.stroke();
        c.strokeStyle = cut; c.lineWidth = 1.2; c.beginPath(); for (let k = -2; k <= 2; k++) { c.moveTo(k * r * 0.3, -r * 0.6); c.lineTo(k * r * 0.3 + r * 0.14, r * 0.6); } c.stroke();
        c.strokeStyle = BONE; c.lineWidth = 2; c.beginPath(); for (const sd of [-1, 1]) for (const k of [-0.4, 0.3]) { c.moveTo(k * r, sd * r * 0.7); c.lineTo(k * r - 3, sd * r * 1.3); } if (S.head) { c.moveTo(r * 0.9, -r * 0.4); c.lineTo(r * 1.6, -r * 0.1 - wob * 3); c.moveTo(r * 0.9, r * 0.4); c.lineTo(r * 1.6, r * 0.1 + wob * 3); } c.stroke();
        c.restore(); c.globalAlpha = 1; return;
      }
      if (S.mark === 'robe') { c.fillStyle = fill; c.beginPath(); c.moveTo(r * 0.2, -r * 0.8); c.lineTo(-r * 1.9, -r); c.lineTo(-r * 1.4, 0); c.lineTo(-r * 1.9, r); c.lineTo(r * 0.2, r * 0.8); c.fill(); }
      if (S.mark === 'wings') { c.strokeStyle = BONE; c.lineWidth = 1.2; const f = Math.sin(R_.time * 50 + z.id) * 0.4; for (const sd of [-1, 1]) { c.save(); c.rotate(sd * (0.9 + f)); c.beginPath(); c.ellipse(-r * 0.2, sd * r, r * 1.2, r * 0.45, 0, 0, TAU); c.stroke(); c.restore(); } }
      if (S.mark === 'legs') { c.strokeStyle = fill; c.lineWidth = r * 0.3; c.beginPath(); c.moveTo(-r * 0.4, -r * 0.5); c.lineTo(-r * 1.1, -r * 1.2); c.lineTo(-r * 1.7, -r * 0.7); c.moveTo(-r * 0.4, r * 0.5); c.lineTo(-r * 1.1, r * 1.2); c.lineTo(-r * 1.7, r * 0.7); c.stroke(); }
      if (S.arm) {                           // arms: stiff, jointed like a jumping-jack, three cut fingers
        c.strokeStyle = fill; c.lineWidth = r * (S.armW || 0.3);
        for (const sd of [-1, 1]) {
          const reach = r * (S.arm + sd * wob * 0.22 + lunge * 0.5), y0 = sd * r * S.w * 0.85, y1 = sd * r * (S.mark === 'crawl' ? 0.9 : 0.42);
          c.beginPath(); c.moveTo(0, y0); c.lineTo(reach * 0.55, sd * r * (S.w * 0.9 + 0.12)); c.lineTo(reach, y1); c.stroke();
          c.lineWidth = 1.4; c.beginPath(); for (let f = -1; f <= 1; f++) { c.moveTo(reach, y1); c.lineTo(reach + r * 0.36, y1 + f * r * 0.22); } c.stroke(); c.lineWidth = r * (S.armW || 0.3);
        }
      }
      if (S.mark === 'spikes' || S.mark === 'horns') { c.fillStyle = fill; const n = S.mark === 'horns' ? 2 : 9; for (let k = 0; k < n; k++) { const a = S.mark === 'horns' ? (k ? 0.5 : -0.5) : Math.PI * 0.5 + k / (n - 1) * Math.PI, d0 = r * 0.85, d1 = r * (S.mark === 'horns' ? 1.8 : 1.5); c.beginPath(); c.moveTo(Math.cos(a - 0.17) * d0, Math.sin(a - 0.17) * d0); c.lineTo(Math.cos(a) * d1, Math.sin(a) * d1); c.lineTo(Math.cos(a + 0.17) * d0, Math.sin(a + 0.17) * d0); c.fill(); } }
      // the body: one bone shape with a firm black keyline, then the shadow side cut away in parallel strokes
      c.fillStyle = fill; c.strokeStyle = INK; c.lineWidth = 1.5; facet(c, 0, 0, r * S.l, r * S.w, z.id, 8); c.fill(); c.stroke();
      c.strokeStyle = cut; c.lineWidth = 1.15; c.beginPath();
      for (let k = -3; k <= 3; k++) { const y = k * r * S.w * 0.24; c.moveTo(-r * S.l * 0.72, y); c.lineTo(r * S.l * 0.08 - Math.abs(k) * 1.5, y + r * 0.12); }
      c.stroke();
      if (S.mark === 'plates') { c.fillStyle = cut; for (const [x, y] of [[0.2, -0.45], [0.2, 0.45]]) c.fillRect(x * r - r * 0.2, y * r - r * 0.2, r * 0.4, r * 0.4); }
      if (S.mark === 'belly' || S.mark === 'eggs') { c.strokeStyle = cut; c.lineWidth = 1.1; for (const k of [0.3, 0.55]) { c.beginPath(); c.arc(r * 0.2, 0, r * k, -1.2, 1.2); c.stroke(); } }
      if (S.mark === 'robe') { c.strokeStyle = BONE; c.lineWidth = 1.6; c.beginPath(); c.moveTo(-r * 0.3, r); c.lineTo(r * 1.7 + lunge * 4, r * 0.8); c.stroke(); c.fillStyle = BONE; c.beginPath(); c.arc(r * 1.8 + lunge * 4, r * 0.8, 3, 0, TAU); c.fill(); }
      // the skull: sockets and a row of teeth cut out of it (the red of the eyes is printed in a second pass, see over())
      const hx = r * (S.l * 0.72 + (S.mark === 'crawl' ? 0.2 : 0)), hy = wob * r * 0.1, hr = r * S.h;
      c.fillStyle = fill; c.strokeStyle = INK; c.lineWidth = 1.4; facet(c, hx, hy, hr, hr, z.id + 3, 7); c.fill(); c.stroke();
      c.fillStyle = cut; const er = Math.max(1.3, hr * 0.24);
      c.beginPath(); c.arc(hx + hr * 0.36, hy - hr * 0.4, er, 0, TAU); c.arc(hx + hr * 0.36, hy + hr * 0.4, er, 0, TAU); c.fill();
      c.strokeStyle = cut; c.lineWidth = 0.9; c.beginPath(); for (let k = -1; k <= 1; k++) { c.moveTo(hx + hr * 0.72, hy + k * hr * 0.24); c.lineTo(hx + hr * 0.98, hy + k * hr * 0.24); } c.stroke();
      c.restore(); c.globalAlpha = 1;
    },
    player(R_, c, p) {
      c.save(); c.translate(p.x, p.y);
      if (p.down) { c.rotate(1.2 + p.x); c.fillStyle = BONE; c.strokeStyle = INK; c.lineWidth = 1.5; facet(c, 0, 0, 15, 9, 3, 8); c.fill(); c.stroke(); c.beginPath(); c.arc(13, 0, 6, 0, TAU); c.fill(); c.stroke(); c.strokeStyle = INK; c.beginPath(); c.moveTo(-9, -5); c.lineTo(9, 5); c.moveTo(-9, 5); c.lineTo(9, -5); c.stroke(); c.restore(); return; }
      c.rotate(p.aim);
      const sw = p.moving ? Math.sin(p.walk) * 6 : 0, kick = p.flash > 0 ? -2.5 : 0, hurt = p.hurtT > 0.2, fill = hurt ? INK : BONE, cut = hurt ? BONE : INK;
      const G = (R.int && R.int.GUNLOOK && (R.int.GUNLOOK[p.cur] || R.int.GUNLOOK.pistol)) || { len: 16, w: 5 };
      c.fillStyle = BONE; c.beginPath(); c.ellipse(sw, -6.5, 6, 3.4, 0, 0, TAU); c.ellipse(-sw, 6.5, 6, 3.4, 0, 0, TAU); c.fill();
      c.strokeStyle = BONE; c.lineCap = 'butt'; c.lineWidth = 5; c.beginPath(); c.moveTo(1, 10); c.lineTo(13 + kick, 5); c.moveTo(2, -10); c.lineTo(Math.min(20, 9 + G.len * 0.6) + kick, 2.5); c.stroke();
      c.fillStyle = BONE; c.fillRect(8 + kick, 2.2, G.len + 3, Math.max(3, G.w * 0.7)); c.fillStyle = INK; c.fillRect(8 + kick, 3.6, G.len + 1, 0.9);
      c.fillStyle = fill; c.strokeStyle = INK; c.lineWidth = 1.6; c.beginPath(); c.rect(-13, -7, 6, 14); c.fill(); c.stroke();
      facet(c, 0, 0, 9.5, 13, 5, 8); c.fill(); c.stroke();
      c.strokeStyle = cut; c.lineWidth = 1.1; c.beginPath(); for (let k = -2; k <= 2; k++) { c.moveTo(-6, k * 4.4); c.lineTo(-0.5, k * 4.4 + 1); } c.stroke();     // coat, cut like the dead but tidier
      c.fillStyle = fill; c.strokeStyle = INK; c.lineWidth = 1.5; c.beginPath(); c.arc(2.5, 0, 6.6, 0, TAU); c.fill(); c.stroke();
      c.fillStyle = cut; c.beginPath(); c.moveTo(-4.5, -5); c.lineTo(3, -7.2); c.lineTo(3, 7.2); c.lineTo(-4.5, 5); c.fill();                                   // a wide hat brim seen from above
      c.restore();
    },
    sprite(R_, id) {
      const def = GD.STRUCTS[id]; if (!def) return null;
      const turret = GD.TURRET_IDS.indexOf(id) >= 0;
      const known = { wood: 1, steel: 1, bunker: 1, gate: 1, fence: 1, wire: 1, spikes: 1, mine: 1, lamp: 1, lure: 1, medic: 1, trail: 1, ward: 1 };
      if (!known[id] && !(turret && (def.gun || id === 'turret' || id === 'cannon' || id === 'napalm' || id === 'tesla'))) return null;
      const S = 3, cv = mk(CELL * S, CELL * S), g = cv.getContext('2d');
      g.scale(S, S); g.lineCap = 'butt';
      const block = (inset) => { g.fillStyle = INK; g.fillRect(0, 0, 40, 40); g.fillStyle = BONE; g.fillRect(inset, inset, 40 - inset * 2, 40 - inset * 2); g.strokeStyle = INK; g.lineWidth = 1.2; g.strokeRect(inset + 2.2, inset + 2.2, 40 - inset * 2 - 4.4, 40 - inset * 2 - 4.4); };
      const cuts = (fn) => { g.save(); g.beginPath(); g.rect(4.5, 4.5, 31, 31); g.clip(); g.strokeStyle = INK; g.lineWidth = 1.15; g.beginPath(); fn(); g.stroke(); g.restore(); };
      if (id === 'wood') { block(1.5); cuts(() => { for (let k = 1; k < 4; k++) { g.moveTo(4, 4 + k * 8); g.lineTo(36, 4 + k * 8); } for (let k = 0; k < 9; k++) { g.moveTo(6 + k * 3.4, 36); g.lineTo(8.5 + k * 3.4, 28.5); } for (let k = 0; k < 5; k++) { g.moveTo(8 + k * 6, 7 + (k % 3) * 8); g.lineTo(12 + k * 6, 7 + (k % 3) * 8 + 1.5); } }); }
      else if (id === 'steel') { block(1.5); cuts(() => { for (let k = 0; k < 9; k++) { g.moveTo(4 + k * 4, 36); g.lineTo(8 + k * 4, 19 + k * 1.1); } }); g.fillStyle = INK; for (const [x, y] of [[7.5, 7.5], [32.5, 7.5], [20, 7.5]]) { g.beginPath(); g.arc(x, y, 1.4, 0, TAU); g.fill(); } }
      else if (id === 'bunker') { block(0.8); g.strokeStyle = INK; g.lineWidth = 2.4; g.strokeRect(3.6, 3.6, 32.8, 32.8); cuts(() => { for (let k = -8; k < 9; k++) { g.moveTo(20 + k * 4, 36); g.lineTo(30 + k * 4, 16); g.moveTo(20 + k * 4, 16); g.lineTo(30 + k * 4, 36); } }); }
      else if (id === 'gate') { block(1.5); g.strokeStyle = INK; g.lineWidth = 2.6; for (let k = 0; k < 3; k++) { g.beginPath(); g.moveTo(10, 14 + k * 8.5); g.lineTo(20, 8.5 + k * 8.5); g.lineTo(30, 14 + k * 8.5); g.stroke(); } }
      else if (id === 'fence') { g.strokeStyle = BONE; g.lineWidth = 3; g.beginPath(); g.moveTo(5, 3); g.lineTo(5, 37); g.moveTo(35, 3); g.lineTo(35, 37); g.stroke(); g.lineWidth = 1.1; g.beginPath(); for (let k = 0; k < 4; k++) { g.moveTo(5, 8 + k * 8); g.lineTo(35, 8 + k * 8); } g.moveTo(15, 5); g.lineTo(21, 16); g.lineTo(16, 18); g.lineTo(25, 32); g.stroke(); }
      else if (id === 'wire') { g.strokeStyle = BONE; g.lineWidth = 1; for (let rw = 0; rw < 3; rw++) { g.beginPath(); for (let x = 2; x <= 38; x += 4) g.lineTo(x, 9 + rw * 11 + ((x / 4) % 2 ? -4 : 4)); g.stroke(); } g.lineWidth = 2.2; g.beginPath(); g.moveTo(4, 4); g.lineTo(4, 36); g.moveTo(36, 4); g.lineTo(36, 36); g.stroke(); }
      else if (id === 'spikes') { g.strokeStyle = BONE; g.lineWidth = 1.2; g.strokeRect(4.5, 4.5, 31, 31); g.fillStyle = BONE; for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) { const x = 9.5 + i * 7, y = 11 + j * 7; g.beginPath(); g.moveTo(x - 2.2, y + 2); g.lineTo(x, y - 3.4); g.lineTo(x + 2.2, y + 2); g.fill(); } }
      else if (id === 'mine') { g.fillStyle = BONE; g.strokeStyle = INK; g.lineWidth = 1.4; g.beginPath(); for (let k = 0; k < 8; k++) { const a = k / 8 * TAU; g.lineTo(20 + Math.cos(a) * 10, 20 + Math.sin(a) * 10); } g.closePath(); g.fill(); g.beginPath(); g.moveTo(13, 13); g.lineTo(27, 27); g.moveTo(27, 13); g.lineTo(13, 27); g.stroke(); }
      else if (id === 'lamp') { g.fillStyle = BONE; g.beginPath(); g.arc(20, 20, 8, 0, TAU); g.fill(); g.strokeStyle = BONE; g.lineWidth = 1.5; g.beginPath(); for (let k = 0; k < 12; k++) { const a = k / 12 * TAU; g.moveTo(20 + Math.cos(a) * 11, 20 + Math.sin(a) * 11); g.lineTo(20 + Math.cos(a) * (k % 2 ? 15 : 18), 20 + Math.sin(a) * (k % 2 ? 15 : 18)); } g.stroke(); g.fillStyle = INK; g.beginPath(); g.arc(20, 20, 3, 0, TAU); g.fill(); }
      else if (id === 'lure') { g.fillStyle = BONE; g.fillRect(6, 10, 28, 20); g.strokeStyle = INK; g.lineWidth = 1.3; g.strokeRect(8, 12, 24, 16); g.beginPath(); g.arc(15, 20, 5, 0, TAU); g.stroke(); g.strokeStyle = BONE; g.beginPath(); g.moveTo(31, 10); g.lineTo(37, 2); g.stroke(); }
      else if (id === 'medic') { block(2); g.fillStyle = INK; g.fillRect(16.5, 9, 7, 22); g.fillRect(9, 16.5, 22, 7); }
      else if (id === 'trail') { g.strokeStyle = BONE; g.lineWidth = 1.6; g.setLineDash([5, 4]); g.beginPath(); for (let k = 0; k < 4; k++) { g.moveTo(5, 9 + k * 7.5); g.lineTo(35, 11 + k * 7.5); } g.stroke(); }
      else if (id === 'ward') { g.strokeStyle = BONE; g.lineWidth = 3; g.beginPath(); g.moveTo(20, 5); g.lineTo(20, 37); g.stroke(); g.fillStyle = BONE; for (const y of [9, 19, 29]) { g.beginPath(); g.arc(20, y, 5, 0, TAU); g.fill(); g.fillStyle = INK; g.fillRect(17.3, y - 1.5, 2.2, 2.2); g.fillRect(20.6, y - 1.5, 2.2, 2.2); g.fillStyle = BONE; } }
      else { block(3); g.fillStyle = INK; g.beginPath(); g.arc(20, 20, 12, 0, TAU); g.fill(); g.strokeStyle = BONE; g.lineWidth = 1.4; g.beginPath(); g.arc(20, 20, 9.5, 0, TAU); g.stroke(); }      // turret mount
      return cv;
    },
    struct(R_, c, s, alpha, noBase) {
      const def = GD.STRUCTS[s.id], x = s.cx * CELL, y = s.cy * CELL;
      const gunny = def.gun || s.id === 'turret' || s.id === 'cannon' || s.id === 'napalm';
      if (!gunny && !def.wall && !({ wire: 1, spikes: 1, mine: 1, lamp: 1, medic: 1, trail: 1 })[s.id]) return false;
      c.globalAlpha = alpha === undefined ? 1 : alpha;
      if (!noBase) c.drawImage(R_.sprite(s.id), x, y, CELL, CELL);
      if (alpha === undefined && def.wall && s.maxhp && s.hp < s.maxhp * 0.7) {             // damage: the block splits along black wedges
        const k = 1 - s.hp / s.maxhp; c.fillStyle = INK;
        for (let i = 0, n = Math.ceil(k * 4); i < n; i++) { const px = x + 7 + hash(s.uid, i) * 26, w = 2 + hash(s.uid, i + 5) * 4, top = hash(s.uid, i + 9) < 0.5; c.beginPath(); c.moveTo(px - w, top ? y + 2 : y + CELL - 2); c.lineTo(px + w, top ? y + 2 : y + CELL - 2); c.lineTo(px + (hash(s.uid, i + 3) - 0.5) * 8, top ? y + 8 + k * 22 : y + CELL - 8 - k * 22); c.fill(); }
      }
      if (gunny) {
        const G = (R.int && R.int.GUNLOOK && R.int.GUNLOOK[s.gun || def.gun]) || { len: s.id === 'cannon' ? 22 : 18, w: s.id === 'cannon' ? 10 : 6 }, kick = s.flash > 0 ? -2.5 : 0, bw = Math.max(4.5, G.w * 0.85);
        c.save(); c.translate(s.x, s.y); c.rotate(s.ang || 0);
        c.fillStyle = BONE; c.fillRect(2 + kick, -bw / 2, G.len + 3, bw); c.fillStyle = INK; c.fillRect(4 + kick, -0.6, G.len - 1, 1.2);
        c.fillStyle = BONE; c.strokeStyle = INK; c.lineWidth = 1.3; facet(c, 0, 0, 7.5, 7.5, s.uid, 6); c.fill(); c.stroke(); c.fillStyle = INK; c.beginPath(); c.arc(-1, 0, 2, 0, TAU); c.fill();
        c.restore();
        if (alpha === undefined && R_.showOwners && def.gun) { const nm = def.name.replace(' Turret', ''); c.font = 'bold 11px Georgia, serif'; c.textAlign = 'center'; c.fillStyle = BONE; c.fillText(nm, s.x, s.y + 32); }
      }
      if (alpha === undefined && R_.showOwners) { c.fillStyle = R_.ownerColor(s.owner); c.fillRect(x + 2, y + 2, 5, 5); }
      if (s.hitT > 0 && alpha === undefined) { c.globalAlpha = 0.85; c.fillStyle = INK; c.fillRect(x + 3, y + 3, CELL - 6, CELL - 6); }       // struck: it prints black for a moment
      c.globalAlpha = 1;
      return true;
    },
    // light, as a printer cuts it: rays gouged out of the black around the fire, each lamp and every flashlight
    under(R_, c, sim) {
      const t6 = Math.floor(R_.time * 5), fk = sim.fireMax ? Math.max(0, Math.min(1, sim.fireHp / sim.fireMax)) : 1;
      if (!(sim.phase === 'over' && fk <= 0)) c.globalAlpha = 0.5; rays(c, FIRE.x, FIRE.y, 44, 120 + 170 * fk, 0, TAU, 44, 40 + (t6 % 3), 0.8);
      for (const s of sim.structs) if (s.id === 'lamp') rays(c, s.x, s.y, 26, 190, 0, TAU, 18, s.uid, 0.7);
      for (const p of sim.players) if (!p.away && !p.down) { c.globalAlpha = 0.32; rays(c, p.x, p.y, 54, 300, p.aim - 0.3, p.aim + 0.3, 5, 7, 0.6); }     // a flashlight is only a few faint cuts, so the survivor stays easy to see
      c.globalAlpha = 1;
    },
    // the second pass on the press: red. Eyes of every one of the dead you can see, and a ruled border round the sheet.
    over(R_, c, sim) {
      c.fillStyle = RED;
      c.beginPath();
      for (const z of sim.zombies) {
        if (z.burrowed || z.vis < 0.5 || z.hitT > 0) continue;
        const S = shape(z.type); if (S.seg && !S.head) continue;
        const r = z.r, ca = Math.cos(z.ang), sa = Math.sin(z.ang), hr = r * (S.h || 0.5), hd = r * ((S.l || 0.8) * 0.72 + (S.mark === 'crawl' ? 0.2 : 0)) + hr * 0.36, e = hr * 0.4, y = z.y - (z.air || 0) * 16, er = Math.max(1.2, hr * 0.2);
        const hx = z.x + ca * hd, hy = y + sa * hd;
        c.moveTo(hx - sa * e + er, hy + ca * e); c.arc(hx - sa * e, hy + ca * e, er, 0, TAU); c.moveTo(hx + sa * e + er, hy - ca * e); c.arc(hx + sa * e, hy - ca * e, er, 0, TAU);
      }
      c.fill();
      c.lineCap = 'butt'; c.strokeStyle = BONE; c.lineWidth = 2.6; c.beginPath();
      for (const b of sim.bullets) { if (b.kind !== 'bullet' || b.wid === 'saw') continue; const sp = Math.hypot(b.vx, b.vy) || 1, tl = b.wid === 'sniper' || b.wid === 'rail' ? 70 : 28; c.moveTo(b.x, b.y); c.lineTo(b.x - b.vx / sp * tl, b.y - b.vy / sp * tl); }
      c.stroke();
      c.strokeStyle = BONE; c.lineWidth = 6; c.strokeRect(9, 9, W - 18, H - 18); c.lineWidth = 1.4; c.strokeRect(19, 19, W - 38, H - 38);
    },
    // everything that burns is cut as bone sparks; the campfire is a sunburst with a red heart
    hot(R_, c, fireS) {
      c.globalCompositeOperation = 'source-over'; c.lineCap = 'butt';
      c.strokeStyle = BONE; c.fillStyle = BONE;
      for (const p of R_.parts) {
        const t = Math.max(0, Math.min(1, p.life / p.max));
        if (p.k === 'fire' || p.k === 'acid') { c.globalAlpha = 0.9 * t; const s = p.size * (0.35 + t * 0.4); c.beginPath(); c.moveTo(p.x, p.y - s); c.lineTo(p.x + s * 0.6, p.y); c.lineTo(p.x, p.y + s); c.lineTo(p.x - s * 0.6, p.y); c.fill(); }
        else if (p.k === 'spark' || p.k === 'ember') { c.globalAlpha = t; c.lineWidth = 1.3; c.beginPath(); c.moveTo(p.x, p.y); c.lineTo(p.x - p.vx * 0.03, p.y - p.vy * 0.03 - 2); c.stroke(); }
      }
      c.globalAlpha = 1;
      if (fireS > 0) {
        const b = Math.floor(R_.time * 6);
        c.fillStyle = BONE; c.strokeStyle = INK; c.lineWidth = 1.2; c.beginPath();
        for (let i = 0; i < 20; i++) { const a = i / 20 * TAU, d = (i % 2 ? 13 : 24 + hash(b, i) * 11) * fireS; i ? c.lineTo(FIRE.x + Math.cos(a) * d, FIRE.y + Math.sin(a) * d) : c.moveTo(FIRE.x + Math.cos(a) * d, FIRE.y + Math.sin(a) * d); }
        c.closePath(); c.fill(); c.stroke();
        c.fillStyle = RED; c.beginPath(); c.arc(FIRE.x, FIRE.y, 8 * fireS, 0, TAU); c.fill(); c.stroke();
      }
    },
  };
  R.LOOKS = R.LOOKS || {};
  R.LOOKS.woodcut = look;
})(window);
