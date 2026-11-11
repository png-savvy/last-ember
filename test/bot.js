// Headless soak test: bots play many nights, exercising every weapon, structure and perk.
// Run: node test/bot.js
const GD = require('../public/js/data.js');
const { Sim, FIRE } = require('../public/js/sim.js');

function assert(c, msg) { if (!c) throw new Error('ASSERT: ' + msg); }

function checkInvariants(sim) {
  for (const p of sim.players) {
    assert(isFinite(p.x) && isFinite(p.y), 'player pos finite');
    assert(p.x >= 0 && p.x <= GD.W && p.y >= 0 && p.y <= GD.H, 'player in bounds');
    assert(isFinite(p.hp) && p.hp <= p.maxhp + 1e-6, 'player hp sane ' + p.hp);
    assert(isFinite(p.money) && p.money >= 0, 'money sane ' + p.money);
    for (const id of p.order) {
      const o = p.weapons[id];
      assert(o.mag >= 0 && o.mag <= GD.WEAPONS[id].mag, 'mag sane ' + id + ' ' + o.mag);
      assert(o.reserve >= 0, 'reserve sane');
    }
  }
  for (const z of sim.zombies) {
    assert(isFinite(z.x) && isFinite(z.y) && isFinite(z.hp), 'zombie finite ' + z.type);
    assert(z.x > -400 && z.x < GD.W + 400 && z.y > -400 && z.y < GD.H + 400, 'zombie near map ' + z.type + ' ' + z.x + ',' + z.y);
  }
  for (const s of sim.structs) assert(sim.grid[s.cy * GD.GW + s.cx] === s, 'grid matches struct');
  for (const p of sim.players) if (p.carry) assert(sim.structs.indexOf(p.carry) < 0, 'carried not on map');
  let n = 0;
  for (const g of sim.grid) if (g) n++;
  assert(n === sim.structs.length, 'grid count ' + n + ' vs ' + sim.structs.length);
}

function run(nPlayers, difficulty, maxNights, cheat) {
  const sim = new Sim(); sim.dev.unlockAll = true;   // these tests use every item; the supply-drop test below checks the unlocks
  sim.difficulty = difficulty;
  for (let i = 0; i < nPlayers; i++) sim.addPlayer('bot' + i, 'Bot' + i);
  assert(sim.startGame(), 'game starts');
  const dt = 1 / 60;
  let ticks = 0, maxZ = 0, worst = 0;
  const seen = new Set();
  const builtKinds = new Set();
  while (sim.phase !== 'over' && sim.night <= maxNights && ticks < 60 * 60 * 90) {
    for (const p of sim.players) {
      if (cheat) { p.money = Math.max(p.money, 6000); if (!p.down) p.hp = p.maxhp; }
      // nearest zombie
      let best = null, bd = 1e9;
      for (const z of sim.zombies) { const d = Math.hypot(z.x - p.x, z.y - p.y); if (d < bd) { bd = d; best = z; } }
      const inp = { mx: 0, my: 0, aim: null, fire: false, assist: true };
      if (best) {
        inp.aim = Math.atan2(best.y - p.y, best.x - p.x);
        inp.fire = bd < 600;
        if (bd < 160) { inp.mx = -Math.cos(inp.aim); inp.my = -Math.sin(inp.aim); }
        else { const a = Math.atan2(FIRE.y - p.y, FIRE.x - p.x); const d = Math.hypot(FIRE.y - p.y, FIRE.x - p.x); if (d > 120) { inp.mx = Math.cos(a); inp.my = Math.sin(a); } }
      } else {
        const a = ticks / 200 + p.x; inp.mx = Math.cos(a); inp.my = Math.sin(a);
      }
      sim.setInput(p.id, inp);
      if (ticks % 45 === 0) {
        // random shopping / building
        const r = Math.random();
        if (r < 0.2) sim.buyWeapon(p.id, GD.WEAPON_ORDER[(Math.random() * GD.WEAPON_ORDER.length) | 0]);
        else if (r < 0.4) sim.buyAmmo(p.id, p.order[(Math.random() * p.order.length) | 0]);
        else if (r < 0.5) sim.upgradeWeapon(p.id, p.order[(Math.random() * p.order.length) | 0]);
        else if (r < 0.6) sim.buyPerk(p.id, GD.PERK_ORDER[(Math.random() * GD.PERK_ORDER.length) | 0]);
        else if (r < 0.65) sim.buyItem(p.id, 'medkit');
        else if (r < 0.92) {
          const all = GD.STRUCT_ORDER.concat(Object.keys(GD.TOOLS));
          const id = all[(Math.random() * all.length) | 0];
          sim.selectBuild(p.id, id);
          if (sim.place(p.id)) builtKinds.add(id);
          if (id === 'move' && p.carry) {          // carry it a few cells, then drop (or cancel)
            p.aim += 1.5;
            if (Math.random() < 0.7 && sim.place(p.id)) builtKinds.add('drop');
          }
          sim.selectBuild(p.id, null);
        } else sim.swap(p.id, Math.random() < 0.5 ? 1 : -1);
        if (sim.phase === 'day') sim.setReady(p.id, true);
      }
    }
    if (ticks === 5000 && nPlayers > 1) sim.removePlayer('bot1');       // disconnect mid-game
    if (ticks === 9000 && nPlayers > 1) sim.addPlayer('bot1', 'Bot1');  // and come back
    const t0 = process.hrtime.bigint();
    sim.update(dt);
    const ms = Number(process.hrtime.bigint() - t0) / 1e6;
    if (ms > worst) worst = ms;
    for (const e of sim.events) seen.add(e.type);
    sim.events.length = 0;
    if (sim.zombies.length > maxZ) maxZ = sim.zombies.length;
    if (ticks % 30 === 0) checkInvariants(sim);
    for (const p of sim.players) JSON.stringify(sim.padState(p));
    ticks++;
  }
  console.log(`${nPlayers}p ${difficulty}${cheat ? ' (cheat)' : ''}: phase=${sim.phase} night=${sim.night} kills=${sim.stats.kills} ` +
    `built=${sim.stats.built} maxZombies=${maxZ} worstTick=${worst.toFixed(2)}ms simMinutes=${(ticks / 3600).toFixed(1)}`);
  return { sim, seen, builtKinds };
}

const a = run(1, 'normal', 30, false);
const b = run(4, 'hard', 30, false);
const c = run(3, 'normal', 16, true);
const d = run(8, 'easy', 12, true);
const seen = new Set([...a.seen, ...b.seen, ...c.seen, ...d.seen]);
const kinds = new Set([...c.builtKinds, ...d.builtKinds]);
console.log('events seen:', [...seen].sort().join(' '));
console.log('built kinds:', [...kinds].sort().join(' '));
assert(c.sim.night > 16 || c.sim.phase === 'over', 'cheat run progressed');
for (const k of GD.STRUCT_ORDER.concat(Object.keys(GD.TOOLS), ['drop'])) assert(kinds.has(k), 'built ' + k);

