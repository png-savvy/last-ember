// Last Ember launcher (npm start). Runs the game server and restarts it straight away whenever it asks to,
// which it does when server.js itself is edited: it saves the running game first and the new one carries on
// from exactly there (see "live updates" in server.js). Ctrl+C stops everything as usual.
const { spawn } = require('child_process');
const path = require('path');

const RESTART = 75;          // exit code the server uses to say "start me again"
let child = null, stopping = false;

function start(again) {
  child = spawn(process.execPath, [path.join(__dirname, 'server.js')], {
    stdio: 'inherit',
    env: Object.assign({}, process.env, { LE_SUPERVISED: '1', LE_RESTARTED: again ? '1' : '' }),
  });
  child.on('exit', (code, signal) => {
    if (!stopping && code === RESTART) { console.log('\n  Server code changed: restarting, the game carries on...\n'); start(true); return; }
    process.exit(code === null ? (signal ? 1 : 0) : code);
  });
}
for (const sig of ['SIGINT', 'SIGTERM']) {
  process.on(sig, () => { stopping = true; if (child) child.kill(sig); else process.exit(0); });
}
start(false);
