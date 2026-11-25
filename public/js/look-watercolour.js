// Last Ember - graphics style "Bleeding watercolour". Rough cream paper; everything is a wet wash of pigment with a
// wandering pencil line on top. Pigment pools darker at the edge of each shape and bleeds out behind whatever moves.
// There is no black night here: darkness is a white fog that leaves blank paper where you cannot see.
// The world layer is blended onto the paper with "multiply", so colour soaks in the way a wash does.
(function (root) {
  'use strict';
  const R = root.Renderer;
  if (!R) return;
  const GD = root.GD, { CELL, W, H } = GD, FIRE = root.SIM.FIRE, TAU = Math.PI * 2;
  const PENCIL = 'rgba(44,38,34,0.72)', PAPER = '#ebe3cf';
  const hash = (a, b) => { let n = (a * 374761393 + b * 668265263) | 0; n = (n ^ (n >>> 13)) * 1274126177 | 0; return ((n ^ (n >>> 16)) >>> 0) / 4294967296; };
  const mk = (w, h) => { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; };
  const shape = (t) => (R.SHAPES && (R.SHAPES[t] || R.SHAPES.walker)) || { w: 0.95, l: 0.7, h: 0.5, arm: 1.35 };
  // each kind of dead is its own pigment: the classic body colour, greyed toward a bruise
  const PIG = {};
  function pigment(type) {
    if (PIG[type]) return PIG[type];
    const hex = ((R.int && R.int.ZLOOK && (R.int.ZLOOK[type] || R.int.ZLOOK.walker)) || {}).body || '#5d7a4a', n = parseInt(hex.slice(1), 16);
    const mix = (v, t) => Math.round(v * 0.62 + t * 0.38);
    return (PIG[type] = mix(n >> 16, 78) + ',' + mix((n >> 8) & 255, 70) + ',' + mix(n & 255, 96));
  }
  // a wash: the shape filled thin, filled again a little larger (the bleed), and a darker rim where the pigment settled
  function wash(c, path, rgb, a) {
    c.fillStyle = `rgba(${rgb},${a})`; path(1); c.fill();
    c.fillStyle = `rgba(${rgb},${a * 0.45})`; path(1.22); c.fill();
    c.strokeStyle = `rgba(${rgb},${Math.min(1, a * 1.5)})`; c.lineWidth = 1.5; path(1); c.stroke();
  }
  // the pencil: every line drawn twice, neither quite on top of the other
  function pencil(c, path, seed, lw) {
    c.strokeStyle = PENCIL; c.lineWidth = lw || 0.9; c.lineCap = 'round';
    for (let k = 0; k < 2; k++) { c.save(); c.translate((hash(seed, k) - 0.5) * 1.8, (hash(seed, k + 5) - 0.5) * 1.8); path(1); c.stroke(); c.restore(); }
  }
  const look = {
    fxInk: '44,38,34', fxOver: true, fxDash: [4, 5],
    // what flies: fat wet drops with a tail
    fleck(R_, c, p, bile) { const a = Math.atan2(p.vy, p.vx), s = 1.6 + p.size * 1.3, rgb = bile ? '118,124,46' : '179,18,26'; c.fillStyle = `rgba(${rgb},0.75)`; c.beginPath(); c.arc(p.x, p.y, s, 0, TAU); c.fill(); c.strokeStyle = `rgba(${rgb},0.4)`; c.lineWidth = s; c.lineCap = 'round'; c.beginPath(); c.moveTo(p.x, p.y); c.lineTo(p.x - Math.cos(a) * s * 4, p.y - Math.sin(a) * s * 4); c.stroke(); },
    // the dead: a grey stain where the figure dissolved, its pencil drawing still showing, red seeping out of it
    body(R_, d, e, r, torn) {
      const rgb = pigment(e.ztype || 'walker');
      const b = (k) => { d.beginPath(); d.ellipse(0, 0, r * 1.15 * k, r * 0.75 * k, 0, 0, TAU); }, h = (k) => { d.beginPath(); d.arc(r * (torn ? 2.0 : 1.3), torn ? r * 0.7 : 0, r * 0.48 * k, 0, TAU); };
      wash(d, b, rgb, 0.3); wash(d, h, rgb, 0.34);
      for (let k = 0; k < 4; k++) { d.fillStyle = `rgba(${rgb},0.1)`; d.beginPath(); d.arc((Math.random() - 0.5) * r * 3, (Math.random() - 0.5) * r * 2.4, r * (0.5 + Math.random() * 0.7), 0, TAU); d.fill(); }     // it has run into the paper
      pencil(d, b, e.x | 0); pencil(d, h, e.y | 0);
      d.strokeStyle = PENCIL; d.lineWidth = 0.8; d.beginPath(); d.moveTo(0, -r * 0.6); d.lineTo(r * 1.4, -r * 1.3); d.moveTo(0, r * 0.6); d.lineTo(r * 1.3, r * 1.4); d.stroke();
      d.fillStyle = 'rgba(179,18,26,0.32)'; d.beginPath(); d.arc(-r * 0.2, r * 0.1, r * 0.55, 0, TAU); d.fill();
    },
    // blood: wet red dropped on wet paper. It blooms, pools darker at its edge, and then it runs down the page.
    splat(R_, d, x, y, r, bile, alpha, ang) {
      const rnd = (a, b) => a + Math.random() * (b - a), rgb = bile ? '118,124,46' : '179,18,26';
      for (let k = 0; k < 3; k++) {
        const bx = x + rnd(-r, r) * 0.35, by = y + rnd(-r, r) * 0.35, br = r * rnd(0.7, 1.3) * (k ? 1 : 1.5), q = d.createRadialGradient(bx, by, br * 0.2, bx, by, br);
        q.addColorStop(0, `rgba(${rgb},${0.3 * alpha})`); q.addColorStop(0.78, `rgba(${rgb},${0.5 * alpha})`); q.addColorStop(0.92, `rgba(${rgb},${0.75 * alpha})`); q.addColorStop(1, `rgba(${rgb},0)`);
        d.globalAlpha = 1; d.fillStyle = q; d.beginPath(); d.arc(bx, by, br, 0, TAU); d.fill();
      }
      for (let k = 0, n = 2 + (r / 4 | 0); k < n; k++) { d.globalAlpha = alpha * rnd(0.3, 0.6); d.fillStyle = `rgb(${rgb})`; d.beginPath(); d.arc(x + rnd(-r, r) * 1.8, y + rnd(-r, r) * 1.8, rnd(0.8, 2.4), 0, TAU); d.fill(); }
      if (r > 9) {                                               // a back-run: the wet edge pushes pigment out into a pale, frilled ring
        d.strokeStyle = 'rgba(240,232,214,0.6)'; d.lineWidth = 1.6; d.globalAlpha = 1; d.beginPath(); for (let i = 0; i <= 26; i++) { const q = i / 26 * TAU, k = r * 1.35 * (1 + 0.12 * Math.sin(i * 2.7) + rnd(-0.05, 0.05)); i ? d.lineTo(x + Math.cos(q) * k, y + Math.sin(q) * k) : d.moveTo(x + Math.cos(q) * k, y + Math.sin(q) * k); } d.stroke();
        d.strokeStyle = `rgba(${rgb},0.5)`; d.lineWidth = 0.8; d.beginPath(); for (let i = 0; i <= 26; i++) { const q = i / 26 * TAU, k = r * 1.5 * (1 + 0.12 * Math.sin(i * 2.7 + 1) + rnd(-0.05, 0.05)); i ? d.lineTo(x + Math.cos(q) * k, y + Math.sin(q) * k) : d.moveTo(x + Math.cos(q) * k, y + Math.sin(q) * k); } d.stroke();
      }
      if (r > 6 && R_.gore === 2) { const L = (R_.drips || (R_.drips = [])); for (let k = 0, n = r > 14 ? 3 : 1; k < n && L.length < 60; k++) L.push({ x: x + rnd(-r, r) * 0.6, y: y + r * 0.6, left: r * rnd(1.5, 5), w: rnd(1.2, 2.6), rgb, v: rnd(26, 60) }); }
    },
    // the runs: each drip creeps down the page, slowing as it thins, and ends in a bead
    tick(R_, dt) {
      const L = R_.drips; if (!L || !L.length) return;
      const d = R_.dctx; d.lineCap = 'round';
      for (const p of L) {
        const step = Math.min(p.left, p.v * dt); p.left -= step; p.v = Math.max(8, p.v * (1 - dt * 0.5));
        d.globalAlpha = 0.42; d.strokeStyle = `rgb(${p.rgb})`; d.lineWidth = p.w;
        d.beginPath(); d.moveTo(p.x, p.y); p.x += (Math.random() - 0.5) * 0.5; p.y += step; d.lineTo(p.x, p.y); d.stroke();
        if (p.left <= 0) { d.globalAlpha = 0.6; d.fillStyle = `rgb(${p.rgb})`; d.beginPath(); d.arc(p.x, p.y, p.w * 1.1, 0, TAU); d.fill(); }
      }
      d.globalAlpha = 1; R_.drips = L.filter((p) => p.left > 0);
    },
    dark: '222,221,212', paleNight: true, eye: 'rgba(30,24,22,0.9)', hudPlate: true, blend: 'multiply', filter: 'saturate(0.75)',
    hudFont: 'Georgia, Palatino, "Book Antiqua", serif', titleFont: 'italic 400 PXpx Georgia, Palatino, serif', corpse: '#8d948c',
    blood: ['#b3121a', '#c41822', '#9e0f16', '#d0202a', '#a81018', '#bb161e'], bile: ['#7d8232', '#6c7228', '#8a8c3a', '#74782e'],
    ground(R_, g) {
      const rnd = (a, b) => a + Math.random() * (b - a);
      g.fillStyle = PAPER; g.fillRect(0, 0, W, H);
      g.globalCompositeOperation = 'multiply';
      const blot = (x, y, r, rgb, a) => { const q = g.createRadialGradient(x, y, r * 0.25, x, y, r); q.addColorStop(0, `rgba(${rgb},${a * 0.7})`); q.addColorStop(0.82, `rgba(${rgb},${a})`); q.addColorStop(1, `rgba(${rgb},0)`); g.fillStyle = q; g.beginPath(); g.arc(x, y, r, 0, TAU); g.fill(); };
      for (let i = 0; i < 190; i++) blot(rnd(0, W), rnd(0, H), rnd(60, 170), ['96,138,92', '120,150,96', '84,126,118', '132,144,92', '100,120,140'][(Math.random() * 5) | 0], rnd(0.1, 0.2));     // the field
      for (let i = 0; i < 9; i++) blot(FIRE.x + rnd(-80, 80), FIRE.y + rnd(-70, 70), rnd(60, 110), '176,140,96', 0.1);                                               // trodden earth
      for (let i = 0; i < 60; i++) { const e = Math.random() < 0.5, x = e ? rnd(0, W) : (Math.random() < 0.5 ? rnd(-20, 50) : rnd(W - 50, W + 20)), y = e ? (Math.random() < 0.5 ? rnd(-20, 50) : rnd(H - 50, H + 20)) : rnd(0, H); blot(x, y, rnd(50, 110), '52,84,70', 0.2); }   // the wood
      g.globalCompositeOperation = 'source-over';
      g.strokeStyle = 'rgba(44,38,34,0.34)'; g.lineWidth = 0.8; g.lineCap = 'round';
      for (let i = 0; i < 2200; i++) { const x = rnd(0, W), y = rnd(0, H); if (Math.hypot(x - FIRE.x, y - FIRE.y) < 170) continue; g.beginPath(); for (let k = -1; k <= 1; k++) { g.moveTo(x, y); g.lineTo(x + k * 3.5 + rnd(-1, 1), y - rnd(5, 10)); } g.stroke(); }     // grass in pencil
      for (let i = 0; i < 70; i++) { const x = rnd(0, W), y = rnd(0, H), r = rnd(3, 8); g.fillStyle = 'rgba(120,118,112,0.3)'; g.beginPath(); g.ellipse(x, y, r, r * 0.7, rnd(0, 3), 0, TAU); g.fill(); g.strokeStyle = 'rgba(44,38,34,0.5)'; g.stroke(); }
      for (let i = 0; i < 26000; i++) { g.fillStyle = Math.random() < 0.5 ? `rgba(110,96,70,${rnd(0.02, 0.09)})` : `rgba(255,255,255,${rnd(0.03, 0.12)})`; g.fillRect(rnd(0, W), rnd(0, H), 1.4, 1.4); }      // tooth of the paper
      const v = g.createRadialGradient(W / 2, H / 2, H * 0.5, W / 2, H / 2, W * 0.6); v.addColorStop(0, 'rgba(235,227,207,0)'); v.addColorStop(1, 'rgba(235,227,207,0.75)');      // the painting stops short of the edge
      g.fillStyle = v; g.fillRect(0, 0, W, H);
    },
    zombie(R_, c, z) {
      const za = z.vis === undefined ? 1 : z.vis;
      if (z.burrowed) { R_.drawBurrow(c, z); return; }
      const S = shape(z.type), r = z.r, air = z.air || 0, rgb = z.hitT > 0 ? '190,24,30' : z.burn > 0 ? '70,44,34' : pigment(z.type);
      c.save(); c.globalAlpha = za; c.translate(z.x, z.y - air * 16);
      const sc = 1 + air * 0.35; c.scale(sc, sc);
      if (z.champ) { c.strokeStyle = 'rgba(196,150,40,0.6)'; c.lineWidth = 4; c.beginPath(); c.arc(0, 0, r * 1.35, 0, TAU); c.stroke(); }
      if (z.rage > 0) { c.fillStyle = 'rgba(190,24,30,0.2)'; c.beginPath(); c.arc(0, 0, r * 1.6, 0, TAU); c.fill(); }
      if (z.chill > 0) { c.fillStyle = 'rgba(110,170,210,0.28)'; c.beginPath(); c.arc(0, 0, r * 1.3, 0, TAU); c.fill(); }
      if (z.raised) { c.fillStyle = 'rgba(130,90,170,0.2)'; c.beginPath(); c.arc(0, 0, r * 1.45, 0, TAU); c.fill(); }
      c.rotate(z.ang || 0);
      const wob = Math.sin(z.wob || 0), lunge = Math.max(0, z.lunge || 0), L = S.seg ? (S.head ? 1.15 : 0.95) : S.l, Wd = S.seg ? 0.85 : S.w;
      // the bleed: wet pigment dragged out behind it as it moves
      for (let k = 0; k < 3; k++) { c.fillStyle = `rgba(${rgb},${0.1 - k * 0.025})`; c.beginPath(); c.ellipse(-r * (L + 0.5 + k * 0.7), (hash(z.id, k) - 0.5) * r * 0.5, r * (0.9 - k * 0.15), r * Wd * (0.8 - k * 0.14), 0, 0, TAU); c.fill(); }
      const torso = (k) => { c.beginPath(); c.ellipse(0, 0, r * L * k, r * Wd * k, 0, 0, TAU); };
      const hx = r * (L * 0.72 + (S.mark === 'crawl' ? 0.2 : 0)), hy = wob * r * 0.1, hr = r * (S.h || 0.5);
      const headP = (k) => { c.beginPath(); c.arc(hx, hy, hr * k, 0, TAU); };
      const reach = (sd) => r * ((S.arm || 0) + sd * wob * 0.22 + lunge * 0.5);
      const armsP = () => { c.beginPath(); for (const sd of [-1, 1]) { c.moveTo(0, sd * r * Wd * 0.85); c.lineTo(reach(sd) * 0.55, sd * r * (Wd * 0.9 + 0.12)); c.lineTo(reach(sd), sd * r * (S.mark === 'crawl' ? 0.9 : 0.42)); } };
      if (S.arm) { c.lineCap = 'round'; c.strokeStyle = `rgba(${rgb},0.42)`; c.lineWidth = r * (S.armW || 0.32) * 1.3; armsP(); c.stroke(); }
      if (S.mark === 'wings') { c.fillStyle = 'rgba(150,170,190,0.3)'; const f = Math.sin(R_.time * 50 + z.id) * 0.4; for (const sd of [-1, 1]) { c.save(); c.rotate(sd * (0.9 + f)); c.beginPath(); c.ellipse(-r * 0.2, sd * r, r * 1.2, r * 0.45, 0, 0, TAU); c.fill(); c.restore(); } }
      wash(c, torso, rgb, 0.4);
      if (!S.seg) wash(c, headP, rgb, 0.5);
      if (z.hp < z.maxhp * 0.6) { c.fillStyle = 'rgba(179,18,26,0.4)'; c.beginPath(); c.arc(-r * 0.1, r * 0.2, r * 0.36, 0, TAU); c.fill(); }           // a wound, bleeding into the wash
      // the pencil drawing underneath
      pencil(c, torso, z.id);
      if (S.arm) { pencil(c, armsP, z.id + 2); c.lineWidth = 0.8; c.beginPath(); for (const sd of [-1, 1]) for (let f = -1; f <= 1; f++) { const y1 = sd * r * (S.mark === 'crawl' ? 0.9 : 0.42); c.moveTo(reach(sd), y1); c.lineTo(reach(sd) + r * 0.32, y1 + f * r * 0.2); } c.stroke(); }
      if (S.seg) { c.strokeStyle = PENCIL; c.lineWidth = 0.8; c.beginPath(); for (const k of [-0.4, 0, 0.4]) { c.moveTo(k * r, -r * 0.6); c.quadraticCurveTo(k * r + r * 0.2, 0, k * r, r * 0.6); } for (const sd of [-1, 1]) for (const k of [-0.4, 0.3]) { c.moveTo(k * r, sd * r * 0.7); c.lineTo(k * r - 3, sd * r * 1.3); } c.stroke(); }
      else {
        pencil(c, headP, z.id + 4);
        if (S.mark === 'horns' || S.mark === 'spikes') { c.strokeStyle = PENCIL; c.lineWidth = 1; c.beginPath(); const n = S.mark === 'horns' ? 2 : 7; for (let k = 0; k < n; k++) { const a = S.mark === 'horns' ? (k ? 0.5 : -0.5) : Math.PI * 0.5 + k / (n - 1) * Math.PI; c.moveTo(Math.cos(a - 0.16) * r * 0.85, Math.sin(a - 0.16) * r * 0.85); c.lineTo(Math.cos(a) * r * 1.6, Math.sin(a) * r * 1.6); c.lineTo(Math.cos(a + 0.16) * r * 0.85, Math.sin(a + 0.16) * r * 0.85); } c.stroke(); }
        if (S.mark === 'plates') { c.strokeStyle = PENCIL; c.lineWidth = 1; for (const y of [-0.45, 0.45]) c.strokeRect(-r * 0.1, y * r - r * 0.22, r * 0.44, r * 0.44); }
        c.fillStyle = 'rgba(30,24,22,0.9)'; const er = Math.max(1.1, hr * 0.2);                // eyes: two ink dots, the darkest marks on the page
        c.beginPath(); c.arc(hx + hr * 0.4, hy - hr * 0.38, er, 0, TAU); c.arc(hx + hr * 0.4, hy + hr * 0.38, er, 0, TAU); c.fill();
        c.strokeStyle = PENCIL; c.lineWidth = 0.8; c.beginPath(); c.moveTo(hx + hr * 0.8, hy - hr * 0.25); c.lineTo(hx + hr * 0.82, hy + hr * 0.25); c.stroke();
      }
      c.restore(); c.globalAlpha = 1;
    },
    // survivors are the clean colours: each one a clear wash of their own colour
    player(R_, c, p) {
      const n = parseInt((p.color || '#ff5a4f').slice(1), 16), rgb = (n >> 16) + ',' + ((n >> 8) & 255) + ',' + (n & 255);
      c.save(); c.translate(p.x, p.y);
      if (p.down) { c.rotate(1.2 + p.x); c.fillStyle = 'rgba(179,18,26,0.3)'; c.beginPath(); c.ellipse(0, 0, 24, 17, 0, 0, TAU); c.fill(); const b = (k) => { c.beginPath(); c.ellipse(0, 0, 15 * k, 9 * k, 0, 0, TAU); }; wash(c, b, rgb, 0.35); pencil(c, b, 3); c.restore(); return; }
      c.rotate(p.aim);
      const sw = p.moving ? Math.sin(p.walk) * 6 : 0, kick = p.flash > 0 ? -2.5 : 0;
      const G = (R.int && R.int.GUNLOOK && (R.int.GUNLOOK[p.cur] || R.int.GUNLOOK.pistol)) || { len: 16, w: 5 };
      c.fillStyle = 'rgba(60,52,46,0.55)'; c.beginPath(); c.ellipse(sw, -6.5, 6, 3.4, 0, 0, TAU); c.ellipse(-sw, 6.5, 6, 3.4, 0, 0, TAU); c.fill();
      c.fillStyle = 'rgba(50,48,52,0.7)'; c.fillRect(8 + kick, 2.4, G.len + 2, Math.max(3, G.w * 0.7));
      const body = (k) => { c.beginPath(); c.ellipse(0, 0, 9.5 * k, 13 * k, 0, 0, TAU); }, hd = (k) => { c.beginPath(); c.arc(2.5, 0, 6.6 * k, 0, TAU); };
      const armP = () => { c.beginPath(); c.moveTo(1, 10); c.lineTo(13 + kick, 5); c.moveTo(2, -10); c.lineTo(Math.min(20, 9 + G.len * 0.6) + kick, 2.5); };
      c.strokeStyle = `rgba(${rgb},0.6)`; c.lineWidth = 5.5; c.lineCap = 'round'; armP(); c.stroke();
      wash(c, body, p.hurtT > 0.2 ? '190,24,30' : rgb, 0.62); wash(c, hd, '214,170,130', 0.6);
      pencil(c, body, 11, 1); pencil(c, hd, 13, 1); pencil(c, armP, 15, 0.9); pencil(c, () => { c.beginPath(); c.rect(8 + kick, 2.4, G.len + 2, Math.max(3, G.w * 0.7)); }, 17, 0.9);
      c.restore();
    },
    sprite(R_, id) {
      const def = GD.STRUCTS[id]; if (!def) return null;
      const turret = GD.TURRET_IDS.indexOf(id) >= 0;
      const known = { wood: 1, steel: 1, bunker: 1, gate: 1, fence: 1, wire: 1, spikes: 1, mine: 1, lamp: 1, lure: 1, medic: 1, trail: 1, ward: 1 };
      if (!known[id] && !(turret && (def.gun || id === 'turret' || id === 'cannon' || id === 'napalm' || id === 'tesla'))) return null;
      const S = 3, cv = mk(CELL * S, CELL * S), g = cv.getContext('2d'), sd = id.length * 13 + id.charCodeAt(0);
      g.scale(S, S); g.lineCap = 'round';
      const slab = (rgb, a) => { const p = (k) => { const m = 20 - 18.5 * k; g.beginPath(); g.moveTo(m + hash(sd, 1) * 2, m); g.lineTo(40 - m, m + hash(sd, 2) * 2); g.lineTo(40 - m - hash(sd, 3) * 2, 40 - m); g.lineTo(m, 40 - m - hash(sd, 4) * 2); g.closePath(); }; g.fillStyle = `rgba(${rgb},${a})`; p(1); g.fill(); g.fillStyle = `rgba(${rgb},${a * 0.5})`; p(0.82); g.fill(); g.strokeStyle = `rgba(${rgb},${Math.min(1, a * 1.6)})`; g.lineWidth = 1.4; p(1); g.stroke(); };
      const line = (x0, y0, x1, y1, k) => { g.strokeStyle = PENCIL; g.lineWidth = 0.8; for (let j = 0; j < 2; j++) { g.beginPath(); g.moveTo(x0 + (hash(sd, k + j) - 0.5) * 1.6, y0 + (hash(sd, k + j + 1) - 0.5) * 1.6); g.quadraticCurveTo((x0 + x1) / 2 + (hash(sd, k + j + 2) - 0.5) * 3, (y0 + y1) / 2 + (hash(sd, k + j + 3) - 0.5) * 3, x1 + (hash(sd, k + j + 4) - 0.5) * 1.6, y1 + (hash(sd, k + j + 5) - 0.5) * 1.6); g.stroke(); } };
      const frame = () => { line(2, 2, 38, 2, 10); line(38, 2, 38, 38, 20); line(38, 38, 2, 38, 30); line(2, 38, 2, 2, 40); };
      if (id === 'wood') { slab('150,104,62', 0.55); frame(); for (let k = 1; k < 4; k++) line(3, 2 + k * 9, 37, 2 + k * 9, 50 + k * 9); line(6, 34, 34, 6, 90); }
      else if (id === 'steel') { slab('92,108,130', 0.55); frame(); for (let k = 1; k < 5; k++) line(2 + k * 7.5, 3, 2 + k * 7.5, 37, 50 + k * 9); g.fillStyle = PENCIL; for (const [x, y] of [[6, 6], [34, 6], [6, 34], [34, 34]]) { g.beginPath(); g.arc(x, y, 1.1, 0, TAU); g.fill(); } }
      else if (id === 'bunker') { slab('128,122,112', 0.7); frame(); line(4, 4, 36, 4, 60); line(4, 36, 36, 36, 70); line(22, 3, 25, 13, 80); line(25, 13, 20, 22, 90); g.fillStyle = 'rgba(44,38,34,0.5)'; for (let k = 0; k < 30; k++) g.fillRect(4 + hash(sd, k) * 32, 4 + hash(sd, k + 40) * 32, 0.9, 0.9); }
      else if (id === 'gate') { slab('96,138,96', 0.55); frame(); for (let k = 0; k < 3; k++) { line(11, 13 + k * 8.5, 20, 8 + k * 8.5, 50 + k * 14); line(20, 8 + k * 8.5, 29, 13 + k * 8.5, 57 + k * 14); } }
      else if (id === 'fence') { line(5, 3, 5, 37, 1); line(35, 3, 35, 37, 9); for (let k = 0; k < 4; k++) line(5, 8 + k * 8, 35, 8 + k * 8, 20 + k * 9); g.fillStyle = 'rgba(236,200,60,0.5)'; g.beginPath(); g.arc(20, 20, 9, 0, TAU); g.fill(); }
      else if (id === 'wire') { g.strokeStyle = PENCIL; g.lineWidth = 0.7; for (let rw = 0; rw < 3; rw++) { g.beginPath(); for (let x = 2; x <= 38; x += 1) g.lineTo(x, 9 + rw * 11 + Math.sin(x * 0.9 + rw) * 5 * Math.cos(x * 0.31)); g.stroke(); } g.fillStyle = 'rgba(92,108,130,0.25)'; g.fillRect(2, 4, 36, 32); }
      else if (id === 'spikes') { slab('110,112,116', 0.4); g.fillStyle = PENCIL; for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) { const x = 9.5 + i * 7, y = 10.5 + j * 7; g.beginPath(); g.moveTo(x - 1.8, y + 2); g.lineTo(x, y - 3); g.lineTo(x + 1.8, y + 2); g.fill(); } }
      else if (id === 'mine') { g.fillStyle = 'rgba(86,96,70,0.6)'; g.beginPath(); g.arc(20, 20, 10, 0, TAU); g.fill(); g.strokeStyle = PENCIL; g.lineWidth = 0.9; g.stroke(); line(14, 14, 26, 26, 3); line(26, 14, 14, 26, 11); }
      else if (id === 'lamp') { g.fillStyle = 'rgba(244,214,90,0.5)'; g.beginPath(); g.arc(20, 20, 16, 0, TAU); g.fill(); g.fillStyle = 'rgba(244,214,90,0.6)'; g.beginPath(); g.arc(20, 20, 8, 0, TAU); g.fill(); g.strokeStyle = PENCIL; g.lineWidth = 0.9; g.beginPath(); g.arc(20, 20, 8, 0, TAU); g.stroke(); }
      else if (id === 'lure') { slab('110,128,96', 0.5); line(6, 10, 34, 10, 3); line(6, 30, 34, 30, 12); g.strokeStyle = PENCIL; g.beginPath(); g.arc(15, 20, 6, 0, TAU); g.stroke(); line(31, 9, 37, 1, 21); }
      else if (id === 'medic') { slab('226,222,210', 0.5); frame(); g.fillStyle = 'rgba(179,18,26,0.7)'; g.fillRect(16.5, 9, 7, 22); g.fillRect(9, 16.5, 22, 7); }
      else if (id === 'trail') { g.fillStyle = 'rgba(179,18,26,0.34)'; for (let k = 0; k < 5; k++) { g.beginPath(); g.ellipse(8 + hash(sd, k) * 24, 8 + k * 6, 9, 3.4, hash(sd, k + 9), 0, TAU); g.fill(); } }
      else if (id === 'ward') { line(20, 5, 20, 37, 1); g.fillStyle = 'rgba(232,224,204,0.9)'; for (const y of [9, 19, 29]) { g.beginPath(); g.arc(20, y, 5, 0, TAU); g.fill(); g.strokeStyle = PENCIL; g.lineWidth = 0.8; g.stroke(); } }
      else { slab('96,102,112', 0.4); g.fillStyle = 'rgba(70,76,88,0.5)'; g.beginPath(); g.arc(20, 20, 12, 0, TAU); g.fill(); g.strokeStyle = PENCIL; g.lineWidth = 0.9; g.beginPath(); g.arc(20, 20, 12, 0, TAU); g.stroke(); }
      return cv;
    },
    struct(R_, c, s, alpha, noBase) {
      const def = GD.STRUCTS[s.id], x = s.cx * CELL, y = s.cy * CELL;
      const gunny = def.gun || s.id === 'turret' || s.id === 'cannon' || s.id === 'napalm';
      if (!gunny && !def.wall && !({ wire: 1, spikes: 1, mine: 1, lamp: 1, medic: 1, trail: 1 })[s.id]) return false;
      c.globalAlpha = alpha === undefined ? 1 : alpha;
      if (!noBase) c.drawImage(R_.sprite(s.id), x, y, CELL, CELL);
      if (alpha === undefined && def.wall && s.maxhp && s.hp < s.maxhp * 0.7) {             // damage: water stains spreading through it
        const k = 1 - s.hp / s.maxhp;
        for (let i = 0, n = Math.ceil(k * 4); i < n; i++) { c.fillStyle = `rgba(60,50,46,${0.14 + k * 0.2})`; c.beginPath(); c.arc(x + 8 + hash(s.uid, i) * 24, y + 8 + hash(s.uid, i + 6) * 24, 5 + hash(s.uid, i + 3) * 8, 0, TAU); c.fill(); }
      }
      if (gunny) {
        const G = (R.int && R.int.GUNLOOK && R.int.GUNLOOK[s.gun || def.gun]) || { len: s.id === 'cannon' ? 22 : 18, w: s.id === 'cannon' ? 10 : 6 }, kick = s.flash > 0 ? -2.5 : 0, bw = Math.max(4.5, G.w * 0.85);
        c.save(); c.translate(s.x, s.y); c.rotate(s.ang || 0);
        c.fillStyle = 'rgba(50,52,60,0.7)'; c.fillRect(2 + kick, -bw / 2, G.len + 3, bw);
        pencil(c, () => { c.beginPath(); c.rect(2 + kick, -bw / 2, G.len + 3, bw); }, s.uid, 0.9);
        const hub = (k) => { c.beginPath(); c.arc(0, 0, 7.5 * k, 0, TAU); }; wash(c, hub, '60,66,78', 0.6); pencil(c, hub, s.uid + 3, 0.9);
        c.restore();
        if (alpha === undefined && R_.showOwners && def.gun) { const nm = def.name.replace(' Turret', ''); c.font = 'italic 11px Georgia, serif'; c.textAlign = 'center'; c.fillStyle = '#2c2622'; c.fillText(nm, s.x, s.y + 32); }
      }
      if (alpha === undefined && R_.showOwners) { c.fillStyle = R_.ownerColor(s.owner); c.fillRect(x + 2, y + 2, 5, 5); }
      if (s.hitT > 0 && alpha === undefined) { c.globalAlpha = 0.4; c.fillStyle = '#b3121a'; c.beginPath(); c.arc(s.x, s.y, 20, 0, TAU); c.fill(); }
      c.globalAlpha = 1;
      return true;
    },
    // shadows are a cool violet wash laid down first
    under(R_, c, sim) {
      c.fillStyle = 'rgba(70,64,110,0.2)';
      for (const s of sim.structs) { const d = GD.STRUCTS[s.id]; if (d && d.block && !d.husk) { c.beginPath(); c.ellipse(s.x + 7, s.y + 9, 24, 21, 0, 0, TAU); c.fill(); } }
    },
    over(R_, c, sim) {
      c.lineCap = 'round'; c.strokeStyle = 'rgba(44,38,34,0.7)'; c.lineWidth = 1.2; c.setLineDash([6, 4]); c.beginPath();
      for (const b of sim.bullets) { if (b.kind !== 'bullet' || b.wid === 'saw') continue; const sp = Math.hypot(b.vx, b.vy) || 1, tl = b.wid === 'sniper' || b.wid === 'rail' ? 80 : 36; c.moveTo(b.x, b.y); c.lineTo(b.x - b.vx / sp * tl, b.y - b.vy / sp * tl); }
      c.stroke(); c.setLineDash([]);
    },
    // fire is wet orange dropped onto wet yellow: blooms, not flames
    hot(R_, c, fireS) {
      c.globalCompositeOperation = 'source-over';
      for (const p of R_.parts) {
        const t = Math.max(0, Math.min(1, p.life / p.max));
        if (p.k === 'fire') { c.globalAlpha = 0.3 * t; c.fillStyle = t > 0.5 ? '#f0a020' : '#d8501a'; c.beginPath(); c.arc(p.x, p.y, p.size * (0.6 + (1 - t) * 0.8), 0, TAU); c.fill(); }
        else if (p.k === 'acid') { c.globalAlpha = 0.4 * t; c.fillStyle = '#7d8232'; c.beginPath(); c.arc(p.x, p.y, p.size * 0.8, 0, TAU); c.fill(); }
        else if (p.k === 'spark' || p.k === 'ember') { c.globalAlpha = 0.8 * t; c.fillStyle = '#e06a1a'; c.beginPath(); c.arc(p.x, p.y, p.size * 0.9, 0, TAU); c.fill(); }
      }
      if (fireS > 0) {
        const t = R_.time;
        for (let i = 0; i < 5; i++) {
          const ph = t * (1.6 + i * 0.4) + i * 2, x = FIRE.x + Math.sin(ph) * 5, y = FIRE.y - 4 - i * 3 + Math.cos(ph * 1.3) * 3, rr = (26 - i * 4) * fireS;
          const q = c.createRadialGradient(x, y, rr * 0.2, x, y, rr), col = ['200,50,20', '226,96,24', '240,140,30', '246,186,60', '250,226,120'][i];
          q.addColorStop(0, `rgba(${col},0.55)`); q.addColorStop(0.8, `rgba(${col},0.7)`); q.addColorStop(1, `rgba(${col},0)`);
          c.globalAlpha = 1; c.fillStyle = q; c.beginPath(); c.arc(x, y, rr, 0, TAU); c.fill();
        }
        c.globalAlpha = 1;
        pencil(c, () => { c.beginPath(); c.moveTo(FIRE.x - 11, FIRE.y + 8); c.quadraticCurveTo(FIRE.x - 15, FIRE.y - 8, FIRE.x + Math.sin(t * 3) * 3, FIRE.y - 26 * fireS); c.quadraticCurveTo(FIRE.x + 15, FIRE.y - 6, FIRE.x + 11, FIRE.y + 8); }, Math.floor(t * 5), 0.9);
      }
      c.globalAlpha = 1; c.globalCompositeOperation = 'lighter';
    },
  };
  R.LOOKS = R.LOOKS || {};
  R.LOOKS.watercolour = look;
})(window);