// ---- focused checks for the newer features
{
  const sim = new Sim(); sim.dev.unlockAll = true;   // these tests use every item; the supply-drop test below checks the unlocks
  sim.addPlayer('a', 'A'); sim.addPlayer('b', 'B');
  sim.dev.startNight = 2;
  sim.startGame();
  const A = sim.getPlayer('a'), B = sim.getPlayer('b');
  // no timer: the night must not start until every survivor is ready
  for (let i = 0; i < 60 * 300; i++) sim.update(1 / 60);
  assert(sim.phase === 'day', 'day waits forever without ready');
  sim.setReady('a', true);
  for (let i = 0; i < 60; i++) sim.update(1 / 60);
  assert(sim.phase === 'day', 'one of two ready is not enough');
  // Move tool: only your own builds, free, keeps hp
  A.money = 10000; B.money = 10000;
  const put = (pl, id, cx, cy) => { pl.build = id; pl.buildAt = { x: cx * 40 + 20, y: cy * 40 + 20 }; return sim.place(pl.id); };
  assert(put(A, 'wood', 10, 5), 'A builds wood');
  assert(put(B, 'steel', 12, 5), 'B builds steel');
  const wood = sim.structAt(10, 5);
  wood.hp = 100;
  const m0 = A.money;
  assert(!put(A, 'sell', 12, 5) && sim.structAt(12, 5), "can't sell someone else's wall");
  A.build = 'move'; A.buildAt = { x: 10 * 40 + 20, y: 5 * 40 + 20 }; assert(sim.place('a'), 'pick up');
  assert(A.carry === wood && !sim.structAt(10, 5) && sim.structs.indexOf(wood) < 0, 'carried is off the map');
  A.buildAt = { x: 12 * 40 + 20, y: 5 * 40 + 20 }; assert(!sim.place('a'), "can't drop on occupied cell");
  A.buildAt = { x: 20 * 40 + 20, y: 8 * 40 + 20 }; assert(sim.place('a'), 'drop');
  assert(sim.structAt(20, 8) === wood && wood.hp === 100 && A.money === m0 && !A.carry, 'moved free, hp kept');
  A.buildAt = { x: 20 * 40 + 20, y: 8 * 40 + 20 }; sim.place('a');
  sim.selectBuild('a', null);
  assert(!A.carry && sim.structAt(20, 8) === wood, 'cancel puts it back');
  // Gun turrets: one per gun, infinite ammo, no need to own the gun
  sim.buyWeapon('a', 'smg');
  assert(A.cur === 'smg', 'holding smg');
  A.money = 5000;
  assert(put(A, 'gt_smg', 24, 9), 'SMG turret placed');
  const mount = sim.structAt(24, 9);
  assert(mount.gun === 'smg' && mount.mag === GD.WEAPONS.smg.mag, 'turret carries its gun, full magazine');
  assert(GD.STRUCT_ORDER.filter((k) => GD.STRUCTS[k].gun).length === GD.WEAPON_ORDER.length && !GD.STRUCTS.mount && !GD.TOOLS.arm, 'a turret for every gun, mount gone');
  for (let i = 1; i < GD.GT_IDS.length; i++) assert(GD.STRUCTS[GD.GT_IDS[i]].cost >= 250, 'turret priced');
  // survivors walk through turrets, zombies do not
  A.x = mount.x - 30; A.y = mount.y; sim.setInput('a', { mx: 1, my: 0, aim: 0, fire: false });
  for (let i = 0; i < 20; i++) sim.update(1 / 60);
  assert(A.x > mount.x - 5, 'walked through own mount: ' + A.x + ' vs ' + mount.x);
  sim.setInput('a', { mx: 0, my: 0, aim: 0, fire: false });
  const zt = sim.spawnZombie('walker', mount.x - 40, mount.y);
  for (let i = 0; i < 30; i++) { zt.x += 3; sim.updateZombie(zt, 1 / 60, []); }
  assert(zt.x < mount.x - 20 + 1, 'zombie blocked by mount: ' + zt.x);
  zt.dead = true; sim.zombies = sim.zombies.filter((z) => !z.dead);
  B.x = 200; B.y = 200; A.x = 300; A.y = 900;
  sim.setReady('b', true);
  for (let i = 0; i < 3; i++) sim.update(1 / 60);
  assert(sim.phase === 'night', 'all ready -> night');
  const r0 = A.weapons.smg.reserve;
  let fired = 0, reloaded = false;
  sim.queue.length = 0; sim.zombies.length = 0;      // just our target dummies, nothing else this night
  for (let k = 0; k < 6; k++) {
    const zz = sim.spawnZombie('walker', mount.x + 200, mount.y); zz.hp = zz.maxhp = 1e6;
    for (let i = 0; i < 120; i++) {
      const n0 = sim.events.length;
      sim.update(1 / 60);
      for (const e of sim.events.slice(n0)) if (e.type === 'shot' && e.turret && e.x > mount.x - 40 && e.x < mount.x + 40 && e.y > mount.y - 40 && e.y < mount.y + 40) fired++;
      if (mount.reloadT > 0) reloaded = true;
    }
    zz.dead = true;
  }
  assert(fired > GD.WEAPONS.smg.mag * 2 && !reloaded, 'turret fired well past a magazine without ever reloading: ' + fired);
  assert(A.weapons.smg.reserve === r0, 'turret never touches the owner ammo');
  sim.zombies = sim.zombies.filter((z) => !z.dead);
  // Napalm Lobber: lobs at the crowd, the pool keeps them burning, damage is credited to the builder
  {
    assert(put(A, 'napalm', 24, 15), 'Napalm Lobber placed');
    const lob = sim.structAt(24, 15), crowd = [];
    for (let k = 0; k < 5; k++) { const z = sim.spawnZombie('walker', lob.x + 260 + k * 8, lob.y + (k % 2) * 10); z.hp = z.maxhp = 1e6; z.speed = 0; crowd.push(z); }
    const lone = sim.spawnZombie('walker', lob.x - 150, lob.y); lone.hp = lone.maxhp = 1e6; lone.speed = 0;
    let first = null;
    for (let i = 0; i < 60 * 3; i++) { sim.update(1 / 60); if (!first && sim.pools.length) first = Object.assign({}, sim.pools[0]); }
    const pooled = !!first;
    assert(pooled && crowd.every((z) => z.hp < z.maxhp) && crowd.every((z) => z.burnBy === 'a'), 'napalm pool burned the whole crowd for its builder');
    assert(first && Math.hypot(first.x - crowd[2].x, first.y - crowd[2].y) < 60, 'lobber aims at the crowd, not the nearest lone zombie');
    const dealt = crowd[0].maxhp - crowd[0].hp;
    assert(dealt > GD.BURN.dps * 1.5 && dealt < GD.BURN.dps * 3.2, 'burn does not stack: ~' + GD.BURN.dps + '/s, got ' + dealt.toFixed(0) + ' over ~2s');
    for (const z of crowd.concat(lone)) z.dead = true;
    sim.zombies = sim.zombies.filter((z) => !z.dead); sim.pools.length = 0;
    sim.removeStruct(lob, true); sim.structs = sim.structs.filter((x) => !x.dead);
  }
  // Bunker Wall: the toughest wall, and no Repair tool any more (everything heals at dawn)
  assert(GD.STRUCTS.bunker.hp >= 3 * GD.STRUCTS.steel.hp && GD.STRUCTS.bunker.cost / GD.STRUCTS.bunker.hp > GD.STRUCTS.steel.cost / GD.STRUCTS.steel.hp, 'bunker: 3x steel, costs more per hp');
  assert(put(A, 'bunker', 24, 17) && sim.structAt(24, 17).maxhp >= 3000, 'bunker built');
  assert(!GD.TOOLS.repair && !sim.selectBuild('a', 'repair'), 'repair tool removed');
  // dawn heals everything
  wood.hp = 5; mount.hp = 10;
  sim.zombies.length = 0; sim.queue.length = 0;
  sim.update(1 / 60);
  assert(sim.phase === 'day' && wood.hp === wood.maxhp && mount.hp === mount.maxhp, 'structures healed at dawn');
  // going down while carrying drops the build back
  A.build = 'move'; A.buildAt = { x: wood.x, y: wood.y }; sim.place('a');
  assert(A.carry === wood, 'carrying again');
  sim.phase = 'night'; sim.hurt(A, 9999); sim.phase = 'day';
  assert(!A.carry && sim.structs.indexOf(wood) >= 0, 'carry dropped on down');
  for (let n = 1; n <= 30; n++) { sim.night = n; sim.makeForecast(); sim.buildQueue(); assert(sim.queue.every((t) => t !== 'spitter') && sim.forecast.types.every((t) => GD.ZOMBIES[t]), 'no spitters'); }
  console.log('feature checks OK');
}

