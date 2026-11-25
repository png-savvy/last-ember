// Last Ember - game simulation. No DOM access in here so it can be tested headless.
(function (root) {
  'use strict';
  const GD = (typeof module !== 'undefined' && module.exports) ? require('./data.js') : root.GD;
  const { CELL, GW, GH, W, H } = GD;
  const FIRE = { x: 24 * CELL + CELL / 2, y: 13 * CELL + CELL / 2, cx: 24, cy: 13, r: 17 };
  // The campfire can be smashed: if the horde puts it out, the run is lost. Tougher every night, healed at dawn.
  const FIRE_HP = 2500;
  const fireMaxFor = (night) => Math.round(FIRE_HP * (1 + 0.12 * (Math.max(1, night) - 1)));
  const TURRET_SET = new Set(GD.TURRET_IDS);
  const GAP_R = 17, GAP_COST = 3;      // diagonal gaps: zombies up to this radius squeeze through; what the detour is worth
  const newRunId = () => Date.now().toString(36) + Math.floor(Math.random() * 1e6).toString(36);
  const PR = 14;                 // player radius
  const HB = 3;                  // spatial hash border (cells) for things outside the map
  const HW = GW + HB * 2, HH = GH + HB * 2;
  const SIDES = ['N', 'E', 'S', 'W'];
  const SIDE_NAMES = { N: 'north', E: 'east', S: 'south', W: 'west' };

  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  const rand = (a, b) => a + Math.random() * (b - a);
  const pick = (arr) => arr[(Math.random() * arr.length) | 0];
  function angDiff(a, b) {
    let d = (a - b) % (Math.PI * 2);
    if (d > Math.PI) d -= Math.PI * 2;
    if (d < -Math.PI) d += Math.PI * 2;
    return d;
  }
  function segDist2(px, py, ax, ay, bx, by) {
    const dx = bx - ax, dy = by - ay;
    const l2 = dx * dx + dy * dy;
    let t = l2 > 0 ? ((px - ax) * dx + (py - ay) * dy) / l2 : 0;
    t = clamp(t, 0, 1);
    const qx = ax + dx * t - px, qy = ay + dy * t - py;
    return qx * qx + qy * qy;
  }
  // Push a circle out of a grid cell. Returns true if they overlapped.
  function pushOut(e, r, bx, by) {
    const nx = clamp(e.x, bx, bx + CELL), ny = clamp(e.y, by, by + CELL);
    const dx = e.x - nx, dy = e.y - ny;
    const d2 = dx * dx + dy * dy;
    if (d2 >= r * r) return false;
    if (d2 > 1e-6) {
      const d = Math.sqrt(d2), k = (r - d) / d;
      e.x += dx * k; e.y += dy * k;
    } else {
      const l = e.x - bx, rr = bx + CELL - e.x, t = e.y - by, b = by + CELL - e.y;
      const m = Math.min(l, rr, t, b);
      if (m === l) e.x = bx - r; else if (m === rr) e.x = bx + CELL + r;
      else if (m === t) e.y = by - r; else e.y = by + CELL + r;
    }
    return true;
  }

  class Sim {
    constructor() {
      this.players = [];
      this.difficulty = 'normal';
      this.events = [];
      this.hash = [];
      for (let i = 0; i < HW * HH; i++) this.hash.push([]);
      this.flow = new Float32Array(GW * GH);
      this.heap = [];
      this.nextId = 1;
      this.resetWorld();
      this.phase = 'lobby';
      this.dev = { money: false, startNight: 1 };   // dev mode: infinite funds, starting night
    }

    // ------------------------------------------------------------ lifecycle
    resetWorld() {
      this.zombies = [];
      this.bullets = [];
      this.pools = [];                  // napalm fire on the ground
      this.tar = [];                    // Tarborn tar on the ground: slows survivors, burns when lit
      this.smoke = [];                  // Smokebelcher clouds: a Leviathan cannot see into them
      this.structs = [];
      this.grid = new Array(GW * GH).fill(null);
      this.queue = [];
      this.spawnT = 0;
      this.spawnGap = 1;
      this.night = 0;
      this.time = 0;
      this.flowT = 0;
      this.flowDirty = true;
      this.forecast = null;
      this.stats = { kills: 0, built: 0, nights: 0 };
      this.corpses = [];                // recent deaths a Gravecaller can raise
      this.fireMax = FIRE_HP; this.fireHp = FIRE_HP; this.fireHitAt = -9;
      this.totalThisNight = 0;
      this.flow.fill(Infinity);
    }
    emit(type, data) {
      const e = data || {};
      e.type = type;
      this.events.push(e);
    }
    diff() { return GD.DIFFICULTY[this.difficulty] || GD.DIFFICULTY.normal; }
    active() { return this.players.filter((p) => !p.away); }
    alive() { return this.players.filter((p) => !p.away && !p.down); }
    getPlayer(id) { return this.players.find((p) => p.id === id) || null; }

    freshLoadout(p) {
      p.weapons = { pistol: { lvl: 0, mag: GD.WEAPONS.pistol.mag, reserve: 0 } };
      p.order = ['pistol'];
      p.cur = 'pistol';
      p.perks = {};
      p.maxhp = 100;
      p.hp = 100;
      p.down = false;
      p.reviveT = 0;
      p.cd = 0;
      p.reloadT = 0;
      p.build = null;
      p.buildAt = null;
      p.carry = null;
      p.undo = [];
      p.quick = false;
      p.noGhost = false;
      p.ready = false;
      p.kills = 0;
      p.earned = 0;
      p.hurtT = 0;
      p.dryT = 0;
      p.money = GD.START_MONEY;
    }
    spawnPoint(i) {
      const a = (i / 8) * Math.PI * 2 + 0.4;
      return { x: FIRE.x + Math.cos(a) * 85, y: FIRE.y + Math.sin(a) * 85 };
    }
    addPlayer(id, name, opts) {
      let p = this.getPlayer(id);
      if (!p && name && (this.phase === 'day' || this.phase === 'night')) {
        // someone with the same name left (or was restored from a save): take that survivor back over
        const nm = name.toLowerCase();
        const old = this.players.find((q) => q.away && q.name.toLowerCase() === nm);
        if (old) { this.reassign(old, id); p = old; }
      }
      if (p) {
        const back = p.away && this.phase === 'night';
        p.away = false;
        if (back) this.rescaleWave(+1);
        if (name) p.name = name;
        return p;
      }
      const used = new Set(this.players.map((q) => q.color));
      const color = GD.PLAYER_COLORS.find((c) => !used.has(c)) || pick(GD.PLAYER_COLORS);
      const sp = this.spawnPoint(this.players.length);
      p = {
        id, name: name || 'Survivor', color, x: sp.x, y: sp.y, aim: -Math.PI / 2, kvx: 0, kvy: 0,
        away: false, keyboard: !!(opts && opts.keyboard), walk: 0, moving: false, flash: 0,
        input: { mx: 0, my: 0, aim: null, fire: false, assist: false },
      };
      this.freshLoadout(p);
      if (this.phase === 'day' || this.phase === 'night') {
        // catch-up cash: most of what the average teammate has earned so far, so a late joiner can gear up
        const others = this.active();
        const avg = others.length ? others.reduce((a, q) => a + q.earned, 0) / others.length : 0;
        p.money += Math.round(avg * 0.7);
      }
      this.players.push(p);
      if (this.phase === 'night') this.rescaleWave(+1);
      this.emit('join', { pid: id, name: p.name });
      return p;
    }
    removePlayer(id) {
      const p = this.getPlayer(id);
      if (!p) return;
      if (this.phase === 'lobby' || this.phase === 'over') {
        this.players = this.players.filter((q) => q !== p);
      } else {
        this.cancelCarry(p);
        if (!p.away && this.phase === 'night') { p.away = true; this.rescaleWave(-1); }
        p.away = true;
        p.input = { mx: 0, my: 0, aim: null, fire: false, assist: false };
        p.build = null;
      }
      this.flowDirty = true;
    }
    setInput(id, inp) {
      const p = this.getPlayer(id);
      if (!p) return;
      let mx = +inp.mx || 0, my = +inp.my || 0;
      const m = Math.hypot(mx, my);
      if (m > 1) { mx /= m; my /= m; }
      p.input.mx = mx; p.input.my = my;
      p.input.aim = (typeof inp.aim === 'number' && isFinite(inp.aim)) ? inp.aim : null;
      p.input.fire = !!inp.fire;
      p.input.assist = !!inp.assist;
    }

    startGame() {
      if (this.phase !== 'lobby' || !this.active().length) return false;
      this.players = this.players.filter((p) => !p.away);
      this.resetWorld();
      this.runId = newRunId();                    // each run keeps its own autosave
      this.players.forEach((p, i) => {
        this.freshLoadout(p);
        const sp = this.spawnPoint(i);
        p.x = sp.x; p.y = sp.y;
      });
      this.night = Math.max(1, Math.min(99, this.dev.startNight | 0 || 1));
      if (this.night > 1) {               // starting later: hand out roughly what you would have earned
        let cash = 0;
        for (let k = 1; k < this.night; k++) cash += 80 + 30 * k + 110 + 45 * k;
        for (const p of this.players) p.money += cash;
      }
      if (this.dev.bonus > 0) for (const p of this.players) p.money += this.dev.bonus | 0;   // admin terminal: "cash <n>"
      this.phase = 'day';
      this.makeForecast();
      if (this.night === 1) {
        // the first wave starts right away (with a short breather); building starts at the first dawn
        this.startNight();
        this.spawnT = 6;
      } else this.emit('dawn', { night: this.night, first: true });
      return true;
    }
    // Give a survivor (and everything they built) a new player id.
    reassign(p, id) {
      for (const st of this.structs) if (st.owner === p.id) st.owner = id;
      p.id = id;
    }
    // A player joined (+1) or left (-1) during a night: grow or shrink what is left of the wave to match.
    rescaleWave(delta) {
      const pc = Math.max(1, this.active().length);            // count after the change
      this.rescaleFor(Math.max(1, pc - delta), pc);
    }
    rescaleFor(fromCount, toCount) {
      const before = 0.5 + 0.5 * Math.max(1, fromCount), after = 0.5 + 0.5 * Math.max(1, toCount);
      const k = after / before;
      const q = this.queue;
      if (!q.length || k === 1) return;
      if (k > 1) {
        const add = Math.round(q.length * (k - 1));
        const pool = q.filter((t) => t !== 'boss');
        for (let i = 0; i < add && pool.length; i++) q.splice((Math.random() * (q.length + 1)) | 0, 0, pick(pool));
      } else {
        let drop = Math.round(q.length * (1 - k));
        for (let i = q.length - 1; i >= 0 && drop > 0; i--) if (q[i] !== 'boss') { q.splice(i, 1); drop--; }
      }
      this.totalThisNight = Math.max(this.totalThisNight + (k > 1 ? 1 : -1) * 0, this.queue.length + this.zombies.length);
    }
    // ------------------------------------------------------------ save / load
    // Everything needed to carry on later, as plain JSON. Shots in flight are dropped.
    serialize() {
      const strip = (o) => { const c = Object.assign({}, o); c.tgt = null; delete c.liftFrom; delete c.dead; delete c.aimBy; delete c.aimT; delete c.goalZ; delete c.goal; delete c.nova; return c; };
      const structs = this.structs.filter((st) => !st.dead).map(strip);
      for (const p of this.players) if (p.carry) structs.push(strip(p.carry));   // carried: goes back where it was
      const KEEP = ['id', 'name', 'color', 'x', 'y', 'aim', 'weapons', 'order', 'cur', 'perks', 'maxhp', 'hp', 'down', 'reviveT',
        'money', 'earned', 'kills', 'keyboard', 'away'];
      const players = this.players.map((p) => { const o = {}; for (const k of KEEP) o[k] = p[k]; return o; });
      return JSON.parse(JSON.stringify({
        v: 1, phase: this.phase, night: this.night, time: this.time, difficulty: this.difficulty, dev: this.dev,
        stats: this.stats, nextId: this.nextId, queue: this.queue, spawnT: this.spawnT, spawnGap: this.spawnGap,
        forecast: this.forecast, totalThisNight: this.totalThisNight, activeCount: this.active().length,
        fireHp: this.fireHp, fireMax: this.fireMax, runId: this.runId,
        players, structs, zombies: this.zombies.filter((z) => !z.dead).map((z) => Object.assign({}, z, { aggro: null, sq: null, sqz: false })),
      }));
    }
    // Restore a saved game. People already in the lobby take back their saved survivor (same device or
    // same name); saved survivors nobody claims wait until someone with that name joins. Newcomers start fresh.
    load(d) {
      if (!d || d.v !== 1 || (d.phase !== 'day' && d.phase !== 'night')) return false;
      const here = this.players.filter((p) => !p.away);
      this.resetWorld();
      this.difficulty = GD.DIFFICULTY[d.difficulty] ? d.difficulty : 'normal';
      // keep switches flipped in the lobby (admin terminal) on top of what the save had
      this.dev = Object.assign({}, this.dev, { money: !!(d.dev && d.dev.money) || !!this.dev.money,
        startNight: Math.max(1, Math.min(99, (d.dev && d.dev.startNight) | 0 || 1)) });
      const num = (v, def) => (typeof v === 'number' && isFinite(v) ? v : def);
      this.night = Math.max(1, num(d.night, 1) | 0);
      this.time = num(d.time, 0);
      this.spawnT = num(d.spawnT, 1.5);
      this.spawnGap = Math.max(0.06, num(d.spawnGap, 1));
      this.stats = Object.assign(this.stats, d.stats || {});
      this.runId = typeof d.runId === 'string' && /^[a-z0-9]{1,24}$/.test(d.runId) ? d.runId : newRunId();
      this.fireMax = Math.max(1, num(d.fireMax, fireMaxFor(this.night)));
      this.fireHp = clamp(num(d.fireHp, this.fireMax), 1, this.fireMax);
      this.queue = (d.queue || []).filter((t) => GD.ZOMBIES[t]);
      this.forecast = GD.cleanForecast(d.forecast || null);
      let maxId = num(d.nextId, 1);
      // structures (anything that landed on the same cell moves to the nearest free one)
      for (const st of d.structs || []) {
        if (st.id === 'mount') { st.id = 'gt_' + (GD.WEAPONS[st.gun] ? st.gun : 'pistol'); st.mag = 0; st.reloadT = 0.5; }
        if (!GD.STRUCTS[st.id] || !(st.cx >= 0 && st.cx < GW && st.cy >= 0 && st.cy < GH)) continue;
        let spot = null;
        for (let r = 0; r < 40 && !spot; r++) {
          for (let oy = -r; oy <= r && !spot; oy++) {
            for (let ox = -r; ox <= r; ox++) {
              if (Math.max(Math.abs(ox), Math.abs(oy)) !== r) continue;
              if (this.canPlace(st.cx + ox, st.cy + oy)) { spot = [st.cx + ox, st.cy + oy]; break; }
            }
          }
        }
        if (!spot) continue;
        st.cx = spot[0]; st.cy = spot[1]; st.x = st.cx * CELL + CELL / 2; st.y = st.cy * CELL + CELL / 2;
        st.tgt = null; st.dead = false;
        st.hp = clamp(num(st.hp, 1), 1, num(st.maxhp, 1));
        this.grid[st.cy * GW + st.cx] = st;
        this.structs.push(st);
        maxId = Math.max(maxId, (st.uid | 0) + 1);
      }
      this.zombies = (d.zombies || []).filter((z) => GD.ZOMBIES[z.type] && isFinite(z.x) && isFinite(z.y) && z.hp > 0);
      for (const z of this.zombies) maxId = Math.max(maxId, (z.id | 0) + 1);
      this.nextId = maxId;
      // survivors
      const saved = (d.players || []).filter((q) => q && typeof q.id === 'string');
      const restore = (p, q) => {
        this.freshLoadout(p);
        const weapons = {};
        for (const k of Object.keys(q.weapons || {})) if (GD.WEAPONS[k]) weapons[k] = q.weapons[k];
        if (!weapons.pistol) weapons.pistol = { lvl: 0, mag: GD.WEAPONS.pistol.mag, reserve: 0 };
        p.weapons = weapons;
        p.order = (q.order || []).filter((k) => weapons[k]);
        if (!p.order.includes('pistol')) p.order.unshift('pistol');
        for (const k of Object.keys(weapons)) if (!p.order.includes(k)) p.order.push(k);
        p.cur = weapons[q.cur] ? q.cur : 'pistol';
        p.perks = {};
        for (const k of Object.keys(q.perks || {})) if (GD.PERKS[k]) p.perks[k] = q.perks[k] | 0;
        // a perk that no longer exists (Scavenger): refund everything spent on it
        let refund = 0;
        for (const k of Object.keys(q.perks || {})) if (!GD.PERKS[k] && GD.RETIRED_PERKS[k]) for (let l = 0; l < (q.perks[k] | 0); l++) refund += GD.RETIRED_PERKS[k] * (l + 1);
        p.maxhp = num(q.maxhp, 100);
        p.hp = clamp(num(q.hp, p.maxhp), 0, p.maxhp);
        p.down = !!q.down; p.reviveT = num(q.reviveT, 0);
        p.money = num(q.money, GD.START_MONEY) + refund; p.earned = num(q.earned, 0); p.kills = num(q.kills, 0) | 0;
        if (refund) this.emit('note', { pid: p.id, msg: 'Scavenger is gone: refunded $' + GD.fmt(refund) });
        p.x = clamp(num(q.x, FIRE.x), PR, W - PR); p.y = clamp(num(q.y, FIRE.y), PR, H - PR);
        p.aim = num(q.aim, -Math.PI / 2);
        if (q.color) p.color = q.color;
      };
      const idMap = {}, players = [], fresh = [];
      for (const p of here) {
        let i = saved.findIndex((q) => q.id === p.id);
        if (i < 0) i = saved.findIndex((q) => String(q.name || '').toLowerCase() === p.name.toLowerCase());
        if (i >= 0) { const q = saved.splice(i, 1)[0]; idMap[q.id] = p.id; restore(p, q); } else { this.freshLoadout(p); fresh.push(p); }
        p.input = { mx: 0, my: 0, aim: null, fire: false, assist: false };
        p.buildAt = null;
        players.push(p);
      }
      for (const q of saved) {           // not here yet: waits for its owner (by name)
        const p = { id: q.id, name: String(q.name || 'Survivor').slice(0, 14), color: q.color || GD.PLAYER_COLORS[0], x: 0, y: 0, aim: 0,
          kvx: 0, kvy: 0, away: true, keyboard: !!q.keyboard, walk: 0, moving: false, flash: 0,
          input: { mx: 0, my: 0, aim: null, fire: false, assist: false } };
        restore(p, q);
        p.away = true;
        players.push(p);
      }
      this.players = players;
      for (const st of this.structs) if (idMap[st.owner]) st.owner = idMap[st.owner];
      const used = new Set(players.filter((p) => !fresh.includes(p)).map((p) => p.color));
      const others = players.filter((p) => !fresh.includes(p) && !p.away);
      const avg = others.length ? others.reduce((a, q) => a + q.earned, 0) / others.length : 0;
      fresh.forEach((p, i) => {
        if (used.has(p.color)) p.color = GD.PLAYER_COLORS.find((c) => !used.has(c)) || p.color;
        used.add(p.color);
        p.money += Math.round(avg * 0.7);
        const sp = this.spawnPoint(i); p.x = sp.x; p.y = sp.y;
      });
      this.phase = d.phase;
      if (this.phase === 'night') {
        this.totalThisNight = Math.max(num(d.totalThisNight, 0), this.queue.length + this.zombies.length);
        this.rescaleFor(num(d.activeCount, 1), this.active().length);
        if (!this.queue.length && !this.zombies.length) this.spawnT = 1;
      }
      this.flowDirty = true;
      this.emit('loaded', { night: this.night, phase: this.phase });
      return true;
    }
    toLobby() {
      this.players = this.players.filter((p) => !p.away);
      this.resetWorld();
      this.players.forEach((p, i) => {
        this.freshLoadout(p);
        const sp = this.spawnPoint(i);
        p.x = sp.x; p.y = sp.y;
      });
      this.phase = 'lobby';
    }

    // ---- difficulty curve: everything keeps compounding, night after night
    // Late game ramps harder: by then a camp has a ring of turrets, so from night 10 every night adds extra health
    // and a bigger horde on top of the base curve (night 17: 1.6x health and 1.2x zombies over the base; night 25: 2.8x and 1.45x).
    lateRamp(n) { const k = Math.max(0, n - 10); return { hp: 1 + 0.06 * k + 0.004 * k * k, count: 1 + 0.03 * k }; }
    // Mid game: the night-5 supply drop used to outrun nights 6-9, so the horde steps up right after the first boss and
    // keeps climbing to night 10, then holds (so night 10 is still a jump and later nights carry the same extra).
    // zombies: n6 1.12x, n7 1.16x, n8 1.20x, n9 1.24x, n10+ 1.25x.  health: n6 1.045x ... n9+ 1.12x.
    midRamp(n) { const k = n - 5; return k <= 0 ? { hp: 1, count: 1 } : { hp: Math.min(1.12, 1.02 + 0.025 * k), count: Math.min(1.25, 1.08 + 0.04 * k) }; }
    hpMul(n) { return (1 + 0.12 * (n - 1) + 0.006 * (n - 1) * (n - 1)) * this.midRamp(n).hp * this.lateRamp(n).hp; }    // n6 1.8x, n9 2.6x, n10 2.9x, n15 6.0x, n17 8.1x, n20 12.2x, n25 23x
    biteMul(n) { return 1 + 0.05 * (n - 1); }                              // damage to survivors
    wallMul(n) { return 1.2 * (1 + 0.08 * (n - 1)); }                       // damage to structures
    isBloodMoon(n) { return n >= 8 && n % 4 === 0; }
    spawnWeights(n) {
      return {
        walker: Math.max(2.5, 10 - 0.4 * n), runner: 4.5, crawler: 3, brute: 1 + 0.15 * n, bloater: 2,
        screamer: 1.1, leaper: 1.8, ironhide: 0.8 + 0.1 * n, splitter: 1.5, tarborn: 1.2,
        juggernaut: 0.15 + 0.025 * n + 0.02 * Math.max(0, n - 12), broodmother: 0.12 + 0.02 * n + 0.02 * Math.max(0, n - 14),
        gravecaller: 0.35 + 0.02 * n, smoker: 0.8, gorefly: 0.6 + 0.03 * n, disruptor: 0.25 + 0.012 * n,
      };
    }
    makeForecast() {
      const n = this.night;
      const sideCount = n >= 9 ? 3 : n >= 3 ? 2 : 1;
      const pool = SIDES.slice();
      const sides = [];
      for (let i = 0; i < sideCount; i++) sides.push(pool.splice((Math.random() * pool.length) | 0, 1)[0]);
      const w = this.spawnWeights(n);
      const types = Object.keys(w).filter((t) => GD.ZOMBIES[t].from <= n);
      const avail = types.filter((t) => t !== 'walker');
      // a newly unlocked type is always the featured one, so its first night is a real surprise
      const fresh = types.filter((t) => GD.ZOMBIES[t].from === n);
      const featured = fresh.length ? fresh[0] : avail.length ? pick(avail) : 'walker';
      if (n % 5 === 0) types.push('boss');
      if (n === 5) fresh.push('boss');
      if (n >= GD.ZOMBIES.colossus.from) { types.push('colossus'); if (n === GD.ZOMBIES.colossus.from) fresh.push('colossus'); }
      // Pitch black: no moon at all, so nothing can be seen outside your lights (not even their eyes). From night 6, about
      // 1 night in 8 overall: never on a Blood Moon or boss night, never twice running. Always in the scouting report.
      const blood = this.isBloodMoon(n);
      let dark = false;
      if (n >= 6 && !blood && n % 5 !== 0) dark = this.dev.dark || (this.darkNight !== n - 1 && Math.random() < 0.25);
      if (dark) this.darkNight = n;
      this.forecast = { sides, featured, boss: n % 5 === 0, blood, dark, night: n, types, fresh };
    }
    buildQueue() {
      const n = this.night, d = this.diff();
      const pc = Math.max(1, this.active().length);
      const blood = this.isBloodMoon(n);
      const early = n === 1 ? 0.7 : n === 2 ? 0.8 : n === 3 ? 0.9 : 1;   // quicker opening nights
      let budget = (14 + 8 * n + 0.9 * n * n) * d.count * (0.5 + 0.5 * pc) * (blood ? 1.35 : 1) * early * this.midRamp(n).count * this.lateRamp(n).count;
      const weights = this.spawnWeights(n);
      const types = Object.keys(weights).filter((t) => GD.ZOMBIES[t].from <= n);
      if (this.forecast && weights[this.forecast.featured]) weights[this.forecast.featured] *= 3;
      let total = 0;
      for (const t of types) total += weights[t];
      const q = [];
      while (budget > 0 && q.length < 1200) {
        let r = Math.random() * total, t = types[0];
        for (const k of types) { r -= weights[k]; if (r <= 0) { t = k; break; } }
        q.push(t);
        budget -= GD.ZOMBIES[t].cost;
      }
      // heavy hitters arrive in the back half of the night, not all at once
      const heavy = q.filter((t) => GD.ZOMBIES[t].cost >= 15);
      const light = q.filter((t) => GD.ZOMBIES[t].cost < 15);
      heavy.forEach((t, i) => light.splice(Math.floor(light.length * (0.4 + 0.5 * (i + 1) / (heavy.length + 1))), 0, t));
      // the Colossus: one on night 22, then one more every 6 nights
      if (n >= GD.ZOMBIES.colossus.from) {
        for (let i = 0; i < 1 + Math.floor((n - GD.ZOMBIES.colossus.from) / 6); i++) light.splice(Math.floor(light.length * (0.45 + 0.4 * Math.random())), 0, 'colossus');
      }
      // every Leviathan Cannon draws Smokebelchers to screen the horde from it
      const levs = this.structs.filter((s) => s.id === 'leviathan' && !s.dead).length;
      if (levs && n >= GD.ZOMBIES.smoker.from) {
        for (let i = 0; i < levs * (2 + Math.floor(n / 6)); i++) light.splice(Math.floor(Math.random() * light.length), 0, 'smoker');
      }
      // the Bonewyrm: rare, never two nights running, and never in the scouting report
      const bone = n >= GD.ZOMBIES.wyrm.from && (this.dev.wyrm || (Math.random() < 0.2 && this.wyrmNight !== n - 1));
      if (bone) {
        light.splice(Math.floor(light.length * (this.dev.wyrm ? 0.05 : rand(0.3, 0.7))), 0, 'wyrm');   // dev: early, so it is easy to see
        this.wyrmNight = n;
      }
      // the Gorewyrm: rarer, from night 25, never on a Bonewyrm night (dev switch: both) and never twice running
      if (n >= GD.ZOMBIES.gorewyrm.from && (this.dev.wyrm || (!bone && Math.random() < 0.17 && this.gorewyrmNight !== n - 1))) {
        light.splice(Math.floor(light.length * (this.dev.wyrm ? 0.05 : rand(0.35, 0.7))), 0, 'gorewyrm');
        this.gorewyrmNight = n;
      }
      if (n % 5 === 0) {
        const bosses = Math.min(5, Math.floor(n / 5));
        for (let i = 0; i < bosses; i++) light.splice(Math.floor(light.length * (0.35 + 0.15 * i)), 0, 'boss');
      }
      this.queue = light;
      this.totalThisNight = light.length;
      const duration = n <= 4 ? 16 + 8 * n : Math.min(120, 32 + 5 * n);   // 24s, 32s, 40s, 48s, then 57s and up
      this.spawnGap = Math.max(0.06, duration / Math.max(1, light.length));
      this.spawnT = 5;                  // a few seconds of dread (the night banner) before the first one shows up
    }
    startNight() {
      if (this.phase !== 'day') return;
      this.phase = 'night';
      for (const p of this.players) p.undo = [];      // undo only works within the current day/night
      for (const p of this.players) p.ready = false;
      this.buildQueue();
      this.fireMax = fireMaxFor(this.night); this.fireHp = this.fireMax;
      this.flowDirty = true;
      this.emit('nightStart', { night: this.night });
    }
    endNight() {
      const bonus = 80 + 30 * this.night;
      this.stats.nights = this.night;
      for (const p of this.players) {
        if (p.away) continue;
        p.money += bonus; p.earned += bonus;
        p.down = false; p.reviveT = 0;
        p.hp = p.maxhp;              // everyone starts the day at full health
        p.ready = false;
      }
      this.bullets = this.bullets.filter((b) => b.kind !== 'acid');
      // wyrm carcasses rot away; every structure is patched up for free at dawn (including ones being carried)
      for (const st of this.structs) if (GD.STRUCTS[st.id].husk) this.removeStruct(st, true);
      this.tar = []; this.smoke = []; this.emit('tarClear', {});
      this.structs = this.structs.filter((st) => !st.dead);
      for (const st of this.structs) st.hp = st.maxhp;
      this.fireHp = this.fireMax;
      for (const p of this.players) if (p.carry) p.carry.hp = p.carry.maxhp;
      this.flowDirty = true;
      this.night++;
      this.phase = 'day';
      for (const p of this.players) p.undo = [];
      this.makeForecast();
      this.emit('dawn', { night: this.night, bonus });
      // a supply drop: the night just survived opens the next tier of gear
      const tier = GD.TIERS[this.night - 1];
      if (tier && !this.dev.unlockAll) this.emit('supply', { after: this.night - 1, ids: tier, names: tier.map(GD.itemName) });
    }
    gameOver(reason) {
      this.phase = 'over';
      this.stats.nights = this.night - 1;
      this.stats.reason = reason || 'dead';
      for (const p of this.players) { p.input.fire = false; p.build = null; }
      this.emit('over', {});
    }

    // The horde is beating on the campfire. If it goes out, everyone loses.
    damageFire(v, x, y) {
      if (this.phase !== 'night' || this.fireHp <= 0) return;
      this.fireHp -= v;
      if (this.time - this.fireHitAt > 0.25) { this.fireHitAt = this.time; this.emit('fireHit', { x: x === undefined ? FIRE.x : x, y: y === undefined ? FIRE.y : y }); }
      if (this.fireHp <= 0) {
        this.fireHp = 0;
        this.emit('fireOut', { x: FIRE.x, y: FIRE.y });
        this.gameOver('fire');
      }
    }

    // ------------------------------------------------------------ shop actions
    fail(p, msg) { this.emit('deny', { pid: p.id, msg }); return false; }
    canShop(p) { return p && !p.away && (this.phase === 'day' || this.phase === 'night'); }
    pay(p, cost) {
      if (p.money < cost) return false;
      p.money -= cost;
      return true;
    }
    // supply drops: is this gear available yet? (dev mode / terminal "unlock on" opens everything)
    isUnlocked(id) { return GD.unlocked(id, this.night, this.dev.unlockAll || this.dev.money); }
    lockedMsg(id) { return GD.itemName(id) + ' arrives in the supply drop after night ' + GD.UNLOCK_AFTER[id]; }
    buyWeapon(pid, id) {
      const p = this.getPlayer(pid), w = GD.WEAPONS[id];
      if (!this.canShop(p) || !w) return false;
      if (p.weapons[id]) return this.fail(p, 'Already owned');
      if (!this.isUnlocked(id)) return this.fail(p, this.lockedMsg(id));
      if (!this.pay(p, w.cost)) return this.fail(p, 'Not enough cash');
      p.weapons[id] = { lvl: 0, mag: w.mag, reserve: (w.pack || 0) * GD.START_PACKS };
      p.order = GD.WEAPON_ORDER.filter((k) => p.weapons[k]);
      this.selectWeapon(pid, id);
      this.emit('buy', { pid, what: w.name });
      return true;
    }
    buyAmmo(pid, id) {
      const p = this.getPlayer(pid), w = GD.WEAPONS[id];
      if (!this.canShop(p) || !w || w.infinite) return false;
      const own = p.weapons[id];
      if (!own) return this.fail(p, 'Buy the weapon first');
      const cap = w.pack * GD.MAX_PACKS;
      if (own.reserve >= cap) return this.fail(p, 'Ammo is full');
      if (!this.pay(p, w.packCost)) return this.fail(p, 'Not enough cash');
      own.reserve = Math.min(cap, own.reserve + w.pack);
      this.emit('buy', { pid, what: w.name + ' ammo' });
      return true;
    }
    upgradeWeapon(pid, id) {
      const p = this.getPlayer(pid), w = GD.WEAPONS[id];
      if (!this.canShop(p) || !w) return false;
      const own = p.weapons[id];
      if (!own) return this.fail(p, 'Buy the weapon first');
      if (own.lvl >= GD.MAX_WEAPON_LEVEL) return this.fail(p, 'Fully upgraded');
      if (!this.pay(p, GD.weaponLevelCost(id, own.lvl))) return this.fail(p, 'Not enough cash');
      own.lvl++;
      this.emit('buy', { pid, what: w.name + ' Mk ' + (own.lvl + 1) });
      return true;
    }
    buyPerk(pid, id) {
      const p = this.getPlayer(pid), k = GD.PERKS[id];
      if (!this.canShop(p) || !k) return false;
      const lvl = p.perks[id] || 0;
      if (!lvl && !this.isUnlocked(id)) return this.fail(p, this.lockedMsg(id));
      if (lvl >= GD.MAX_PERK_LEVEL) return this.fail(p, 'Maxed out');
      if (!this.pay(p, GD.perkCost(id, lvl))) return this.fail(p, 'Not enough cash');
      p.perks[id] = lvl + 1;
      if (id === 'vitality') { p.maxhp += 25; if (!p.down) p.hp += 25; }
      this.emit('buy', { pid, what: k.name });
      return true;
    }
    buyItem(pid, id) {
      const p = this.getPlayer(pid), it = GD.ITEMS[id];
      if (!this.canShop(p) || !it) return false;
      if (id === 'medkit') {
        if (p.down) return this.fail(p, 'You are down');
        if (p.hp >= p.maxhp) return this.fail(p, 'Health is full');
        if (!this.pay(p, it.cost)) return this.fail(p, 'Not enough cash');
        p.hp = Math.min(p.maxhp, p.hp + 60);
        this.emit('heal', { pid, x: p.x, y: p.y });
      }
      this.emit('buy', { pid, what: it.name });
      return true;
    }
    selectWeapon(pid, id) {
      const p = this.getPlayer(pid);
      if (!p || !p.weapons[id] || p.cur === id) return false;
      p.cur = id; p.reloadT = 0; p.cd = Math.max(p.cd, 0.18);
      this.emit('swap', { pid });
      return true;
    }
    swap(pid, dir) {
      const p = this.getPlayer(pid);
      if (!p || p.order.length < 2) return false;
      const i = p.order.indexOf(p.cur);
      const n = p.order.length;
      return this.selectWeapon(pid, p.order[(i + (dir < 0 ? n - 1 : 1)) % n]);
    }
    reload(pid) {
      const p = this.getPlayer(pid);
      if (!p || p.down || p.away || p.reloadT > 0) return false;
      const w = GD.WEAPONS[p.cur], own = p.weapons[p.cur];
      if (own.mag >= w.mag) return false;
      if (!w.infinite && own.reserve <= 0) return false;
      p.reloadT = w.reload * (1 - 0.12 * (p.perks.hands || 0));
      this.emit('reload', { pid, x: p.x, y: p.y });
      return true;
    }
    setReady(pid, v) {
      const p = this.getPlayer(pid);
      if (!p || (this.phase !== 'day' && this.phase !== 'lobby')) return false;
      p.ready = v === undefined ? !p.ready : !!v;
      return true;
    }
    selectBuild(pid, id) {
      const p = this.getPlayer(pid);
      if (!p) return false;
      if (id && !GD.STRUCTS[id] && !GD.TOOLS[id]) return false;
      if (id && GD.STRUCTS[id] && GD.STRUCTS[id].husk) return false;      // carcasses are not for sale
      if (id && GD.STRUCTS[id] && !this.isUnlocked(id)) return this.fail(p, this.lockedMsg(id));
      if (id && (!this.canShop(p) || p.down)) return false;
      if (p.carry && (!id || (GD.TOOLS[id] && id !== 'move'))) this.cancelCarry(p);
      if (p.aimLev) this.lockAim(p);                  // cancelling while aiming locks it where it points
      p.build = id || null;
      p.quick = false;
      return true;
    }

    // ------------------------------------------------------------ building
    idx(cx, cy) { return cy * GW + cx; }
    structAt(cx, cy) {
      if (cx < 0 || cy < 0 || cx >= GW || cy >= GH) return null;
      return this.grid[cy * GW + cx];
    }
    buildCell(p) {
      if (p.buildAt) return { cx: Math.floor(p.buildAt.x / CELL), cy: Math.floor(p.buildAt.y / CELL) };
      return { cx: Math.floor((p.x + Math.cos(p.aim) * 58) / CELL), cy: Math.floor((p.y + Math.sin(p.aim) * 58) / CELL) };
    }
    canPlace(cx, cy) {
      if (cx < 1 || cy < 1 || cx > GW - 2 || cy > GH - 2) return false;
      if (Math.abs(cx - FIRE.cx) <= 0 && Math.abs(cy - FIRE.cy) <= 0) return false;
      return !this.grid[cy * GW + cx];
    }
    sellValue(s) { return Math.floor(GD.STRUCTS[s.id].cost * 0.6 * (s.hp / s.maxhp)); }
    place(pid) {
      const p = this.getPlayer(pid);
      if (p && p.aimLev) { this.lockAim(p); return true; }        // aiming a Leviathan: this click locks it in
      if (!this.canShop(p) || p.down || !p.build) return false;
      const { cx, cy } = this.buildCell(p);
      // carrying something: the next placement always puts it down, whatever is selected
      if (p.carry) {
        if (!this.canPlace(cx, cy)) return this.fail(p, "Can't put it there");
        const s = p.carry;
        p.carry = null;
        const from = s.liftFrom;
        this.dropStruct(s, cx, cy);
        if (GD.STRUCTS[s.id].aimed) this.startAim(p, s);             // putting it down: aim it again
        if (from && (from.cx !== cx || from.cy !== cy)) this.pushUndo(p, { k: 'move', s, cx: from.cx, cy: from.cy });
        this.emit('build', { pid, x: s.x, y: s.y, id: s.id, moved: true });
        if (p.quick) { p.build = null; p.quick = false; }
        return true;
      }
      // shortcut: with any buildable selected, placing onto a structure picks it up (anyone may move anything)
      const under = this.structAt(cx, cy);
      if (GD.STRUCTS[p.build] && under) {
        if (GD.STRUCTS[under.id].husk) return this.fail(p, 'Far too heavy to move');
        this.liftStruct(under);
        p.carry = under;
        this.emit('lift', { pid, x: under.x, y: under.y, id: under.id });
        return true;
      }
      if (p.build === 'move') {
        const s = under;
        if (!s) return this.fail(p, 'Nothing there');
        if (GD.STRUCTS[s.id].husk) return this.fail(p, 'Far too heavy to move');
        this.liftStruct(s);
        p.carry = s;
        this.emit('lift', { pid, x: s.x, y: s.y, id: s.id });
        return true;
      }
      if (p.build === 'sell') {
        const s = this.structAt(cx, cy);
        if (!s) return this.fail(p, 'Nothing there');
        if (s.owner !== pid) return this.fail(p, 'Only the builder can sell that');
        const v = this.sellValue(s);
        p.money += v;
        this.removeStruct(s, true);
        this.emit('sell', { pid, x: s.x, y: s.y, v });
        return true;
      }
      const def = GD.STRUCTS[p.build];
      if (!def) return false;
      if (!this.canPlace(cx, cy)) return this.fail(p, "Can't build there");
      const eng = p.perks.engineer || 0;
      if (!this.pay(p, GD.structCost(p.build, eng))) return this.fail(p, 'Not enough cash');
      const hp = Math.round(def.hp * (1 + 0.12 * eng));
      const s = {
        uid: this.nextId++, id: p.build, cx, cy, x: cx * CELL + CELL / 2, y: cy * CELL + CELL / 2,
        hp, maxhp: hp, owner: pid, cd: rand(0, 0.3), ang: p.aim, tgt: null, scanT: 0, flash: 0, hitT: 0, born: this.time,
      };
      if (def.gun) { s.gun = def.gun; s.mag = GD.WEAPONS[def.gun].mag; s.reloadT = 0; }
      this.grid[cy * GW + cx] = s;
      this.structs.push(s);
      this.shoveOut(s);
      this.stats.built++;
      this.pushUndo(p, { k: 'place', s, cost: GD.structCost(s.id, eng) });
      this.flowDirty = true;
      this.emit('build', { pid, x: s.x, y: s.y, id: s.id });
      if (def.aimed) this.startAim(p, s);
      if (s.id === 'hellmouth') s.charge = 6;                         // first eruption comes a little sooner
      return true;
    }
    // Building (or putting down) something solid where zombies stand shoves them clear: popped out of the cell,
    // knocked away from it and staggered for a moment (big ones resist the knock, as with any knockback).
    shoveOut(s) {
      if (!GD.STRUCTS[s.id].block || !this.zombies.length) return;
      const x0 = s.cx * CELL, y0 = s.cy * CELL;
      for (const z of this.zombies) {
        if (z.dead || z.burrowed || z.leap || z.fly || GD.ZOMBIES[z.type].seg) continue;
        const nx = clamp(z.x, x0, x0 + CELL), ny = clamp(z.y, y0, y0 + CELL);
        if ((z.x - nx) ** 2 + (z.y - ny) ** 2 >= z.r * z.r) continue;              // not touching the cell
        let dx = z.x - s.x, dy = z.y - s.y, d = Math.hypot(dx, dy);
        if (d < 0.01) { const a = rand(0, 6.28); dx = Math.cos(a); dy = Math.sin(a); d = 1; }
        pushOut(z, z.r, x0, y0);
        const m = GD.ZOMBIES[z.type].knock === undefined ? 1 : GD.ZOMBIES[z.type].knock;
        z.kvx += dx / d * 260 * m; z.kvy += dy / d * 260 * m;
        z.stun = Math.max(z.stun, 0.35 * (GD.ZOMBIES[z.type].stun ? GD.ZOMBIES[z.type].stun.mul : 1));
        z.aggro = null;
        this.emit('shove', { x: z.x, y: z.y });
      }
    }
    // ---- aiming a Leviathan: after it is put down it follows your cursor (mouse / D-pad spot) or, without one, your aim
    // (right stick / right thumb), until you click again, cancel, or 10 s pass. It does not fire while being aimed.
    startAim(p, s) {
      if (p.aimLev && p.aimLev !== s) this.lockAim(p);
      p.aimLev = s; s.aimBy = p.id; s.aimT = 10;
      this.trackAim(p, 0);
    }
    trackAim(p, dt) {
      const s = p.aimLev;
      if (!s || s.dead || p.carry === s || this.grid[s.cy * GW + s.cx] !== s || p.away || p.down) { this.lockAim(p); return; }
      let a = p.aim;
      if (p.buildAt && Math.hypot(p.buildAt.x - s.x, p.buildAt.y - s.y) > 30) a = Math.atan2(p.buildAt.y - s.y, p.buildAt.x - s.x);
      s.face = a; s.ang = a;
      if ((s.aimT -= dt) <= 0) this.lockAim(p);
    }
    lockAim(p) {
      const s = p.aimLev;
      p.aimLev = null;
      if (!s) return;
      s.aimBy = null; s.cd = Math.max(s.cd || 0, 0.6);
      if (p.build && GD.STRUCTS[p.build] && GD.STRUCTS[p.build].aimed) p.build = null;   // one huge gun at a time: no accidental second click
      if (!s.dead) this.emit('build', { pid: p.id, x: s.x, y: s.y, id: s.id, armed: true });
    }
    // One-step move: grab any structure at a world position without opening any menu. It stays its builder's.
    grab(pid, x, y) {
      const p = this.getPlayer(pid);
      if (!this.canShop(p) || p.down || p.carry) return false;
      const s = this.structAt(Math.floor(x / CELL), Math.floor(y / CELL));
      if (!s) return false;
      if (GD.STRUCTS[s.id].husk) return this.fail(p, 'Far too heavy to move');
      p.build = 'move';
      p.quick = true;          // leave build mode again once it is put down
      this.liftStruct(s);
      p.carry = s;
      this.emit('lift', { pid, x: s.x, y: s.y, id: s.id });
      return true;
    }
    placeAt(pid, x, y) {
      const p = this.getPlayer(pid);
      if (!p || !isFinite(x) || !isFinite(y)) return false;
      const keep = p.buildAt;
      p.buildAt = { x, y };
      const ok = this.place(pid);
      p.buildAt = keep;
      return ok;
    }
    pushUndo(p, e) {
      p.undo.push(e);
      if (p.undo.length > 40) p.undo.shift();
    }
    // Undo your last build or move (this day/night only). Builds are refunded in full unless damaged.
    undo(pid) {
      const p = this.getPlayer(pid);
      if (!this.canShop(p) || p.down) return false;
      if (p.carry) { this.cancelCarry(p); this.emit('undo', { pid, what: 'Put it back' }); return true; }
      while (p.undo.length) {
        const e = p.undo.pop();
        const s = e.s;
        if (s.dead || this.grid[s.cy * GW + s.cx] !== s) continue;     // already gone or picked up since
        if (e.k === 'place') {
          const refund = Math.round(e.cost * Math.max(0, Math.min(1, s.hp / s.maxhp)));
          this.removeStruct(s, true);
          p.money += refund;
          this.emit('undo', { pid, x: s.x, y: s.y, what: 'Removed ' + GD.STRUCTS[s.id].name + ' (+$' + GD.fmt(refund) + ')' });
          return true;
        }
        if (e.k === 'move') {
          if (!this.canPlace(e.cx, e.cy)) continue;
          this.liftStruct(s);
          this.dropStruct(s, e.cx, e.cy);
          this.emit('undo', { pid, x: s.x, y: s.y, what: 'Moved ' + GD.STRUCTS[s.id].name + ' back' });
          return true;
        }
      }
      return this.fail(p, 'Nothing to undo');
    }
    // Place the same thing on several cells at once (phone line-drawing). Returns how many were built.
    placeMany(pid, id, cells) {
      const p = this.getPlayer(pid);
      if (!this.canShop(p) || p.down || !GD.STRUCTS[id] || GD.STRUCTS[id].husk || !Array.isArray(cells)) return 0;
      if (!this.isUnlocked(id)) { this.fail(p, this.lockedMsg(id)); return 0; }
      if (p.carry) this.cancelCarry(p);
      const keep = p.build;
      p.build = id;
      let n = 0;
      for (const c of cells.slice(0, 80)) {
        if (!Array.isArray(c)) continue;
        const cx = c[0] | 0, cy = c[1] | 0;
        if (!this.canPlace(cx, cy)) continue;
        if (p.money < GD.structCost(id, p.perks.engineer || 0)) { this.fail(p, n ? 'Ran out of cash after ' + n : 'Not enough cash'); break; }
        if (this.placeAt(pid, cx * CELL + CELL / 2, cy * CELL + CELL / 2)) n++;
      }
      p.build = keep;
      return n;
    }
    // Use a tool (sell) on the structure at a cell without changing what is selected.
    toolAt(pid, tool, cx, cy) {
      const p = this.getPlayer(pid);
      if (!p || !GD.TOOLS[tool] || tool === 'move') return false;
      const keep = p.build;
      p.build = tool;
      const ok = this.placeAt(pid, (cx | 0) * CELL + CELL / 2, (cy | 0) * CELL + CELL / 2);
      p.build = keep;
      return ok;
    }
    removeStruct(s, quiet) {
      if (s.dead) return;
      s.dead = true;
      if (this.grid[s.cy * GW + s.cx] === s) this.grid[s.cy * GW + s.cx] = null;
      this.flowDirty = true;
      if (!quiet) this.emit('structDie', { x: s.x, y: s.y, id: s.id });
    }
    // pick up / put down (Move tool). A carried structure is in neither the grid nor the list.
    liftStruct(s) {
      s.liftFrom = { cx: s.cx, cy: s.cy };
      if (this.grid[s.cy * GW + s.cx] === s) this.grid[s.cy * GW + s.cx] = null;
      const i = this.structs.indexOf(s);
      if (i >= 0) this.structs.splice(i, 1);
      s.tgt = null;
      this.flowDirty = true;
    }
    dropStruct(s, cx, cy) {
      s.cx = cx; s.cy = cy; s.x = cx * CELL + CELL / 2; s.y = cy * CELL + CELL / 2;
      s.born = this.time; s.hitT = 0;
      this.grid[cy * GW + cx] = s;
      this.structs.push(s);
      this.shoveOut(s);
      this.flowDirty = true;
    }
    // Put a carried structure back: its old cell if free, otherwise the nearest free one.
    cancelCarry(p) {
      const s = p && p.carry;
      if (!s) return;
      p.carry = null;
      for (let r = 0; r < 40; r++) {
        for (let oy = -r; oy <= r; oy++) {
          for (let ox = -r; ox <= r; ox++) {
            if (Math.max(Math.abs(ox), Math.abs(oy)) !== r) continue;
            if (this.canPlace(s.cx + ox, s.cy + oy)) { this.dropStruct(s, s.cx + ox, s.cy + oy); return; }
          }
        }
      }
      p.money += GD.STRUCTS[s.id].cost;   // map completely full: refund instead
    }
    damageStruct(s, dmg) {
      if (s.dead) return;
      s.hp -= dmg;
      s.hitT = 0.15;
      if (s.hp <= 0) this.removeStruct(s);
    }

    // ------------------------------------------------------------ pathing
    computeFlow() {
      const flow = this.flow, grid = this.grid, heap = this.heap;
      flow.fill(Infinity);
      heap.length = 0;
      const push = (i, d) => {
        flow[i] = d;
        let n = heap.length;
        heap.push(i);
        while (n > 0) {
          const par = (n - 1) >> 1;
          if (flow[heap[par]] <= flow[heap[n]]) break;
          const t = heap[par]; heap[par] = heap[n]; heap[n] = t; n = par;
        }
      };
      const pop = () => {
        const top = heap[0], last = heap.pop();
        if (heap.length) {
          heap[0] = last;
          let n = 0;
          for (;;) {
            const l = n * 2 + 1, r = l + 1;
            let m = n;
            if (l < heap.length && flow[heap[l]] < flow[heap[m]]) m = l;
            if (r < heap.length && flow[heap[r]] < flow[heap[m]]) m = r;
            if (m === n) break;
            const t = heap[m]; heap[m] = heap[n]; heap[n] = t; n = m;
          }
        }
        return top;
      };
      const done = new Uint8Array(GW * GH);
      for (const p of this.players) {
        if (p.away || p.down) continue;
        const cx = clamp(Math.floor(p.x / CELL), 0, GW - 1), cy = clamp(Math.floor(p.y / CELL), 0, GH - 1);
        const i = cy * GW + cx;
        if (flow[i] !== 0) push(i, 0);
      }
      if (this.phase === 'night' && this.fireHp > 0) {   // the campfire is a target too
        const i = FIRE.cy * GW + FIRE.cx;
        if (flow[i] !== 0) push(i, 0);
      }
      for (const st of this.structs) {            // Noise Lures pull the horde toward them
        if (st.id !== 'lure' || st.dead) continue;
        const i = st.cy * GW + st.cx;
        if (flow[i] !== 0) push(i, 0);
      }
      const cellCost = (i) => {
        const s = grid[i];
        if (!s) return 0;
        if (GD.STRUCTS[s.id].block) return 3 + s.hp / 45;
        return s.id === 'wire' ? 0.7 : s.id === 'mud' ? 1 : 0;           // wading through wire at 60% speed costs about 0.7 of a step
      };
      const blocked = (i) => { const s = grid[i]; return !!s && GD.STRUCTS[s.id].block; };
      // Warding Totems push routes away; Blood Trails pull them along (walking a trail costs a third of a step)
      const ward = this.wardCost || (this.wardCost = new Float32Array(GW * GH));
      ward.fill(0);
      for (const s of this.structs) {
        if (s.dead || s.id !== 'ward') continue;
        const R = GD.STRUCTS.ward.wardR, r = Math.ceil(R);
        for (let oy = -r; oy <= r; oy++) for (let ox = -r; ox <= r; ox++) {
          const x = s.cx + ox, y = s.cy + oy, d = Math.hypot(ox, oy);
          if (x < 0 || y < 0 || x >= GW || y >= GH || d > R) continue;
          ward[y * GW + x] += 6 * (1 - d / (R + 0.5));
        }
      }
      const trail = (i) => { const s = grid[i]; return !!s && s.id === 'trail'; };
      while (heap.length) {
        const i = pop();
        if (done[i]) continue;
        done[i] = 1;
        const cx = i % GW, cy = (i / GW) | 0, d = flow[i];
        for (let oy = -1; oy <= 1; oy++) {
          for (let ox = -1; ox <= 1; ox++) {
            if (!ox && !oy) continue;
            const nx = cx + ox, ny = cy + oy;
            if (nx < 0 || ny < 0 || nx >= GW || ny >= GH) continue;
            const ni = ny * GW + nx;
            if (done[ni]) continue;
            let step = 1;
            if (ox && oy) {
              const ba = blocked(cy * GW + nx), bb = blocked(ny * GW + cx);
              if (blocked(ni) || blocked(i) || ba !== bb) continue;
              step = ba ? 1.414 + GAP_COST : 1.414;     // both blocked: walls touching only at the corner leave a gap
            }
            const nd = d + step * (trail(ni) ? 0.33 : 1) + cellCost(ni) + ward[ni];
            if (nd < flow[ni]) push(ni, nd);
          }
        }
      }
      this.flowDirty = false;
      this.flowT = 0.3;
    }

    // ------------------------------------------------------------ spatial hash
    rebuildHash() {
      const h = this.hash;
      for (let i = 0; i < h.length; i++) if (h[i].length) h[i].length = 0;
      for (const z of this.zombies) {
        if (z.burrowed) continue;
        const cx = clamp(Math.floor(z.x / CELL) + HB, 0, HW - 1), cy = clamp(Math.floor(z.y / CELL) + HB, 0, HH - 1);
        h[cy * HW + cx].push(z);
      }
    }
    forNear(x, y, rad, fn) {
      const x0 = clamp(Math.floor((x - rad) / CELL) + HB, 0, HW - 1), x1 = clamp(Math.floor((x + rad) / CELL) + HB, 0, HW - 1);
      const y0 = clamp(Math.floor((y - rad) / CELL) + HB, 0, HH - 1), y1 = clamp(Math.floor((y + rad) / CELL) + HB, 0, HH - 1);
      for (let cy = y0; cy <= y1; cy++) {
        for (let cx = x0; cx <= x1; cx++) {
          const b = this.hash[cy * HW + cx];
          for (let i = 0; i < b.length; i++) if (!b[i].dead) fn(b[i]);
        }
      }
    }

    // ------------------------------------------------------------ zombies
    spawnZombie(type, x, y) {
      const def = GD.ZOMBIES[type], d = this.diff(), n = Math.max(1, this.night);
      let hp = def.hp * this.hpMul(n) * d.hp;
      if (type === 'boss') hp *= (0.6 + 0.4 * Math.max(1, this.active().length)) * Math.sqrt(n / 5);
      if (type === 'juggernaut' || type === 'broodmother' || def.wyrmHead || def.seg || type === 'colossus') hp *= 0.7 + 0.3 * Math.max(1, this.active().length);
      // Champions (from night 15): a growing share of ordinary zombies come out tougher, with one trait
      let champ = null;
      if (this.phase === 'night' && n >= 15 && def.cost > 0 && def.cost < 15 && !def.seg && !def.fly &&
        Math.random() < Math.min(0.11, 0.02 + 0.006 * (n - 15))) { champ = pick(['armored', 'swift', 'regen']); hp *= 1.6; }
      const blood = this.phase === 'night' && this.isBloodMoon(n);
      const z = {
        id: this.nextId++, type, x, y, kvx: 0, kvy: 0, hp, maxhp: hp, r: def.r,
        speed: def.speed * rand(0.88, 1.12) * Math.min(1.35, 1 + 0.02 * (n - 1)) * (blood ? 1.15 : 1),
        ang: 0, atkT: rand(0, 0.5), burn: 0, burnBy: null, stun: 0, wob: rand(0, 6.28), hitT: 0,
        slamT: 4, broodT: def.brood ? 1.5 : 7, raiseT: 3, tarT: 0.5, screamT: rand(0, 1.5), leapCd: rand(0.5, 2), chargeCd: 3, rage: 0,
        lastBy: null, dead: false, lunge: 0, leap: null, air: 0, charge: null,
        burrowed: !!def.burrow, surfT: 22,
        fly: !!def.fly, champ, xArmor: champ === 'armored' ? 8 : 0, regen: champ === 'regen' ? 0.04 : 0,
        empT: def.emp ? rand(2, 4) : 0, stompT: def.stomp ? 2 : 0,
      };
      if (champ === 'swift') z.speed *= 1.45;
      this.zombies.push(z);
      return z;
    }
    spawnFromQueue() {
      const type = this.queue.shift();
      const fc = this.forecast;
      const side = (fc && Math.random() < 0.78) ? pick(fc.sides) : pick(SIDES);
      let x, y;
      if (side === 'N') { x = rand(40, W - 40); y = -34; }
      else if (side === 'S') { x = rand(40, W - 40); y = H + 34; }
      else if (side === 'W') { x = -34; y = rand(40, H - 40); }
      else { x = W + 34; y = rand(40, H - 40); }
      const z = this.spawnZombie(type, x, y);
      const pk = GD.ZOMBIES[type].pack;
      if (pk) for (let i = 1; i < pk; i++) this.spawnZombie(type, x + rand(-40, 40), y + rand(-40, 40));   // a whole swarm at once
      if (GD.ZOMBIES[type].wyrmHead) this.growWyrm(z, side);
      if (type === 'boss') this.emit('boss', { x, y, side: SIDE_NAMES[side] });
      else if (GD.ZOMBIES[type].wyrmHead) this.emit('wyrm', { x, y, side: SIDE_NAMES[side], ztype: type });
      else if (type === 'juggernaut' || type === 'broodmother' || type === 'gravecaller' || type === 'colossus') this.emit('elite', { x, y, ztype: type, side: SIDE_NAMES[side] });
      return z;
    }
    // raw = ignores armour (fire, wire). Armour takes a flat chunk off every hit, but never more than 75%.
    damageZombie(z, dmg, by, kx, ky, raw) {
      if (z.dead || z.burrowed) return;
      const def = GD.ZOMBIES[z.type];
      const armor = (def.armor || 0) + (z.xArmor || 0);
      if (armor && !raw) dmg = Math.max(dmg * 0.25, dmg - armor);
      if (def.hide && this.srcTurret) dmg *= def.hide;  // thick hide: turrets and mines barely bother it
      if (z.lit > 0) dmg *= 1.3;                      // caught in a Flood Lamp's light
      z.hp -= dmg;
      z.hurtAt = this.time;
      z.hitT = 0.1;
      if (by) z.lastBy = by;
      if ((kx || ky) && !z.charge) {
        const m = def.knock === undefined ? 1 : def.knock;
        z.kvx += kx * m; z.kvy += ky * m;
      }
      if (z.hp <= 0) { z.gib = dmg >= z.maxhp * 0.5 || dmg >= 250; this.killZombie(z); }
    }
    // ---- Bonewyrm
    // The head lays a trail of points as it moves; body segment i sits (i + 1) * gap behind it along that trail,
    // so the body follows exactly where the head went (around walls, through gaps) like a centipede.
    growWyrm(head, side) {
      const def = GD.ZOMBIES[head.type], gap = def.segGap;
      const back = side === 'N' ? [0, -1] : side === 'S' ? [0, 1] : side === 'W' ? [-1, 0] : [1, 0];
      head.ang = Math.atan2(-back[1], -back[0]);
      head.trail = [];
      const len = (def.segs + 1) * gap;
      for (let d = len; d >= 0; d -= 5) head.trail.push([Math.round(head.x + back[0] * d), Math.round(head.y + back[1] * d)]);
      head.body = [];
      head.segTotal = def.segs;
      head.baseSpeed = head.speed;
      for (let i = 0; i < def.segs; i++) {
        const sg = this.spawnZombie(def.segType, head.x + back[0] * gap * (i + 1), head.y + back[1] * gap * (i + 1));
        sg.head = head.id; sg.ang = head.ang; sg.atkT = 0;
        head.body.push(sg.id);
      }
    }
    // Place every segment along its head's trail (called once per tick, after the zombies move).
    updateWyrms(dt) {
      let byId = null, any = false;
      const isSeg = (z) => GD.ZOMBIES[z.type].seg, isHead = (z) => GD.ZOMBIES[z.type].wyrmHead;
      for (const z of this.zombies) if (isSeg(z) && !z.dead) { any = true; break; }
      if (!any) return;
      const owned = new Set();
      for (const h of this.zombies) if (isHead(h) && !h.dead && h.body) for (const id of h.body) owned.add(id);
      for (const z of this.zombies) if (isSeg(z) && !z.dead && !owned.has(z.id)) z.dead = true;   // headless leftovers
      for (const h of this.zombies) {
        if (h.dead || !isHead(h) || !h.body) continue;
        const tr = h.trail, last = tr[tr.length - 1];
        if (!last || Math.hypot(h.x - last[0], h.y - last[1]) >= 5) tr.push([Math.round(h.x), Math.round(h.y)]);
        const gap = GD.ZOMBIES[h.type].segGap, need = (h.body.length + 2) * gap;
        if (!byId) { byId = new Map(); for (const z of this.zombies) if (isSeg(z) && !z.dead) byId.set(z.id, z); }
        // walk back along the trail
        let px = h.x, py = h.y, i = tr.length - 1, acc = 0, k = 0;
        let want = gap;
        while (k < h.body.length && i >= 0) {
          const qx = tr[i][0], qy = tr[i][1], seg = Math.hypot(px - qx, py - qy);
          if (acc + seg >= want) {
            const f = seg > 0 ? (want - acc) / seg : 0;
            const sx = px + (qx - px) * f, sy = py + (qy - py) * f;
            const sg = byId.get(h.body[k]);
            if (sg) {
              const ox = sg.x, oy = sg.y;
              sg.x = sx; sg.y = sy;
              const mv = Math.hypot(sx - ox, sy - oy);
              if (mv > 0.05) sg.ang = Math.atan2(sy - oy, sx - ox);
              sg.wob += mv * 0.12;
            }
            k++; want += gap;
            continue;
          }
          acc += seg; px = qx; py = qy; i--;
        }
        // trim the trail to what the body needs
        let total = 0, cut = 0;
        for (let j = tr.length - 1; j > 0; j--) { total += Math.hypot(tr[j][0] - tr[j - 1][0], tr[j][1] - tr[j - 1][1]); if (total > need) { cut = j - 1; break; } }
        if (cut > 0) tr.splice(0, cut);
        // the lighter it gets, the faster and angrier the head
        const lost = 1 - h.body.length / (h.segTotal || 1);
        h.speed = h.baseSpeed * (1 + 0.6 * lost);
      }
    }
    // A segment (or the head) died: everything behind it breaks off and lies there as a carcass.
    severWyrm(z) {
      let head = null, from = 0;
      if (GD.ZOMBIES[z.type].wyrmHead) { if (!z.body) return; head = z; from = 0; }
      else {
        head = this.zombies.find((h) => h.id === z.head && GD.ZOMBIES[h.type].wyrmHead && h.body);
        if (!head) return;
        from = head.body.indexOf(z.id);
        if (from < 0) return;
      }
      const cut = head.body.splice(from);
      const lost = [];
      for (const id of cut) {
        const sg = this.zombies.find((o) => o.id === id);
        if (!sg || sg === z) continue;
        sg.dead = true;                            // not a kill: it simply stops moving and becomes a carcass
        lost.push(sg);
      }
      const hdef = GD.ZOMBIES[head.type];
      const n = Math.max(1, this.night), hp = (360 + 28 * n) * this.diff().hp * (hdef.huskMul || 1);
      const made = new Set();
      // Gorewyrm: every piece that breaks off bursts open and spills a Crawler
      if (hdef.gore && this.zombies.length < 270) for (const sg of lost) {
        const c = this.spawnZombie('crawler', sg.x, sg.y); const a = rand(0, 6.28); c.kvx = Math.cos(a) * 160; c.kvy = Math.sin(a) * 160; c.atkT = 0.5;
      }
      for (const sg of lost.concat(GD.ZOMBIES[z.type].seg ? [z] : [])) {
        const cx = Math.floor(sg.x / CELL), cy = Math.floor(sg.y / CELL);
        if (made.has(cy * GW + cx) || !this.canPlace(cx, cy)) continue;
        made.add(cy * GW + cx);
        const s = { uid: this.nextId++, id: 'husk', cx, cy, x: cx * CELL + CELL / 2, y: cy * CELL + CELL / 2, hp, maxhp: hp,
          owner: null, ang: sg.ang || 0, hitT: 0, flash: 0, cd: 0, born: this.time };
        this.grid[cy * GW + cx] = s;
        this.structs.push(s);
      }
      if (made.size) this.flowDirty = true;
      if (GD.ZOMBIES[z.type].wyrmHead) { head.body = []; this.emit('wyrmDie', { x: z.x, y: z.y, n: lost.length, gore: !!hdef.gore }); }
      else if (head && !head.dead) {
        head.rage = Math.max(head.rage, 3); head.lunge = 1;
        this.emit('sever', { x: z.x, y: z.y, n: lost.length + 1, left: head.body.length, gore: !!hdef.gore });
      }
    }
    killZombie(z) {
      if (z.dead) return;
      z.dead = true;
      const def = GD.ZOMBIES[z.type];
      this.stats.kills++;
      const base = z.raised ? 0 : (z.champ ? 2 : 1) * def.bounty * this.diff().cash * (1 + 0.07 * (this.night - 1));     // raised dead pay nothing
      // a corpse a Gravecaller could raise (small and mid-sized zombies only, and only once)
      if (!z.raised && !def.seg && def.cost > 0 && def.cost <= 5 && this.phase === 'night') {
        this.corpses.push({ type: z.type, x: z.x, y: z.y, t: this.time });
        if (this.corpses.length > 80) this.corpses.shift();
      }
      const killer = z.lastBy ? this.getPlayer(z.lastBy) : null;
      if (killer && !killer.away) {
        const amt = Math.round(base);
        killer.money += amt; killer.earned += amt; killer.kills++;
      } else {
        const act = this.active();
        const amt = Math.round(base / Math.max(1, act.length));
        for (const p of act) { p.money += amt; p.earned += amt; }
      }
      this.emit('die', { x: z.x, y: z.y, ztype: z.type, r: z.r, burn: z.burn > 0, gib: !!z.gib, ang: z.ang });
      if (def.seg) this.severWyrm(z);
      else if (def.wyrmHead) this.severWyrm(z);
      if (def.blast) this.explode(z.x, z.y, def.blast, 70, null, 34, 220, 'acid');
      if (def.brood && this.zombies.length < 270) {               // the Broodmother bursts: her last brood spills out
        for (let i = 0; i < 8; i++) {
          const a = i / 8 * 6.283 + rand(-0.2, 0.2), c = this.spawnZombie('crawler', z.x + Math.cos(a) * z.r * 0.6, z.y + Math.sin(a) * z.r * 0.6);
          c.kvx = Math.cos(a) * 200; c.kvy = Math.sin(a) * 200; c.atkT = 0.5;
        }
        this.emit('brood', { x: z.x, y: z.y, burst: true });
      }
      if (def.smoke) this.puffSmoke(z.x, z.y, 150, 5);           // a last big cloud when it bursts
      if (def.tar) { this.dropTar(z.x, z.y, 50, 20); if (z.burn > 0) this.igniteTarNear(z.x, z.y, 50, z.burnBy); }
      if (def.split && this.zombies.length < 280) {
        this.emit('split', { x: z.x, y: z.y });
        for (let i = 0; i < def.split; i++) {
          const a = rand(0, 6.28), c = this.spawnZombie('splitling', z.x + Math.cos(a) * 10, z.y + Math.sin(a) * 10);
          c.kvx = Math.cos(a) * 220; c.kvy = Math.sin(a) * 220; c.atkT = 0.4;
        }
      }
    }
    // Radial damage. dmg hits zombies; pdmg hits players; sdmg hits structures.
    explode(x, y, radius, dmg, by, pdmg, sdmg, look) {
      this.emit('explosion', { x, y, r: radius, look: look || 'fire' });
      if (this.tar.length && look !== 'acid') this.igniteTarNear(x, y, radius, by);
      if (dmg > 0) {
        const zs = this.zombies;
        for (let i = 0; i < zs.length; i++) {
          const z = zs[i];
          if (z.dead || z.burrowed) continue;
          const dx = z.x - x, dy = z.y - y, d = Math.hypot(dx, dy);
          if (d > radius + z.r) continue;
          const f = 1 - 0.6 * clamp(d / radius, 0, 1);
          const k = d > 1 ? 260 * f / d : 0;
          this.damageZombie(z, dmg * f, by, dx * k, dy * k);
        }
      }
      if (pdmg > 0) {
        for (const p of this.players) {
          if (p.away || p.down) continue;
          const d = Math.hypot(p.x - x, p.y - y);
          if (d < radius + PR) this.hurt(p, pdmg * (1 - 0.5 * clamp(d / radius, 0, 1)), x, y);
        }
      }
      if (sdmg > 0) {
        for (const s of this.structs) {
          if (s.dead) continue;
          if (Math.hypot(s.x - x, s.y - y) < radius + 14) this.damageStruct(s, sdmg);
        }
      }
    }
    hurt(p, dmg, fx, fy) {
      if (p.away || p.down || this.phase !== 'night') return;
      p.hp -= dmg * this.diff().dmg;
      p.hurtT = 0.35;
      if (fx !== undefined) {
        const d = Math.hypot(p.x - fx, p.y - fy) || 1;
        p.kvx += (p.x - fx) / d * 120; p.kvy += (p.y - fy) / d * 120;
      }
      this.emit('hurt', { pid: p.id, x: p.x, y: p.y });
      if (p.hp <= 0) {
        this.cancelCarry(p);
        p.hp = 0; p.down = true; p.reviveT = 0; p.build = null; p.reloadT = 0;
        this.flowDirty = true;
        this.emit('down', { pid: p.id, x: p.x, y: p.y, name: p.name });
      }
    }
    blockedCell(cx, cy) {
      if (cx < 0 || cy < 0 || cx >= GW || cy >= GH) return true;
      const s = this.grid[cy * GW + cx];
      return !!s && GD.STRUCTS[s.id].block;
    }
    startLeap(z, tx, ty, dur, pounce) {
      z.leap = { fx: z.x, fy: z.y, tx, ty, t: 0, dur, pounce };
      z.leapCd = pounce ? 2.6 : 3.2;
      z.kvx = 0; z.kvy = 0;
      this.emit('leap', { x: z.x, y: z.y });
    }

    updateZombie(z, dt, targets) {
      const def = GD.ZOMBIES[z.type], alive = this.aliveNow, n = this.night;
      // once a zombie has come onto the map it stays on it: knockback or backing away must never park it out of reach
      // past the edge (bullets vanish out there). Anything alive for a while counts as having come in.
      z.age = (z.age || 0) + dt;
      if (!z.entered && ((z.x > 0 && z.y > 0 && z.x < W && z.y < H) || z.age > 12)) z.entered = true;
      if (z.entered && !def.seg && !z.leap) {
        const m = Math.min(z.r, 30);
        if (z.x < m || z.x > W - m || z.y < m || z.y > H - m) {
          z.x = clamp(z.x, m, W - m); z.y = clamp(z.y, m, H - m);
          if ((z.x <= m && z.kvx < 0) || (z.x >= W - m && z.kvx > 0)) z.kvx = 0;
          if ((z.y <= m && z.kvy < 0) || (z.y >= H - m && z.kvy > 0)) z.kvy = 0;
        }
      }
      if (z.stunImm > 0) z.stunImm -= dt;
      if (z.stunAcc > 0) z.stunAcc = Math.max(0, z.stunAcc - dt * 0.35);      // the shock wears off if left alone
      if (z.chill > 0) z.chill -= dt;
      z.atkT -= dt;
      if (z.hitT > 0) z.hitT -= dt;
      if (z.lunge > 0) z.lunge -= dt * 4;
      if (z.rage > 0) z.rage -= dt;
      if (z.burn > 0 && !z.burrowed) {
        z.burn -= dt;
        const was = this.srcTurret;
        this.srcTurret = !!z.burnTurret;
        this.damageZombie(z, GD.BURN.dps * dt * (z.r > GD.BURN.bigR ? GD.BURN.bigMul : 1), z.burnBy, 0, 0, true);
        this.srcTurret = was;
        z.hitT = 0;
        if (z.dead) return;
      }
      // regenerates when left alone
      if (def.regen && z.hp < z.maxhp && this.time - (z.hurtAt || 0) > 4) z.hp = Math.min(z.maxhp, z.hp + z.maxhp * def.regen * dt);
      // Bonewyrm body: placed by its head (see updateWyrms); it only crushes what it touches
      if (def.seg) {
        for (const p of alive) {
          const dx = p.x - z.x, dy = p.y - z.y, d = Math.hypot(dx, dy), min = z.r + PR;
          if (d >= min) continue;
          if (z.atkT <= 0) { z.atkT = 0.7; this.hurt(p, def.dmg * this.biteMul(n), z.x, z.y); }
          if (d > 0.01) { p.x += dx / d * (min - d); p.y += dy / d * (min - d); }     // the body is solid
        }
        const under = this.structAt(Math.floor(z.x / CELL), Math.floor(z.y / CELL));
        if (under && !under.dead && !GD.STRUCTS[under.id].husk && GD.STRUCTS[under.id].block) { this.damageStruct(under, (def.grind || 60) * this.wallMul(n) * dt); under.hitT = 0; }
        return;
      }
      // airborne (Leaper): no collisions until it lands
      if (z.leap) {
        const L = z.leap;
        L.t += dt;
        const k = Math.min(1, L.t / L.dur);
        z.x = L.fx + (L.tx - L.fx) * k; z.y = L.fy + (L.ty - L.fy) * k;
        z.air = Math.sin(k * Math.PI);
        if (k >= 1) {
          z.leap = null; z.air = 0; z.lunge = 1;
          if (L.pounce) {
            for (const p of alive) if (Math.hypot(p.x - z.x, p.y - z.y) < z.r + PR + 14) this.hurt(p, def.dmg * 1.5 * this.biteMul(n), z.x, z.y);
          }
          this.emit('land', { x: z.x, y: z.y });
        }
        return;
      }
      // knockback
      if (z.kvx || z.kvy) {
        z.x += z.kvx * dt; z.y += z.kvy * dt;
        const f = Math.exp(-9 * dt);
        z.kvx *= f; z.kvy *= f;
        if (Math.abs(z.kvx) + Math.abs(z.kvy) < 2) { z.kvx = 0; z.kvy = 0; }
      }
      // underground (Burrower): beeline to the nearest survivor, ignoring walls, then erupt
      if (z.burrowed) {
        let bp = null, bd = Infinity;
        for (const p of alive) { const d = Math.hypot(p.x - z.x, p.y - z.y); if (d < bd) { bd = d; bp = p; } }
        if (!bp) return;
        const inside = z.x > 0 && z.y > 0 && z.x < W && z.y < H;
        if (inside) z.surfT -= dt;
        z.ang = Math.atan2(bp.y - z.y, bp.x - z.x);
        z.x += Math.cos(z.ang) * z.speed * 1.25 * dt; z.y += Math.sin(z.ang) * z.speed * 1.25 * dt;
        z.wob += dt * 6;
        if (inside && (bd < 95 || z.surfT <= 0)) {
          z.burrowed = false; z.atkT = 0.35; z.lunge = 1;
          this.emit('surface', { x: z.x, y: z.y });
        }
        return;
      }
      // Regenerating champion: heals, but only when it has not been hit for 1.5 s, so steady fire always wins
      if (z.regen > 0 && z.hp < z.maxhp && this.time - (z.hurtAt === undefined ? -99 : z.hurtAt) > 1.5) z.hp = Math.min(z.maxhp, z.hp + z.maxhp * z.regen * dt);
      if (def.fly) { this.flyerStep(z, dt, n); return; }
      // Disruptor: EMP pulse knocks nearby turrets offline
      if (def.emp && z.stun <= 0 && z.x > 0 && z.y > 0 && z.x < W && z.y < H) {
        z.empT -= dt;
        if (z.empT <= 0) {
          const E = def.emp, hit = [];
          for (const s of this.structs) if (!s.dead && TURRET_SET.has(s.id) && Math.hypot(s.x - z.x, s.y - z.y) < E.r) hit.push(s);
          if (hit.length) { for (const s of hit) s.emp = Math.max(s.emp || 0, E.dur); z.empT = E.every; z.lunge = 1; this.emit('emp', { x: z.x, y: z.y, r: E.r }); }
          else z.empT = 0.5;
        }
      }
      // Colossus: a ground stomp that wrecks everything built around it
      if (def.stomp && z.x > 0 && z.y > 0 && z.x < W && z.y < H) {
        z.stompT -= dt;
        if (z.stompT <= 0) {
          const S = def.stomp; z.stompT = S.every; z.lunge = 1;
          for (const s of this.structs) if (!s.dead && Math.hypot(s.x - z.x, s.y - z.y) < S.r + 14) this.damageStruct(s, S.sdmg * this.wallMul(n));
          for (const p of alive) {
            const dx = p.x - z.x, dy = p.y - z.y, d = Math.hypot(dx, dy) || 1;
            if (d < S.r + PR) { this.hurt(p, 30 * this.biteMul(n), z.x, z.y); p.kvx += dx / d * 420; p.kvy += dy / d * 420; }
          }
          this.emit('stomp', { x: z.x, y: z.y, r: S.r });
        }
      }
      // nearest target: a survivor or a Noise Lure
      let tp = null, td = Infinity;
      for (let i = 0; i < targets.length; i++) {
        const p = targets[i], d = Math.hypot(p.x - z.x, p.y - z.y);
        if (d < td) { td = d; tp = p; }
      }
      let np = null, nd = Infinity;               // nearest actual survivor (for abilities)
      for (const p of alive) { const d = Math.hypot(p.x - z.x, p.y - z.y); if (d < nd) { nd = d; np = p; } }
      let dirx = 0, diry = 0, move = true;
      if (z.stun > 0) { z.stun -= dt; move = false; z.charge = null; }
      const inside = z.x >= 0 && z.y >= 0 && z.x < W && z.y < H;
      // locked onto a wall or turret it ran into: keep at it until it breaks (a survivor close by still wins)
      let ag = z.aggro || null;
      if (ag && (ag.dead || this.grid[ag.cy * GW + ag.cx] !== ag || Math.hypot(ag.x - z.x, ag.y - z.y) > CELL * 3 ||
        (np && nd < z.r + PR + 30) || z.charge)) { ag = null; z.aggro = null; }
      if (tp) {
        const cx = clamp(Math.floor(z.x / CELL), 0, GW - 1), cy = clamp(Math.floor(z.y / CELL), 0, GH - 1);
        let tx = tp.x, ty = tp.y;
        if (ag) {
          tx = ag.x; ty = ag.y;
        } else if (!inside) {
          tx = cx * CELL + CELL / 2; ty = cy * CELL + CELL / 2;
        } else if (td > 105) {
          const flow = this.flow;
          let best = flow[cy * GW + cx], bx = -1, by = -1;
          for (let oy = -1; oy <= 1; oy++) {
            for (let ox = -1; ox <= 1; ox++) {
              if (!ox && !oy) continue;
              const nx = cx + ox, ny = cy + oy;
              if (nx < 0 || ny < 0 || nx >= GW || ny >= GH) continue;
              if (ox && oy && (this.blockedCell(nx, cy) !== this.blockedCell(cx, ny))) continue;
              const f = flow[ny * GW + nx];
              if (f < best) { best = f; bx = nx; by = ny; }
            }
          }
          if (bx >= 0) {
            tx = bx * CELL + CELL / 2; ty = by * CELL + CELL / 2;
            // heading through a diagonal gap between two corner-touching walls
            if (bx !== cx && by !== cy && this.blockedCell(bx, cy) && this.blockedCell(cx, by)) {
              const a = this.structAt(bx, cy), b = this.structAt(cx, by);
              if (a && b) {
                if (z.r <= GAP_R) z.sq = { a, b, t: 1.5 };                     // small: squeeze through, clawing
                else if (!z.aggro && !def.wyrmHead && !def.seg) z.aggro = a.hp <= b.hp ? a : b;   // too big: widen it
              }
            }
          }
        }
        const dx = tx - z.x, dy = ty - z.y, d = Math.hypot(dx, dy);
        if (d > 0.5) { dirx = dx / d; diry = dy / d; }
        const want = ag ? Math.atan2(ag.y - z.y, ag.x - z.x) : td < 105 ? Math.atan2(tp.y - z.y, tp.x - z.x) : Math.atan2(diry, dirx);
        z.ang += angDiff(want, z.ang) * Math.min(1, dt * 8);

        if (inside && z.stun <= 0) {
          // Screamer: enrages everything nearby once it has eyes on a survivor
          if (def.scream) {
            z.screamT -= dt;
            if (z.screamT <= 0 && np && nd < 380) {
              z.screamT = 7; z.lunge = 1; z.rage = 4;
              this.emit('scream', { x: z.x, y: z.y, r: 280 });
              this.forNear(z.x, z.y, 280, (o) => { if (Math.hypot(o.x - z.x, o.y - z.y) < 280) o.rage = Math.max(o.rage, 4.5); });
            }
          }
          // Leaper: pounce on a survivor in range
          if (def.leap) {
            z.leapCd -= dt;
            if (z.leapCd <= 0 && np && nd > 50 && nd < 175) {
              this.startLeap(z, np.x - Math.cos(z.ang) * (z.r + PR - 4), np.y - Math.sin(z.ang) * (z.r + PR - 4), 0.38, true);
              return;
            }
          }
          // Juggernaut: straight-line charge
          if (def.charge) {
            z.chargeCd -= dt;
            if (!z.charge && z.chargeCd <= 0 && np && nd > 90 && nd < 430) {
              const a = Math.atan2(np.y - z.y, np.x - z.x);
              z.charge = { dx: Math.cos(a), dy: Math.sin(a), t: 1.5 };
              z.chargeCd = 6.5; z.ang = a;
              this.emit('charge', { x: z.x, y: z.y });
            }
          }
          // Smokebelcher: belches a cloud every second
          if (def.smoke) {
            z.smokeT = (z.smokeT === undefined ? 0.3 : z.smokeT) - dt;
            if (z.smokeT <= 0) { z.smokeT = 1; this.puffSmoke(z.x, z.y, 90, 7); }
          }
          // Tarborn: oozes tar as it walks
          if (def.tar) {
            z.tarT -= dt;
            if (z.tarT <= 0) { z.tarT = 0.45; this.dropTar(z.x, z.y, 21, 16); }
          }
          // Gravecaller: raises the recently dead around it
          if (def.raise) {
            z.raiseT -= dt;
            if (z.raiseT <= 0) {
              const R2 = 300 * 300, now = this.time;
              const near = this.corpses.filter((c) => now - c.t < 10 && (c.x - z.x) ** 2 + (c.y - z.y) ** 2 < R2).slice(-4);
              if (near.length && this.zombies.length < 260) {
                const pts = [];
                for (const c of near) {
                  const r = this.spawnZombie(c.type, c.x, c.y);
                  r.hp = r.maxhp = r.maxhp * 0.6; r.raised = true; r.atkT = 0.6; r.stun = 0.5; r.burrowed = false;
                  pts.push([Math.round(c.x), Math.round(c.y)]);
                }
                this.corpses = this.corpses.filter((c) => near.indexOf(c) < 0);
                this.emit('raise', { x: z.x, y: z.y, pts });
                z.raiseT = 6; z.lunge = 1;
              } else z.raiseT = 0.8;
            }
          }
          // Broodmother: keeps birthing Crawlers
          if (def.brood) {
            z.broodT -= dt;
            if (z.broodT <= 0) {
              z.broodT = 2; z.lunge = 1;                                  // a crawler factory: 3 every 2 s
              if (this.zombies.length < 260) {
                for (let i = 0; i < 3; i++) {
                  const a = z.ang + Math.PI + rand(-0.8, 0.8);
                  const c = this.spawnZombie('crawler', z.x + Math.cos(a) * (z.r + 8), z.y + Math.sin(a) * (z.r + 8));
                  c.kvx = Math.cos(a) * 160; c.kvy = Math.sin(a) * 160;
                }
                this.emit('brood', { x: z.x, y: z.y });
              }
            }
          }
          if (z.type === 'boss') {
            z.slamT -= dt; z.broodT -= dt;
            if (z.slamT <= 0 && np && nd < 170) {
              z.slamT = 4.5; z.lunge = 1;
              this.emit('slam', { x: z.x, y: z.y, r: 170 });
              for (const p of alive) {
                const dx = p.x - z.x, dy = p.y - z.y, d = Math.hypot(dx, dy) || 1;
                if (d < 170 + PR) {
                  this.hurt(p, 40 * this.biteMul(n), z.x, z.y);
                  p.kvx += dx / d * 620; p.kvy += dy / d * 620;          // hurled away
                }
              }
              for (const s2 of this.structs) {
                if (!s2.dead && Math.hypot(s2.x - z.x, s2.y - z.y) < 170) this.damageStruct(s2, 30 * this.wallMul(n));
              }
            }
            if (z.broodT <= 0) {
              z.broodT = 8;
              if (this.zombies.length < 260) {
                for (let i = 0; i < 3; i++) {
                  const a = rand(0, 6.28);
                  this.spawnZombie('runner', z.x + Math.cos(a) * 50, z.y + Math.sin(a) * 50);
                }
              }
            }
          }
        }
      } else {
        move = false;
      }
      // Gravecaller keeps its distance: it backs away from any survivor that gets close (but stays on the map)
      if (def.raise && np && nd < 340 && z.stun <= 0 && inside && !z.aggro) {
        let fx = z.x - np.x, fy = z.y - np.y; const fl = Math.hypot(fx, fy) || 1; fx /= fl; fy /= fl;
        if ((z.x < 60 && fx < 0) || (z.x > W - 60 && fx > 0)) fx = 0;
        if ((z.y < 60 && fy < 0) || (z.y > H - 60 && fy > 0)) fy = 0;
        if (fx || fy) { const m = Math.hypot(fx, fy); dirx = fx / m; diry = fy / m; move = true; z.ang = Math.atan2(np.y - z.y, np.x - z.x); }
      }

      // razor wire underfoot (Crawlers slide under it)
      let slow = 1;
      const here = this.structAt(Math.floor(z.x / CELL), Math.floor(z.y / CELL));
      if (here && here.id === 'wire' && !def.wireproof && !z.charge) {
        slow = z.r > 25 ? 0.85 : 0.6;                // razor wire: 60% speed (big ones 85%)
        this.damageZombie(z, 16 * dt, here.owner, 0, 0, true);
        z.hitT = 0;
        this.damageStruct(here, (z.r > 25 ? 30 : 5) * dt);
        here.hitT = 0;
        if (z.dead) return;
      }
      if (z.climb) slow *= 0.4;                      // clambering over a Wyrm Husk
      if (here && here.id === 'mud' && !z.charge) slow *= z.r > 25 ? 0.8 : 0.5;     // Mud Pit
      if (z.sq) {                                    // squeezing through a diagonal gap: slow, and it claws both walls
        if (z.sq.a.dead || z.sq.b.dead || ((z.sq.t -= dt) <= 0 && !z.sqz)) { z.sq = null; z.sqz = false; }
        else if (z.sqz) {
          slow *= 0.3;
          if (z.atkT <= 0 && z.stun <= 0) {
            z.atkT = 0.7; z.lunge = 1;
            const A = z.sq.a, B = z.sq.b, dm = Math.max(def.dmg, 8) * 0.5 * this.wallMul(n);
            this.emit('squeeze', { x: Math.max(A.cx, B.cx) * CELL, y: Math.max(A.cy, B.cy) * CELL });
            this.damageStruct(A, dm); this.damageStruct(B, dm);
          }
        }
      }
      if (z.chill > 0) slow *= def.stun ? 0.7 : 0.5;   // Frostbite
      let speed = z.speed * slow * (z.rage > 0 ? 1.45 : 1);
      if (z.charge) {
        dirx = z.charge.dx; diry = z.charge.dy; speed = z.speed * 3.4; move = true;
        z.charge.t -= dt;
        if (z.charge.t <= 0) z.charge = null;
      }
      if (move) {
        z.x += dirx * speed * dt;
        z.y += diry * speed * dt;
        z.wob += dt * (4 + speed * 0.08);
      }

      // crowd separation
      this.forNear(z.x, z.y, z.r + 32, (o) => {
        if (o === z || o.leap) return;
        const dx = z.x - o.x, dy = z.y - o.y, min = z.r + o.r;
        const d2 = dx * dx + dy * dy;
        if (d2 >= min * min) return;
        if (d2 < 0.01) { z.x += rand(-1, 1); z.y += rand(-1, 1); return; }
        const d = Math.sqrt(d2);
        const share = o.r > z.r ? 0.5 : o.r < z.r ? 0.12 : 0.3;
        const k = (min - d) / d * share;
        z.x += dx * k; z.y += dy * k;
      });

      // walls
      const gx = Math.floor(z.x / CELL), gy = Math.floor(z.y / CELL);
      const span = z.r > CELL * 0.6 ? 2 : 1;
      let hitS = null, climb = false, touchT = null, sqNow = false;
      const climber = z.r <= 17 && !z.charge && !def.wyrmHead;     // small zombies scramble over carcasses; big ones chew through
      for (let oy = -span; oy <= span; oy++) {
        for (let ox = -span; ox <= span; ox++) {
          const s2 = this.structAt(gx + ox, gy + oy);
          if (!s2 || s2.dead || !GD.STRUCTS[s2.id].block) continue;
          if (climber && GD.STRUCTS[s2.id].husk) {
            if (Math.abs(z.x - s2.x) < CELL / 2 + z.r * 0.5 && Math.abs(z.y - s2.y) < CELL / 2 + z.r * 0.5) climb = true;
            continue;
          }
          if (z.sq && (s2 === z.sq.a || s2 === z.sq.b)) {        // squeezing between these two: they do not stop it
            const qx = clamp(z.x, s2.cx * CELL, s2.cx * CELL + CELL), qy = clamp(z.y, s2.cy * CELL, s2.cy * CELL + CELL);
            if ((z.x - qx) ** 2 + (z.y - qy) ** 2 < z.r * z.r) sqNow = true;
            continue;
          }
          if (pushOut(z, z.r, s2.cx * CELL, s2.cy * CELL)) {
            const sx = s2.x - z.x, sy = s2.y - z.y, sd = Math.hypot(sx, sy) || 1;
            if (s2 === z.aggro) hitS = s2;
            else if (!hitS && (sx * dirx + sy * diry) / sd > 0.25) hitS = s2;
            if (!touchT && TURRET_SET.has(s2.id)) touchT = s2;
          }
        }
      }
      z.climb = climb; z.sqz = sqNow;
      // Bumped into a turret, or ran head-on into a wall: lock onto it and tear it down.
      // (The Abomination spares walls, Leapers vault them, wyrms and charges just plough on.)
      if (!z.aggro && !z.charge && z.type !== 'boss' && !def.wyrmHead && !def.seg && !def.raise) {
        if (touchT) z.aggro = touchT;
        else if (hitS && !def.leap && !GD.STRUCTS[hitS.id].husk) z.aggro = hitS;
      }
      const wm = this.wallMul(n) * (z.rage > 0 ? 1.25 : 1);
      if (hitS && z.stun <= 0) {
        if (def.blast) { this.killZombie(z); return; }
        if (z.charge) {
          // bulldoze: a charging Juggernaut wrecks what it hits and only stops if the wall survives
          this.damageStruct(hitS, 500 * wm);
          this.emit('structHit', { x: hitS.x, y: hitS.y, big: true });
          if (!hitS.dead) z.charge = null;
        } else if (def.leap && z.leapCd <= 0) {
          // Vault over a single wall. Only a second WALL right behind it stops this (walls two thick); a turret,
          // lamp or anything else behind it just means a longer jump: past it, or beside it.
          const ax = hitS.x - z.x, ay = hitS.y - z.y;
          const sx = Math.abs(ax) >= Math.abs(ay) ? Math.sign(ax) : 0, sy = sx ? 0 : Math.sign(ay);
          const bx = hitS.cx + sx, by = hitS.cy + sy;                       // the cell right behind the wall
          const behind = this.structAt(bx, by);
          const free = (x, y) => !this.blockedCell(x, y) && !(x === FIRE.cx && y === FIRE.cy);
          let land = null;
          if (!(behind && GD.STRUCTS[behind.id].wall)) {
            const tries = [[bx, by], [bx + sx, by + sy], [bx + sy, by + sx], [bx - sy, by - sx]];
            for (const [x, y] of tries) if (free(x, y)) { land = [x, y]; break; }
          }
          if (land) {
            const far = Math.abs(land[0] - hitS.cx) + Math.abs(land[1] - hitS.cy) > 1;
            this.startLeap(z, land[0] * CELL + CELL / 2, land[1] * CELL + CELL / 2, far ? 0.62 : 0.5, false);
            return;
          }
          z.leapCd = 0.8;
        }
        if (!z.charge && z.atkT <= 0) {
          z.atkT = 0.8; z.lunge = 1;
          this.damageStruct(hitS, Math.max(def.dmg, 8) * (def.wreck || 1) * wm);
          this.emit('structHit', { x: hitS.x, y: hitS.y, gore: !!GD.STRUCTS[hitS.id].husk });
          const zap = GD.STRUCTS[hitS.id].zap;
          if (zap && !z.dead) {                       // Shock Fence: it bites back
            this.emit('arc', { pts: [{ x: hitS.x, y: hitS.y }, { x: z.x, y: z.y }] });
            this.stunZombie(z, 0.35);
            this.srcTurret = true; this.damageZombie(z, zap * (1 + 0.06 * (n - 1)), hitS.owner, 0, 0); this.srcTurret = false;
            if (z.dead) return;
          }
        }
      }
      // campfire is solid
      {
        const dx = z.x - FIRE.x, dy = z.y - FIRE.y, d = Math.hypot(dx, dy), min = FIRE.r + z.r;
        if (d < min && d > 0.01) { z.x += dx / d * (min - d); z.y += dy / d * (min - d); }
        // going for the fire: smash it
        if (tp && tp.fire && !ag && z.stun <= 0 && d < min + 7 && this.phase === 'night') {
          if (def.blast) { this.damageFire(120 * wm, z.x, z.y); this.killZombie(z); return; }
          if (!z.charge && z.atkT <= 0 && def.dmg > 0) {
            z.atkT = 0.8; z.lunge = 1;
            this.damageFire(Math.max(def.dmg, 8) * (def.wreck || 1) * wm * (z.rage > 0 ? 1.3 : 1), z.x, z.y);
          }
        }
      }
      // bite (survivors only; lures are attacked as walls)
      if (np && z.stun <= 0) {
        const d = Math.hypot(np.x - z.x, np.y - z.y), min = z.r + PR;
        if (d < min + 5) {
          if (def.blast) { this.killZombie(z); return; }
          if (z.charge) {
            this.hurt(np, 38 * this.biteMul(n), z.x, z.y);
            np.kvx += z.charge.dx * 520; np.kvy += z.charge.dy * 520;
            z.charge = null; z.atkT = 1;
          } else if (z.atkT <= 0 && def.dmg > 0) {
            z.atkT = 0.85; z.lunge = 1;
            this.hurt(np, def.dmg * this.biteMul(n) * (z.rage > 0 ? 1.3 : 1), z.x, z.y);
          }
        }
        if (d < min && d > 0.01) { z.x -= (np.x - z.x) / d * (min - d); z.y -= (np.y - z.y) / d * (min - d); }
      }
    }

    // ------------------------------------------------------------ weapons
    findAimTarget(x, y, ang, range, cone) {
      let best = null, bestScore = Infinity;
      const zs = this.zombies;
      for (let i = 0; i < zs.length; i++) {
        const z = zs[i];
        if (z.dead || z.burrowed) continue;
        const dx = z.x - x, dy = z.y - y, d = Math.hypot(dx, dy);
        if (d > range + z.r) continue;
        const a = Math.abs(angDiff(Math.atan2(dy, dx), ang));
        const slack = Math.atan2(z.r, Math.max(d, 1));
        if (a > cone + slack) continue;
        const score = a * 300 + d;
        if (score < bestScore) { bestScore = score; best = z; }
      }
      return best;
    }
    // Arc lightning and Tesla Coils stun. Small zombies just freeze; big ones resist (see stun in data.js): shorter
    // stuns, and after soaking enough they shrug it off and are immune for a few seconds, so they can't be held forever.
    // Gorefly: flies straight over everything to the nearest turret (or survivor, or the fire) and gnaws at it
    flyerStep(z, dt, n) {
      if (z.stun > 0) { z.stun -= dt; return; }
      if (z.kvx || z.kvy) { z.x += z.kvx * dt; z.y += z.kvy * dt; const f = Math.exp(-9 * dt); z.kvx *= f; z.kvy *= f; }
      z.goalT = (z.goalT || 0) - dt;
      if (!z.goal || z.goal.dead || z.goalT <= 0) {
        z.goalT = 1;
        let best = null, bd = Infinity;
        for (const s of this.structs) { if (s.dead || !TURRET_SET.has(s.id)) continue; const d = Math.hypot(s.x - z.x, s.y - z.y); if (d < bd) { bd = d; best = s; } }
        for (const p of this.aliveNow) { const d = Math.hypot(p.x - z.x, p.y - z.y) * 1.3; if (d < bd) { bd = d; best = p; } }
        if (!best && this.fireHp > 0) best = { x: FIRE.x, y: FIRE.y, fire: true };
        z.goal = best;
      }
      const g = z.goal;
      if (!g) return;
      const dx = g.x - z.x, dy = g.y - z.y, d = Math.hypot(dx, dy) || 1;
      const reach = g.fire ? FIRE.r + z.r + 4 : g.maxhp !== undefined && g.id && GD.STRUCTS[g.id] ? 24 : z.r + PR + 4;
      z.wob += dt * 30;
      const jig = Math.sin(z.wob * 0.21 + z.id) * 0.6;                 // a swarm wobbles as it flies
      z.ang = Math.atan2(dy, dx);
      if (d > reach) {
        const sp = z.speed * (z.chill > 0 ? 0.5 : 1) * (z.rage > 0 ? 1.3 : 1);
        z.x += (dx / d * Math.cos(jig) - dy / d * Math.sin(jig)) * sp * dt;
        z.y += (dy / d * Math.cos(jig) + dx / d * Math.sin(jig)) * sp * dt;
        return;
      }
      z.atkT -= dt;
      if (z.atkT > 0) return;
      z.atkT = 0.6; z.lunge = 1;
      if (g.fire) this.damageFire(GD.ZOMBIES[z.type].dmg * this.wallMul(n), z.x, z.y);
      else if (GD.STRUCTS[g.id]) { this.damageStruct(g, GD.ZOMBIES[z.type].dmg * 2 * this.wallMul(n)); this.emit('structHit', { x: g.x, y: g.y }); }
      else this.hurt(g, GD.ZOMBIES[z.type].dmg * this.biteMul(n), z.x, z.y);
    }
    // Frostbite: chilled zombies move at half speed (big, stun-resistant ones at 70%)
    chillZombie(z, dur) { if (!GD.ZOMBIES[z.type].noChill) z.chill = Math.max(z.chill || 0, dur); }
    stunZombie(z, dur) {
      const S = GD.ZOMBIES[z.type].stun;
      if (!S) { z.stun = Math.max(z.stun, dur); return; }
      if (z.stunImm > 0 || !S.mul) return;
      const d = dur * S.mul;
      z.stun = Math.max(z.stun, d);
      z.stunAcc = (z.stunAcc || 0) + d;
      if (z.stunAcc >= S.cap) {
        z.stunImm = S.imm; z.stunAcc = 0;
        this.emit('shrug', { x: z.x, y: z.y, r: z.r });
      }
    }
    chainLightning(x, y, first, count, dmg, by, stun) {
      const pts = [{ x, y }];
      const hit = new Set();
      let cur = first, d = dmg;
      while (cur && pts.length <= count) {
        hit.add(cur);
        pts.push({ x: cur.x, y: cur.y });
        this.stunZombie(cur, stun);
        const from = cur;
        this.damageZombie(cur, d, by, 0, 0);
        d *= 0.86;
        let next = null, nd = 160;
        this.forNear(from.x, from.y, 160, (o) => {
          if (hit.has(o)) return;
          const dd = Math.hypot(o.x - from.x, o.y - from.y);
          if (dd < nd) { nd = dd; next = o; }
        });
        cur = next;
      }
      this.emit('arc', { pts });
    }
    // Fire one shot of weapon `wid` from (x, y). Used by survivors and by gun turrets.
    shoot(x, y, ang, wid, lvl, owner, dmgMul, assist, rangeCap, mounted) {
      const w = GD.WEAPONS[wid];
      const mx = x + Math.cos(ang) * 24, my = y + Math.sin(ang) * 24;
      const dmg = w.dmg * (1 + 0.3 * lvl) * dmgMul;
      const range = rangeCap ? Math.min(w.range, rangeCap) : w.range;
      if (w.kind === 'arc') {
        const t = this.findAimTarget(x, y, ang, range, 0.55);
        if (t) this.chainLightning(mx, my, t, w.chain, dmg, owner, 0.3);
        else this.emit('arc', { pts: [{ x: mx, y: my }, { x: mx + Math.cos(ang) * 150 + rand(-20, 20), y: my + Math.sin(ang) * 150 + rand(-20, 20) }] });
      } else {
        if (assist && w.kind !== 'flame') {
          const t = this.findAimTarget(x, y, ang, range, 0.2);
          if (t) ang = Math.atan2(t.y - y, t.x - x);
        }
        for (let i = 0; i < w.pellets; i++) {
          const a = ang + rand(-w.spread, w.spread);
          const sp = w.speed * (w.kind === 'flame' ? rand(0.8, 1.15) : rand(0.96, 1.04));
          this.bullets.push({
            kind: w.kind, x: mx, y: my, px: x, py: y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp,
            life: (w.travel || range) / sp, max: (w.travel || range) / sp, dmg, owner, pierce: w.pierce, knock: w.knock,      // travel: a blade flies on past its aiming range
            blast: w.blast || 0, burn: w.burn || 0, hit: null, r: w.kind === 'flame' ? 5 : w.saw ? 9 : 2, wid, turret: !!mounted,
            chill: w.chill || 0, bounce: w.bounce || 0, saw: !!w.saw, rail: !!w.rail,
          });
        }
      }
      this.emit('shot', { x: mx, y: my, ang, wid, pid: owner, px: x, py: y, turret: !!mounted });
    }
    fireWeapon(p) {
      const w = GD.WEAPONS[p.cur], own = p.weapons[p.cur];
      own.mag--;
      p.cd = w.cd;
      p.flash = 0.06;
      this.shoot(p.x, p.y, p.aim, p.cur, own.lvl, p.id, 1, p.input.assist, 0, false);
      if (own.mag <= 0) this.reload(p.id);
    }

    updatePlayer(p, dt) {
      if (p.aimLev) this.trackAim(p, dt);
      if (p.away) return;
      if (p.hurtT > 0) p.hurtT -= dt;
      if (p.flash > 0) p.flash -= dt;
      if (p.down) {
        let near = 0;
        for (const q of this.players) {
          if (q !== p && !q.away && !q.down && Math.hypot(q.x - p.x, q.y - p.y) < 62) near++;
        }
        if (near) {
          p.reviveT += dt * (1 + 0.5 * (near - 1));
          if (p.reviveT >= 3) {
            p.down = false; p.hp = Math.round(p.maxhp * 0.4); p.reviveT = 0; p.hurtT = 0;
            this.flowDirty = true;
            this.emit('revive', { pid: p.id, x: p.x, y: p.y, name: p.name });
          }
        } else if (p.reviveT > 0) p.reviveT = Math.max(0, p.reviveT - dt * 0.7);
        return;
      }
      const inp = p.input;
      const w = GD.WEAPONS[p.cur], own = p.weapons[p.cur];
      const firing = inp.fire && !p.build;
      let speed = 190 * (1 + 0.07 * (p.perks.agility || 0));
      if (this.tar.length && this.inTar(p.x, p.y)) speed *= 0.5;      // stuck in Tarborn tar
      if (firing && w.slowFire && own.mag > 0 && p.reloadT <= 0) speed *= w.slowFire;
      p.x += (inp.mx * speed + p.kvx) * dt;
      p.y += (inp.my * speed + p.kvy) * dt;
      const kf = Math.exp(-10 * dt);
      p.kvx *= kf; p.kvy *= kf;
      p.moving = Math.abs(inp.mx) + Math.abs(inp.my) > 0.1;
      if (p.moving) p.walk += dt * 11;
      if (inp.aim !== null) p.aim = inp.aim;
      else if (p.moving) p.aim = Math.atan2(inp.my, inp.mx);

      const gx = Math.floor(p.x / CELL), gy = Math.floor(p.y / CELL);
      for (let oy = -1; oy <= 1; oy++) {
        for (let ox = -1; ox <= 1; ox++) {
          const s = this.structAt(gx + ox, gy + oy);
          if (!s || s.dead) continue;
          const def = GD.STRUCTS[s.id];
          if (!def.block || def.gate || def.walk) continue;   // survivors walk through gates, turrets and med stations
          if (this.phase === 'day') continue;                // and through every wall in daylight (nothing to keep out)
          pushOut(p, PR, s.cx * CELL, s.cy * CELL);
        }
      }
      {
        const dx = p.x - FIRE.x, dy = p.y - FIRE.y, d = Math.hypot(dx, dy), min = FIRE.r + PR;
        if (d < min) {
          if (d > 0.01) { p.x += dx / d * (min - d); p.y += dy / d * (min - d); } else p.y += min;
        }
      }
      p.x = clamp(p.x, PR, W - PR); p.y = clamp(p.y, PR, H - PR);

      // healing
      const regen = p.perks.regen || 0;
      let heal = regen * 0.9;
      if (this.phase !== 'night' && Math.hypot(p.x - FIRE.x, p.y - FIRE.y) < 140) heal += 9;
      if (heal > 0 && p.hp < p.maxhp) p.hp = Math.min(p.maxhp, p.hp + heal * dt);

      // weapon
      if (p.cd > 0) p.cd -= dt;
      if (p.dryT > 0) p.dryT -= dt;
      if (p.reloadT > 0) {
        p.reloadT -= dt;
        if (p.reloadT <= 0) {
          p.reloadT = 0;
          if (w.infinite) own.mag = w.mag;
          else { const take = Math.min(w.mag - own.mag, own.reserve); own.mag += take; own.reserve -= take; }
          this.emit('reloaded', { pid: p.id });
        }
      }
      if (firing && p.reloadT <= 0) {
        // fire as many rounds as the frame allows (keeps very fast guns at their true rate)
        let guard = 0;
        while (p.cd <= 0 && own.mag > 0 && p.reloadT <= 0 && guard++ < 4) {
          const carry = p.cd;
          this.fireWeapon(p);
          p.cd += carry;
        }
        if (p.cd < 0) p.cd = 0;
        if (own.mag <= 0 && p.reloadT <= 0) {
          if (!this.reload(p.id)) {
            if (p.dryT <= 0) { p.dryT = 0.6; this.emit('dry', { pid: p.id }); }
            if (p.cur !== 'pistol') this.selectWeapon(p.id, 'pistol');
          }
        }
      } else if (p.cd < 0) p.cd = 0;
    }

    // ------------------------------------------------------------ bullets
    updateBullet(b, dt) {
      b.px = b.x; b.py = b.y;
      b.x += b.vx * dt; b.y += b.vy * dt;
      b.life -= dt;
      if (b.kind === 'acid') {
        if (b.life <= 0) {
          this.emit('acid', { x: b.x, y: b.y });
          for (const p of this.players) {
            if (!p.away && !p.down && Math.hypot(p.x - b.x, p.y - b.y) < 40 + PR) this.hurt(p, b.dmg, b.x, b.y);
          }
          const s = this.structAt(Math.floor(b.x / CELL), Math.floor(b.y / CELL));
          if (s) this.damageStruct(s, 26);
          return false;
        }
        return true;
      }
      if (b.kind === 'shell') {
        if (b.life <= 0) {
          if (b.napalm) this.ignite(b.x, b.y, b.owner);
          else this.explode(b.x, b.y, b.blast, b.dmg, b.owner, 0, 0, b.big ? 'big' : undefined);
          return false;
        }
        return true;
      }
      if (b.kind === 'flame') {
        b.r = 5 + 20 * (1 - Math.max(0, b.life) / b.max);
        this.forNear(b.x, b.y, b.r + 45, (z) => {
          const rr = b.r + z.r;
          const dx = z.x - b.x, dy = z.y - b.y;
          if (dx * dx + dy * dy > rr * rr) return;
          if (!b.hit) b.hit = [];
          if (b.hit.indexOf(z.id) >= 0) return;
          b.hit.push(z.id);
          z.burn = Math.max(z.burn, b.burn); z.burnBy = b.owner; z.burnTurret = !!b.turret;
          this.damageZombie(z, b.dmg, b.owner, 0, 0);
        });
        return b.life > 0;
      }
      // bullets and grenades: swept test against nearby zombies
      let alive = true;
      let hits = null;
      const reach = Math.max(80, Math.hypot(b.x - b.px, b.y - b.py) + 50);      // a Railspike moves 70 px a frame
      this.forNear(b.x, b.y, reach, (z) => {
        if (b.hit && b.hit.indexOf(z.id) >= 0) return;
        const rr = z.r + b.r;
        if (segDist2(z.x, z.y, b.px, b.py, b.x, b.y) <= rr * rr) (hits || (hits = [])).push(z);
      });
      if (hits) {
        if (hits.length > 1) {
          hits.sort((a, c) => ((a.x - b.px) ** 2 + (a.y - b.py) ** 2) - ((c.x - b.px) ** 2 + (c.y - b.py) ** 2));
        }
        for (const z of hits) {
          if (b.kind === 'grenade') {
            this.explode(z.x, z.y, b.blast, b.dmg, b.owner, 0, 0);
            return false;
          }
          const sp = Math.hypot(b.vx, b.vy) || 1;
          this.emit('hit', { x: z.x, y: z.y, ang: Math.atan2(b.vy, b.vx), ztype: z.type });
          // Deadeye: your own shots (not turrets') can crit for triple damage
          let dmg = b.dmg;
          if (!b.turret && b.owner) {
            const sh = this.getPlayer(b.owner), lv = sh && sh.perks && sh.perks.deadeye;
            if (lv && Math.random() < 0.06 * lv) { dmg *= 3; this.emit('crit', { x: z.x, y: z.y - z.r }); }
          }
          this.damageZombie(z, dmg, b.owner, b.vx / sp * b.knock, b.vy / sp * b.knock);
          if (b.chill && !z.dead) this.chillZombie(z, b.chill);
          if (b.pierce-- <= 0) { alive = false; break; }
          (b.hit || (b.hit = [])).push(z.id);
          if (!b.rail) b.dmg *= b.saw ? 0.96 : 0.85;              // a Railspike loses nothing; saws barely blunt
        }
      }
      if (!alive) return false;
      // sawblades ricochet off the edge of the map, and can cut through the same zombies again on the way back
      if (b.bounce > 0 && (b.x < 6 || b.y < 6 || b.x > W - 6 || b.y > H - 6)) {
        if (b.x < 6 || b.x > W - 6) { b.vx = -b.vx; b.x = clamp(b.x, 6, W - 6); }
        if (b.y < 6 || b.y > H - 6) { b.vy = -b.vy; b.y = clamp(b.y, 6, H - 6); }
        b.bounce--; b.hit = null;
        this.emit('ricochet', { x: b.x, y: b.y });
      }
      if (b.life <= 0) {
        if (b.kind === 'grenade') this.explode(b.x, b.y, b.blast, b.dmg, b.owner, 0, 0);
        return false;
      }
      return b.x > -300 && b.y > -300 && b.x < W + 300 && b.y < H + 300;       // far enough past the edge to reach anything there
    }

    // ------------------------------------------------------------ structures
    updateStruct(s, dt) {
      const def = GD.STRUCTS[s.id];
      if (s.hitT > 0) s.hitT -= dt;
      if (s.flash > 0) s.flash -= dt;
      if (s.id === 'mine') {
        if (this.time - s.born < 0.8) return;
        let trip = false;
        this.forNear(s.x, s.y, 50, (z) => {
          if (!z.fly && Math.hypot(z.x - s.x, z.y - s.y) < z.r + 12) trip = true;
        });
        if (trip) {
          this.removeStruct(s, true);
          this.explode(s.x, s.y, 120, 280, s.owner, 0, 0);
        }
        return;
      }
      if (s.id === 'beartrap') {                     // single use: clamps the first zombie that steps on it
        if (this.time - s.born < 0.5) return;
        let got = null;
        this.forNear(s.x, s.y, 50, (z) => { if (!got && !z.fly && !z.leap && !GD.ZOMBIES[z.type].seg && Math.abs(z.x - s.x) < CELL / 2 + z.r * 0.4 && Math.abs(z.y - s.y) < CELL / 2 + z.r * 0.4) got = z; });
        if (!got) return;
        const zd = GD.ZOMBIES[got.type];
        got.stun = Math.max(got.stun, def.hold * (zd.stun ? zd.stun.mul : 1));
        got.x = s.x; got.y = s.y; got.kvx = 0; got.kvy = 0;
        this.emit('spikes', { x: s.x, y: s.y });
        this.removeStruct(s, true);
        this.damageZombie(got, def.dmg * (1 + 0.07 * (this.night - 1)), s.owner, 0, 0, true);
        return;
      }
      if (s.id === 'spikes') {                       // floor trap: impales whatever is standing on it
        if (s.cd > 0) { s.cd -= dt; return; }
        const hit = [];
        this.forNear(s.x, s.y, 50, (z) => { if (!z.leap && !z.fly && Math.abs(z.x - s.x) < CELL / 2 + z.r * 0.4 && Math.abs(z.y - s.y) < CELL / 2 + z.r * 0.4) hit.push(z); });
        if (!hit.length) return;
        s.cd = def.cd;
        const dmg = def.dmg * (1 + 0.07 * (this.night - 1));
        for (const z of hit) this.damageZombie(z, dmg, s.owner, 0, 0, true);
        this.emit('spikes', { x: s.x, y: s.y });
        this.damageStruct(s, 18);
        return;
      }
      if (s.id === 'gravity') {                      // vortex: pull everything in range toward a ring around it
        const R = def.range, hold = def.hold;
        this.forNear(s.x, s.y, R, (z) => {
          if (z.leap || z.charge) return;
          const dx = s.x - z.x, dy = s.y - z.y, d = Math.hypot(dx, dy);
          if (d > R || d < hold) return;
          const m = (GD.ZOMBIES[z.type].knock === undefined ? 1 : GD.ZOMBIES[z.type].knock);
          const f = def.pull * Math.min(1, m * 1.5) * (0.4 + 0.6 * (d - hold) / (R - hold)) * dt;
          z.kvx += dx / d * f; z.kvy += dy / d * f;
        });
        return;
      }
      if (s.id === 'medic') {
        for (const p of this.players) {
          if (p.away || p.down || p.hp >= p.maxhp) continue;
          if (Math.hypot(p.x - s.x, p.y - s.y) < def.range) p.hp = Math.min(p.maxhp, p.hp + 7 * dt);
        }
        return;
      }
      if (s.emp > 0) { s.emp -= dt; if (s.fire > 0) { s.fire = 0; s.charge = def.charge || 0; } return; }   // knocked out by a Disruptor's EMP
      if (def.gun) { this.updateGunTurret(s, dt); return; }
      if (s.id === 'hellmouth') { this.updateHellmouth(s, def, dt); return; }
      if (s.id === 'sunlance') { this.updateSunlance(s, def, dt); return; }
      if (s.id === 'phoenix') { this.updatePhoenix(s, def, dt); return; }
      if (!def.range || !def.cd) return;
      s.cd -= dt;
      if (s.id === 'napalm') { this.updateNapalm(s, def, dt); return; }
      if (s.id === 'leviathan') { this.updateLeviathan(s, def, dt); return; }
      if (s.id === 'tesla') {
        if (s.cd > 0) return;
        const near = [];
        this.forNear(s.x, s.y, def.range, (z) => {
          const d = Math.hypot(z.x - s.x, z.y - s.y);
          if (d < def.range + z.r) near.push({ z, d });
        });
        if (!near.length) { s.cd = 0.1; return; }
        near.sort((a, b) => a.d - b.d);
        s.cd = def.cd; s.flash = 0.15;
        for (let i = 0; i < Math.min(4, near.length); i++) {
          const z = near[i].z;
          this.emit('arc', { pts: [{ x: s.x, y: s.y - 6 }, { x: z.x, y: z.y }], quiet: i > 0 });
          this.stunZombie(z, 0.55);
          this.damageZombie(z, def.dmg, s.owner, 0, 0);
        }
        return;
      }
      // gun + mortar turrets
      this.acquire(s, def.range, dt);
      if (!s.tgt) return;
      const want = Math.atan2(s.tgt.y - s.y, s.tgt.x - s.x);
      const da = angDiff(want, s.ang);
      s.ang += clamp(da, -7 * dt, 7 * dt);
      if (s.cd > 0 || Math.abs(da) > 0.25) return;
      s.cd = def.cd; s.flash = 0.06;
      const mx = s.x + Math.cos(s.ang) * 20, my = s.y + Math.sin(s.ang) * 20;
      if (s.id === 'cannon') {
        const d = Math.hypot(s.tgt.x - mx, s.tgt.y - my) || 1, sp = 520;
        this.bullets.push({ turret: true, kind: 'shell', x: mx, y: my, px: mx, py: my, vx: (s.tgt.x - mx) / d * sp, vy: (s.tgt.y - my) / d * sp,
          life: d / sp, max: d / sp, dmg: def.dmg, owner: s.owner, blast: def.blast, r: 4 });
        this.emit('shot', { x: mx, y: my, ang: s.ang, wid: 'cannon', turret: true });
      } else {
        const a = s.ang + rand(-0.05, 0.05), sp = 1000;
        this.bullets.push({ turret: true, kind: 'bullet', x: mx, y: my, px: s.x, py: s.y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp,
          life: (def.range + 60) / sp, max: 1, dmg: def.dmg, owner: s.owner, pierce: 0, knock: 20, blast: 0, hit: null, r: 2, wid: 'turret' });
        this.emit('shot', { x: mx, y: my, ang: a, wid: 'turret', turret: true });
      }
    }

    // Napalm Lobber: turns toward the nearest zombie, but lobs at the thickest crowd in range.
    updateNapalm(s, def, dt) {
      this.acquire(s, def.range, dt);
      if (!s.tgt) { if (s.cd < 0) s.cd = 0; return; }
      if (s.cd > 0) {
        s.ang += clamp(angDiff(Math.atan2(s.tgt.y - s.y, s.tgt.x - s.x), s.ang), -5 * dt, 5 * dt);
        return;
      }
      let best = s.tgt, bn = -1;
      const zs = this.zombies, R2 = def.pool * def.pool;
      for (let i = 0, seen = 0; i < zs.length && seen < 40; i++) {     // sample up to 40 zombies in range
        const z = zs[i];
        if (z.dead || z.burrowed || Math.hypot(z.x - s.x, z.y - s.y) > def.range + z.r) continue;
        seen++;
        let n = z.burn > 0 ? 0 : 1;                                       // prefer crowds that are not already burning
        this.forNear(z.x, z.y, def.pool, (o) => { if (o !== z && (o.x - z.x) ** 2 + (o.y - z.y) ** 2 < R2 && !(o.burn > 0)) n++; });
        if (n > bn) { bn = n; best = z; }
      }
      s.ang = Math.atan2(best.y - s.y, best.x - s.x);
      s.cd = def.cd; s.flash = 0.1;
      const mx = s.x + Math.cos(s.ang) * 16, my = s.y + Math.sin(s.ang) * 16;
      // aim a little ahead of a moving crowd
      const lead = best.stun > 0 ? 0 : best.speed * 0.35;
      const tx = best.x + Math.cos(best.ang) * lead, ty = best.y + Math.sin(best.ang) * lead;
      const d = Math.hypot(tx - mx, ty - my) || 1, sp = 480;
      this.bullets.push({ turret: true, napalm: true, kind: 'shell', x: mx, y: my, px: mx, py: my, vx: (tx - mx) / d * sp, vy: (ty - my) / d * sp,
        life: d / sp, max: d / sp, dmg: 0, owner: s.owner, blast: 0, r: 4 });
      this.emit('shot', { x: mx, y: my, ang: s.ang, wid: 'cannon', turret: true });
    }
    // Leviathan Cannon: shells the thickest crowd it can see, anywhere on the map, but only inside its fixed firing arc
    // (the way it was facing when placed) and never into Smokebelcher smoke.
    updateLeviathan(s, def, dt) {
      if (s.face === undefined) s.face = s.ang || 0;
      if (s.aimBy) return;                             // being aimed: holds fire
      if (s.cd > 0) { s.ang += clamp(angDiff(s.face, s.ang), -0.8 * dt, 0.8 * dt); return; }
      let best = null, bn = 0;
      const zs = this.zombies, R2 = def.blast * def.blast * 0.6;
      for (let i = 0, seen = 0; i < zs.length && seen < 60; i++) {
        const z = zs[(i * 7 + Math.floor(this.time * 13)) % zs.length];        // sample across the whole horde
        if (z.dead || z.burrowed || z.x < 0 || z.y < 0 || z.x > W || z.y > H) continue;
        if (Math.hypot(z.x - s.x, z.y - s.y) < def.minRange) continue;
        if (Math.abs(angDiff(Math.atan2(z.y - s.y, z.x - s.x), s.face)) > def.arc) continue;     // outside its arc
        if (this.inSmoke(z.x, z.y)) continue;                                                    // can't see it
        seen++;
        let n = 1;
        this.forNear(z.x, z.y, def.blast * 0.78, (o) => { if (o !== z && (o.x - z.x) ** 2 + (o.y - z.y) ** 2 < R2) n += GD.ZOMBIES[o.type].cost >= 5 ? 3 : 1; });
        if (n > bn) { bn = n; best = z; }
      }
      if (!best) { s.cd = 0.3; return; }
      s.ang = Math.atan2(best.y - s.y, best.x - s.x);
      s.cd = def.cd; s.flash = 0.25;
      const lead = best.stun > 0 ? 0 : best.speed * 0.6;
      let tx = clamp(best.x + Math.cos(best.ang) * lead, 0, W), ty = clamp(best.y + Math.sin(best.ang) * lead, 0, H);
      if (Math.abs(angDiff(Math.atan2(ty - s.y, tx - s.x), s.face)) > def.arc || Math.hypot(tx - s.x, ty - s.y) < def.minRange) { tx = best.x; ty = best.y; }
      const mx = s.x + Math.cos(s.ang) * 22, my = s.y + Math.sin(s.ang) * 22, T = def.flight;
      this.bullets.push({ turret: true, kind: 'shell', x: mx, y: my, px: mx, py: my, vx: (tx - mx) / T, vy: (ty - my) / T,
        life: T, max: T, dmg: def.dmg * Math.max(1, this.hpMul(this.night) / this.hpMul(10)), owner: s.owner, blast: def.blast, big: true, r: 6 });
      this.emit('levTarget', { x: Math.round(tx), y: Math.round(ty), r: def.blast, t: T });
      this.emit('shot', { x: mx, y: my, ang: s.ang, wid: 'leviathan', turret: true });
    }
    // Hellmouth: charges, then sweeps a giant jet of fire across its aimed arc.
    updateHellmouth(s, def, dt) {
      if (s.face === undefined) s.face = s.ang || 0;
      if (s.charge === undefined) s.charge = def.charge;
      if (s.aimBy) return;                                  // being aimed
      const inJet = (z, ang) => {
        const dx = z.x - s.x, dy = z.y - s.y, d = Math.hypot(dx, dy);
        return d < def.reach + z.r && d > 20 && Math.abs(angDiff(Math.atan2(dy, dx), ang)) < def.width + z.r / Math.max(d, 1);
      };
      if (!(s.fire > 0)) {
        s.ang += clamp(angDiff(s.face - def.arc, s.ang), -1.2 * dt, 1.2 * dt);     // rest at the edge it will sweep from
        if (s.charge > 0) { s.charge -= dt; return; }
        // charged: erupt as soon as anything is inside the arc
        let any = false;
        for (const z of this.zombies) {
          if (z.dead || z.burrowed) continue;
          const dx = z.x - s.x, dy = z.y - s.y, d = Math.hypot(dx, dy);
          if (d < def.reach && Math.abs(angDiff(Math.atan2(dy, dx), s.face)) < def.arc) { any = true; break; }
        }
        if (!any) return;
        s.fire = def.sweep; s.ang = s.face - def.arc; s.tick = 0; s.poolT = 0.2;
        this.emit('hellStart', { x: s.x, y: s.y, dur: def.sweep });
        return;
      }
      // erupting: sweep from one edge of the arc to the other
      s.fire -= dt;
      const k = clamp(1 - s.fire / def.sweep, 0, 1);          // across the arc and back again
      s.ang = s.face - def.arc + 2 * def.arc * (k < 0.5 ? k * 2 : 2 - k * 2);
      s.flash = 0.1;
      s.tick -= dt;
      if (s.tick <= 0) {
        s.tick = 0.1;
        // scales with how tough tonight's zombies are, so an eruption always clears small fry and Brutes, every night
        const dmg = def.dmg * this.hpMul(this.night) * this.diff().hp * 0.1;
        for (const z of this.zombies) {
          if (z.dead || z.burrowed || z.leap || !inJet(z, s.ang)) continue;
          this.damageZombie(z, dmg, s.owner, 0, 0, true);
          if (!z.dead && z.burn < def.burn) { z.burn = def.burn; z.burnBy = s.owner; z.burnTurret = true; }
        }
        // the jet lights any tar along it
        for (const t of this.tar) if (!t.fire && inJet({ x: t.x, y: t.y, r: t.r }, s.ang)) this.igniteTar(t, s.owner);
      }
      if ((s.poolT -= dt) <= 0) {                          // burning puddles left along its path
        s.poolT = def.poolEvery || 0.3;
        const d = rand(150, def.reach - 40), px = s.x + Math.cos(s.ang) * d, py = s.y + Math.sin(s.ang) * d;
        if (px > 0 && py > 0 && px < W && py < H) this.ignite(px, py, s.owner);
      }
      if (s.fire <= 0) { s.fire = 0; s.charge = def.charge; this.emit('hellEnd', { x: s.x, y: s.y }); }
    }
    // Phoenix Pyre: charges through the night, then a ring of fire sweeps the whole map from it, burning every zombie it
    // passes, while healing every survivor and mending the camp.
    updatePhoenix(s, def, dt) {
      if (s.charge === undefined) s.charge = def.charge;
      if (s.nova) {                                       // the ring is sweeping out
        const r0 = s.nova.r, r1 = r0 + def.novaSpeed * dt;
        s.nova.r = r1;
        const dmg = def.dmg * this.hpMul(this.night) * this.diff().hp;
        for (const z of this.zombies) {
          if (z.dead || s.nova.hit.has(z.id)) continue;
          const d = Math.hypot(z.x - s.x, z.y - s.y);
          if (d < r1 + z.r) { s.nova.hit.add(z.id); this.damageZombie(z, dmg, s.owner, 0, 0, true); if (!z.dead) { z.burn = Math.max(z.burn, 4); z.burnBy = s.owner; } }
        }
        if (r1 > 2400) s.nova = null;
        return;
      }
      if (this.phase !== 'night') { s.charge = def.charge; return; }
      if (s.charge > 0) { s.charge -= dt; return; }
      if (!this.zombies.some((z) => !z.dead && z.x > 0 && z.y > 0 && z.x < W && z.y < H)) return;   // waits for something to burn
      s.charge = def.charge;
      s.nova = { r: 0, hit: new Set() };
      for (const p of this.players) if (!p.away && !p.down) p.hp = p.maxhp;                 // the rekindling
      for (const o of this.structs) if (!o.dead) o.hp = Math.min(o.maxhp, o.hp + o.maxhp * def.repair);
      if (this.fireHp > 0) this.fireHp = Math.min(this.fireMax, this.fireHp + this.fireMax * def.repair);
      this.emit('nova', { x: s.x, y: s.y, speed: def.novaSpeed });
    }
    // Sunlance: an orbital beam that crawls after the densest crowd it can see and melts what is under it
    updateSunlance(s, def, dt) {
      if (s.bx === undefined) { s.bx = s.x; s.by = s.y; s.onT = def.on; s.offT = 0; }
      const any = this.zombies.some((z) => !z.dead && z.x > 0 && z.y > 0 && z.x < W && z.y < H);
      if (s.offT > 0) { s.offT -= dt; s.beam = false; return; }
      if (!any) { s.beam = false; return; }
      if (!s.beam) { s.beam = true; this.emit('sunOn', { x: s.bx, y: s.by }); }
      s.onT -= dt;
      if (s.onT <= 0) { s.onT = def.on; s.offT = def.off; s.beam = false; return; }
      // lock on to a crowd and follow it: score crowds around every visible zombie (big ones count more), keep the
      // current one unless it is gone or another is clearly bigger, and track the zombie at its centre as it moves
      const R2 = def.beamR * def.beamR * 1.4;
      const crowdAt = (x, y) => { let n = 0; this.forNear(x, y, def.beamR * 1.2, (o) => { if (!o.burrowed && (o.x - x) ** 2 + (o.y - y) ** 2 < R2) n += GD.ZOMBIES[o.type].cost >= 5 ? 4 : 1; }); return n; };
      const visible = (z) => z && !z.dead && !z.burrowed && z.x > 0 && z.y > 0 && z.x < W && z.y < H && !this.inSmoke(z.x, z.y);
      if (!visible(s.goalZ)) { s.goalZ = null; s.scanT = 0; }
      s.scanT = (s.scanT || 0) - dt;
      if (s.scanT <= 0) {
        s.scanT = 1;
        const zs = this.zombies, step = Math.max(1, Math.floor(zs.length / 120));     // up to 120 candidates, spread over the whole horde
        let best = null, bn = 0;
        // a crowd far away is worth less: the beam spends that time travelling over empty ground
        const worth = (z) => crowdAt(z.x, z.y) / (1 + Math.hypot(z.x - s.bx, z.y - s.by) / 700);
        for (let i = 0; i < zs.length; i += step) { const z = zs[i]; if (!visible(z)) continue; const n = worth(z); if (n > bn) { bn = n; best = z; } }
        const cur = s.goalZ ? worth(s.goalZ) : 0;
        if (best && (!s.goalZ || bn > cur * 1.6)) s.goalZ = best;
      }
      if (s.goalZ) {
        const dx = s.goalZ.x - s.bx, dy = s.goalZ.y - s.by, d = Math.hypot(dx, dy);
        if (d > 1) { const st = Math.min(d, def.beamSpeed * dt); s.bx += dx / d * st; s.by += dy / d * st; }
      }
      s.goal = s.goalZ ? { x: s.goalZ.x, y: s.goalZ.y } : null;
      s.ang = Math.atan2(s.by - s.y, s.bx - s.x);
      s.tick = (s.tick || 0) - dt;
      if (s.tick > 0) return;
      s.tick = 0.1;
      const dmg = def.dmg * this.hpMul(this.night) * this.diff().hp * 0.1, R = def.beamR;
      this.forNear(s.bx, s.by, R + 30, (z) => {
        if (z.burrowed || (z.x - s.bx) ** 2 + (z.y - s.by) ** 2 > (R + z.r * 0.5) ** 2) return;
        this.damageZombie(z, dmg, s.owner, 0, 0, true);
        if (!z.dead && z.burn < 1) { z.burn = 1; z.burnBy = s.owner; z.burnTurret = true; }
      });
      for (const t of this.tar) if (!t.fire && (t.x - s.bx) ** 2 + (t.y - s.by) ** 2 < R * R) this.igniteTar(t, s.owner);
    }
    ignite(x, y, owner) {
      const def = GD.STRUCTS.napalm;
      this.pools.push({ x, y, r: def.pool, t: def.poolT, owner, tick: 0 });
      this.emit('napalm', { x, y, r: def.pool, dur: def.poolT });
    }
    // Napalm pools keep everything standing in them burning (refreshed, never stacked).
    updatePools(dt) {
      const ps = this.pools;
      let k = 0;
      for (let i = 0; i < ps.length; i++) {
        const p = ps[i];
        p.t -= dt; p.tick -= dt;
        if (p.t <= 0) continue;
        if (p.tick <= 0) {
          p.tick = 0.15;
          this.forNear(p.x, p.y, p.r + 30, (z) => {
            if (z.burrowed || z.leap || z.fly) return;
            const rr = p.r + z.r * 0.5;
            if ((z.x - p.x) ** 2 + (z.y - p.y) ** 2 > rr * rr) return;
            if (z.burn < 1.5) { z.burn = 1.5; z.burnBy = p.owner; z.burnTurret = true; }
          });
        }
        ps[k++] = p;
      }
      ps.length = k;
    }

    // ---- Smokebelcher smoke
    puffSmoke(x, y, r, life) {
      if (this.phase !== 'night' || x < 0 || y < 0 || x > W || y > H) return;
      const c = { id: this.nextId++, x: Math.round(x), y: Math.round(y), r, t: life };
      this.smoke.push(c);
      if (this.smoke.length > 120) this.smoke.shift();
      this.emit('smoke', { id: c.id, x: c.x, y: c.y, r, t: life });
    }
    inSmoke(x, y) {
      for (const c of this.smoke) if ((c.x - x) ** 2 + (c.y - y) ** 2 < c.r * c.r) return true;
      return false;
    }
    // ---- Tarborn tar
    dropTar(x, y, r, life) {
      if (this.phase !== 'night' || x < 0 || y < 0 || x > W || y > H) return;
      for (const t of this.tar) {                     // walking over its own fresh tar just tops it up
        if (!t.fire && (t.x - x) ** 2 + (t.y - y) ** 2 < 14 * 14 && t.r >= r) { t.t = Math.max(t.t, life); return; }
      }
      const t = { id: this.nextId++, x: Math.round(x), y: Math.round(y), r, t: life, fire: 0, by: null };
      this.tar.push(t);
      if (this.tar.length > 160) { const o = this.tar.shift(); this.emit('tarGone', { id: o.id }); }
      this.emit('tar', { id: t.id, x: t.x, y: t.y, r, t: life });
    }
    inTar(x, y) {
      for (const t of this.tar) if ((t.x - x) ** 2 + (t.y - y) ** 2 < t.r * t.r) return true;
      return false;
    }
    igniteTar(t, by) {
      if (t.fire > 0) return;
      t.fire = 4; t.t = 4; t.by = by || null; t.spread = 0.12;       // burns for 4 s, then it is used up
      this.emit('tarFire', { id: t.id, x: t.x, y: t.y, r: t.r });
    }
    igniteTarNear(x, y, rad, by) {
      for (const t of this.tar) if (!t.fire && (t.x - x) ** 2 + (t.y - y) ** 2 < (rad + t.r) ** 2) this.igniteTar(t, by);
    }
    updateTar(dt) {
      const ts = this.tar;
      this.tarTick = (this.tarTick || 0) - dt;
      const tick = this.tarTick <= 0;
      if (tick) this.tarTick = 0.15;
      for (const t of ts) {
        t.t -= dt;
        if (t.fire > 0) {
          t.fire -= dt;
          // fire runs along the trail: each burning patch lights its neighbours a moment later
          if (t.spread > 0 && (t.spread -= dt) <= 0) for (const o of ts) if (!o.fire && (o.x - t.x) ** 2 + (o.y - t.y) ** 2 < (t.r + o.r + 6) ** 2) this.igniteTar(o, t.by);
          if (tick) {
            this.forNear(t.x, t.y, t.r + 30, (z) => {
              if (z.burrowed || z.leap || z.fly) return;
              const rr = t.r + z.r * 0.5;
              if ((z.x - t.x) ** 2 + (z.y - t.y) ** 2 > rr * rr) return;
              if (z.burn < 1.5) { z.burn = 1.5; z.burnBy = t.by; }
            });
          }
        } else if (tick) {
          // what lights it: a burning zombie walking through, a napalm pool, a flame puff
          let lit = null;
          this.forNear(t.x, t.y, t.r + 20, (z) => { if (!lit && z.burn > 0 && (z.x - t.x) ** 2 + (z.y - t.y) ** 2 < (t.r + z.r) ** 2) lit = z.burnBy || 'fire'; });
          if (!lit) for (const p of this.pools) if ((p.x - t.x) ** 2 + (p.y - t.y) ** 2 < (p.r + t.r) ** 2) { lit = p.owner || 'fire'; break; }
          if (!lit) for (const b of this.bullets) if (b.kind === 'flame' && (b.x - t.x) ** 2 + (b.y - t.y) ** 2 < t.r * t.r) { lit = b.owner || 'fire'; break; }
          if (lit) this.igniteTar(t, lit === 'fire' ? null : lit);
        }
      }
      if (ts.some((t) => t.t <= 0)) this.tar = ts.filter((t) => t.t > 0);
    }

    acquire(s, range, dt) {
      s.scanT -= dt;
      if (s.tgt && (s.tgt.dead || s.tgt.burrowed || Math.hypot(s.tgt.x - s.x, s.tgt.y - s.y) > range + s.tgt.r)) s.tgt = null;
      if (s.scanT > 0) return;
      s.scanT = 0.25;
      let best = null, bd = Infinity;
      const zs = this.zombies;
      for (let i = 0; i < zs.length; i++) {
        const z = zs[i];
        if (z.dead || z.burrowed) continue;
        const d = Math.hypot(z.x - s.x, z.y - s.y);
        if (d < range + z.r && d < bd) { bd = d; best = z; }
      }
      // keep current target unless something is clearly closer (stops jitter)
      if (!s.tgt || (best && bd < Math.hypot(s.tgt.x - s.x, s.tgt.y - s.y) - 60)) s.tgt = best;
    }
    // Gun turret: fires its gun at the nearest zombie. Belt-fed: infinite ammo and it never reloads.
    updateGunTurret(s, dt) {
      const w = GD.WEAPONS[s.gun], T = GD.GUN_TURRET;
      if (!w) return;
      if (s.cd > 0) s.cd -= dt;
      s.mag = w.mag; s.reloadT = 0;
      const range = w.range;
      this.acquire(s, range, dt);
      if (!s.tgt) { if (s.cd < 0) s.cd = 0; return; }
      const want = Math.atan2(s.tgt.y - s.y, s.tgt.x - s.x);
      const da = angDiff(want, s.ang);
      s.ang += clamp(da, -8 * dt, 8 * dt);
      if (Math.abs(da) > 0.2) { if (s.cd < 0) s.cd = 0; return; }
      let guard = 0;
      while (s.cd <= 0 && guard++ < 4) {
        const carry = s.cd;
        s.cd = w.cd * T.rate + carry;
        s.flash = 0.06;
        this.shoot(s.x, s.y, s.ang, s.gun, 0, s.owner, T.dmg * (T.mul[s.gun] || 1), false, w.range, true);
      }
      if (s.cd < 0) s.cd = 0;
    }

    // ------------------------------------------------------------ main tick
    update(dt) {
      if (this.phase === 'over') return;
      const act = this.active();
      if ((this.phase === 'day' || this.phase === 'night') && !act.length) return;   // everyone disconnected: freeze
      this.time += dt;
      if (this.dev.money) for (const p of this.players) if (p.money < 99999) p.money = 99999;

      for (const p of this.players) this.updatePlayer(p, dt);

      // no timer: the night only begins once every connected survivor has pressed READY
      if (this.phase === 'day' && act.every((p) => p.ready)) this.startNight();

      const alive = this.alive();
      if (this.phase === 'night') {
        if (!alive.length) { this.gameOver(); return; }
        if (this.queue.length) {
          this.spawnT -= dt;
          let guard = 0;
          while (this.spawnT <= 0 && this.queue.length && this.zombies.length < 250 && guard++ < 6) {
            this.spawnFromQueue();
            this.spawnT += this.spawnGap * rand(0.5, 1.5);
          }
          if (this.spawnT < -1) this.spawnT = -1;
        }
      }

      this.flowT -= dt;
      if (this.zombies.length && (this.flowT <= 0 || (this.flowDirty && this.flowT < 0.2))) this.computeFlow();

      this.rebuildHash();
      const zs = this.zombies;
      // zombies chase survivors, or a Noise Lure if one is closer
      this.aliveNow = alive;
      // Flood Lamps expose zombies standing in their light
      const lamps = this.structs.filter((st) => st.id === 'lamp' && !st.dead);
      for (const z of zs) {
        z.lit = 0;
        if (z.burrowed) continue;
        for (const l of lamps) { if (Math.hypot(z.x - l.x, z.y - l.y) < GD.STRUCTS.lamp.light) { z.lit = 1; break; } }
      }
      const targets = alive.slice();
      for (const st of this.structs) if (st.id === 'lure' && !st.dead) targets.push({ x: st.x, y: st.y, lure: true });
      if (this.phase === 'night' && this.fireHp > 0) targets.push({ x: FIRE.x, y: FIRE.y, fire: true });
      for (let i = 0; i < zs.length; i++) if (!zs[i].dead) this.updateZombie(zs[i], dt, targets);
      this.updateWyrms(dt);

      this.srcTurret = true;              // tesla zaps, mines, arc turrets: all count as turret damage
      for (const s of this.structs) if (!s.dead) this.updateStruct(s, dt);
      this.srcTurret = false;
      if (this.pools.length) this.updatePools(dt);
      if (this.tar.length) this.updateTar(dt);
      if (this.smoke.length) { for (const c of this.smoke) c.t -= this.phase === 'night' ? dt : 99; if (this.smoke.some((c) => c.t <= 0)) this.smoke = this.smoke.filter((c) => c.t > 0); }

      const bs = this.bullets;
      let k = 0;
      for (let i = 0; i < bs.length; i++) {
        this.srcTurret = !!bs[i].turret;
        if (this.updateBullet(bs[i], dt)) bs[k++] = bs[i];
      }
      // explosions during the loop may have appended new bullets past i; keep them
      bs.length = k;
      this.srcTurret = false;

      if (this.zombies.some((z) => z.dead)) this.zombies = this.zombies.filter((z) => !z.dead);
      if (this.structs.some((s) => s.dead)) this.structs = this.structs.filter((s) => !s.dead);

      if (this.phase === 'night' && !this.queue.length && !this.zombies.length) this.endNight();
    }

    remaining() { return this.queue.length + this.zombies.length; }

    // Compact per-player state for the phone UI.
    padState(p) {
      const w = GD.WEAPONS[p.cur], own = p.weapons[p.cur];
      const weapons = {};
      for (const id of p.order) weapons[id] = { lvl: p.weapons[id].lvl, reserve: GD.WEAPONS[id].infinite ? -1 : p.weapons[id].reserve };
      return {
        t: 'st', phase: this.phase, night: this.night,
        left: this.phase === 'night' ? this.remaining() : 0,
        name: p.name, color: p.color, money: Math.floor(p.money), hp: Math.ceil(p.hp), maxhp: p.maxhp,
        down: p.down, ready: p.ready, cur: p.cur, mag: own.mag, magMax: w.mag,
        reserve: w.infinite ? -1 : own.reserve, reloading: p.reloadT > 0,
        weapons, perks: p.perks, undo: p.undo.length, aimLev: !!p.aimLev, unlockAll: !!(this.dev.unlockAll || this.dev.money), dev: this.dev.money || this.dev.startNight > 1, build: p.build, carry: p.carry ? p.carry.id : null, diff: this.difficulty,
        forecast: this.forecast, players: this.active().length, kills: p.kills,
      };
    }
  }

  const API = { Sim, FIRE, FIRE_HP, PR, SIDE_NAMES, angDiff, pushOut };
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
  else root.SIM = API;
})(typeof window !== 'undefined' ? window : globalThis);
