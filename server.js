// Last Ember - game server.
// The game runs HERE. Every device (phone, laptop, TV) is just a window into it:
// open the URL anywhere, see the main menu, play. No "host screen" is required.
const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { WebSocketServer } = require('ws');
const QRCode = require('qrcode');
// the game rules are reloaded live when their files change (see "live updates" below), so these can be swapped
let GD = require('./public/js/data.js');
let { Sim } = require('./public/js/sim.js');
let NV = require('./public/js/netview.js');

let PORT = parseInt(process.env.PORT, 10) || 4500;
const PORT_FIXED = !!process.env.PORT;
const PUBLIC = path.join(__dirname, 'public');
const PROTO = 6;                       // clients compare this to spot a stale page
// Fingerprint of the page code: an open page that sees it change (the server restarted with new code)
// reloads itself, so nobody keeps playing on old scripts that disagree with the server.
const codeHash = () => {
  const crypto = require('crypto'), h = crypto.createHash('sha1');
  const walk = (dir) => {
    for (const f of fs.readdirSync(dir, { withFileTypes: true }).sort((a, b) => (a.name < b.name ? -1 : 1))) {
      const fp = path.join(dir, f.name);
      if (f.isDirectory()) walk(fp); else if (/\.(js|html|css)$/.test(f.name)) { h.update(f.name); h.update(fs.readFileSync(fp)); }
    }
  };
  try { walk(PUBLIC); } catch (e) { h.update(String(Date.now())); }
  return h.digest('hex').slice(0, 10);
};
let BUILD = codeHash();

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.json': 'application/json',
  '.ico': 'image/x-icon',
};

function lanAddresses() {
  const out = [];
  const ifs = os.networkInterfaces();
  for (const name of Object.keys(ifs)) {
    for (const a of ifs[name] || []) {
      if (a.family !== 'IPv4' || a.internal) continue;
      out.push(a.address);
    }
  }
  // Prefer ordinary home-network ranges over VPN / virtual adapters.
  const score = (ip) => {
    if (ip.startsWith('192.168.')) return 0;
    if (ip.startsWith('10.')) return 1;
    if (/^172\.(1[6-9]|2\d|3[01])\./.test(ip)) return 2;
    if (ip.startsWith('169.254.')) return 9;
    return 5;
  };
  out.sort((a, b) => score(a) - score(b));
  return out;
}
function baseUrl() {
  if (process.env.PUBLIC_URL) return process.env.PUBLIC_URL.replace(/\/+$/, '');
  const ip = lanAddresses()[0] || 'localhost';
  return `http://${ip}:${PORT}`;
}
const joinUrl = () => baseUrl() + '/';

// ---------------------------------------------------------------- files
const ROUTES = { '/sounds': '/sounds.html', '/sounds/': '/sounds.html', '/': '/index.html', '/pad': '/pad.html', '/pad/': '/pad.html', '/play': '/pad.html', '/screen': '/host.html', '/screen/': '/host.html' };
const server = http.createServer(async (req, res) => {
  let urlPath;
  try {
    urlPath = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  } catch (e) {
    res.writeHead(400); res.end('Bad request'); return;
  }
  if (urlPath === '/info') {
    res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
    res.end(JSON.stringify({ joinUrl: joinUrl(), addresses: lanAddresses(), port: PORT }));
    return;
  }
  if (urlPath === '/qr.svg') {
    try {
      const svg = await QRCode.toString(joinUrl(), { type: 'svg', margin: 1, errorCorrectionLevel: 'M',
        color: { dark: '#0b0d12', light: '#ffffff' } });
      res.writeHead(200, { 'Content-Type': MIME['.svg'], 'Cache-Control': 'no-store' });
      res.end(svg);
    } catch (e) {
      res.writeHead(500); res.end('QR error');
    }
    return;
  }
  if (ROUTES[urlPath]) urlPath = ROUTES[urlPath];
  const file = path.normalize(path.join(PUBLIC, urlPath));
  if (file !== PUBLIC && !file.startsWith(PUBLIC + path.sep)) {
    res.writeHead(403); res.end('Forbidden'); return;
  }
  fs.readFile(file, (err, data) => {
    if (err) { res.writeHead(404, { 'Content-Type': 'text/plain' }); res.end('Not found'); return; }
    res.writeHead(200, {
      'Content-Type': MIME[path.extname(file).toLowerCase()] || 'application/octet-stream',
      'Cache-Control': 'no-store',
    });
    res.end(data);
  });
});

// ---------------------------------------------------------------- the game
let sim = new Sim();
let paused = false;
let speed = 1;                         // fast mode: the game runs up to 10x as fast (anyone can switch it)
const SPEEDS = [1, 2, 3, 5, 10];
const conns = new Set();
const owner = new Map();               // player id -> connection that controls it
let pending = [];                      // events since the last world snapshot
let seq = 0;
let autosave = false;

