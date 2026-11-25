// Last Ember - the Graphics settings panel, shared by the big screen and phones. Everything here is per device.
(function (root) {
  'use strict';
  const get = (k) => { try { return localStorage.getItem(k); } catch (e) { return null; } };
  const set = (k, v) => { try { localStorage.setItem(k, v); } catch (e) { /* private mode */ } };
  // el: container. getR(): the page's renderer, or null if the game picture is not running here yet. onClose: optional.
  function build(el, getR, onClose) {
    const RC = root.Renderer, AF = root.AudioFX;
    const mk = (tag, cls, txt) => { const e = document.createElement(tag); if (cls) e.className = cls; if (txt !== undefined) e.textContent = txt; return e; };
    const styleNow = () => { const v = get('le_style'); return RC.STYLES.some((o) => o.id === v) ? v : 'classic'; };
    const goreNow = () => { const g = get('le_gore'); return g === null || g === '' ? 2 : +g; };
    const soundName = (o) => {
      if (!o.sound || !AF) return 'Sound: your own choice';
      const m = (AF.musicStyles.find((q) => q.id === o.sound.music) || {}).name, g = (AF.gunStyles.find((q) => q.id === o.sound.guns) || {}).name;
      return 'Sound: ' + m + ' music, ' + g + ' guns';
    };
    function draw() {
      el.textContent = ''; el.classList.add('gfx');
      const head = mk('div'); head.style.cssText = 'display:flex;align-items:center;gap:12px';
      head.appendChild(mk('h2', '', 'Graphics')); head.appendChild(mk('span', 'lbl', 'for this device only')).style.flex = '1';
      if (onClose) { const x = mk('button', 'btn', 'Done'); x.onclick = onClose; head.appendChild(x); }
      el.appendChild(head);
      el.appendChild(mk('h3', '', 'LOOK'));
      const cards = mk('div', 'gfx-cards');
      for (const o of RC.STYLES) {
        const b = mk('button', 'gfx-card' + (o.id === styleNow() ? ' on' : ''));
        const img = mk('img'); img.src = '/img/look-' + o.id + '.jpg'; img.alt = ''; img.loading = 'lazy'; b.appendChild(img);
        b.appendChild(mk('b', '', o.name)); b.appendChild(mk('p', '', o.blurb)); b.appendChild(mk('small', '', get('le_looksound') === '0' ? 'Sound: unchanged' : soundName(o)));
        b.onclick = () => { if (AF && AF.init) AF.init(); const R = getR(); if (R) R.setStyle(o.id); else { set('le_style', o.id); RC.setTheme(o.id, true); } draw(); };
        cards.appendChild(b);
      }
      el.appendChild(cards);
      el.appendChild(mk('h3', '', 'OPTIONS'));
      const row = (title, sub, opts, cur, pick) => {
        const r = mk('div', 'gfx-row'), l = mk('div'); l.appendChild(mk('b', '', title)); l.appendChild(mk('span', '', sub)); r.appendChild(l);
        const seg = mk('div', 'gfx-seg');
        for (const [v, label] of opts) { const b = mk('button', String(v) === String(cur) ? 'on' : '', label); b.onclick = () => { pick(v); draw(); }; seg.appendChild(b); }
        r.appendChild(seg); el.appendChild(r);
      };
      row('Blood and gore', 'Full: dismemberment and lasting pools. Off: none.', [[2, 'Full'], [1, 'Reduced'], [0, 'Off']], goreNow(), (v) => { set('le_gore', String(v)); const R = getR(); if (R) R.gore = +v; });
      row('Sharpness', 'Auto lowers the resolution in heavy fights to stay smooth.', [['0', 'Auto (smooth)'], ['1', 'Always sharp']], get('le_sharp') === '1' ? '1' : '0', (v) => { set('le_sharp', v); const R = getR(); if (R) R.sharp = v === '1'; });
      row('Sound follows the look', 'Picking a look also switches music and gun sounds to suit it.', [['1', 'On'], ['0', 'Off']], get('le_looksound') === '0' ? '0' : '1', (v) => set('le_looksound', v));
    }
    draw();
    return { refresh: draw };
  }
  root.GfxMenu = { build };
})(window);