// ---- phone game view: snapshot -> JSON -> mirror round trip, plus quick grab
{
  const NV = require('../public/js/netview.js');
  const sim = new Sim(); sim.dev.unlockAll = true;   // these tests use every item; the supply-drop test below checks the unlocks
  sim.addPlayer('aaaaaa', 'A'); sim.addPlayer('bbbbbb', 'B');
  sim.dev.startNight = 2;
  sim.startGame();
  const A = sim.getPlayer('aaaaaa'); A.money = 20000;
  sim.buyWeapon('aaaaaa', 'flamer');
  const put = (id, cx, cy) => { A.build = id; sim.placeAt('aaaaaa', cx * 40 + 20, cy * 40 + 20); };
  put('wood', 20, 8); put('gt_pistol', 22, 8); put('turret', 26, 8); put('tesla', 28, 12); put('wire', 20, 12);
  assert(sim.structs.length === 5, 'placeAt built 5');
  // tapping your own build with a buildable selected picks it up; next tap drops it
  A.build = 'wood'; sim.placeAt('aaaaaa', 20 * 40 + 20, 8 * 40 + 20);
  assert(A.carry && A.carry.id === 'wood', 'smart pick-up');
  sim.placeAt('aaaaaa', 18 * 40 + 20, 6 * 40 + 20);
  assert(!A.carry && sim.structAt(18, 6) && A.build === 'wood', 'smart drop keeps build mode');
  sim.selectBuild('aaaaaa', null);
  assert(sim.grab('aaaaaa', 18 * 40 + 20, 6 * 40 + 20) && A.carry, 'grab without menu');
  sim.placeAt('aaaaaa', 20 * 40 + 20, 8 * 40 + 20);
  assert(!A.carry && A.build === null, 'quick grab leaves build mode after drop');
  sim.setReady('aaaaaa', true); sim.setReady('bbbbbb', true);
  sim.night = 6; sim.makeForecast();
  const m = new NV.Mirror('aaaaaa');
  let sig = '', t = 0, evTypes = new Set();
  for (let i = 0; i < 60 * 40 && sim.phase !== 'over'; i++) {
    for (const p of sim.players) { p.hp = p.maxhp; sim.setInput(p.id, { mx: Math.sin(i / 50), my: Math.cos(i / 70), aim: i / 30, fire: true, assist: true }); }
    sim.update(1 / 60); t += 1 / 60;
    if (i % 3 === 0) {
      const snap = NV.encode(sim, sim.events, i);
      const s2 = NV.structSig(sim);
      if (s2 !== sig) { snap.S = NV.encodeStructs(sim); sig = s2; }
      const evs = m.apply(JSON.parse(JSON.stringify(snap)), t);
      for (const e of evs) evTypes.add(e.type);
      sim.events.length = 0;
      m.step(1 / 60, t + 0.02, { mx: 0.5, my: 0, aim: null, speed: 190, frozen: false });
      assert(m.zombies.length === sim.zombies.filter((z) => !z.dead).length, 'mirror zombie count');
      assert(m.structs.length === sim.structs.length, 'mirror struct count ' + m.structs.length + ' vs ' + sim.structs.length);
      assert(m.bullets.length === sim.bullets.length && m.players.length === 2, 'mirror bullets/players');
      const me = m.self();
      assert(me && isFinite(me.x) && isFinite(me.y) && Math.hypot(me.x - A.x, me.y - A.y) < 130, 'mirror self near truth');
      for (const z of m.zombies) assert(isFinite(z.x) && GD.ZOMBIES[z.type], 'mirror zombie sane');
      for (const s of m.structs) assert(m.structAt(s.cx, s.cy) === s, 'mirror grid');
    }
  }
  assert(evTypes.has('shot') && evTypes.has('nightStart'), 'events forwarded: ' + [...evTypes]);
  console.log('game-view mirror OK');
}