const send = (c, obj) => { if (c.ws.readyState === 1) c.ws.send(typeof obj === 'string' ? obj : JSON.stringify(obj)); };
function cleanName(s) {
  const n = String(s || '').replace(/[\u0000-\u001f<>]/g, '').trim().slice(0, 14);
  return n || 'Survivor';
}
function claim(c, pid) {
  const old = owner.get(pid);
  if (old && old !== c) old.pids.delete(pid);
  owner.set(pid, c);
  c.pids.add(pid);
}
function release(c, pid) {
  c.pids.delete(pid);
  if (owner.get(pid) === c) { owner.delete(pid); sim.removePlayer(pid); }
}
// The waiting room has a host: the first survivor to join (or whoever the host hands it to).
// The host's device and any big screen run the lobby; everyone else marks themselves ready.
let leaderId = null;
function leader() {
  const a = sim.active();
  if (!leaderId || !a.some((p) => p.id === leaderId)) leaderId = a.length ? a[0].id : null;
  return leaderId;
}
const isHost = (c) => !!c && (c.screen || (leader() !== null && owner.get(leader()) === c) || !sim.active().length);
function lobbyRoster() {
  const lead = leader();
  return sim.active().map((p) => {
    const c = owner.get(p.id);
    const dev = !c ? 'away' : p.id.endsWith(':kb') ? 'keyboard' : /:gp\d$/.test(p.id) ? 'gamepad' : 'phone';
    // the host and keyboard / gamepad players (at a big screen) can start the game themselves: they count as ready
    return { id: p.id, name: p.name, color: p.color, ready: !!p.ready || p.id === lead || dev === 'keyboard' || dev === 'gamepad', dev };
  });
}
function setPaused(v) {
  paused = !!v && (sim.phase === 'day' || sim.phase === 'night');
  for (const c of conns) c.stSent = {};
}
// ---------------------------------------------------------------- saved games
// One JSON file per save in ./saves. Every run has its own autosave ("auto-<run id>"), rewritten at every dawn
// and when you quit mid-run (so you can go back in and carry on), and deleted when everyone in that run dies:
// a lost run can't be undone by loading it. Several runs' autosaves live side by side (the oldest are pruned).
const SAVE_DIR = process.env.SAVE_DIR || path.join(__dirname, 'saves');
let saveList = [];
const MAX_AUTOSAVES = 6;
let curAuto = null;                   // the autosave file of the run being played
const autoId = () => curAuto || (curAuto = 'auto-' + (sim.runId || Date.now().toString(36)));
const bySaveTime = (a, b) => b.at - a.at;
function refreshSaves() {
  const out = [];
  try {
    for (const f of fs.readdirSync(SAVE_DIR)) {
      if (!/^[a-z0-9-]{1,40}\.json$/.test(f)) continue;
      try {
        const d = JSON.parse(fs.readFileSync(path.join(SAVE_DIR, f), 'utf8'));
        if (d && d.meta) out.push(Object.assign({ id: f.slice(0, -5) }, d.meta));
      } catch (e) { /* unreadable save: skip it */ }
    }
  } catch (e) { /* no saves folder yet */ }
  out.sort(bySaveTime);
  saveList = out.slice(0, 16);
}
function note(msg) { for (const c of conns) send(c, { t: 'note', msg }); }
function writeSave(id, auto, prefix) {
  if (sim.phase !== 'day' && sim.phase !== 'night') return false;
  const state = sim.serialize();
  const names = sim.players.map((p) => p.name);
  const meta = { at: Date.now(), night: sim.night, phase: sim.phase, diff: sim.difficulty, names, auto: !!auto,
    label: (prefix ? prefix + ' · ' : auto ? 'Autosave · ' : '') + (sim.phase === 'night' ? 'Night ' + sim.night + ' (mid-fight)' : 'Day before night ' + sim.night) };
  try {
    fs.mkdirSync(SAVE_DIR, { recursive: true });
    const file = path.join(SAVE_DIR, id + '.json');
    fs.writeFileSync(file + '.tmp', JSON.stringify({ meta, state }));
    fs.renameSync(file + '.tmp', file);
  } catch (e) {
    console.error('save failed', e.message);
    if (!auto) note('Could not save: ' + e.message);
    return false;
  }
  saveList = [Object.assign({ id }, meta)].concat(saveList.filter((x) => x.id !== id));
  saveList.sort(bySaveTime);
  // keep only the newest few autosaves (other runs' ones included); manual saves are never pruned
  const autos = saveList.filter((x) => x.auto);
  for (const old of autos.slice(MAX_AUTOSAVES)) {
    try { fs.unlinkSync(path.join(SAVE_DIR, old.id + '.json')); } catch (e) { /* already gone */ }
  }
  if (autos.length > MAX_AUTOSAVES) { const drop = new Set(autos.slice(MAX_AUTOSAVES).map((x) => x.id)); saveList = saveList.filter((x) => !drop.has(x.id)); }
  saveList = saveList.slice(0, 16);
  return true;
}
// A lost run's autosave leaves the saved-games list, but is kept in saves/lost (the newest few) so the admin
// terminal can bring it back ("resurrect").
const LOST_DIR = path.join(SAVE_DIR, 'lost');
const MAX_LOST = 5;
function dropAutosave() {
  autosave = false;
  const id = autoId();
  try {
    fs.mkdirSync(LOST_DIR, { recursive: true });
    fs.renameSync(path.join(SAVE_DIR, id + '.json'), path.join(LOST_DIR, id + '.json'));
    const old = lostList().slice(MAX_LOST);
    for (const x of old) { try { fs.unlinkSync(path.join(LOST_DIR, x.id + '.json')); } catch (e) { /* gone */ } }
  } catch (e) { /* none yet */ }
  saveList = saveList.filter((x) => x.id !== id);
}
function lostList() {
  const out = [];
  try {
    for (const f of fs.readdirSync(LOST_DIR)) {
      if (!/^[a-z0-9-]{1,40}\.json$/.test(f)) continue;
      try { const d = JSON.parse(fs.readFileSync(path.join(LOST_DIR, f), 'utf8')); if (d && d.meta) out.push(Object.assign({ id: f.slice(0, -5) }, d.meta)); } catch (e) { /* skip */ }
    }
  } catch (e) { /* no lost runs */ }
  return out.sort(bySaveTime);
}
function loadSave(id, fromLost) {
  if (sim.phase !== 'lobby' || !/^[a-z0-9-]{1,40}$/.test(String(id))) return false;
  let d;
  const file = path.join(fromLost ? LOST_DIR : SAVE_DIR, id + '.json');
  try { d = JSON.parse(fs.readFileSync(file, 'utf8')); } catch (e) { note('That save could not be read'); return false; }
  if (!sim.load(d && d.state)) { note('That save could not be loaded'); return false; }
  if (fromLost) {                    // back from the dead: it is a live run again, with its autosave back in the list
    try { fs.renameSync(file, path.join(SAVE_DIR, id + '.json')); } catch (e) { /* keep going anyway */ }
    refreshSaves();
  }
  // carrying on from an autosave keeps writing to that same file; any other save continues its run's own one
  curAuto = d.meta && d.meta.auto ? String(id) : 'auto-' + sim.runId;
  for (const p of sim.players) {
    const c = owner.get(p.id);
    if (c) p.noGhost = !!c.world && !c.screen;
  }
  if (sim.phase === 'night') setPaused(true);         // a mid-fight save comes back paused, so everyone can get ready
  for (const c of conns) { c.stSent = {}; c.sSig = ''; }
  note((fromLost ? 'Back from the dead: ' : 'Loaded: ') + ((d.meta && d.meta.label) || 'saved game') + (sim.phase === 'night' ? ' · paused, resume when ready' : ''));
  return true;
}

