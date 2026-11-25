# Last Ember

Couch co-op zombie defense. The game runs on the server; **any device** that opens the URL gets the main menu
and can play. A shared TV / PC screen is optional.

## Play

    npm start          (runs run.js: it restarts the server by itself, game and all, when server.js changes)

The terminal prints the address, e.g. `http://192.168.1.194:4500`. Open it on any device on the same Wi-Fi:

- **Phones / tablets** open the player view: the game is drawn on your phone, left thumb moves, right thumb aims and
  fires. The main menu (players, difficulty, dev mode, START) is right there - no PC screen needed.
- **Laptops / PCs** open the shared big screen (`/screen`): whole map, QR code for friends, and local players on
  keyboard + mouse or any number of gamepads.
- Phones can switch to "Controller only" (watch a big screen instead) from MENU.
- **Waiting room:** everyone lands in the waiting room first. The first person to join is the **host** (★): only
  the host's phone or a big screen can change difficulty / dev mode, load saves, remove players and press START.
  Everyone else taps READY; the START button shows how many are ready. The host can hand the ★ to someone else, and
  it passes on automatically if the host leaves.

Keyboard: WASD, mouse, B shop, R reload, Q/E swap, Z undo, hold and drag to build a line, right-click any build to move it, Enter ready,
N force night start, P pause (then S saves, Q quits), T game speed (1x / 2x / 3x / 5x / 10x, also the button by the pause button;
gamepad: pause, then X; phone: gear menu), M mute, F fullscreen.
Gamepads: press A to join. Left stick move, right stick aim, RT fire, Y menu, A place / grab, B cancel, X reload,
LB/RB swap (also B for the next weapon, or D-pad left/right, when not building), L3/R3 undo, Start ready, Back pause (then Y saves). A controls card under each joined gamepad shows
what every button does right now. While building, the D-pad nudges the build spot one cell at a time (hold to
repeat); flick the right stick to make the spot follow your aim again. Hold A or RT and move the spot (walk or D-pad)
to lay a whole line.

## How a round works

- **Supply drops:** you start with a small kit (Sidearm, Buzzer SMG, Boomstick; Barricade, Steel Wall, Gate, Razor Wire,
  Mine, Gun Turret; Thick Skin, Fleet Feet, Quick Hands). At the dawn after every 5th night a supply crate parachutes into
  camp with the next tier of gear (night 5: Rifle, Longshot, Lamp, Med Station, Lure, the first gun turrets, Mortar, Second
  Wind, Engineer · 10: Scorcher, Thumper, Frostbite, Bunker, Shock Fence, Spike Trap, Tesla, Sniper/Flame/Grenade/Cryo
  turrets, Deadeye · 15: Ripsaw, Minigun, Blood Trail, Warding Totem, Gravity Well, Napalm Lobber, Minigun/Saw turrets ·
  20: Arc Caster, Railspike, Arc/Rail turrets, Leviathan · 25: Hellmouth · 30: Sunlance · 50: Phoenix Pyre). The shop only lists what you
  have, plus a teaser of the next crate. Dev mode or the terminal's `unlock on` opens everything.

- Daytime has no timer. Night starts when every player presses READY.
- **Diagonal gaps:** walls that touch only at a corner are not sealed. Small zombies (up to Ironhide size) squeeze through
  slowly, clawing both walls; bigger ones tear the weaker wall down. Gaps are marked with an orange GAP tag by day.
- **Night-1 builds** also include Sandbags ($12), Mud Pit ($25), Bear Trap ($35) and Torch ($20). The shop shows the next
  supply drop greyed out with stats and prices. Gore: Full / Reduced / Off in the Audio panel (phone: gear menu).
- **Guard the campfire.** Zombies go for whatever is closest: a survivor, a Noise Lure or the campfire. If the
  horde smashes the fire out, the run is lost. It gets tougher every night and is fully restored at dawn; a bar
  under it shows its health once it is being hit.
- Zombies that bump into a turret, or run head-on into a wall, lock onto it and tear it down before moving on
  (unless a survivor comes within reach). The Abomination still spares walls; Leapers vault single walls instead.