// ---- undo, line placement, select actions, dev mode
{
  const sim = new Sim(); sim.dev.unlockAll = true;   // these tests use every item; the supply-drop test below checks the unlocks
  sim.addPlayer('aaaaaa', 'A'); sim.addPlayer('bbbbbb', 'B');
  sim.dev.startNight = 7;
  sim.startGame();
  assert(sim.night === 7 && sim.forecast.night === 7, 'dev start night');
  const A = sim.getPlayer('aaaaaa');
  assert(A.money > 1500, 'catch-up cash for a later start: ' + A.money);
  A.money = 1000;
  const cells = [[10, 4], [11, 4], [12, 4], [13, 4], [24, 13]];
  assert(sim.placeMany('aaaaaa', 'wood', cells) === 4, 'line of 4 (campfire cell skipped)');
  assert(A.money === 1000 - 4 * 30, 'paid for 4');
  assert(sim.undo('aaaaaa') && !sim.structAt(13, 4) && A.money === 1000 - 3 * 30, 'undo refunds the last wall');
  // move then undo puts it back
  sim.grab('aaaaaa', 12 * 40 + 20, 4 * 40 + 20);
  sim.placeAt('aaaaaa', 20 * 40 + 20, 20 * 40 + 20);
  assert(sim.structAt(20, 20) && !sim.structAt(12, 4), 'moved');
  assert(sim.undo('aaaaaa') && sim.structAt(12, 4) && !sim.structAt(20, 20), 'undo move');
  // damaged builds refund only what is left
  const w = sim.structAt(11, 4); w.hp = w.maxhp / 2;
  const m0 = A.money;
  assert(sim.undo('aaaaaa') && A.money === m0 + 30, 'undo skips the moved entry and removes wall 12,4 at full value');
  assert(sim.undo('aaaaaa') && A.money === m0 + 30 + 15, 'half-damaged wall refunds half');
  // select actions
  A.money = 5000; sim.buyWeapon('aaaaaa', 'rifle');
  A.build = 'gt_rifle'; sim.placeAt('aaaaaa', 30 * 40 + 20, 8 * 40 + 20); A.build = null;
  assert(sim.structAt(30, 8).gun === 'rifle', 'rifle turret built');
  assert(!sim.toolAt('bbbbbb', 'sell', 30, 8), "can't sell someone else's");
  const m1 = A.money;
  assert(sim.toolAt('aaaaaa', 'sell', 30, 8) && !sim.structAt(30, 8) && A.money > m1, 'sell from popup');
  // undo is cleared when the night starts
  sim.placeMany('aaaaaa', 'wood', [[5, 5]]);
  sim.setReady('aaaaaa', true); sim.setReady('bbbbbb', true); sim.update(1 / 60);
  assert(sim.phase === 'night' && !sim.undo('aaaaaa') && sim.structAt(5, 5), 'no undo across phases');
  // infinite funds
  sim.dev.money = true; A.money = 3; sim.update(1 / 60);
  assert(A.money >= 99999, 'infinite funds');
  console.log('undo / dev checks OK');
}