// ---------------------------------------------------------------- admin terminal (main menu)
const TERM_HELP = [
  'help                 this list',
  'resurrect            carry on your last lost run from its last autosave',
  'graveyard            list lost runs;  resurrect <n> picks one',
  'money on|off         infinite funds',
  'cash <n>             everyone starts the next game with $n extra',
  'night <n>            start the next game on night n',
  'wyrm on|off          a Bonewyrm every night from 10',
  'dark on|off          every possible night is pitch black (from night 6)',
  'unlock on|off        all gear available from night 1 (no waiting for supply drops)',
  'diff easy|normal|hard',
  'status               what is switched on',
  'clear                clear the screen',
];
function runTerminal(line) {
  const [cmd, ...args] = String(line || '').trim().toLowerCase().split(/\s+/);
  const arg = args[0];
  const onOff = (v, cur) => (v === 'on' || v === '1' || v === 'true' ? true : v === 'off' || v === '0' || v === 'false' ? false : !cur);
  if (!cmd) return [];
  if (sim.phase !== 'lobby') return ['The terminal only works from the main menu.'];
  switch (cmd) {
    case 'help': case '?': return TERM_HELP;
    case 'graveyard': case 'lost': {
      const L = lostList();
      if (!L.length) return ['The graveyard is empty. (Runs lost from now on are kept here.)'];
      return L.map((x, i) => (i + 1) + '. ' + x.label.replace(/^(Autosave|Continue) · /, '') + ' · ' + ((GD.DIFFICULTY[x.diff] || {}).name || '') +
        ' · ' + (x.names || []).join(', ') + ' · ' + new Date(x.at).toLocaleString());
    }
    case 'resurrect': case 'lazarus': case 'undo-death': {
      const L = lostList();
      if (!L.length) return ['Nothing to resurrect: no lost runs in the graveyard.'];
      const i = arg ? (parseInt(arg, 10) || 1) - 1 : 0;
      const x = L[i];
      if (!x) return ['No run #' + arg + '. Type graveyard to see the list.'];
      if (!sim.active().length) return ['Somebody has to be in the waiting room first.'];
      return loadSave(x.id, true) ? ['It rises again: ' + x.label.replace(/^(Autosave|Continue) · /, '') + '.'] : ['That run could not be brought back.'];
    }
    case 'money': sim.dev.money = onOff(arg, sim.dev.money); return ['Infinite funds ' + (sim.dev.money ? 'ON' : 'OFF') + '.'];
    case 'cash': {
      const n = Math.max(0, Math.min(1e6, parseInt(arg, 10) || 0));
      sim.dev.bonus = n; return [n ? 'Everyone starts the next game with $' + GD.fmt(n) + ' extra.' : 'Starting cash bonus cleared.'];
    }
    case 'night': {
      const n = parseInt(arg, 10);
      if (!(n >= 1)) return ['Usage: night <n>'];
      sim.dev.startNight = Math.max(1, Math.min(99, n)); return ['The next game starts on night ' + sim.dev.startNight + '.'];
    }
    case 'wyrm': sim.dev.wyrm = onOff(arg, sim.dev.wyrm); return ['Bonewyrm every night from 10: ' + (sim.dev.wyrm ? 'ON' : 'OFF') + '.'];
    case 'unlock': sim.dev.unlockAll = onOff(arg, sim.dev.unlockAll); return ['All gear unlocked from the start: ' + (sim.dev.unlockAll ? 'ON' : 'OFF') + '.'];
    case 'dark': sim.dev.dark = onOff(arg, sim.dev.dark); return ['Pitch-black nights whenever possible (night 6+, not Blood Moon or boss nights): ' + (sim.dev.dark ? 'ON' : 'OFF') + '.'];
    case 'diff': case 'difficulty':
      if (!GD.DIFFICULTY[arg]) return ['Usage: diff easy|normal|hard'];
      sim.difficulty = arg; return ['Difficulty: ' + GD.DIFFICULTY[arg].name + '.'];
    case 'status': return ['money ' + (sim.dev.money ? 'on' : 'off') + ' · cash +$' + GD.fmt(sim.dev.bonus | 0) + ' · night ' + sim.dev.startNight +
      ' · wyrm ' + (sim.dev.wyrm ? 'on' : 'off') + ' · dark ' + (sim.dev.dark ? 'on' : 'off') + ' · ' + GD.DIFFICULTY[sim.difficulty].name + ' · ' + lostList().length + ' lost run(s)'];
    default: return ['Unknown command: ' + cmd + '. Type help.'];
  }
}
refreshSaves();

