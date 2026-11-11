// Balance helper: average kill money per player and night length for the first nights.
// Run: node test/earnings.js
const GD = require('../public/js/data.js');
const { Sim } = require('../public/js/sim.js');

for (const pc of [1, 2, 4]) {
  const sim = new Sim();
  for (let i = 0; i < pc; i++) sim.addPlayer('p' + i + 'xxxxx', 'P' + i);
  sim.startGame();
  const rows = [];
  let total = 0;
  for (let n = 1; n <= 4; n++) {
    let cash = 0, count = 0, dur = 0;
    const runs = 40;
    for (let k = 0; k < runs; k++) {
      sim.night = n; sim.makeForecast(); sim.phase = 'night'; sim.buildQueue();
      count += sim.queue.length / runs;
      dur += sim.spawnGap * sim.queue.length / runs;
      for (const t of sim.queue) cash += GD.ZOMBIES[t].bounty * (1 + 0.07 * (n - 1)) / pc / runs;
    }
    total += cash;
    rows.push(`n${n}: ${count.toFixed(0)} zombies, spawns over ~${dur.toFixed(0)}s, $${cash.toFixed(0)}/player`);
  }
  console.log(`${pc}p | ${rows.join(' | ')} | nights 1-4: $${total.toFixed(0)}/player | start $${GD.START_MONEY}`);
}
