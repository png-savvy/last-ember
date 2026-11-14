// Last Ember - shared big screen. The game runs on the server; this page shows the whole map
// and lets people at this computer join with the keyboard + mouse or with gamepads.
(function () {
  'use strict';
  const GD = window.GD, AudioFX = window.AudioFX;
  const $ = (id) => document.getElementById(id);
  const canvas = $('game');
  const R = new window.Renderer(canvas);
  const PROTO = 6;
  const store = {
    get(k) { try { return localStorage.getItem(k); } catch (e) { return null; } },
    set(k, v) { try { localStorage.setItem(k, v); } catch (e) { /* private mode */ } },
  };
  let sid = store.get('le_screen');
  if (!sid || !/^[a-zA-Z0-9_-]{6,40}$/.test(sid)) {
    sid = 'scr';
    const abc = 'abcdefghijklmnopqrstuvwxyz0123456789';
    for (let i = 0; i < 12; i++) sid += abc[(Math.random() * abc.length) | 0];
    store.set('le_screen', sid);
  }
  const KB = sid + ':kb';
  const gpPid = (i) => sid + ':gp' + i;
  const mirror = new window.NetView.Mirror(null);
  const states = {};                 // pid -> latest personal state from the server (money, weapons...)
  const locals = new Map();          // slot -> name, for every local player we have registered
  let ws = null, open = false;
  const keys = new Set();
  const mouse = { x: GD.W / 2, y: GD.H / 2, down: false };
  let shopOpen = false, lastPhase = '', lastWorld = 0, staleWarned = false;

  // ------------------------------------------------------------ network

  // ---- shared clock (music on every device stays in step with the server)
  const clockSamples = [];
  function syncClock(serverNow) {
    if (typeof serverNow !== 'number') return;
    clockSamples.push(serverNow - Date.now());
    if (clockSamples.length > 60) clockSamples.shift();
  }
  AudioFX.setClock(() => Date.now() + (clockSamples.length ? Math.max.apply(null, clockSamples) : 0));
  function musicState(phase, zombies, left, fc, hasBoss) {
    const mode = phase === 'lobby' ? 'menu' : phase === 'night' ? 'night' : phase === 'over' ? 'over' : 'day';
    const intensity = phase === 'night' ? Math.min(1, Math.max(zombies / 45, left / 120)) : 0;
    // music stops while the game is paused, unless the Audio panel is open (you are choosing music there)
    const held = paused() && (phase === 'day' || phase === 'night') && !$('audioPanel').classList.contains('show');
    AudioFX.setMusic({ mode, intensity, boss: !!hasBoss, blood: !!(fc && fc.blood && phase === 'night'), paused: held });
  }
  function connect() {
    const proto = location.protocol === 'https:' ? 'wss' : 'ws';
    ws = new WebSocket(`${proto}://${location.host}/ws?id=${sid}`);
    ws.onopen = () => {
      open = true;
      send({ t: 'screen' });
      // sign this screen's keyboard / gamepad players back in: after a refresh, a reload for new code or a reconnect
      let back = null;
      try { back = JSON.parse(sessionStorage.getItem('le_locals') || 'null'); } catch (e) { back = null; }
      if (Array.isArray(back)) for (const [slot, name] of back) if (typeof slot === 'string' && /^(kb|gp\d)$/.test(slot)) setLocal(slot, true, name);
    };
    ws.onclose = () => { open = false; locals.clear(); lobbySig = ''; setTimeout(connect, 1000); };
    ws.onerror = () => {};
    ws.onmessage = (ev) => {
      let m; try { m = JSON.parse(ev.data); } catch (e) { return; }
      if (m.t === 'w') { recordReplay(ev.data, m); onWorld(m); }
      else if (m.t === 'st' && m.p) states[m.p] = m;
      else if (m.t === 'fb') feedback(m);
      else if (m.t === 'note') toast(m.msg, 3200);
      else if (m.t === 'term') termPrint(m.out || []);
      else if (m.t === 'kicked' && typeof m.p === 'string' && m.p.startsWith(sid + ':')) {
        const slot = m.p.slice(sid.length + 1);
        locals.delete(slot); saveLocals();
        if (slot === 'kb') closeShop();
        lobbySig = '';
        toast(slot === 'kb' ? 'Keyboard player removed' : 'Gamepad player removed');
      }
    };
  }
  function send(o) { if (open) { try { ws.send(JSON.stringify(o)); } catch (e) { /* reconnects */ } } }
  const act = (pid, a, v) => send({ t: 'act', p: pid, a, v });
  const gact = (a, v) => send({ t: 'act', a, v });
  function setLocal(slot, on, name) {
    if (on) locals.set(slot, name); else locals.delete(slot);
    saveLocals();
    send({ t: 'local', slot, on, name });
  }
  // remembered for this browser tab only, so a refresh does not throw your survivor out of the game
  function saveLocals() { try { sessionStorage.setItem('le_locals', JSON.stringify([...locals])); } catch (e) { /* private mode */ } }

  let pageBuild = null, fireWarnAt = -1e9;
  // ---- after a lost run: look around the final scene, or watch the last 3 seconds again
  const replay = new window.NetView.Replay(3.5);
  let overView = false, overSince = 0, rmirror = null, decalKeep = null;
  function recordReplay(raw, m) {
    const t = performance.now() / 1000;
    if (m.ph === 'over') { if (!overSince) overSince = t; else if (t - overSince > 0.7) replay.frozen = true; }
    else { overSince = 0; if (m.ph !== 'night') { if (replay.buf.length) replay.reset(); return; } }
    replay.record(raw, m, t);
  }
  function setOverView(v) {
    overView = !!v && mirror.phase === 'over';
    if (!overView) stopReplay();
    $('over').classList.toggle('show', mirror.phase === 'over' && !overView);
    $('overBar').classList.toggle('show', overView);
  }
  function startReplay() {
    if (mirror.phase !== 'over' || !replay.has()) { toast('Nothing to replay'); return; }
    stopReplay();
    setOverView(true);
    // blood and scorch marks get painted again during the replay: put the real ones back afterwards
    decalKeep = document.createElement('canvas'); decalKeep.width = R.decals.width; decalKeep.height = R.decals.height;
    decalKeep.getContext('2d').drawImage(R.decals, 0, 0);
    R.parts.length = 0; R.rings.length = 0; R.flashes.length = 0; R.texts.length = 0;
    rmirror = replay.start(performance.now() / 1000, null);
    $('replayTag').classList.add('show');
  }
  function stopReplay() {
    if (!rmirror) return;
    replay.stop(); rmirror = null;
    $('replayTag').classList.remove('show');
    if (decalKeep) { R.dctx.clearRect(0, 0, R.decals.width, R.decals.height); R.dctx.drawImage(decalKeep, 0, 0); decalKeep = null; }
    R.parts.length = 0; R.banner = null;
  }
  function onWorld(m) {
    // gaps in the snapshot stream (server or network hiccups look like a freeze even when drawing is smooth)
    { const t = performance.now(), gap = t - lastWorld; if (lastWorld && gap > 250 && !document.hidden) { (R.netLog || (R.netLog = [])).push([Math.round(t / 1000), Math.round(gap)]); if (R.netLog.length > 12) R.netLog.shift(); } }
    if (m.meta && m.meta.stalls) R.srvStalls = m.meta.stalls;
    lastWorld = performance.now();
    if (m.meta) {
      syncClock(m.meta.now);
      // the server restarted with newer code: reload this page so it runs the same scripts.
      // Local players (keyboard, gamepads) are signed back in automatically after the reload.
      if (m.meta.build) {
        if (!pageBuild) pageBuild = m.meta.build;
        else if (m.meta.build !== pageBuild && m.ph === 'night' && !(m.meta && m.meta.paused)) {
          if (!R.updWait) { R.updWait = true; toast('Update ready: it loads at dawn, so the fight is not interrupted', 3500); }
        } else if (m.meta.build !== pageBuild) {
          pageBuild = m.meta.build;
          location.reload();
          return;
        }
      }
    }
    const evs = mirror.apply(m, performance.now() / 1000);
    for (const e of evs) {
      R.handle(e, mirror); AudioFX.event(e);
      if (e.type === 'fireHit' && performance.now() - fireWarnAt > 8000) { fireWarnAt = performance.now(); toast('The campfire is under attack!', 2200); }
    }
    if (mirror.meta && mirror.meta.v !== PROTO && !staleWarned) { staleWarned = true; toast('This page is out of date - press F5 to reload'); }
  }

  let toastT = 0;
  function toast(msg, ms) {
    const t = $('toast');
    t.textContent = msg; t.classList.add('show');
    clearTimeout(toastT);
    toastT = setTimeout(() => t.classList.remove('show'), ms || 1500);
  }
  function feedback(m) {
    if (m.k === 'deny') { AudioFX.play('deny'); toast(m.msg); }
    else if (m.k === 'buy') AudioFX.play('buy');
    else if (m.k === 'info') toast(m.msg);
    else if (m.k === 'dry') AudioFX.play('dry');
  }

  // ------------------------------------------------------------ keyboard + mouse player
  const kbOn = () => locals.has('kb');
  const kbName = () => ($('kbName').value.trim().slice(0, 14) || 'Keyboard');
  $('kbName').value = store.get('le_kbname') || '';
  $('kbName').addEventListener('change', () => {
    store.set('le_kbname', $('kbName').value.trim().slice(0, 14));
    if (kbOn()) { setLocal('kb', false); setLocal('kb', true, kbName()); }   // rename
  });
  $('kbName').addEventListener('keydown', (e) => e.stopPropagation());     // typing a name must not move/shoot
  const kbMe = () => mirror.getPlayer(KB);
  function toggleKb() {
    AudioFX.init();
    setLocal('kb', !kbOn(), kbName());
  }
  let inAt = 0;
  function kbInput(now) {
    const p = kbMe();
    if (!kbOn() || !p || now - inAt < 30) return;
    inAt = now;
    const h = (k) => keys.has(k);
    const block = shopOpen || paused();
    const mx = block ? 0 : ((h('d') || h('arrowright') ? 1 : 0) - (h('a') || h('arrowleft') ? 1 : 0));
    const my = block ? 0 : ((h('s') || h('arrowdown') ? 1 : 0) - (h('w') || h('arrowup') ? 1 : 0));
    const st = states[KB];
    const building = !!(st && st.build);
    send({ t: 'in', p: KB, mx, my, aim: Math.atan2(mouse.y - p.y, mouse.x - p.x), fire: mouse.down && !block && !building, assist: false,
      bx: building ? mouse.x : undefined, by: building ? mouse.y : undefined });
  }
  const shop = window.ShopUI.create($('kbShopBody'), (a, v) => act(KB, a, v), () => closeShop());
  const inGame = () => mirror.phase === 'day' || mirror.phase === 'night';
  const paused = () => !!(mirror.meta && mirror.meta.paused);
  function openShop() {
    const st = states[KB];
    if (!st || st.down || !inGame()) return;
    shopOpen = true; mouse.down = false;
    $('kbshop').classList.add('show');
    refreshShop();
  }
  function closeShop() { shopOpen = false; $('kbshop').classList.remove('show'); }
  function refreshShop() {
    const st = states[KB];
    if (!shopOpen) return;
    if (!st || st.down || !inGame()) { closeShop(); return; }
    shop.update(st);
    $('kbMoney').textContent = '$' + GD.fmt(st.money);
  }
  $('kbClose').onclick = closeShop;
  $('kbshop').addEventListener('mousedown', (e) => { if (e.target === $('kbshop')) closeShop(); });

  function setMouse(e) {
    const w = R.toWorld(e.clientX, e.clientY); mouse.x = w.x; mouse.y = w.y;
    R.hudPointer = { x: (e.clientX - R.cssOx) / R.cssScale, y: (e.clientY - R.cssOy) / R.cssScale };   // for panels that fade under the mouse
  }
  document.addEventListener('mouseleave', () => { R.hudPointer = null; });
  window.addEventListener('mousemove', setMouse);
  // ---- drag a line of builds: hold the place button and sweep across cells (mouse or gamepad)
  // Only for real builds (not tools, not a carried build, not the Leviathan), and only when the first cell was empty, so
  // starting on an existing build still picks it up. Cells already built on are skipped.
  const cellOf = (x, y) => ({ cx: Math.floor(x / GD.CELL), cy: Math.floor(y / GD.CELL) });
  function canDrag(st, c) {
    const d = st && st.build && GD.STRUCTS[st.build];
    return !!d && !d.husk && !d.aimed && !st.carry && !st.aimLev && mirror.canPlace(c.cx, c.cy);
  }
  // cells from a to b (a excluded), stepping one cell at a time with no diagonal gaps, so a wall line is solid
  function lineCells(a, b) {
    const out = [];
    let x = a.cx, y = a.cy, err = Math.abs(b.cx - x) - Math.abs(b.cy - y);
    const dx = Math.abs(b.cx - x), dy = Math.abs(b.cy - y), sx = Math.sign(b.cx - x), sy = Math.sign(b.cy - y);
    while ((x !== b.cx || y !== b.cy) && out.length < 200) {
      const stepX = y === b.cy || (x !== b.cx && 2 * err > -dy);      // one axis per step: never a diagonal hop
      if (stepX) { err -= dy; x += sx; } else { err += dx; y += sy; }
      out.push([x, y]);
    }
    return out;
  }
  function dragTo(pid, st, drag, c) {
    if (c.cx === drag.cx && c.cy === drag.cy) return;
    const cells = lineCells(drag, c);
    drag.cx = c.cx; drag.cy = c.cy;
    if (cells.length) act(pid, 'placeMany', { id: drag.id, cells });
  }
  let kbDrag = null;
  canvas.addEventListener('mousedown', (e) => {
    AudioFX.init();
    setMouse(e);
    if (!kbOn()) return;
    if (shopOpen) { closeShop(); return; }          // the shop no longer covers the map: a click on the map closes it
    const st = states[KB];
    if (e.button === 2) {
      if (st && st.build) act(KB, 'build', '');
      else act(KB, 'grab', { x: mouse.x, y: mouse.y });
      return;
    }
    if (e.button !== 0) return;
    if (st && st.build) {
      const c = cellOf(mouse.x, mouse.y);
      kbDrag = canDrag(st, c) ? { cx: c.cx, cy: c.cy, id: st.build } : null;
      act(KB, 'placeAt', { x: mouse.x, y: mouse.y });
    } else mouse.down = true;
  });
  window.addEventListener('mousemove', () => {
    if (!kbDrag) return;
    const st = states[KB];
    if (!st || st.build !== kbDrag.id) { kbDrag = null; return; }
    dragTo(KB, st, kbDrag, cellOf(mouse.x, mouse.y));
  });
  window.addEventListener('mouseup', (e) => { if (e.button === 0) { mouse.down = false; kbDrag = null; } });
  window.addEventListener('blur', () => { keys.clear(); mouse.down = false; kbDrag = null; });
  canvas.addEventListener('contextmenu', (e) => e.preventDefault());
  canvas.addEventListener('wheel', (e) => { if (kbOn()) act(KB, 'swap', e.deltaY > 0 ? 1 : -1); e.preventDefault(); }, { passive: false });

  window.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z' && kbOn()) { e.preventDefault(); act(KB, 'undo'); return; }
    // ` key (by its physical position too: on US-International and many other layouts it is a "dead" key), or ~
    if ((e.code === 'Backquote' || e.key === '`' || e.key === '~') && mirror.phase === 'lobby') { e.preventDefault(); toggleTerm(); return; }
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    const k = e.key.toLowerCase();
    AudioFX.init();
    if (k === 'tab' || k === ' ' || k.startsWith('arrow')) e.preventDefault();
    if (e.repeat) return;
    keys.add(k);
    if (k === 'enter') {
      // Enter is the START / ready key: never let it also "click" whichever lobby button still has focus
      // (pressing it right after "Play on this keyboard" used to switch the keyboard player back off)
      if (e.target && e.target.tagName === 'BUTTON') { e.preventDefault(); e.target.blur(); }
      if (mirror.phase === 'lobby') gact('start');
      else if (mirror.phase === 'over') gact('again');
      else if (mirror.phase === 'day' && kbOn()) act(KB, 'ready');
      return;
    }
    if (mirror.phase === 'over') {
      if (k === 'v') setOverView(!overView);
      else if (k === 'r') startReplay();
      else if (k === 'escape') setOverView(false);
      return;
    }
    if (paused()) {
      if (k === 'p' || k === 'escape') gact('pause', false);
      else if (k === 'q') gact('quit');
      else if (k === 's') gact('save');
      return;
    }
    if (k === 'n' && mirror.phase === 'day') { gact('forceNight'); return; }
    if (k === 'p') { if (inGame()) gact('pause', true); return; }
    if (k === 't') { if (inGame()) gact('speed', 'next'); return; }
    if (k === 'm') {      // cycle: everything -> effects only -> muted -> everything
      AudioFX.init();
      if (!AudioFX.isMuted() && AudioFX.isMusicOn()) { AudioFX.setMusicOn(false); toast('Music off (effects on)'); }
      else if (!AudioFX.isMuted()) { AudioFX.setMuted(true); toast('Sound off'); }
      else { AudioFX.setMuted(false); AudioFX.setMusicOn(true); toast('Sound and music on'); }
      return;
    }
    if (k === 'f') {
      if (document.fullscreenElement) document.exitFullscreen(); else document.documentElement.requestFullscreen().catch(() => {});
      return;
    }
    if (!kbOn()) return;
    const st = states[KB];
    if (k === 'b' || k === 'tab') { if (shopOpen) closeShop(); else openShop(); return; }
    if (k === 'escape') { if (shopOpen) closeShop(); else if (st && st.build) act(KB, 'build', ''); return; }
    if (shopOpen) return;
    if (k === 'z') act(KB, 'undo');
    else if (k === 'v') act(KB, 'build', st && st.build === 'move' ? '' : 'move');
    else if (k === 'r') act(KB, 'reload');
    else if (k === 'q') act(KB, 'swap', -1);
    else if (k === 'e') act(KB, 'swap', 1);
    else if (k >= '1' && k <= '9' && st) {
      const owned = GD.WEAPON_ORDER.filter((w) => st.weapons[w]);
      if (owned[+k - 1]) act(KB, 'equip', owned[+k - 1]);
    }
  });
  window.addEventListener('keyup', (e) => keys.delete(e.key.toLowerCase()));

  // ------------------------------------------------------------ admin terminal (main menu only)
  const termHist = []; let termAt = 0;
  function termPrint(lines, cls) {
    const out = $('termOut');
    for (const l of lines) { const d = document.createElement('div'); if (cls) d.className = cls; d.textContent = l; out.appendChild(d); }
    while (out.childNodes.length > 200) out.removeChild(out.firstChild);
    out.scrollTop = out.scrollHeight;
  }
  function toggleTerm(on) {
    const show = on === undefined ? !$('term').classList.contains('show') : !!on;
    $('term').classList.toggle('show', show && mirror.phase === 'lobby');
    if (show && mirror.phase === 'lobby') {
      if (!$('termOut').childNodes.length) termPrint(['LAST EMBER admin terminal. Type help.']);
      setTimeout(() => $('termIn').focus(), 0);
    }
  }
  $('termBtn').onclick = (e) => { toggleTerm(); e.currentTarget.blur(); };
  $('termIn').addEventListener('keydown', (e) => {
    e.stopPropagation();                                  // typing here must not start the game, move or shoot
    if (e.code === 'Backquote' || e.key === '`' || e.key === 'Escape') { e.preventDefault(); toggleTerm(false); return; }
    if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
      e.preventDefault();
      termAt = Math.max(0, Math.min(termHist.length, termAt + (e.key === 'ArrowUp' ? -1 : 1)));
      e.target.value = termHist[termAt] || '';
      return;
    }
    if (e.key !== 'Enter') return;
    e.preventDefault();
    const line = e.target.value.trim(); e.target.value = '';
    if (!line) return;
    termHist.push(line); if (termHist.length > 50) termHist.shift(); termAt = termHist.length;
    termPrint(['> ' + line], 'cmd');
    if (line.toLowerCase() === 'clear') { $('termOut').textContent = ''; return; }
    if (!open) { termPrint(['Not connected to the game.']); return; }
    gact('term', line);
  });

  // ------------------------------------------------------------ menus
  $('kbBtn').onclick = (e) => { toggleKb(); e.currentTarget.blur(); };
  $('startBtn').onclick = () => { AudioFX.init(); gact('start'); };
  $('resumeRunBtn').onclick = () => { AudioFX.init(); gact('resume'); };
  $('againBtn').onclick = () => gact('again');
  $('obAgain').onclick = () => gact('again');
  $('viewBtn').onclick = () => setOverView(true);
  $('obResults').onclick = () => setOverView(false);
  $('replayBtn').onclick = () => startReplay();
  $('obReplay').onclick = () => startReplay();
  $('resumeBtn').onclick = () => gact('pause', false);
  $('quitBtn').onclick = () => gact('quit');
  $('saveBtn').onclick = () => gact('save');
  $('pauseBtn').onclick = () => gact('pause', true);
  $('speedBtn').onclick = (e) => { gact('speed', 'next'); e.currentTarget.blur(); };
  // volume sliders (this device only)
  document.querySelectorAll('[data-vol]').forEach((el) => {
    el.value = Math.round(AudioFX.getVolumes()[el.dataset.vol] * 100);
    el.addEventListener('input', () => {
      AudioFX.init();
      const v = {}; v[el.dataset.vol] = el.value / 100;
      AudioFX.setVolumes(v);
      document.querySelectorAll('[data-vol="' + el.dataset.vol + '"]').forEach((o) => { if (o !== el) o.value = el.value; });
      if (el.dataset.vol !== 'music') AudioFX.play('build');
    });
  });
  function refreshAudioBtns() {
    $('aMusic').textContent = 'Music: ' + (AudioFX.isMusicOn() ? 'ON' : 'OFF');
    $('aMute').textContent = 'Sound: ' + (AudioFX.isMuted() ? 'OFF' : 'ON');
    $('aGore').textContent = 'Gore: ' + ['Off', 'Reduced', 'Full'][R.gore];
    $('aSharp').textContent = 'Graphics: ' + (R.sharp ? 'Always sharp' : 'Auto (smooth)');
  }
  R.sharp = store.get('le_sharp') === '1';
  $('aGore').onclick = () => { R.gore = (R.gore + 2) % 3; store.set('le_gore', String(R.gore)); refreshAudioBtns(); };
  $('aSharp').onclick = () => { R.sharp = !R.sharp; store.set('le_sharp', R.sharp ? '1' : '0'); refreshAudioBtns(); };

  // ---- sound style pickers (this device): click a gun style to hear a volley, a music style to hear its night
  function buildStylePickers(gunBox, musBox, descEl, btnCls) {
    const draw = () => {
      for (const [box, list, cur, kind] of [[gunBox, AudioFX.gunStyles, AudioFX.getGunStyle(), 'gun'], [musBox, AudioFX.musicStyles, AudioFX.getMusicStyle(), 'mus']]) {
        box.textContent = '';
        for (const o of list) {
          const b = document.createElement('button');
          b.className = btnCls + (o.id === cur ? ' on' : '');
          b.textContent = o.name; b.title = o.desc;
          b.addEventListener('click', () => {
            if (kind === 'gun') { AudioFX.setGunStyle(o.id); AudioFX.previewGuns(o.id); }
            else AudioFX.previewMusic(o.id, 'night', true);
            draw();
          });
          box.appendChild(b);
        }
        if (kind === 'mus') {
          for (const md of ['day', 'night']) {
            const b = document.createElement('button');
            b.className = btnCls + ' small'; b.textContent = '▶ hear ' + md;
            b.addEventListener('click', () => AudioFX.previewMusic(null, md));
            box.appendChild(b);
          }
        }
      }
      const g = AudioFX.gunStyles.find((o) => o.id === AudioFX.getGunStyle()), m = AudioFX.musicStyles.find((o) => o.id === AudioFX.getMusicStyle());
      descEl.textContent = 'Guns · ' + g.name + ': ' + g.desc + '\nMusic · ' + m.name + ': ' + m.desc;
    };
    draw();
    return draw;
  }
  const drawStyles = buildStylePickers($('gunStyles'), $('musicStyles'), $('styleDesc'), 'btn');
  const openAudio = () => { AudioFX.init(); refreshAudioBtns(); drawStyles(); $('audioPanel').classList.add('show'); };
  $('audioBtn').onclick = openAudio;
  $('pAudioBtn').onclick = openAudio;
  $('aClose').onclick = () => $('audioPanel').classList.remove('show');
  $('aMusic').onclick = () => { AudioFX.setMusicOn(!AudioFX.isMusicOn()); refreshAudioBtns(); };
  $('aMute').onclick = () => { AudioFX.setMuted(!AudioFX.isMuted()); refreshAudioBtns(); };
  $('audioPanel').addEventListener('mousedown', (e) => { if (e.target === $('audioPanel')) $('audioPanel').classList.remove('show'); });
  let devOpen = false;
  const dev = () => (mirror.meta && mirror.meta.dev) || { money: false, startNight: 1 };
  $('devBtn').onclick = () => { devOpen = !devOpen; lobbySig = ''; };
  $('devMoney').onclick = () => gact('devMoney', !dev().money);
  $('devWyrm').onclick = () => gact('devWyrm', !dev().wyrm);
  $('pDevMoney').onclick = () => gact('devMoney', !dev().money);
  $('devMinus').onclick = () => gact('devNight', dev().startNight - 1);
  $('devPlus').onclick = () => gact('devNight', dev().startNight + 1);
  $('devMinus5').onclick = () => gact('devNight', dev().startNight - 5);
  $('devPlus5').onclick = () => gact('devNight', dev().startNight + 5);
  document.querySelectorAll('[data-diff]').forEach((b) => { b.onclick = () => gact('diff', b.dataset.diff); });

  let lobbySig = '', delAsk = '', seenIds = null;
  function saveWhen(at) {
    const d = new Date(at), today = new Date().toDateString() === d.toDateString();
    return (today ? 'Today ' : d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) + ' ') + d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
  }
  function renderSaves(list) {
    $('saves').classList.toggle('show', list.length > 0);
    const ul = $('slist');
    ul.textContent = '';
    for (const sv of list) {
      const li = document.createElement('li');
      const b = document.createElement('button'); b.className = 'btn load' + (sv.auto ? ' auto' : '');
      const t = document.createElement('span'); t.textContent = sv.label + ' · ' + ((GD.DIFFICULTY[sv.diff] || {}).name || '');
      const sm = document.createElement('small'); sm.textContent = saveWhen(sv.at) + ' · ' + (sv.names || []).join(', ');
      b.appendChild(t); b.appendChild(sm);
      b.onclick = () => gact('load', sv.id);
      const x = document.createElement('button'); x.className = 'btn del' + (delAsk === sv.id ? ' sure' : '');
      x.textContent = delAsk === sv.id ? 'Delete?' : '✕'; x.title = 'Delete this save';
      x.onclick = () => { if (delAsk === sv.id) { delAsk = ''; gact('delSave', sv.id); } else delAsk = sv.id; lobbySig = ''; };
      li.appendChild(b); li.appendChild(x);
      ul.appendChild(li);
    }
  }
  // The waiting room: every survivor who has joined, who runs the lobby (the host) and who is ready.
  function refreshLobby() {
    const m = mirror.meta || {}, d = dev();
    const ps = m.roster || mirror.players.map((p) => ({ id: p.id, name: p.name, color: p.color, ready: false, dev: 'phone' }));
    const sig = [m.diff, d.money, d.wyrm, d.startNight, devOpen, kbOn(), delAsk, m.leader, JSON.stringify(m.saves || []), JSON.stringify(ps)].join('|');
    if (sig === lobbySig) return;
    if (document.activeElement && document.activeElement.classList.contains('pnedit')) return;      // do not rebuild the list under someone typing a name
    lobbySig = sig;
    const ids = new Set(ps.map((p) => p.id));
    const fresh = seenIds ? ps.filter((p) => !seenIds.has(p.id)) : [];
    seenIds = ids;
    const ul = $('plist');
    ul.textContent = '';
    const el = (tag, cls, txt) => { const e = document.createElement(tag); if (cls) e.className = cls; if (txt !== undefined) e.textContent = txt; return e; };
    for (const p of ps) {
      const li = el('li', p.ready ? 'ready' : '');
      if (fresh.includes(p)) li.classList.add('new');
      const av = el('div', 'av');
      av.style.background = p.color; av.style.color = p.color;            // colour feeds the glow
      const ini = el('span', '', (p.name[0] || '?').toUpperCase()); ini.style.color = 'rgba(0,0,0,0.62)'; av.appendChild(ini);
      const who = el('div', 'who');
      const gpSlot = p.id.startsWith(sid + ':gp') ? p.id.slice(sid.length + 1) : null;
      if (gpSlot) {                     // a gamepad player at this screen: the name is a text box, type to rename
        const inp = el('input', 'pn pnedit'); inp.value = p.name; inp.maxLength = 14; inp.spellcheck = false; inp.autocomplete = 'off';
        inp.title = 'Click and type to rename this gamepad player';
        const commit = () => {
          const nm = inp.value.trim().slice(0, 14) || 'Pad ' + (+gpSlot.slice(2) + 1);
          store.set('le_gpname_' + gpSlot, nm);
          if (nm !== p.name && locals.has(gpSlot)) setLocal(gpSlot, true, nm);
          lobbySig = '';
        };
        inp.addEventListener('keydown', (e) => { e.stopPropagation(); if (e.key === 'Enter') inp.blur(); else if (e.key === 'Escape') { inp.value = p.name; inp.blur(); } });   // typing must not start the game
        inp.addEventListener('blur', commit);
        inp.addEventListener('focus', () => inp.select());
        who.appendChild(inp);
      } else who.appendChild(el('span', 'pn', p.name));
      const local = p.id === KB ? 'this keyboard' : p.id.startsWith(sid + ':gp') ? 'gamepad here · click the name to rename' : p.dev === 'keyboard' ? 'other screen' : p.dev;
      const pd = el('span', 'pd');
      if (p.id === m.leader) pd.appendChild(el('span', 'tagh', '★ HOST · '));
      pd.appendChild(document.createTextNode(local));
      who.appendChild(pd);
      const acts = el('div', 'acts');
      if (p.id !== m.leader) {
        const cr = el('button', 'crown', '★ Make host'); cr.title = 'Let ' + p.name + ' run the lobby from their device';
        cr.onclick = () => gact('makeHost', p.id); acts.appendChild(cr);
      }
      const x = el('button', 'kick', '✕'); x.title = 'Remove ' + p.name;
      x.onclick = () => gact('kick', p.id); acts.appendChild(x);
      li.appendChild(av); li.appendChild(who); li.appendChild(el('span', 'stt', p.ready ? 'READY ✓' : 'not ready')); li.appendChild(acts);
      ul.appendChild(li);
    }
    const slots = Math.max(GD.PLAYER_COLORS.length, ps.length + (ps.length % 2 ? 1 : 0));
    for (let i = ps.length; i < slots; i++) ul.appendChild(el('li', 'open' + (i === ps.length ? ' next' : ''), i === ps.length ? ' Waiting for a survivor...' : 'Open slot'));
    if (fresh.length) toast(fresh.map((p) => p.name).join(', ') + (fresh.length > 1 ? ' joined' : ' joined the camp'), 1600);
    const nReady = ps.filter((p) => p.ready).length, lead = ps.find((p) => p.id === m.leader);
    $('pcount').textContent = ps.length + ' / ' + GD.PLAYER_COLORS.length;
    $('lobbyStatus').textContent = !ps.length ? 'Nobody here yet. Scan the code with a phone, press A on a gamepad, or play on this keyboard.'
      : nReady === ps.length ? 'Everyone is ready.' + (lead ? ' ' + lead.name + ' (host) or this screen can start.' : '')
      : nReady + ' of ' + ps.length + ' ready. Players tap READY on their phone' + (lead ? '; ' + lead.name + ' (host) or this screen starts the game.' : '.');
    $('kbBtn').classList.toggle('on', kbOn());
    $('kbBtn').textContent = kbOn() ? 'Keyboard player: ON' : 'Play on this keyboard';
    document.querySelectorAll('[data-diff]').forEach((b) => b.classList.toggle('on', b.dataset.diff === m.diff));
    $('devBtn').classList.toggle('on', devOpen || d.money || d.startNight > 1);
    $('devRow').style.display = devOpen ? 'flex' : 'none';
    $('devMoney').textContent = 'Infinite funds: ' + (d.money ? 'ON' : 'OFF');
    $('devMoney').classList.toggle('on', d.money);
    $('devWyrm').textContent = 'Bonewyrm every night 10+: ' + (d.wyrm ? 'ON' : 'OFF');
    $('devWyrm').classList.toggle('on', !!d.wyrm);
    $('devNight').textContent = 'Start at night ' + d.startNight;
    renderSaves(m.saves || []);
    const sb = $('startBtn'), rb = $('resumeRunBtn'), newest = (m.saves || [])[0];
    sb.disabled = !ps.length;
    rb.style.display = newest ? '' : 'none';
    rb.disabled = !ps.length;
    if (newest) {
      rb.textContent = '';
      rb.appendChild(document.createTextNode('RESUME GAME'));
      const sm = document.createElement('small');
      sm.textContent = newest.label.replace(/^(Autosave|Continue) · /, '') + ' · ' + ((GD.DIFFICULTY[newest.diff] || {}).name || '') + ' · ' + saveWhen(newest.at);
      rb.appendChild(sm);
    }
    const all = ps.length > 0 && nReady === ps.length;
    sb.classList.toggle('all', all && ps.length > 1);
    sb.textContent = !ps.length ? 'Waiting for survivors...' : ps.length === 1 || all ? 'NEW GAME  (Enter)' : 'NEW GAME  (' + nReady + '/' + ps.length + ' ready)';
  }
  function showOver() {
    const o = (mirror.meta && mirror.meta.over) || { nights: 0, kills: 0, scores: [] };
    const n = o.nights;
    $('overLine').textContent = (o.reason === 'fire' ? 'The horde smashed the campfire.  ' : '') + (n <= 0 ? 'You did not make it through the first night.' : 'You survived ' + n + (n === 1 ? ' night.' : ' nights.')) +
      '  ' + o.kills + ' zombies put down on ' + GD.DIFFICULTY[(mirror.meta && mirror.meta.diff) || 'normal'].name + '.';
    const tb = $('overTable');
    tb.textContent = '';
    const head = tb.insertRow();
    ['Survivor', 'Kills', 'Cash earned'].forEach((h) => { const th = document.createElement('th'); th.textContent = h; head.appendChild(th); });
    o.scores.slice().sort((a, b) => b.kills - a.kills).forEach((p) => {
      const r = tb.insertRow();
      const c = r.insertCell(); c.textContent = p.name; c.style.color = p.color; c.style.fontWeight = '700';
      r.insertCell().textContent = p.kills;
      r.insertCell().textContent = '$' + GD.fmt(p.earned);
    });
  }
  let wasPaused = false;
  function refreshOverlays() {
    if (mirror.phase !== lastPhase) {
      lastPhase = mirror.phase;
      $('lobby').classList.toggle('show', mirror.phase === 'lobby');
      $('over').classList.toggle('show', mirror.phase === 'over');
      overView = false; stopReplay(); $('overBar').classList.remove('show');
      $('pauseBtn').style.display = inGame() ? 'block' : 'none';
      $('speedBtn').style.display = inGame() ? 'block' : 'none';
      if (mirror.phase === 'over') { showOver(); closeShop(); AudioFX.setAmbient(false); }
      if (mirror.phase === 'lobby') { lobbySig = ''; seenIds = null; R.clearWorld(); AudioFX.setAmbient(false); closeShop(); }
      else toggleTerm(false);
    }
    const pz = paused() && inGame();
    if (pz !== wasPaused) {
      wasPaused = pz;
      $('pause').classList.toggle('show', pz);
      if (pz) {
        $('pauseIntel').innerHTML = window.ShopUI.intelHtml(mirror.forecast);
        $('pauseSub').textContent = mirror.phase === 'night' ? 'Night ' + mirror.night + ' in progress' : 'Daytime - night ' + mirror.night + ' is next';
        keys.clear(); mouse.down = false;
      }
    }
    const spd = (mirror.meta && mirror.meta.speed) || 1;
    if ($('speedBtn').dataset.s !== String(spd)) { $('speedBtn').dataset.s = spd; $('speedBtn').textContent = spd > 1 ? '▶▶ ' + spd + '×' : '1×'; $('speedBtn').classList.toggle('fast', spd > 1); }
    if (pz) {
      const d = dev();
      $('pDevMoney').textContent = 'Dev: infinite funds ' + (d.money ? 'ON' : 'OFF');
      $('pDevMoney').classList.toggle('on', d.money);
    }
    if (mirror.phase === 'lobby') refreshLobby();
    $('noServer').classList.toggle('show', !open || performance.now() - lastWorld > 3000);
  }

  // ------------------------------------------------------------ gamepads (any number, plug in and press A)
  const gps = {};
  const GP_TABS = ['Weapons', 'Build', 'Perks', 'Intel'];
  function gpRows(st, tab) {
    const rows = [];
    if (tab === 0) {
      const open = (id) => GD.unlocked(id, st.night, st.unlockAll);
      for (const id of GD.WEAPON_ORDER) {
        const w = GD.WEAPONS[id], own = st.weapons[id];
        if (!own && !open(id)) continue;
        const wn = w.desc + '\nDamage ' + w.dmg + (w.pellets > 1 ? ' x' + w.pellets : '') + ' · magazine ' + w.mag + ' · range ' + w.range;
        if (!own) { rows.push({ label: 'Buy ' + w.name, cost: w.cost, act: ['buy', id], note: wn }); continue; }
        rows.push({ label: w.name + (st.cur === id ? '  (in hand)' : '  - equip'), act: ['equip', id], on: st.cur === id, note: wn });
        if (!w.infinite) {
          const cap = w.pack * GD.MAX_PACKS;
          rows.push(own.reserve >= cap ? { label: '   ammo full', dim: true } : { label: '   ammo ' + own.reserve + '/' + cap, cost: w.packCost, act: ['ammo', id] });
        }
        if (own.lvl < GD.MAX_WEAPON_LEVEL) rows.push({ label: '   +30% damage', cost: GD.weaponLevelCost(id, own.lvl), act: ['upg', id] });
      }
    } else if (tab === 1) {
      let divided = false;
      for (const id of GD.STRUCT_ORDER) {
        if (!GD.unlocked(id, st.night, st.unlockAll)) continue;
        const d = GD.STRUCTS[id], info = GD.TURRET_INFO[id];
        if (info && !divided) { divided = true; rows.push({ label: '──── TURRETS ────', dim: true }); }
        let stats = 'HP ' + d.hp;
        if (d.gun) stats += ' · range ' + GD.turretRange(id);
        else if (d.range) stats += ' · range ' + d.range;
        rows.push({ label: d.name, cost: GD.structCost(id, st.perks.engineer || 0), act: ['build', id], close: true,
          note: d.desc + '\n' + stats + (info ? '\n' + info : '') });
      }
      for (const id of Object.keys(GD.TOOLS)) rows.push({ label: GD.TOOLS[id].name + ' (tool)', act: ['build', id], close: true, note: GD.TOOLS[id].desc });
    } else if (tab === 2) {
      for (const id of GD.PERK_ORDER) {
        const lvl = st.perks[id] || 0;
        if (!lvl && !GD.unlocked(id, st.night, st.unlockAll)) continue;
        rows.push(lvl >= GD.MAX_PERK_LEVEL ? { label: GD.PERKS[id].name + '  MAX', dim: true, note: GD.PERKS[id].desc }
          : { label: GD.PERKS[id].name + '  L' + lvl, cost: GD.perkCost(id, lvl), act: ['perk', id], note: GD.PERKS[id].desc });
      }
    } else {
      const fc = st.forecast;
      if (fc && fc.types) for (const t of fc.types) if (GD.ZOMBIES[t]) rows.push({ label: GD.ZOMBIES[t].name, note: GD.ZOMBIES[t].desc, color: GD.ZOMBIES[t].color });
    }
    // a teaser of what the next supply crate brings
    const nd = !st.unlockAll && tab < 3 && GD.nextDrop(st.night);
    if (nd) {
      const ids = nd.ids.filter((id) => (tab === 0 ? GD.WEAPONS[id] : tab === 1 ? GD.STRUCTS[id] : GD.PERKS[id]));
      if (ids.length) rows.push({ label: '──── UNLOCKS NIGHT ' + (nd.after + 1) + ' ────', dim: true });
      for (const id of ids) {           // greyed out, but the note still shows what it does and costs
        const w = GD.WEAPONS[id], sd = GD.STRUCTS[id], k = GD.PERKS[id];
        rows.push({ label: '🔒 ' + GD.itemName(id), dim: true, cost: w ? w.cost : sd ? GD.structCost(id, st.perks.engineer || 0) : GD.perkCost(id, 0),
          note: 'Unlocks night ' + (nd.after + 1) + '.\n' + (w ? w.desc + '\nDamage ' + w.dmg + ' · magazine ' + w.mag + ' · range ' + w.range : sd ? sd.desc + '\nHP ' + sd.hp + (GD.TURRET_INFO[id] ? '\n' + GD.TURRET_INFO[id] : '') : k.desc) });
      }
    }
    return rows;
  }
  function gpRender(g, st, slot) {
    let el = g.el;
    if (!g.menu || !st) { if (el) el.style.display = 'none'; return; }
    if (!el) { el = g.el = document.createElement('div'); el.className = 'gpmenu'; document.body.appendChild(el); }
    const rows = gpRows(st, g.menu.tab);
    g.menu.idx = Math.max(0, Math.min(rows.length - 1, g.menu.idx));
    el.style.display = 'block';
    el.style.left = (16 + slot * 300) + 'px';
    el.style.borderColor = st.color;
    el.textContent = '';
    const add = (cls, txt) => { const d = document.createElement('div'); d.className = cls; d.textContent = txt; el.appendChild(d); return d; };
    add('gph', st.name + '   $' + GD.fmt(st.money)).style.color = st.color;
    add('gpt', 'LB <   ' + GP_TABS[g.menu.tab] + '   > RB');
    const start = Math.max(0, Math.min(rows.length - 9, g.menu.idx - 4));
    rows.slice(start, start + 9).forEach((r, i) => {
      const d = add('gpr' + (start + i === g.menu.idx ? ' sel' : '') + (r.dim || (r.cost > st.money) ? ' dim' : '') + (r.on ? ' on' : ''), r.label);
      if (r.color) d.style.color = r.color;
      if (r.cost !== undefined) { const c = document.createElement('span'); c.textContent = '$' + GD.fmt(r.cost); d.appendChild(c); }
    });
    const cur = rows[g.menu.idx];
    add('gpn', (cur && cur.note) || ' ');
    add('gpf', 'A select   B close   D-pad move');
  }
  // Controls card for a joined gamepad: what every button does right now (changes while building / carrying).
  function gpHelpLines(g, st) {
    if (mirror.phase === 'lobby') {
      const L = [['Start', 'new game']];
      if (((mirror.meta && mirror.meta.saves) || []).length) L.push(['Y', 'resume last game']);
      return L;
    }
    if (mirror.phase === 'over') return [['Start', 'back to camp'], ['X', 'replay last 3 s'], ['Y', overView ? 'results' : 'view the camp']];
    if (st.down) return [['', 'You are down: a teammate can revive you']];
    if (st.aimLev) return [['R stick', 'aim it'], ['A / RT', 'lock it in'], ['B', 'lock it in'], ['', 'it locks itself after 10 s']];
    if (st.carry) return [['D-pad', 'nudge the spot'], ['A / RT', 'put it down'], ['B', 'put it back'], ['L stick', 'walk'], ['R stick', 'spot follows aim']];
    if (st.build) {
      return [['D-pad', 'nudge the spot a cell'], ['A / RT', st.build === 'move' ? 'pick up' : st.build === 'sell' ? 'salvage' : 'place (hold to lay a line)'],
        ['B', 'stop building'], ['Y', 'build menu'], ['L3 / R3', 'undo'], ['R stick', 'spot follows aim']];
    }
    const L = [['L stick', 'move'], ['R stick', 'aim (push hard to fire)'], ['RT', 'fire'], ['X', 'reload'], ['B', 'next weapon'], ['LB / RB', 'swap gun (D-pad \u2190 \u2192 too)'],
      ['Y', 'shop & build menu'], ['A', 'pick up the build in front'], ['L3 / R3', 'undo']];
    if (mirror.phase === 'day') L.push(['Start', st.ready ? 'not ready' : 'ready for night']);
    L.push(['Back', 'pause (then X: game speed)']);
    return L;
  }
  function gpHelp(g, st, slot) {
    let el = g.help;
    const show = !g.menu && !!st && !paused();
    if (!show) { if (el) el.style.display = 'none'; return; }
    if (!el) { el = g.help = document.createElement('div'); el.className = 'gphelp'; document.body.appendChild(el); }
    const lines = gpHelpLines(g, st);
    const sig = slot + '|' + st.color + '|' + st.name + '|' + JSON.stringify(lines);
    el.style.display = 'block';
    if (el.dataset.sig === sig) return;
    el.dataset.sig = sig;
    el.style.left = (16 + slot * 300) + 'px';
    el.style.borderColor = st.color;
    el.textContent = '';
    const h = document.createElement('div'); h.className = 'gph'; h.style.color = st.color; h.textContent = st.name + ' · gamepad'; el.appendChild(h);
    for (const [k, v] of lines) {
      const r = document.createElement('div'); r.className = 'gpk';
      const b = document.createElement('b'); b.textContent = k; r.appendChild(b);
      r.appendChild(document.createTextNode(v)); el.appendChild(r);
    }
  }
  function pollGamepads(now) {
    const list = navigator.getGamepads ? navigator.getGamepads() : [];
    let slot = 0;
    for (let i = 0; i < list.length; i++) {
      const gp = list[i];
      if (!gp || !gp.connected) continue;
      const g = gps[gp.index] || (gps[gp.index] = { slot: 'gp' + gp.index, pid: gpPid(gp.index), prev: [], menu: null, el: null, ny: 0, at: 0, inAt: 0 });
      const down = (b) => !!(gp.buttons[b] && (gp.buttons[b].pressed || gp.buttons[b].value > 0.4));
      const hit = (b) => down(b) && !g.prev[b];
      const ax = (n) => gp.axes[n] || 0;
      if (hit(8) && inGame()) gact('pause', !paused());            // Back / View button
      const on = locals.has(g.slot), st = states[g.pid], me = mirror.getPlayer(g.pid);
      if (paused()) { if (g.help) g.help.style.display = 'none'; if (hit(1) || hit(9)) gact('pause', false); else if (hit(3)) gact('save'); else if (hit(2)) gact('speed', 'next'); g.prev = gp.buttons.map((b, n) => down(n)); continue; }
      // sound still blocked: any gamepad button retries (works where the browser treats it as a user action)
      if (AudioFX.state() !== 'running' && gp.buttons.some((b, n) => hit(n))) AudioFX.init();
      if (!on) {
        if (g.help) g.help.style.display = 'none';
        if (hit(0) || hit(9)) { AudioFX.init(); setLocal(g.slot, true, store.get('le_gpname_' + g.slot) || 'Pad ' + (gp.index + 1)); }
      } else if (st && me) {
        if (hit(3) && mirror.phase === 'lobby') gact('resume');
        if (mirror.phase === 'over') { if (hit(2)) startReplay(); if (hit(3)) setOverView(!overView); }
        if (hit(9)) {
          if (mirror.phase === 'lobby') gact('start'); else if (mirror.phase === 'over') gact('again'); else if (mirror.phase === 'day') act(g.pid, 'ready');
        }
        if (g.menu && (!inGame() || st.down)) g.menu = null;
        const lx = ax(0), ly = ax(1), rx = ax(2), ry = ax(3);
        const lm = Math.hypot(lx, ly), rm = Math.hypot(rx, ry);
        const ny = down(12) || ly < -0.6 ? -1 : down(13) || ly > 0.6 ? 1 : 0;      // menu up / down with repeat
        let stepY = 0;
        if (ny !== g.ny) { g.ny = ny; g.at = now + 350; stepY = ny; } else if (ny && now > g.at) { g.at = now + 110; stepY = ny; }
        let inp;
        if (g.menu) {
          inp = { mx: 0, my: 0, aim: null, fire: false, assist: true };
          if (hit(1) || hit(3)) g.menu = null;
          else {
            if (hit(4) || hit(14)) { g.menu.tab = (g.menu.tab + GP_TABS.length - 1) % GP_TABS.length; g.menu.idx = 0; }
            if (hit(5) || hit(15)) { g.menu.tab = (g.menu.tab + 1) % GP_TABS.length; g.menu.idx = 0; }
            g.menu.idx += stepY;
            const rows = gpRows(st, g.menu.tab);
            g.menu.idx = Math.max(0, Math.min(rows.length - 1, g.menu.idx));
            const r = rows[g.menu.idx];
            if (hit(0) && r && (r.act || r.acts)) { for (const a of r.acts || [r.act]) act(g.pid, a[0], a[1]); if (r.close) g.menu = null; }
          }
        } else {
          const dz = 0.22;
          const mv = lm > dz ? Math.min(1, (lm - dz) / (1 - dz)) / lm : 0;
          const building = !!(st.build && inGame() && !st.down);
          inp = { mx: lx * mv, my: ly * mv, aim: rm > 0.3 ? Math.atan2(ry, rx) : null, fire: !building && (down(7) || rm > 0.85), assist: true };
          // Building: the D-pad nudges the spot one cell at a time (hold to repeat). Until you touch the D-pad
          // the spot follows your aim; flick the right stick to hand it back to the aim.
          if (!building || st.aimLev) g.cur = null;
          else {
            const px = down(14) ? -1 : down(15) ? 1 : 0, py = down(12) ? -1 : down(13) ? 1 : 0;
            let sx = 0, sy = 0;
            if (px !== g.cdx || py !== g.cdy) { g.cdx = px; g.cdy = py; g.cAt = now + 300; sx = px; sy = py; }
            else if ((px || py) && now > g.cAt) { g.cAt = now + 90; sx = px; sy = py; }
            if (sx || sy) {
              if (!g.cur) { const c = mirror.buildCell(me); g.cur = { cx: c.cx, cy: c.cy }; }
              g.cur.cx = Math.max(1, Math.min(GD.GW - 2, g.cur.cx + sx));
              g.cur.cy = Math.max(1, Math.min(GD.GH - 2, g.cur.cy + sy));
            }
            if (g.cur && rm > 0.6) g.cur = null;
            if (g.cur) {
              // never let the spot drift off far from you: it trails along when you walk away
              const mcx = Math.floor(me.x / GD.CELL), mcy = Math.floor(me.y / GD.CELL), lim = 7;
              g.cur.cx = Math.max(mcx - lim, Math.min(mcx + lim, g.cur.cx));
              g.cur.cy = Math.max(mcy - lim, Math.min(mcy + lim, g.cur.cy));
              inp.bx = g.cur.cx * GD.CELL + GD.CELL / 2; inp.by = g.cur.cy * GD.CELL + GD.CELL / 2;
            }
          }
          if (inGame() && !st.down) {
            if (hit(3)) g.menu = { tab: st.build ? 1 : 0, idx: 0 };
            if (hit(2)) act(g.pid, 'reload');
            if (hit(4)) act(g.pid, 'swap', -1);
            if (hit(5)) act(g.pid, 'swap', 1);
            const holdPlace = building && (down(0) || down(7));
            if (!holdPlace) g.drag = null;
            else if (g.drag && !hit(0) && !hit(7)) {                      // held: lay a line as the spot moves
              if (st.build !== g.drag.id) g.drag = null;
              else dragTo(g.pid, st, g.drag, g.cur ? { cx: g.cur.cx, cy: g.cur.cy } : mirror.buildCell(me));
            }
            if (hit(0) || (building && hit(7))) {
              if (building) { const c = g.cur ? { cx: g.cur.cx, cy: g.cur.cy } : mirror.buildCell(me); g.drag = canDrag(st, c) ? { cx: c.cx, cy: c.cy, id: st.build } : null; }
              if (st.build) {
                if (g.cur) act(g.pid, 'placeAt', { x: inp.bx, y: inp.by });
                else act(g.pid, 'place');
              } else { const c = mirror.buildCell(me); act(g.pid, 'grab', { x: c.cx * GD.CELL + 20, y: c.cy * GD.CELL + 20 }); }
            }
            if (hit(1) && st.build) act(g.pid, 'build', '');
            else if (hit(1)) act(g.pid, 'swap', 1);                       // B (when not building): next weapon
            if (!building && hit(14)) act(g.pid, 'swap', -1);             // D-pad left / right: previous / next weapon
            if (!building && hit(15)) act(g.pid, 'swap', 1);
            if (hit(10) || hit(11)) act(g.pid, 'undo');
          }
        }
        if (now - g.inAt > 30) { g.inAt = now; send(Object.assign({ t: 'in', p: g.pid }, inp)); }
        gpHelp(g, st, slot);
        gpRender(g, st, slot++);
      }
      g.prev = gp.buttons.map((b, n) => down(n));
    }
  }
  window.addEventListener('gamepaddisconnected', (e) => {
    const g = gps[e.gamepad.index];
    if (!g) return;
    setLocal(g.slot, false);
    if (g.el) g.el.remove();
    if (g.help) g.help.remove();
    delete gps[e.gamepad.index];
    lobbySig = '';
  });

  // ------------------------------------------------------------ main loop
  let last = performance.now(), uiAt = 0;
  function frame(now) {
    requestAnimationFrame(frame);
    let dt = (now - last) / 1000;
    last = now;
    const rawMs = Math.round(dt * 1000);
    if (dt > 0.25) dt = 0.25;
    if (dt < 0) dt = 0;
    pollGamepads(now);
    kbInput(now);
    // log long frames (over 80 ms) so freezes can be traced: when, how long, and what was on screen
    // [page second, stall ms, of which our own drawing code took ms (the rest is the browser), zombies, builds]
    if (rawMs > 80 && !document.hidden) { (R.slowLog || (R.slowLog = [])).push([Math.round(now / 1000), rawMs, Math.round(R.lastJs || 0), mirror.zombies.length, mirror.structs.length]); if (R.slowLog.length > 12) R.slowLog.shift(); }
    mirror.step(dt, now / 1000);
    let view = mirror;
    if (rmirror) {
      for (const e of replay.step(now / 1000)) { R.handle(e, rmirror); AudioFX.event(e); }
      if (replay.playing) {
        rmirror.step(dt, now / 1000);
        view = rmirror;
        $('replayFill').style.width = (replay.progress * 100).toFixed(1) + '%';
      } else stopReplay();
    }
    if (inGame()) R.autoRes(now);
    if (!paused()) R.updateFx(dt, view);
    if (mirror.phase === 'night' && mirror.zombies.length && !paused() && Math.random() < dt * 0.5 * Math.min(1, mirror.zombies.length / 12)) {
      AudioFX.play('groan', mirror.zombies[(Math.random() * mirror.zombies.length) | 0].x);
    }
    if (now - uiAt > 150) {
      uiAt = now; refreshOverlays(); refreshShop();
      musicState(mirror.phase, mirror.zombies.length, mirror.queue.length, mirror.forecast, mirror.zombies.some((z) => z.type === 'boss' || z.type === 'wyrm' || z.type === 'gorewyrm' || z.type === 'colossus'));
    }
    const st = states[KB];
    R.safeRender(view, {
      hint: kbOn() && st && mirror.phase !== 'over' ? (st.aimLev ? 'Aiming: point the mouse where it should fire  ·  click (or Esc) to lock it in'
        : st.carry ? 'Click to put it down  ·  Esc puts it back'
        : st.build ? (st.build === 'move' ? 'Click any build to pick it up  ·  Esc to stop'
          : 'Click to place  ·  hold and drag to lay a line  ·  Right-click / Esc to stop building')
          : 'B shop & build  ·  T game speed  ·  Right-click any build to move it  ·  Z undo  ·  R reload  ·  Q/E swap  ·  Enter ready') : '',
    });
    R.lastJs = performance.now() - now;         // how long our own code took this frame (rAF time to done)
  }

  window.addEventListener('resize', () => R.resize());
  fetch('/info').then((r) => r.json()).then((info) => {
    const short = info.joinUrl.replace(/^https?:\/\//, '').replace(/\/$/, '');
    $('url').textContent = short;
    R.joinText = short;
  }).catch(() => { $('url').textContent = location.host; });

  // the browser only allows sound after a click or key press
  // Browsers only let a page make sound after a click, tap or key press ON THAT PAGE, and forget it on every reload
  // (live updates reload the page). A second PC used as a display or with a gamepad may never get one, so: keep
  // trying on every kind of input, and show a prompt for as long as sound is blocked.
  const wake = () => AudioFX.init();
  for (const ev of ['pointerdown', 'mousedown', 'touchstart', 'keydown', 'click']) window.addEventListener(ev, wake, true);
  setInterval(() => {
    const st = AudioFX.state(), off = st !== 'running' && !AudioFX.isMuted();
    $('soundHint').classList.toggle('show', off);
    if (off && navigator.userActivation && navigator.userActivation.isActive) AudioFX.init();     // e.g. a gamepad button, where the browser counts it
  }, 500);
  $('soundHint').onclick = wake;
  setInterval(() => {
    if (!open) return;
    // no pixel read-back here: reading the game canvas back from the graphics card froze the picture for a moment
    // every time (and can push the browser into slow software drawing)
    const px = null, groundA = null;
    send({ t: 'diag', d: { ua: navigator.userAgent, dpr: window.devicePixelRatio, canvas: [canvas.width, canvas.height], css: [innerWidth, innerHeight],
      slow: R.slowLog || null, net: R.netLog || null, srv: R.srvStalls || null, audio: AudioFX.debug(), act: navigator.userActivation ? [navigator.userActivation.hasBeenActive, navigator.userActivation.isActive] : null, phase: mirror.phase, night: mirror.night, dark: +R.dark.toFixed(2), hidden: document.hidden, px, groundA, diag: R.diag,
      players: mirror.players.length, zombies: mirror.zombies.length } });
  }, 15000);
  connect();
  requestAnimationFrame(frame);
  window.__game = { mirror, R, states, get sid() { return sid; } };   // handy for debugging from the console
})();