function toLobby() {
  setPaused(false);
  speed = 1;
  // drop anyone whose device has gone away, then reset
  for (const p of sim.players.slice()) if (!owner.has(p.id)) sim.players.splice(sim.players.indexOf(p), 1);
  sim.toLobby();
}

const GLOBAL = new Set(['speed', 'term', 'resume', 'start', 'again', 'quit', 'pause', 'diff', 'devMoney', 'devNight', 'forceNight', 'view', 'kick', 'save', 'load', 'delSave', 'makeHost', 'devWyrm']);
// in the waiting room only the host (or a big screen) may run these
const HOST_ONLY = new Set(['term', 'resume', 'start', 'diff', 'devMoney', 'devNight', 'devWyrm', 'kick', 'load', 'delSave', 'makeHost']);
function act(c, pid, a, v) {
  if (GLOBAL.has(a)) {
    if (sim.phase === 'lobby' && HOST_ONLY.has(a) && !isHost(c)) {
      const lp = sim.getPlayer(leader());
      if (c.pids.size) send(c, { t: 'note', msg: 'Only the host' + (lp ? ' (' + lp.name + ')' : '') + ' can do that' });
      return;
    }
    switch (a) {
      case 'start': if (sim.phase === 'lobby' && sim.active().length && sim.startGame()) curAuto = 'auto-' + sim.runId; break;
      case 'term': send(c, { t: 'term', out: runTerminal(v) }); break;
      case 'speed': {
        const n = v === 'next' || v === undefined ? SPEEDS[(SPEEDS.indexOf(speed) + 1) % SPEEDS.length]
          : SPEEDS.includes(v | 0) ? (v | 0) : speed;
        if (n !== speed) { speed = n; note(speed > 1 ? 'Fast mode: ' + speed + 'x speed' : 'Normal speed'); }
        break;
      }
      case 'resume': if (sim.phase === 'lobby' && sim.active().length && saveList.length) loadSave(saveList[0].id); break;
      case 'again': if (sim.phase === 'over') toLobby(); break;
      case 'quit':
        if (sim.phase === 'day' || sim.phase === 'night') {
          const ok = writeSave(autoId(), true, 'Continue');
          toLobby();
          if (ok) note('Run saved · pick "Continue" in the saved games to carry on');
        }
        break;
      case 'pause': setPaused(v === undefined ? !paused : !!v); break;
      case 'diff': if (GD.DIFFICULTY[v] && sim.phase === 'lobby') sim.difficulty = v; break;
      case 'devMoney': sim.dev.money = v === undefined ? !sim.dev.money : !!v; break;
      case 'devWyrm': sim.dev.wyrm = v === undefined ? !sim.dev.wyrm : !!v; break;
      case 'devNight': if (sim.phase === 'lobby') sim.dev.startNight = Math.max(1, Math.min(99, v | 0)); break;
      case 'kick': {           // remove a player from the lobby (any device can do this)
        if (sim.phase !== 'lobby' || typeof v !== 'string') break;
        const oc = owner.get(v);
        if (oc) { send(oc, { t: 'kicked', p: v }); release(oc, v); }
        else sim.removePlayer(v);
        break;
      }
      case 'makeHost': if (sim.phase === 'lobby' && typeof v === 'string' && sim.getPlayer(v)) leaderId = v; break;
      case 'forceNight': if (sim.phase === 'day' && !paused) sim.startNight(); break;
      case 'save': if (writeSave('save-' + Date.now())) note('Game saved · load it any time from the main menu'); break;
      case 'load': loadSave(v); break;
      case 'delSave': {
        if (sim.phase !== 'lobby' || !/^[a-z0-9-]{1,40}$/.test(String(v))) break;
        try { fs.unlinkSync(path.join(SAVE_DIR, v + '.json')); } catch (e) { /* already gone */ }
        refreshSaves();
        break;
      }
      case 'view': {
        c.world = !!v || c.screen;
        for (const id of c.pids) { const p = sim.getPlayer(id); if (p && !c.screen) p.noGhost = !!v; }
        c.sSig = '';
        break;
      }
    }
    for (const k of conns) k.stSent = {};
    return;
  }
  if (owner.get(pid) !== c || paused) return;
  const obj = v && typeof v === 'object' ? v : null;
  switch (a) {
    case 'buy': sim.buyWeapon(pid, v); break;
    case 'ammo': sim.buyAmmo(pid, v); break;
    case 'upg': sim.upgradeWeapon(pid, v); break;
    case 'perk': sim.buyPerk(pid, v); break;
    case 'equip': sim.selectWeapon(pid, v); break;
    case 'build': sim.selectBuild(pid, v || null); break;
    case 'place': sim.place(pid); break;
    case 'placeAt': if (obj) sim.placeAt(pid, +obj.x, +obj.y); break;
    case 'grab': if (obj) sim.grab(pid, +obj.x, +obj.y); break;
    case 'swap': sim.swap(pid, v === -1 || v === '-1' ? -1 : 1); break;
    case 'reload': sim.reload(pid); break;
    case 'ready': sim.setReady(pid); break;
    case 'undo': sim.undo(pid); break;
    case 'placeMany': if (obj) sim.placeMany(pid, String(obj.id), obj.cells); break;
    case 'toolAt': if (obj) sim.toolAt(pid, String(obj.tool), +obj.cx, +obj.cy); break;
  }
  c.stSent[pid] = null;                 // push fresh state right away
}

