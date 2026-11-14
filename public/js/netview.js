// Last Ember - streams the world from the big screen to phones that show the game.
// encode(): host side, turns the simulation into a compact snapshot.
// Mirror:   phone side, a read-only stand-in for the simulation that the renderer can draw.
(function (root) {
  'use strict';
  const node = typeof module !== 'undefined' && module.exports;
  const GD = node ? require('./data.js') : root.GD;
  const SIM = node ? require('./sim.js') : root.SIM;
  const { CELL, GW, GH, W, H } = GD;
  const { FIRE, PR, pushOut } = SIM;

  const ZT = Object.keys(GD.ZOMBIES);
  const ST = GD.STRUCT_ORDER.concat(['husk']);       // husk: a dead Bonewyrm section (not buildable)
  const WT = GD.WEAPON_ORDER.concat(['turret', 'cannon']);
  const BK = ['bullet', 'flame', 'grenade', 'shell', 'acid'];
  const DYNAMIC = { turret: 1, cannon: 1, tesla: 1, napalm: 1, leviathan: 1, hellmouth: 1, gravity: 1, sunlance: 1, phoenix: 1 };
  for (const id of GD.GT_IDS) DYNAMIC[id] = 1;
  const SKIP = { deny: 1, buy: 1, join: 1, reloaded: 1, swap: 1, dry: 1 };
  const r2 = (v) => Math.round(v * 100) / 100;
  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

  // ---------------------------------------------------------------- host
  function structSig(sim) {
    let s = '';
    for (const st of sim.structs) s += st.uid + ':' + st.cx + ',' + st.cy + ',' + Math.ceil(st.hp / st.maxhp * 20) + (st.gun || '') + ';';
    return s;
  }
  function encodeStructs(sim) {
    // ids go by name, not list position: a page still running older code then never mixes up two builds
    return sim.structs.map((s) => [s.uid, s.id, s.cx, s.cy, Math.ceil(s.hp / s.maxhp * 100), s.owner, s.gun || '', s.face === undefined ? null : r2(s.face)]);
  }
  function encode(sim, events, seq) {
    const P = [];
    for (const p of sim.players) {
      if (p.away) continue;
      const w = GD.WEAPONS[p.cur];
      const tot = w.reload * (1 - 0.12 * (p.perks.hands || 0));
      P.push([p.id, p.name, p.color, Math.round(p.x * 10) / 10, Math.round(p.y * 10) / 10, r2(p.aim), Math.ceil(p.hp), p.maxhp,
        (p.down ? 1 : 0) | (p.moving ? 2 : 0) | (p.ready ? 4 : 0) | (p.flash > 0 ? 8 : 0) | (p.hurtT > 0.2 ? 16 : 0),
        WT.indexOf(p.cur), r2(p.reviveT), p.reloadT > 0 ? r2(p.reloadT / tot) : 0,
        p.carry ? [p.carry.id, p.carry.gun || ''] : 0, 0,
        Math.floor(p.money), p.weapons[p.cur].mag, w.infinite ? -1 : p.weapons[p.cur].reserve,
        p.build || 0, p.buildAt ? Math.round(p.buildAt.x) : -1, p.buildAt ? Math.round(p.buildAt.y) : -1, p.noGhost ? 1 : 0]);
    }
    const Z = [];
    for (const z of sim.zombies) {
      if (z.dead) continue;
      Z.push([z.id, ZT.indexOf(z.type), Math.round(z.x), Math.round(z.y), r2(z.ang),
        (z.hitT > 0 ? 1 : 0) | (z.burn > 0 ? 2 : 0) | (z.lunge > 0.5 ? 4 : 0) | (z.burrowed ? 8 : 0) | (z.leap ? 16 : 0) |
        (z.rage > 0 ? 32 : 0) | (z.charge ? 64 : 0) | (z.lit ? 128 : 0) | (z.raised ? 256 : 0) | (z.stunImm > 0 ? 512 : 0) | (z.chill > 0 ? 1024 : 0) |
        (z.sqz ? 32768 : 0) | (z.champ === 'armored' ? 4096 : z.champ === 'swift' ? 8192 : z.champ === 'regen' ? 16384 : 0), Math.ceil(z.hp / z.maxhp * 100), z.leap ? r2(z.air) : z.fly ? 0.55 : z.climb ? 0.3 : 0]);
    }
    const B = [];
    for (const b of sim.bullets) {
      B.push([BK.indexOf(b.kind), Math.round(b.x), Math.round(b.y), Math.round(b.vx), Math.round(b.vy), WT.indexOf(b.wid), r2(b.life), r2(b.max || 1)]);
    }
    const T = [];
    for (const s of sim.structs) {
      if (!DYNAMIC[s.id]) continue;
      const w = s.gun && GD.WEAPONS[s.gun];
      T.push([s.uid, r2(s.ang || 0), (s.flash > 0 ? 1 : 0) | (s.reloadT > 0 ? 4 : 0) | (s.aimBy ? 8 : 0) | (s.fire > 0 ? 16 : 0) | (s.emp > 0 ? 32 : 0) | (s.beam ? 64 : 0),
        w ? Math.ceil((s.mag || 0) / w.mag * 100) : s.id === 'hellmouth' || s.id === 'phoenix' ? Math.round(100 * (1 - clamp((s.charge || 0) / GD.STRUCTS[s.id].charge, 0, 1))) : 0,
        s.id === 'sunlance' ? Math.round(s.bx === undefined ? s.x : s.bx) : 0, s.id === 'sunlance' ? Math.round(s.by === undefined ? s.y : s.by) : 0]);
    }
    const E = [];
    if (events) {
      // keep every gameplay-relevant event, but cap the purely cosmetic ones so a snapshot never balloons
      let cosmetic = 0;
      for (const e of events) {
        if (SKIP[e.type]) continue;
        if (e.type === 'shot' || e.type === 'hit' || e.type === 'structHit') { if (++cosmetic > 60) continue; }
        if (E.length >= 160) break;
        E.push(e);
      }
    }
    return { t: 'w', k: seq, ph: sim.phase, n: sim.night, q: sim.queue.length, tot: sim.totalThisNight, fc: sim.forecast,
      fh: [Math.ceil(sim.fireHp || 0), sim.fireMax || 0], P, Z, B, T, E };
  }

  // ---------------------------------------------------------------- phone
  class Mirror {
    constructor(selfId) {
      this.selfId = selfId;
      this.players = []; this.zombies = []; this.bullets = []; this.structs = [];
      this.tar = [];                    // Tarborn tar, kept from 'tar' events and aged here
      this.smoke = [];                  // Smokebelcher clouds, the same way
      this.grid = new Array(GW * GH).fill(null);
      this.pmap = new Map(); this.zmap = new Map(); this.smap = new Map();
      this.phase = 'lobby'; this.night = 0; this.queue = { length: 0 }; this.totalThisNight = 0; this.forecast = null;
      this.sv = -1; this.curT = 0; this.gap = 0.05; this.t = 0; this.seq = -1;
      // jitter buffer: draw everyone a little in the past, between two snapshots we already have
      this.best = null; this.jit = 0; this.delay = 75; this.rt = 0;
      this.pred = null;       // predicted position of our own survivor
    }
    // renderer-facing helpers
    getPlayer(id) { return this.pmap.get(id) || null; }
    active() { return this.players; }
    structAt(cx, cy) { return (cx < 0 || cy < 0 || cx >= GW || cy >= GH) ? null : this.grid[cy * GW + cx]; }
    canPlace(cx, cy) { return cx >= 1 && cy >= 1 && cx <= GW - 2 && cy <= GH - 2 && !(cx === FIRE.cx && cy === FIRE.cy) && !this.grid[cy * GW + cx]; }
    buildCell(p) {
      if (p.buildAt) return { cx: Math.floor(p.buildAt.x / CELL), cy: Math.floor(p.buildAt.y / CELL) };
      return { cx: Math.floor((p.x + Math.cos(p.aim) * 58) / CELL), cy: Math.floor((p.y + Math.sin(p.aim) * 58) / CELL) };
    }
    sellValue(s) { return Math.floor(GD.STRUCTS[s.id].cost * 0.6 * Math.max(0, s.hp) / 100); }
    self() { return this.pmap.get(this.selfId) || null; }
    // Where the camera should look: you, else your team, else the campfire. Never the map corner.
    focus() {
      const me = this.self();
      if (me) return { x: me.x, y: me.y };
      if (this.players.length) {
        let x = 0, y = 0;
        for (const p of this.players) { x += p.x; y += p.y; }
        return { x: x / this.players.length, y: y / this.players.length };
      }
      return { x: FIRE.x, y: FIRE.y };
    }

    apply(m, now) {
      this.gap = clamp(now - this.curT, 0.03, 0.2);
      this.curT = now;
      // server time of this snapshot vs. our clock: the smallest gap seen is the network's best case,
      // anything above it is jitter. The render delay follows the jitter (fast up, slow down).
      const loc = now * 1000, ts = typeof m.ts === 'number' ? m.ts : loc, lag = loc - ts;
      if (this.best === null || lag < this.best) this.best = lag; else this.best += 0.02;
      const late = lag - this.best;
      this.jit = Math.max(late, this.jit * 0.97);
      const want = clamp(62 + this.jit * 1.15, 62, 280);
      this.delay += (want - this.delay) * (want > this.delay ? 0.3 : 0.02);
      this.phase = m.ph; this.night = m.n; this.queue.length = m.q; this.totalThisNight = m.tot;
      if (m.fh) { this.fireHp = m.fh[0]; this.fireMax = m.fh[1]; }
      if (m.fc !== undefined) this.forecast = GD.cleanForecast(m.fc);
      if (m.meta) this.meta = m.meta;
      if (m.S) {
        this.structs = []; this.grid.fill(null);
        const old = this.smap; this.smap = new Map();
        for (const a of m.S) {
          const prev = old.get(a[0]);
          const s = { uid: a[0], id: typeof a[1] === 'string' ? a[1] : ST[a[1]], cx: a[2], cy: a[3], x: a[2] * CELL + CELL / 2, y: a[3] * CELL + CELL / 2, hp: a[4], maxhp: 100,
            owner: a[5], gun: typeof a[6] === 'string' ? (a[6] || null) : a[6] >= 0 ? WT[a[6]] : null, ang: prev ? prev.ang : 0, flash: 0, hitT: 0, empty: false, reloadT: 0, mag: 0, face: typeof a[7] === 'number' ? a[7] : undefined };
          if (!GD.STRUCTS[s.id]) continue;
          this.structs.push(s); this.smap.set(s.uid, s); this.grid[s.cy * GW + s.cx] = s;
        }
      }
      for (const a of m.T) {
        const s = this.smap.get(a[0]);
        if (!s) continue;
        s.ang = a[1]; s.flash = (a[2] & 1) ? 0.06 : 0; s.reloadT = (a[2] & 4) ? 1 : 0; s.aiming = !!(a[2] & 8); s.fire = (a[2] & 16) ? 1 : 0; s.emp = (a[2] & 32) ? 1 : 0;
        if (s.id === 'hellmouth' || s.id === 'phoenix') s.chargeK = a[3] / 100;
        if (s.id === 'sunlance') { s.beam = !!(a[2] & 64); s.tbx = a[4]; s.tby = a[5]; if (s.bx === undefined || !s.beam) { s.bx = a[4]; s.by = a[5]; } }
        const w = s.gun && GD.WEAPONS[s.gun];
        s.mag = w ? a[3] / 100 * w.mag : 0;
      }
      // survivors
      const seenP = new Set();
      for (const a of m.P) {
        let p = this.pmap.get(a[0]);
        if (!p) {
          p = { id: a[0], x: a[3], y: a[4], aim: a[5], walk: 0, away: false, perks: {}, build: null };
          this.pmap.set(p.id, p);
        }
        seenP.add(p.id);
        p.name = a[1]; p.color = a[2];
        p.fx = p.x; p.fy = p.y; p.tx = a[3]; p.ty = a[4]; p.fa = p.aim; p.ta = a[5];
        hist(p, ts, a[3], a[4], a[5], 0);
        p.hp = a[6]; p.maxhp = a[7];
        p.down = !!(a[8] & 1); p.moving = !!(a[8] & 2); p.ready = !!(a[8] & 4);
        p.flash = (a[8] & 8) ? 0.06 : 0; p.hurtT = (a[8] & 16) ? 0.3 : 0;
        p.cur = WT[a[9]] || 'pistol'; p.reviveT = a[10];
        p.reloadT = a[11] * GD.WEAPONS[p.cur].reload;
        p.money = a[14] || 0;
        p.weapons = {}; p.weapons[p.cur] = { mag: a[15] || 0, reserve: a[16] === undefined ? 0 : a[16], lvl: 0 };
        p.build = a[17] || null; p.buildAt = a[18] >= 0 ? { x: a[18], y: a[19] } : null; p.noGhost = !!a[20];
        p.carry = a[12] ? { id: typeof a[12][0] === 'string' ? a[12][0] : ST[a[12][0]], gun: typeof a[12][1] === 'string' ? (a[12][1] || null) : a[12][1] >= 0 ? WT[a[12][1]] : null, ang: 0, uid: 0, flash: 0, hitT: 0, hp: 100, maxhp: 100, cx: 0, cy: 0, x: 0, y: 0 } : null;
      }
      for (const id of [...this.pmap.keys()]) if (!seenP.has(id)) this.pmap.delete(id);
      this.players = [...this.pmap.values()];
      // zombies
      const seenZ = new Set();
      for (const a of m.Z) {
        let z = this.zmap.get(a[0]);
        const type = ZT[a[1]];
        if (!z) {
          z = { id: a[0], type, x: a[2], y: a[3], ang: a[4], r: GD.ZOMBIES[type].r, wob: Math.random() * 6, lunge: 0, maxhp: 100, dead: false };
          this.zmap.set(z.id, z);
        }
        seenZ.add(z.id);
        z.fx = z.x; z.fy = z.y; z.tx = a[2]; z.ty = a[3];
        if (!z.h) z.ang = a[4];
        hist(z, ts, a[2], a[3], a[4], a[7] || 0);
        z.hitT = (a[5] & 1) ? 0.1 : 0; z.burn = (a[5] & 2) ? 1 : 0;
        if (a[5] & 4) z.lunge = 1;
        z.burrowed = !!(a[5] & 8); z.rage = (a[5] & 32) ? 1 : 0; z.charge = (a[5] & 64) ? 1 : null; z.lit = (a[5] & 128) ? 1 : 0; z.raised = !!(a[5] & 256); z.stunImm = (a[5] & 512) ? 1 : 0; z.chill = (a[5] & 1024) ? 1 : 0;
        z.sqz = !!(a[5] & 32768);
        z.champ = (a[5] & 4096) ? 'armored' : (a[5] & 8192) ? 'swift' : (a[5] & 16384) ? 'regen' : null;
        z.fair = z.air || 0; z.tair = a[7] || 0;
        z.hp = a[6];
      }
      for (const id of [...this.zmap.keys()]) if (!seenZ.has(id)) this.zmap.delete(id);
      this.zombies = [...this.zmap.values()];
      // projectiles are simply extrapolated from the newest snapshot
      this.bullets = m.B.map((a) => ({ kind: BK[a[0]], x: a[1], y: a[2], vx: a[3], vy: a[4], wid: WT[a[5]], life: a[6], max: a[7], r: 4 }));
      if (m.ph !== 'night' && this.tar.length) this.tar = [];
      if (m.ph !== 'night' && this.smoke.length) this.smoke = [];
      const E = m.E || [];
      for (const e of E) {
        if (e.type === 'tar') this.tar.push({ id: e.id, x: e.x, y: e.y, r: e.r, t: e.t, fire: 0, seed: (e.id * 7.13) % 6.28 });
        else if (e.type === 'tarFire') { const t = this.tar.find((q) => q.id === e.id); if (t) { t.fire = 4; t.t = 4; } }
        else if (e.type === 'tarGone') this.tar = this.tar.filter((q) => q.id !== e.id);
        else if (e.type === 'tarClear') { this.tar = []; this.smoke = []; }
        else if (e.type === 'smoke') { this.smoke.push({ id: e.id, x: e.x, y: e.y, r: e.r, t: e.t, max: e.t, seed: (e.id * 3.7) % 6.28 }); if (this.smoke.length > 120) this.smoke.shift(); }
      }
      return E;
    }
    inTar(x, y) { for (const t of this.tar) if ((t.x - x) ** 2 + (t.y - y) ** 2 < t.r * t.r) return true; return false; }

    // Advance interpolation. `ctl` = { mx, my, aim (number|null), speed, frozen } for our own survivor.
    step(dt, now, ctl) {
      this.t += dt;
      if (this.tar.length) {
        for (const t of this.tar) { t.t -= dt; if (t.fire > 0) t.fire -= dt; }
        if (this.tar.some((t) => t.t <= 0)) this.tar = this.tar.filter((t) => t.t > 0);
      }
      if (this.smoke.length) { for (const c of this.smoke) c.t -= dt; if (this.smoke.some((c) => c.t <= 0)) this.smoke = this.smoke.filter((c) => c.t > 0); }
      const rt = this.best === null ? 0 : now * 1000 - this.best - this.delay;   // server time being shown
      this.rt = rt;
      for (const z of this.zombies) {
        if (z.h) { sampleAt(z, rt); z.ang = z.sa; z.air = z.sair; }
        z.wob += dt * (4 + GD.ZOMBIES[z.type].speed * 0.08);
        if (z.lunge > 0) z.lunge -= dt * 4;
      }
      for (const p of this.players) {
        if (p.id === this.selfId) continue;
        if (p.h) { sampleAt(p, rt); p.aim = p.sa; }
        if (p.moving) p.walk += dt * 11;
      }
      for (const b of this.bullets) {
        b.x += b.vx * dt; b.y += b.vy * dt; b.life -= dt;
        if (b.kind === 'flame') b.r = 5 + 20 * (1 - Math.max(0, b.life) / b.max);
      }
      const me = this.self();
      if (me) {
        // Predict our own movement locally so the stick feels instant, then ease toward the truth.
        if (!this.pred || Math.hypot(this.pred.x - me.tx, this.pred.y - me.ty) > 110 || me.down || !ctl || ctl.frozen) this.pred = { x: me.tx, y: me.ty };
        const q = this.pred;
        if (ctl && !ctl.frozen && !me.down) {
          const sp = ctl.speed * (this.tar.length && this.inTar(q.x, q.y) ? 0.5 : 1);      // tar slows us here too
          q.x += ctl.mx * sp * dt; q.y += ctl.my * sp * dt;
          const gx = Math.floor(q.x / CELL), gy = Math.floor(q.y / CELL);
          for (let oy = -1; oy <= 1; oy++) {
            for (let ox = -1; ox <= 1; ox++) {
              const s = this.structAt(gx + ox, gy + oy);
              if (!s) continue;
              const def = GD.STRUCTS[s.id];
              if (def.block && !def.gate && !def.walk && this.phase !== 'day') pushOut(q, PR, s.cx * CELL, s.cy * CELL);
            }
          }
          const dx = q.x - FIRE.x, dy = q.y - FIRE.y, d = Math.hypot(dx, dy), min = FIRE.r + PR;
          if (d < min && d > 0.01) { q.x += dx / d * (min - d); q.y += dy / d * (min - d); }
          q.x = clamp(q.x, PR, W - PR); q.y = clamp(q.y, PR, H - PR);
          const ex = me.tx - q.x, ey = me.ty - q.y, e = Math.hypot(ex, ey);
          if (e > 22) { const pull = Math.min(1, dt * 5) * (e - 22) / e; q.x += ex * pull; q.y += ey * pull; }
          const mv = Math.abs(ctl.mx) + Math.abs(ctl.my) > 0.1;
          me.moving = mv;
          if (ctl.aim !== null) me.aim = ctl.aim;
          else if (mv) me.aim = Math.atan2(ctl.my, ctl.mx);
          else me.aim = me.ta;
        } else me.aim = me.ta;
        me.x = q.x; me.y = q.y;
        if (me.moving) me.walk += dt * 11;
      }
    }
  }

  // Position history (server time, x, y, angle, air) for buffered interpolation.
  function hist(o, ts, x, y, ang, air) {
    const h = o.h || (o.h = []);
    if (h.length && ts <= h[h.length - 1][0]) h.length = 0;          // clock reset / duplicate: start over
    h.push([ts, x, y, ang, air]);
    if (h.length > 6) h.shift();
  }
  const lerpAng = (a, b, f) => {
    let d = (b - a) % (Math.PI * 2);
    if (d > Math.PI) d -= Math.PI * 2; if (d < -Math.PI) d += Math.PI * 2;
    return a + d * f;
  };
  // Sets o.x, o.y, o.sa (angle), o.sair at server time rt.
  function sampleAt(o, rt) {
    const h = o.h, n = h.length - 1, last = h[n];
    if (rt >= last[0] || n === 0) {
      // ran past the newest snapshot (it is late): keep moving a little, then hold
      if (n > 0 && rt > last[0]) {
        const a = h[n - 1], span = last[0] - a[0];
        const f = span > 0 ? Math.min(rt - last[0], 70) / span : 0;
        const jump = Math.abs(last[1] - a[1]) + Math.abs(last[2] - a[2]);
        if (jump < 120) { o.x = last[1] + (last[1] - a[1]) * f; o.y = last[2] + (last[2] - a[2]) * f; }
        else { o.x = last[1]; o.y = last[2]; }
      } else { o.x = last[1]; o.y = last[2]; }
      o.sa = last[3]; o.sair = last[4];
      return;
    }
    let i = n;
    while (i > 0 && h[i - 1][0] > rt) i--;
    if (i === 0) { o.x = h[0][1]; o.y = h[0][2]; o.sa = h[0][3]; o.sair = h[0][4]; return; }
    const a = h[i - 1], b = h[i], f = (rt - a[0]) / Math.max(1, b[0] - a[0]);
    o.x = a[1] + (b[1] - a[1]) * f; o.y = a[2] + (b[2] - a[2]) * f;
    o.sa = lerpAng(a[3], b[3], f); o.sair = a[4] + (b[4] - a[4]) * f;
  }

  // ---------------------------------------------------------------- replay
  // Keeps the last few seconds of raw snapshots. After the run is lost, they play back through a fresh Mirror
  // (with their original timing) so the renderer can show exactly what happened.
  class Replay {
    constructor(seconds) { this.keep = seconds || 3.5; this.buf = []; this.S = null; this.frozen = false; this.play = null; }
    reset() { this.buf = []; this.S = null; this.frozen = false; this.play = null; }
    // raw: the snapshot as received (a string); m: the parsed one; t: seconds
    record(raw, m, t) {
      if (m.S) this.S = m.S;                      // structures are only sent when they change: remember the latest
      if (this.frozen) return;
      this.buf.push({ t, raw, S: this.S });
      while (this.buf.length > 2 && t - this.buf[1].t > this.keep) this.buf.shift();
    }
    has() { return this.buf.length > 3; }
    start(now, selfId) {
      if (!this.has()) return null;
      this.frozen = true;
      this.play = { mirror: new Mirror(selfId || null), t0: now, base: this.buf[0].t, i: 0, end: this.buf[this.buf.length - 1].t - this.buf[0].t };
      return this.play.mirror;
    }
    stop() { this.play = null; }
    get playing() { return !!this.play; }
    get progress() { return this.play ? clamp((this.play.cur || 0) / Math.max(0.01, this.play.end), 0, 1) : 0; }
    // feed every frame that is due; returns their events (for effects and sound). Ends a moment after the last.
    step(now) {
      const pl = this.play;
      if (!pl) return [];
      const at = now - pl.t0;
      pl.cur = Math.min(at, pl.end);
      const evs = [];
      while (pl.i < this.buf.length && this.buf[pl.i].t - pl.base <= at) {
        const f = this.buf[pl.i];
        let m;
        try { m = JSON.parse(f.raw); } catch (e) { pl.i++; continue; }
        if (pl.i === 0 && !m.S && f.S) m.S = f.S;
        if (m.meta) m.meta = Object.assign({}, m.meta, { paused: false });
        for (const e of pl.mirror.apply(m, now)) evs.push(e);
        pl.i++;
      }
      if (at > pl.end + 0.8) this.play = null;
      return evs;
    }
  }

  const API = { encode, encodeStructs, structSig, Mirror, Replay };
  if (node) module.exports = API;
  else root.NetView = API;
})(typeof window !== 'undefined' ? window : globalThis);
