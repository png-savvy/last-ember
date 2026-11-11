// Turret value check: how much damage each turret really deals on a real night, per dollar.
// One survivor (kept alive, not shooting) stands by the fire with a single turret beside them.
// Run: node test/turrets.js        (prints a table; used to set the prices in data.js)
const GD = require('../public/js/data.js');
const { Sim, FIRE } = require('../public/js/sim.js');

const IDS = process.argv[2] ? process.argv.slice(2) : GD.TURRET_IDS;
const NIGHTS = [8, 14, 22];
const SECONDS = 70, SEEDS = +process.env.SEEDS || 4;      // SEEDS=12 node test/turrets.js for steadier numbers

function run(id, night) {
  const sim = new Sim(); sim.dev.unlockAll = true;   // these tests use every item; the supply-drop test below checks the unlocks
  sim.addPlayer('p', 'P');
  sim.dev.startNight = night; sim.dev.money = true; sim.difficulty = 'hard';
  sim.startGame();
  const p = sim.getPlayer('p');
  p.x = FIRE.x; p.y = FIRE.y + 60;
  p.money = 1e6;
  if ((!sim.placeMany('p', id, [[FIRE.cx + 1, FIRE.cy + 1]]) || sim.structs.length !== 1)) throw new Error('could not place ' + id);
  let dealt = 0;
  const orig = sim.damageZombie.bind(sim);
  // only damage credited to our survivor counts: they never shoot, so it is all the turret's (not random Bloater blasts)
  sim.damageZombie = (z, dmg, by, ...a) => { const h = z.hp; orig(z, dmg, by, ...a); if (by === 'p') dealt += Math.max(0, h - Math.max(0, z.hp)); };
  sim.setReady('p', true);
  sim.update(1 / 60);
  for (let i = 0; i < SECONDS * 60; i++) {
    p.hp = p.maxhp; p.down = false; p.x = FIRE.x; p.y = FIRE.y + 60;
    sim.setInput('p', { mx: 0, my: 0, aim: null, fire: false });
    for (const s of sim.structs) s.hp = s.maxhp;
    sim.update(1 / 60);
    if (sim.phase !== 'night') break;
  }
  return dealt;
}

const rows = [];
for (const id of IDS) {
  const per = NIGHTS.map((n, i) => { let t = 0; for (let k = 0; k < SEEDS; k++) t += run(id, n); return t / SEEDS / SECONDS; });
  const avg = per.reduce((a, b) => a + b, 0) / per.length;
  rows.push({ id, cost: GD.STRUCTS[id].cost, per, avg });
}
const ref = rows.find((r) => r.id === 'turret');
const refVal = ref.avg / ref.cost;
console.log('turret            cost    dps n8  dps n14  dps n22   dmg/$ vs Gun Turret   fair price');
for (const r of rows) {
  const v = r.avg / r.cost / refVal;
  console.log(r.id.padEnd(14), String(r.cost).padStart(6), ...r.per.map((x) => x.toFixed(0).padStart(8)),
    (v * 100).toFixed(0).padStart(14) + '%', String(Math.round(r.avg / refVal / 50) * 50).padStart(14));
}
