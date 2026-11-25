// Last Ember - graphics style "Shadow puppet theatre". A lamp burns behind a cloth screen (the campfire is the lamp).
// Everything is a black cut-out pressed against the cloth, with rows of small holes punched through it so the light
// shows: no colour, no shading. Things far from the lamp stand off the cloth, so their shadows grow larger and softer.
(function (root) {
  'use strict';
  const R = root.Renderer;
  if (!R) return;
  const GD = root.GD, { CELL, W, H } = GD, FIRE = root.SIM.FIRE, TAU = Math.PI * 2;
  const K = '#120804';
  const hash = (a, b) => { let n = (a * 374761393 + b * 668265263) | 0; n = (n ^ (n >>> 13)) * 1274126177 | 0; return ((n ^ (n >>> 16)) >>> 0) / 4294967296; };
  const mk = (w, h) => { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; };
  const shape = (t) => (R.SHAPES && (R.SHAPES[t] || R.SHAPES.walker)) || { w: 0.95, l: 0.7, h: 0.5, arm: 1.35 };
  const hole = (c, x, y, r) => { c.moveTo(x + r, y); c.arc(x, y, r, 0, TAU, true); };       // wound the other way, so it cuts out of the shape
  const look = {
    fxInk: '255,244,200',
    // what flies: scraps of black card, turning as they fall away from the screen
    fleck(R_, c, p) { const t = Math.max(0, p.life / p.max), q = (1 - t) * 12 + p.size * 3, s = 2.5 + p.size * 2; c.fillStyle = K; c.beginPath(); c.moveTo(p.x + Math.cos(q) * s, p.y + Math.sin(q) * s); c.lineTo(p.x + Math.cos(q + 2.2) * s, p.y + Math.sin(q + 2.2) * s * Math.abs(Math.sin(q))); c.lineTo(p.x + Math.cos(q + 4) * s * 0.7, p.y + Math.sin(q + 4) * s * 0.7); c.fill(); },
    // the dead: the puppet dropped. Its card lies in two pieces with the holes still in it, the rod snapped beside it
    body(R_, d, e, r, torn) {
      d.fillStyle = K; d.globalAlpha = 0.92;
      const piece = (ox, oy, rot, a0, a1) => { d.save(); d.translate(ox, oy); d.rotate(rot); d.beginPath(); d.ellipse(0, 0, r * 1.05, r * 0.72, 0, a0, a1); d.closePath(); for (let k = 0; k < 3; k++) hole(d, (k - 1) * r * 0.45, (a0 < 1 ? 1 : -1) * r * 0.3, Math.max(1, r * 0.1)); d.fill('evenodd'); d.restore(); };
      const gap = torn ? r * 0.9 : r * 0.22;
      piece(-gap, gap * 0.4, 0.2, 0, Math.PI); piece(gap, -gap * 0.4, -0.25, Math.PI, TAU);
      d.beginPath(); d.arc(r * (torn ? 2.2 : 1.5), r * 0.5, r * 0.45, 0, TAU); hole(d, r * (torn ? 2.2 : 1.5) + r * 0.12, r * 0.38, Math.max(1, r * 0.1)); d.fill('evenodd');
      d.strokeStyle = K; d.lineWidth = 1.3; d.globalAlpha = 0.7; d.beginPath(); d.moveTo(-r * 0.3, r * 0.9); d.lineTo(-r * 1.6, r * 2.4); d.moveTo(-r * 1.9, r * 2.5); d.lineTo(-r * 3.0, r * 3.0); d.stroke();      // the rod, broken
      d.globalAlpha = 1;
    },
    // there is no blood in a shadow play. A wound tears the cloth: pinholes for a hit, a ragged rip with the lamp
    // glaring through for a kill, and scraps of black card left where the puppet fell apart.
    splat(R_, d, x, y, r, bile, alpha, ang) {
      const rnd = (a, b) => a + Math.random() * (b - a);
      if (r < 8) { d.fillStyle = '#fff3c8'; for (let i = 0; i < 3; i++) { d.globalAlpha = rnd(0.6, 1); d.beginPath(); d.arc(x + rnd(-r, r), y + rnd(-r, r), rnd(0.8, 1.8), 0, TAU); d.fill(); } return; }
      const rot = ang === undefined ? rnd(0, TAU) : ang, L = r * rnd(1.0, 1.7), Wd = r * rnd(0.22, 0.4);
      const rip = (k) => { d.beginPath(); for (let i = 0; i <= 10; i++) { const t = i / 10, px = (t - 0.5) * 2 * L * k, py = Math.sin(t * Math.PI) * Wd * k * (0.6 + Math.random() * 0.8); const X = x + Math.cos(rot) * px - Math.sin(rot) * py, Y = y + Math.sin(rot) * px + Math.cos(rot) * py; i ? d.lineTo(X, Y) : d.moveTo(X, Y); } for (let i = 10; i >= 0; i--) { const t = i / 10, px = (t - 0.5) * 2 * L * k, py = -Math.sin(t * Math.PI) * Wd * k * (0.6 + Math.random() * 0.8); d.lineTo(x + Math.cos(rot) * px - Math.sin(rot) * py, y + Math.sin(rot) * px + Math.cos(rot) * py); } d.closePath(); };
      d.globalAlpha = 0.55; d.fillStyle = '#5a2a0a'; rip(1.18); d.fill();                 // the frayed, scorched edge
      d.globalAlpha = 1; d.fillStyle = '#fff6d8'; rip(1); d.fill();                        // the lamp, straight through the hole
      d.fillStyle = K; for (let i = 0, n = 3 + (r / 5 | 0); i < n; i++) { const a = rnd(0, TAU), dist = r * rnd(0.8, 2.2), sx = x + Math.cos(a) * dist, sy = y + Math.sin(a) * dist, s = rnd(2, 5), q = rnd(0, TAU); d.globalAlpha = 0.9; d.beginPath(); d.moveTo(sx + Math.cos(q) * s, sy + Math.sin(q) * s); d.lineTo(sx + Math.cos(q + 2.2) * s, sy + Math.sin(q + 2.2) * s); d.lineTo(sx + Math.cos(q + 4) * s * 0.7, sy + Math.sin(q + 4) * s * 0.7); d.fill(); }
    },
    fxHot: true, bloodFx: '#120804', bileFx: '#120804', dark: '26,10,2', darkK: 0.95, eye: '#ffd98a', corpse: '#1c0d06', filter: 'grayscale(1) brightness(0.3) contrast(1.7)',
    hudFont: 'Georgia, "Times New Roman", serif', titleFont: 'italic 700 PXpx Georgia, "Times New Roman", serif',
    blood: ['#140904', '#1a0c05', '#100603', '#180a04'], bile: ['#161006', '#1c1408', '#120c04', '#181206'],      // no colour in a shadow play: whatever falls is black card
    // the screen: stretched cloth, brightest where the lamp stands behind it
    ground(R_, g) {
      const rnd = (a, b) => a + Math.random() * (b - a);
      const q = g.createRadialGradient(FIRE.x, FIRE.y, 20, FIRE.x, FIRE.y, 1150);
      q.addColorStop(0, '#fff3c8'); q.addColorStop(0.12, '#fbd98a'); q.addColorStop(0.35, '#e9a548'); q.addColorStop(0.7, '#b46a22'); q.addColorStop(1, '#6a3410');
      g.fillStyle = q; g.fillRect(0, 0, W, H);
      g.lineWidth = 1;
      for (let i = 0; i < 9000; i++) { const x = rnd(0, W), y = rnd(0, H), h = Math.random() < 0.5; g.strokeStyle = `rgba(${Math.random() < 0.6 ? '70,30,6' : '255,236,180'},${rnd(0.03, 0.1)})`; g.beginPath(); g.moveTo(x, y); g.lineTo(x + (h ? rnd(10, 40) : 0), y + (h ? 0 : rnd(10, 40))); g.stroke(); }      // the weave
      for (let i = 0; i < 40; i++) { const x = rnd(0, W), y = rnd(0, H), r = rnd(40, 160), s = g.createRadialGradient(x, y, 0, x, y, r); s.addColorStop(0, 'rgba(90,40,8,0.1)'); s.addColorStop(1, 'rgba(90,40,8,0)'); g.fillStyle = s; g.fillRect(x - r, y - r, r * 2, r * 2); }      // old stains
      g.strokeStyle = 'rgba(60,26,6,0.3)'; g.lineWidth = 2; g.setLineDash([9, 7]); for (const x of [W / 3, W * 2 / 3]) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x + 6, H); g.stroke(); } g.setLineDash([]);      // seams where the cloth was joined
      // the frame of the booth: a carved black border with a pierced pattern
      g.fillStyle = K; g.fillRect(0, 0, W, 26); g.fillRect(0, H - 26, W, 26); g.fillRect(0, 0, 26, H); g.fillRect(W - 26, 0, 26, H);
      g.beginPath(); for (let x = 26; x < W - 26; x += 44) { g.moveTo(x, 26); g.quadraticCurveTo(x + 22, 56, x + 44, 26); g.moveTo(x, H - 26); g.quadraticCurveTo(x + 22, H - 56, x + 44, H - 26); } for (let y = 26; y < H - 26; y += 44) { g.moveTo(26, y); g.quadraticCurveTo(56, y + 22, 26, y + 44); g.moveTo(W - 26, y); g.quadraticCurveTo(W - 56, y + 22, W - 26, y + 44); } g.fill();
      g.globalCompositeOperation = 'destination-out'; g.beginPath(); for (let x = 48; x < W - 30; x += 44) { hole(g, x, 13, 4); hole(g, x, H - 13, 4); hole(g, x, 36, 2.4); hole(g, x, H - 36, 2.4); } for (let y = 48; y < H - 30; y += 44) { hole(g, 13, y, 4); hole(g, W - 13, y, 4); } g.fill();
      g.globalCompositeOperation = 'destination-over'; g.fillStyle = '#e9a548'; g.fillRect(0, 0, W, H); g.globalCompositeOperation = 'source-over';
    },
    zombie(R_, c, z) {
      const za = z.vis === undefined ? 1 : z.vis;
      if (z.burrowed) { R_.drawBurrow(c, z); return; }
      const S = shape(z.type), r = z.r, air = z.air || 0;
      // distance from the lamp = distance from the cloth: the shadow swells and its edge goes soft
      const far = Math.max(0, Math.min(1, (Math.hypot(z.x - FIRE.x, z.y - FIRE.y) - 260) / 620)), grow = 1 + far * 0.45 + air * 0.35;
      c.save(); c.translate(z.x, z.y - air * 16); c.rotate(z.ang || 0);
      const wob = Math.sin(z.wob || 0), lunge = Math.max(0, z.lunge || 0), L = S.seg ? (S.head ? 1.15 : 0.95) : S.l, Wd = S.seg ? 0.85 : S.w;
      const fig = (k) => {
        const rr = r * k;
        c.lineCap = 'round'; c.lineJoin = 'round';
        if (S.arm) { c.lineWidth = rr * (S.armW || 0.3); c.beginPath(); for (const sd of [-1, 1]) { const reach = rr * (S.arm + sd * wob * 0.22 + lunge * 0.5), y1 = sd * rr * (S.mark === 'crawl' ? 0.9 : 0.42); c.moveTo(0, sd * rr * Wd * 0.85); c.lineTo(reach * 0.55, sd * rr * (Wd * 0.9 + 0.14)); c.lineTo(reach, y1); for (let f = -1; f <= 1; f++) { c.moveTo(reach, y1); c.lineTo(reach + rr * 0.42, y1 + f * rr * 0.26); } } c.stroke(); }
        c.beginPath();
        c.ellipse(0, 0, rr * L, rr * Wd, 0, 0, TAU);
        if (!S.seg) { c.moveTo(rr * (L * 0.72) + rr * S.h, wob * rr * 0.1); c.arc(rr * L * 0.72, wob * rr * 0.1, rr * S.h, 0, TAU); }
        if (S.mark === 'spikes' || S.mark === 'horns' || z.champ) { const n = S.mark === 'horns' ? 2 : 9; for (let i = 0; i < n; i++) { const a = S.mark === 'horns' ? (i ? 0.5 : -0.5) : Math.PI * 0.5 + i / (n - 1) * Math.PI; c.moveTo(Math.cos(a - 0.18) * rr * 0.8, Math.sin(a - 0.18) * rr * 0.8); c.lineTo(Math.cos(a) * rr * 1.6, Math.sin(a) * rr * 1.6); c.lineTo(Math.cos(a + 0.18) * rr * 0.8, Math.sin(a + 0.18) * rr * 0.8); } }
        if (S.mark === 'robe') { c.moveTo(rr * 0.2, -rr * 0.8); c.lineTo(-rr * 1.9, -rr); c.lineTo(-rr * 1.4, 0); c.lineTo(-rr * 1.9, rr); c.lineTo(rr * 0.2, rr * 0.8); }
        if (S.mark === 'legs' || S.seg) for (const sd of [-1, 1]) { c.moveTo(-rr * 0.3, sd * rr * 0.6); c.lineTo(-rr * 1.2, sd * rr * 1.3); c.lineTo(-rr * 1.0, sd * rr * 0.5); }
        if (S.mark === 'wings') for (const sd of [-1, 1]) { c.moveTo(rr * 1.1, sd * rr * 1.2); c.ellipse(-rr * 0.1, sd * rr * 1.2, rr * 1.2, rr * 0.5, sd * 0.4, 0, TAU); }
      };
      if (far > 0.08) { c.fillStyle = K; c.strokeStyle = K; for (const [k, a] of [[grow * 1.16, 0.16], [grow * 1.08, 0.26]]) { c.globalAlpha = za * a; fig(k); c.fill(); } }      // the soft penumbra
      c.globalAlpha = za * (z.hitT > 0 ? 0.55 : 1 - far * 0.25); c.fillStyle = K; c.strokeStyle = K;
      fig(grow);
      // the pierced work: eyes, and a row of holes down the body, different for every kind
      const rr = r * grow, hx = rr * L * 0.72, hy = wob * rr * 0.1, hr = rr * (S.h || 0.5), n = 3 + (hash(z.type.length, z.type.charCodeAt(0)) * 3 | 0);
      if (!S.seg) { hole(c, hx + hr * 0.3, hy - hr * 0.4, Math.max(1.2, hr * 0.22)); hole(c, hx + hr * 0.3, hy + hr * 0.4, Math.max(1.2, hr * 0.22)); }
      for (let i = 0; i < n; i++) { const t = (i + 0.5) / n - 0.5; hole(c, -rr * L * 0.25 + (S.mark === 'belly' || S.mark === 'eggs' ? Math.cos(t * 6) * rr * 0.3 : 0), t * rr * Wd * 1.4, Math.max(1, rr * 0.09)); }
      if (S.mark === 'plates' || S.seg) { c.rect(-rr * 0.1, -rr * 0.5, rr * 0.16, rr * 1.0); }
      c.fill('evenodd');
      if (z.rage > 0 || z.burn > 0) { c.globalAlpha = za * 0.5; c.strokeStyle = z.burn > 0 ? '#fff0b0' : K; c.lineWidth = 1.4; c.beginPath(); for (let i = 0; i <= 14; i++) { const a = i / 14 * TAU, d = rr * (i % 2 ? 1.8 : 1.4); c.lineTo(Math.cos(a) * d, Math.sin(a) * d); } c.stroke(); }
      if (z.chill > 0 || z.raised || z.stunImm > 0) { c.globalAlpha = za * 0.6; c.strokeStyle = K; c.lineWidth = 1.2; c.setLineDash([2, 5]); c.beginPath(); c.arc(0, 0, rr * 1.4, 0, TAU); c.stroke(); c.setLineDash([]); }
      c.restore();
      if (far < 0.5) { c.globalAlpha = za * 0.45; c.strokeStyle = K; c.lineWidth = 1.2; c.beginPath(); c.moveTo(z.x, z.y); c.lineTo(z.x + (z.x - FIRE.x) * 0.05, z.y + 46 + r); c.stroke(); }      // the rod that works the puppet
      c.globalAlpha = 1;
    },
    player(R_, c, p) {
      c.save(); c.translate(p.x, p.y);
      if (p.down) { c.rotate(1.2 + p.x); c.fillStyle = K; c.beginPath(); c.ellipse(0, 0, 15, 9, 0, 0, TAU); c.moveTo(19, 0); c.arc(13, 0, 6, 0, TAU); c.fill(); c.restore(); return; }
      c.rotate(p.aim);
      const sw = p.moving ? Math.sin(p.walk) * 6 : 0, kick = p.flash > 0 ? -2.5 : 0;
      const G = (R.int && R.int.GUNLOOK && (R.int.GUNLOOK[p.cur] || R.int.GUNLOOK.pistol)) || { len: 16, w: 5 };
      c.fillStyle = K; c.strokeStyle = K; c.lineCap = 'round';
      c.beginPath(); c.ellipse(sw, -6.5, 6.5, 3.8, 0, 0, TAU); c.ellipse(-sw, 6.5, 6.5, 3.8, 0, 0, TAU); c.fill();
      c.lineWidth = 5.5; c.beginPath(); c.moveTo(1, 10); c.lineTo(13 + kick, 5); c.moveTo(2, -10); c.lineTo(Math.min(20, 9 + G.len * 0.6) + kick, 2.5); c.stroke();
      c.fillRect(8 + kick, 2, G.len + 3, Math.max(3.4, G.w * 0.75));
      c.beginPath(); c.ellipse(0, 0, 9.8, 13.4, 0, 0, TAU); c.moveTo(9.4, 0); c.arc(2.5, 0, 6.9, 0, TAU);
      c.moveTo(-9, -9); c.lineTo(-17, -13); c.lineTo(-13, -4); c.moveTo(-9, 9); c.lineTo(-17, 13); c.lineTo(-13, 4);                 // the points of a tall headdress, seen from above
      hole(c, -1.5, 0, 4.2); hole(c, -2, -8, 1.5); hole(c, -2, 8, 1.5); hole(c, 5.5, -2.6, 1.3); hole(c, 5.5, 2.6, 1.3);
      c.fill('evenodd');
      c.restore();
      c.strokeStyle = K; c.globalAlpha = 0.5; c.lineWidth = 1.4; c.beginPath(); c.moveTo(p.x, p.y); c.lineTo(p.x + (p.x - FIRE.x) * 0.05, p.y + 66); c.stroke(); c.globalAlpha = 1;
    },
    sprite(R_, id) {
      const def = GD.STRUCTS[id]; if (!def) return null;
      const turret = GD.TURRET_IDS.indexOf(id) >= 0;
      const known = { wood: 1, steel: 1, bunker: 1, gate: 1, fence: 1, wire: 1, spikes: 1, mine: 1, lamp: 1, lure: 1, medic: 1, trail: 1, ward: 1 };
      if (!known[id] && !(turret && (def.gun || id === 'turret' || id === 'cannon' || id === 'napalm' || id === 'tesla'))) return null;
      const S = 3, cv = mk(CELL * S, CELL * S), g = cv.getContext('2d');
      g.scale(S, S); g.fillStyle = K; g.strokeStyle = K; g.lineCap = 'round';
      const cut = (fn) => { g.globalCompositeOperation = 'destination-out'; g.beginPath(); fn(); g.fill(); g.globalCompositeOperation = 'source-over'; };
      const solid = () => g.fillRect(0, 0, 40, 40);
      if (id === 'wood') { solid(); cut(() => { for (let k = 0; k < 4; k++) { g.moveTo(6 + k * 8, 30); g.lineTo(9 + k * 8, 30); g.lineTo(15 + k * 8, 10); g.lineTo(12 + k * 8, 10); g.closePath(); } }); }
      else if (id === 'steel') { solid(); cut(() => { for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) hole(g, 9 + i * 11, 9 + j * 11, 2.6); }); }
      else if (id === 'bunker') { solid(); cut(() => { for (const [x, y] of [[8, 8], [32, 8], [8, 32], [32, 32], [20, 20]]) hole(g, x, y, 1.5); }); }
      else if (id === 'gate') { solid(); cut(() => { g.moveTo(10, 36); g.lineTo(10, 18); g.quadraticCurveTo(20, 2, 30, 18); g.lineTo(30, 36); g.closePath(); }); g.lineWidth = 1.6; g.beginPath(); g.moveTo(20, 10); g.lineTo(20, 36); g.moveTo(15, 14); g.lineTo(15, 36); g.moveTo(25, 14); g.lineTo(25, 36); g.stroke(); }
      else if (id === 'fence') { g.lineWidth = 3; g.beginPath(); g.moveTo(5, 2); g.lineTo(5, 38); g.moveTo(35, 2); g.lineTo(35, 38); g.stroke(); g.lineWidth = 1.2; g.beginPath(); for (let k = 0; k < 5; k++) { g.moveTo(5, 6 + k * 7); g.lineTo(35, 6 + k * 7); } g.moveTo(15, 5); g.lineTo(22, 17); g.lineTo(16, 19); g.lineTo(26, 33); g.stroke(); }
      else if (id === 'wire') { g.lineWidth = 1.2; for (let rw = 0; rw < 3; rw++) { g.beginPath(); for (let x = 2; x <= 38; x += 1) g.lineTo(x, 9 + rw * 11 + Math.sin(x * 0.9 + rw) * 5 * Math.cos(x * 0.31)); g.stroke(); } }
      else if (id === 'spikes') { g.beginPath(); for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) { const x = 8 + i * 8, y = 11 + j * 8; g.moveTo(x - 2.6, y + 3); g.lineTo(x, y - 4); g.lineTo(x + 2.6, y + 3); } g.fill(); }
      else if (id === 'mine') { g.beginPath(); g.arc(20, 20, 10, 0, TAU); g.fill(); cut(() => hole(g, 20, 20, 3)); }
      else if (id === 'lamp') { g.beginPath(); for (let k = 0; k < 16; k++) { const a = k / 16 * TAU, d = k % 2 ? 9 : 16; g.lineTo(20 + Math.cos(a) * d, 20 + Math.sin(a) * d); } g.fill(); cut(() => hole(g, 20, 20, 5.5)); }
      else if (id === 'lure') { g.fillRect(5, 9, 30, 22); cut(() => { hole(g, 15, 20, 6); g.rect(25, 13, 6, 2); g.rect(25, 18, 6, 2); g.rect(25, 23, 6, 2); }); g.lineWidth = 1.5; g.beginPath(); g.moveTo(31, 9); g.lineTo(37, 1); g.stroke(); }
      else if (id === 'medic') { solid(); cut(() => { g.rect(16.5, 8, 7, 24); g.rect(8, 16.5, 24, 7); }); }
      else if (id === 'trail') { g.globalAlpha = 0.55; g.beginPath(); for (let k = 0; k < 5; k++) g.ellipse(8 + hash(5, k) * 24, 8 + k * 6, 9, 2.6, hash(7, k), 0, TAU); g.fill(); }
      else if (id === 'ward') { g.lineWidth = 3.4; g.beginPath(); g.moveTo(20, 4); g.lineTo(20, 37); g.stroke(); g.beginPath(); for (const y of [9, 19, 29]) { g.moveTo(25.5, y); g.arc(20, y, 5.5, 0, TAU); } g.fill(); cut(() => { for (const y of [9, 19, 29]) { hole(g, 18, y - 0.5, 1.3); hole(g, 22, y - 0.5, 1.3); } }); }
      else { solid(); cut(() => { hole(g, 20, 20, 13); }); g.beginPath(); g.arc(20, 20, 9, 0, TAU); g.fill(); cut(() => { for (let k = 0; k < 6; k++) hole(g, 20 + Math.cos(k * 1.047) * 5.4, 20 + Math.sin(k * 1.047) * 5.4, 1.2); }); }      // turret mount: a pierced wheel
      return cv;
    },
    struct(R_, c, s, alpha, noBase) {
      const def = GD.STRUCTS[s.id], x = s.cx * CELL, y = s.cy * CELL;
      const gunny = def.gun || s.id === 'turret' || s.id === 'cannon' || s.id === 'napalm';
      if (!gunny && !def.wall && !({ wire: 1, spikes: 1, mine: 1, lamp: 1, medic: 1, trail: 1 })[s.id]) return false;
      c.globalAlpha = (alpha === undefined ? 1 : alpha) * (s.hitT > 0 ? 0.6 : 1);
      if (!noBase) c.drawImage(R_.sprite(s.id), x, y, CELL, CELL);
      if (alpha === undefined && s.maxhp && s.hp < s.maxhp * 0.8 && (def.wall || gunny)) {       // damage: the card tears, and light comes through the rips
        const k = 1 - s.hp / s.maxhp; c.fillStyle = '#f2b860'; c.globalAlpha = 0.9;
        for (let i = 0, n = Math.ceil(k * 5); i < n; i++) { const px = x + 5 + hash(s.uid, i) * 30, py = y + 4 + hash(s.uid, i + 9) * 22; c.beginPath(); c.moveTo(px, py); c.lineTo(px + 3 + k * 5, py + 5 + hash(s.uid, i + 4) * 8); c.lineTo(px - 2, py + 9 + k * 8); c.lineTo(px - 3 - k * 3, py + 4); c.fill(); }
      }
      c.globalAlpha = alpha === undefined ? 1 : alpha;
      if (gunny) { const G = (R.int && R.int.GUNLOOK && R.int.GUNLOOK[s.gun || def.gun]) || { len: s.id === 'cannon' ? 22 : 18, w: s.id === 'cannon' ? 10 : 6 }, kick = s.flash > 0 ? -2.5 : 0; c.save(); c.translate(s.x, s.y); c.rotate(s.ang || 0); c.strokeStyle = K; c.lineCap = 'butt'; c.lineWidth = Math.max(4.5, G.w * 0.85); c.beginPath(); c.moveTo(2 + kick, 0); c.lineTo(G.len + 5 + kick, 0); c.stroke(); c.restore(); }
      if (alpha === undefined && R_.showOwners) { c.fillStyle = R_.ownerColor(s.owner); c.fillRect(x + 2, y + 2, 5, 5); }
      c.globalAlpha = 1;
      return true;
    },
    // above the cloth: each survivor carries one chip of coloured gel (the only colour on the screen), and shots are slits of light
    over(R_, c, sim) {
      for (const p of sim.players) { if (p.away) continue; c.globalAlpha = 0.9; c.fillStyle = p.color; c.beginPath(); c.arc(p.x - Math.cos(p.aim) * 1.5, p.y - Math.sin(p.aim) * 1.5, 3.9, 0, TAU); c.fill(); }
      c.globalAlpha = 1; c.globalCompositeOperation = 'lighter';
      c.lineCap = 'round'; c.strokeStyle = 'rgba(255,244,200,0.95)'; c.lineWidth = 2; c.beginPath();
      for (const b of sim.bullets) { if (b.kind !== 'bullet' || b.wid === 'saw') continue; const sp = Math.hypot(b.vx, b.vy) || 1, tl = b.wid === 'sniper' || b.wid === 'rail' ? 80 : 30; c.moveTo(b.x, b.y); c.lineTo(b.x - b.vx / sp * tl, b.y - b.vy / sp * tl); }
      c.stroke(); c.globalCompositeOperation = 'source-over';
    },
    // the lamp itself, and fire as sparks of raw light
    hot(R_, c, fireS) {
      c.globalCompositeOperation = 'lighter';
      for (const p of R_.parts) {
        const t = Math.max(0, Math.min(1, p.life / p.max));
        if (p.k === 'fire') { c.globalAlpha = 0.35 * t; c.fillStyle = '#ffe6a0'; c.beginPath(); c.arc(p.x, p.y, p.size * (0.4 + t * 0.5), 0, TAU); c.fill(); }
        else if (p.k === 'spark' || p.k === 'ember') { c.globalAlpha = t; c.fillStyle = '#fff3c8'; c.beginPath(); c.arc(p.x, p.y, p.size * 0.8, 0, TAU); c.fill(); }
      }
      c.globalAlpha = 1;
      if (fireS > 0) {
        const fl = 1 + 0.06 * Math.sin(R_.time * 14) + 0.04 * Math.sin(R_.time * 8.3);
        R_.glow(c, FIRE.x, FIRE.y, 90 * fireS * fl, 0.9, '255,240,190'); R_.glow(c, FIRE.x, FIRE.y, 34 * fireS * fl, 1, '255,255,240');
        c.globalCompositeOperation = 'source-over'; c.fillStyle = K;                         // the lamp stand: a small brazier cut-out
        c.beginPath(); c.moveTo(FIRE.x - 15, FIRE.y + 11); c.lineTo(FIRE.x + 15, FIRE.y + 11); c.lineTo(FIRE.x + 9, FIRE.y + 20); c.lineTo(FIRE.x - 9, FIRE.y + 20); c.fill();
        c.fillRect(FIRE.x - 2, FIRE.y + 20, 4, 9); c.fillRect(FIRE.x - 10, FIRE.y + 28, 20, 3);
      }
      c.globalCompositeOperation = 'lighter';
    },
  };
  R.LOOKS = R.LOOKS || {};
  R.LOOKS.puppet = look;
})(window);