function onMessage(c, m) {
  if (!m || typeof m.t !== 'string') return;
  if (m.t === 'hello') {                  // a phone (or any device) joins as a player
    const pid = c.id;
    claim(c, pid);
    const p = sim.addPlayer(pid, cleanName(m.name));
    p.noGhost = !!c.world;
    c.stSent = {};
    return;
  }
  if (m.t === 'screen') {                 // a shared big-screen view
    c.screen = true; c.world = true; c.sSig = '';
    return;
  }
  if (m.t === 'local') {                  // keyboard / gamepad player sitting at a big screen
    const slot = String(m.slot || '');
    if (!c.screen || !/^(kb|gp\d)$/.test(slot)) return;
    const pid = c.id + ':' + slot;
    if (m.on) { claim(c, pid); sim.addPlayer(pid, cleanName(m.name), { keyboard: slot === 'kb' }); }
    else release(c, pid);
    c.stSent = {};
    return;
  }
  const pid = typeof m.p === 'string' ? m.p : c.id;
  if (m.t === 'in') {
    if (owner.get(pid) !== c) return;
    const p = sim.getPlayer(pid);
    if (!p) return;
    if (paused) { sim.setInput(pid, { mx: 0, my: 0, aim: null, fire: false }); return; }
    if (m.ax !== undefined) {             // phone stick format: aim stick doubles as trigger
      const ax = +m.ax || 0, ay = +m.ay || 0, am = Math.hypot(ax, ay);
      sim.setInput(pid, { mx: +m.mx || 0, my: +m.my || 0, aim: am > 0.18 ? Math.atan2(ay, ax) : null, fire: am > 0.5, assist: true });
    } else {
      sim.setInput(pid, { mx: +m.mx || 0, my: +m.my || 0, aim: typeof m.aim === 'number' ? m.aim : null, fire: !!m.fire, assist: !!m.assist });
    }
    p.buildAt = (typeof m.bx === 'number' && isFinite(m.bx)) ? { x: m.bx, y: +m.by || 0 } : null;
    return;
  }
  if (m.t === 'act') act(c, pid, String(m.a || ''), m.v);
  if (m.t === 'diag' && c.screen) {        // big-screen self report, for troubleshooting display problems
    try {
      const dir = path.join(__dirname, 'logs'), file = path.join(dir, 'screen-diag.log');
      fs.mkdirSync(dir, { recursive: true });
      if (fs.existsSync(file) && fs.statSync(file).size > 500000) fs.renameSync(file, file + '.old');
      fs.appendFileSync(file, new Date().toISOString() + ' ' + JSON.stringify(m.d).slice(0, 4000) + '\n');
    } catch (e) { /* diagnostics must never break the game */ }
  }
}

