// Last Ember - canvas renderer: ground, decals, sprites, particles, dynamic lighting, HUD.
(function (root) {
  'use strict';
  const GD = root.GD, { FIRE, PR } = root.SIM;
  const { CELL, GW, GH, W, H } = GD;
  const TAU = Math.PI * 2;
  const rand = (a, b) => a + Math.random() * (b - a);
  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

  function mk(w, h, cpu) {
    const c = document.createElement('canvas'); c.width = w; c.height = h;
    if (cpu) { try { c.getContext('2d', { willReadFrequently: true }); } catch (e) { /* older browsers: plain canvas */ } }
    return c;
  }
  const LIGHT_RES = 1 / 4;          // the light map is soft, so a quarter of the resolution is plenty
  // Pre-rendered soft shapes, stamped instead of building gradients every frame.
  let VOL = null; const ROT = [];
  function fleshSprites() {
    if (VOL) return;
    VOL = mk(64, 64); let g = VOL.getContext('2d');
    let gr = g.createRadialGradient(28, 26, 6, 32, 32, 32);
    gr.addColorStop(0, 'rgba(255,240,220,0.10)'); gr.addColorStop(0.45, 'rgba(0,0,0,0)'); gr.addColorStop(0.8, 'rgba(0,0,0,0.38)'); gr.addColorStop(1, 'rgba(0,0,0,0.72)');
    g.fillStyle = gr; g.beginPath(); g.arc(32, 32, 32, 0, 6.2832); g.fill();
    for (let v = 0; v < 4; v++) {
      const cv = mk(64, 64); g = cv.getContext('2d');
      g.beginPath(); g.arc(32, 32, 31, 0, 6.2832); g.clip();
      const tones = ['rgba(40,52,30,', 'rgba(58,30,44,', 'rgba(20,16,12,', 'rgba(70,16,12,', 'rgba(92,88,60,'];      // bruise green, livid purple, grime, raw, pallor
      for (let i = 0; i < 16; i++) {
        g.fillStyle = tones[(Math.random() * tones.length) | 0] + (0.16 + Math.random() * 0.3) + ')';
        const x = Math.random() * 64, y = Math.random() * 64, r = 3 + Math.random() * 10;
        g.beginPath(); for (let k = 0; k < 7; k++) { const a = k / 7 * 6.2832, rr = r * (0.5 + Math.random() * 0.8); g.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr); } g.fill();
      }
      g.strokeStyle = 'rgba(30,14,34,0.45)'; g.lineWidth = 0.8;                 // dark veins under the skin
      for (let i = 0; i < 5; i++) { let x = Math.random() * 64, y = Math.random() * 64; g.beginPath(); g.moveTo(x, y); for (let k = 0; k < 4; k++) { x += (Math.random() - 0.5) * 16; y += (Math.random() - 0.5) * 16; g.lineTo(x, y); } g.stroke(); }
      g.fillStyle = 'rgba(0,0,0,0.5)'; for (let i = 0; i < 40; i++) g.fillRect(Math.random() * 64, Math.random() * 64, 1, 1);      // pores and dirt
      ROT.push(cv);
    }
  }
  function glowSprite(rgb) {
    const c = mk(128, 128), g = c.getContext('2d'), gr = g.createRadialGradient(64, 64, 0, 64, 64, 64);
    gr.addColorStop(0, `rgba(${rgb},1)`); gr.addColorStop(0.5, `rgba(${rgb},0.6)`); gr.addColorStop(1, `rgba(${rgb},0)`);
    g.fillStyle = gr; g.fillRect(0, 0, 128, 128);
    return c;
  }
  function coneSprite(half) {
    const R = 256, c = mk(R * 2, R * 2), g = c.getContext('2d'), gr = g.createRadialGradient(R, R, 8, R, R, R);
    gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.6, 'rgba(255,255,255,0.55)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = gr; g.beginPath(); g.moveTo(R, R); g.arc(R, R, R, -half, half); g.closePath(); g.fill();
    return c;
  }
  const smooth = (e0, e1, x) => { const t = clamp((x - e0) / (e1 - e0), 0, 1); return t * t * (3 - 2 * t); };
  function shade(hex, f) {
    const n = parseInt(hex.slice(1), 16);
    const ch = (v) => clamp(Math.round(f > 1 ? v + (255 - v) * (f - 1) : v * f), 0, 255);
    return `rgb(${ch(n >> 16)},${ch((n >> 8) & 255)},${ch(n & 255)})`;
  }

  const ACIDY = { bloater: 1, splitter: 1, splitling: 1, broodmother: 1 };   // these bleed green-purple goo
  // Real blood is dark: deep reds and near-black maroons, never bright red. Every stain mixes several of these.
  let BLOOD = ['#4c0707', '#3c0505', '#2f0404', '#560a09', '#250303', '#420806'];
  // ---- graphics styles (Settings, kept per device). 'classic' is the painted look; the others restyle the same game.
  // sound: the music and gun-sound styles that suit the look (applied when "Sound follows the look" is on)
  const STYLES = [
    { id: 'classic', name: 'Classic', blurb: 'The painted look: moonlit grass, warm firelight, full colour.' },
    { id: 'charcoal', name: 'Charcoal and ember', blurb: 'A charcoal drawing. Only fire, muzzle flash and blood have colour.', sound: { music: 'drone', guns: 'real' } },
    { id: 'woodcut', name: 'Woodcut print', blurb: 'Black ink cut with bone-white lines. Light is carved rays; red for blood and eyes.', sound: { music: 'cathedral', guns: 'western' } },
    { id: 'glass', name: 'Stained glass', blurb: 'A cathedral window: leaded panes in jewel colours, the campfire a gold sun. Damage cracks the glass.', sound: { music: 'requiem', guns: 'heavy' } },
    { id: 'watercolour', name: 'Bleeding watercolour', blurb: 'Pale washes and pencil on rough paper. Night is a white fog; blood is the one strong pigment.', sound: { music: 'strings', guns: 'suppressed' } },
    { id: 'puppet', name: 'Shadow puppet theatre', blurb: 'A lamp behind a cloth screen. Everything is a black cut-out; far from the lamp the shadows grow huge and soft.', sound: { music: 'ritual', guns: 'real' } },
    { id: 'kid', name: 'A child drew this', blurb: 'Wax crayon on lined paper, drawn by the youngest survivor. The drawings get darker as the nights go on.', sound: { music: 'musicbox', guns: 'cartoon' } },
    { id: 'stitch', name: 'Cross-stitch sampler', blurb: 'The whole game embroidered on linen, one X of thread at a time. Every kill leaves a loose red thread on the cloth.', sound: { music: 'musicbox', guns: 'cap' } },
  ];
  const lsGet = (k) => { try { return localStorage.getItem(k); } catch (e) { return null; } };
  const lsSet = (k, v) => { try { localStorage.setItem(k, v); } catch (e) { /* private mode */ } };
  // The look is more than the picture: menus (looks.css keys off <html data-look>) and, if wanted, the sound follow it.
  // byUser: the player just picked it (only then is the sound changed; a page load never overrides sound choices).
  function setTheme(id, byUser) {
    const o = STYLES.find((q) => q.id === id) || STYLES[0];
    if (root.document) root.document.documentElement.dataset.look = o.id;
    const AF = root.AudioFX;
    if (!byUser || !AF || lsGet('le_looksound') === '0') return;
    if (o.sound) {
      if (!lsGet('le_snd_own')) lsSet('le_snd_own', JSON.stringify({ music: AF.getMusicStyle(), guns: AF.getGunStyle() }));     // remember the player's own choice
      AF.setMusicStyle(o.sound.music); AF.setGunStyle(o.sound.guns);
    } else {
      let own = null; try { own = JSON.parse(lsGet('le_snd_own') || 'null'); } catch (e) { own = null; }
      if (own) { AF.setMusicStyle(own.music); AF.setGunStyle(own.guns); lsSet('le_snd_own', ''); }
    }
  }
  { const st = lsGet('le_style'); setTheme(STYLES.some((o) => o.id === st) ? st : 'classic', false); }
  const lookOf = (id) => (root.Renderer && root.Renderer.LOOKS && root.Renderer.LOOKS[id]) || null;
  const BLOOD_CLASSIC = BLOOD, BLOOD_INK = ['#9a110c', '#b3160f', '#7d0d0a', '#a8140e', '#8a0f0b', '#c01a12'];   // on a grey page blood is the one loud colour
  // a colour as the grey a charcoal stick would leave ('#rrggbb' or 'rgb(r,g,b)')
  function toGrey(col) {
    let r, g, b;
    if (col[0] === '#') { const n = parseInt(col.slice(1), 16); r = n >> 16; g = (n >> 8) & 255; b = n & 255; }
    else { const m = col.match(/\d+/g); if (!m) return col; r = +m[0]; g = +m[1]; b = +m[2]; }
    const v = Math.round(r * 0.3 + g * 0.59 + b * 0.11);
    return `rgb(${v},${v},${Math.min(255, v + 2)})`;
  }
  let BILE = ['#2b3312', '#343b16', '#20270d', '#3a3a1a'];        // what the bloated ones leak: dark, sickly
  const BILE_CLASSIC = BILE, BILE_INK = ['#141416', '#1c1c1f', '#0e0e10', '#232326'];     // bile is just more charcoal
  const pickOf = (a) => a[(Math.random() * a.length) | 0];
  // whatever colour a caller asks for, gore comes out of the palettes above
  function goreCol(c) {
    if (typeof c !== 'string' || c[0] !== '#' || c.length !== 7) return pickOf(BLOOD);
    const n = parseInt(c.slice(1), 16), r = n >> 16, g = (n >> 8) & 255, b = n & 255;
    if (g > r && g > b) return pickOf(BILE);
    if (r > g * 1.5 && r > b * 1.5) return pickOf(BLOOD);
    return c;
  }
  // an irregular blot: a noisy closed curve, never a circle
  function blot(d, x, y, r, stretch, ang) {
    const n = 9, pts = [];
    for (let i = 0; i < n; i++) { const a = i / n * TAU, rr = r * (0.55 + Math.random() * 0.65); pts.push([Math.cos(a) * rr * (stretch || 1), Math.sin(a) * rr]); }
    d.save(); d.translate(x, y); if (ang !== undefined) d.rotate(ang);
    d.beginPath();
    for (let i = 0; i < n; i++) { const p = pts[i], q = pts[(i + 1) % n], mx = (p[0] + q[0]) / 2, my = (p[1] + q[1]) / 2; if (!i) d.moveTo(mx, my); else d.quadraticCurveTo(p[0], p[1], mx, my); }
    d.quadraticCurveTo(pts[0][0], pts[0][1], (pts[0][0] + pts[1][0]) / 2, (pts[0][1] + pts[1][1]) / 2);
    d.fill(); d.restore();
  }
  // a thrown drop: a teardrop with its tail pointing back the way it came
  function drop(d, x, y, len, wid, ang) {
    d.save(); d.translate(x, y); d.rotate(ang);
    d.beginPath(); d.moveTo(-len, 0); d.quadraticCurveTo(len * 0.2, -wid, len * 0.55, 0); d.quadraticCurveTo(len * 0.2, wid, -len, 0); d.fill();
    d.restore();
  }
  const ZLOOK = {
    walker: { body: '#5d7a4a', shirt: '#3d4a5c', head: '#8fa870', arm: '#7b9560', eye: '#ffe28a' },
    runner: { body: '#8a8468', shirt: '#6b3030', head: '#c2b994', arm: '#aaa27e', eye: '#ff5040' },
    spitter: { body: '#5a4c78', shirt: '#3c5a3a', head: '#9a8cb8', arm: '#7c6e9c', eye: '#9dff5a' },
    brute: { body: '#6e3a30', shirt: '#3a2622', head: '#a06a58', arm: '#8a4c40', eye: '#ffb040' },
    bloater: { body: '#9aa040', shirt: '#6a7030', head: '#b9c064', arm: '#8a9040', eye: '#eaff70' },
    boss: { body: '#3a2a3e', shirt: '#231826', head: '#6a4a6e', arm: '#4c3652', eye: '#ff2a2a' },
    crawler: { body: '#7a6a58', shirt: '#46423a', head: '#a89880', arm: '#8e7c66', eye: '#ffcc55' },
    screamer: { body: '#c8c8d4', shirt: '#7a7a90', head: '#eeeefa', arm: '#b0b0c4', eye: '#ff3a6a' },
    leaper: { body: '#4f8a7c', shirt: '#2c4a44', head: '#7fd0c0', arm: '#5fa090', eye: '#c0ff60' },
    ironhide: { body: '#4c545e', shirt: '#30353c', head: '#7a8592', arm: '#5c6470', eye: '#ffa040' },
    splitter: { body: '#a04a98', shirt: '#6a2a64', head: '#e07ad8', arm: '#b85ab0', eye: '#ffe060' },
    splitling: { body: '#c070b8', shirt: '#8a4a84', head: '#f0a0e8', arm: '#d080c8', eye: '#ffe060' },
    burrower: { body: '#7a5c32', shirt: '#4e3a20', head: '#b8955a', arm: '#8e6c3c', eye: '#ffd040' },
    juggernaut: { body: '#5a2a1a', shirt: '#3a1a10', head: '#8a4a30', arm: '#6a3420', eye: '#ff4a1a' },
    wyrm: { body: '#cdb88a', shirt: '#5e2a1e', head: '#efe2c0', arm: '#8a7250', eye: '#ff6a2a' },
    wyrmseg: { body: '#cdb88a', shirt: '#5e2a1e', head: '#e6d6ae', arm: '#8a7250', eye: '#ff6a2a' },
    gorewyrm: { body: '#8a2a20', shirt: '#3a0806', head: '#c04a36', arm: '#6a1a12', eye: '#ffd040' },
    goreseg: { body: '#8a2a20', shirt: '#4a0a08', head: '#b8402e', arm: '#5a1610', eye: '#ffd040' },
    tarborn: { body: '#1c1c22', shirt: '#0c0c10', head: '#2c2c34', arm: '#24242c', eye: '#ffb030' },
    gorefly: { body: '#8a1c14', shirt: '#4a0c08', head: '#2a1a14', arm: '#3a2a20', eye: '#ffd040' },
    disruptor: { body: '#2c4a5a', shirt: '#18303c', head: '#6aa8c0', arm: '#3a6a80', eye: '#9ff0ff' },
    colossus: { body: '#6a5e50', shirt: '#4a4036', head: '#8a7c6a', arm: '#5e5244', eye: '#ff6a2a' },
    smoker: { body: '#5a5a62', shirt: '#3a3a40', head: '#8a8a94', arm: '#6a6a72', eye: '#ff7a3a' },
    gravecaller: { body: '#2a1e3a', shirt: '#160f22', head: '#d8d0c0', arm: '#3a2c50', eye: '#c08cff' },
    broodmother: { body: '#7a8a34', shirt: '#4e5a20', head: '#a8b85a', arm: '#6a7a2c', eye: '#f0ff80' },
  };
  for (const k of Object.keys(ZLOOK)) {
    for (const part of ['body', 'shirt', 'head', 'arm']) {
      const n = parseInt(ZLOOK[k][part].slice(1), 16), m = [0x62, 0x60, 0x50];                 // dead-flesh grey-olive
      const ch = [n >> 16, (n >> 8) & 255, n & 255].map((v, i) => Math.round((v * 0.5 + m[i] * 0.5) * (part === 'shirt' ? 0.7 : 0.82)));
      ZLOOK[k][part] = '#' + ch.map((v) => v.toString(16).padStart(2, '0')).join('');
    }
  }
  const GUNLOOK = {
    pistol: { len: 12, w: 4, c: '#2b2e35' }, smg: { len: 17, w: 5, c: '#30343c' }, shotgun: { len: 24, w: 5, c: '#5a3d24' },
    rifle: { len: 26, w: 5, c: '#2a3028' }, sniper: { len: 34, w: 4, c: '#22262c' }, flamer: { len: 24, w: 7, c: '#8a3a1c' },
    cryo: { len: 22, w: 7, c: '#3a6a8a' }, saw: { len: 20, w: 10, c: '#5a5040' }, rail: { len: 36, w: 6, c: '#2a3a5a' },
    launcher: { len: 22, w: 8, c: '#3c4a32' }, minigun: { len: 28, w: 9, c: '#3a3d44' }, arc: { len: 24, w: 7, c: '#2c5a78' },
  };
  // base plate trim colour for each gun turret, so they are easy to tell apart
  const GT_TRIM = { pistol: '#c3cbd4', smg: '#7fe08f', shotgun: '#e0a060', rifle: '#9ad0ff', sniper: '#d0b0ff', flamer: '#ff7a3c',
    launcher: '#c8e070', minigun: '#ffd23f', arc: '#4fe3ff', cryo: '#bfefff', saw: '#e0c060', rail: '#7a9cff' };
  const isGun = (id) => !!(GD.STRUCTS[id] && GD.STRUCTS[id].gun);
  const PHOENIX_R = 2400;     // how far the Rekindling ring travels (matches the game rule)
  const AIMS = (id) => id === 'turret' || id === 'cannon' || id === 'napalm' || id === 'leviathan' || id === 'hellmouth' || isGun(id);    // structures that swivel and shoot

  class Renderer {
    constructor(canvas) {
      this.canvas = canvas;
      this.ctx = canvas.getContext('2d');
      this.scale = 1; this.ox = 0; this.oy = 0;
      this.viewH = 0; this.viewW = W; this.camX = 0; this.camY = 0;   // viewH > 0 = follow-camera mode (phones)
      this.ground = mk(W, H, true);
      this.groundImg = null;
      this.decals = mk(W, H);
      this.dctx = this.decals.getContext('2d');
      this.light = mk(Math.round(W * LIGHT_RES), Math.round(H * LIGHT_RES));
      this.lctx = this.light.getContext('2d');
      this.sprites = {};
      this.glows = {};
      this.cones = {};
      this.splatBudget = 40;
      this.intelCache = null;
      this.parts = [];
      this.arcs = [];
      this.rings = [];
      this.flashes = [];
      this.pools = [];                  // napalm fires on the ground (from 'napalm' events)
      this.texts = [];
      this.banner = null;
      this.shake = 0;
      this.gore = 2;                      // 2 full, 1 reduced, 0 off (settings; kept per device)
      try { const g = localStorage.getItem('le_gore'); if (g !== null && g !== '') this.gore = Math.max(0, Math.min(2, +g || 0)); } catch (e) { /* default */ }
      this.style = 'classic';             // graphics style (settings; kept per device)
      try { const st = localStorage.getItem('le_style'); if (STYLES.some((o) => o.id === st)) this.style = st; } catch (e) { /* default */ }
      this.usePalette();
      this.dark = 0;
      this.time = 0;
      this.fadeT = 0;
      this.joinText = '';
      this.paintGround();
      this.bakeGround();
      this.fx = mk(4, 4);                 // effects/HUD layer drawn above the darkness
      this.fctx = this.fx.getContext('2d');
      this.setupLayers();
      this.resize();
      // Browsers may silently wipe off-screen canvases (GPU memory, background tabs). Check and rebuild.
      this.lostAt = 0;
      this.diag = { rebuilds: 0, errors: [], resets: 0 };
      this.watchCanvases();
      root.document && root.document.addEventListener('visibilitychange', () => { if (!root.document.hidden) this.checkLost(true); });
    }
    // Stack the big static images as their own page layers (ground, blood, darkness) instead of copying
    // them into the main canvas every frame. The browser composites layers on the graphics card for free.
    setupLayers() {
      this.layered = false;
      const doc = root.document, parent = this.canvas.parentNode;
      if (!doc || !parent) return;
      this.layered = true;
      this.lastTf = '';
      const style = (el, w, h) => {
        el.classList.add('rlayer');
        Object.assign(el.style, { position: 'fixed', left: '0px', top: '0px', transformOrigin: '0 0', pointerEvents: 'none',
          width: w + 'px', height: h + 'px' });
      };
      style(this.ground, W, H); style(this.decals, W, H); style(this.light, W, H);
      style(this.fx, 1, 1);
      this.canvas.style.background = 'transparent';
      parent.insertBefore(this.ground, this.canvas);
      parent.insertBefore(this.decals, this.canvas);
      parent.insertBefore(this.fx, this.canvas.nextSibling);
      parent.insertBefore(this.light, this.fx);
      this.applyStyle();
    }
    // ---- graphics styles
    ink(col) { return this.style === 'charcoal' ? toGrey(col) : this.lk && this.lk.corpse ? this.lk.corpse : col; }
    // blood and bile colours for the style (a look may bring its own; charcoal uses the ink reds)
    usePalette() {
      const lk = lookOf(this.style) || {};
      BLOOD = lk.blood || (this.style === 'charcoal' ? BLOOD_INK : BLOOD_CLASSIC); BILE = lk.bile || (this.style === 'charcoal' ? BILE_INK : BILE_CLASSIC);
    }
    setStyle(id) {
      if (!STYLES.some((o) => o.id === id) || id === this.style) return;
      this.style = id;
      try { localStorage.setItem('le_style', id); } catch (e) { /* private mode */ }
      setTheme(id, true);
      this.usePalette(); this.lk = lookOf(id);
      this.groundImg = null; this.paintGround(); this.bakeGround();
      this.applyStyle();
    }
    // Charcoal: the world layer is shown in greys (one filter on the graphics card), a sheet of charcoal strokes lies over
    // it, and only what is drawn above it keeps colour: flame, muzzle flash, blood.
    applyStyle() {
      this.lk = (Renderer.LOOKS && Renderer.LOOKS[this.style]) || null;     // a style's own drawing code (look-<style>.js)
      this.sprites = {};
      if (!this.layered) return;
      const ch = this.style === 'charcoal';
      this.canvas.style.filter = ch ? 'grayscale(1) contrast(1.18)' : (this.lk && this.lk.filter) || '';
      this.ground.style.filter = (this.lk && this.lk.filter && this.lk.filterGround) ? this.lk.filter : '';
      this.canvas.style.mixBlendMode = this.decals.style.mixBlendMode = (this.lk && this.lk.blend) || '';       // watercolour: pigment soaks into the paper
      if (ch && !this.paper) {
        const pw = W / 2, ph = H / 2, cv = this.paper = mk(pw, ph), g = cv.getContext('2d');
        g.lineCap = 'round';
        for (let i = 0; i < 3800; i++) {
          const x = rand(0, pw), y = rand(0, ph), a = -0.75 + rand(-0.18, 0.18), l = rand(4, 15), dk = Math.random() < 0.62;
          g.strokeStyle = dk ? `rgba(8,8,10,${rand(0.06, 0.2)})` : `rgba(240,236,226,${rand(0.04, 0.12)})`; g.lineWidth = rand(0.4, 1.3);
          g.beginPath(); g.moveTo(x, y); g.lineTo(x + Math.cos(a) * l, y + Math.sin(a) * l); g.stroke();
        }
        for (let i = 0; i < 5000; i++) { g.fillStyle = Math.random() < 0.5 ? `rgba(0,0,0,${rand(0.03, 0.14)})` : `rgba(255,255,255,${rand(0.02, 0.08)})`; g.fillRect(rand(0, pw), rand(0, ph), 1, 1); }
        cv.classList.add('rlayer');
        Object.assign(cv.style, { position: 'fixed', left: '0px', top: '0px', transformOrigin: '0 0', pointerEvents: 'none', width: W + 'px', height: H + 'px' });
        this.canvas.parentNode.insertBefore(cv, this.fx);          // above the darkness: the pale strokes still show in the dark
        this.lastTf = '';
      }
      if (this.paper) this.paper.style.visibility = ch ? '' : 'hidden';
      // a look may lay its own sheet over the world, under the darkness (cross-stitch: the cloth the picture shows through)
      if (this.lkLayer) { this.lkLayer.remove(); this.lkLayer = null; }
      if (this.lk && this.lk.overlay) {
        const cv = this.lkLayer = this.lk.overlay(this);
        cv.classList.add('rlayer');
        Object.assign(cv.style, { position: 'fixed', left: '0px', top: '0px', transformOrigin: '0 0', pointerEvents: 'none', width: W + 'px', height: H + 'px' });
        this.canvas.parentNode.insertBefore(cv, this.light);
        this.lastTf = '';
      }
    }
    paintGroundCharcoal() {
      const g = this.ground.getContext('2d');
      g.globalAlpha = 1; g.fillStyle = '#8b8881'; g.fillRect(0, 0, W, H);
      for (let i = 0; i < 170; i++) {                       // smudges: rubbed-in darks, lifted lights
        const x = rand(0, W), y = rand(0, H), r = rand(60, 240), c = Math.random() < 0.6 ? '40,40,44' : '196,192,182';
        const gr = g.createRadialGradient(x, y, 0, x, y, r);
        gr.addColorStop(0, `rgba(${c},0.24)`); gr.addColorStop(1, `rgba(${c},0)`);
        g.fillStyle = gr; g.fillRect(x - r, y - r, r * 2, r * 2);
      }
      let gr = g.createRadialGradient(FIRE.x, FIRE.y, 30, FIRE.x, FIRE.y, 340);     // the trampled clearing: bare paper
      gr.addColorStop(0, 'rgba(214,210,200,0.9)'); gr.addColorStop(0.6, 'rgba(190,186,176,0.45)'); gr.addColorStop(1, 'rgba(190,186,176,0)');
      g.fillStyle = gr; g.fillRect(FIRE.x - 350, FIRE.y - 350, 700, 700);
      g.lineCap = 'round';
      for (let i = 0; i < 15000; i++) {                     // hatching, all leaning the same way like a right hand draws
        const x = rand(0, W), y = rand(0, H), a = -0.75 + rand(-0.2, 0.2), l = rand(7, 26), dk = Math.random() < 0.66;
        g.strokeStyle = dk ? `rgba(14,14,16,${rand(0.05, 0.2)})` : `rgba(232,228,216,${rand(0.05, 0.16)})`; g.lineWidth = rand(0.6, 1.9);
        g.beginPath(); g.moveTo(x, y); g.lineTo(x + Math.cos(a) * l, y + Math.sin(a) * l); g.stroke();
      }
      for (let i = 0; i < 2600; i++) {                      // grass: quick flicks of the stick
        const x = rand(0, W), y = rand(0, H);
        if (Math.hypot(x - FIRE.x, y - FIRE.y) < 200) continue;
        g.strokeStyle = `rgba(16,16,18,${rand(0.25, 0.6)})`; g.lineWidth = rand(0.8, 1.6);
        g.beginPath(); for (let k = -1; k <= 1; k++) { g.moveTo(x, y); g.lineTo(x + k * 4 + rand(-1.5, 1.5), y - rand(6, 12)); } g.stroke();
      }
      for (let i = 0; i < 90; i++) {                        // stones: an outline gone over twice, a shadow rubbed under
        const x = rand(0, W), y = rand(0, H), r = rand(3, 8), rot = rand(0, 3);
        g.fillStyle = 'rgba(10,10,12,0.4)'; g.beginPath(); g.ellipse(x + 2, y + 2.5, r, r * 0.7, rot, 0, TAU); g.fill();
        g.fillStyle = '#b9b5ab'; g.beginPath(); g.ellipse(x, y, r, r * 0.7, rot, 0, TAU); g.fill();
        g.strokeStyle = 'rgba(12,12,14,0.8)'; g.lineWidth = 1;
        for (let k = 0; k < 2; k++) { g.beginPath(); g.ellipse(x + rand(-0.8, 0.8), y + rand(-0.8, 0.8), r, r * 0.7, rot, 0, TAU); g.stroke(); }
      }
      const tree = (x, y, r) => {                           // the treeline: scribbled until the paper is black
        g.fillStyle = 'rgba(10,10,12,0.8)'; g.beginPath(); g.arc(x, y, r, 0, TAU); g.fill();
        for (let k = 0; k < 9; k++) {
          g.strokeStyle = k < 6 ? `rgba(6,6,8,${rand(0.4, 0.8)})` : `rgba(150,146,138,${rand(0.2, 0.45)})`; g.lineWidth = rand(1, 2.6);
          const a0 = rand(0, TAU); g.beginPath(); g.ellipse(x + rand(-6, 6), y + rand(-6, 6), r * rand(0.5, 1.05), r * rand(0.4, 0.95), rand(0, 3), a0, a0 + rand(2.5, 5.5)); g.stroke();
        }
      };
      for (let x = -10; x < W + 40; x += rand(34, 62)) { tree(x, rand(-22, -4), rand(26, 40)); tree(x, H + rand(4, 22), rand(26, 40)); }
      for (let y = -10; y < H + 40; y += rand(34, 62)) { tree(rand(-22, -4), y, rand(26, 40)); tree(W + rand(4, 22), y, rand(26, 40)); }
      gr = g.createRadialGradient(W / 2, H / 2, H * 0.42, W / 2, H / 2, W * 0.62);
      gr.addColorStop(0, 'rgba(0,0,0,0)'); gr.addColorStop(1, 'rgba(0,0,0,0.4)');
      g.fillStyle = gr; g.fillRect(0, 0, W, H);
    }
    // Keep the layers lined up with the camera (and the main canvas' visibility).
    placeLayers(sx, sy) {
      if (!this.layered) return;
      const d = this.dpr || 1, sc = this.scale / d;
      const tf = `matrix(${sc},0,0,${sc},${(this.ox - this.camX * this.scale + sx) / d},${(this.oy - this.camY * this.scale + sy) / d})`;
      if (tf !== this.lastTf) {
        this.lastTf = tf;
        this.ground.style.transform = tf; this.decals.style.transform = tf; this.light.style.transform = tf;
        if (this.paper) this.paper.style.transform = tf;
        if (this.lkLayer) this.lkLayer.style.transform = tf;
      }
      // the page "boils": the stroke sheet shifts a few times a second, like redrawn animation frames
      if (this.paper && this.style === 'charcoal') { const bj = Math.floor(this.time * 6); if (bj !== this.boilJ) { this.boilJ = bj; this.paper.style.transform = this.lastTf + ` translate(${(bj * 37) % 23 - 11}px,${(bj * 53) % 19 - 9}px)`; } }
      if ((this.visT = (this.visT || 0) + 1) % 20 === 1) {
        const disp = root.getComputedStyle ? root.getComputedStyle(this.canvas).display : '';
        for (const el of [this.ground, this.decals, this.light, this.fx, this.paper, this.lkLayer]) if (el && el.style.display !== disp) el.style.display = disp;
      }
    }
    // The ground becomes a fixed image: fast to draw and it cannot be wiped by the browser.
    bakeGround() {
      if (root.createImageBitmap) root.createImageBitmap(this.ground).then((b) => { this.groundImg = b; }).catch(() => {});
    }
    watchCanvases() {
      for (const cv of [this.decals, this.light]) {
        if (!cv.addEventListener) continue;
        cv.addEventListener('contextlost', () => { this.lostFlag = true; });
        cv.addEventListener('contextrestored', () => { this.lostFlag = true; });
      }
    }
    // Cheap check (no pixel read-back): rebuild the drawable layers if the browser threw them away.
    checkLost(force) {
      const now = root.performance ? root.performance.now() : Date.now();
      if (!force && !this.lostFlag && now - this.lostAt < 2000) return;
      this.lostAt = now;
      const ll = this.lctx.isContextLost && this.lctx.isContextLost(), dl = this.dctx.isContextLost && this.dctx.isContextLost();
      if (this.lostFlag || ll || dl) { this.lostFlag = false; this.rebuildCanvases(); this.diag.rebuilds++; }
    }
    rebuildCanvases() {
      if (!this.groundImg) { this.ground = mk(W, H, true); this.paintGround(); this.bakeGround(); }
      const oldD = this.decals, oldL = this.light;
      this.decals = mk(W, H);
      this.dctx = this.decals.getContext('2d');
      this.light = mk(Math.round(W * LIGHT_RES), Math.round(H * LIGHT_RES));
      this.lctx = this.light.getContext('2d');
      this.sprites = {}; this.glows = {}; this.cones = {};
      if (this.layered && oldD.parentNode) {
        for (const [o, n] of [[oldD, this.decals], [oldL, this.light]]) {
          n.className = o.className; n.style.cssText = o.style.cssText; o.replaceWith(n);
        }
      }
      this.watchCanvases();
    }
    // Dynamic resolution: a device that keeps missing frames draws fewer pixels, and sharpens again
    // once it has been smooth for a while. Call once per animation frame with its timestamp.
    // Drawing resolution follows the frame rate: it steps down when frames are being missed and climbs back up once
    // things are smooth again (it used to never climb back, so one heavy fight left the screen blurry until a reload).
    // The first few seconds after loading are ignored (they always stutter). "Always sharp" turns it off.
    autoRes(now) {
      const a = this.ar || (this.ar = { last: now, gaps: [], t0: now, born: now, vs: 0, good: 0, bad: 0, lvl: 0, dropAt: 0 });
      const gap = now - a.last;
      a.last = now;
      if (this.sharp) { if (a.lvl) { a.lvl = 0; this.resScale = 1; this.diag.resScale = 1; this.resize(); } return; }
      if (gap <= 0 || gap > 250 || now - a.born < 5000) return;     // hidden tab, a stall, or still starting up
      a.gaps.push(gap);
      if (now - a.t0 < 2000) return;
      const g = a.gaps.sort((x, y) => x - y);
      a.gaps = []; a.t0 = now;
      if (g.length < 20) return;
      const p5 = g[Math.floor(g.length * 0.05)];
      a.vs = a.vs ? Math.min(a.vs, Math.max(6, p5)) : Math.max(6, p5);   // the display's own frame interval
      let slow = 0;
      for (const x of g) if (x > a.vs * 1.5 + 2) slow++;
      const frac = slow / g.length;
      const LV = [1, 0.85, 0.72, 0.6];
      // every change reallocates the canvases (a visible hitch), so change rarely: drop only after two bad windows in a
      // row, and climb back only after 30 s of smooth frames
      if (frac > 0.25 && a.lvl < LV.length - 1) { if (++a.bad < 2) return; a.lvl++; a.good = 0; a.bad = 0; a.dropAt = now; }
      else if (frac < 0.05 && a.lvl > 0 && now - a.dropAt > 30000) { a.bad = 0; if (++a.good >= 5) { a.lvl--; a.good = 0; a.dropAt = now; } else return; }
      else { if (frac >= 0.05) a.good = 0; if (frac <= 0.25) a.bad = 0; return; }
      this.resScale = LV[a.lvl];
      this.diag.resScale = this.resScale;
      this.resize();
    }
    resize() {
      const dpr = Math.max(0.5, Math.min(root.devicePixelRatio || 1, this.maxDpr || 1.5) * (this.resScale || 1));
      const w = root.innerWidth, h = root.innerHeight;
      this.canvas.width = Math.round(w * dpr); this.canvas.height = Math.round(h * dpr);
      this.canvas.style.width = w + 'px'; this.canvas.style.height = h + 'px';
      this.dpr = dpr;
      if (this.fx) { this.fx.width = this.canvas.width; this.fx.height = this.canvas.height; this.fx.style.width = w + 'px'; this.fx.style.height = h + 'px'; }
      this.lastTf = '';
      this.scale = Math.min(this.canvas.width / W, this.canvas.height / H);
      this.ox = (this.canvas.width - W * this.scale) / 2;
      this.oy = (this.canvas.height - H * this.scale) / 2;
      if (this.viewH) {
        this.scale = this.canvas.height / this.viewH;
        this.viewW = this.canvas.width / this.scale;
        this.ox = 0; this.oy = 0;
      }
      this.cssScale = this.scale / dpr; this.cssOx = this.ox / dpr; this.cssOy = this.oy / dpr;
    }
    toWorld(clientX, clientY) {
      return { x: (clientX - this.cssOx) / this.cssScale + this.camX, y: (clientY - this.cssOy) / this.cssScale + this.camY };
    }
    // Centre the follow camera on a world point. It stays inside the map, except that it may slide past
    // an edge by camPad (CSS pixels per side) so on-screen controls never hide the outermost cells.
    setCam(x, y) {
      if (!this.viewH) return;
      const p = this.camPad, k = 1 / (this.cssScale || 1);
      const x0 = p ? -p.l * k : 0, x1 = W - this.viewW + (p ? p.r * k : 0);
      const y0 = p ? -p.t * k : 0, y1 = H - this.viewH + (p ? p.b * k : 0);
      this.camX = x1 <= x0 ? (x0 + x1) / 2 : clamp(x - this.viewW / 2, x0, x1);
      this.camY = y1 <= y0 ? (y0 + y1) / 2 : clamp(y - this.viewH / 2, y0, y1);
    }
    clearWorld() {
      if (this.lk && this.lk.reset) this.lk.reset(this);
      this.dctx.clearRect(0, 0, W, H);
      this.parts.length = 0; this.arcs.length = 0; this.rings.length = 0; this.flashes.length = 0; this.texts.length = 0; this.pools.length = 0;
    }

    // ---------------------------------------------------------- static art
    paintGround() {
      if (this.style === 'charcoal') { this.paintGroundCharcoal(); return; }
      { const lk = lookOf(this.style); if (lk && lk.ground) { const g2 = this.ground.getContext('2d'); g2.globalAlpha = 1; lk.ground(this, g2); return; } }
      const g = this.ground.getContext('2d');
      g.globalAlpha = 1;
      g.fillStyle = '#35422a'; g.fillRect(0, 0, W, H);
      for (let i = 0; i < 70; i++) {
        const x = rand(0, W), y = rand(0, H), r = rand(80, 260);
        const gr = g.createRadialGradient(x, y, 0, x, y, r);
        const c = Math.random() < 0.5 ? '20,26,14' : '62,74,44';
        gr.addColorStop(0, `rgba(${c},0.22)`); gr.addColorStop(1, `rgba(${c},0)`);
        g.fillStyle = gr; g.fillRect(x - r, y - r, r * 2, r * 2);
      }
      const cols = ['#3f4d32', '#2c3722', '#48573a', '#3a472d', '#28321f'];
      for (let i = 0; i < 16000; i++) {
        g.globalAlpha = rand(0.25, 0.7);
        g.fillStyle = cols[(Math.random() * cols.length) | 0];
        const s = rand(1.5, 5);
        g.fillRect(rand(0, W), rand(0, H), s, s);
      }
      // trampled dirt around the fire
      g.globalAlpha = 1;
      let gr = g.createRadialGradient(FIRE.x, FIRE.y, 30, FIRE.x, FIRE.y, 330);
      gr.addColorStop(0, 'rgba(96,78,54,0.95)'); gr.addColorStop(0.55, 'rgba(84,70,48,0.55)'); gr.addColorStop(1, 'rgba(84,70,48,0)');
      g.fillStyle = gr; g.fillRect(FIRE.x - 340, FIRE.y - 340, 680, 680);
      for (let i = 0; i < 1500; i++) {
        const a = rand(0, TAU), d = Math.sqrt(Math.random()) * 300;
        g.globalAlpha = rand(0.15, 0.4) * (1 - d / 320);
        g.fillStyle = Math.random() < 0.5 ? '#4a3c28' : '#7a6646';
        g.fillRect(FIRE.x + Math.cos(a) * d, FIRE.y + Math.sin(a) * d, rand(2, 5), rand(2, 5));
      }
      // grass tufts
      g.lineCap = 'round';
      for (let i = 0; i < 2200; i++) {
        const x = rand(0, W), y = rand(0, H);
        if (Math.hypot(x - FIRE.x, y - FIRE.y) < 190) continue;
        g.globalAlpha = rand(0.3, 0.75);
        g.strokeStyle = Math.random() < 0.5 ? '#5c7640' : '#4a6234';
        g.lineWidth = 2.6;
        g.beginPath();
        for (let k = -1; k <= 1; k++) { g.moveTo(x, y); g.lineTo(x + k * 4.5 + rand(-1, 1), y - rand(7, 12)); }
        g.stroke();
      }
      // stones
      for (let i = 0; i < 90; i++) {
        const x = rand(0, W), y = rand(0, H), r = rand(3, 8);
        g.globalAlpha = 0.5; g.fillStyle = '#12160e';
        g.beginPath(); g.ellipse(x + 2, y + 2, r, r * 0.7, 0, 0, TAU); g.fill();
        g.globalAlpha = 0.9; g.fillStyle = Math.random() < 0.5 ? '#5a5e58' : '#6c6e66';
        g.beginPath(); g.ellipse(x, y, r, r * 0.7, rand(0, 3), 0, TAU); g.fill();
      }
      // tree line around the edge (the dead come out of the woods)
      g.globalAlpha = 1;
      const tree = (x, y, r) => {
        g.fillStyle = 'rgba(8,12,6,0.55)'; g.beginPath(); g.arc(x + 5, y + 6, r, 0, TAU); g.fill();
        g.fillStyle = '#182414'; g.beginPath(); g.arc(x, y, r, 0, TAU); g.fill();
        g.fillStyle = '#213119'; g.beginPath(); g.arc(x - r * 0.2, y - r * 0.2, r * 0.7, 0, TAU); g.fill();
        g.fillStyle = '#2a3d20'; g.beginPath(); g.arc(x - r * 0.3, y - r * 0.3, r * 0.35, 0, TAU); g.fill();
      };
      for (let x = -10; x < W + 40; x += rand(34, 62)) { tree(x, rand(-22, -4), rand(26, 40)); tree(x, H + rand(4, 22), rand(26, 40)); }
      for (let y = -10; y < H + 40; y += rand(34, 62)) { tree(rand(-22, -4), y, rand(26, 40)); tree(W + rand(4, 22), y, rand(26, 40)); }
      gr = g.createRadialGradient(W / 2, H / 2, H * 0.45, W / 2, H / 2, W * 0.62);
      gr.addColorStop(0, 'rgba(0,0,0,0)'); gr.addColorStop(1, 'rgba(0,0,0,0.18)');
      g.fillStyle = gr; g.fillRect(0, 0, W, H);
    }

    // Menu icon for a structure: its sprite, plus the gun for gun turrets.
    icon(id) {
      const base = this.sprite(id);
      if (!isGun(id)) return base;
      const c = mk(base.width, base.height), g = c.getContext('2d');
      g.drawImage(base, 0, 0);
      g.scale(base.width / CELL, base.width / CELL);
      this.drawStruct(g, { id, cx: 0, cy: 0, x: CELL / 2, y: CELL / 2, ang: -Math.PI / 4, uid: 0, hitT: 0, flash: 0, gun: GD.STRUCTS[id].gun, mag: 1, reloadT: 0 }, 1, true);
      return c;
    }
    sprite(id) {
      if (this.sprites[id]) return this.sprites[id];
      if (this.lk && this.lk.sprite) { const sp = this.lk.sprite(this, id); if (sp) return (this.sprites[id] = sp); }
      const S = 2, c = mk(CELL * S, CELL * S), g = c.getContext('2d');
      g.scale(S, S);
      const rr = (x, y, w, h, r) => { g.beginPath(); g.roundRect(x, y, w, h, r); };
      if (id === 'wood') {
        g.fillStyle = '#3a2816'; rr(1, 1, 38, 38, 3); g.fill();
        const pl = ['#8a6238', '#7a5630', '#95693c', '#6e4c2a'];
        for (let i = 0; i < 4; i++) {
          g.fillStyle = pl[i]; g.fillRect(3, 3 + i * 8.6, 34, 7.4);
          g.fillStyle = 'rgba(0,0,0,0.18)'; g.fillRect(3, 3 + i * 8.6 + 6, 34, 1.4);
          g.fillStyle = 'rgba(255,255,255,0.08)'; g.fillRect(3, 3 + i * 8.6, 34, 1.2);
        }
        g.save(); g.translate(20, 20); g.rotate(0.62);
        g.fillStyle = '#a57644'; g.fillRect(-23, -3.5, 46, 7);
        g.fillStyle = 'rgba(0,0,0,0.25)'; g.fillRect(-23, 2, 46, 1.5);
        g.restore();
        g.fillStyle = '#2a2a2a';
        [[7, 7], [33, 7], [7, 33], [33, 33]].forEach(([x, y]) => { g.beginPath(); g.arc(x, y, 1.4, 0, TAU); g.fill(); });
      } else if (id === 'steel') {
        g.fillStyle = '#1f2328'; rr(0.5, 0.5, 39, 39, 3); g.fill();
        const gr = g.createLinearGradient(0, 0, 40, 40);
        gr.addColorStop(0, '#8d97a3'); gr.addColorStop(0.5, '#6a737e'); gr.addColorStop(1, '#4c545e');
        g.fillStyle = gr; rr(3, 3, 34, 34, 2); g.fill();
        g.strokeStyle = 'rgba(0,0,0,0.3)'; g.lineWidth = 1.5;
        g.beginPath(); g.moveTo(3, 20); g.lineTo(37, 20); g.moveTo(20, 3); g.lineTo(20, 37); g.stroke();
        g.fillStyle = '#c3cbd4';
        [[8, 8], [32, 8], [8, 32], [32, 32], [20, 20]].forEach(([x, y]) => { g.beginPath(); g.arc(x, y, 1.8, 0, TAU); g.fill(); });
        g.fillStyle = 'rgba(255,220,60,0.75)';
        for (let i = 0; i < 5; i++) { g.beginPath(); g.moveTo(5 + i * 7, 37); g.lineTo(9 + i * 7, 37); g.lineTo(12 + i * 7, 33); g.lineTo(8 + i * 7, 33); g.fill(); }
      } else if (id === 'bunker') {
        g.fillStyle = '#16181b'; rr(0, 0, 40, 40, 2); g.fill();
        const gr = g.createLinearGradient(0, 0, 40, 40);
        gr.addColorStop(0, '#a29d93'); gr.addColorStop(1, '#6c6860');
        g.fillStyle = gr; rr(2, 2, 36, 36, 2); g.fill();
        g.fillStyle = 'rgba(0,0,0,0.22)';                       // poured-concrete slabs
        g.fillRect(2, 13, 36, 1.6); g.fillRect(2, 26, 36, 1.6);
        g.fillStyle = 'rgba(255,255,255,0.12)'; g.fillRect(2, 2, 36, 1.5);
        g.fillStyle = 'rgba(0,0,0,0.18)';
        [[9, 7], [27, 19], [14, 31], [31, 8], [6, 22]].forEach(([x, y]) => { g.beginPath(); g.arc(x, y, 1.3, 0, TAU); g.fill(); });
        g.strokeStyle = '#3c3f44'; g.lineWidth = 2.6;            // steel bands
        g.beginPath(); g.moveTo(2, 7); g.lineTo(38, 7); g.moveTo(2, 33); g.lineTo(38, 33); g.stroke();
        g.fillStyle = '#c3cbd4';
        [[6, 7], [20, 7], [34, 7], [6, 33], [20, 33], [34, 33]].forEach(([x, y]) => { g.beginPath(); g.arc(x, y, 1.4, 0, TAU); g.fill(); });
      } else if (id === 'phoenix') {
        g.fillStyle = '#060406'; rr(0, 0, 40, 40, 8); g.fill();
        g.fillStyle = '#1c1418'; rr(2, 2, 36, 36, 8); g.fill();
        g.strokeStyle = '#ffcf5a'; g.lineWidth = 1.4; g.beginPath(); g.arc(20, 20, 15, 0, TAU); g.stroke();
        g.beginPath(); g.arc(20, 20, 10, 0, TAU); g.stroke();
        for (let i = 0; i < 8; i++) { const a = i * TAU / 8; g.beginPath(); g.moveTo(20 + Math.cos(a) * 10, 20 + Math.sin(a) * 10); g.lineTo(20 + Math.cos(a) * 15, 20 + Math.sin(a) * 15); g.stroke(); }
        g.fillStyle = '#3a2418'; g.beginPath(); g.arc(20, 20, 7, 0, TAU); g.fill();       // the brazier bowl
      } else if (id === 'sunlance') {
        g.fillStyle = '#0a0a0e'; rr(0, 0, 40, 40, 6); g.fill();
        g.fillStyle = '#2a2a34'; rr(2, 2, 36, 36, 6); g.fill();
        g.strokeStyle = '#ffd86a'; g.lineWidth = 1.6; rr(3, 3, 34, 34, 5); g.stroke();
        g.fillStyle = '#d8dce4'; g.beginPath(); g.arc(20, 20, 13, 0, TAU); g.fill();       // the dish
        g.fillStyle = '#9aa0ac'; g.beginPath(); g.arc(20, 20, 9, 0, TAU); g.fill();
        g.fillStyle = '#fff3c0'; g.beginPath(); g.arc(20, 20, 3.2, 0, TAU); g.fill();
      } else if (id === 'trail') {
        g.fillStyle = 'rgba(90,8,6,0.55)';
        for (const [x, y, rx, ry, a] of [[20, 20, 16, 7, 0.3], [12, 14, 6, 4, 1.1], [28, 27, 7, 4, 0.6], [24, 12, 4, 3, 0], [14, 28, 5, 3, 0.9]]) { g.beginPath(); g.ellipse(x, y, rx, ry, a, 0, TAU); g.fill(); }
        g.fillStyle = 'rgba(140,20,14,0.5)'; g.beginPath(); g.ellipse(20, 20, 9, 3.5, 0.3, 0, TAU); g.fill();
      } else if (id === 'ward') {
        g.fillStyle = 'rgba(0,0,0,0.35)'; g.beginPath(); g.ellipse(22, 24, 12, 9, 0, 0, TAU); g.fill();
        g.fillStyle = '#4a3420'; g.fillRect(18, 6, 4, 30);                                   // the post
        for (const y of [9, 18, 27]) {                                                       // stacked skulls
          g.fillStyle = '#e8e0cc'; g.beginPath(); g.arc(20, y, 5.2, 0, TAU); g.fill();
          g.fillStyle = '#1a1410'; g.beginPath(); g.arc(18.2, y - 0.5, 1.3, 0, TAU); g.arc(21.8, y - 0.5, 1.3, 0, TAU); g.fill();
        }
        g.strokeStyle = '#7a1a12'; g.lineWidth = 1.2; g.beginPath(); g.moveTo(12, 4); g.lineTo(28, 36); g.stroke();
      } else if (id === 'hellmouth') {
        g.fillStyle = '#0c0a08'; rr(0, 0, 40, 40, 6); g.fill();
        g.fillStyle = '#3a2418'; rr(2, 2, 36, 36, 6); g.fill();
        g.save(); g.beginPath(); g.roundRect(2, 2, 36, 36, 6); g.clip();
        g.fillStyle = 'rgba(255,120,40,0.35)';
        for (let i = -40; i < 40; i += 8) { g.beginPath(); g.moveTo(i, 40); g.lineTo(i + 4, 40); g.lineTo(i + 44, 0); g.lineTo(i + 40, 0); g.fill(); }
        g.restore();
        g.fillStyle = '#16100c'; g.beginPath(); g.arc(20, 20, 14.5, 0, TAU); g.fill();
        g.fillStyle = '#ff6a1a'; for (let i = -2; i <= 2; i++) g.fillRect(12, 19 + i * 3.4, 16, 1.4);   // glowing grate
        g.fillStyle = '#c3cbd4'; [[5, 5], [35, 5], [5, 35], [35, 35]].forEach(([x, y]) => { g.beginPath(); g.arc(x, y, 1.8, 0, TAU); g.fill(); });
      } else if (id === 'spikes') {
        g.fillStyle = '#2a2e34'; rr(3, 3, 34, 34, 4); g.fill();
        g.fillStyle = '#4a5058'; rr(5, 5, 30, 30, 3); g.fill();
        g.fillStyle = '#16181c';
        for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) { g.beginPath(); g.arc(9.5 + i * 7, 9.5 + j * 7, 1.9, 0, TAU); g.fill(); }
        g.fillStyle = 'rgba(255,220,60,0.7)';
        for (let i = 0; i < 5; i++) { g.beginPath(); g.moveTo(5 + i * 7, 37); g.lineTo(9 + i * 7, 37); g.lineTo(12 + i * 7, 34); g.lineTo(8 + i * 7, 34); g.fill(); }
      } else if (id === 'gravity') {
        g.fillStyle = '#0e0c14'; rr(1, 1, 38, 38, 8); g.fill();
        g.fillStyle = '#251c36'; g.beginPath(); g.arc(20, 20, 16, 0, TAU); g.fill();
        g.strokeStyle = '#8a5cff'; g.lineWidth = 1.6; g.beginPath(); g.arc(20, 20, 16, 0, TAU); g.stroke();
        g.fillStyle = '#c3cbd4'; [[5, 5], [35, 5], [5, 35], [35, 35]].forEach(([x, y]) => { g.beginPath(); g.arc(x, y, 1.6, 0, TAU); g.fill(); });
      } else if (id === 'leviathan') {
        g.fillStyle = '#0e1013'; rr(0, 0, 40, 40, 4); g.fill();
        g.fillStyle = '#3a2a2a'; rr(2, 2, 36, 36, 4); g.fill();
        g.save(); g.beginPath(); g.roundRect(2, 2, 36, 36, 4); g.clip();
        g.fillStyle = 'rgba(255,60,40,0.4)';
        for (let i = -40; i < 40; i += 8) { g.beginPath(); g.moveTo(i, 40); g.lineTo(i + 4, 40); g.lineTo(i + 44, 0); g.lineTo(i + 40, 0); g.fill(); }
        g.restore();
        g.fillStyle = '#1c1f24'; g.beginPath(); g.arc(20, 20, 14, 0, TAU); g.fill();
        g.strokeStyle = '#ff5a3c'; g.lineWidth = 1.6; g.beginPath(); g.arc(20, 20, 14, 0, TAU); g.stroke();
        g.fillStyle = '#c3cbd4'; [[5, 5], [35, 5], [5, 35], [35, 35]].forEach(([x, y]) => { g.beginPath(); g.arc(x, y, 1.8, 0, TAU); g.fill(); });
      } else if (id === 'fence') {
        g.fillStyle = '#1a1d22'; rr(1, 1, 38, 38, 3); g.fill();
        g.fillStyle = '#3a4048'; rr(3, 3, 34, 34, 2); g.fill();
        g.fillStyle = '#20242a'; [[5, 5], [31, 5], [5, 31], [31, 31]].forEach(([x, y]) => { g.fillRect(x, y, 4, 4); });   // posts
        g.strokeStyle = '#ffd23f'; g.lineWidth = 1.6;                                                                       // live wires
        for (const y of [10, 17, 24, 31]) { g.beginPath(); g.moveTo(5, y); g.lineTo(35, y); g.stroke(); }
        g.strokeStyle = '#9fe0ff'; g.lineWidth = 1.2;                                                                       // a spark
        g.beginPath(); g.moveTo(14, 8); g.lineTo(19, 14); g.lineTo(16, 15); g.lineTo(22, 22); g.stroke();
        g.fillStyle = 'rgba(255,220,60,0.75)';
        for (let i = 0; i < 5; i++) { g.beginPath(); g.moveTo(5 + i * 7, 37); g.lineTo(9 + i * 7, 37); g.lineTo(12 + i * 7, 33); g.lineTo(8 + i * 7, 33); g.fill(); }
      } else if (id === 'husk') {
        g.fillStyle = 'rgba(70,8,6,0.55)';
        for (const [x, y, rx, ry] of [[20, 21, 17, 13], [10, 30, 7, 5], [31, 11, 6, 4]]) { g.beginPath(); g.ellipse(x, y, rx, ry, 0.4, 0, TAU); g.fill(); }
      } else if (id === 'gate') {
        g.fillStyle = '#23272c'; rr(0.5, 0.5, 39, 39, 4); g.fill();
        g.fillStyle = '#2f6b3c'; rr(4, 4, 32, 32, 2); g.fill();
        g.strokeStyle = '#7fe08f'; g.lineWidth = 2.5;
        for (let i = 0; i < 3; i++) { g.beginPath(); g.moveTo(11, 11 + i * 9); g.lineTo(20, 7 + i * 9); g.lineTo(29, 11 + i * 9); g.stroke(); }
        g.strokeStyle = '#8d97a3'; g.lineWidth = 2; g.strokeRect(4, 4, 32, 32);
      } else if (id === 'sandbag') {
        g.fillStyle = '#2a241a'; rr(1, 3, 38, 35, 6); g.fill();
        for (const [x, y, w] of [[3, 5, 17], [21, 5, 16], [2, 15, 12], [15, 15, 22], [3, 26, 18], [22, 26, 15]]) {
          g.fillStyle = '#9a8660'; rr(x, y, w, 9.5, 4); g.fill();
          g.fillStyle = 'rgba(255,255,255,0.13)'; g.fillRect(x + 2, y + 1.5, w - 4, 1.6);
          g.fillStyle = 'rgba(0,0,0,0.22)'; g.fillRect(x + 2, y + 7, w - 4, 1.6);
        }
      } else if (id === 'mud') {
        g.fillStyle = 'rgba(52,36,20,0.9)'; g.beginPath(); g.ellipse(20, 20, 19, 17, 0.2, 0, TAU); g.fill();
        g.fillStyle = 'rgba(84,60,34,0.85)'; g.beginPath(); g.ellipse(18, 19, 14, 11, 0.4, 0, TAU); g.fill();
        g.fillStyle = 'rgba(150,130,100,0.35)'; g.beginPath(); g.ellipse(14, 15, 5, 2, 0.3, 0, TAU); g.ellipse(25, 24, 4, 1.6, 0.2, 0, TAU); g.fill();
        g.fillStyle = 'rgba(30,20,10,0.6)'; for (const [x, y] of [[26, 13], [11, 25], [22, 28]]) { g.beginPath(); g.arc(x, y, 1.6, 0, TAU); g.fill(); }
      } else if (id === 'beartrap') {
        g.fillStyle = '#2a2c30'; g.beginPath(); g.arc(20, 20, 13, 0, TAU); g.fill();
        g.strokeStyle = '#8d97a3'; g.lineWidth = 2.4; g.beginPath(); g.arc(20, 20, 13, 0, TAU); g.stroke();
        g.fillStyle = '#c3cbd4';
        for (let i = 0; i < 10; i++) { const a = i * TAU / 10; g.beginPath(); g.moveTo(20 + Math.cos(a - 0.14) * 12, 20 + Math.sin(a - 0.14) * 12); g.lineTo(20 + Math.cos(a) * 6.5, 20 + Math.sin(a) * 6.5); g.lineTo(20 + Math.cos(a + 0.14) * 12, 20 + Math.sin(a + 0.14) * 12); g.fill(); }
        g.fillStyle = '#7a1a12'; g.beginPath(); g.arc(20, 20, 3.4, 0, TAU); g.fill();
      } else if (id === 'torch') {
        g.fillStyle = 'rgba(0,0,0,0.35)'; g.beginPath(); g.ellipse(22, 25, 8, 5, 0, 0, TAU); g.fill();
        g.fillStyle = '#4a3420'; g.fillRect(18, 14, 4, 16);
        g.fillStyle = '#2a2018'; g.fillRect(16.5, 12, 7, 4);
        g.fillStyle = '#ff8a2c'; g.beginPath(); g.ellipse(20, 10, 4.5, 6, 0, 0, TAU); g.fill();
        g.fillStyle = '#ffe08a'; g.beginPath(); g.ellipse(20, 11, 2.2, 3.4, 0, 0, TAU); g.fill();
      } else if (id === 'wire') {
        g.strokeStyle = '#3a3a3a'; g.lineWidth = 3;
        g.beginPath(); g.moveTo(4, 4); g.lineTo(4, 36); g.moveTo(36, 4); g.lineTo(36, 36); g.stroke();
        g.strokeStyle = '#b9bec4'; g.lineWidth = 1.3;
        for (let r = 0; r < 3; r++) {
          g.beginPath();
          for (let x = 2; x <= 38; x += 1) g.lineTo(x, 9 + r * 11 + Math.sin(x * 0.75 + r) * 4.5);
          g.stroke();
          for (let x = 5; x < 38; x += 6) {
            const y = 9 + r * 11 + Math.sin(x * 0.75 + r) * 4.5;
            g.beginPath(); g.moveTo(x - 2, y - 2); g.lineTo(x + 2, y + 2); g.moveTo(x + 2, y - 2); g.lineTo(x - 2, y + 2); g.stroke();
          }
        }
      } else if (id === 'mine') {
        g.fillStyle = 'rgba(0,0,0,0.35)'; g.beginPath(); g.arc(21, 22, 10, 0, TAU); g.fill();
        g.fillStyle = '#3c4234'; g.beginPath(); g.arc(20, 20, 10, 0, TAU); g.fill();
        g.fillStyle = '#565e4a'; g.beginPath(); g.arc(20, 20, 7, 0, TAU); g.fill();
        g.fillStyle = '#22261c';
        for (let i = 0; i < 6; i++) { g.beginPath(); g.arc(20 + Math.cos(i * 1.047) * 8.5, 20 + Math.sin(i * 1.047) * 8.5, 1.4, 0, TAU); g.fill(); }
      } else if (id === 'lure') {
        g.fillStyle = 'rgba(0,0,0,0.35)'; rr(5, 9, 32, 26, 4); g.fill();
        g.fillStyle = '#2e3b2a'; rr(4, 7, 32, 26, 4); g.fill();
        g.fillStyle = '#46573e'; rr(6, 9, 28, 22, 3); g.fill();
        g.fillStyle = '#1a2116'; g.beginPath(); g.arc(15, 20, 7.5, 0, TAU); g.fill();
        g.fillStyle = '#5e6e52';
        for (let a = 0; a < 6; a++) { g.beginPath(); g.arc(15 + Math.cos(a) * 4, 20 + Math.sin(a) * 4, 1.2, 0, TAU); g.fill(); }
        g.fillStyle = '#c9b46a'; g.fillRect(25, 13, 6, 3); g.fillRect(25, 18, 6, 2); g.fillRect(25, 22, 6, 2);
        g.strokeStyle = '#9aa0a8'; g.lineWidth = 1.5; g.beginPath(); g.moveTo(30, 8); g.lineTo(36, 1); g.stroke();
      } else if (id === 'lamp') {
        g.fillStyle = 'rgba(0,0,0,0.35)'; g.beginPath(); g.arc(21, 22, 12, 0, TAU); g.fill();
        g.fillStyle = '#2c3036'; g.beginPath(); g.arc(20, 20, 11, 0, TAU); g.fill();
        g.fillStyle = '#4a5058'; g.beginPath(); g.arc(20, 20, 8, 0, TAU); g.fill();
        g.fillStyle = '#fff3c0'; g.beginPath(); g.arc(20, 20, 5, 0, TAU); g.fill();
      } else if (isGun(id)) {
        const trim = GT_TRIM[GD.STRUCTS[id].gun] || '#ffb54a';
        g.fillStyle = '#1c1f24'; rr(2, 2, 36, 36, 9); g.fill();
        g.fillStyle = '#3a4048'; rr(5, 5, 30, 30, 7); g.fill();
        g.strokeStyle = trim; g.lineWidth = 2; rr(5, 5, 30, 30, 7); g.stroke();
        g.fillStyle = 'rgba(0,0,0,0.35)'; g.beginPath(); g.arc(20, 20, 11, 0, TAU); g.fill();
        g.fillStyle = trim; [[9, 9], [31, 9], [9, 31], [31, 31]].forEach(([x, y]) => { g.beginPath(); g.arc(x, y, 1.7, 0, TAU); g.fill(); });
      } else if (id === 'turret' || id === 'cannon' || id === 'napalm') {
        g.fillStyle = '#1c1f24'; rr(2, 2, 36, 36, 6); g.fill();
        g.fillStyle = id === 'turret' ? '#4a5560' : id === 'napalm' ? '#5e3022' : '#5a4e40'; rr(5, 5, 30, 30, 5); g.fill();
        if (id === 'napalm') {                                   // hazard stripes
          g.save(); g.beginPath(); g.roundRect(5, 5, 30, 30, 5); g.clip();
          g.fillStyle = 'rgba(255,157,60,0.35)';
          for (let i = -40; i < 40; i += 8) { g.beginPath(); g.moveTo(i, 40); g.lineTo(i + 4, 40); g.lineTo(i + 44, 0); g.lineTo(i + 40, 0); g.fill(); }
          g.restore();
        }
        g.fillStyle = 'rgba(0,0,0,0.3)'; g.beginPath(); g.arc(20, 20, 12, 0, TAU); g.fill();
        g.fillStyle = '#c3cbd4';
        [[8, 8], [32, 8], [8, 32], [32, 32]].forEach(([x, y]) => { g.beginPath(); g.arc(x, y, 1.6, 0, TAU); g.fill(); });
      } else if (id === 'tesla') {
        g.fillStyle = '#1c1f24'; rr(3, 3, 34, 34, 8); g.fill();
        g.fillStyle = '#39424e'; g.beginPath(); g.arc(20, 20, 14, 0, TAU); g.fill();
        g.strokeStyle = '#c98a3c'; g.lineWidth = 2.2;
        for (let r = 11; r >= 5; r -= 3) { g.beginPath(); g.arc(20, 20, r, 0, TAU); g.stroke(); }
        g.fillStyle = '#bfe8ff'; g.beginPath(); g.arc(20, 20, 3.5, 0, TAU); g.fill();
      } else if (id === 'medic') {
        g.fillStyle = '#1c1f24'; rr(2, 2, 36, 36, 6); g.fill();
        g.fillStyle = '#e9edf0'; rr(5, 5, 30, 30, 4); g.fill();
        g.fillStyle = '#35c46a'; g.fillRect(16, 9, 8, 22); g.fillRect(9, 16, 22, 8);
      }
      this.sprites[id] = c;
      return c;
    }

    // ---------------------------------------------------------- effects
    part(o) { if (this.parts.length < 900) this.parts.push(o); }
    blood(x, y, ang, n, color, speed) {
      n = this.gore === 2 ? n : this.gore === 1 ? Math.ceil(n * 0.35) : 0;
      for (let i = 0; i < n; i++) {
        const a = ang + rand(-0.55, 0.55) * (Math.random() < 0.25 ? 2 : 1), s = rand(0.25, 1) * (speed || 220);
        this.part({ k: 'blood', x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: rand(0.12, 0.38), max: 0.38, size: rand(0.8, 2.6), c: goreCol(color) });
      }
    }
    // Exit spray: blood leaves the far side of a hit along the bullet's path and lands as stretched drops and
    // fine mist, densest and biggest close to the body, thinning with distance.
    spray(x, y, ang, power, color) {
      if (this.gore === 0 || this.splatBudget-- <= 0) return;
      const d = this.dctx, k = this.gore === 1 ? 0.5 : 1, n = Math.round((4 + power * 5) * k);
      for (let i = 0; i < n; i++) {
        const f = Math.pow(Math.random(), 1.6), dist = 12 + f * (40 + power * 70), a = ang + rand(-0.32, 0.32) * (0.5 + f);
        const px = x + Math.cos(a) * dist, py = y + Math.sin(a) * dist, big = (1 - f) * (1.6 + power * 1.6) + 0.5;
        d.fillStyle = goreCol(color); d.globalAlpha = rand(0.55, 0.9);
        drop(d, px, py, big * rand(2.2, 4.5), big * rand(0.5, 0.9), a);
      }
      for (let i = 0; i < 2; i++) {                                         // a couple of heavy drops that land close and splash
        const dist = rand(10, 26 + power * 20), a = ang + rand(-0.3, 0.3);
        d.fillStyle = goreCol(color); d.globalAlpha = 0.8; blot(d, x + Math.cos(a) * dist, y + Math.sin(a) * dist, rand(1.6, 3.4) * (0.7 + power), rand(1.3, 2), a);
      }
      d.globalAlpha = 0.5; d.fillStyle = goreCol(color);                      // mist
      for (let i = 0; i < n * 2; i++) { const dist = rand(8, 60 + power * 80), a = ang + rand(-0.5, 0.5); d.fillRect(x + Math.cos(a) * dist, y + Math.sin(a) * dist, rand(0.6, 1.4), rand(0.6, 1.4)); }
      d.globalAlpha = 1;
    }
    // Chunks that fly off and stay on the ground.
    gibs(x, y, n, look, acid) {
      if (this.gore < 2) n = 0;
      if (n > 0 && this.lk && this.lk.fleck) { this.blood(x, y, rand(0, TAU), n * 2, acid ? pickOf(BILE) : pickOf(BLOOD), 320); return; }     // the style throws its own kind of pieces
      for (let i = 0; i < n; i++) {
        const a = rand(0, TAU), sp = rand(80, 260);
        const kind = Math.random();
        this.part({ k: 'gib', x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, life: rand(0.35, 0.6), max: 0.6, size: rand(2.5, 5.5), rot: rand(0, TAU), spin: rand(-12, 12),
          c: kind < 0.45 ? (acid ? pickOf(BILE) : pickOf(BLOOD)) : kind < 0.9 ? this.ink(shade(look.body, 0.45)) : '#a89c84' });
      }
    }
    // The track a Burrower leaves: a dug furrow with crumbled, lighter edges and the odd crack, painted onto the ground.
    furrow(z) {
      if (z._fx === undefined) { z._fx = z.x; z._fy = z.y; return; }
      const dx = z.x - z._fx, dy = z.y - z._fy, d = Math.hypot(dx, dy);
      if (d < 7) return;
      if (d > 80) { z._fx = z.x; z._fy = z.y; return; }        // jumped (snapshot gap): do not draw a streak across the map
      const g = this.dctx, nx = -dy / d, ny = dx / d;
      g.save(); g.lineCap = 'round';
      g.globalAlpha = 0.34; g.strokeStyle = '#2a1d0e'; g.lineWidth = 11;
      g.beginPath(); g.moveTo(z._fx, z._fy); g.lineTo(z.x, z.y); g.stroke();
      g.globalAlpha = 0.28; g.strokeStyle = '#8a6d44'; g.lineWidth = 2.2;          // thrown-up edges
      for (const s of [-1, 1]) {
        const j = rand(-1.2, 1.2);
        g.beginPath(); g.moveTo(z._fx + nx * s * (7 + j), z._fy + ny * s * (7 + j)); g.lineTo(z.x + nx * s * (7 - j), z.y + ny * s * (7 - j)); g.stroke();
      }
      if (Math.random() < 0.35) {                                                     // a crack running off into the dirt
        const s = Math.random() < 0.5 ? -1 : 1, len = rand(6, 14), bend = rand(-0.6, 0.6);
        const cx = z.x + nx * s * 7, cy = z.y + ny * s * 7;
        g.globalAlpha = 0.3; g.strokeStyle = '#1e1408'; g.lineWidth = 1.2;
        g.beginPath(); g.moveTo(cx, cy); g.lineTo(cx + (nx * s + dx / d * bend) * len, cy + (ny * s + dy / d * bend) * len); g.stroke();
      }
      g.restore();
      z._fx = z.x; z._fy = z.y;
    }
    // A stain on the ground: overlapping irregular blots in several dark shades with a near-black core, satellite
    // drops thrown outward (stretched along `ang` when the impact had a direction), hair-thin streaks and a wet glint.
    splat(x, y, r, color, alpha, ang) {
      if (this.gore === 0) return;
      if (this.gore === 1) { alpha *= 0.55; r *= 0.75; }
      if (this.splatBudget-- <= 0) return;      // plenty of gore, but never a frame-time spike
      // a graphics style can leave blood its own way (smears, cut ink, shards, stitches...): see splat() in look-*.js
      if (this.lk && this.lk.splat) { this.lk.splat(this, this.dctx, x, y, r, BILE.indexOf(goreCol(color)) >= 0, alpha, ang); this.dctx.globalAlpha = 1; return; }
      const d = this.dctx, dir = ang !== undefined;
      for (let i = 0; i < 3; i++) {
        d.fillStyle = goreCol(color); d.globalAlpha = alpha * rand(0.45, 0.8);
        blot(d, x + rand(-r, r) * 0.25, y + rand(-r, r) * 0.25, r * rand(0.55, 0.9), dir ? rand(1.2, 1.8) : rand(0.8, 1.3), dir ? ang : rand(0, TAU));
      }
      d.fillStyle = color && goreCol(color) !== color ? (BILE.indexOf(goreCol(color)) >= 0 ? '#141a08' : '#1a0202') : '#1a0202';
      d.globalAlpha = alpha * 0.6; blot(d, x, y, r * 0.42, 1, rand(0, TAU));          // the thick, dark middle
      const sat = Math.round(3 + r * 0.25);
      for (let i = 0; i < sat; i++) {
        const a = dir ? ang + rand(-0.7, 0.7) : rand(0, TAU), dist = r * rand(0.9, dir ? 3.2 : 2.2), sz = rand(0.5, 1.2) + r * 0.03;
        const px = x + Math.cos(a) * dist, py = y + Math.sin(a) * dist;
        d.fillStyle = goreCol(color); d.globalAlpha = alpha * rand(0.5, 0.95);
        drop(d, px, py, sz * rand(1.6, 3.6), sz * 0.7, a);
        if (Math.random() < 0.35) { d.strokeStyle = d.fillStyle; d.lineWidth = rand(0.5, 1); d.globalAlpha = alpha * 0.4; d.beginPath(); d.moveTo(x + Math.cos(a) * r * 0.5, y + Math.sin(a) * r * 0.5); d.lineTo(px, py); d.stroke(); }
      }
      if (r > 5) {                                                                // wet: a small pale glint, lost as it dries
        d.globalAlpha = 0.1 * alpha; d.fillStyle = '#ffb4a8';
        d.beginPath(); d.ellipse(x - r * 0.15, y - r * 0.2, r * 0.22, r * 0.07, -0.5, 0, TAU); d.fill();
      }
      d.globalAlpha = 1;
    }
    // A pool that creeps outward from a body for a few seconds.
    pool(x, y, r, color) {
      if (this.gore < 2 || (this.lk && this.lk.splat)) return;
      (this.bpools || (this.bpools = [])).push({ x, y, r: r * 0.35, max: r, c: goreCol(color), dark: BILE.indexOf(goreCol(color)) >= 0 ? '#12170a' : '#170203', seed: Array.from({ length: 9 }, () => 0.7 + Math.random() * 0.5), t: 0 });
      if (this.bpools.length > 30) this.bpools.shift();
    }
    floatText(x, y, text, color, big) {
      this.texts.push({ x, y, text, color: color || '#fff', life: big ? 2 : 1.1, max: big ? 2 : 1.1, big: !!big });
    }
    setBanner(text, sub, color, life, detail) {
      const L = life || 3.6;
      this.banner = { text, sub: sub || '', detail: detail || '', color: color || '#fff', life: L, max: L, slow: !!life };
    }

    handle(e, sim) {
      if (this.lk && this.lk.event) this.lk.event(this, e, sim);
      switch (e.type) {
        case 'shot': {
          this.flashes.push({ x: e.x, y: e.y, r: e.wid === 'flamer' ? 70 : 130, life: 0.06, max: 0.06, c: '255,210,130' });
          if (e.wid === 'flamer' || e.wid === 'arc' || e.wid === 'cannon') break;
          const a = e.ang + Math.PI / 2 + rand(-0.3, 0.3);
          if (!e.turret) this.part({ k: 'shell', x: e.px, y: e.py, vx: Math.cos(a) * rand(60, 120), vy: Math.sin(a) * rand(60, 120), life: 0.35, max: 0.35, size: 2, rot: rand(0, 3) });
          for (let i = 0; i < 2; i++) {
            const b = e.ang + rand(-0.4, 0.4);
            this.part({ k: 'spark', x: e.x, y: e.y, vx: Math.cos(b) * rand(150, 400), vy: Math.sin(b) * rand(150, 400), life: 0.08, max: 0.08, size: 1.5, c: '#ffd890' });
          }
          break;
        }
        case 'hit': {
          const acid = ACIDY[e.ztype];
          const gc = acid ? '#4e6a18' : '#5e0c0a';
          this.blood(e.x, e.y, e.ang, 6, gc, 300);
          if (Math.random() < 0.7) this.spray(e.x, e.y, e.ang, rand(0.2, 0.7), gc);         // out of the exit side, along the bullet
          if (Math.random() < 0.2) this.splat(e.x + Math.cos(e.ang) * rand(6, 16), e.y + Math.sin(e.ang) * rand(6, 16), rand(3, 6), gc, 0.55, e.ang);
          break;
        }
        case 'die': {
          const look = ZLOOK[e.ztype] || ZLOOK.walker;
          const acid = ACIDY[e.ztype];
          const big = e.r > 20;
          this.splat(e.x, e.y, e.r * (big ? 2.4 : 1.9), acid ? '#4e6a18' : '#4e0a08', 0.7);
          this.splat(e.x + rand(-8, 8), e.y + rand(-8, 8), e.r * 1.1, acid ? '#6a8a20' : '#6e100c', 0.6);
          const d = this.dctx, R0 = e.r, torn = e.gib && this.gore === 2;
          const bodyC = e.burn ? '#17130f' : this.ink(shade(look.body, 0.55)), headC = e.burn ? '#201a14' : this.ink(shade(look.head, 0.55)), armC = e.burn ? '#14100c' : this.ink(shade(look.arm, 0.5));
          d.save(); d.translate(e.x, e.y); d.rotate((e.ang || 0) + rand(-0.5, 0.5)); d.lineCap = 'round';
          if (this.gore > 0 && this.lk && this.lk.body) this.lk.body(this, d, e, R0, torn, acid);      // the style draws its own dead
          else if (this.gore === 0) {                       // gore off: a faint dust mark only
            d.globalAlpha = 0.25; d.fillStyle = '#3a3428'; d.beginPath(); d.ellipse(0, 0, R0, R0 * 0.8, 0, 0, TAU); d.fill();
          } else if (torn) {                           // overkill: blown apart, pieces flung around a wide pool
            for (let i = 0; i < 3; i++) { d.globalAlpha = 0.4; d.fillStyle = pickOf(acid ? BILE : BLOOD); blot(d, rand(-4, 4), rand(-4, 4), R0 * rand(1.2, 1.7), rand(1, 1.4), rand(0, TAU)); }
            for (let i = 0; i < 5; i++) {
              const a = rand(0, TAU), dd = rand(R0 * 0.8, R0 * 2.6), px = Math.cos(a) * dd, py = Math.sin(a) * dd;
              d.globalAlpha = 0.5; d.strokeStyle = pickOf(acid ? BILE : BLOOD); d.lineWidth = rand(1.2, 3);      // drag streak
              d.beginPath(); d.moveTo(px * 0.3, py * 0.3); d.lineTo(px, py); d.stroke();
              d.globalAlpha = 0.75;
              if (i === 0) { d.fillStyle = headC; d.beginPath(); d.arc(px, py, R0 * 0.42, 0, TAU); d.fill(); }
              else if (i < 3) { d.strokeStyle = armC; d.lineWidth = R0 * 0.32; const b = rand(0, TAU); d.beginPath(); d.moveTo(px, py); d.lineTo(px + Math.cos(b) * R0 * 0.8, py + Math.sin(b) * R0 * 0.8); d.stroke(); }
              else { d.fillStyle = bodyC; d.beginPath(); d.ellipse(px, py, R0 * 0.45, R0 * 0.3, a, 0, TAU); d.fill();
                d.strokeStyle = '#d8ccb4'; d.lineWidth = 1.4; d.beginPath(); d.moveTo(px - 3, py); d.lineTo(px + 4, py + 2); d.stroke(); }      // a bone end
            }
          } else {                                     // a body sprawled where it fell, arms flung out, in a pool
            for (let i = 0; i < 2; i++) { d.globalAlpha = 0.4; d.fillStyle = pickOf(acid ? BILE : BLOOD); blot(d, -R0 * 0.2 + rand(-3, 3), rand(-3, 3), R0 * rand(1, 1.3), rand(1, 1.4), rand(0, TAU)); }
            d.globalAlpha = 0.7; d.strokeStyle = armC; d.lineWidth = R0 * 0.3;
            d.beginPath(); d.moveTo(R0 * 0.1, -R0 * 0.6); d.lineTo(R0 * rand(0.6, 1.2), -R0 * rand(0.9, 1.5));
            d.moveTo(R0 * 0.1, R0 * 0.6); d.lineTo(-R0 * rand(0.1, 0.7), R0 * rand(1.1, 1.5));
            d.moveTo(-R0 * 0.6, -R0 * 0.3); d.lineTo(-R0 * 1.5, -R0 * rand(0.3, 0.7)); d.moveTo(-R0 * 0.6, R0 * 0.3); d.lineTo(-R0 * 1.45, R0 * rand(0.1, 0.6)); d.stroke();
            d.fillStyle = bodyC; blot(d, 0, 0, R0 * 0.95, 1.3, 0);                                  // a slumped, uneven heap, not an oval
            const hy = R0 * rand(-0.3, 0.3);
            d.fillStyle = headC; blot(d, R0 * 0.85, hy, R0 * 0.45, 1.1, rand(0, TAU));
            fleshSprites(); d.globalAlpha = 0.8; d.drawImage(ROT[(Math.random() * 4) | 0], -R0, -R0 * 0.75, R0 * 2, R0 * 1.5);
            d.globalAlpha = 0.45; d.fillStyle = '#0c0606'; for (let i = 0; i < 3; i++) blot(d, rand(-R0, R0) * 0.6, rand(-R0, R0) * 0.4, R0 * rand(0.15, 0.3), rand(1, 2), rand(0, TAU));     // shadowed folds
            d.globalAlpha = 0.7;
            if (!e.burn && this.gore === 2) { d.fillStyle = '#5a0b09'; d.beginPath(); d.ellipse(R0 * rand(-0.3, 0.2), R0 * rand(-0.2, 0.2), R0 * 0.3, R0 * 0.18, rand(0, 3), 0, TAU); d.fill(); }
          }
          d.restore(); d.globalAlpha = 1;
          if (!e.burn) this.pool(e.x, e.y, e.r * (big ? 2.6 : 1.7), acid ? '#4e6a18' : '#4e0a08');
          this.blood(e.x, e.y, rand(0, TAU), (big ? 60 : 18) * (e.gib ? 2.2 : 1), acid ? '#8fae2a' : '#9a1612', e.gib ? 420 : 300);
          this.gibs(e.x, e.y, (big ? 12 : e.burn ? 2 : 5) * (e.gib ? 3 : 1), look, acid);
          if (e.gib && !big) this.shake = Math.max(this.shake, 3);
          if (big) { this.shake = Math.max(this.shake, 14); this.rings.push({ x: e.x, y: e.y, r: e.r * 5, life: 0.6, max: 0.6, c: '255,80,80' }); }
          break;
        }
        case 'shrug': {          // a big zombie shakes off the lightning
          this.rings.push({ x: e.x, y: e.y, r: (e.r || 20) * 2.2, life: 0.35, max: 0.35, c: '120,200,255' });
          for (let i = 0; i < 8; i++) {
            const a = rand(0, TAU), sp = rand(120, 260);
            this.part({ k: 'spark', x: e.x, y: e.y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, life: 0.18, max: 0.18, size: 1.6, c: '#bfe6ff' });
          }
          break;
        }
        case 'levTarget':
          this.marks = this.marks || [];
          this.marks.push({ x: e.x, y: e.y, r: e.r, life: e.t, max: e.t });
          break;
        case 'spikes':          // steel spikes punch up out of the plate
          for (let i = 0; i < 6; i++) { const a = rand(0, TAU), sp = rand(40, 120); this.part({ k: 'debris', x: e.x + rand(-10, 10), y: e.y + rand(-10, 10), vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, life: 0.25, max: 0.25, size: rand(1.5, 2.5), c: '#c8ccd2' }); }
          this.rings.push({ x: e.x, y: e.y, r: 26, life: 0.2, max: 0.2, c: '220,225,235' });
          this.blood(e.x, e.y, rand(0, TAU), 6, '#9a1612', 160);
          break;
        case 'supply': {        // a supply crate parachutes into camp with the next tier of gear
          this.crate = { x: FIRE.x + 110, y: FIRE.y - 70, t: 0 };
          this.setBanner('SUPPLY DROP', 'Night ' + e.after + ' survived  ·  new gear is in the shop', '#ffd23f', 7, 'New: ' + (e.names || []).join(', '));
          break;
        }
        case 'nova':             // the Phoenix Pyre's Rekindling
          (this.novas || (this.novas = [])).push({ x: e.x, y: e.y, t: 0, speed: e.speed || 1100 });
          this.flashes.push({ x: e.x, y: e.y, r: 900, life: 0.6, max: 0.6, c: '255,220,140' });
          this.shake = Math.max(this.shake, 18);
          break;
        case 'sunOn':
          this.flashes.push({ x: e.x, y: e.y, r: 500, life: 0.5, max: 0.5, c: '255,240,190' });
          this.shake = Math.max(this.shake, 10);
          break;
        case 'hellStart':
          this.shake = Math.max(this.shake, 16);
          this.flashes.push({ x: e.x, y: e.y, r: 400, life: 0.4, max: 0.4, c: '255,140,50' });
          this.rings.push({ x: e.x, y: e.y, r: 120, life: 0.5, max: 0.5, c: '255,120,40' });
          break;
        case 'emp':
          this.rings.push({ x: e.x, y: e.y, r: e.r, life: 0.5, max: 0.5, c: '120,220,255' });
          this.rings.push({ x: e.x, y: e.y, r: e.r * 0.6, life: 0.35, max: 0.35, c: '200,245,255' });
          this.flashes.push({ x: e.x, y: e.y, r: e.r, life: 0.2, max: 0.2, c: '120,220,255' });
          break;
        case 'stomp':
          this.shake = Math.max(this.shake, 14);
          this.rings.push({ x: e.x, y: e.y, r: e.r, life: 0.45, max: 0.45, c: '200,170,120' });
          for (let i = 0; i < 18; i++) { const a = rand(0, TAU), sp = rand(80, 260); this.part({ k: 'debris', x: e.x + Math.cos(a) * 30, y: e.y + Math.sin(a) * 30, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, life: rand(0.3, 0.6), max: 0.6, size: rand(3, 6), c: Math.random() < 0.5 ? '#6e5432' : '#8a7c6a' }); }
          this.splat(e.x, e.y, 30, '#2a2014', 0.35);
          break;
        case 'crit': this.floatText(e.x, e.y - 8, 'CRIT!', '#ffd23f', false); break;
        case 'shove':
          for (let i = 0; i < 6; i++) { const a = rand(0, TAU), sp = rand(60, 140); this.part({ k: 'debris', x: e.x, y: e.y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, life: 0.3, max: 0.3, size: rand(2, 3.5), c: '#8a7c6a' }); }
          break;
        case 'squeeze': {
          for (let i = 0; i < 7; i++) { const a = rand(0, TAU), sp = rand(50, 170); this.part({ k: i < 5 ? 'debris' : 'spark', x: e.x, y: e.y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, life: 0.3, max: 0.3, size: rand(1.5, 3.2), c: i < 5 ? '#a57644' : '#ffd890' }); }
          const g = this.dctx; g.save(); g.globalAlpha = 0.5; g.strokeStyle = '#d8c8a8'; g.lineWidth = 1.1; g.translate(e.x, e.y); g.rotate(rand(0, TAU));
          for (let i = -1; i <= 1; i++) { g.beginPath(); g.moveTo(-7, i * 2.4); g.lineTo(7, i * 2.4 + rand(-1.5, 1.5)); g.stroke(); }
          g.restore();
          break;
        }
        case 'ricochet':
          for (let i = 0; i < 5; i++) { const a = rand(0, TAU), sp = rand(100, 220); this.part({ k: 'spark', x: e.x, y: e.y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, life: 0.15, max: 0.15, size: 1.5, c: '#ffe0a0' }); }
          break;
        case 'tarFire':          // a patch of tar goes up: draw it as a fire pool for as long as it burns
          this.pools.push({ x: e.x, y: e.y, r: e.r * 1.15, life: 4, max: 4, seed: Math.random() * 6 });
          if (Math.random() < 0.5) this.flashes.push({ x: e.x, y: e.y, r: e.r * 3, life: 0.25, max: 0.25, c: '255,150,60' });
          break;
        case 'napalm': {
          this.pools.push({ x: e.x, y: e.y, r: e.r, life: e.dur, max: e.dur, seed: Math.random() * 6 });
          this.flashes.push({ x: e.x, y: e.y, r: e.r * 3, life: 0.3, max: 0.3, c: '255,150,60' });
          this.rings.push({ x: e.x, y: e.y, r: e.r, life: 0.35, max: 0.35, c: '255,140,60' });
          const d = this.dctx, gr = d.createRadialGradient(e.x, e.y, 0, e.x, e.y, e.r);   // scorch mark
          gr.addColorStop(0, 'rgba(10,6,3,0.6)'); gr.addColorStop(1, 'rgba(10,6,3,0)');
          d.fillStyle = gr; d.beginPath(); d.arc(e.x, e.y, e.r, 0, TAU); d.fill();
          for (let i = 0; i < 14; i++) {
            const a = rand(0, TAU), s2 = rand(40, 200);
            this.part({ k: 'fire', x: e.x, y: e.y, vx: Math.cos(a) * s2, vy: Math.sin(a) * s2, life: rand(0.25, 0.5), max: 0.5, size: rand(6, 13) });
          }
          break;
        }
        case 'explosion': {
          const acid = e.look === 'acid';
          this.shake = Math.max(this.shake, acid ? 5 : e.look === 'big' ? 22 : 9);
          if (e.look === 'big') {                // a Leviathan shell: a mushroom of fire and a shockwave
            this.rings.push({ x: e.x, y: e.y, r: e.r * 1.6, life: 0.7, max: 0.7, c: '255,120,60' });
            for (let i = 0; i < 30; i++) { const a = rand(0, TAU), s = rand(20, 160); this.part({ k: 'smoke', x: e.x + Math.cos(a) * rand(0, e.r * 0.6), y: e.y + Math.sin(a) * rand(0, e.r * 0.6), vx: Math.cos(a) * s * 0.3, vy: Math.sin(a) * s * 0.3 - 20, life: rand(1, 2.2), max: 2.2, size: rand(14, 30) }); }
            this.splat(e.x, e.y, e.r * 0.5, '#1a1410', 0.5);
          }
          this.rings.push({ x: e.x, y: e.y, r: e.r, life: 0.35, max: 0.35, c: acid ? '190,255,90' : '255,200,120' });
          this.flashes.push({ x: e.x, y: e.y, r: e.r * 3, life: 0.25, max: 0.25, c: acid ? '170,255,90' : '255,190,110' });
          for (let i = 0; i < 26; i++) {
            const a = rand(0, TAU), s = rand(40, 300);
            this.part({ k: acid ? 'acid' : 'fire', x: e.x, y: e.y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: rand(0.25, 0.6), max: 0.6, size: rand(6, 16) });
          }
          for (let i = 0; i < 10; i++) {
            const a = rand(0, TAU), s = rand(20, 90);
            this.part({ k: 'smoke', x: e.x, y: e.y, vx: Math.cos(a) * s, vy: Math.sin(a) * s - 20, life: rand(0.7, 1.4), max: 1.4, size: rand(14, 28) });
          }
          if (acid) this.splat(e.x, e.y, e.r * 0.6, '#55701a', 0.5);
          else {
            const d = this.dctx, gr = d.createRadialGradient(e.x, e.y, 0, e.x, e.y, e.r * 0.75);
            gr.addColorStop(0, 'rgba(8,6,4,0.7)'); gr.addColorStop(1, 'rgba(8,6,4,0)');
            d.fillStyle = gr; d.beginPath(); d.arc(e.x, e.y, e.r * 0.75, 0, TAU); d.fill();
          }
          break;
        }
        case 'arc': {
          for (let i = 0; i + 1 < e.pts.length; i++) {
            const a = e.pts[i], b = e.pts[i + 1], segs = [];
            const n = Math.max(2, Math.round(Math.hypot(b.x - a.x, b.y - a.y) / 22));
            for (let k = 0; k <= n; k++) {
              const t = k / n, j = (k === 0 || k === n) ? 0 : 9;
              segs.push({ x: a.x + (b.x - a.x) * t + rand(-j, j), y: a.y + (b.y - a.y) * t + rand(-j, j) });
            }
            this.arcs.push({ segs, life: 0.13, max: 0.13 });
            this.flashes.push({ x: b.x, y: b.y, r: 90, life: 0.1, max: 0.1, c: '150,210,255' });
          }
          break;
        }
        case 'acid': {
          this.splat(e.x, e.y, 26, '#6f9a1f', 0.5);
          for (let i = 0; i < 8; i++) {
            const a = rand(0, TAU), s = rand(30, 130);
            this.part({ k: 'acid', x: e.x, y: e.y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: rand(0.2, 0.4), max: 0.4, size: rand(3, 7) });
          }
          break;
        }
        case 'hurt': {
          this.blood(e.x, e.y, rand(0, TAU), 6, '#c21a14', 200);
          this.shake = Math.max(this.shake, 3);
          break;
        }
        case 'down': this.floatText(e.x, e.y - 30, e.name + ' is down!', '#ff5a4f', true); this.splat(e.x, e.y, 22, '#7a0f0c', 0.6); break;
        case 'revive': this.floatText(e.x, e.y - 30, e.name + ' is back up!', '#7fe08f', true); break;
        case 'heal': this.floatText(e.x, e.y - 26, '+60', '#7fe08f'); break;
        case 'lift':
        case 'build': {
          for (let i = 0; i < 8; i++) {
            const a = rand(0, TAU), s = rand(30, 110);
            this.part({ k: 'smoke', x: e.x, y: e.y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: 0.35, max: 0.35, size: rand(5, 10) });
          }
          break;
        }
        case 'sell': this.floatText(e.x, e.y - 12, '+$' + GD.fmt(e.v), '#ffd23f'); break;
        case 'fireHit': {
          for (let i = 0; i < 8; i++) {
            const a = rand(0, TAU), s = rand(60, 200);
            this.part({ k: 'ember', x: FIRE.x, y: FIRE.y, vx: Math.cos(a) * s, vy: Math.sin(a) * s - 40, life: rand(0.4, 0.9), max: 0.9, size: rand(1.5, 3) });
          }
          break;
        }
        case 'fireOut': {
          this.shake = Math.max(this.shake, 8);
          for (let i = 0; i < 24; i++) {
            const a = rand(0, TAU), s = rand(20, 90);
            this.part({ k: 'smoke', x: FIRE.x, y: FIRE.y, vx: Math.cos(a) * s, vy: Math.sin(a) * s - 30, life: rand(1, 2.2), max: 2.2, size: rand(8, 16) });
          }
          break;
        }
        case 'structHit': {
          if (e.gore) { this.blood(e.x, e.y, rand(0, TAU), 5, '#9a1612', 160); break; }
          if (e.big) this.shake = Math.max(this.shake, 6);
          for (let i = 0; i < (e.big ? 12 : 3); i++) {
            const a = rand(0, TAU), s = rand(40, 140);
            this.part({ k: 'debris', x: e.x, y: e.y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: 0.3, max: 0.3, size: rand(2, 4), c: '#a57644' });
          }
          break;
        }
        case 'structDie': {
          for (let i = 0; i < 14; i++) {
            const a = rand(0, TAU), s = rand(60, 240);
            this.part({ k: 'debris', x: e.x, y: e.y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: rand(0.3, 0.6), max: 0.6, size: rand(3, 6), c: e.id === 'wood' ? '#8a6238' : '#7a838e' });
          }
          this.shake = Math.max(this.shake, 4);
          break;
        }
        case 'slam': {
          this.shake = Math.max(this.shake, 18);
          this.rings.push({ x: e.x, y: e.y, r: e.r, life: 0.45, max: 0.45, c: '255,90,90' });
          break;
        }
        case 'nightStart': {
          this.crate = null;
          const fc = sim.forecast;
          const blood = fc && fc.blood;
          // a slower, longer title card: the night's details sink in before the first one shows up
          const SN = { N: 'north', E: 'east', S: 'south', W: 'west' };
          let detail = '';
          if (fc) {
            const sides = (fc.sides || []).map((x) => SN[x] || x);
            const kinds = (fc.types || []).filter((t, i, a) => GD.ZOMBIES[t] && a.indexOf(t) === i).map((t) => GD.ZOMBIES[t].name);
            detail = (sides.length ? 'From the ' + (sides.length > 1 ? sides.slice(0, -1).join(', ') + ' and ' + sides[sides.length - 1] : sides[0]) : '') +
              (kinds.length ? (sides.length ? '  ·  ' : '') + kinds.join(', ') : '');
          }
          const pitchB = fc && fc.dark;
          this.setBanner(blood ? 'BLOOD MOON' : pitchB ? 'PITCH BLACK' : 'NIGHT ' + e.night,
            blood ? 'Night ' + e.night + ': more of them, and faster' : pitchB ? 'Night ' + e.night + ': no moon. You will not see them coming.' : e.night % 5 === 0 ? 'Something huge is out there...' : (fc && fc.fresh && fc.fresh.length ? 'Something new is out there: ' + GD.ZOMBIES[fc.fresh[0]].name : 'They are coming.'), pitchB ? '#b9c4ff' : '#ff5a4f', 6.5, detail);
          break;
        }
        case 'dawn':
          if (e.first) this.setBanner('PREPARE', 'Buy, build, then press READY when you are set', '#ffd23f');
          else this.setBanner('DAWN', 'Night ' + (e.night - 1) + ' survived  ·  +$' + GD.fmt(e.bonus) + ' each  ·  all structures repaired', '#ffd23f', 4.8);
          break;
        case 'boss': this.floatText(W / 2, 250, 'ABOMINATION from the ' + e.side + '!', '#ff5a4f', true); break;
        case 'wyrm':
          if (e.ztype === 'gorewyrm') this.setBanner('GOREWYRM', 'Something vast and raw is dragging itself in from the ' + e.side + '. Every piece you cut off spills Crawlers.', '#ff5a4f', 6);
          else this.setBanner('BONEWYRM', 'Something huge is crawling in from the ' + e.side + '. Shoot it apart!', '#efe2c0');
          this.shake = Math.max(this.shake, e.ztype === 'gorewyrm' ? 14 : 10);
          break;
        case 'sever': {
          this.shake = Math.max(this.shake, 8);
          this.rings.push({ x: e.x, y: e.y, r: 70, life: 0.45, max: 0.45, c: '255,90,60' });
          this.flashes.push({ x: e.x, y: e.y, r: 160, life: 0.2, max: 0.2, c: '255,120,80' });
          this.blood(e.x, e.y, rand(0, TAU), e.gore ? 90 : 40, '#9a1612', e.gore ? 460 : 340);
          if (e.gore) { this.blood(e.x, e.y, rand(0, TAU), 60, '#6a0a06', 300); this.splat(e.x, e.y, 70, '#3a0604', 0.85); }
          this.gibs(e.x, e.y, e.gore ? 22 : 10, e.gore ? ZLOOK.goreseg : ZLOOK.wyrmseg);
          this.splat(e.x, e.y, 30, '#4e0a08', 0.75);
          this.floatText(e.x, e.y - 30, e.left ? 'SEVERED!  ' + e.left + ' left' : 'ONLY THE HEAD LEFT!', '#ffb070', e.left === 0);
          break;
        }
        case 'wyrmDie':
          this.shake = Math.max(this.shake, 16);
          this.rings.push({ x: e.x, y: e.y, r: 140, life: 0.7, max: 0.7, c: '255,80,60' });
          this.gibs(e.x, e.y, e.gore ? 34 : 16, e.gore ? ZLOOK.gorewyrm : ZLOOK.wyrm);
          if (e.gore) { this.blood(e.x, e.y, rand(0, TAU), 120, '#9a1612', 520); this.splat(e.x, e.y, 110, '#3a0604', 0.9); }
          this.floatText(e.x, e.y - 40, e.gore ? 'GOREWYRM DOWN' : 'BONEWYRM DOWN', '#ffd23f', true);
          break;
        case 'raise': {
          // violet beams from the Gravecaller to every body it lifts, and the dead clawing up out of the ground
          for (const pt of e.pts || []) {
            const segs = [];
            for (let k = 0; k <= 6; k++) { const f = k / 6, j = k === 0 || k === 6 ? 0 : 12; segs.push({ x: e.x + (pt[0] - e.x) * f + rand(-j, j), y: e.y + (pt[1] - e.y) * f + rand(-j, j) }); }
            this.arcs.push({ segs, life: 0.45, max: 0.45, c: '170,110,255' });
            this.rings.push({ x: pt[0], y: pt[1], r: 34, life: 0.6, max: 0.6, c: '170,110,255' });
            for (let i = 0; i < 6; i++) this.part({ k: 'debris', x: pt[0] + rand(-8, 8), y: pt[1] + rand(-8, 8), vx: rand(-60, 60), vy: rand(-90, -20), life: 0.5, max: 0.5, size: rand(2, 3.5), c: '#4a3a2a' });
          }
          this.rings.push({ x: e.x, y: e.y, r: 60, life: 0.5, max: 0.5, c: '200,160,255' });
          this.floatText(e.x, e.y - 34, 'RISE!', '#c8a0ff', false);
          break;
        }
        case 'elite': if (GD.ZOMBIES[e.ztype]) this.floatText(W / 2, 290, GD.ZOMBIES[e.ztype].name.toUpperCase() + ' from the ' + e.side + '!', '#ff9a6e', true); break;
        case 'scream':
          this.rings.push({ x: e.x, y: e.y, r: e.r, life: 0.55, max: 0.55, c: '255,120,170' });
          this.rings.push({ x: e.x, y: e.y, r: e.r * 0.6, life: 0.4, max: 0.4, c: '255,200,220' });
          this.shake = Math.max(this.shake, 3);
          break;
        case 'leap':
        case 'land':
          for (let i = 0; i < 7; i++) {
            const a = rand(0, TAU), sp = rand(30, 90);
            this.part({ k: 'smoke', x: e.x, y: e.y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, life: 0.35, max: 0.35, size: rand(4, 8) });
          }
          break;
        case 'surface': {
          this.shake = Math.max(this.shake, 5);
          const d = this.dctx, gr = d.createRadialGradient(e.x, e.y, 0, e.x, e.y, 30);
          gr.addColorStop(0, 'rgba(30,20,10,0.8)'); gr.addColorStop(1, 'rgba(30,20,10,0)');
          d.fillStyle = gr; d.beginPath(); d.arc(e.x, e.y, 30, 0, TAU); d.fill();
          for (let i = 0; i < 22; i++) {
            const a = rand(0, TAU), sp = rand(60, 240);
            this.part({ k: 'debris', x: e.x, y: e.y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, life: rand(0.3, 0.6), max: 0.6, size: rand(2, 5), c: Math.random() < 0.5 ? '#6e5432' : '#4a3820' });
          }
          this.rings.push({ x: e.x, y: e.y, r: 60, life: 0.35, max: 0.35, c: '200,160,100' });
          break;
        }
        case 'charge':
          this.shake = Math.max(this.shake, 6);
          this.rings.push({ x: e.x, y: e.y, r: 90, life: 0.4, max: 0.4, c: '255,110,60' });
          break;
        case 'split': this.splat(e.x, e.y, 26, '#6a2a64', 0.6); this.blood(e.x, e.y, 0, 20, '#c070b8', 260); break;
        case 'brood': this.splat(e.x, e.y, 18, '#4e6a18', 0.55); this.blood(e.x, e.y, 0, 10, '#8fae2a', 180); break;
      }
    }

    updateFx(dt, sim) {
      if (this.lk && this.lk.tick) this.lk.tick(this, dt);
      this.time += dt;
      this.shake = Math.max(0, this.shake - dt * 40);
      const pitch = sim.phase === 'night' && !!(sim.forecast && sim.forecast.dark);
      const target = sim.phase === 'night' ? (pitch ? 0.95 : 0.8) : sim.phase === 'over' ? 0.72 : sim.phase === 'lobby' ? 0.5 : 0.04;
      this.dark += (target - this.dark) * Math.min(1, dt * 0.55);
      const ps = this.parts;
      let k = 0;
      for (let i = 0; i < ps.length; i++) {
        const p = ps[i];
        p.life -= dt;
        p.x += p.vx * dt; p.y += p.vy * dt;
        const drag = p.k === 'smoke' ? 2 : p.k === 'spark' ? 1 : 5;
        if (p.spin) p.rot += p.spin * dt;
        const f = Math.exp(-drag * dt);
        p.vx *= f; p.vy *= f;
        if (p.life <= 0) {
          if (p.k === 'blood' && this.lk && this.lk.splat) { /* the style leaves its own marks */ }
          else if (p.k === 'blood') { const d = this.dctx; d.globalAlpha = rand(0.5, 0.85); d.fillStyle = p.c; drop(d, p.x, p.y, p.size * rand(1.6, 3.4), p.size * 0.75, Math.atan2(p.vy, p.vx)); d.globalAlpha = 1; }
          else if (p.k === 'gib') {
            const d = this.dctx;
            // a chunk skids to a stop: a dark smear dragged along its path, and the lump itself at the far end
            const ga = Math.atan2(p.vy, p.vx), ca = Math.cos(ga), sa = Math.sin(ga), L = p.size * rand(2.5, 4.5);
            d.globalAlpha = 0.7; d.fillStyle = pickOf(BLOOD); drop(d, p.x - ca * L * 0.3, p.y - sa * L * 0.3, L, p.size * 0.8, ga);
            d.globalAlpha = 0.5; d.fillStyle = '#1c0303'; blot(d, p.x, p.y, p.size * 1.1, 1.3, ga);
            if (p.c === '#a89c84') {                                               // a splinter of bone, half sunk in the mess
              d.globalAlpha = 0.7; d.strokeStyle = '#8a7e68'; d.lineWidth = 1.2; d.lineCap = 'butt';
              d.beginPath(); d.moveTo(p.x - Math.cos(p.rot) * p.size * 0.8, p.y - Math.sin(p.rot) * p.size * 0.8); d.lineTo(p.x + Math.cos(p.rot) * p.size * 0.8, p.y + Math.sin(p.rot) * p.size * 0.8); d.stroke();
            } else {
              d.globalAlpha = 0.9; d.fillStyle = Math.random() < 0.5 ? '#3d0c0a' : '#4a1512'; blot(d, p.x, p.y, p.size * 0.7, rand(1, 1.5), p.rot);      // raw, dark meat
              d.globalAlpha = 0.25; d.fillStyle = '#c08a80'; d.fillRect(p.x - 0.8, p.y - 0.8, 1.2, 1.2);                                            // one wet glint
            }
            d.globalAlpha = 1;
          }
          else if (p.k === 'shell') { const d = this.dctx; d.save(); d.translate(p.x, p.y); d.rotate(p.rot); d.fillStyle = '#b89a3c'; d.globalAlpha = 0.8; d.fillRect(-2, -1, 4, 2); d.restore(); d.globalAlpha = 1; }
          continue;
        }
        ps[k++] = p;
      }
      ps.length = k;
      const age = (arr) => { let n = 0; for (let i = 0; i < arr.length; i++) { arr[i].life -= dt; if (arr[i].life > 0) arr[n++] = arr[i]; } arr.length = n; };
      age(this.arcs); age(this.rings); age(this.flashes); age(this.pools); if (this.marks) age(this.marks);
      if (this.bpools && this.bpools.length) {
        const d = this.dctx;
        for (const b of this.bpools) {
          b.t += dt; if (b.t < 0.14) continue; b.t = 0;
          b.r += (b.max - b.r) * 0.16;
          if (Math.random() < 0.5) {                 // the edge creeps unevenly: runnels and small lobes break the outline
            const a = rand(0, TAU), rr = b.r * b.seed[Math.floor(a / TAU * 9) % 9];
            d.globalAlpha = 0.5; d.fillStyle = b.c; blot(d, b.x + Math.cos(a) * rr * 0.95, b.y + Math.sin(a) * rr * 0.8, rand(1.5, 4.5), rand(1.3, 2.4), a);
          }
          // thin and reddish at the creeping edge, thick and near-black in the middle
          for (const [k, al, colr] of [[1, 0.16, b.c], [0.8, 0.13, b.dark], [0.5, 0.16, b.dark]]) {
            d.globalAlpha = al; d.fillStyle = colr; d.beginPath();
            for (let i = 0; i <= 9; i++) { const a = i / 9 * TAU, rr = b.r * k * b.seed[i % 9], px = b.x + Math.cos(a) * rr, py = b.y + Math.sin(a) * rr * 0.85;
              if (!i) d.moveTo(px, py); else { const a0 = (i - 0.5) / 9 * TAU, r0 = b.r * k * (b.seed[i % 9] + b.seed[(i - 1) % 9]) * 0.56; d.quadraticCurveTo(b.x + Math.cos(a0) * r0, b.y + Math.sin(a0) * r0 * 0.85, px, py); } }
            d.fill();
          }
        }
        d.globalAlpha = 1;
        for (const b of this.bpools) {
          if (b.max - b.r > 0.6) continue;             // settled: blood dries from the edge in, leaving a darker rim
          d.globalAlpha = 0.4; d.strokeStyle = b.dark; d.lineWidth = 1.4; d.beginPath();
          for (let i = 0; i <= 9; i++) { const a = i / 9 * TAU, rr = b.r * b.seed[i % 9], px = b.x + Math.cos(a) * rr, py = b.y + Math.sin(a) * rr * 0.85;
            if (!i) d.moveTo(px, py); else { const a0 = (i - 0.5) / 9 * TAU, r0 = b.r * (b.seed[i % 9] + b.seed[(i - 1) % 9]) * 0.56; d.quadraticCurveTo(b.x + Math.cos(a0) * r0, b.y + Math.sin(a0) * r0 * 0.85, px, py); } }
          d.stroke();
          d.globalAlpha = 0.09; d.fillStyle = '#ffb4a8'; d.beginPath(); d.ellipse(b.x - b.r * 0.2, b.y - b.r * 0.25, b.r * 0.3, b.r * 0.08, -0.5, 0, TAU); d.fill();      // still wet in the middle
        }
        d.globalAlpha = 1;
        this.bpools = this.bpools.filter((b) => b.max - b.r > 0.6);
      }
      this.dryT = (this.dryT || 0) + dt;
      if (this.dryT > 1.5) {                       // drying: everything on the ground slowly turns darker and browner
        this.dryT = 0;
        const d = this.dctx; d.save(); d.globalCompositeOperation = 'source-atop'; d.globalAlpha = 0.03; d.fillStyle = '#1c0d08'; d.fillRect(0, 0, W, H); d.restore();
      }
      if (this.novas) { for (const n of this.novas) n.t += dt; this.novas = this.novas.filter((n) => n.t * n.speed < PHOENIX_R + 200); }
      if (this.crate) {
        const was = this.crate.t; this.crate.t += dt;
        if (was < 2.2 && this.crate.t >= 2.2) {                                    // touchdown
          this.shake = Math.max(this.shake, 6);
          this.rings.push({ x: this.crate.x, y: this.crate.y, r: 50, life: 0.4, max: 0.4, c: '255,220,120' });
          for (let i = 0; i < 12; i++) { const a = rand(0, TAU), sp = rand(40, 140); this.part({ k: 'smoke', x: this.crate.x, y: this.crate.y + 10, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp * 0.5, life: rand(0.5, 1), max: 1, size: rand(6, 12) }); }
        }
      }
      if (sim.structs) for (const s of sim.structs) {           // Sunlance: glide the beam, scorch the ground, throw sparks
        if (s.id !== 'sunlance' || s.bx === undefined) continue;
        if (s.tbx !== undefined) { const k = Math.min(1, dt * 8); s.bx += (s.tbx - s.bx) * k; s.by += (s.tby - s.by) * k; }
        if (!s.beam) continue;
        this.shake = Math.max(this.shake, 2);
        if (Math.random() < dt * 20) this.splat(s.bx + rand(-50, 50), s.by + rand(-50, 50), rand(8, 16), '#1a120a', 0.25);
        for (let i = 0; i < 3; i++) { const a = rand(0, TAU), sp = rand(80, 260); this.part({ k: 'spark', x: s.bx + Math.cos(a) * 30, y: s.by + Math.sin(a) * 30, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, life: 0.25, max: 0.25, size: 2, c: '#fff0b0' }); }
      }
      if (sim.structs) for (const s of sim.structs) {
        if (s.id !== 'hellmouth' || !s.fire) continue;
        this.shake = Math.max(this.shake, 4);
        const L = GD.STRUCTS.hellmouth.reach;
        for (let i = 0; i < 6; i++) {
          const d = rand(40, L), a = (s.ang || 0) + rand(-0.15, 0.15), sp = rand(60, 220);
          this.part({ k: 'fire', x: s.x + Math.cos(a) * d, y: s.y + Math.sin(a) * d, vx: Math.cos(a) * sp + rand(-30, 30), vy: Math.sin(a) * sp + rand(-50, 10), life: rand(0.25, 0.6), max: 0.6, size: rand(8, 20) });
        }
      }
      for (const pl of this.pools) {
        if (Math.random() < dt * 22) {
          const a = rand(0, TAU), d = Math.sqrt(Math.random()) * pl.r * 0.9;
          this.part({ k: 'fire', x: pl.x + Math.cos(a) * d, y: pl.y + Math.sin(a) * d, vx: rand(-10, 10), vy: rand(-55, -20), life: rand(0.3, 0.55), max: 0.55, size: rand(6, 12) });
        }
      }
      for (const t of this.texts) t.y -= dt * (t.big ? 14 : 34);
      age(this.texts);
      if (this.banner) { this.banner.life -= dt; if (this.banner.life <= 0) this.banner = null; }
      // let old gore sink into the ground very slowly
      this.fadeT += dt;
      if (this.fadeT > 3) {
        this.fadeT = 0;
        const d = this.dctx;
        d.globalCompositeOperation = 'destination-out'; d.fillStyle = 'rgba(0,0,0,0.02)'; d.fillRect(0, 0, W, H);
        d.globalCompositeOperation = 'source-over';
      }
      // ambient emitters
      if (Math.random() < dt * 14) {
        this.part({ k: 'ember', x: FIRE.x + rand(-8, 8), y: FIRE.y + rand(-8, 8), vx: rand(-14, 14), vy: rand(-70, -30), life: rand(0.6, 1.5), max: 1.5, size: rand(1, 2.4) });
      }
      for (const z of sim.zombies) {
        if (z.burrowed) {
          // dirt flicked up off the sides of the ridge
          if (Math.random() < dt * 16) {
            const side = Math.random() < 0.5 ? -1 : 1, a = (z.ang || 0) + side * rand(1.2, 2.2), sp = rand(40, 110);
            this.part({ k: 'debris', x: z.x + Math.cos(a) * 10, y: z.y + Math.sin(a) * 10, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, life: 0.35, max: 0.35, size: rand(1.5, 3.2), c: Math.random() < 0.5 ? '#6e5432' : '#8a6d44' });
          }
          this.furrow(z);
          continue;
        }
        z._fx = undefined;
        if ((z.type === 'gorewyrm' || (z.type === 'goreseg' && z.id % 2 === 0)) && Math.random() < dt * 9) this.splat(z.x + rand(-z.r, z.r) * 0.5, z.y + rand(-z.r, z.r) * 0.5, rand(4, 9), '#5a0b09', 0.5);
        if (z.hp < z.maxhp * 0.5 && Math.random() < dt * 4) this.splat(z.x + rand(-4, 4), z.y + rand(-4, 4), rand(2, 4.5), ACIDY[z.type] ? '#4e6a18' : '#5a0b09', 0.6);
        if (z.burn > 0 && Math.random() < dt * 14) {
          this.part({ k: 'fire', x: z.x + rand(-z.r, z.r) * 0.6, y: z.y + rand(-z.r, z.r) * 0.6, vx: rand(-15, 15), vy: rand(-50, -15), life: 0.35, max: 0.35, size: rand(5, 10) });
        }
      }
      for (const b of sim.bullets) {
        if (b.kind === 'flame' && Math.random() < 0.3) this.part({ k: 'fire', x: b.x, y: b.y, vx: b.vx * 0.3, vy: b.vy * 0.3, life: 0.18, max: 0.18, size: b.r * 1.1 });
        else if ((b.kind === 'grenade' || b.kind === 'shell') && Math.random() < 0.6) this.part({ k: 'smoke', x: b.x, y: b.y, vx: 0, vy: 0, life: 0.3, max: 0.3, size: 5 });
      }
    }

    // ---------------------------------------------------------- entities
    drawStruct(c, s, alpha, noBase) {
      if (this.lk && this.lk.struct && this.lk.struct(this, c, s, alpha, noBase)) return;
      const def = GD.STRUCTS[s.id];
      c.globalAlpha = alpha === undefined ? 1 : alpha;
      if (!noBase) c.drawImage(this.sprite(s.id), s.cx * CELL, s.cy * CELL, CELL, CELL);
      if (s.id === 'phoenix') {               // its flame grows with the charge and blazes white-gold when ready
        const k = alpha === undefined ? (s.chargeK || 0) : 0.3, t = this.time;
        c.save(); c.globalCompositeOperation = 'lighter';
        for (let i = 0; i < 4; i++) {
          const h = (6 + 16 * k) * (1 - i * 0.2) * (1 + 0.15 * Math.sin(t * (9 + i) + i));
          c.fillStyle = ['rgba(200,60,20,0.5)', 'rgba(255,130,40,0.55)', 'rgba(255,200,90,0.6)', 'rgba(255,245,210,0.8)'][i];
          c.beginPath(); c.ellipse(s.x, s.y - h * 0.4, (5 + 6 * k) * (1 - i * 0.18), h, 0, 0, TAU); c.fill();
        }
        if (k >= 1 && alpha === undefined) { c.fillStyle = 'rgba(255,230,150,' + (0.15 + 0.1 * Math.sin(t * 6)) + ')'; c.beginPath(); c.arc(s.x, s.y, 34, 0, TAU); c.fill(); }
        c.restore();
      }
      if (s.id === 'ward' && alpha === undefined && this.showOwners) {   // by day: the area it keeps clear
        c.strokeStyle = 'rgba(232,224,204,0.25)'; c.lineWidth = 1.5; c.setLineDash([4, 8]);
        c.beginPath(); c.arc(s.x, s.y, def.wardR * CELL, 0, TAU); c.stroke(); c.setLineDash([]);
      }
      if (s.id === 'sunlance' && alpha === undefined && s.beam && s.bx !== undefined) {   // targeting line up to the beam
        c.strokeStyle = 'rgba(255,230,150,0.35)'; c.lineWidth = 1.2; c.setLineDash([2, 6]);
        c.beginPath(); c.moveTo(s.x, s.y); c.lineTo(s.bx, s.by); c.stroke(); c.setLineDash([]);
      }
      if (s.id === 'hellmouth') {
        if (alpha === undefined && s.aiming) {
          this.drawArc(c, s.x, s.y, s.ang || 0, def, 0.95);
          c.font = 'bold 14px "Segoe UI", sans-serif'; c.textAlign = 'center';
          const t = 'AIMING: point where it should breathe fire, click to lock';
          c.fillStyle = '#000'; c.fillText(t, s.x + 1, s.y - 35); c.fillStyle = '#ffcf9a'; c.fillText(t, s.x, s.y - 36);
        } else if (alpha === undefined && s.face !== undefined) this.drawArc(c, s.x, s.y, s.face, def, this.showOwners ? 0.4 : 0.14);
        if (alpha === undefined && !s.fire) {                  // charge ring: fills up, glows hotter when nearly ready
          const k = s.chargeK || 0;
          c.strokeStyle = 'rgba(0,0,0,0.5)'; c.lineWidth = 5; c.beginPath(); c.arc(s.x, s.y, 24, 0, TAU); c.stroke();
          c.strokeStyle = k >= 1 ? `rgba(255,${180 + 60 * Math.sin(this.time * 10)},80,1)` : `rgba(255,${90 + 100 * k},30,0.95)`; c.lineWidth = 3;
          c.beginPath(); c.arc(s.x, s.y, 24, -Math.PI / 2, -Math.PI / 2 + TAU * k); c.stroke();
        }
        c.save(); c.translate(s.x, s.y); c.rotate(s.ang || 0);
        const heat = s.fire ? 1 : (s.chargeK || 0);
        c.fillStyle = '#1c1410'; c.beginPath(); c.moveTo(4, -9); c.lineTo(30, -15); c.lineTo(30, 15); c.lineTo(4, 9); c.closePath(); c.fill();   // flared nozzle
        c.fillStyle = `rgba(255,${80 + 120 * heat},20,${0.35 + 0.6 * heat})`; c.fillRect(26, -13, 4, 26);
        c.fillStyle = '#4a2c1c'; c.beginPath(); c.arc(0, 0, 14, 0, TAU); c.fill();
        c.fillStyle = `rgba(255,${100 + 120 * heat},40,1)`; c.beginPath(); c.arc(0, 0, 4 + 2 * heat, 0, TAU); c.fill();
        c.restore();
      }
      if (s.id === 'gravity') {               // a turning spiral and a glowing core; the pull field shimmers around it
        const t = this.time;
        c.save(); c.translate(s.x, s.y);
        if (alpha === undefined) {
          c.strokeStyle = 'rgba(150,100,255,' + (0.1 + 0.05 * Math.sin(t * 3)) + ')'; c.lineWidth = 2; c.setLineDash([3, 9]); c.lineDashOffset = t * 30;
          c.beginPath(); c.arc(0, 0, def.range, 0, TAU); c.stroke(); c.setLineDash([]);
        }
        c.rotate(-t * 2.4);
        for (let k = 0; k < 3; k++) {
          c.rotate(TAU / 3);
          c.strokeStyle = 'rgba(190,150,255,0.85)'; c.lineWidth = 2.2;
          c.beginPath(); for (let i = 0; i <= 12; i++) { const a = i * 0.32, r = 2 + i * 1.1; i ? c.lineTo(Math.cos(a) * r, Math.sin(a) * r) : c.moveTo(Math.cos(a) * r, Math.sin(a) * r); } c.stroke();
        }
        c.fillStyle = '#f0e0ff'; c.beginPath(); c.arc(0, 0, 3.4, 0, TAU); c.fill();
        c.restore();
      }
      if (s.id === 'leviathan') {
        if (alpha === undefined && s.aiming) {
          this.drawArc(c, s.x, s.y, s.ang || 0, def, 0.95);
          c.font = 'bold 14px "Segoe UI", sans-serif'; c.textAlign = 'center';
          const t = 'AIMING: point where it should fire, click to lock';
          c.fillStyle = '#000'; c.fillText(t, s.x + 1, s.y - 35); c.fillStyle = '#ffcf9a'; c.fillText(t, s.x, s.y - 36);
        } else if (alpha === undefined && s.face !== undefined) this.drawArc(c, s.x, s.y, s.face, def, this.showOwners ? 0.45 : 0.18);
        c.save(); c.translate(s.x, s.y); c.rotate(s.ang || 0);
        const kick = s.flash > 0 ? -7 * (s.flash / 0.25) : 0;
        c.fillStyle = '#16181c'; c.fillRect(-4 + kick, -8, 44, 16);                 // barrel
        c.fillStyle = '#2a2e34'; c.fillRect(-4 + kick, -8, 44, 3);
        c.fillStyle = '#0a0b0d'; c.fillRect(36 + kick, -10, 9, 20);                  // muzzle brake
        c.fillStyle = '#ff5a3c'; c.fillRect(30 + kick, -8, 2, 16);
        c.fillStyle = '#4a3a34'; c.beginPath(); c.arc(0, 0, 13, 0, TAU); c.fill();     // turret ring
        c.fillStyle = '#ff7a3c'; c.beginPath(); c.arc(0, 0, 3.5, 0, TAU); c.fill();
        c.restore();
      }
      if (s.id === 'turret' || s.id === 'cannon' || s.id === 'napalm') {
        c.save(); c.translate(s.x, s.y); c.rotate(s.ang || 0);
        const kick = s.flash > 0 ? -2 : 0;
        if (s.id === 'napalm') {
          c.fillStyle = '#20242a'; c.fillRect(0 + kick, -6.5, 17, 13);           // stubby launch tube
          c.fillStyle = '#ff7a3c'; c.fillRect(13 + kick, -6.5, 3, 13);
          c.fillStyle = '#7a3a22'; c.beginPath(); c.ellipse(-6, 0, 7, 9.5, 0, 0, TAU); c.fill();   // fuel tank
          c.fillStyle = '#ffb54a'; c.fillRect(-9, -1.5, 6, 3);
          c.fillStyle = '#8c7a62'; c.beginPath(); c.arc(2, 0, 6, 0, TAU); c.fill();
        } else if (s.id === 'turret') {
          c.fillStyle = '#20242a'; c.fillRect(2 + kick, -5, 20, 3.5); c.fillRect(2 + kick, 1.5, 20, 3.5);
          c.fillStyle = '#7d8894'; c.beginPath(); c.arc(0, 0, 9, 0, TAU); c.fill();
          c.fillStyle = '#4fb4ff'; c.fillRect(-4, -2, 5, 4);
        } else {
          c.fillStyle = '#20242a'; c.fillRect(0 + kick, -5.5, 24, 11);
          c.fillStyle = '#3a3026'; c.fillRect(19 + kick, -6.5, 6, 13);
          c.fillStyle = '#8c7a62'; c.beginPath(); c.arc(0, 0, 10.5, 0, TAU); c.fill();
          c.fillStyle = '#ff9d3c'; c.fillRect(-5, -2, 5, 4);
        }
        c.restore();
      } else if (def.gun) {
        const gun = s.gun || def.gun, gl = GUNLOOK[gun] || GUNLOOK.pistol, kick = s.flash > 0 ? -2.5 : 0;
        c.save(); c.translate(s.x, s.y); c.rotate(s.ang || 0);
        c.fillStyle = gl.c; c.fillRect(-4 + kick, -gl.w / 2, gl.len + 6, gl.w);
        c.fillStyle = 'rgba(255,255,255,0.15)'; c.fillRect(-4 + kick, -gl.w / 2, gl.len + 6, 1.2);
        c.fillStyle = '#6a7686'; c.beginPath(); c.arc(0, 0, 7, 0, TAU); c.fill();
        c.restore();
        if (alpha === undefined) {
          const w = GD.WEAPONS[gun];
          if (w && this.showOwners) {     // daytime: label which gun each turret fires
            const nm = def.name.replace(' Turret', '');
            c.font = 'bold 11px "Segoe UI", sans-serif'; c.textAlign = 'center';
            c.fillStyle = '#000'; c.fillText(nm, s.x + 1, s.y + 32); c.fillStyle = '#ffd9a0'; c.fillText(nm, s.x, s.y + 31);
          }
          // gun turrets are belt-fed (never reload), so the only bar is health, drawn below every structure
        }
      } else if (def.husk) {
        // a dead, cracked length of Bonewyrm lying on its side, legs curled
        const rot = (s.uid * 2.399) % TAU, r = 17, dmg = 1 - clamp(s.hp / s.maxhp, 0, 1);
        c.save(); c.translate(s.x, s.y); c.rotate(rot);
        c.strokeStyle = '#5e4a32'; c.lineWidth = 2.2;
        for (const side of [-1, 1]) for (const k of [-0.4, 0.4]) {
          c.beginPath(); c.moveTo(k * r, side * r * 0.6); c.lineTo(k * r - 4, side * r * 1.15); c.lineTo(k * r + 3, side * r * 1.05); c.stroke();
        }
        c.fillStyle = '#4a1a12'; c.beginPath(); c.ellipse(0, 0, r * 1.15, r * 0.95, 0, 0, TAU); c.fill();
        const gr = c.createLinearGradient(0, -r, 0, r);
        gr.addColorStop(0, '#6e604a'); gr.addColorStop(0.5, '#a8987a'); gr.addColorStop(1, '#5e5040');
        c.fillStyle = gr;
        c.beginPath(); c.ellipse(-r * 0.35, 0, r * 0.6, r * 0.9, 0, 0, TAU); c.fill();
        c.beginPath(); c.ellipse(r * 0.4, 0, r * 0.55, r * 0.85, 0, 0, TAU); c.fill();
        c.strokeStyle = 'rgba(30,16,8,0.6)'; c.lineWidth = 1.4;
        c.beginPath(); c.moveTo(r * 0.3, -r * 0.7); c.lineTo(r * 0.5, -r * 0.1); c.lineTo(r * 0.25, r * 0.5); c.stroke();
        if (dmg > 0.3) {                                // chewed: raw meat showing through
          c.fillStyle = 'rgba(150,20,14,' + Math.min(0.9, dmg) + ')';
          c.beginPath(); c.ellipse(0, r * 0.1, r * 0.45 * dmg + 3, r * 0.35 * dmg + 2, 0.5, 0, TAU); c.fill();
        }
        c.restore();
      } else if (s.id === 'mine') {
        if (Math.sin(this.time * 6 + s.uid) > 0.4) { c.fillStyle = '#ff3b30'; c.beginPath(); c.arc(s.x, s.y, 2.6, 0, TAU); c.fill(); }
      } else if (s.id === 'lure') {
        if (alpha === undefined) {
          for (let i = 0; i < 3; i++) {
            const t = (this.time * 0.8 + i / 3) % 1;
            c.strokeStyle = `rgba(255,214,120,${0.45 * (1 - t)})`; c.lineWidth = 2;
            c.beginPath(); c.arc(s.x, s.y, 16 + t * 70, -0.9, 0.9); c.stroke();
            c.beginPath(); c.arc(s.x, s.y, 16 + t * 70, Math.PI - 0.9, Math.PI + 0.9); c.stroke();
          }
          if (Math.sin(this.time * 8) > 0) { c.fillStyle = '#ff3b30'; c.beginPath(); c.arc(s.x + 14, s.y - 13, 2.2, 0, TAU); c.fill(); }
        }
      } else if (s.id === 'medic') {
        c.strokeStyle = 'rgba(80,220,130,' + (0.18 + 0.1 * Math.sin(this.time * 2)) + ')'; c.lineWidth = 2;
        c.beginPath(); c.arc(s.x, s.y, def.range, 0, TAU); c.stroke();
      }
      if (alpha === undefined && this.showOwners) {
        c.fillStyle = this.ownerColor(s.owner); c.fillRect(s.cx * CELL + 2, s.cy * CELL + 2, 5, 5);
      }
      if (s.hitT > 0 && alpha === undefined) { c.globalAlpha = 0.5; c.fillStyle = '#fff'; c.fillRect(s.cx * CELL + 2, s.cy * CELL + 2, CELL - 4, CELL - 4); }
      c.globalAlpha = 1;
    }
    ownerColor(id) {
      const p = this.simRef && this.simRef.getPlayer(id);
      return p ? p.color : '#888';
    }
    // A Burrower underground: the ground heaving up into a ridge of cracked soil plates around a split, a bow wave of
    // clods rolling ahead of it, and bone claws punching up through the crack every so often.
    // the supply crate: falls under a parachute for 2.2 s, thumps down in a puff of dust, then glows until night
    drawCrate(c, cr) {
      const FALL = 2.2, k = Math.min(1, cr.t / FALL), drop = (1 - k) * (1 - k) * 520;
      const x = cr.x + Math.sin(cr.t * 2.2) * 14 * (1 - k), y = cr.y - drop;
      if (k < 1) {
        c.fillStyle = 'rgba(0,0,0,' + (0.15 + 0.25 * k) + ')'; c.beginPath(); c.ellipse(cr.x + 4, cr.y + 14, 22 * (0.5 + 0.5 * k), 10 * (0.5 + 0.5 * k), 0, 0, TAU); c.fill();
        c.strokeStyle = 'rgba(230,230,230,0.8)'; c.lineWidth = 1.2;                 // shroud lines
        for (const o of [-26, -10, 10, 26]) { c.beginPath(); c.moveTo(x + o, y - 70); c.lineTo(x + (o > 0 ? 12 : -12), y - 14); c.stroke(); }
        for (let i = 0; i < 4; i++) {                                             // striped canopy
          c.fillStyle = i % 2 ? '#f4f0e6' : '#e0503a';
          c.beginPath(); c.moveTo(x, y - 74); c.arc(x, y - 70, 40, Math.PI + i * Math.PI / 4, Math.PI + (i + 1) * Math.PI / 4); c.closePath(); c.fill();
        }
      } else {
        c.fillStyle = 'rgba(0,0,0,0.35)'; c.beginPath(); c.ellipse(cr.x + 4, cr.y + 14, 24, 11, 0, 0, TAU); c.fill();
        c.strokeStyle = 'rgba(255,210,63,' + (0.5 + 0.4 * Math.sin(cr.t * 4)) + ')'; c.lineWidth = 3;   // glowing: new gear!
        c.strokeRect(cr.x - 19, cr.y - 19, 38, 38);
      }
      c.fillStyle = '#7a5630'; c.fillRect(x - 16, y - 16, 32, 32);                // the crate
      c.fillStyle = '#5a3e22'; c.fillRect(x - 16, y - 3, 32, 6); c.fillRect(x - 3, y - 16, 6, 32);
      c.strokeStyle = '#3a2814'; c.lineWidth = 2; c.strokeRect(x - 16, y - 16, 32, 32);
      c.fillStyle = '#ffd23f'; c.font = 'bold 9px "Segoe UI", sans-serif'; c.textAlign = 'center'; c.fillText('SUPPLY', x, y - 6);
    }
    drawHellJet(c, s, def) {
      const L = def.reach, t = this.time, wd = Math.tan(def.width);
      c.save(); c.translate(s.x, s.y); c.rotate(s.ang || 0);
      c.globalCompositeOperation = 'lighter';
      // layers from the outside in: dark red, orange, yellow, white-hot core
      const layers = [[1.25, 'rgba(160,30,10,0.32)'], [1.0, 'rgba(255,90,20,0.4)'], [0.62, 'rgba(255,170,40,0.5)'], [0.28, 'rgba(255,240,200,0.75)']];
      for (const [k, col] of layers) {
        c.fillStyle = col;
        c.beginPath(); c.moveTo(26, -6 * k);
        const N = 14;
        for (let i = 1; i <= N; i++) {            // upper edge, flickering and swelling toward the tip
          const d = 26 + (L - 26) * i / N, w = (6 + d * wd) * k * (1 + 0.18 * Math.sin(t * 23 + i * 1.7) + 0.1 * Math.sin(t * 41 + i));
          c.lineTo(d, -w * (i === N ? 0.4 : 1));
        }
        c.lineTo(L * (1.02 + 0.04 * Math.sin(t * 17)), 0);
        for (let i = N; i >= 1; i--) {
          const d = 26 + (L - 26) * i / N, w = (6 + d * wd) * k * (1 + 0.18 * Math.sin(t * 19 + i * 2.3) + 0.1 * Math.sin(t * 37 + i));
          c.lineTo(d, w * (i === N ? 0.4 : 1));
        }
        c.lineTo(26, 6 * k); c.closePath(); c.fill();
      }
      c.restore();
    }
    // the Leviathan's firing arc: a wedge from its minimum range out to the edge of the screen
    drawArc(c, x, y, face, def, a) {
      const R = def.reach || 1500, half = def.arc;
      c.save();
      c.globalAlpha = a;
      c.fillStyle = 'rgba(255,90,60,0.10)';
      c.beginPath(); c.arc(x, y, R, face - half, face + half); c.arc(x, y, def.minRange, face + half, face - half, true); c.closePath(); c.fill();
      c.strokeStyle = 'rgba(255,110,80,0.8)'; c.lineWidth = 2; c.setLineDash([10, 8]);
      for (const s of [-1, 1]) { c.beginPath(); c.moveTo(x + Math.cos(face + s * half) * def.minRange, y + Math.sin(face + s * half) * def.minRange); c.lineTo(x + Math.cos(face + s * half) * R, y + Math.sin(face + s * half) * R); c.stroke(); }
      c.beginPath(); c.arc(x, y, def.minRange, face - half, face + half); c.stroke();
      c.setLineDash([]); c.restore();
    }
    drawBurrow(c, z) {
      const ph = z.wob || 0, id = z.id || 1;
      const rn = (k) => { const v = Math.sin(id * 12.9898 + k * 78.233) * 43758.5453; return v - Math.floor(v); };   // steady per-zombie shapes
      const heave = Math.sin(ph * 2.2);
      c.save(); c.translate(z.x, z.y); c.rotate(z.ang || 0);
      // churned soil it leaves right behind, and the ridge's shadow
      c.fillStyle = 'rgba(30,20,8,0.55)'; c.beginPath(); c.ellipse(-17, 0, 15, 7.5, 0, 0, TAU); c.fill();
      c.fillStyle = 'rgba(0,0,0,0.32)'; c.beginPath(); c.ellipse(3, 4, 19, 14, 0, 0, TAU); c.fill();
      // bow wave: clods shoved forward, rolling
      for (let i = 0; i < 5; i++) {
        const a = -0.9 + i * 0.45, rr = 17 + rn(i) * 3 + Math.sin(ph * 3 + i) * 1.5;
        c.fillStyle = i % 2 ? '#7a5e36' : '#5e4628';
        c.beginPath(); c.arc(Math.cos(a) * rr + 3, Math.sin(a) * rr, 2.2 + rn(i + 9) * 1.6, 0, TAU); c.fill();
      }
      // the heaving ridge: cracked plates of earth pushed up around the opening
      const plates = 8;
      for (let i = 0; i < plates; i++) {
        const a = i / plates * TAU + rn(i + 20) * 0.3, lift = 1 + 0.12 * Math.sin(ph * 2.2 + i * 0.9);
        const rad = (8.5 + rn(i + 30) * 2.5 + heave * 1.2) * lift, sz = 5.5 + rn(i + 40) * 3;
        c.save(); c.translate(Math.cos(a) * rad * 1.15, Math.sin(a) * rad * 0.9); c.rotate(a + 0.5);
        c.fillStyle = ['#6e5230', '#8a6a3e', '#5a4226', '#7a5c34'][i % 4];
        c.beginPath(); c.moveTo(-sz, -sz * 0.55); c.lineTo(sz * 0.8, -sz * 0.7); c.lineTo(sz, sz * 0.5); c.lineTo(-sz * 0.6, sz * 0.75); c.closePath(); c.fill();
        c.fillStyle = 'rgba(255,235,190,0.12)'; c.beginPath(); c.moveTo(-sz, -sz * 0.55); c.lineTo(sz * 0.8, -sz * 0.7); c.lineTo(0, -sz * 0.1); c.closePath(); c.fill();   // lit top edge
        c.restore();
      }
      // the split in the ground, dark and deep
      c.fillStyle = '#140d05';
      c.beginPath();
      c.moveTo(9, 0); c.lineTo(3, -3.5); c.lineTo(-2, -2); c.lineTo(-8, -4.5); c.lineTo(-6, 0); c.lineTo(-9, 3.5); c.lineTo(-1, 2.5); c.lineTo(3, 4); c.closePath(); c.fill();
      // claws punching up through the crack, then sinking back
      const out = Math.sin(ph * 1.3 + id) - 0.35;
      if (out > 0) {
        const k = Math.min(1, out * 2.2);
        c.strokeStyle = '#e8dcc0'; c.lineWidth = 2; c.lineCap = 'round';
        for (let f = -1; f <= 1; f++) {
          const bx = 2, by = f * 2.4, tx = bx + 9 * k, ty = by + f * 3 * k;
          c.beginPath(); c.moveTo(bx, by); c.quadraticCurveTo(bx + 6 * k, by + f * 0.5, tx, ty - 1.5 * k); c.stroke();
        }
      }
      c.restore();
    }
    drawZombie(c, z) {
      if (this.lk && this.lk.zombie) { this.lk.zombie(this, c, z); return; }
      const za = z.vis === undefined ? 1 : z.vis;
      c.globalAlpha = za;
      const L = ZLOOK[z.type] || ZLOOK.walker;
      if (z.burrowed) { this.drawBurrow(c, z); return; }
      const r = z.r, hit = z.hitT > 0, air = z.air || 0;
      const col = (k) => (hit ? shade(L[k], 1.18) : z.burn > 0 ? shade(L[k], 0.55) : L[k]);
      c.save(); c.translate(z.x, z.y);
      // shadow stays on the ground; the body lifts when airborne
      c.fillStyle = 'rgba(0,0,0,' + (0.32 - air * 0.15) + ')';
      c.beginPath(); c.ellipse(3 + air * 10, 5 + air * 14, r * (1.05 - air * 0.25), r * (0.95 - air * 0.25), 0, 0, TAU); c.fill();
      if (air) c.translate(0, -air * 16);
      const sc = 1 + air * 0.35;
      c.scale(sc, sc);
      if (z.champ) {              // champion: a gold ring, plus a mark for its trait
        c.strokeStyle = 'rgba(255,210,63,' + (0.6 + 0.3 * Math.sin(this.time * 5 + z.id)) + ')'; c.lineWidth = 2.5;
        c.beginPath(); c.arc(0, 0, r * 1.25, 0, TAU); c.stroke();
        if (z.champ === 'armored') { c.fillStyle = '#c8d0da'; for (let i = 0; i < 6; i++) { const a = i * 1.047; c.fillRect(Math.cos(a) * r * 1.25 - 2, Math.sin(a) * r * 1.25 - 2, 4, 4); } }
        else if (z.champ === 'swift') { c.strokeStyle = 'rgba(255,230,120,0.7)'; c.lineWidth = 1.5; const a0 = (z.ang || 0) + Math.PI; for (const o of [-0.4, 0, 0.4]) { c.beginPath(); c.moveTo(Math.cos(a0 + o) * r * 1.1, Math.sin(a0 + o) * r * 1.1); c.lineTo(Math.cos(a0 + o) * r * 2, Math.sin(a0 + o) * r * 2); c.stroke(); } }
        else { c.fillStyle = 'rgba(110,227,106,' + (0.15 + 0.12 * Math.sin(this.time * 6 + z.id)) + ')'; c.beginPath(); c.arc(0, 0, r * 1.2, 0, TAU); c.fill(); }
      }
      if (z.chill > 0) {          // chilled by Frostbite: a frosty blue film
        c.fillStyle = 'rgba(170,225,255,0.28)'; c.beginPath(); c.arc(0, 0, r * 1.15, 0, TAU); c.fill();
        c.strokeStyle = 'rgba(220,245,255,0.6)'; c.lineWidth = 1.2;
        for (let i = 0; i < 3; i++) { const a = i * 2.1 + z.id; c.beginPath(); c.moveTo(Math.cos(a) * r * 0.5, Math.sin(a) * r * 0.5); c.lineTo(Math.cos(a) * r * 1.1, Math.sin(a) * r * 1.1); c.stroke(); }
      }
      if (z.stunImm > 0) {        // shrugged off the shock: crackling blue outline while it can't be stunned
        c.strokeStyle = 'rgba(120,200,255,' + (0.35 + 0.25 * Math.sin(this.time * 22 + z.id)) + ')'; c.lineWidth = 2;
        c.setLineDash([4, 5]); c.lineDashOffset = -this.time * 40;
        c.beginPath(); c.arc(0, 0, r * 1.3, 0, TAU); c.stroke();
        c.setLineDash([]);
      }
      if (z.raised) {             // risen by a Gravecaller: a faint violet shroud
        c.fillStyle = 'rgba(170,120,255,' + (0.16 + 0.08 * Math.sin(this.time * 6 + z.id)) + ')';
        c.beginPath(); c.arc(0, 0, r * 1.35, 0, TAU); c.fill();
      }
      if (z.type === 'gravecaller') {   // necromancer: a slow violet halo and orbiting wisps
        const pu = 0.5 + 0.5 * Math.sin(this.time * 2.2);
        c.fillStyle = 'rgba(150,90,255,' + (0.12 + 0.1 * pu) + ')'; c.beginPath(); c.arc(0, 0, r * 2.1, 0, TAU); c.fill();
        c.fillStyle = 'rgba(220,190,255,0.85)';
        for (let i = 0; i < 3; i++) { const a = this.time * 1.6 + i * 2.094; c.beginPath(); c.arc(Math.cos(a) * r * 1.6, Math.sin(a) * r * 1.6, 2.2, 0, TAU); c.fill(); }
      }
      if (z.rage > 0) {            // berserk: red aura
        c.fillStyle = 'rgba(255,40,40,' + (0.25 + 0.15 * Math.sin(this.time * 14)) + ')';
        c.beginPath(); c.arc(0, 0, r * 1.45, 0, TAU); c.fill();
      }
      const zd0 = GD.ZOMBIES[z.type] || {}, shamble = !zd0.seg && !zd0.wyrmHead && !zd0.fly;
      c.rotate(z.ang + (shamble ? Math.sin((z.wob || 0) * 0.5 + z.id) * 0.14 : 0));
      if (shamble) c.translate(0, Math.sin((z.wob || 0) + z.id * 2) * r * 0.07);
      if (z.sqz) { c.translate(rand(-1.2, 1.2), rand(-1.2, 1.2)); c.scale(1.12, 0.78); }      // wedged in a gap, thrashing
      if (z.charge) {              // charging: speed streaks
        c.strokeStyle = 'rgba(255,140,80,0.6)'; c.lineWidth = 3;
        for (let i = -1; i <= 1; i++) { c.beginPath(); c.moveTo(-r * 1.1, i * r * 0.5); c.lineTo(-r * 2.6, i * r * 0.5); c.stroke(); }
      }
      const w = Math.sin(z.wob || 0), lunge = Math.max(0, z.lunge || 0) * r * 0.5;
      c.lineCap = 'round';
      const t = z.type;
      if (t === 'gravecaller') {   // a staff of bone with a glowing skull-orb, held out in front
        c.strokeStyle = '#cfc6b0'; c.lineWidth = 2.4;
        c.beginPath(); c.moveTo(-r * 0.4, r * 0.9); c.lineTo(r * 1.5 + lunge, r * 0.75); c.stroke();
        c.fillStyle = '#e8e0ff'; c.beginPath(); c.arc(r * 1.6 + lunge, r * 0.75, 3.6, 0, TAU); c.fill();
        c.fillStyle = 'rgba(180,130,255,0.5)'; c.beginPath(); c.arc(r * 1.6 + lunge, r * 0.75, 7 + 2 * Math.sin(this.time * 5), 0, TAU); c.fill();
      }
      if (t === 'crawler') {
        // a legless torso hauling itself forward, one arm at a time, trailing gore
        const pull = (w + 1) / 2;                       // 0..1: which arm is reaching
        c.fillStyle = 'rgba(90,6,4,' + (0.45 * za) + ')';  // smear behind it
        c.beginPath(); c.ellipse(-r * 1.25, 0, r * 0.75, r * 0.42, 0, 0, TAU); c.fill();
        c.strokeStyle = shade(L.body, 0.45); c.lineWidth = 2;   // dangling entrails
        c.beginPath();
        c.moveTo(-r * 0.6, -r * 0.15); c.quadraticCurveTo(-r * 1.2, -r * 0.35 + w * 2, -r * 1.55, -r * 0.05);
        c.moveTo(-r * 0.6, r * 0.2); c.quadraticCurveTo(-r * 1.1, r * 0.45 - w * 2, -r * 1.4, r * 0.3);
        c.stroke();
        for (const side of [-1, 1]) {                  // arms: shoulder -> elbow -> clawing hand
          const ext = side < 0 ? pull : 1 - pull;
          const hx = r * (0.65 + 0.95 * ext) + lunge, hy = side * r * (1.05 - 0.3 * ext);
          const ex = r * (0.25 + 0.35 * ext), ey = side * r * (1.25 - 0.1 * ext);
          c.strokeStyle = col('arm'); c.lineWidth = r * 0.3;
          c.beginPath(); c.moveTo(r * 0.15, side * r * 0.5); c.lineTo(ex, ey); c.lineTo(hx, hy); c.stroke();
          c.lineWidth = 1.6; c.strokeStyle = shade(L.arm, 0.75);
          c.beginPath();
          for (let f = -1; f <= 1; f++) { c.moveTo(hx, hy); c.lineTo(hx + r * 0.3, hy + f * r * 0.16 + side * r * 0.05); }
          c.stroke();
        }
        // torso: broad shoulders tapering to a torn waist
        c.fillStyle = col('body');
        c.beginPath();
        c.moveTo(r * 0.45, -r * 0.62);
        c.quadraticCurveTo(r * 0.75, 0, r * 0.45, r * 0.62);
        c.lineTo(-r * 0.35, r * 0.48);
        c.lineTo(-r * 0.62, r * 0.3); c.lineTo(-r * 0.5, r * 0.1); c.lineTo(-r * 0.72, -r * 0.08); c.lineTo(-r * 0.52, -r * 0.28);
        c.lineTo(-r * 0.35, -r * 0.48);
        c.closePath(); c.fill();
        if (!hit) {
          c.fillStyle = L.shirt; c.globalAlpha = 0.8 * za;          // shredded shirt
          c.beginPath(); c.moveTo(r * 0.3, -r * 0.5); c.lineTo(-r * 0.25, -r * 0.42); c.lineTo(-r * 0.1, 0); c.lineTo(-r * 0.3, r * 0.4); c.lineTo(r * 0.3, r * 0.5); c.closePath(); c.fill();
          c.globalAlpha = za;
          c.fillStyle = '#7a0e0a';                                    // raw wound at the waist
          c.beginPath(); c.ellipse(-r * 0.55, 0.05 * r, r * 0.16, r * 0.34, 0, 0, TAU); c.fill();
          c.strokeStyle = '#c9bca2'; c.lineWidth = r * 0.13; c.lineCap = 'butt';   // stub of spine trailing out
          c.beginPath(); c.moveTo(-r * 0.55, 0); c.lineTo(-r * 1.0, w * r * 0.08); c.stroke();
          c.strokeStyle = '#7a0e0a'; c.lineWidth = 1.2;
          c.beginPath(); for (let v = 0; v < 3; v++) { const vx = -r * (0.66 + v * 0.13); c.moveTo(vx, -r * 0.09); c.lineTo(vx, r * 0.09); } c.stroke();
          c.lineCap = 'round';
        }
        // head hangs low and forward, swaying with each pull
        const hy = w * r * 0.12;
        c.fillStyle = col('head'); c.beginPath(); c.arc(r * 0.78, hy, r * 0.4, 0, TAU); c.fill();
        if (!hit) {
          c.fillStyle = 'rgba(0,0,0,0.35)'; c.beginPath(); c.arc(r * 0.6, hy, r * 0.32, 1.9, TAU - 1.9, true); c.fill();
          c.fillStyle = '#2a0a08'; c.beginPath(); c.ellipse(r * 1.08, hy, r * 0.08, r * 0.17, 0, 0, TAU); c.fill();   // open jaw
        }
        c.restore();
        return;
      }
      if (t === 'gorefly') {          // a bloated red insect with buzzing see-through wings
        const flap = Math.sin(this.time * 60 + z.id) * 0.5;
        c.fillStyle = 'rgba(220,230,255,0.35)';
        for (const sy of [-1, 1]) { c.save(); c.rotate(sy * (0.9 + flap)); c.beginPath(); c.ellipse(-r * 0.2, sy * r * 0.9, r * 1.1, r * 0.45, 0, 0, TAU); c.fill(); c.restore(); }
        c.fillStyle = col('body'); c.beginPath(); c.ellipse(-r * 0.4, 0, r * 1.0, r * 0.75, 0, 0, TAU); c.fill();   // swollen abdomen
        c.fillStyle = 'rgba(255,90,70,0.6)'; c.beginPath(); c.ellipse(-r * 0.55, -r * 0.15, r * 0.4, r * 0.25, 0, 0, TAU); c.fill();
        c.fillStyle = col('head'); c.beginPath(); c.arc(r * 0.6, 0, r * 0.5, 0, TAU); c.fill();
        c.fillStyle = L.eye; c.beginPath(); c.arc(r * 0.8, -r * 0.25, r * 0.17, 0, TAU); c.arc(r * 0.8, r * 0.25, r * 0.17, 0, TAU); c.fill();
        c.restore();
        return;
      }
      if (t === 'wyrmseg' || t === 'wyrm' || t === 'goreseg' || t === 'gorewyrm') {
        const gore = t === 'goreseg' || t === 'gorewyrm';
        // Bonewyrm: bony plates over raw flesh, one pair of jointed legs per plate, scuttling in a wave
        const ph = (z.wob || 0) * 1.6 + z.id * 0.9;
        c.strokeStyle = col('arm'); c.lineWidth = 2.4;
        for (const side of [-1, 1]) {
          const sw = Math.sin(ph + (side > 0 ? Math.PI : 0)) * r * 0.45;
          const kx = -r * 0.05 + sw * 0.5, ky = side * r * 1.25, fx = r * 0.15 + sw, fy = side * r * 1.75;
          c.beginPath(); c.moveTo(0, side * r * 0.55); c.lineTo(kx, ky); c.lineTo(fx, fy); c.stroke();
          c.fillStyle = shade(L.arm, 0.7); c.beginPath(); c.arc(kx, ky, 1.8, 0, TAU); c.fill();
        }
        if (t === 'wyrmseg' || t === 'goreseg') {
          c.fillStyle = col('shirt'); c.beginPath(); c.ellipse(-r * 0.25, 0, r * 0.75, r * 0.92, 0, 0, TAU); c.fill();    // flesh between plates
          const gr = c.createLinearGradient(0, -r, 0, r);
          gr.addColorStop(0, shade(col('body'), 0.75)); gr.addColorStop(0.5, col('head')); gr.addColorStop(1, shade(col('body'), 0.7));
          c.fillStyle = gr; c.beginPath(); c.ellipse(r * 0.05, 0, r * 0.72, r * 1.0, 0, 0, TAU); c.fill();
          c.strokeStyle = 'rgba(40,24,10,0.55)'; c.lineWidth = 1.4;                      // plate ridges
          c.beginPath(); c.ellipse(r * 0.05, 0, r * 0.45, r * 0.78, 0, -1.2, 1.2); c.stroke();
          c.beginPath(); c.moveTo(-r * 0.62, -r * 0.55); c.quadraticCurveTo(-r * 0.75, 0, -r * 0.62, r * 0.55); c.stroke();
          c.fillStyle = shade(col('body'), 0.55);                                        // spine spike
          c.beginPath(); c.moveTo(r * 0.45, 0); c.lineTo(-r * 0.2, -r * 0.16); c.lineTo(-r * 0.2, r * 0.16); c.fill();
          if (gore && !hit) {                                                            // Gorewyrm: rib spikes through raw meat, and dripping blood
            c.strokeStyle = '#efe6d0'; c.lineWidth = 2.2; c.lineCap = 'round';
            for (const side of [-1, 1]) { c.beginPath(); c.moveTo(-r * 0.1, side * r * 0.55); c.quadraticCurveTo(-r * 0.25, side * r * 1.05, -r * 0.65, side * r * 1.15); c.stroke(); }
            c.fillStyle = 'rgba(150,10,6,0.85)';
            for (let i = 0; i < 3; i++) { const k = ((this.time * 0.8 + i / 3 + z.id * 0.13) % 1); c.beginPath(); c.arc(-r * (0.3 + k * 0.5), (i - 1) * r * 0.45, r * 0.09 * (1 - k * 0.5), 0, TAU); c.fill(); }
            c.fillStyle = 'rgba(255,120,100,0.25)'; c.beginPath(); c.ellipse(r * 0.15, -r * 0.3, r * 0.3, r * 0.14, 0.3, 0, TAU); c.fill();   // wet sheen
          }
          if (z.hp < 50 && !hit) {                                                       // cracking: about to break off
            c.strokeStyle = 'rgba(120,10,6,0.8)'; c.lineWidth = 1.6;
            c.beginPath(); c.moveTo(r * 0.1, -r * 0.9); c.lineTo(-r * 0.1, -r * 0.3); c.lineTo(r * 0.2, r * 0.2); c.lineTo(0, r * 0.8); c.stroke();
          }
        } else {
          // head: armoured skull, a cluster of burning eyes, sweeping feelers and snapping mandibles
          const snap = Math.max(0, z.lunge || 0), open = 0.35 + 0.3 * Math.sin(this.time * 9 + z.id) * 0.3 + snap * 0.4;
          c.strokeStyle = shade(L.arm, 0.9); c.lineWidth = 1.6;
          for (const side of [-1, 1]) {
            c.beginPath(); c.moveTo(r * 0.5, side * r * 0.35);
            c.quadraticCurveTo(r * 0.2, side * (r * 1.4 + Math.sin(this.time * 5 + side) * 3), -r * 0.9, side * r * 1.6); c.stroke();
          }
          c.fillStyle = col('shirt'); c.beginPath(); c.ellipse(-r * 0.35, 0, r * 0.7, r * 0.85, 0, 0, TAU); c.fill();
          c.fillStyle = shade(col('head'), 0.92);
          for (const side of [-1, 1]) {                                                  // mandibles
            c.save(); c.translate(r * 0.7, side * r * 0.32); c.rotate(side * open);
            c.beginPath(); c.moveTo(0, -side * r * 0.12); c.quadraticCurveTo(r * 0.75, side * r * 0.05, r * 0.85, -side * r * 0.32);
            c.quadraticCurveTo(r * 0.45, side * r * 0.2, 0, side * r * 0.18); c.fill();
            c.restore();
          }
          const gr = c.createRadialGradient(r * 0.1, -r * 0.2, r * 0.1, 0, 0, r * 1.05);
          gr.addColorStop(0, col('head')); gr.addColorStop(1, shade(col('body'), 0.65));
          c.fillStyle = gr; c.beginPath(); c.ellipse(r * 0.05, 0, r * 0.85, r * 0.95, 0, 0, TAU); c.fill();
          c.strokeStyle = 'rgba(40,24,10,0.5)'; c.lineWidth = 1.5;
          c.beginPath(); c.moveTo(-r * 0.6, 0); c.lineTo(r * 0.55, 0); c.stroke();
          c.beginPath(); c.ellipse(-r * 0.2, 0, r * 0.5, r * 0.8, 0, -1.3, 1.3); c.stroke();
          if (gore && !hit) {                                                            // Gorewyrm: a gaping red maw ringed with teeth
            c.fillStyle = '#2a0402'; c.beginPath(); c.ellipse(r * 0.62, 0, r * 0.3, r * 0.36 + snap * r * 0.1, 0, 0, TAU); c.fill();
            c.fillStyle = '#f2ead6';
            for (let i = 0; i < 8; i++) { const a = i * TAU / 8; c.beginPath(); c.moveTo(r * 0.62 + Math.cos(a) * r * 0.32, Math.sin(a) * r * 0.38); c.lineTo(r * 0.62 + Math.cos(a) * r * 0.16, Math.sin(a) * r * 0.2); c.lineTo(r * 0.62 + Math.cos(a + 0.3) * r * 0.3, Math.sin(a + 0.3) * r * 0.36); c.fill(); }
            c.fillStyle = 'rgba(160,10,6,0.9)';
            for (const side of [-1, 1]) { const k = (this.time * 1.1 + (side > 0 ? 0.5 : 0)) % 1; c.beginPath(); c.arc(r * (1.1 + k * 0.4), side * r * 0.3, r * 0.07, 0, TAU); c.fill(); }
          }
          if (!hit) {
            c.fillStyle = z.rage > 0 ? '#ff2a10' : L.eye;
            for (const [ex, ey, er] of (gore ? [[0.3, -0.55, 0.1], [0.3, 0.55, 0.1], [0.1, -0.7, 0.08], [0.1, 0.7, 0.08], [-0.1, -0.78, 0.06], [-0.1, 0.78, 0.06]] : [[0.55, -0.32, 0.12], [0.55, 0.32, 0.12], [0.38, -0.52, 0.08], [0.38, 0.52, 0.08]])) {
              c.beginPath(); c.arc(r * ex, r * ey, r * er, 0, TAU); c.fill();
            }
            c.fillStyle = 'rgba(255,200,120,0.85)'; c.beginPath(); c.arc(r * 0.58, -r * 0.35, r * 0.04, 0, TAU); c.arc(r * 0.58, r * 0.29, r * 0.04, 0, TAU); c.fill();
          }
        }
        c.restore();
        return;
      }
      if (t === 'broodmother') {
        c.strokeStyle = col('arm'); c.lineWidth = r * 0.18;
        for (let i = 0; i < 3; i++) {
          const yy = (i - 1) * r * 0.55;
          c.beginPath(); c.moveTo(0, yy); c.lineTo(r * 0.3 + Math.sin(this.time * 6 + i) * 4, yy - r * 1.05); c.moveTo(0, yy); c.lineTo(r * 0.3 - Math.sin(this.time * 6 + i) * 4, yy + r * 1.05); c.stroke();
        }
        c.fillStyle = col('body'); c.beginPath(); c.ellipse(-r * 0.15, 0, r * 1.0, r * 0.85, 0, 0, TAU); c.fill();
        if (!hit) {
          for (let i = 0; i < 6; i++) {        // pulsing egg sacs
            const a = i * 1.05 + 0.4, pr = r * (0.26 + 0.05 * Math.sin(this.time * 4 + i));
            c.fillStyle = i % 2 ? '#c8d878' : '#b0c060';
            c.beginPath(); c.arc(-r * 0.35 + Math.cos(a) * r * 0.45, Math.sin(a) * r * 0.5, pr, 0, TAU); c.fill();
            c.fillStyle = 'rgba(60,70,20,0.5)'; c.beginPath(); c.arc(-r * 0.35 + Math.cos(a) * r * 0.45 + pr * 0.25, Math.sin(a) * r * 0.5, pr * 0.35, 0, TAU); c.fill();
          }
        }
        c.fillStyle = col('head'); c.beginPath(); c.arc(r * 0.75, 0, r * 0.38, 0, TAU); c.fill();
        c.restore();
        return;
      }
      // humanoid shapes
      { const lame = z.id % 3 === 0 ? 0.35 : 1, st = Math.sin(z.wob || 0);          // feet: one leg drags on some
        c.fillStyle = '#14110e';
        c.beginPath(); c.ellipse(-r * 0.15 + st * r * 0.42, -r * 0.42, r * 0.34, r * 0.2, 0, 0, TAU);
        c.ellipse(-r * 0.15 - st * r * 0.42 * lame, r * 0.42, r * 0.34, r * 0.2, 0, 0, TAU); c.fill(); }
      const heavy = t === 'brute' || t === 'boss' || t === 'juggernaut' || t === 'ironhide' || t === 'colossus';
      c.strokeStyle = col('arm');
      c.lineWidth = r * (heavy ? 0.6 : t === 'screamer' ? 0.28 : 0.4);
      let reach = t === 'runner' || t === 'splitling' ? r * 0.9 : r * 1.25;
      if (t === 'screamer') reach = r * 1.05;
      if (t === 'burrower') reach = r * 1.4;
      if (t === 'leaper') {          // long legs behind
        c.strokeStyle = col('arm'); c.lineWidth = r * 0.3;
        c.beginPath(); c.moveTo(-r * 0.2, -r * 0.5); c.lineTo(-r * 1.3, -r * 0.8 + w * 4); c.moveTo(-r * 0.2, r * 0.5); c.lineTo(-r * 1.3, r * 0.8 - w * 4); c.stroke();
        c.lineWidth = r * 0.34;
      }
      { // arms: a dark outline, grey dead flesh, then forearms caked dark toward the hands
        const lw = c.lineWidth, ax = reach + lunge, ay = w * r * 0.15;
        const arms = (from) => { c.beginPath(); c.moveTo(r * 0.1 + (ax - r * 0.1) * from, -r * 0.8 + (r * 0.35 + ay) * from); c.lineTo(ax + ay, -r * 0.45);
          c.moveTo(r * 0.1 + (ax - r * 0.1) * from, r * 0.8 - (r * 0.35 + ay) * from); c.lineTo(ax - ay, r * 0.45); c.stroke(); };
        c.strokeStyle = 'rgba(8,6,4,0.6)'; c.lineWidth = lw + 1.6; arms(0);
        c.strokeStyle = hit ? shade(L.arm, 0.95) : shade(L.arm, 0.78); c.lineWidth = lw; arms(0);
        c.strokeStyle = 'rgba(46,8,6,0.7)'; c.lineWidth = lw * 0.85; arms(0.55);
        c.strokeStyle = 'rgba(0,0,0,0.28)'; c.lineWidth = lw * 0.4; c.beginPath(); c.moveTo(r * 0.1, -r * 0.8 - lw * 0.25); c.lineTo(ax + ay, -r * 0.45 - lw * 0.25); c.moveTo(r * 0.1, r * 0.8 + lw * 0.25); c.lineTo(ax - ay, r * 0.45 + lw * 0.25); c.stroke();
        c.lineWidth = lw; }
      { const lw = c.lineWidth;                                                  // hands: thin clawed fingers, dark with old blood
        c.strokeStyle = '#260504'; c.lineWidth = Math.max(1, lw * 0.26);
        for (const sy of [-1, 1]) {
          const hx = reach + lunge + sy * -w * r * 0.15, hy = sy * r * 0.45;
          c.beginPath(); for (let f = -1; f <= 1; f++) { c.moveTo(hx - lw * 0.2, hy + f * lw * 0.22); c.lineTo(hx + lw * 0.75, hy + f * lw * 0.5 - sy * lw * 0.15); } c.stroke();
        }
        c.lineWidth = lw; }
      if (t === 'burrower' && !hit) {   // digging claws
        c.strokeStyle = '#e8dcc0'; c.lineWidth = 2;
        for (const sy of [-1, 1]) for (let k = -1; k <= 1; k++) {
          c.beginPath(); c.moveTo(reach + lunge, sy * r * 0.45 + k * 3); c.lineTo(reach + lunge + 6, sy * r * 0.45 + k * 4 + sy * 2); c.stroke();
        }
      }
      const pulse = t === 'bloater' ? 1 + 0.07 * Math.sin(this.time * 7 + (z.wob || 0)) : 1;
      const bw = t === 'runner' || t === 'splitling' || t === 'leaper' ? 0.62 : t === 'bloater' || t === 'splitter' ? 0.98 : t === 'screamer' ? 0.58 : 0.78;
      c.fillStyle = col('body');
      c.beginPath(); c.ellipse(0, 0, r * bw * pulse, r * pulse, 0, 0, TAU); c.fill();
      fleshSprites();
      { const bx = r * bw * pulse, by = r * pulse, q = (k) => { const v = Math.sin(z.id * 12.9898 + k * 78.233) * 43758.5453; return v - Math.floor(v); };
        c.fillStyle = col('body');                                               // hunched shoulders break the oval
        c.beginPath(); c.ellipse(bx * 0.15, -by * (0.72 + q(1) * 0.12), bx * 0.5, by * 0.34, 0.3, 0, TAU); c.ellipse(bx * 0.15, by * (0.72 + q(2) * 0.12), bx * 0.5, by * 0.34, -0.3, 0, TAU); c.fill();
        c.fillStyle = shade(L.shirt, 0.7);                                       // rags hanging off its back
        for (let i = 0; i < 5; i++) { const a = Math.PI + (q(i + 3) - 0.5) * 2.4, l = 1 + q(i + 9) * 0.35; c.beginPath(); c.moveTo(Math.cos(a - 0.18) * bx * 0.85, Math.sin(a - 0.18) * by * 0.85); c.lineTo(Math.cos(a) * bx * l * 1.1, Math.sin(a) * by * l * 1.1 + w * 1.2); c.lineTo(Math.cos(a + 0.18) * bx * 0.85, Math.sin(a + 0.18) * by * 0.85); c.fill(); }
        c.strokeStyle = 'rgba(8,6,4,0.55)'; c.lineWidth = 1; c.beginPath(); c.ellipse(0, 0, bx, by, 0, 0, TAU); c.stroke();
        c.save(); c.rotate((z.id % 7) * 0.9); c.drawImage(ROT[z.id % 4], -bx, -by, bx * 2, by * 2); c.restore();     // each one rots differently
        c.drawImage(VOL, -bx, -by, bx * 2, by * 2); }
      if (!hit) {
        c.fillStyle = L.shirt; c.globalAlpha = 0.75 * za;
        c.beginPath(); c.ellipse(-r * 0.22, 0, r * 0.42, r * 0.8, 0, 0, TAU); c.fill();
        c.globalAlpha = za;
        if (t === 'colossus') {         // slabs of stone-like plate across its back and shoulders
          c.fillStyle = '#4a4036';
          for (const [x, y, w, h] of [[-0.45, -0.55, 0.5, 0.35], [-0.5, 0.2, 0.55, 0.35], [0.0, -0.75, 0.35, 0.3], [0.0, 0.45, 0.35, 0.3], [-0.2, -0.15, 0.35, 0.3]]) c.fillRect(r * x, r * y, r * w, r * h);
          c.strokeStyle = 'rgba(0,0,0,0.35)'; c.lineWidth = 2; c.beginPath(); c.moveTo(-r * 0.6, 0); c.lineTo(r * 0.3, 0); c.stroke();
        }
        if (t === 'disruptor') {        // an antenna mast and crackling current
          c.strokeStyle = '#9ff0ff'; c.lineWidth = 1.6;
          c.beginPath(); c.moveTo(-r * 0.2, 0); c.lineTo(-r * 0.9, -r * 0.9); c.stroke();
          c.fillStyle = '#e0ffff'; c.beginPath(); c.arc(-r * 0.9, -r * 0.9, 2.4, 0, TAU); c.fill();
          if (Math.random() < 0.6) { c.beginPath(); const a = Math.random() * TAU; c.moveTo(0, 0); c.lineTo(Math.cos(a) * r * 0.8, Math.sin(a) * r * 0.8); c.lineTo(Math.cos(a + 0.4) * r * 1.4, Math.sin(a + 0.4) * r * 1.4); c.stroke(); }
        }
        if (t === 'smoker') {           // a swollen gut and a smoking vent on its back
          c.fillStyle = '#4a4a52'; c.beginPath(); c.ellipse(-r * 0.1, 0, r * 0.62, r * 0.85, 0, 0, TAU); c.fill();
          c.fillStyle = '#26262a'; c.beginPath(); c.arc(-r * 0.55, 0, r * 0.22, 0, TAU); c.fill();
          c.fillStyle = 'rgba(70,70,78,0.6)';
          for (let i = 0; i < 3; i++) { const k = ((this.time * 0.9 + i / 3 + z.id * 0.1) % 1); c.beginPath(); c.arc(-r * (0.6 + k * 1.3), Math.sin(k * 6 + i) * r * 0.2, r * (0.18 + k * 0.4), 0, TAU); c.fill(); }
        }
        if (t === 'tarborn') {          // dripping, glossy tar
          c.strokeStyle = 'rgba(150,150,190,0.35)'; c.lineWidth = 1.6;
          c.beginPath(); c.ellipse(r * 0.1, -r * 0.25, r * 0.45, r * 0.5, 0, 3.8, 5.6); c.stroke();
          c.fillStyle = '#060608';
          for (let i = 0; i < 4; i++) {                                        // drips running off the back and sides
            const dy = (i - 1.5) * r * 0.45, len = r * (0.25 + 0.2 * ((Math.sin(this.time * 2 + i * 1.7 + z.id) + 1) / 2));
            c.beginPath(); c.ellipse(-r * 0.7, dy, len, r * 0.1, 0, 0, TAU); c.fill();
          }
        }
        if (t === 'burrower') {         // caked in the dirt it dug through: clumps on the shoulders, grit all over
          const rn = (k) => { const v = Math.sin(z.id * 12.9898 + k * 78.233) * 43758.5453; return v - Math.floor(v); };
          c.fillStyle = '#4a3418';
          for (let i = 0; i < 7; i++) { c.beginPath(); c.arc(r * (rn(i) * 1.1 - 0.6), r * (rn(i + 7) * 1.6 - 0.8), r * (0.07 + rn(i + 14) * 0.08), 0, TAU); c.fill(); }
          c.fillStyle = '#6e5230';
          for (const sy of [-1, 1]) { c.beginPath(); c.ellipse(r * 0.05, sy * r * 0.72, r * 0.26, r * 0.16, sy * 0.4, 0, TAU); c.fill(); }
        }
        if (t === 'bloater') { c.fillStyle = '#d6dc7a'; [[-0.4, -0.4, 0.22], [-0.2, 0.5, 0.18], [-0.6, 0.15, 0.16]].forEach(([x, y, q]) => { c.beginPath(); c.arc(r * x, r * y, r * q, 0, TAU); c.fill(); }); }
        if (t === 'splitter') {
          c.strokeStyle = '#4a1844'; c.lineWidth = 2.5; c.beginPath(); c.moveTo(-r * 0.9, 0); c.quadraticCurveTo(0, r * 0.2, r * 0.6, 0); c.stroke();
          c.fillStyle = '#f0a0e8'; [[-0.3, -0.5], [-0.4, 0.45], [0.1, -0.6]].forEach(([x, y]) => { c.beginPath(); c.arc(r * x, r * y, r * 0.2, 0, TAU); c.fill(); });
        }
        if (t === 'ironhide' || t === 'juggernaut') {   // armour plates with rivets
          c.fillStyle = t === 'juggernaut' ? '#4a4e56' : '#8a96a4';
          c.beginPath(); c.roundRect(-r * 0.6, -r * 0.85, r * 0.9, r * 0.55, 3); c.fill();
          c.beginPath(); c.roundRect(-r * 0.6, r * 0.3, r * 0.9, r * 0.55, 3); c.fill();
          if (t === 'juggernaut') { c.fillStyle = '#6a6e76'; c.beginPath(); c.arc(r * 0.35, 0, r * 0.95, -1.1, 1.1); c.lineTo(r * 0.35, 0); c.fill(); }
          c.fillStyle = '#d0d8e0';
          for (const [x, y] of [[-0.45, -0.7], [0.15, -0.7], [-0.45, 0.7], [0.15, 0.7]]) { c.beginPath(); c.arc(r * x, r * y, 1.6, 0, TAU); c.fill(); }
        }
        if (t === 'boss') {
          c.fillStyle = '#1a1220';
          for (let i = -2; i <= 2; i++) { c.beginPath(); c.moveTo(-r * 0.5, i * r * 0.3 - 5); c.lineTo(-r * 1.05, i * r * 0.36); c.lineTo(-r * 0.5, i * r * 0.3 + 5); c.fill(); }
          c.strokeStyle = 'rgba(255,60,60,' + (0.5 + 0.3 * Math.sin(this.time * 4)) + ')'; c.lineWidth = 2.5;
          c.beginPath(); c.moveTo(-r * 0.4, -r * 0.5); c.lineTo(-r * 0.1, -r * 0.1); c.lineTo(-r * 0.45, r * 0.2); c.lineTo(-r * 0.15, r * 0.6); c.stroke();
        }
      }
      if (!hit && this.gore > 0 && r >= 9) {      // rot: open wounds, bared ribs, a torn hem
        const q = (k) => { const v = Math.sin(z.id * 12.9898 + k * 78.233) * 43758.5453; return v - Math.floor(v); };
        c.fillStyle = '#5e0c0a';
        for (let i = 0; i < 2; i++) { c.beginPath(); c.ellipse(r * (q(i) * 0.7 - 0.55), r * (q(i + 4) * 1.2 - 0.6), r * (0.12 + q(i + 8) * 0.1), r * 0.07, q(i + 2) * 3, 0, TAU); c.fill(); }
        if (z.id % 3 === 1) { c.strokeStyle = 'rgba(226,214,190,0.75)'; c.lineWidth = 1; for (let i = 0; i < 3; i++) { c.beginPath(); c.moveTo(-r * 0.45 + i * r * 0.16, -r * 0.5); c.lineTo(-r * 0.4 + i * r * 0.16, -r * 0.15); c.stroke(); } }
        c.fillStyle = 'rgba(0,0,0,0.3)'; c.beginPath(); c.moveTo(-r * 0.62, r * (q(9) - 0.5)); c.lineTo(-r * 0.3, r * (q(9) - 0.38)); c.lineTo(-r * 0.62, r * (q(9) - 0.2)); c.fill();
      }
      // head
      c.fillStyle = col('head');
      if (t === 'screamer') {
        c.beginPath(); c.ellipse(r * 0.4, 0, r * 0.62, r * 0.42, 0, 0, TAU); c.fill();
        c.fillStyle = '#2a0a12'; c.beginPath(); c.ellipse(r * 0.75, 0, r * (0.12 + 0.18 * Math.max(0, z.lunge || 0)), r * 0.2, 0, 0, TAU); c.fill();
      } else {
        c.beginPath(); c.arc(r * 0.28, 0, r * (heavy ? 0.42 : 0.52), 0, TAU); c.fill();
        { const hr = r * (heavy ? 0.42 : 0.52); c.drawImage(ROT[(z.id + 1) % 4], r * 0.28 - hr, -hr, hr * 2, hr * 2); c.drawImage(VOL, r * 0.28 - hr, -hr, hr * 2, hr * 2);
          c.strokeStyle = 'rgba(8,6,4,0.6)'; c.lineWidth = 1; c.beginPath(); c.arc(r * 0.28, 0, hr, 0, TAU); c.stroke();
          c.fillStyle = 'rgba(0,0,0,0.3)'; c.beginPath(); c.arc(r * 0.28, 0, hr, 2.2, 4.08); c.fill(); }       // the back of the skull sits in shadow
        if (t === 'juggernaut' && !hit) {  // horns
          c.fillStyle = '#e0d4bc';
          c.beginPath(); c.moveTo(r * 0.4, -r * 0.3); c.lineTo(r * 0.95, -r * 0.6); c.lineTo(r * 0.5, -r * 0.1); c.fill();
          c.beginPath(); c.moveTo(r * 0.4, r * 0.3); c.lineTo(r * 0.95, r * 0.6); c.lineTo(r * 0.5, r * 0.1); c.fill();
        }
        if (t === 'ironhide' && !hit) { c.fillStyle = '#9aa6b4'; c.beginPath(); c.arc(r * 0.28, 0, r * 0.42, -1.9, 1.9); c.fill(); }
        if (!hit) { c.fillStyle = 'rgba(0,0,0,0.35)'; c.beginPath(); c.arc(r * 0.5, 0, r * 0.2, -1.2, 1.2); c.fill(); }
        if (!hit && r >= 9) {                      // hollow sockets with a dead glint, and a slack jaw
          const hr = r * (heavy ? 0.42 : 0.52);
          c.fillStyle = '#0c0606';
          c.beginPath(); c.arc(r * 0.28 + hr * 0.45, -hr * 0.42, hr * 0.26, 0, TAU); c.arc(r * 0.28 + hr * 0.45, hr * 0.42, hr * 0.26, 0, TAU); c.fill();
          c.fillStyle = z.rage > 0 ? '#ff3020' : L.eye;
          c.beginPath(); c.arc(r * 0.28 + hr * 0.5, -hr * 0.42, hr * 0.1, 0, TAU); c.arc(r * 0.28 + hr * 0.5, hr * 0.42, hr * (z.id % 4 === 0 ? 0 : 0.1), 0, TAU); c.fill();
          if (this.gore > 0) { c.fillStyle = '#3a0a08'; c.beginPath(); c.ellipse(r * 0.28 + hr * 0.92, 0, hr * 0.14, hr * (0.22 + 0.2 * Math.max(0, z.lunge || 0)), 0, 0, TAU); c.fill(); }
        }
      }
      c.restore();
      if (z.lit && this.dark > 0.3) {    // exposed by a Flood Lamp
        c.strokeStyle = 'rgba(255,230,120,0.55)'; c.lineWidth = 2;
        c.beginPath(); c.arc(z.x, z.y - air * 16, r + 4, 0, TAU); c.stroke();
      }
    }
    drawPlayer(c, p) {
      if (this.lk && this.lk.player) { this.lk.player(this, c, p); return; }
      c.save(); c.translate(p.x, p.y);
      if (p.down) {
        c.rotate(1.2 + p.x);
        c.fillStyle = 'rgba(90,10,8,0.6)'; c.beginPath(); c.ellipse(0, 0, 22, 17, 0, 0, TAU); c.fill();
        c.fillStyle = shade(p.color, 0.5); c.beginPath(); c.ellipse(0, 0, 15, 9, 0, 0, TAU); c.fill();
        c.fillStyle = '#b89a80'; c.beginPath(); c.arc(13, 0, 6.5, 0, TAU); c.fill();
        c.restore();
        return;
      }
      c.fillStyle = 'rgba(0,0,0,0.38)'; c.beginPath(); c.ellipse(3, 5, 15, 13, 0, 0, TAU); c.fill();
      c.rotate(p.aim);
      const hurt = p.hurtT > 0.2;
      const sw = p.moving ? Math.sin(p.walk) * 6 : 0;
      c.fillStyle = '#17181d';
      c.beginPath(); c.ellipse(sw, -6.5, 6.5, 4, 0, 0, TAU); c.ellipse(-sw, 6.5, 6.5, 4, 0, 0, TAU); c.fill();
      const g = GUNLOOK[p.cur] || GUNLOOK.pistol;
      const kick = p.flash > 0 ? -2.5 : 0;
      c.fillStyle = g.c; c.fillRect(9 + kick, 3 - g.w / 2 + 1, g.len, g.w);
      c.fillStyle = 'rgba(255,255,255,0.14)'; c.fillRect(9 + kick, 3 - g.w / 2 + 1, g.len, 1.2);
      if (p.cur === 'arc') { c.fillStyle = '#9fe0ff'; c.fillRect(9 + g.len - 5 + kick, 1.5, 4, 5); }
      if (p.cur === 'flamer') { c.fillStyle = '#ffb040'; c.fillRect(9 + g.len - 3 + kick, 2, 3, 4); }
      c.lineCap = 'round'; c.strokeStyle = shade(p.color, 0.7); c.lineWidth = 5.5;
      c.beginPath(); c.moveTo(1, 10); c.lineTo(13 + kick, 5); c.moveTo(2, -10); c.lineTo(Math.min(20, 9 + g.len * 0.6) + kick, 2.5); c.stroke();
      c.fillStyle = shade(p.color, 0.45); c.beginPath(); c.roundRect(-13, -7, 7, 14, 3); c.fill();
      c.fillStyle = hurt ? '#fff' : p.color; c.beginPath(); c.ellipse(0, 0, 9.5, 13, 0, 0, TAU); c.fill();
      c.strokeStyle = 'rgba(0,0,0,0.45)'; c.lineWidth = 1.5; c.stroke();
      c.fillStyle = hurt ? '#fff' : '#e3bd98'; c.beginPath(); c.arc(2, 0, 7, 0, TAU); c.fill();
      c.fillStyle = shade(p.color, 0.35); c.beginPath(); c.arc(1, 0, 7.2, 1.2, TAU - 1.2); c.fill();
      c.restore();
    }

    cone(c, x, y, ang, len, half, alpha) {
      const sp = this.cones[half] || (this.cones[half] = coneSprite(half));
      c.save(); c.translate(x, y); c.rotate(ang);
      c.globalAlpha = alpha; c.drawImage(sp, -len, -len, len * 2, len * 2);
      c.restore();
    }
    glow(c, x, y, r, alpha, rgb) {
      const key = rgb || '255,255,255';
      const sp = this.glows[key] || (this.glows[key] = glowSprite(key));
      c.globalAlpha = alpha; c.drawImage(sp, x - r, y - r, r * 2, r * 2);
      c.globalAlpha = 1;
    }
    // How lit a point is (0 = pitch dark, 1 = well lit). Mirrors the light sources drawn below.
    lightAt(x, y, sim) {
      let L = Math.max(0, 1 - Math.hypot(x - FIRE.x, y - FIRE.y) / 380) * 1.6;
      for (const p of sim.players) {
        if (p.away) continue;
        const dx = x - p.x, dy = y - p.y, d = Math.hypot(dx, dy);
        L = Math.max(L, (1 - d / (p.down ? 70 : 125)) * 1.4);
        if (!p.down && d < 660) {
          let a = Math.atan2(dy, dx) - p.aim;
          a = Math.abs(Math.atan2(Math.sin(a), Math.cos(a)));
          if (a < 0.62) L = Math.max(L, (1 - d / 660) * (a < 0.36 ? 1.6 : 0.9));
        }
      }
      for (const st of sim.structs) {
        if (st.id === 'torch') L = Math.max(L, (1 - Math.hypot(x - st.x, y - st.y) / GD.STRUCTS.torch.glow) * 1.4);
        if (st.id === 'lamp') L = Math.max(L, (1 - Math.hypot(x - st.x, y - st.y) / GD.STRUCTS.lamp.light) * 1.6);
        else if (AIMS(st.id)) {
          const dx = x - st.x, dy = y - st.y, d = Math.hypot(dx, dy);
          if (d < 300) { let a = Math.atan2(dy, dx) - (st.ang || 0); a = Math.abs(Math.atan2(Math.sin(a), Math.cos(a))); if (a < 0.4) L = Math.max(L, (1 - d / 300) * 0.9); }
        }
      }
      for (const f of this.flashes) L = Math.max(L, (1 - Math.hypot(x - f.x, y - f.y) / f.r) * (f.life / f.max));
      return clamp(L, 0, 1);
    }
    // everything that burns: fire, sparks, embers, acid, and the campfire's flames
    drawHot(c, fireS) {
      if (this.lk && this.lk.hot) { this.lk.hot(this, c, fireS); return; }
      c.globalAlpha = 1;
      c.globalCompositeOperation = 'lighter';
      for (const p of this.parts) {
        const t = clamp(p.life / p.max, 0, 1);
        if (p.k === 'fire') {
          c.globalAlpha = 0.2 * t; c.fillStyle = t > 0.7 ? '#ffd27a' : t > 0.35 ? '#ff8a2c' : '#b8360f';
          c.beginPath(); c.arc(p.x, p.y, p.size * (0.5 + t * 0.6), 0, TAU); c.fill();
        } else if (p.k === 'acid') {
          c.globalAlpha = 0.5 * t; c.fillStyle = '#9dff5a'; c.beginPath(); c.arc(p.x, p.y, p.size * (0.5 + t * 0.6), 0, TAU); c.fill();
        } else if (p.k === 'spark' || p.k === 'ember') {
          c.globalAlpha = t; c.fillStyle = p.k === 'ember' ? '#ffb050' : p.c; c.beginPath(); c.arc(p.x, p.y, p.size, 0, TAU); c.fill();
        }
      }
      if (this.lk && this.lk.flames) this.lk.flames(this, c, fireS);
      else for (let i = 0; i < 5 && fireS > 0; i++) {
        const ph = this.time * (5 + i) + i * 2.1;
        const r = (15 - i * 2.2 + Math.sin(ph) * 2.5) * fireS;
        c.globalAlpha = 0.5;
        c.fillStyle = ['#c8401a', '#ff7a2a', '#ff9d3c', '#ffd070', '#fff0c0'][i];
        c.beginPath(); c.arc(FIRE.x + Math.sin(ph * 0.7) * 3, FIRE.y - i * 2 + Math.cos(ph) * 2, Math.max(2, r), 0, TAU); c.fill();
      }
      c.globalAlpha = 1;
      c.globalCompositeOperation = 'source-over';
    }
    drawLighting(sim) {
      const l = this.lctx;
      l.setTransform(LIGHT_RES, 0, 0, LIGHT_RES, 0, 0);
      l.globalCompositeOperation = 'source-over';
      l.clearRect(0, 0, W, H);
      const fc = sim.phase === 'night' ? sim.forecast : null;
      l.fillStyle = this.lk && this.lk.dark ? `rgba(${this.lk.dark},${Math.min(0.97, this.dark * (this.lk.darkK || 1.14))})` : fc && fc.blood ? `rgba(30,4,8,${this.dark})` : fc && fc.dark ? `rgba(1,1,3,${this.dark})` : `rgba(6,10,24,${this.dark})`;   // blue moonlight; none at all on a pitch-black night
      l.fillRect(0, 0, W, H);
      l.globalCompositeOperation = 'destination-out';
      const flick = 1 + 0.05 * Math.sin(this.time * 13) + 0.04 * Math.sin(this.time * 7.3);
      this.glow(l, FIRE.x, FIRE.y, 380 * flick, 1);
      for (const p of sim.players) {
        if (p.away) continue;
        this.glow(l, p.x, p.y, p.down ? 70 : 125, 0.9);
        if (!p.down) {
          this.cone(l, p.x, p.y, p.aim, 620, 0.62, 0.55);
          this.cone(l, p.x, p.y, p.aim, 660, 0.36, 0.95);
        }
      }
      for (const s of sim.structs) {
        if (s.id === 'lamp') this.glow(l, s.x, s.y, GD.STRUCTS.lamp.light, 1);
        else if (s.id === 'torch') this.glow(l, s.x, s.y, GD.STRUCTS.torch.glow * (1 + 0.06 * Math.sin(this.time * 11 + s.uid)), 0.95);
        else if (s.id === 'lure') this.glow(l, s.x, s.y, 60, 0.5);
        else if (AIMS(s.id)) this.cone(l, s.x, s.y, s.ang, 300, 0.4, 0.5);
        else if (s.id === 'tesla') this.glow(l, s.x, s.y, s.flash > 0 ? 200 : 70, 0.7);
        else if (s.id === 'medic') this.glow(l, s.x, s.y, 100, 0.6);
      }
      for (const f of this.flashes) this.glow(l, f.x, f.y, f.r, 0.9 * (f.life / f.max));
      for (const pl of this.pools) this.glow(l, pl.x, pl.y, pl.r * 2.4, 0.8 * Math.min(1, pl.life / 0.8));
      for (const s of sim.structs) if (s.id === 'sunlance' && s.beam && s.bx !== undefined) this.glow(l, s.bx, s.by, 360, 1);
      if (this.novas) for (const n of this.novas) {                 // the Rekindling ring lights the night as it passes
        const R = n.t * n.speed;
        for (let i = 0; i < 16; i++) { const a = i * TAU / 16; this.glow(l, n.x + Math.cos(a) * R, n.y + Math.sin(a) * R, 200, 0.8); }
      }
      for (const s of sim.structs) {                       // a Hellmouth jet lights up the whole sweep
        if (s.id !== 'hellmouth' || !s.fire) continue;
        for (let d = 80; d <= GD.STRUCTS.hellmouth.reach; d += 110) this.glow(l, s.x + Math.cos(s.ang || 0) * d, s.y + Math.sin(s.ang || 0) * d, 140 + d * 0.15, 0.9);
      }
      let fires = 0;
      for (const z of sim.zombies) { if (z.burn > 0 && fires++ < 30) this.glow(l, z.x, z.y, 70, 0.6); }
      let flames = 0;
      for (const b of sim.bullets) { if (b.kind === 'flame' && (flames++ & 1) === 0) this.glow(l, b.x, b.y, 70, 0.4); }
      l.globalAlpha = 1;
      l.globalCompositeOperation = 'source-over';
    }

    // ---------------------------------------------------------- frame
    // Draw a frame. If anything throws, reset the canvas state so the next frame starts clean.
    safeRender(sim, ui) {
      try { this.render(sim, ui); }
      catch (e) {
        this.diag.resets++;
        if (this.diag.errors.length < 5) this.diag.errors.push(String(e && e.stack || e).split('\n').slice(0, 3).join(' | '));
        const w = this.canvas.width; this.canvas.width = w;    // wipes all context state
        this.ctx = this.canvas.getContext('2d');
        if (this.fx) { const fw = this.fx.width; this.fx.width = fw; this.fctx = this.fx.getContext('2d'); }
      }
    }
    render(sim, ui) {
      const inkStyle = !!(this.lk && this.lk.fxHot);        // the style draws flame and flying blood above the world layer
      this.checkLost(false);
      this.splatBudget = 40;
      // darkness 0..1 (0 in daylight): zombies outside any light are hidden, only their eyes show
      this.nightK = clamp((this.dark - 0.06) / 0.7, 0, 1);
      for (const z of sim.zombies) {
        const lit = z.burn > 0 ? 1 : this.nightK > 0 ? smooth(0.05, 0.45, this.lightAt(z.x, z.y, sim)) : 1;
        z.vis = 1 - this.nightK * (1 - lit);
      }
      let c = this.ctx;
      this.simRef = sim;
      this.showOwners = sim.phase === 'day';
      c.setTransform(1, 0, 0, 1, 0, 0);
      if (this.layered) c.clearRect(0, 0, this.canvas.width, this.canvas.height);
      else { c.fillStyle = '#000'; c.fillRect(0, 0, this.canvas.width, this.canvas.height); }
      // Screen shake fades out as the nights go on: late fights are wall-to-wall explosions and it would never stop.
      // Full strength up to night 6, half by night 13, a third by night 20, about a seventh by night 50. Big jolts are capped.
      const shakeK = 1 / (1 + Math.max(0, (sim.night || 1) - 6) / 7), amp = Math.min(this.shake, 14) * shakeK;
      const sx = amp > 0.05 ? rand(-1, 1) * amp * this.scale : 0, sy = amp > 0.05 ? rand(-1, 1) * amp * this.scale : 0;
      this.placeLayers(sx, sy);
      const worldTf = () => c.setTransform(this.scale, 0, 0, this.scale, this.ox - this.camX * this.scale, this.oy - this.camY * this.scale);
      worldTf();
      c.save();
      c.beginPath(); c.rect(0, 0, W, H); c.clip();
      c.translate(sx / this.scale, sy / this.scale);
      if (!this.layered) {
        c.drawImage(this.groundImg || this.ground, 0, 0);
        c.drawImage(this.decals, 0, 0);
      }

      const builders = sim.players.filter((p) => !p.away && !p.down && p.build && !p.noGhost);
      if (builders.length || (ui && ui.grid)) {
        c.strokeStyle = 'rgba(255,255,255,0.05)'; c.lineWidth = 1;
        c.beginPath();
        for (let x = CELL; x < W; x += CELL) { c.moveTo(x, CELL); c.lineTo(x, H - CELL); }
        for (let y = CELL; y < H; y += CELL) { c.moveTo(CELL, y); c.lineTo(W - CELL, y); }
        c.stroke();
      }

      // Tarborn tar: glossy black puddles with an oily sheen (burning tar is drawn as fire, below)
      if (sim.tar && sim.tar.length) {
        for (const t of sim.tar) {
          if (t.fire > 0) continue;
          const a = Math.min(1, t.t / 2), sd = t.seed !== undefined ? t.seed : (t.id * 7.13) % 6.28;
          c.globalAlpha = 0.82 * a; c.fillStyle = '#0b0b0f';
          c.beginPath(); c.ellipse(t.x, t.y, t.r, t.r * 0.82, sd, 0, TAU); c.fill();
          for (let i = 0; i < 3; i++) {                                     // lumpy edges
            const la = sd * 3 + i * 2.1;
            c.beginPath(); c.arc(t.x + Math.cos(la) * t.r * 0.6, t.y + Math.sin(la) * t.r * 0.55, t.r * (0.42 + 0.1 * i), 0, TAU); c.fill();
          }
          c.globalAlpha = 0.3 * a; c.strokeStyle = '#7a7a98'; c.lineWidth = 1.6;    // sheen
          c.beginPath(); c.ellipse(t.x - t.r * 0.2, t.y - t.r * 0.25, t.r * 0.45, t.r * 0.2, sd - 0.4, 3.6, 5.4); c.stroke();
        }
        c.globalAlpha = 1;
      }
      for (const pl of this.pools) {          // napalm: a flickering pool of fire that fades out at the end
        const f = Math.min(1, pl.life / 0.8) * (0.85 + 0.15 * Math.sin(this.time * 11 + pl.seed));
        const gr = c.createRadialGradient(pl.x, pl.y, 0, pl.x, pl.y, pl.r);
        gr.addColorStop(0, `rgba(255,200,90,${0.55 * f})`); gr.addColorStop(0.55, `rgba(255,110,30,${0.42 * f})`); gr.addColorStop(1, 'rgba(160,40,10,0)');
        c.fillStyle = gr; c.beginPath(); c.arc(pl.x, pl.y, pl.r, 0, TAU); c.fill();
      }
      if (this.lk && this.lk.under) this.lk.under(this, c, sim);
      for (const s of sim.structs) if (!GD.STRUCTS[s.id].block) this.drawStruct(c, s);
      for (const p of sim.players) if (!p.away && p.down) this.drawPlayer(c, p);
      c.fillStyle = 'rgba(0,0,0,0.3)';                          // a shadow under every solid build, drawn first so none falls on a neighbour
      for (const s of sim.structs) if (GD.STRUCTS[s.id].block) c.fillRect(s.cx * CELL + 5, s.cy * CELL + 6, CELL, CELL);
      for (const s of sim.structs) if (GD.STRUCTS[s.id].block) this.drawStruct(c, s);
      if (this.crate) this.drawCrate(c, this.crate);

      // campfire logs
      c.save(); c.translate(FIRE.x, FIRE.y);
      c.fillStyle = '#6a6a66';
      for (let i = 0; i < 9; i++) { c.beginPath(); c.arc(Math.cos(i * 0.698) * 18, Math.sin(i * 0.698) * 18, 4.5, 0, TAU); c.fill(); }
      c.fillStyle = '#3a2514';
      for (let i = 0; i < 3; i++) { c.rotate(1.047); c.fillRect(-13, -3, 26, 6); }
      c.restore();

      const isSeg = (z) => GD.ZOMBIES[z.type] && GD.ZOMBIES[z.type].seg;
      for (const z of sim.zombies) if (z.vis > 0.02 && isSeg(z)) this.drawZombie(c, z);   // wyrm bodies under the crowd
      for (const z of sim.zombies) if (z.vis > 0.02 && !isSeg(z)) this.drawZombie(c, z);
      // the Rekindling: phoenix wings over the Pyre, and a ring of gold fire racing out across the map
      if (this.novas) for (const n of this.novas) {
        const R = n.t * n.speed;
        c.save(); c.globalCompositeOperation = 'lighter';
        const band = 90, inner = Math.max(0, R - band);
        const gr = c.createRadialGradient(n.x, n.y, inner, n.x, n.y, R + 12);
        gr.addColorStop(0, 'rgba(255,120,30,0)'); gr.addColorStop(0.6, 'rgba(255,170,60,0.45)'); gr.addColorStop(0.92, 'rgba(255,245,200,0.85)'); gr.addColorStop(1, 'rgba(255,200,90,0)');
        c.fillStyle = gr; c.beginPath(); c.arc(n.x, n.y, R + 12, 0, TAU); c.arc(n.x, n.y, inner, 0, TAU, true); c.fill();
        if (n.t < 1.2) {                         // outstretched wings of fire
          const a = Math.max(0, 1 - n.t / 1.2), span = 260 * Math.min(1, n.t * 3);
          for (const side of [-1, 1]) {
            for (let f = 0; f < 6; f++) {
              c.fillStyle = `rgba(255,${150 + f * 15},${40 + f * 20},${0.35 * a})`;
              c.beginPath(); c.moveTo(n.x, n.y - 10);
              c.quadraticCurveTo(n.x + side * span * (0.3 + f * 0.1), n.y - 160 + f * 22, n.x + side * span * (0.55 + f * 0.08), n.y - 40 + f * 30);
              c.quadraticCurveTo(n.x + side * span * 0.3, n.y - 20 + f * 6, n.x, n.y + 10); c.fill();
            }
          }
        }
        c.restore();
      }
      // Sunlance beams: a blinding pillar of light where it touches down
      for (const s of sim.structs) {
        if (s.id !== 'sunlance' || !s.beam || s.bx === undefined) continue;
        const R = GD.STRUCTS.sunlance.beamR, t = this.time;
        c.save(); c.globalCompositeOperation = 'lighter';
        let gr = c.createRadialGradient(s.bx, s.by, 0, s.bx, s.by, R * 1.5);
        gr.addColorStop(0, 'rgba(255,250,220,0.9)'); gr.addColorStop(0.35, 'rgba(255,220,120,0.55)'); gr.addColorStop(1, 'rgba(255,160,40,0)');
        c.fillStyle = gr; c.beginPath(); c.arc(s.bx, s.by, R * 1.5, 0, TAU); c.fill();
        c.fillStyle = 'rgba(255,255,255,' + (0.75 + 0.2 * Math.sin(t * 40)) + ')'; c.beginPath(); c.arc(s.bx, s.by, R * 0.28, 0, TAU); c.fill();
        c.strokeStyle = 'rgba(255,240,180,0.7)'; c.lineWidth = 3;
        c.beginPath(); c.arc(s.bx, s.by, R * (0.9 + 0.08 * Math.sin(t * 9)), 0, TAU); c.stroke();
        c.restore();
      }
      // Hellmouth jets: a towering, flickering tongue of fire
      for (const s of sim.structs) if (s.id === 'hellmouth' && s.fire) this.drawHellJet(c, s, GD.STRUCTS.hellmouth);
      // Smokebelcher smoke: billowing grey clouds that drift and thin out
      if (sim.smoke && sim.smoke.length) {
        for (const cl of sim.smoke) {
          const max = cl.max || 7, age = 1 - cl.t / max, a = Math.min(1, cl.t / 1.5) * Math.min(1, age * 4 + 0.3);
          const sd = cl.seed !== undefined ? cl.seed : (cl.id * 3.7) % 6.28, grow = 0.75 + 0.35 * age;
          for (let i = 0; i < 4; i++) {
            const ang = sd + i * 1.57 + this.time * 0.15, off = cl.r * 0.35;
            const px = cl.x + Math.cos(ang) * off + age * 18, py = cl.y + Math.sin(ang) * off - age * 10;
            const gr = c.createRadialGradient(px, py, 0, px, py, cl.r * 0.7 * grow);
            gr.addColorStop(0, `rgba(48,48,54,${0.5 * a})`); gr.addColorStop(1, 'rgba(48,48,54,0)');
            c.fillStyle = gr; c.beginPath(); c.arc(px, py, cl.r * 0.7 * grow, 0, TAU); c.fill();
          }
        }
      }
      c.globalAlpha = 1;
      for (const p of sim.players) if (!p.away && !p.down) this.drawPlayer(c, p);

      // projectiles
      c.lineCap = 'round';
      for (const b of sim.bullets) {
        if (b.kind === 'bullet' && b.wid === 'saw') {          // a spinning sawblade
          const a = this.time * 30;
          c.save(); c.translate(b.x, b.y); c.rotate(a);
          c.fillStyle = '#cfd4da'; c.beginPath();
          for (let i = 0; i < 16; i++) { const rr = i % 2 ? 7 : 10, t = i / 16 * TAU; c.lineTo(Math.cos(t) * rr, Math.sin(t) * rr); }
          c.closePath(); c.fill();
          c.fillStyle = '#6a7078'; c.beginPath(); c.arc(0, 0, 3, 0, TAU); c.fill();
          c.restore();
        } else if (b.kind === 'bullet' && b.wid === 'rail') {   // a Railspike: a long blue-white beam behind it
          const sp = Math.hypot(b.vx, b.vy) || 1, tl = 220;
          c.strokeStyle = 'rgba(120,160,255,0.45)'; c.lineWidth = 7;
          c.beginPath(); c.moveTo(b.x, b.y); c.lineTo(b.x - b.vx / sp * tl, b.y - b.vy / sp * tl); c.stroke();
          c.strokeStyle = 'rgba(235,245,255,0.95)'; c.lineWidth = 2.4;
          c.beginPath(); c.moveTo(b.x, b.y); c.lineTo(b.x - b.vx / sp * tl, b.y - b.vy / sp * tl); c.stroke();
        } else if (b.kind === 'bullet') {
          const sp = Math.hypot(b.vx, b.vy) || 1, tl = b.wid === 'sniper' ? 60 : 26;
          c.strokeStyle = b.wid === 'sniper' ? 'rgba(190,230,255,0.95)' : b.wid === 'cryo' ? 'rgba(180,235,255,0.95)' : 'rgba(255,225,150,0.95)';
          c.lineWidth = b.wid === 'sniper' ? 3 : 2;
          c.beginPath(); c.moveTo(b.x, b.y); c.lineTo(b.x - b.vx / sp * tl, b.y - b.vy / sp * tl); c.stroke();
        } else if (b.kind === 'grenade' || b.kind === 'shell') {
          const t = b.kind === 'shell' ? Math.sin(Math.PI * (1 - b.life / b.max)) : 0;
          c.fillStyle = 'rgba(0,0,0,0.35)'; c.beginPath(); c.arc(b.x + 2, b.y + 3, 4, 0, TAU); c.fill();
          c.fillStyle = '#2c3026'; c.beginPath(); c.arc(b.x, b.y - t * 26, 4.5 + t * 2, 0, TAU); c.fill();
          c.fillStyle = '#ff9d3c'; c.beginPath(); c.arc(b.x, b.y - t * 26, 1.8, 0, TAU); c.fill();
        } else if (b.kind === 'acid') {
          c.fillStyle = '#b6ff4a'; c.beginPath(); c.arc(b.x, b.y, 6, 0, TAU); c.fill();
          c.fillStyle = '#e9ffb0'; c.beginPath(); c.arc(b.x - 1.5, b.y - 1.5, 2.2, 0, TAU); c.fill();
        }
      }

      // particles
      for (const p of this.parts) {
        const t = clamp(p.life / p.max, 0, 1);
        if (p.k === 'blood') {
          if (!inkStyle && this.lk && this.lk.fleck) { c.globalAlpha = 1; this.lk.fleck(this, c, p, BILE.indexOf(p.c) >= 0); continue; }
          if (inkStyle) continue;                 // drawn above the grey layer instead, so it stays red
          c.globalAlpha = 0.9; c.strokeStyle = p.c; c.lineWidth = p.size; c.lineCap = 'round';
          c.beginPath(); c.moveTo(p.x, p.y); c.lineTo(p.x - p.vx * 0.035, p.y - p.vy * 0.035); c.stroke();
        } else if (p.k === 'debris') {
          c.globalAlpha = 0.9; c.fillStyle = p.c; c.beginPath(); c.arc(p.x, p.y, p.size, 0, TAU); c.fill();
        } else if (p.k === 'shell') {
          c.globalAlpha = 1; c.fillStyle = '#e0c060'; c.fillRect(p.x - 2, p.y - 1, 4, 2);
        } else if (p.k === 'smoke') {
          c.globalAlpha = 0.28 * t; c.fillStyle = '#9a9a9a'; c.beginPath(); c.arc(p.x, p.y, p.size * (1.6 - t * 0.6), 0, TAU); c.fill();
        }
      }
      // campfire flames (shrink as the horde beats the fire down)
      const fireK = sim.fireMax ? clamp(sim.fireHp / sim.fireMax, 0, 1) : 1;
      const fireS = sim.phase === 'over' && fireK <= 0 ? 0 : 0.45 + 0.55 * fireK;
      if (!inkStyle) this.drawHot(c, fireS);
      // Leviathan target markers: a red circle that tightens until the shell lands
      if (this.marks && this.marks.length) {
        for (const mk of this.marks) {
          const k = 1 - mk.life / mk.max, pulse = 0.55 + 0.45 * Math.sin(this.time * 18);
          c.strokeStyle = `rgba(255,60,40,${0.35 + 0.4 * k * pulse})`; c.lineWidth = 3; c.setLineDash([12, 8]);
          c.beginPath(); c.arc(mk.x, mk.y, mk.r * (1.15 - 0.15 * k), 0, TAU); c.stroke(); c.setLineDash([]);
          c.strokeStyle = `rgba(255,120,90,${0.5 + 0.4 * k})`; c.lineWidth = 2;
          const q = 18 + 12 * (1 - k);
          c.beginPath(); c.moveTo(mk.x - q, mk.y); c.lineTo(mk.x + q, mk.y); c.moveTo(mk.x, mk.y - q); c.lineTo(mk.x, mk.y + q); c.stroke();
        }
      }
      // campfire health: shown once the horde starts hitting it
      if (sim.phase === 'night' && sim.fireMax && sim.fireHp < sim.fireMax) {
        const bw = 64, bx = FIRE.x - bw / 2, by = FIRE.y + 30;
        c.fillStyle = 'rgba(0,0,0,0.7)'; c.fillRect(bx - 2, by - 2, bw + 4, 9);
        c.fillStyle = fireK > 0.5 ? '#ffb54a' : fireK > 0.25 ? '#ff7a2a' : (Math.floor(this.time * 6) % 2 ? '#ff2a1a' : '#ffd0a0');
        c.fillRect(bx, by, bw * fireK, 5);
        c.font = 'bold 10px "Segoe UI", sans-serif'; c.textAlign = 'center';
        c.fillStyle = '#000'; c.fillText('CAMPFIRE', FIRE.x + 1, by + 17); c.fillStyle = '#ffd9a0'; c.fillText('CAMPFIRE', FIRE.x, by + 16);
      }

      // darkness
      if (this.dark > 0.02) {
        this.drawLighting(sim);
        if (this.layered) { if (this.light.style.visibility) this.light.style.visibility = ''; }
        else c.drawImage(this.light, 0, 0, W, H);
      } else if (this.layered && !this.light.style.visibility) this.light.style.visibility = 'hidden';

      // everything below goes on the effects layer, above the darkness
      if (this.layered) {
        c.restore();
        c = this.fctx;
        c.setTransform(1, 0, 0, 1, 0, 0);
        c.clearRect(0, 0, this.fx.width, this.fx.height);
        worldTf();
        c.save();
        c.beginPath(); c.rect(0, 0, W, H); c.clip();
        c.translate(sx / this.scale, sy / this.scale);
      }

      if (inkStyle) {                             // charcoal: flame and flying blood go above the grey layer and keep their colour
        c.lineCap = 'round'; c.globalAlpha = 0.95;
        for (const p of this.parts) {
          if (p.k !== 'blood') continue;
          if (this.lk.fleck) { c.globalAlpha = 1; this.lk.fleck(this, c, p, BILE.indexOf(p.c) >= 0); c.globalAlpha = 0.95; c.lineCap = 'round'; continue; }
          c.strokeStyle = BILE.indexOf(p.c) >= 0 ? (this.lk.bileFx || '#161618') : (this.lk.bloodFx || '#b3160f'); c.lineWidth = p.size;
          c.beginPath(); c.moveTo(p.x, p.y); c.lineTo(p.x - p.vx * 0.035, p.y - p.vy * 0.035); c.stroke();
        }
        this.drawHot(c, fireS);
      }
      if (this.lk && this.lk.over) this.lk.over(this, c, sim);
      // things that glow through the dark
      c.globalCompositeOperation = 'lighter';
      const eyeA = clamp(this.dark * 1.1, 0, 0.95);
      const pitchNight = sim.phase === 'night' && sim.forecast && sim.forecast.dark;   // no moon: not even their eyes show
      for (const z of sim.zombies) {
        if (z.burrowed || this.nightK <= 0 || pitchNight) continue;
        const ea = eyeA * clamp(1 - (z.vis - (1 - this.nightK)) / Math.max(0.01, this.nightK), 0, 1);   // fades out as the body becomes visible
        if (ea < 0.03) continue;
        const L = ZLOOK[z.type] || ZLOOK.walker, r = z.r, ca = Math.cos(z.ang), sa = Math.sin(z.ang);
        if (z.type === 'wyrmseg' || z.type === 'goreseg') {        // in the dark a wyrm shows as a long, faint chain of plates
          c.globalAlpha = ea * 0.28; c.fillStyle = '#efe2c0';
          c.beginPath(); c.ellipse(z.x, z.y, r * 0.55, r * 0.75, z.ang, 0, TAU); c.fill();
          continue;
        }
        const hx = z.x + ca * r * 0.55, hy = z.y + sa * r * 0.55, e = r * 0.22;
        c.globalAlpha = ea; c.fillStyle = this.lk && this.lk.eye ? this.lk.eye : inkStyle ? '#f4f1e8' : L.eye;
        if (this.lk && this.lk.paleNight) c.globalCompositeOperation = 'source-over';      // a pale fog: eyes are dark marks, not lights
        const er = z.r > 25 ? 3.4 : z.type === 'wyrm' ? 2.8 : z.type === 'screamer' ? 2.2 : 1.6;
        c.beginPath(); c.arc(hx - sa * e, hy + ca * e, er, 0, TAU); c.arc(hx + sa * e, hy - ca * e, er, 0, TAU); c.fill();
      }
      c.globalCompositeOperation = 'lighter';
      for (const f of this.flashes) this.glow(c, f.x, f.y, f.r * 0.5, 0.55 * (f.life / f.max), f.c);
      for (const p of sim.players) {
        if (p.away || p.down || p.flash <= 0) continue;
        const g = GUNLOOK[p.cur] || GUNLOOK.pistol, d = 12 + g.len;
        const mx = p.x + Math.cos(p.aim) * d - Math.sin(p.aim) * 3, my = p.y + Math.sin(p.aim) * d + Math.cos(p.aim) * 3;
        c.globalAlpha = 0.9; c.fillStyle = p.cur === 'arc' ? '#9fe0ff' : '#ffe0a0';
        c.beginPath(); c.arc(mx, my, rand(5, 9), 0, TAU); c.fill();
      }
      for (const s of sim.structs) {
        if (s.id === 'lamp') this.glow(c, s.x, s.y, 46, 0.7, '255,240,190');
        else if (s.id === 'torch') this.glow(c, s.x, s.y - 4, 30 + 4 * Math.sin(this.time * 13 + s.uid), 0.8, '255,170,70');
        else if (AIMS(s.id) && s.flash > 0) { c.globalAlpha = 0.9; c.fillStyle = '#ffe0a0'; c.beginPath(); c.arc(s.x + Math.cos(s.ang) * 24, s.y + Math.sin(s.ang) * 24, rand(4, 8), 0, TAU); c.fill(); }
        else if (s.id === 'tesla') { c.globalAlpha = 0.5 + 0.3 * Math.sin(this.time * 9 + s.uid); c.fillStyle = '#9fe0ff'; c.beginPath(); c.arc(s.x, s.y, s.flash > 0 ? 9 : 4.5, 0, TAU); c.fill(); }
      }
      c.globalAlpha = 1;
      // a style can redraw the game's rings and lightning in its own ink (fxInk), dashed (fxDash), and as marks rather than light (fxOver)
      const fxInk = this.lk && this.lk.fxInk, fxOver = !!(this.lk && this.lk.fxOver);
      if (fxOver) c.globalCompositeOperation = 'source-over';
      for (const a of this.arcs) {
        const t = a.life / a.max;
        for (let pass = 0; pass < 2; pass++) {
          c.strokeStyle = fxInk ? `rgba(${fxInk},${pass ? t : t * 0.35})` : pass ? `rgba(255,255,255,${t})` : `rgba(${a.c || '90,170,255'},${t * 0.6})`;
          c.lineWidth = pass ? 2 : 7;
          c.beginPath();
          a.segs.forEach((q, i) => (i ? c.lineTo(q.x, q.y) : c.moveTo(q.x, q.y)));
          c.stroke();
        }
      }
      for (const r of this.rings) {
        const t = r.life / r.max;
        c.strokeStyle = `rgba(${fxInk || r.c},${t * 0.8})`; c.lineWidth = fxInk ? 1.5 + 3 * t : 2 + 8 * t;
        if (this.lk && this.lk.fxDash) c.setLineDash(this.lk.fxDash);
        c.beginPath(); c.arc(r.x, r.y, r.r * (1 - t * 0.75), 0, TAU); c.stroke();
      }
      c.setLineDash([]);
      c.globalCompositeOperation = 'source-over';

      // weak points: walls touching only at a corner leave a diagonal gap zombies claw through (clearest by day)
      { const solid = (x, y) => { const q = sim.structAt(x, y); return !!q && GD.STRUCTS[q.id].block && !GD.STRUCTS[q.id].husk; };
        const a = (sim.phase === 'day' ? 0.9 : 0.4) * (0.65 + 0.35 * Math.sin(this.time * 5));
        for (const s of sim.structs) {
          if (!GD.STRUCTS[s.id].block || GD.STRUCTS[s.id].husk) continue;
          for (const dy of [-1, 1]) {
            if (!solid(s.cx + 1, s.cy + dy) || solid(s.cx + 1, s.cy) || solid(s.cx, s.cy + dy)) continue;
            const gx = (s.cx + 1) * CELL, gy = (dy > 0 ? s.cy + 1 : s.cy) * CELL;
            c.save(); c.translate(gx, gy); c.rotate(dy > 0 ? Math.PI / 4 : -Math.PI / 4);
            c.fillStyle = `rgba(255,150,40,${a})`; c.fillRect(-9, -2, 18, 4);
            c.fillStyle = `rgba(40,10,0,${a})`; for (const o of [-5, 0, 5]) c.fillRect(o - 0.8, -2, 1.6, 4);
            c.restore();
            if (sim.phase === 'day') { c.font = 'bold 10px "Segoe UI", sans-serif'; c.textAlign = 'center'; c.fillStyle = '#000'; c.fillText('GAP', gx + 1, gy - 9); c.fillStyle = '#ffb060'; c.fillText('GAP', gx, gy - 10); }
          }
        }
      }
      // turrets knocked out by a Disruptor's EMP: dark, with current crawling over them
      for (const s of sim.structs) {
        if (!s.emp) continue;
        c.fillStyle = 'rgba(6,14,24,0.55)'; c.fillRect(s.cx * CELL + 2, s.cy * CELL + 2, CELL - 4, CELL - 4);
        if (Math.random() < 0.7) {
          c.strokeStyle = '#9ff0ff'; c.lineWidth = 1.3; c.beginPath();
          let x = s.cx * CELL + rand(4, 36), y = s.cy * CELL + rand(4, 36); c.moveTo(x, y);
          for (let i = 0; i < 3; i++) { x += rand(-9, 9); y += rand(-9, 9); c.lineTo(x, y); }
          c.stroke();
        }
      }
      // structure health
      for (const s of sim.structs) {
        if (s.hp >= s.maxhp || s.id === 'mine') continue;
        const f = clamp(s.hp / s.maxhp, 0, 1);
        c.fillStyle = 'rgba(0,0,0,0.6)'; c.fillRect(s.x - 15, s.y + 13, 30, 4);
        c.fillStyle = f > 0.5 ? '#6ee36a' : f > 0.25 ? '#ff9d3c' : '#ff5a4f'; c.fillRect(s.x - 14, s.y + 14, 28 * f, 2);
      }
      for (const z of sim.zombies) {
        if (z.burrowed || z.hp >= z.maxhp || !(z.r >= 17) || z.vis < 0.4) continue;
        const w = z.r > 25 ? 90 : 36, f = clamp(z.hp / z.maxhp, 0, 1);
        c.fillStyle = 'rgba(0,0,0,0.6)'; c.fillRect(z.x - w / 2, z.y - z.r - 12, w, 5);
        c.fillStyle = '#ff5a4f'; c.fillRect(z.x - w / 2 + 1, z.y - z.r - 11, (w - 2) * f, 3);
      }

      // build ghosts
      const aimingOwners = new Set();
      for (const s of sim.structs) if (s.aiming && GD.STRUCTS[s.id] && GD.STRUCTS[s.id].aimed) aimingOwners.add(s.owner);
      for (const p of builders) {
        if (aimingOwners.has(p.id) && (p.build === 'move' || (GD.STRUCTS[p.build] && GD.STRUCTS[p.build].aimed))) continue;   // aiming it instead
        const { cx, cy } = sim.buildCell(p);
        const x = cx * CELL, y = cy * CELL;
        const tool = !!GD.TOOLS[p.build];
        const target = sim.structAt(cx, cy);
        let ok, label = '';
        if (p.build === 'move' && p.carry) {
          ok = sim.canPlace(cx, cy);
          if (ok) this.drawStruct(c, Object.assign({}, p.carry, { cx, cy, x: x + CELL / 2, y: y + CELL / 2, hitT: 0 }), 0.6);
        } else if (p.build === 'move') {
          ok = !!target;
          label = ok ? 'PICK UP' : '';
        } else if (tool) {
          ok = !!target;
          if (target) label = '+$' + GD.fmt(sim.sellValue(target));
        } else {
          ok = sim.canPlace(cx, cy);
          if (ok) {
            const def = GD.STRUCTS[p.build];
            this.drawStruct(c, { id: p.build, cx, cy, x: x + CELL / 2, y: y + CELL / 2, ang: p.aim, uid: 0, hitT: 0, flash: 0, gun: def.gun }, 0.55);
            const rng = GD.turretRange(p.build);
            if (def.aimed) {      // the spot only: you aim it right after putting it down
              c.strokeStyle = 'rgba(255,110,80,0.6)'; c.setLineDash([6, 6]); c.lineWidth = 1.5;
              c.beginPath(); c.arc(x + CELL / 2, y + CELL / 2, def.reach || def.minRange, 0, TAU); c.stroke(); c.setLineDash([]);
              c.font = 'bold 13px "Segoe UI", sans-serif'; c.textAlign = 'center';
              c.fillStyle = '#000'; c.fillText('then aim it', x + CELL / 2 + 1, y + CELL + 19); c.fillStyle = '#ffb0a0'; c.fillText('then aim it', x + CELL / 2, y + CELL + 18);
            }
            else if (rng) { c.strokeStyle = 'rgba(255,255,255,0.35)'; c.setLineDash([6, 6]); c.lineWidth = 1.5; c.beginPath(); c.arc(x + CELL / 2, y + CELL / 2, rng, 0, TAU); c.stroke(); c.setLineDash([]); }
          }
        }
        c.strokeStyle = ok ? (p.build === 'sell' ? '#ffd23f' : p.build === 'move' ? '#4fb4ff' : '#7fe08f') : '#ff5a4f';
        c.lineWidth = 2.5; c.strokeRect(x + 1.5, y + 1.5, CELL - 3, CELL - 3);
        c.fillStyle = p.color; c.fillRect(x + 1.5, y - 5, CELL - 3, 3);
        if (label) {
          c.font = 'bold 15px "Segoe UI", sans-serif'; c.textAlign = 'center';
          c.fillStyle = '#000'; c.fillText(label, x + CELL / 2 + 1, y - 9); c.fillStyle = '#fff'; c.fillText(label, x + CELL / 2, y - 10);
        }
      }

      // phone build preview: pending (unconfirmed) cells and the selected structure
      if (ui && ui.pending && ui.pending.cells.length) {
        const pd = ui.pending, pulse = 0.5 + 0.2 * Math.sin(this.time * 6);
        for (const cell of pd.cells) {
          const cx = cell[0], cy = cell[1], x = cx * CELL, y = cy * CELL;
          const ok = sim.canPlace(cx, cy);
          if (ok) this.drawStruct(c, { id: pd.id, cx, cy, x: x + CELL / 2, y: y + CELL / 2, ang: -Math.PI / 2, uid: 0, hitT: 0, flash: 0, gun: GD.STRUCTS[pd.id] && GD.STRUCTS[pd.id].gun }, pulse);
          c.strokeStyle = ok ? '#7fe08f' : '#ff5a4f'; c.lineWidth = 3;
          c.setLineDash([7, 5]); c.strokeRect(x + 2, y + 2, CELL - 4, CELL - 4); c.setLineDash([]);
        }
      }
      if (ui && ui.selected) {
        const sel = ui.selected, x = sel.cx * CELL, y = sel.cy * CELL;
        c.strokeStyle = 'rgba(79,180,255,' + (0.6 + 0.4 * Math.sin(this.time * 7)) + ')'; c.lineWidth = 4;
        c.strokeRect(x - 2, y - 2, CELL + 4, CELL + 4);
      }

      // player labels
      c.textAlign = 'center';
      for (const p of sim.players) {
        if (p.away) continue;
        c.font = 'bold 15px "Segoe UI", sans-serif';
        c.fillStyle = 'rgba(0,0,0,0.75)'; c.fillText(p.name, p.x + 1, p.y - 27);
        c.fillStyle = p.color; c.fillText(p.name, p.x, p.y - 28);
        if (p.down) {
          c.font = 'bold 14px "Segoe UI", sans-serif';
          c.fillStyle = '#ff5a4f'; c.fillText(Math.sin(this.time * 6) > 0 ? 'REVIVE ME!' : 'stand close', p.x, p.y + 34);
          if (p.reviveT > 0) {
            c.strokeStyle = 'rgba(0,0,0,0.6)'; c.lineWidth = 6; c.beginPath(); c.arc(p.x, p.y, 26, 0, TAU); c.stroke();
            c.strokeStyle = '#7fe08f'; c.lineWidth = 4; c.beginPath(); c.arc(p.x, p.y, 26, -Math.PI / 2, -Math.PI / 2 + TAU * (p.reviveT / 3)); c.stroke();
          }
        } else {
          if (p.carry) {
            c.font = 'bold 13px "Segoe UI", sans-serif';
            c.fillStyle = '#000'; c.fillText('carrying ' + GD.STRUCTS[p.carry.id].name, p.x + 1, p.y + 35);
            c.fillStyle = '#9fd4ff'; c.fillText('carrying ' + GD.STRUCTS[p.carry.id].name, p.x, p.y + 34);
          }
          const f = clamp(p.hp / p.maxhp, 0, 1);
          c.fillStyle = 'rgba(0,0,0,0.65)'; c.fillRect(p.x - 19, p.y - 23, 38, 5);
          c.fillStyle = f > 0.5 ? '#6ee36a' : f > 0.25 ? '#ffd23f' : '#ff5a4f'; c.fillRect(p.x - 18, p.y - 22, 36 * f, 3);
          if (p.reloadT > 0) {
            const w = GD.WEAPONS[p.cur], tot = w.reload * (1 - 0.12 * (p.perks.hands || 0));
            c.strokeStyle = 'rgba(0,0,0,0.5)'; c.lineWidth = 5; c.beginPath(); c.arc(p.x, p.y, 22, 0, TAU); c.stroke();
            c.strokeStyle = '#ffffff'; c.lineWidth = 3; c.beginPath(); c.arc(p.x, p.y, 22, -Math.PI / 2, -Math.PI / 2 + TAU * (1 - p.reloadT / tot)); c.stroke();
          }
        }
      }
      for (const t of this.texts) {
        const a = clamp(t.life / t.max * 2, 0, 1);
        c.globalAlpha = a;
        c.font = (t.big ? 'bold 30px ' : 'bold 17px ') + ((this.lk && this.lk.hudFont) || '"Segoe UI", sans-serif');
        c.fillStyle = '#000'; c.fillText(t.text, t.x + 2, t.y + 2);
        c.fillStyle = t.color; c.fillText(t.text, t.x, t.y);
      }
      c.globalAlpha = 1;
      c.restore();

      if (!ui || ui.hud !== false) {
        c.setTransform(this.scale, 0, 0, this.scale, this.ox, this.oy);
        this.drawHud(c, sim, ui);
      }
    }

    // Pre-night briefing: what each enemy type tonight will do.
    drawIntel(c, fc, font, text) {
      const x = 16, w = 470, pad = 12, lh = 17;
      // new, featured and boss types get full descriptions; the rest are listed by name
      const key = fc.types.filter((t) => (fc.fresh && fc.fresh.indexOf(t) >= 0) || fc.featured === t || GD.ZOMBIES[t].cost >= 15 || t === 'boss');
      const rest = fc.types.filter((t) => key.indexOf(t) < 0);
      font(14, '600');
      const wrap = (str) => {
        const words = str.split(' '), lines = [];
        let cur = '';
        for (const wd of words) {
          const tryL = cur ? cur + ' ' + wd : wd;
          if (c.measureText(tryL).width > w - pad * 2 && cur) { lines.push(cur); cur = wd; } else cur = tryL;
        }
        if (cur) lines.push(cur);
        return lines;
      };
      // text layout is the same all day: work it out once and reuse it every frame
      const ck = fc.night + '|' + fc.types.join(',') + '|' + fc.featured + '|' + fc.blood;
      if (!this.intelCache || this.intelCache.key !== ck) {
        this.intelCache = { key: ck, rows: key.map((t) => ({ t, z: GD.ZOMBIES[t], lines: wrap(GD.ZOMBIES[t].desc) })),
          restLines: rest.length ? wrap('Also: ' + rest.map((t) => GD.ZOMBIES[t].name).join(', ')) : [] };
      }
      const rows = this.intelCache.rows, restLines = this.intelCache.restLines;
      const h = 34 + (fc.blood ? 22 : 0) + rows.reduce((a, r) => a + 22 + r.lines.length * lh, 0) + restLines.length * lh + 6;
      const y = 44;
      // fades out while the mouse is over it, so you can see (and build) what is underneath
      const pt = this.hudPointer, over = !!pt && pt.x >= x && pt.x <= x + w && pt.y >= y && pt.y <= y + h;
      this.intelFade = (this.intelFade === undefined ? 1 : this.intelFade) + ((over ? 0.12 : 1) - (this.intelFade === undefined ? 1 : this.intelFade)) * 0.25;
      const fa = this.intelFade;
      if (fa < 0.02) return;
      c.save();
      c.globalAlpha = 0.84 * fa; c.fillStyle = '#0d1016'; c.beginPath(); c.roundRect(x, y, w, h, 9); c.fill();
      c.globalAlpha = fa; c.strokeStyle = fc.blood ? '#8a2020' : '#3a4352'; c.lineWidth = 1; c.stroke();
      c.textAlign = 'left';
      font(17); text('TONIGHT’S THREATS', x + pad, y + 24, '#ffb54a');
      let yy = y + 34;
      if (fc.blood) { font(14); c.fillStyle = '#ff6a5a'; c.fillText('BLOOD MOON: 35% more of them, and faster', x + pad, yy + 14); yy += 22; }
      for (const r of rows) {
        font(16); c.fillStyle = r.z.color; c.fillText(r.z.name, x + pad, yy + 16);
        let tx = x + pad + c.measureText(r.z.name).width + 8;
        font(11);
        if (fc.fresh && fc.fresh.indexOf(r.t) >= 0) { c.fillStyle = '#ff5a4f'; c.fillText('NEW', tx, yy + 15); tx += 32; }
        if (fc.featured === r.t) { c.fillStyle = '#ffd23f'; c.fillText('LOTS OF THEM', tx, yy + 15); }
        font(14, '500'); c.fillStyle = '#c2cad4';
        r.lines.forEach((ln, i) => c.fillText(ln, x + pad, yy + 22 + (i + 1) * lh - 4));
        yy += 22 + r.lines.length * lh;
      }
      font(13, '500'); c.fillStyle = '#8a94a0';
      restLines.forEach((ln, i) => c.fillText(ln, x + pad, yy + (i + 1) * lh - 2));
      c.restore();
    }

    drawHud(c, sim, ui) {
      if (sim.phase === 'lobby') return;
      const hf = (this.lk && this.lk.hudFont) || '"Segoe UI", "Trebuchet MS", sans-serif';
      const font = (px, w) => { c.font = `${w || 'bold'} ${px}px ${hf}`; };
      if (this.lk && this.lk.hudPlate) {           // pale styles: the status text needs something dark behind it
        c.save(); c.translate(W / 2, 0); c.scale(1, 0.2);
        const pg = c.createRadialGradient(0, 0, 0, 0, 0, 640); pg.addColorStop(0, 'rgba(38,34,32,0.6)'); pg.addColorStop(0.6, 'rgba(38,34,32,0.36)'); pg.addColorStop(1, 'rgba(38,34,32,0)');
        c.fillStyle = pg; c.beginPath(); c.arc(0, 0, 640, 0, Math.PI * 2); c.fill(); c.restore();
      }
      const text = (s, x, y, col) => { c.fillStyle = 'rgba(0,0,0,0.8)'; c.fillText(s, x + 2, y + 2); c.fillStyle = col; c.fillText(s, x, y); };
      // incoming-direction warnings
      const fc = sim.forecast;
      if (fc && (sim.phase === 'day' || (sim.phase === 'night' && sim.queue.length))) {
        const a = 0.35 + 0.3 * Math.sin(this.time * 4);
        c.fillStyle = `rgba(255,70,60,${sim.phase === 'day' ? a : a * 0.5})`;
        for (const s of fc.sides) {
          for (let i = -2; i <= 2; i++) {
            c.save();
            if (s === 'N') { c.translate(W / 2 + i * 150, 34); c.rotate(Math.PI / 2); }
            else if (s === 'S') { c.translate(W / 2 + i * 150, H - 70); c.rotate(-Math.PI / 2); }
            else if (s === 'W') { c.translate(34, H / 2 + i * 110); }
            else { c.translate(W - 34, H / 2 + i * 110); c.rotate(Math.PI); }
            c.beginPath(); c.moveTo(-14, -20); c.lineTo(8, 0); c.lineTo(-14, 20); c.lineTo(-4, 0); c.closePath(); c.fill();
            c.restore();
          }
        }
      }
      // top centre status
      c.textAlign = 'center';
      if (sim.phase === 'day') {
        font(34); text('DAYTIME  ·  NIGHT ' + sim.night + ' NEXT', W / 2, 48, '#ffd23f');
        if (fc) {
          const names = fc.sides.map((s) => root.SIM.SIDE_NAMES[s].toUpperCase()).join(' + ');
          const feat = fc.featured !== 'walker' ? '  ·  lots of ' + GD.ZOMBIES[fc.featured].name + 's' : '';
          font(20); text('Scouts report: horde from the ' + names + feat + (fc.boss ? '  ·  ABOMINATION' : ''), W / 2, 78, '#ff9d8f');
        }
        const act = sim.active(), rd = act.filter((p) => p.ready).length;
        font(17, '600'); text(rd + ' / ' + act.length + ' ready  —  night starts when everyone presses READY  (N on keyboard forces it)', W / 2, 102, '#cfd6dd');
        // a broken briefing must never take the whole picture down with it
        if (fc && fc.types) { try { this.drawIntel(c, fc, font, text); } catch (e) { c.restore && c.setTransform(1, 0, 0, 1, 0, 0); if (this.diag.errors.length < 5) this.diag.errors.push('intel: ' + e); } }
      } else if (sim.phase === 'night') {
        font(34); text((fc && fc.blood ? 'BLOOD MOON  ·  ' : '') + 'NIGHT ' + sim.night, W / 2, 48, '#ff5a4f');
        const tot = Math.max(1, sim.totalThisNight), left = sim.queue.length + sim.zombies.filter((z) => !z.dead).length;
        const w = 360, f = clamp(left / tot, 0, 1);
        c.fillStyle = 'rgba(0,0,0,0.6)'; c.fillRect(W / 2 - w / 2, 60, w, 12);
        c.fillStyle = '#b3261e'; c.fillRect(W / 2 - w / 2 + 2, 62, (w - 4) * f, 8);
        font(16, '600'); text(left + ' remaining', W / 2, 92, '#e8e8e8');
      }
      if (this.joinText) { c.textAlign = 'right'; font(17, '600'); text('Join: ' + this.joinText, W - 16, 28, 'rgba(255,255,255,0.75)'); }
      if (ui && ui.hint) { c.textAlign = 'left'; font(15, '600'); text(ui.hint, 16, 26, 'rgba(255,255,255,0.6)'); }

      // player cards
      const act = sim.players.filter((p) => !p.away);
      const cw = Math.min(232, (W - 40) / Math.max(1, act.length) - 8), tot = act.length * (cw + 8) - 8;
      let x = W / 2 - tot / 2;
      const y = H - 62;
      for (const p of act) {
        c.globalAlpha = 0.82; c.fillStyle = '#0d1016'; c.beginPath(); c.roundRect(x, y, cw, 54, 7); c.fill();
        c.globalAlpha = 1; c.fillStyle = p.color; c.beginPath(); c.roundRect(x, y, 6, 54, [7, 0, 0, 7]); c.fill();
        c.textAlign = 'left'; font(16);
        c.fillStyle = '#fff'; c.fillText(p.name, x + 14, y + 19, cw - 90);
        c.textAlign = 'right'; c.fillStyle = '#ffd23f'; c.fillText('$' + GD.fmt(p.money), x + cw - 9, y + 19);
        const f = clamp(p.hp / p.maxhp, 0, 1);
        c.fillStyle = '#2a2f38'; c.fillRect(x + 14, y + 26, cw - 23, 7);
        c.fillStyle = p.down ? '#555' : f > 0.5 ? '#6ee36a' : f > 0.25 ? '#ffd23f' : '#ff5a4f'; c.fillRect(x + 14, y + 26, (cw - 23) * f, 7);
        c.textAlign = 'left'; font(13, '600');
        const w = GD.WEAPONS[p.cur], own = p.weapons[p.cur];
        let line = w.name + '  ' + (p.reloadT > 0 ? 'reloading' : own.mag + (w.infinite ? '' : ' / ' + own.reserve));
        let col = '#aeb6c0';
        if (p.down) { line = 'DOWN - needs revive'; col = '#ff5a4f'; }
        else if (sim.phase === 'day' && p.ready) { line = 'READY'; col = '#7fe08f'; }
        c.fillStyle = col; c.fillText(line, x + 14, y + 48, cw - 22);
        x += cw + 8;
      }
      // banner
      if (this.banner) {
        const b = this.banner, t = b.life / b.max, el = b.max - b.life;
        // long cards fade in slowly (about a second) and out over the last second; short ones snap
        const a = b.slow ? clamp(Math.min(el / 1.1, b.life / 1.0), 0, 1) : clamp(Math.min(t * 4, (1 - t) * 8), 0, 1);
        const h = b.detail ? 190 : 150;
        c.globalAlpha = a; c.textAlign = 'center';
        c.fillStyle = 'rgba(0,0,0,0.5)'; c.fillRect(0, 300, W, h);
        c.font = (this.lk && this.lk.titleFont) ? this.lk.titleFont.replace('PX', '84') : '900 84px Impact, "Arial Black", sans-serif';
        const grow = b.slow ? 1 + 0.04 * clamp(el / b.max, 0, 1) : 1;      // the title creeps closer
        c.save(); c.translate(W / 2, 385); c.scale(grow, grow); text(b.text, 0, 0, b.color); c.restore();
        // the sub line and details arrive a beat after the title
        c.globalAlpha = a * (b.slow ? clamp((el - 0.7) / 0.8, 0, 1) : 1);
        font(26, '600'); text(b.sub, W / 2, 428, '#f0f0f0');
        if (b.detail) { c.globalAlpha = a * clamp((el - 1.6) / 0.8, 0, 1); font(22, '600'); text(b.detail, W / 2, 468, '#ffb0a0'); }
        c.globalAlpha = 1;
      }
      if (ui && ui.paused) {
        c.fillStyle = 'rgba(0,0,0,0.6)'; c.fillRect(0, 0, W, H);
        c.textAlign = 'center'; c.font = '900 90px Impact, "Arial Black", sans-serif'; text('PAUSED', W / 2, H / 2, '#fff');
        font(24, '600'); text('Press P to resume', W / 2, H / 2 + 50, '#cfd6dd');
      }
    }
  }

  Renderer.STYLES = STYLES; Renderer.setTheme = setTheme; Renderer.LOOKS = Renderer.LOOKS || {};
  Renderer.int = { GUNLOOK, ZLOOK };
  root.Renderer = Renderer;
})(window);