- In daylight survivors walk straight through every wall. Gates, turrets and Med Stations can be walked through
  at any time (zombies can't).
- When the run is lost, the results screen has **View the camp** (V, Y on a gamepad) to look at the final scene,
  and **Replay last 3 s** (R, X on a gamepad) to watch what happened again. Phones in game view have the same buttons.
- A turret's **health** is the green / orange / red bar below it. Turrets never reload.
- Every player is fully healed and every structure fully repaired at dawn.
- The pause screen and the Intel tab describe every enemy coming that night.
- Building on a phone: tap to preview, drag for a line of walls, press the green button to place. Tap any build
  to Move it (anyone can move anything; only its builder can Sell it). UNDO takes back your last build or move until the night (or day) changes.
- **Flood Lamp**: zombies in its light are exposed and take 30% more damage (gold ring around them).
- **Noise Lure**: a blaring radio that zombies go for instead of you. Bait them into a killzone.
- **Gun turrets**: one for every gun (Pistol $250 up to Arc $2400). Each fires its gun on its own with infinite ammo
  and never reloads (belt-fed); you don't need to own the gun. Prices follow how much each one really kills
  (`npm run turrets` measures it). Old saves turn any Gun Mount into the turret for the gun it held.
- All turrets are grouped together in the Build tab (and after a TURRETS divider in the phone tray), cheapest
  first. Gun turrets fire at their gun's full range (the Sniper Turret reaches 1300, most of the map). Each one has
  a card explaining what it is really good at, e.g. why the Sniper Turret beats the Rifle Turret in a crowd.
- **Napalm Lobber** ($2000): lobs fuel canisters at the thickest crowd that isn't already burning; each leaves a fire
  pool for 5 s that sets alight anything walking through.
- **Burning**: 14 damage/s (42 on Juggernauts, Broodmothers and the Abomination), ignores armour, does not stack
  (more fire just restarts the timer). Lasts 3.5 s after a flame puff, 1.5 s after leaving a napalm pool.
- **Leviathan Cannon** ($10,000): shells the thickest crowd it can see, anywhere on the map (1100 damage, 210 radius,
  every 3.2 s), but it is bolted facing one way: it only fires within a 70° arc of the direction you face when you place it
  (placing is two clicks: put it down, then point the mouse where it should fire and click to lock it in; gamepad: aim
  with the right stick, A to lock; phone: aim with your right thumb, it locks after 10 s; Move it to re-aim), and never
  within 300 of itself. No friendly fire. Its counter is
  the **Smokebelcher** (from night 12): it belches black smoke the Leviathan cannot see into (other turrets can), and every
  Leviathan you own draws more of them.
- **Phoenix Pyre** ($1,000,000, unlocks after night 50): every 30 s at night it erupts in a ring of phoenix fire that sweeps
  the entire map, killing every zombie up to a Colossus outright (the Abomination shrugs off most of it), healing every
  survivor to full, repairing every build by a quarter and giving the campfire a quarter of its health back. A Disruptor's
  EMP stalls its charge.
- **Sunlance** ($100,000): an orbital beam (110 wide) that locks on to the densest crowd anywhere on the map and follows it at 280 px/s;
  everything under it takes 400 x that night's zombie toughness per second, ignoring armour, so it kills mini-bosses and
  Colossi too. Burns 14 s, rests 4 s; can't see into smoke; EMP shuts it off.
- **Directing traffic:** **Blood Trail** ($15 a cell, floor): zombies take a route up to 3x longer to walk along it.
  **Warding Totem** ($400): routes bend around it (they keep about 100 px away). Lay roads, push them off others.
- The **Leviathan**'s shells now hit harder every night from 10 (about 15,500 on night 30), so it stays a crowd-killer.
- **Hellmouth** ($50,000): a colossal flame cannon. It charges for 12 s (a ring fills around it), then erupts: for 5 s a
  950 px jet of fire sweeps across its 70° arc (bolted facing one way) and back, killing anything up to Brute size, taking about half off
  mini-bosses, setting everything alight, leaving napalm pools and lighting any tar. Damage keeps pace with the nights.
  Aimed like the Leviathan (put it down, point, click), and it waits for something to be in its arc before it erupts.
- **Gravity Well** ($1800): drags every zombie within 230 into a tight ring around it (big ones resist). No damage of its
  own: bunch them up for Grenade, Arc, Napalm, Mortar or Leviathan fire. **Spike Trap** ($140): a floor trap that impales
  whatever steps on it (ignores armour), resets every 1.2 s and wears down a little each strike.
- **Perks:** Engineer discounts walls, traps and gear only (turrets are always full price). Scavenger is gone (old saves
  get its cost refunded); **Deadeye** replaces it: each level gives your own shots a 6% chance to crit for triple damage.
- **New gear:** Frostbite ($1700: chills everything it hits to half speed), Ripsaw ($2300: sawblades that rip through
  15 zombies and ricochet off the map edge), Railspike ($4200: crosses the map through a whole line, no falloff), each
  with its own turret, and the **Shock Fence** ($160 wall that jolts and briefly stuns whatever chews on it).
- **Bunker Wall** ($380, 3000 hp): three times tougher than Steel, slightly more per hp because it packs it into one cell.
- There is no Repair tool: everything is repaired for free at dawn.

## Graphics

Each device has its own settings: **Graphics** button on the big screen (waiting room and pause menu), or
**MENU -> Graphics** on a phone. Pick a look from the picture cards; gore and sharpness are there too.
- **Classic**: the painted look.
- **Charcoal and ember**: a charcoal drawing where only fire, muzzle flash and blood keep their colour.
- **Woodcut print**: black ink cut with bone-white lines; light is rays carved out of the dark; red only for blood and eyes.
- **Stained glass**: a cathedral window of leaded panes in jewel colours; the campfire is a gold sun; damage cracks the glass.
- **Cross-stitch sampler**: the whole game embroidered on linen, one X of thread per stitch; every kill leaves a loose red thread on the cloth.
- **Shadow puppet theatre**: a lamp behind a cloth screen; everything is a black cut-out with punched holes, and shadows far from the lamp grow huge and soft.
- **A child drew this**: wax crayon stick figures on lined paper; the page is redrawn each dawn with a tally of nights and gets darker as the run goes on.
- **Bleeding watercolour**: pale washes and pencil on rough paper; night is a white fog; blood is the one strong pigment.

A look restyles the menus and the HUD lettering too, and (with **Sound follows the look** on) switches the music and
gun-sound styles to suit it. Going back to Classic restores the sound styles you had chosen yourself.

## Sound

Audio button (big screen) or the gear menu (phone): volumes, plus a choice of **gun sounds** (Realistic, Arcade
punch, Cinematic heavy, Retro 8-bit, Suppressed, Sci-fi laser, Old West, Cartoon, Cap gun) and **music** (Dark synth,
Dread drone, War drums, Horror strings, Chiptune, Synthwave, Creepy music box, Industrial, Dark choir, Requiem, Ritual,
Cathedral, Abyss, Funeral march). Choices are
kept per device. The **sound test page** (`/sounds`, linked from the start page and the Audio panel) plays every gun
one shot at a time and every soundtrack's day, night and boss music without changing your choice.

## Saving

- Save any time, day or mid-fight: pause screen -> Save game (S, or Y on a gamepad), or phone MENU -> Save game.
- The game also autosaves at every dawn, and when you quit to the main menu mid-run. Every run keeps its own
  autosave, so starting a new game never overwrites another run's (the newest 6 are kept). If everyone in a run
  dies, that run's autosave is deleted, so a lost run can't be undone (your own manual saves are kept).
- The main menu has **NEW GAME** and **RESUME GAME** (carries on from the newest save; Y on a gamepad). Any older
  save can still be picked from the Saved games list.
- Load from the main menu ("Saved games", on the big screen or a phone). A mid-fight save comes back paused.
- Everyone gets their own survivor back (same phone, or the same name on any device). A saved survivor whose
  player isn't there yet waits until someone with that name joins. New players start fresh with catch-up cash.
- Saves are files in the `saves/` folder next to `server.js`.

## Enemies

Endless nights, scaling every night, with a new enemy almost every night early on. All melee - nothing shoots.
Shambler (1), Sprinter (2), Crawler (3, slow, ignores razor wire), Brute (4, almost no knockback), Bloater (5, explodes), Abomination boss
(every 5th night: spares walls, half damage from turrets, heals if left alone, hurls survivors), Screamer (6, enrages others), Leaper (7, vaults single walls), Ironhide (8, armour), Splitter
(9), Tarborn (11, leaves tar that slows you; the tar burns, and fire runs along the trail), Gorefly (14, swarms of 8 that fly over walls and wire to your turrets), Disruptor (16, an EMP every 6 s knocks turrets within 280 offline
for 2.5 s), Colossus (22, more later: an armoured giant whose stomp batters every build around it; can't be stunned, chilled or
pulled), Juggernaut (13, charges through walls), Broodmother (15, births 3 Crawlers every 2 s and bursts into 8 when it dies), Gravecaller (20, a necromancer that hangs back
and raises the zombies that just died near it; raised ones pay nothing).

**Bonewyrm** (rare surprise from night 10: about 1 night in 5, never two nights running, never in the scouting report).
A giant bone centipede: a head and 12 body segments that follow its exact path. The body crushes survivors and walls
it drags over. Kill any segment and everything behind it breaks off and dies, lying there as a **Wyrm Husk** carcass
until dawn: small zombies climb over it (slowly), big ones chew through it, and the rest go around. Survivors can step
over it. The head gets faster and angrier with every piece it loses; kill the head and the whole body drops.
Dev mode has a "Bonewyrm every night 10+" switch to try it out.
**Gorewyrm** (rarer still, from night 25, never on a Bonewyrm night): the Bonewyrm's bigger, bloodier cousin. A 32-wide head
and 18 thick segments of raw flesh over cracked bone (about 4-5x the Bonewyrm's total health), slower, with a body that
grinds through walls and crushes survivors harder, smearing blood as it crawls. Cut it apart the same way, but every piece
that breaks off bursts open and spills a Crawler, and its carcasses are twice as tough. The dev switch brings both from night 25.
**Champions** (from night 15, up to 11% of a night): gold-ringed zombies with 1.6x health that pay double, and one trait:
Armoured (+8 armour), Swift (+45% speed) or Regenerating (heals 4% a second).
**Stuns** (Arc lightning, Tesla Coils): small zombies can be held frozen. Brutes, Ironhides and Tarborns resist (shorter stuns,
and they shrug it off after a while); the Gravecaller, Juggernaut, Broodmother, Bonewyrm and Abomination only flinch. A blue
crackling outline means it shrugged the shock off and can't be stunned for a few seconds.
From night 10 the nights ramp up harder (night 17: about twice the total zombie health it used to be; night 25: four times),
with Juggernauts and Broodmothers more common. Blood Moon nights (8, 12, 16, ...) bring 35% more zombies, faster. **Pitch-black** nights (from night 6, about 1 in 8, never
on a Blood Moon or boss night, never twice running, always in the scouting report): no moon, so outside your lights you
can't see the zombies at all, not even their eyes (nor on the phone minimap). Flood Lamps and the campfire are all you have.

## Admin terminal

Main menu on the big screen: press **`** (backtick) or the **>_** button. Type `help`. `resurrect` carries on your
last lost run from its last autosave (`graveyard` lists the last 5 lost runs, `resurrect 2` picks one). Also
`money on|off`, `cash <n>` (extra starting cash), `unlock on|off` (all gear from night 1), `night <n>`, `wyrm on|off`, `dark on|off` (pitch-black nights whenever
allowed), `diff easy|normal|hard`, `status`.
Lost runs are kept in `saves/lost/`.

## Dev mode

Main menu -> Dev mode: infinite funds, and the night to start on.

## Phones can't connect? (Windows + WSL)

Run once in an **Administrator PowerShell**:

    New-NetFirewallHyperVRule -Name LastEmber -DisplayName "Last Ember (WSL)" -Direction Inbound -VMCreatorId '{40E0AC32-46A5-438A-A0B2-2B479E8F2E90}' -Protocol TCP -LocalPorts 4500-4510 -Action Allow

## Dev

- **Live updates:** edit any file under `public/` while a round is running and it applies right away. Game-rule changes
  (`data.js`, `sim.js`, `netview.js`) are swapped in mid-round: the game is snapshotted like a save, the new code loaded and
  the snapshot restored (shots in flight, fire and tar are dropped). Page changes make every screen refresh, and its players
  sign straight back in. If the new code has an error, or crashes once running, the game keeps going on the old code and
  every screen is told why. Changes to `server.js` still need a restart. `LIVE=0 npm start` turns it off.

- `npm test` - bots play many nights, checks every enemy behaviour, undo, dev mode, the phone game view, and runs
  the real server with a scripted phone.
- `npm run balance` - early-game money per night. `npm run turrets` - damage per dollar of every turret.
- `public/js/data.js` - all numbers (weapons, structures, enemies, perks) for balance tweaks.
- `public/js/sim.js` game rules (runs on the server), `server.js` networking, `render.js` graphics, `audio.js`
  sound, `host.js` big screen, `pad.html` phone.
- An open page reloads itself when the server restarts with changed code (local players sign back in), so a
  screen can never run old scripts against a newer server.
- Graphics: the big screen lowers its drawing resolution in heavy fights to stay smooth and sharpens up again once
  things calm down. Audio panel -> Graphics: Always sharp turns that off.
- Smoothness: screens draw everyone slightly in the past between two server snapshots, with the delay following
  the Wi-Fi jitter, and drop their drawing resolution automatically if they keep missing frames.