// Feedback that only the affected player's device needs.
const FB = { buy: 'buy', deny: 'deny', hurt: 'hurt', down: 'down', revive: 'revive', dry: 'dry', undo: 'info', note: 'info' };
function routeEvents() {
  for (const e of sim.events) {
    const k = FB[e.type];
    if (k && e.pid && owner.has(e.pid)) {
      const msg = e.type === 'buy' ? e.what : e.type === 'deny' ? e.msg : e.type === 'dry' ? 'Out of ammo!'
        : e.type === 'undo' ? e.what : e.type === 'note' ? e.msg : '';
      send(owner.get(e.pid), { t: 'fb', p: e.pid, k, msg });
    }
    if (pending.length < 600) pending.push(e);
    if (e.type === 'dawn' && !e.first) autosave = true;
    if (e.type === 'over') dropAutosave();
  }
  sim.events.length = 0;
  if (autosave) { autosave = false; writeSave(autoId(), true); }
}

function meta() {
  const m = { diff: sim.difficulty, dev: sim.dev, paused, speed, v: PROTO, build: BUILD, now: Date.now() };
  if (sim.phase === 'lobby') { m.saves = saveList; m.leader = leader(); m.roster = lobbyRoster(); }
  if (sim.phase === 'over') {
    m.over = { nights: sim.stats.nights, kills: sim.stats.kills, reason: sim.stats.reason || 'dead',
      scores: sim.players.map((p) => ({ name: p.name, color: p.color, kills: p.kills, earned: Math.floor(p.earned) })) };
  }
  return m;
}
function sendWorld() {
  const evs = pending; pending = [];
  const viewers = [...conns].filter((c) => c.world);
  if (!viewers.length) return;
  const snap = NV.encode(sim, evs, seq++);
  snap.meta = meta();
  snap.ts = Date.now();                 // lets every screen buffer out Wi-Fi jitter
  const sig = NV.structSig(sim);
  const base = JSON.stringify(snap);
  let withS = null;
  for (const c of viewers) {
    if (c.sSig !== sig) {
      if (!withS) { snap.S = NV.encodeStructs(sim); withS = JSON.stringify(snap); }
      send(c, withS); c.sSig = sig;
    } else send(c, base);
  }
}
function sendStates(now) {
  const lobby = sim.phase === 'lobby';
  const roster = lobby ? lobbyRoster() : sim.active().map((p) => ({ id: p.id, name: p.name, color: p.color }));
  const lead = leader();
  for (const [pid, c] of owner) {
    const p = sim.getPlayer(pid);
    if (!p || p.away) continue;
    const st = sim.padState(p);
    st.p = pid; st.paused = paused; st.speed = speed; st.v = PROTO; st.code = BUILD; st.roster = roster;   // not 'build': that is the player's selected build tool
    st.devMoney = sim.dev.money; st.devNight = sim.dev.startNight; st.devWyrm = !!sim.dev.wyrm; st.now = Date.now();
    if (lobby) { st.saves = saveList; st.leader = lead; st.host = isHost(c); }
    const key = JSON.stringify(st, (k, v) => (k === 'now' ? undefined : v));
    const prev = c.stSent[pid];
    if (prev && prev.json === key && now - prev.at < 2000) continue;
    c.stSent[pid] = { json: key, at: now };
    send(c, JSON.stringify(st));
  }
}