// ---- new enemies actually do their thing
{
  const mk = () => {
    const sim = new Sim(); sim.dev.unlockAll = true;   // these tests use every item; the supply-drop test below checks the unlocks
    sim.addPlayer('aaaaaa', 'A'); sim.startGame();
    sim.setReady('aaaaaa', true); sim.update(1 / 60);
    sim.queue.length = 0; sim.zombies.length = 0;
    const A = sim.getPlayer('aaaaaa'); A.money = 1e6;
    return { sim, A };
  };
  const run = (sim, secs, fn) => { for (let i = 0; i < secs * 60; i++) { sim.getPlayer('aaaaaa').hp = 1e9; sim.update(1 / 60); if (fn && fn()) return true; } return false; };
  const wall = (sim, id, cx, cy) => { const A = sim.getPlayer('aaaaaa'); A.build = id; sim.placeAt('aaaaaa', cx * 40 + 20, cy * 40 + 20); A.build = null; return sim.structAt(cx, cy); };
  // Leaper vaults a single wall line
  { const { sim, A } = mk(); A.x = 20 * 40 + 20; A.y = 13 * 40 + 20;
    for (let y = 8; y <= 18; y++) wall(sim, 'steel', 15, y);
    const z = sim.spawnZombie('leaper', 8 * 40, 13 * 40 + 20); z.leapCd = 0;
    assert(run(sim, 8, () => z.x > 16 * 40), 'leaper got over the wall'); }
  // Tarborn: leaves a tar trail that slows survivors; fire runs along it and burns zombies in it; bursts into a puddle
  { const { sim, A } = mk(); A.x = 44 * 40; A.y = 3 * 40;
    const z = sim.spawnZombie('tarborn', 6 * 40, 3 * 40); z.hp = z.maxhp = 1e6;
    run(sim, 6);
    assert(sim.tar.length >= 6, 'tarborn leaves a trail: ' + sim.tar.length + ' patches');
    const t0 = sim.tar[Math.floor(sim.tar.length / 2)];
    const speedAt = (x, y) => { A.x = x; A.y = y; const x0 = A.x; for (let i = 0; i < 15; i++) { sim.setInput('aaaaaa', { mx: 0, my: 1 }); sim.update(1 / 60); } return Math.abs(A.y - y) + Math.abs(A.x - x0); };
    const slow = speedAt(t0.x, t0.y - 3), fast = speedAt(44 * 40, 20 * 40);
    assert(slow < fast * 0.7, 'tar slows survivors: ' + slow.toFixed(1) + ' vs ' + fast.toFixed(1));
    A.x = 44 * 40; A.y = 24 * 40;
    const spot = sim.tar[Math.max(0, sim.tar.length - 6)];            // well back along the trail, away from the Tarborn's shoves
    const w = sim.spawnZombie('walker', spot.x, spot.y); w.hp = w.maxhp = 1e6; w.speed = 0;
    sim.igniteTar(sim.tar[0], null);
    run(sim, 2.5);
    assert(sim.tar.filter((t) => t.fire > 0).length >= 4, 'fire runs along the tar trail');
    assert(w.burn > 0, 'a zombie standing in the trail catches fire');
    z.hp = 1; sim.killZombie(z);
    assert(sim.tar.some((t) => t.r >= 50), 'tarborn bursts into a big puddle'); }
  // Stuns: small zombies can be held frozen; big ones resist and shrug it off, so lightning can't hold them forever
  { const { sim } = mk();
    const held = (type) => { const z = sim.spawnZombie(type, 300, 300); z.hp = z.maxhp = 1e9; let f = 0;
      for (let i = 0; i < 600; i++) { if (i % 20 === 0) sim.stunZombie(z, 0.55); z.x = 300; z.y = 300; sim.updateZombie(z, 1 / 60, [{ x: 900, y: 300 }]); if (z.stun > 0) f++; }
      z.dead = true; return f / 600; };
    const w = held('walker'), b = held('brute'), j = held('juggernaut');
    assert(w > 0.95, 'a Shambler can be held frozen: ' + w.toFixed(2));
    assert(b < 0.6 && b > 0.15, 'a Brute resists: frozen ' + b.toFixed(2));
    assert(j < 0.25, 'a Juggernaut only flinches: frozen ' + j.toFixed(2)); }
  // a zombie knocked off the map edge comes back in reach, and a Regenerating champion cannot out-heal steady fire
  { const { sim } = mk();
    const z = sim.spawnZombie('gravecaller', 1800, 1000); z.hp = z.maxhp = 1e9; z.entered = true;
    z.x = 2030; z.y = 1110; z.kvx = 400;
    sim.updateZombie(z, 1 / 60, [{ x: 900, y: 500 }]);
    assert(z.x <= 1920 && z.y <= 1080, 'zombie pushed past the map edge is pulled back on: ' + Math.round(z.x) + ',' + Math.round(z.y));
    const old = sim.spawnZombie('walker', 2050, 500); old.age = 13; sim.updateZombie(old, 1 / 60, [{ x: 900, y: 500 }]);
    assert(old.x <= 1920, 'a zombie that never came in is brought in after a while');
    z.dead = true; old.dead = true; sim.zombies = [];
    const c = sim.spawnZombie('walker', 600, 500); c.regen = 0.04; c.hp = c.maxhp * 0.5; const h = c.hp;
    sim.damageZombie(c, 1, null, 0, 0); for (let i = 0; i < 60; i++) sim.updateZombie(c, 1 / 60, [{ x: 900, y: 500 }]);
    assert(c.hp <= h, 'no regeneration within 1.5 s of being hit'); c.dead = true; sim.zombies = []; }
  // Sunlance: locks on to the biggest crowd and follows it as it moves, instead of wandering
  { const { sim, A } = mk(); A.x = 44 * 40; A.y = 24 * 40;
    A.build = 'sunlance'; sim.placeAt('aaaaaa', 5 * 40 + 20, 5 * 40 + 20); A.build = null;
    const L = sim.structs.find((s) => s.id === 'sunlance');
    const big = []; for (let i = 0; i < 12; i++) { const z = sim.spawnZombie('walker', 30 * 40 + (i % 4) * 25, 18 * 40 + Math.floor(i / 4) * 25); z.hp = z.maxhp = 1e9; z.speed = 40; big.push(z); }
    for (let i = 0; i < 2; i++) { const z = sim.spawnZombie('walker', 8 * 40 + i * 25, 20 * 40); z.hp = z.maxhp = 1e9; z.speed = 0; }
    let on = 0, n = 0;
    for (let i = 0; i < 60 * 12; i++) { A.hp = 1e9; sim.update(1 / 60); if (i > 60 * 6 && L.beam) { n++; if (big.some((z) => Math.hypot(z.x - L.bx, z.y - L.by) < 110)) on++; } }
    assert(n > 0 && on / n > 0.8, 'Sunlance stays on the big moving crowd: ' + Math.round(100 * on / Math.max(1, n)) + '% of the time'); }
  // Supply drops: a small kit at the start, the next tier after every 5th night, with a crate at that dawn
  { const sim = new Sim(); sim.addPlayer('aaaaaa', 'A'); sim.startGame();
    const A = sim.getPlayer('aaaaaa'); A.money = 1e6;
    assert(!sim.buyWeapon('aaaaaa', 'rifle') && !sim.selectBuild('aaaaaa', 'bunker') && !sim.buyPerk('aaaaaa', 'deadeye'), 'night 1: later gear is locked');
    assert(sim.buyWeapon('aaaaaa', 'smg') && sim.selectBuild('aaaaaa', 'wood') && sim.buyPerk('aaaaaa', 'vitality'), 'night 1: the starting kit can be bought');
    let drops = [];
    const em = sim.emit.bind(sim); sim.emit = (t, e) => { if (t === 'supply') drops.push(e); return em(t, e); };
    for (let n = 1; n <= 10; n++) { sim.phase = 'night'; sim.queue = []; sim.zombies = []; sim.endNight(); }
    assert(drops.length === 2 && drops[0].after === 5 && drops[1].after === 10, 'supply crates after nights 5 and 10: ' + JSON.stringify(drops.map((d) => d.after)));
    assert(sim.buyWeapon('aaaaaa', 'rifle') && sim.buyWeapon('aaaaaa', 'flamer') && sim.selectBuild('aaaaaa', 'bunker') && !sim.selectBuild('aaaaaa', 'trail'), 'night 11: tiers 5 and 10 are open, 15 is not');
    const n = sim.placeMany('aaaaaa', 'sunlance', [[5, 5]]); assert(n === 0, 'locked builds cannot be placed by line-drawing either'); }
  // Gorewyrm: bigger and tougher than the Bonewyrm, and the pieces you cut off spill Crawlers
  { const { sim } = mk(); sim.night = 30;
    const g = sim.spawnZombie('gorewyrm', 24 * 40, 6 * 40); sim.growWyrm(g, 'N');
    const b = sim.spawnZombie('wyrm', 10 * 40, 6 * 40); sim.growWyrm(b, 'N');
    const total = (h) => h.maxhp + h.body.reduce((a, id) => a + sim.zombies.find((z) => z.id === id).maxhp, 0);
    assert(g.body.length === 18 && total(g) > total(b) * 3 && g.speed < b.speed, 'Gorewyrm: 18 segments, over 3x the health, slower');
    const crawl0 = sim.zombies.filter((z) => z.type === 'crawler').length;
    sim.damageZombie(sim.zombies.find((z) => z.id === g.body[10]), 1e12, 'aaaaaa', 0, 0);
    assert(g.body.length === 10 && sim.zombies.filter((z) => z.type === 'crawler').length - crawl0 === 7, 'cutting it spills a Crawler per piece lost'); }
  // Splitter splits
  { const { sim } = mk(); const z = sim.spawnZombie('splitter', 300, 300); sim.killZombie(z);
    assert(sim.zombies.filter((q) => q.type === 'splitling').length === 3, 'splitter -> 3 splitlings'); }
  // Screamer enrages neighbours
  { const { sim, A } = mk(); A.x = 600; A.y = 540; const sc = sim.spawnZombie('screamer', 400, 540); const w = sim.spawnZombie('walker', 420, 600); sc.screamT = 0;
    assert(run(sim, 1, () => w.rage > 0), 'screamer enraged a walker'); }
  // Juggernaut charge smashes a barricade
  { const { sim, A } = mk(); A.x = 30 * 40; A.y = 13 * 40 + 20; const b = wall(sim, 'wood', 21, 13);
    const j = sim.spawnZombie('juggernaut', 17 * 40, 13 * 40 + 20); j.chargeCd = 0;
    assert(run(sim, 4, () => b.dead), 'juggernaut bulldozed the barricade'); }
  // Broodmother births crawlers
  { const { sim, A } = mk(); A.x = 1500; A.y = 540; const bm = sim.spawnZombie('broodmother', 400, 540); bm.broodT = 0;
    assert(run(sim, 1, () => sim.zombies.some((q) => q.type === 'crawler')), 'broodmother birthed crawlers'); }
  // Crawler ignores razor wire, walker does not
  { const { sim, A } = mk(); A.x = 30 * 40; A.y = 13 * 40 + 20; for (let x = 12; x <= 15; x++) for (let y = 1; y <= 25; y++) if (!(x === 24 && y === 13)) wall(sim, 'wire', x, y);
    const c = sim.spawnZombie('crawler', 11 * 40, 13 * 40 + 20), w = sim.spawnZombie('walker', 11 * 40, 13 * 40 + 20 + 1);
    run(sim, 3); assert(c.hp === c.maxhp && w.hp < w.maxhp, 'crawler unharmed by wire: ' + c.hp + '/' + c.maxhp + ' walker ' + w.hp + '/' + w.maxhp); }
  // Ironhide armour: pistol barely scratches, launcher does not care
  { const { sim } = mk(); const ih = sim.spawnZombie('ironhide', 300, 300); const h0 = ih.hp;
    sim.damageZombie(ih, 15, null, 0, 0); const pistolHit = h0 - ih.hp;
    sim.damageZombie(ih, 150, null, 0, 0); const bigHit = h0 - pistolHit - ih.hp;
    assert(pistolHit <= 6.1 && bigHit > 140, 'armour: pistol ' + pistolHit + ', launcher ' + bigHit); }
  // Noise Lure pulls a zombie away from the survivor
  { const { sim, A } = mk(); A.x = 40 * 40; A.y = 20 * 40; const lure = wall(sim, 'lure', 8, 8);
    const z = sim.spawnZombie('walker', 14 * 40, 12 * 40);
    run(sim, 6); assert(Math.hypot(z.x - lure.x, z.y - lure.y) < 60 && lure.hp < lure.maxhp, 'walker went for the lure'); }
  // Dawn = full health, even if not downed
  { const { sim, A } = mk(); sim.queue.push('walker'); sim.update(1 / 60); assert(sim.phase === 'night', 'still night'); A.hp = 7; sim.queue.length = 0; sim.zombies.length = 0; sim.update(1 / 60);
    assert(sim.phase === 'day' && A.hp === A.maxhp, 'full heal at dawn'); }
  // difficulty curve keeps climbing
  const sim = new Sim(); sim.dev.unlockAll = true;   // these tests use every item; the supply-drop test below checks the unlocks sim.addPlayer('aaaaaa', 'A'); sim.addPlayer('bbbbbb', 'B'); sim.startGame();
  let prev = 0; const rows = [];
  for (const n of [1, 3, 5, 7, 9, 11, 13, 15, 20, 25]) {
    let hp = 0, bossHp = 0;
    for (let k = 0; k < 4; k++) {           // average a few random waves; bosses counted separately
      sim.night = n; sim.makeForecast(); sim.phase = 'night'; sim.buildQueue();
      for (const t of sim.queue) { const v = GD.ZOMBIES[t].hp * sim.hpMul(n) / 4; if (t === 'boss') bossHp += v * 1.4 * Math.sqrt(n / 5); else hp += v; }
    }
    assert(hp > prev, 'horde threat rises every step at night ' + n); prev = hp;
    hp += bossHp;
    rows.push('n' + n + ': ' + sim.queue.length + ' zombies, ' + Math.round(hp / 1000) + 'k hp' + (sim.isBloodMoon(n) ? ' (blood moon)' : '') + ', new: ' + (sim.forecast.fresh.join('+') || '-'));
  }
  console.log('difficulty (2 players, normal):\n  ' + rows.join('\n  '));
  console.log('enemy behaviour checks OK');
}

