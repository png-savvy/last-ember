// Quitting mid-run leaves a "Continue" save; when everyone dies, that save is deleted (a lost run can't be undone).
const { spawn } = require('child_process');
const WebSocket = require('ws');
const assert = (c, m) => { if (!c) { console.error('ASSERT: ' + m); srv.kill(); process.exit(1); } };
const PORT = 4870 + Math.floor(Math.random() * 100);
const dir = require('path').join(require('os').tmpdir(), 'le-autosave-' + process.pid);
const srv = spawn(process.execPath, [__dirname + '/../server.js'], { env: Object.assign({}, process.env, { PORT: String(PORT), SAVE_DIR: dir }), stdio: 'ignore' });
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
setTimeout(() => { console.error('timeout'); srv.kill(); process.exit(1); }, 90000);
(async () => {
  await wait(700);
  const ws = new WebSocket(`ws://localhost:${PORT}/ws?id=solo000001`);
  let st = null;
  ws.on('message', (raw) => { const m = JSON.parse(raw); if (m.t === 'st') st = m; });
  await new Promise((r) => ws.on('open', r));
  const tx = (o) => ws.send(JSON.stringify(o));
  tx({ t: 'hello', name: 'Solo' }); await wait(300);
  tx({ t: 'act', a: 'diff', v: 'hard' }); tx({ t: 'act', a: 'devNight', v: 40 }); tx({ t: 'act', a: 'start' }); await wait(800);
  tx({ t: 'act', a: 'save' }); await wait(200);
  tx({ t: 'act', a: 'quit' }); await wait(600);
  const cont = st.saves.find((x) => x.auto);
  assert(st.phase === 'lobby' && cont && st.saves[0].id === cont.id && /^Continue/.test(cont.label), 'quit leaves a Continue save');
  tx({ t: 'act', a: 'resume' }); await wait(500);
  assert(st.phase === 'day' && st.night === 40, 'RESUME carried on from the Continue save');
  tx({ t: 'act', a: 'ready' });                   // night 40 on Hard, standing still: the run ends fast
  const t0 = Date.now();
  while (st.phase !== 'over' && Date.now() - t0 < 60000) await wait(300);
  assert(st.phase === 'over', 'run lost');
  tx({ t: 'act', a: 'again' }); await wait(600);
  assert(st.phase === 'lobby' && !st.saves.some((x) => x.id === cont.id), 'Continue save gone after dying: ' + JSON.stringify(st.saves));
  assert(st.saves.length === 1, 'manual saves are kept');
  // admin terminal: the lost run is in the graveyard and can be brought back
  let termOut = [];
  ws.on('message', (raw) => { const m = JSON.parse(raw); if (m.t === 'term') termOut = m.out; });
  tx({ t: 'act', a: 'term', v: 'graveyard' }); await wait(300);
  assert(termOut.length === 1 && /night 40/i.test(termOut[0]), 'graveyard lists the lost run: ' + JSON.stringify(termOut));
  tx({ t: 'act', a: 'term', v: 'resurrect' }); await wait(600);
  assert(/rises again/.test(termOut[0]) && st.phase === 'day' && st.night === 40, 'resurrect carries on the lost run: ' + JSON.stringify(termOut) + ' ' + st.phase);
  const fs = require('fs');
  assert(fs.readdirSync(dir).some((f) => /^auto-.*\.json$/.test(f)) && !fs.readdirSync(dir + '/lost').length, 'its autosave moved back out of the graveyard');
  tx({ t: 'act', a: 'quit' }); await wait(500);
  tx({ t: 'act', a: 'term', v: 'cash 5000' }); await wait(200);
  tx({ t: 'act', a: 'term', v: 'bogus' }); await wait(200);
  assert(/Unknown command/.test(termOut[0]), 'unknown commands are reported');
  // two runs: each keeps its own autosave
  tx({ t: 'act', a: 'start' }); await wait(500); tx({ t: 'act', a: 'quit' }); await wait(500);
  tx({ t: 'act', a: 'start' }); await wait(500); tx({ t: 'act', a: 'quit' }); await wait(500);
  assert(st.saves.filter((x) => x.auto).length === 3, 'resurrected run + two new runs = three autosaves: ' + JSON.stringify(st.saves.map((x) => x.id)));
  console.log('autosave OK  (quit -> Continue, resume, death -> no Continue, one autosave per run, terminal resurrect)');
  srv.kill(); process.exit(0);
})();