// ---------------------------------------------------------------- live updates
// Edit a file while a round is running and it applies right away:
// - game rules (data.js, sim.js, netview.js): the running game is snapshotted exactly like a save, the new code is
//   loaded and the snapshot restored into it. The round carries on (shots in flight, fire and tar are dropped).
// - page code (render, audio, menus...): every open page reloads itself and its players sign straight back in.
// If the new code breaks, the game keeps running on the old code. server.js itself still needs a restart.
// Turn it off with LIVE=0.
const RULE_FILES = ['data.js', 'sim.js', 'netview.js'].map((f) => path.join(PUBLIC, 'js', f));
let rollback = null, updErrAt = 0;
function safeUpdate() {
  try { sim.update(STEP); }
  catch (e) {
    if (rollback) {                       // the freshly loaded code blew up: go back to what was running
      console.error('live update failed while running, rolling back:', e);
      ({ sim, GD, Sim, NV } = rollback); rollback = null;
      for (const c of conns) { c.stSent = {}; c.sSig = ''; }
      note('Live update broke the game (' + String(e.message).slice(0, 80) + '), so the old code is back');
    } else if (Date.now() - updErrAt > 5000) { updErrAt = Date.now(); console.error('game update error:', e); }
  }
}
function reloadRules() {
  const prev = { sim, GD, Sim, NV };
  for (const f of RULE_FILES) delete require.cache[require.resolve(f)];
  let G2, S2, N2;
  try { G2 = require(RULE_FILES[0]); S2 = require(RULE_FILES[1]).Sim; N2 = require(RULE_FILES[2]); }
  catch (e) {
    console.error('live update: new code does not load:', e);
    for (const f of RULE_FILES) delete require.cache[require.resolve(f)];
    note('Live update skipped, the new code has an error: ' + String(e.message).split('\n')[0].slice(0, 90));
    return false;
  }
  try {
    const ns = new S2();
    ns.difficulty = sim.difficulty; ns.dev = sim.dev;
    ns.players = sim.players;                       // same survivor objects: owners, inputs and ids carry over
    if (sim.phase === 'day' || sim.phase === 'night') {
      const state = JSON.parse(JSON.stringify(sim.serialize()));
      if (!ns.load(state)) throw new Error('the running game could not be restored');
    } else {
      ns.phase = sim.phase; ns.stats = sim.stats; ns.night = sim.night;
    }
    ({ sim, GD, Sim, NV } = { sim: ns, GD: G2, Sim: S2, NV: N2 });
    rollback = prev;
    setTimeout(() => { if (rollback === prev) rollback = null; }, 10000);     // it ran fine for a while: keep it
    for (const c of conns) { c.stSent = {}; c.sSig = ''; }
    return true;
  } catch (e) {
    console.error('live update failed:', e);
    note('Live update skipped: ' + String(e.message).slice(0, 90));
    return false;
  }
}
if (process.env.LIVE !== '0') {
  let timer = null, rules = false, serverChanged = false;
  const changed = (file) => {
    if (!file) return;
    const full = path.isAbsolute(file) ? file : path.join(PUBLIC, file);
    if (RULE_FILES.includes(full)) rules = true;
    clearTimeout(timer);
    timer = setTimeout(() => {                       // wait for the burst of saves to settle
      const before = BUILD;
      BUILD = codeHash();
      const r = rules; rules = false;
      let ok = true;
      if (r) ok = reloadRules();
      if (!ok) { BUILD = before; return; }          // keep pages on the code that is actually running
      if (BUILD !== before) {
        console.log('live update: ' + (r ? (ok ? 'game rules reloaded, ' : 'game rules NOT reloaded, ') : '') + 'pages reloading');
        if (ok || !r) note(r ? 'Live update: new game rules are in. Screens are refreshing.' : 'Live update: screens are refreshing.');
      }
    }, 900);
  };
  try {
    fs.watch(PUBLIC, { recursive: true }, (ev, file) => { if (file && /\.(js|html|css)$/.test(file)) changed(file); });
    fs.watch(__filename, () => {
      if (serverChanged) return;
      serverChanged = true;
      if (process.env.LE_SUPERVISED === '1') { setTimeout(handOver, 900); return; }   // let the burst of saves settle
      console.log('server.js changed: restart the server to apply it');
      note('server.js changed: restart the server (Ctrl+C, npm start) to apply that part');
      setTimeout(() => { serverChanged = false; }, 5000);
    });
  } catch (e) { console.error('live updates are off (cannot watch files):', e.message); }
}