// ---- quick start, ammo, crawlers, players joining / leaving mid-night
{
  const sim = new Sim(); sim.dev.unlockAll = true;   // these tests use every item; the supply-drop test below checks the unlocks
  sim.addPlayer('aaaaaa', 'A'); sim.addPlayer('bbbbbb', 'B');
  sim.startGame();
  assert(sim.phase === 'night' && sim.night === 1 && sim.queue.length > 0, 'night 1 starts right away');
  const A = sim.getPlayer('aaaaaa');
  assert(A.money === GD.START_MONEY, 'start money ' + A.money);
  A.money = 5000; sim.buyWeapon('aaaaaa', 'smg');
  assert(A.weapons.smg.reserve === GD.WEAPONS.smg.pack * 3, 'new gun comes with 3 packs');
  assert(GD.ZOMBIES.crawler.hp < 45 && GD.ZOMBIES.crawler.speed < 92, 'crawlers weaker and slower');
  // a third player joins mid-night: the rest of the wave grows by the per-player share
  const q0 = sim.queue.length;
  A.earned = 1000; sim.getPlayer('bbbbbb').earned = 600;
  const C = sim.addPlayer('cccccc', 'C');
  assert(C.money === GD.START_MONEY + Math.round(800 * 0.7), 'late joiner catch-up cash ' + C.money);
  assert(sim.queue.length > q0, 'wave grew when a player joined: ' + q0 + ' -> ' + sim.queue.length);
  const q1 = sim.queue.length;
  sim.removePlayer('cccccc');
  assert(sim.queue.length < q1, 'wave shrank when a player left: ' + q1 + ' -> ' + sim.queue.length);
  const q2 = sim.queue.length;
  sim.addPlayer('cccccc', 'C');
  assert(sim.queue.length > q2 && sim.getPlayer('cccccc').money === C.money, 'rejoining keeps their stuff and grows the wave again');
  console.log('join / leave scaling OK  (wave ' + q0 + ' -> +join ' + q1 + ' -> -leave ' + q2 + ' -> +rejoin ' + sim.queue.length + ')');
}

// ---- Abomination: spares walls, shrugs off turrets, heals when left alone, hurls survivors
{
  const sim = new Sim(); sim.dev.unlockAll = true;   // these tests use every item; the supply-drop test below checks the unlocks
  sim.addPlayer('aaaaaa', 'A');
  sim.dev.startNight = 5; sim.dev.money = true; sim.startGame();
  const A = sim.getPlayer('aaaaaa');
  sim.placeMany('aaaaaa', 'wood', [[30, 10], [31, 10], [30, 11]]);
  const boss = sim.spawnZombie('boss', 30 * 40 + 20, 12 * 40 + 20);
  A.x = boss.x + 60; A.y = boss.y; boss.slamT = 0;
  sim.setReady('aaaaaa', true); sim.update(1 / 60);
  sim.queue.length = 0; sim.zombies = [boss];
  for (let i = 0; i < 3; i++) { A.hp = A.maxhp; sim.update(1 / 60); }
  assert(sim.structAt(30, 11) && sim.structAt(30, 10), 'slam no longer flattens barricades');
  // turret damage is halved, survivor damage is not
  const h0 = boss.hp; sim.srcTurret = true; sim.damageZombie(boss, 100, 'aaaaaa', 0, 0); sim.srcTurret = false;
  const h1 = boss.hp; sim.damageZombie(boss, 100, 'aaaaaa', 0, 0);
  assert(Math.abs(h0 - h1 - 50) < 1 && Math.abs(h1 - boss.hp - 100) < 1, 'hide: turrets half, guns full');
  // a turret bullet counts as turret damage
  sim.bullets.push({ turret: true, kind: 'bullet', x: boss.x - 60, y: boss.y, px: boss.x - 70, py: boss.y, vx: 1000, vy: 0, life: 1, max: 1, dmg: 40, owner: 'aaaaaa', pierce: 0, knock: 0, blast: 0, hit: null, r: 2, wid: 'turret' });
  const h2 = boss.hp; for (let i = 0; i < 6; i++) { A.hp = A.maxhp; sim.update(1 / 60); }
  assert(h2 - boss.hp > 15 && h2 - boss.hp < 25.5, 'turret bullet does half: ' + (h2 - boss.hp));
  // heals after 4 s untouched
  boss.hp = boss.maxhp * 0.5; boss.hurtAt = sim.time;
  A.x = 200; A.y = 200; boss.x = 1700; boss.y = 900;
  for (let i = 0; i < 60 * 6; i++) { A.hp = A.maxhp; boss.x = 1700; boss.y = 900; sim.update(1 / 60); }
  assert(boss.hp > boss.maxhp * 0.5 + 1, 'Abomination regenerates when left alone');
  console.log('abomination OK');
}

