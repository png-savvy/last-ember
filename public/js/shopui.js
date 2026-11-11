// Shop / build menu shared by the phone controller and the keyboard player's overlay.
(function (root) {
  'use strict';
  const GD = root.GD;
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const SIDE = { N: 'north', E: 'east', S: 'south', W: 'west' };

  // Briefing for a night's enemies (also used by the pause screens).
  function intelHtml(fc) {
    if (!fc || !fc.types) return '<div class="hint">No scouting report yet.</div>';
    const sides = fc.sides.map((x) => SIDE[x]).join(' + ');
    let h = `<div class="hint"><b>Night ${fc.night}</b>: the horde comes mostly from the <b>${sides}</b>.` +
      (fc.featured !== 'walker' && GD.ZOMBIES[fc.featured] ? ` Expect lots of <b>${GD.ZOMBIES[fc.featured].name}s</b>.` : '') + '</div>' +
      (fc.dark ? '<div class="hint" style="color:#b9c4ff"><b>PITCH BLACK:</b> no moon tonight. Outside your lights you will not ' +
        'see them at all, not even their eyes. Flood Lamps and the campfire are all you have.</div>' : '') +
      (fc.blood ? '<div class="hint" style="color:#ff8a7a"><b>BLOOD MOON:</b> more of them, and faster.</div>' : '');
    for (const t of fc.types) {
      const z = GD.ZOMBIES[t];
      if (!z) continue;
      const isNew = fc.fresh && fc.fresh.indexOf(t) >= 0;
      h += `<div class="card"><div class="ctop"><b style="color:${z.color}">${z.name}</b>` +
        (isNew ? '<span class="new">NEW</span>' : '') + (fc.featured === t ? '<span class="lots">LOTS</span>' : '') +
        `</div><div class="stats"><span>${Math.round(z.hp)} hp</span><span>${z.speed < 60 ? 'slow' : z.speed > 100 ? 'fast' : 'medium'}</span></div>` +
        `<div class="cdesc" style="margin-bottom:0">${z.desc}</div></div>`;
    }
    return h;
  }

  // rootEl: container. send(action, value): called for purchases. onBuild(id): a build item was picked.
  function create(rootEl, send, onBuild) {
    let tab = 'weapons', state = null, lastHtml = '';
    rootEl.classList.add('shop');
    rootEl.innerHTML =
      '<div class="shop-tabs">' +
      '<button data-tab="weapons">Weapons</button><button data-tab="build">Build</button><button data-tab="perks">Perks</button><button data-tab="intel">Intel</button>' +
      '</div><div class="shop-body"></div>';
    const body = rootEl.querySelector('.shop-body');

    rootEl.addEventListener('click', (ev) => {
      const t = ev.target.closest('[data-tab]');
      if (t) { tab = t.dataset.tab; lastHtml = ''; body.scrollTop = 0; render(); return; }
      const b = ev.target.closest('[data-act]');
      if (!b || b.disabled) return;
      const act = b.dataset.act, v = b.dataset.v;
      if (act === 'build') { send('build', v); if (onBuild) onBuild(v); return; }
      send(act, v);
    });

    // A button: label on top, price underneath (so nothing has to squeeze onto one line).
    function btn(act, v, label, cost, money, extraClass) {
      const cant = cost > money;
      return `<button class="sbtn ${extraClass || ''} ${cant ? 'cant' : ''}" data-act="${act}" data-v="${v}">${label}` +
        (cost >= 0 ? `<span class="cost">$${GD.fmt(cost)}</span>` : '') + '</button>';
    }
    const done = (label) => `<button class="sbtn" disabled>${label}</button>`;
    function pips(n, max) {
      let s = '<span class="pips">';
      for (let i = 0; i < max; i++) s += `<i class="${i < n ? 'on' : ''}"></i>`;
      return s + '</span>';
    }

    // supply drops: only unlocked gear is listed, plus a teaser of what the next crate brings
    const open = (st, id) => GD.unlocked(id, st.night, st.unlockAll);
    function teaser(st, kinds) {
      if (st.unlockAll) return '';
      const nd = GD.nextDrop(st.night);
      if (!nd) return '';
      const ids = nd.ids.filter((id) => kinds(id));
      if (!ids.length) return '';
      return `<div class="hint teaser">&#128230; <b>Next supply drop after night ${nd.after}:</b> ${ids.map(GD.itemName).join(', ')}</div>`;
    }
    function weaponsHtml(st) {
      let h = '';
      for (const id of GD.WEAPON_ORDER) {
        const w = GD.WEAPONS[id], own = st.weapons[id];
        if (!own && !open(st, id)) continue;
        const dps = Math.round(w.dmg * w.pellets / w.cd * (own ? 1 + 0.3 * own.lvl : 1));
        const cap = w.pack * GD.MAX_PACKS;
        h += `<div class="card ${own ? 'owned' : ''} ${st.cur === id ? 'cur' : ''}">`;
        h += `<div class="ctop"><b>${w.name}</b>${own ? pips(own.lvl + 1, GD.MAX_WEAPON_LEVEL + 1) : ''}` +
          (st.cur === id ? '<span class="badge">IN HAND</span>' : '') + '</div>';
        h += '<div class="stats">' + `<span>${dps} dps</span><span>mag ${w.mag}</span>` +
          (w.infinite ? '<span>unlimited ammo</span>' : own ? `<span>ammo ${own.reserve} / ${cap}</span>` : '') +
          '</div>';
        h += `<div class="cdesc">${w.desc}</div><div class="crow">`;
        if (!own) h += btn('buy', id, 'Buy', w.cost, st.money, 'primary');
        else {
          h += st.cur === id ? done('Equipped') : btn('equip', id, 'Equip', -1, st.money);
          if (!w.infinite) h += own.reserve >= cap ? done('Ammo full') : btn('ammo', id, `+${w.pack} ammo`, w.packCost, st.money);
          h += own.lvl >= GD.MAX_WEAPON_LEVEL ? done('Max damage') : btn('upg', id, '+30% damage', GD.weaponLevelCost(id, own.lvl), st.money);
        }
        h += '</div></div>';
      }
      return h + teaser(st, (id) => !!GD.WEAPONS[id]);
    }
    function buildHtml(st) {
      const eng = st.perks.engineer || 0;
      let h = '<div class="hint">Pick something, then place it on the grid in front of you. You can build any time, even mid-fight. ' +
        'You can walk through your turrets; zombies cannot. Everything is repaired for free at dawn.</div>';
      const tile = (id, extra) => {
        const s = GD.STRUCTS[id], cost = GD.structCost(id, eng);
        return `<button class="tile ${st.build === id ? 'on' : ''} ${cost > st.money ? 'cant' : ''}" data-act="build" data-v="${id}">` +
          `<b>${s.name}</b><span class="cost">$${GD.fmt(cost)}</span><small>${extra || s.desc}</small></button>`;
      };
      const turrets = new Set(GD.TURRET_IDS);
      h += '<div class="sechead">WALLS, TRAPS &amp; SUPPORT</div><div class="grid">';
      for (const id of GD.STRUCT_ORDER) if (!turrets.has(id) && open(st, id)) h += tile(id);
      for (const id of Object.keys(GD.TOOLS)) {
        const t = GD.TOOLS[id];
        h += `<button class="tile tool ${st.build === id ? 'on' : ''}" data-act="build" data-v="${id}"><b>${t.name}</b><span class="cost">tool</span><small>${t.desc}</small></button>`;
      }
      h += '</div>';
      // every turret in one place, with how it actually works
      const B = GD.BURN;
      h += '<div class="armbox"><div class="armtitle">TURRETS</div><div class="cdesc">Turrets fire on their own, never run out of ammo ' +
        'and never reload. Gun turrets fire their gun a little weaker and slower than in your hands, at its full range. ' +
        'You do not need to own the gun. "dps" is single-target damage; read each card for what it is really good at.</div>' +
        `<div class="cdesc burnbox"><b>Burning:</b> flame puffs (Flame Turret, Scorcher) and napalm pools set zombies on fire. ` +
        `A burning zombie takes <b>${B.dps} damage per second</b>, <b>${B.dps * B.bigMul}</b> for big ones (Juggernaut, Broodmother, ` +
        'Abomination), and fire <b>ignores armour</b>. It lasts 3.5 s after a flame puff, or 1.5 s after leaving a napalm pool. ' +
        'More fire does <b>not stack</b>: it only restarts the timer, so spread fire over different crowds. Flood Lamps make it hurt 30% more.</div></div>';
      for (const id of GD.TURRET_IDS) {
        if (!open(st, id)) continue;
        const sd = GD.STRUCTS[id], cost = GD.structCost(id, eng), chips = [];
        if (sd.gun) {
          const w = GD.WEAPONS[sd.gun], T = GD.GUN_TURRET;
          chips.push(Math.round(w.dmg * w.pellets * T.dmg * (T.mul[sd.gun] || 1) / (w.cd * T.rate)) + ' dps');
          chips.push('range ' + w.range);
          if (w.kind === 'arc') chips.push('chains x' + w.chain);
          else if (w.blast) chips.push('splash');
          else if (w.kind === 'flame') chips.push('sets on fire');
          else if (w.pierce > 1) chips.push('pierces ' + (w.pierce + 1));
          if (w.knock >= 150) chips.push('knockback');
        } else if (id === 'turret') chips.push(Math.round(sd.dmg / sd.cd) + ' dps', 'range ' + sd.range);
        else if (id === 'cannon') chips.push(Math.round(sd.dmg / sd.cd) + ' dps', 'range ' + sd.range, 'splash');
        else if (id === 'tesla') chips.push(Math.round(sd.dmg / sd.cd) + ' dps x4 targets', 'range ' + sd.range, 'stuns');
        else if (id === 'napalm') chips.push(B.dps + ' dps per zombie in the fire', 'range ' + sd.range, 'fire pool ' + sd.poolT + ' s');
        h += `<div class="card tcard ${st.build === id ? 'cur' : ''}"><div class="ctop"><b>${sd.name}</b>` +
          (st.build === id ? '<span class="badge">SELECTED</span>' : '') + '</div>' +
          '<div class="stats">' + chips.map((c) => `<span>${c}</span>`).join('') + '</div>' +
          `<div class="cdesc">${GD.TURRET_INFO[id] || sd.desc}</div><div class="crow">` + btn('build', id, 'Build', cost, st.money, 'primary') + '</div></div>';
      }
      return h + teaser(st, (id) => !!GD.STRUCTS[id]);
    }
    function perksHtml(st) {
      let h = '';
      for (const id of GD.PERK_ORDER) {
        const k = GD.PERKS[id], lvl = st.perks[id] || 0;
        if (!lvl && !open(st, id)) continue;
        h += `<div class="card"><div class="ctop"><b>${k.name}</b>${pips(lvl, GD.MAX_PERK_LEVEL)}</div><div class="cdesc">${k.desc}</div><div class="crow">`;
        h += lvl >= GD.MAX_PERK_LEVEL ? done('Maxed') : btn('perk', id, 'Train', GD.perkCost(id, lvl), st.money, 'primary');
        h += '</div></div>';
      }
      h += teaser(st, (id) => !!GD.PERKS[id]);
      return h;
    }
    function render() {
      if (!state) return;
      rootEl.querySelectorAll('[data-tab]').forEach((b) => b.classList.toggle('on', b.dataset.tab === tab));
      const html = tab === 'weapons' ? weaponsHtml(state) : tab === 'build' ? buildHtml(state) : tab === 'intel' ? intelHtml(state.forecast) : perksHtml(state);
      if (html !== lastHtml) { body.innerHTML = html; lastHtml = html; }
    }
    return {
      update(st) { state = st; render(); },
      setTab(t) { tab = t; lastHtml = ''; render(); },
    };
  }

  root.ShopUI = { create, esc, intelHtml };
})(window);