// server.js itself changed (under the npm start launcher): save the exact running game, then exit so the launcher
// starts the new code, which picks the game straight back up. Screens reconnect and sign their players back in.
const LIVE_FILE = path.join(SAVE_DIR, '.live-handover.json');
function handOver() {
  try { new Function(fs.readFileSync(__filename, 'utf8').replace(/^#!.*\n/, '')); }
  catch (e) { console.error('server.js has an error, not restarting:', e.message); note('server.js change has an error, not applied: ' + String(e.message).slice(0, 80)); return; }
  try {
    fs.mkdirSync(SAVE_DIR, { recursive: true });
    const live = { at: Date.now(), port: PORT, paused, speed, curAuto, leaderId, state: (sim.phase === 'day' || sim.phase === 'night') ? sim.serialize() : null,
      diff: sim.difficulty, dev: sim.dev };
    fs.writeFileSync(LIVE_FILE, JSON.stringify(live));
  } catch (e) { console.error('could not save the game for the restart:', e.message); return; }
  note('Server update: back in a second, the game carries on');
  setTimeout(() => process.exit(75), 300);
}
// picking the game back up after a hand-over
(function resumeHandOver() {
  let live = null;
  try { live = JSON.parse(fs.readFileSync(LIVE_FILE, 'utf8')); fs.unlinkSync(LIVE_FILE); } catch (e) { return; }
  if (!live || Date.now() - live.at > 5 * 60 * 1000) return;
  if (live.port && !PORT_FIXED) PORT = live.port;          // come back on the same address
  sim.difficulty = live.diff || sim.difficulty; sim.dev = Object.assign(sim.dev, live.dev || {});
  if (live.state && sim.load(live.state)) {           // everyone is "away" until their screen reconnects a moment later
    curAuto = live.curAuto || curAuto; leaderId = live.leaderId || null;
    speed = live.speed || 1; paused = !!live.paused;
    console.log('Picked the running game back up after a server update (night ' + sim.night + ').');
  }
})();

const STEP = 1 / 60;
let last = process.hrtime.bigint(), acc = 0, worldAt = 0, stAt = 0;
setInterval(() => {
  const t = process.hrtime.bigint();
  let dt = Number(t - last) / 1e9;
  last = t;
  if (dt > 0.25) dt = 0.25;
  if (sim.phase !== 'day' && sim.phase !== 'night') paused = false;
  if (!paused) {
    acc += dt * speed;
    let n = 0;
    const most = 6 * speed, t0 = Date.now();
    // at high speeds a heavy night may need more steps than the computer can run: take what fits in 12 ms and drop
    // the rest (it simply runs as fast as it can) rather than stalling inputs and snapshots
    while (acc >= STEP && n < most && (n < 6 || Date.now() - t0 < 12)) { safeUpdate(); routeEvents(); acc -= STEP; n++; }
    if (n === most || acc >= STEP) acc = 0;
  } else routeEvents();
  const now = Date.now();
  if (now - worldAt >= 50) { worldAt = now; sendWorld(); }
  if (now - stAt >= 100) { stAt = now; sendStates(now); }
}, 8);

// ---------------------------------------------------------------- connections
const wss = new WebSocketServer({ server, path: '/ws', maxPayload: 256 * 1024 });
wss.on('connection', (ws, req) => {
  const q = new URL(req.url, 'http://x').searchParams;
  const id = String(q.get('id') || '').slice(0, 40);
  if (!/^[a-zA-Z0-9_-]{6,40}$/.test(id)) { ws.close(); return; }
  // a newer tab with the same id takes over (e.g. the phone reloaded)
  for (const o of conns) if (o.id === id) { o.replaced = true; try { o.ws.close(); } catch (e) { /* ignore */ } }
  const c = { ws, id, pids: new Set(), world: false, screen: false, sSig: '', stSent: {}, alive: true };
  conns.add(c);
  ws.on('pong', () => { c.alive = true; });
  ws.on('error', () => {});
  send(c, { t: 'host', up: true, v: PROTO });
  ws.on('message', (raw) => {
    let m; try { m = JSON.parse(raw); } catch (e) { return; }
    try { onMessage(c, m); } catch (e) { console.error('message error', e); }
  });
  ws.on('close', () => {
    conns.delete(c);
    for (const pid of [...c.pids]) release(c, pid);
  });
});
// Drop devices that silently vanished (locked screen, left wifi...).
setInterval(() => {
  for (const c of conns) {
    if (!c.alive) { try { c.ws.terminate(); } catch (e) { /* ignore */ } continue; }
    c.alive = false;
    try { c.ws.ping(); } catch (e) { /* ignore */ }
  }
}, 8000);

let tries = 0;
server.on('error', (e) => {
  if (e.code === 'EADDRINUSE' && process.env.LE_RESTARTED === '1' && tries++ < 50) {
    setTimeout(() => server.listen(PORT, '0.0.0.0'), 100);    // the old server is still letting go of the port
    return;
  }
  if (e.code === 'EADDRINUSE' && !PORT_FIXED && tries++ < 20) {
    PORT++;                       // something else is on that port: quietly use the next one
    setTimeout(() => server.listen(PORT, '0.0.0.0'), 50);
    return;
  }
  if (e.code === 'EADDRINUSE') console.error(`\nPort ${PORT} is already in use. Pick another, e.g.:  PORT=4600 npm start\n`);
  else console.error(e);
  process.exit(1);
});
wss.on('error', () => {});

server.on('listening', () => {
  const line = '='.repeat(60);
  console.log(`\n${line}\n  LAST EMBER\n${line}`);
  console.log(`  Open on ANY device (phone, laptop, TV):  ${joinUrl()}`);
  console.log(`  On this computer:                        http://localhost:${PORT}`);
  console.log(`  Shared big screen (optional):            ${baseUrl()}/screen`);
  const others = lanAddresses().slice(1);
  if (others.length) console.log(`  Other addresses: ${others.map((a) => `http://${a}:${PORT}`).join('  ')}`);
  console.log(`${line}\n  Ctrl+C to stop.\n`);
});
server.listen(PORT, '0.0.0.0');
