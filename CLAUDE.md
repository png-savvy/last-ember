# Last Ember

Couch co-op top-down zombie defense. The game runs on the Node server; every device (phone, laptop, TV) is a
window into it. README.md is the player-facing reference (controls, enemies, gear, unlock tiers) — keep it in step.

## Run and test

- `npm start` runs `run.js`, a launcher that restarts `server.js` by itself when server.js changes: the server saves
  the exact running game, exits with code 75, and the new one resumes it. Port 4500 (next free one if taken).
- `npm test` = `test/bot.js` (headless bots + every enemy/build behaviour), `test/server-smoke.js`, `test/autosave.js`.
  `server-smoke` has one timing-sensitive assert ("paused from the phone") that can fail when run right after
  bot.js under load; it passes alone.
- `SEEDS=12 npm run turrets` measures turret damage per dollar (noisy: the reference Gun Turret swings ~25%).
- The owner is usually playing while changes are made. **Live updates** apply edits under `public/` to the running
  game (rules are hot-swapped via serialize/load; pages reload, but wait for dawn if a night is running). A half-tuned
  rule change lands in their fight immediately: finish and test a change before saving it into `public/js/sim.js`
  or `data.js`, and say so when a change will hit a live round.

## Layout

- `public/js/data.js` — all numbers: WEAPONS, STRUCTS, ZOMBIES, PERKS, TIERS (supply-drop unlocks), turret info text.
- `public/js/sim.js` — the rules (server-side, no DOM): flow-field pathing, zombie behaviours, builds, nights, saves.
- `public/js/netview.js` — snapshot encode (server) and `Mirror` (client stand-in for the sim) + `Replay`.
- `public/js/render.js` — canvas renderer: ground, decal layer (blood/corpses), sprites, particles, lighting, HUD.
- `public/js/audio.js` — all sound and music synthesized (gun-sound and music styles are selectable per device).
- `public/js/host.js` + `host.html` — big screen (`/screen`): keyboard/mouse and gamepad players, lobby, terminal.
- `public/pad.html` — phone view and controller. `public/js/shopui.js` — shop shared by both. `sounds.html` — sound test.
- `server.js` — networking, saves (`saves/`, lost runs in `saves/lost/`), admin terminal, live updates, hand-over.

## Things that bit us (do not repeat)

- **Wall clock steps backwards here.** Under this WSL setup `Date.now()` jumps back ~1.46 s every ~32 s. Server
  pacing, snapshot timestamps and the music clock use `steady()` in server.js (wall start + hrtime). Never pace or
  measure with `Date.now()`; test clients must use hrtime/`performance.now()` or they cannot see the gaps.
- **Never read pixels back from the game canvas** (`getImageData` on it): it stalls the GPU and caused periodic freezes.
- **Wire format uses names, not list positions**, for structure ids and guns, so a stale page cannot mislabel builds.
  Pages compare `meta.build` (a hash of `public/`) and reload when it changes.
- **Status messages:** the per-player state (`st`) has `build` = the selected build tool. Do not reuse that field name
  (a code-version field named `build` once made every screen think it was in build mode; it is `code` now).
- **Removed content must not break old saves or screens.** `GD.cleanForecast` drops unknown enemy types; `Sim.load`
  filters unknown structs/zombies and refunds retired perks (`RETIRED_PERKS`). Renderer lookups by enemy type must
  tolerate a missing type (one crash in the HUD used to blank the whole picture every frame).
- **Zombies must stay reachable:** once on the map they are clamped inside it; bullets live 300 px past the edge.
- **Browsers block audio until a click/key on that page**, and forget it on every reload; the big screen shows a
  "Sound is off" prompt and retries on any input.
- Tests that place a zombie and expect it to walk somewhere: it targets the nearest of survivor, lure **or campfire**,
  and follows the flow field cell to cell (it may pass a cell diagonally and miss a floor trap).

## Design direction (owner's preferences)

- Zombie wave tower defense at heart. Keep new systems inside the shop vocabulary (guns, builds/turrets, perks).
  No relic/event/meta-progression layers without asking first.
- Economy: Scavenger was removed and Engineer no longer discounts turrets because together they doubled late-game
  money. Supply drops unlock gear every 5 nights (start kit is deliberately small). No "pick a reward" screens.
- Gear that scales: Leviathan, Hellmouth, Sunlance and Phoenix Pyre damage follows `hpMul(night)`; big zombies resist
  stuns/knockback/chill (see `stun` in data.js). Leviathan and Hellmouth are bolted to a fixed arc (two-click aiming).