// ---- Bonewyrm: a body that follows its head, breaks off into carcasses, and the horde must cross them
{
  const sim = new Sim(); sim.dev.unlockAll = true;   // these tests use every item; the supply-drop test below checks the unlocks
  sim.addPlayer('aaaaaa', 'A');
  sim.dev.startNight = 12; sim.dev.money = true; sim.startGame();
  const A = sim.getPlayer('aaaaaa');
  // rare: roughly 1 night in 5 from night 10, never two nights running, never in the scouting report
  let nights = 0, got = 0, back2back = 0, prev = false;
  for (let n = 10; n < 410; n++) {
    sim.night = n; sim.makeForecast(); sim.buildQueue();
    const has = sim.queue.includes('wyrm'); nights++; if (has) got++; if (has && prev) back2back++; prev = has;
    assert(!sim.forecast.types.includes('wyrm'), 'Bonewyrm is a surprise: not in the forecast');
  }
  assert(got / nights > 0.1 && got / nights < 0.25 && back2back === 0, 'rare: ' + got + '/' + nights + ', back to back ' + back2back);
  for (let n = 1; n < 10; n++) { sim.night = n; sim.buildQueue(); assert(!sim.queue.includes('wyrm'), 'not before night 10'); }
  sim.night = 12;
  sim.setReady('aaaaaa', true); sim.update(1 / 60);
  sim.zombies.length = 0; sim.queue = ['wyrm', 'walker']; sim.spawnT = 0;
  const live = () => { A.hp = A.maxhp; A.down = false; A.x = 24 * 40; A.y = 14 * 40; sim.update(1 / 60); };
  live();
  const head = sim.zombies.find((z) => z.type === 'wyrm');
  assert(head && head.body.length === GD.ZOMBIES.wyrm.segs && sim.zombies.filter((z) => z.type === 'wyrmseg').length === GD.ZOMBIES.wyrm.segs, 'spawns with its whole body');
  sim.queue.length = 0;
  for (let i = 0; i < 60 * 7; i++) live();
  const segs = () => head.body.map((id) => sim.zombies.find((z) => z.id === id));
  let prevZ = head, okGap = true;
  for (const sg of segs()) { const d = Math.hypot(sg.x - prevZ.x, sg.y - prevZ.y); if (d < 12 || d > 32) okGap = false; prevZ = sg; }
  assert(okGap, 'segments trail the head at an even spacing');
  // cut it in half: the back half dies and lies there as carcasses, the head speeds up
  const total = head.body.length, s0 = head.speed, k0 = A.kills;
  const mid = segs()[5];
  sim.damageZombie(mid, 1e9, 'aaaaaa');
  const husks = sim.structs.filter((s) => s.id === 'husk');
  assert(head.body.length === 5 && husks.length >= 2 && sim.zombies.filter((z) => z.type === 'wyrmseg' && !z.dead).length === 5, 'severed: 5 left, ' + husks.length + ' carcasses');
  assert(A.kills === k0 + 1, 'only the cut segment counts as a kill');
  live();
  assert(head.speed > s0 * 1.2, 'the head speeds up as it loses its body');
  // carcasses: not buildable, not movable, rot at dawn
  const hk = husks[0];
  assert(!sim.selectBuild('aaaaaa', 'husk') && !sim.placeMany('aaaaaa', 'husk', [[3, 3]]), 'carcasses are not buildable');
  assert(!sim.grab('aaaaaa', hk.x, hk.y) && sim.structAt(hk.cx, hk.cy) === hk, 'carcasses are too heavy to move');
  // the body crushes survivors it touches and shoves them out of the way
  const sg0 = segs()[0];
  A.x = sg0.x + 5; A.y = sg0.y; sg0.atkT = 0; const hp0 = A.hp = A.maxhp;
  sim.updateZombie(sg0, 1 / 60, [A]);
  assert(A.hp < hp0 && Math.hypot(A.x - sg0.x, A.y - sg0.y) >= sg0.r + 13, 'the body hurts and is solid');
  // a whole dead head turns every remaining segment into carcasses
  sim.damageZombie(head, 1e9, 'aaaaaa');
  assert(!sim.zombies.some((z) => z.type === 'wyrmseg' && !z.dead) && sim.structs.filter((s) => s.id === 'husk').length > husks.length, 'dead head: the rest of the body becomes carcasses');
  // crossing a carcass wall: small zombies climb over (slowly), big ones chew through
  sim.zombies = sim.zombies.filter((z) => !z.dead);
  for (const s of sim.structs.slice()) sim.removeStruct(s, true);
  sim.structs = [];
  const line = [];
  const husk = (cx, cy) => { const s = { uid: 9000 + cy * 50 + cx, id: 'husk', cx, cy, x: cx * 40 + 20, y: cy * 40 + 20, hp: 600, maxhp: 600, owner: null, hitT: 0, flash: 0 }; sim.grid[cy * GD.GW + cx] = s; sim.structs.push(s); return s; };
  for (let y = 0; y < GD.GH; y++) line.push(husk(20, y));      // wall to wall: no way around
  sim.flowDirty = true;
  A.x = 30 * 40; A.y = 12 * 40 + 20;
  const walker = sim.spawnZombie('walker', 16 * 40, 12 * 40 + 20);
  const brute = sim.spawnZombie('brute', 16 * 40, 6 * 40 + 20);
  let climbed = false, slowest = Infinity, px = walker.x;
  for (let i = 0; i < 60 * 25 && !(walker.x > 22 * 40); i++) {
    A.hp = A.maxhp; A.x = 30 * 40; A.y = 12 * 40 + 20; sim.update(1 / 60);
    if (walker.climb) { climbed = true; slowest = Math.min(slowest, walker.x - px); }
    px = walker.x;
  }
  assert(climbed && walker.x > 22 * 40, 'a walker climbs over the carcass');
  assert(slowest < walker.speed / 60 * 0.6, 'climbing is slow');
  assert(line.some((s) => s.hp < s.maxhp || s.dead), 'a brute chews through the carcass');
  // a short carcass with open ground beside it: they simply walk around
  for (const s of line) sim.removeStruct(s, true);
  sim.structs = []; sim.zombies.length = 0;
  for (let y = 11; y <= 13; y++) husk(20, y);
  sim.flowDirty = true;
  const w2 = sim.spawnZombie('walker', 16 * 40, 12 * 40 + 20);
  let climbed2 = false;
  for (let i = 0; i < 60 * 20 && !(w2.x > 22 * 40); i++) { A.hp = A.maxhp; A.x = 30 * 40; A.y = 12 * 40 + 20; sim.update(1 / 60); if (w2.climb) climbed2 = true; }
  assert(w2.x > 22 * 40 && !climbed2, 'a short carcass: the walker goes around it');
  // dawn: carcasses rot away
  sim.zombies.length = 0; sim.queue.length = 0;
  for (let i = 0; i < 3; i++) live();
  assert(sim.phase === 'day' && !sim.structs.some((s) => s.id === 'husk'), 'carcasses rot away at dawn');
  console.log('bonewyrm OK  (' + got + '/' + nights + ' nights had one)');
}

