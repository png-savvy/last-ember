// Starts the real server on a spare port and plays as a phone with no big screen open.
const { spawn } = require('child_process');
const WebSocket = require('ws');
const assert = (c, m) => { if (!c) { console.error('ASSERT: ' + m); srv.kill(); process.exit(1); } };
const PORT = 4650 + Math.floor(Math.random() * 200);
const srv = spawn(process.execPath, [__dirname + '/../server.js'], { env: Object.assign({}, process.env, { PORT: String(PORT), SAVE_DIR: require('path').join(require('os').tmpdir(), 'le-smoke-saves-' + process.pid) }), stdio: ['ignore', 'pipe', 'pipe'] });
let errText = '';
srv.stderr.on('data', (d) => { errText += d; });
const done = (code) => { srv.kill(); process.exit(code); };
setTimeout(() => {
  const ws = new WebSocket(`ws://localhost:${PORT}/ws?id=phone123456`);
  const seen = { st: 0, w: 0, phases: new Set(), maxZ: 0, fb: [] };
  let st = null;
  ws.on('message', (raw) => {
    const m = JSON.parse(raw);
    if (m.t === 'st') { seen.st++; st = m; seen.phases.add(m.phase); }
    if (m.t === 'w') { seen.w++; seen.maxZ = Math.max(seen.maxZ, m.Z.length); }
    if (m.t === 'fb') seen.fb.push(m.k);
    if (m.t === 'note') seen.notes = (seen.notes || []).concat(m.msg);
    if (m.t === 'w') seen.ts = m.ts;
  });
  ws.on('open', () => {
    const tx = (o) => ws.send(JSON.stringify(o));
    tx({ t: 'hello', name: 'Solo' });
    tx({ t: 'act', a: 'view', v: 1 });
    setTimeout(() => {
      assert(st && st.phase === 'lobby' && st.roster.length === 1, 'phone sees main menu with itself in it');
      tx({ t: 'act', a: 'diff', v: 'hard' });
      tx({ t: 'act', a: 'devMoney', v: true });
      tx({ t: 'act', a: 'start' });
    }, 400);
    setTimeout(() => {
      assert(st.phase === 'night' && st.night === 1 && st.diff === 'hard' && st.money >= 99999, 'game started from the phone (night 1 begins right away), settings applied');
      assert(st.build === null, 'not in build mode after starting (st.build must be the selected build tool): ' + st.build);
      tx({ t: 'act', a: 'buy', v: 'rifle' });
      tx({ t: 'act', a: 'placeMany', v: { id: 'wood', cells: [[10, 10], [11, 10], [12, 10]] } });
      tx({ t: 'act', a: 'ready' });
      tx({ t: 'in', mx: 0.5, my: 0, ax: 1, ay: 0 });
    }, 900);
    setTimeout(() => {
      assert(st.phase === 'night' && st.weapons.rifle, 'night running; rifle bought mid-night');
    }, 2500);
    setTimeout(() => tx({ t: 'act', a: 'pause', v: true }), 7500);
    setTimeout(() => {
      assert(st.paused, 'paused from the phone');
      tx({ t: 'act', a: 'save' });
      tx({ t: 'act', a: 'pause', v: false });
      tx({ t: 'act', a: 'quit' });
    }, 8000);
    setTimeout(() => {
      assert(st.phase === 'lobby', 'quit to main menu');
      assert((seen.notes || []).some((n) => /saved/i.test(n)), 'save confirmed: ' + seen.notes);
      assert(st.saves && st.saves.length === 2 && st.saves.some((x) => !x.auto && /Night 1/.test(x.label)), 'save listed in the main menu: ' + JSON.stringify(st.saves));
      assert(st.saves[0].auto && /^Continue/.test(st.saves[0].label), 'quitting mid-run leaves a Continue save at the top');
      assert(typeof seen.ts === 'number', 'snapshots carry a server timestamp');
      tx({ t: 'act', a: 'load', v: st.saves[0].id });
    }, 8600);
    setTimeout(() => {
      assert(st.phase === 'night' && st.night === 1 && st.paused && st.weapons.rifle, 'loaded mid-night save, paused, rifle kept');
      tx({ t: 'act', a: 'quit' });
    }, 9100);
    // waiting room: a second phone joins; only the host can start, the guest marks itself ready
    let ws2 = null, st2 = null; const notes2 = [];
    setTimeout(() => {
      assert(st.phase === 'lobby', 'quit again');
      ws2 = new WebSocket(`ws://localhost:${PORT}/ws?id=guest654321`);
      ws2.on('message', (raw) => { const m = JSON.parse(raw); if (m.t === 'st') st2 = m; if (m.t === 'note') notes2.push(m.msg); });
      ws2.on('open', () => { ws2.send(JSON.stringify({ t: 'hello', name: 'Guest' })); });
    }, 9600);
    setTimeout(() => {
      assert(st2 && st2.phase === 'lobby' && st2.roster.length === 2 && st2.leader === 'phone123456', 'guest sees the waiting room with the host');
      assert(st.host === true && st2.host === false, 'first to join is the host');
      const g = st2.roster.find((r) => r.id === 'guest654321'), h = st2.roster.find((r) => r.id === 'phone123456');
      assert(g && !g.ready && h.ready, 'guest starts not ready, host counts as ready');
      ws2.send(JSON.stringify({ t: 'act', a: 'start' }));
      ws2.send(JSON.stringify({ t: 'act', a: 'diff', v: 'easy' }));
      ws2.send(JSON.stringify({ t: 'act', a: 'ready' }));
    }, 10100);
    setTimeout(() => {
      assert(st2.phase === 'lobby' && st2.diff !== 'easy' && notes2.some((n) => /only the host/i.test(n)), 'guest cannot start or change settings: ' + notes2);
      assert(st.roster.find((r) => r.id === 'guest654321').ready, 'guest is ready, host sees it');
      tx({ t: 'act', a: 'makeHost', v: 'guest654321' });
    }, 10600);
    setTimeout(() => {
      assert(st2.host === true && st.host === false && st.leader === 'guest654321', 'host handed over');
      ws2.close();
    }, 11100);
    setTimeout(() => {
      assert(st.host === true && st.roster.length === 1, 'host passes back when the guest leaves');
      assert(seen.w > 40 && seen.maxZ > 0, 'world snapshots streamed: ' + seen.w + ', max zombies ' + seen.maxZ);
      assert(!errText, 'server errors: ' + errText);
      console.log('server smoke OK  (snapshots: ' + seen.w + ', states: ' + seen.st + ', feedback: ' + [...new Set(seen.fb)].join(',') + ')');
      done(0);
    }, 11700);
  });
  ws.on('error', (e) => { console.error('ws error', e.message); done(1); });
}, 700);
setTimeout(() => { console.error('timeout'); done(1); }, 20000);