- Art goal: gritty, not cartoony. Blood comes from the dark `BLOOD`/`BILE` palettes via `goreCol`, irregular `blot`/
  `drop` shapes, directional exit spray, creeping pools, drying. Zombies use pre-rendered rot/volume sprites.
  Gore setting: Full / Reduced / Off (`R.gore`). Verify visual work with screenshots.
- Graphics styles are per device (`R.style`, `le_style` in localStorage, list in `Renderer.STYLES`, switched with
  `R.setStyle`; Classic must stay untouched). Each style has its own file `public/js/look-<id>.js` registering
  `Renderer.LOOKS[id]` with its own drawing: `zombie`, `player`, `sprite`, `struct`, `under`, `over`, `flames`
  (render.js calls them through `this.lk`). The owner rejected a first Charcoal that was only a grey filter over
  Classic art: a style must have its own hand-made art and match its concept in `docs/style-concepts*.png`; review
  each with screenshots against the concept. Charcoal also uses a CSS greyscale filter on the main canvas (fallback
  for builds without bespoke art), a stroke sheet `R.paper` above the darkness, and draws colour (flames, flying
  blood, tracers) on the fx layer. Woodcut (`look-woodcut.js`) is done the same way (it reuses `R.SHAPES` from the
  charcoal file, so load order matters). Watercolour (`look-watercolour.js`) blends the world layer onto the paper
  with CSS multiply and turns night into a pale fog (`paleNight`). A look also themes the menus (`public/looks.css`,
  keyed off `<html data-look>`), the HUD fonts (`hudFont`/`titleFont`) and, via `STYLES[].sound`, music and gun sounds
  (`Renderer.setTheme`). Settings live in the shared Graphics panel (`js/gfxmenu.js`, thumbnails in `public/img/`).
  The owner wants every new look to bring matching menus and sound. Stained glass (`look-glass.js`, style id `glass`) is done. Cross-stitch (`look-stitch.js`, id `stitch`) lays a linen sheet with X-shaped holes
  over the world (`lk.overlay` -> `R.lkLayer`) and draws kill threads onto it (`lk.event`, cleared by `lk.reset`). Queued, one at a time with his sign-off: 
  (none left: Shadow puppet theatre is `look-puppet.js`, id `puppet`; A child drew this is `look-kid.js`, id `kid`,
  which repaints the ground each dawn from `R.kidNight`). All seven looks he asked for are in.
- Blood is per look: `lk.splat(R, decalsCtx, x, y, r, bile, alpha, ang)` replaces the classic ground blood for that look
  (and switches off classic pools and landing drops); `lk.tick` runs each frame (watercolour drips). The owner singled
  out the cross-stitch threads as the model: gore should be made of the look's own medium (smears, cut wedges,
  running washes, glass shards, stitches, torn cloth, crayon scribble), not recoloured classic splats.
  The same goes for what flies off (`lk.fleck`, which also replaces classic gib chunks), the dead left on the ground
  (`lk.body`), and effect rings / lightning (`fxInk`, `fxDash`, `fxOver`). He asked for this to go further than
  realism: in the child's drawing, kills are comic POW bursts and flying doodles, not blood.
- Work token-frugally: no broad rereads, no speculative systems.

## Headless screenshots (the Chrome extension is usually not connected)

Launching Chromium through Playwright hangs on the first canvas draw. Start it yourself and attach:
`chrome --headless=new --no-sandbox --use-gl=swiftshader --disable-features=CanvasOopRasterization
--remote-debugging-port=9333 --user-data-dir=<fresh dir>` (binary in `~/.cache/ms-playwright/chromium-1248/`, needs
libnspr4/libnss3/libasound unpacked onto `LD_LIBRARY_PATH`), then `chromium.connectOverCDP('http://127.0.0.1:9333')`.
Run a test server with `PORT=4567 LIVE=0 SAVE_DIR=<scratch>`; open `/screen`; the lobby terminal (backquote) takes
`night N`, `money on`, `unlock on`; blur the terminal input before pressing Enter to start. For close-ups use a
3200x1800 viewport and crop; set `window.__game.R.dark = 0.04` just before a shot to see zombies lit.

## Git

Branch `v1`, one commit ("Last Ember v1"); everything since is uncommitted. Commits are GPG-signed and need the
owner's passphrase, so committing fails non-interactively: stage and hand the `git commit` command to the owner.