// ---- anyone can move anything; selling / loading stays with the builder
{
  const sim = new Sim(); sim.dev.unlockAll = true;   // these tests use every item; the supply-drop test below checks the unlocks
  sim.addPlayer('aaaaaa', 'A'); sim.addPlayer('bbbbbb', 'B');
  sim.dev.startNight = 2; sim.startGame();
  sim.placeMany('aaaaaa', 'steel', [[10, 10]]);
  const w = sim.structAt(10, 10), Bm = sim.getPlayer('bbbbbb').money;
  assert(sim.grab('bbbbbb', 10 * 40 + 20, 10 * 40 + 20), 'teammate can pick up your wall');
  assert(sim.placeAt('bbbbbb', 14 * 40 + 20, 10 * 40 + 20) && sim.structAt(14, 10) === w && w.owner === 'aaaaaa', 'moved, still yours');
  assert(!sim.toolAt('bbbbbb', 'sell', 14, 10) && sim.structAt(14, 10) === w && sim.getPlayer('bbbbbb').money === Bm, 'teammate cannot sell it');
  console.log('shared moving OK');
}

// ---- save / load
{
  const sim = new Sim(); sim.dev.unlockAll = true;   // these tests use every item; the supply-drop test below checks the unlocks
  sim.addPlayer('aaaaaa', 'Zach'); sim.addPlayer('bbbbbb', 'Sam');
  sim.dev.startNight = 3; sim.startGame();
  const A = sim.getPlayer('aaaaaa'), B = sim.getPlayer('bbbbbb');
  A.money = 4000; sim.buyWeapon('aaaaaa', 'shotgun'); sim.buyPerk('aaaaaa', 'vitality');
  sim.placeMany('aaaaaa', 'steel', [[10, 10], [11, 10]]); sim.placeMany('aaaaaa', 'gt_minigun', [[12, 12]]);
  sim.placeMany('bbbbbb', 'wood', [[30, 10]]);
  sim.grab('bbbbbb', 30 * 40 + 20, 10 * 40 + 20);           // carrying when the game is saved
  sim.setReady('aaaaaa'); sim.setReady('bbbbbb');
  for (let i = 0; i < 60 * 6; i++) { for (const p of sim.players) p.hp = p.maxhp; sim.update(1 / 60); }
  assert(sim.phase === 'night' && sim.zombies.length > 0, 'mid-night before saving');
  const save = JSON.parse(JSON.stringify(sim.serialize()));
  const z0 = sim.zombies.length, q0 = sim.queue.length, money = A.money, shells = A.weapons.shotgun.reserve;
  // new session: Zach is back on a different device, plus a newcomer; Sam has not rejoined yet
  const s2 = new Sim();
  s2.addPlayer('newdev1', 'zach'); s2.addPlayer('newbie1', 'Kim');
  assert(s2.load(save), 'load works');
  const Z2 = s2.getPlayer('newdev1'), K = s2.getPlayer('newbie1'), S2 = s2.players.find((p) => p.name === 'Sam');
  assert(s2.phase === 'night' && s2.night === 3, 'night restored');
  assert(Z2.money === money && Z2.weapons.shotgun.reserve === shells && Z2.perks.vitality === 1, 'Zach got his gear back by name');
  assert(s2.structs.filter((st) => st.owner === 'newdev1').length === 3, 'Zach still owns his builds');
  assert(s2.structs.some((st) => st.id === 'wood' && st.owner === 'bbbbbb'), 'carried wall was put back');
  assert(S2 && S2.away && s2.active().length === 2, 'Sam waits for his owner');
  assert(K.money >= GD.START_MONEY && !K.away && K.color !== Z2.color, 'newcomer starts fresh with own colour');
  assert(s2.zombies.length === z0 && Math.abs(s2.queue.length - q0) <= q0, 'zombies restored');
  for (const st of s2.structs) assert(s2.structAt(st.cx, st.cy) === st, 'grid rebuilt');
  s2.addPlayer('samphone2', 'Sam');
  assert(!S2.away && S2.id === 'samphone2' && s2.structs.some((st) => st.id === 'wood' && st.owner === 'samphone2'), 'Sam took his survivor back by name');
  for (let i = 0; i < 60 * 20; i++) { for (const p of s2.players) p.hp = p.maxhp; s2.update(1 / 60); checkInvariants(s2); }
  // a daytime save
  const s3 = new Sim(); s3.addPlayer('x1x1x1', 'Zach'); s3.dev.startNight = 4; s3.startGame();
  const ds = JSON.parse(JSON.stringify(s3.serialize()));
  const s4 = new Sim(); s4.addPlayer('y1y1y1', 'Zach');
  assert(s4.load(ds) && s4.phase === 'day' && s4.night === 4, 'day save restores');
  assert(!new Sim().load({ v: 9 }), 'bad save refused');
  const old = JSON.parse(JSON.stringify(ds)); old.structs.push({ uid: 999, id: 'mount', cx: 30, cy: 20, x: 0, y: 0, hp: 340, maxhp: 340, owner: 'x1x1x1', gun: 'rifle', mag: 3 });
  const s5 = new Sim(); s5.addPlayer('y1y1y1', 'Zach');
  assert(s5.load(old) && s5.structAt(30, 20) && s5.structAt(30, 20).id === 'gt_rifle', 'old Gun Mount loads as a Rifle Turret');
  console.log('save / load OK  (' + z0 + ' zombies, ' + s2.structs.length + ' builds restored)');
}

// lobby / restart round trip
c.sim.toLobby();
assert(c.sim.phase === 'lobby' && c.sim.zombies.length === 0 && c.sim.structs.length === 0, 'lobby reset');
assert(c.sim.startGame(), 'restart works');
console.log('OK');
