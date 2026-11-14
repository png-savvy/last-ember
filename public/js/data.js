// Shared game definitions (used by the host simulation, the phone shop UI and tests).
(function (root) {
  'use strict';

  const WEAPONS = {
    pistol: { name: 'Sidearm', desc: 'Reliable. Never runs dry.', cost: 0, dmg: 15, cd: 0.24, mag: 12, reload: 0.55,
      spread: 0.035, speed: 950, range: 620, pellets: 1, pierce: 0, infinite: true, kind: 'bullet', knock: 40, sfx: 'pistol' },
    smg: { name: 'Buzzer SMG', desc: 'Fast and sloppy. Great early crowd control.', cost: 350, dmg: 10, cd: 0.072, mag: 34, reload: 1.3,
      spread: 0.11, speed: 950, range: 520, pellets: 1, pierce: 0, pack: 136, packCost: 40, kind: 'bullet', knock: 25, sfx: 'smg' },
    shotgun: { name: 'Boomstick', desc: 'Seven pellets. Shoves the horde back.', cost: 550, dmg: 11, cd: 0.68, mag: 6, reload: 1.7,
      spread: 0.3, speed: 900, range: 330, pellets: 7, pierce: 1, pack: 30, packCost: 45, kind: 'bullet', knock: 150, sfx: 'shotgun' },
    rifle: { name: 'Warden Rifle', desc: 'Accurate automatic. The all-rounder.', cost: 950, dmg: 24, cd: 0.105, mag: 30, reload: 1.5,
      spread: 0.045, speed: 1150, range: 720, pellets: 1, pierce: 0, pack: 120, packCost: 70, kind: 'bullet', knock: 45, sfx: 'rifle' },
    sniper: { name: 'Longshot', desc: 'Punches through a whole line of them.', cost: 1200, dmg: 140, cd: 0.85, mag: 5, reload: 1.9,
      spread: 0.004, speed: 1700, range: 1300, pellets: 1, pierce: 6, pack: 25, packCost: 60, kind: 'bullet', knock: 120, sfx: 'sniper' },
    flamer: { name: 'Scorcher', desc: 'Sets everything in a cone on fire.', cost: 1500, dmg: 5, cd: 0.04, mag: 120, reload: 2.2,
      spread: 0.16, speed: 430, range: 230, pellets: 1, pierce: 99, pack: 360, packCost: 80, kind: 'flame', knock: 0, burn: 3.5, sfx: 'flame' },
    cryo: { name: 'Frostbite', desc: 'Freezing slugs. Everything hit is chilled to half speed for 2.5 s (big ones slow less). Pierces 2.', cost: 1700, dmg: 22, cd: 0.16, mag: 24, reload: 1.8,
      spread: 0.05, speed: 900, range: 560, pellets: 1, pierce: 2, pack: 72, packCost: 90, kind: 'bullet', knock: 10, chill: 2.5, sfx: 'cryo' },
    launcher: { name: 'Thumper', desc: 'Grenade launcher. Big radius, slow reload.', cost: 1900, dmg: 150, cd: 0.9, mag: 4, reload: 2.4,
      spread: 0.02, speed: 620, range: 460, pellets: 1, pierce: 0, pack: 16, packCost: 90, kind: 'grenade', blast: 115, knock: 220, sfx: 'launcher' },
    saw: { name: 'Ripsaw', desc: 'Spinning sawblades that rip through up to 15 zombies and ricochet off the edge of the map.', cost: 2300, dmg: 60, cd: 0.55, mag: 6, reload: 2.0,
      spread: 0.02, speed: 560, range: 620, travel: 1700, pellets: 1, pierce: 14, pack: 24, packCost: 110, kind: 'bullet', knock: 60, bounce: 3, saw: true, sfx: 'saw' },
    minigun: { name: 'Reaper Minigun', desc: 'A wall of lead. Slows you while firing.', cost: 2900, dmg: 17, cd: 0.038, mag: 220, reload: 3.2,
      spread: 0.12, speed: 1100, range: 640, pellets: 1, pierce: 1, pack: 440, packCost: 150, kind: 'bullet', knock: 30, slowFire: 0.6, sfx: 'minigun' },
    arc: { name: 'Arc Caster', desc: 'Lightning that jumps between six targets.', cost: 3400, dmg: 75, cd: 0.42, mag: 14, reload: 2.0,
      spread: 0, speed: 0, range: 430, pellets: 1, pierce: 0, pack: 42, packCost: 120, kind: 'arc', chain: 6, knock: 0, sfx: 'arc' },
    rail: { name: 'Railspike', desc: 'A magnetic spike that crosses the whole map in an instant, through every zombie in a line, with no falloff.', cost: 4200, dmg: 260, cd: 1.5, mag: 3, reload: 2.6,
      spread: 0, speed: 4200, range: 2000, pellets: 1, pierce: 99, pack: 9, packCost: 160, kind: 'bullet', knock: 160, rail: true, sfx: 'rail' },
  };
  const WEAPON_ORDER = ['pistol', 'smg', 'shotgun', 'rifle', 'sniper', 'flamer', 'cryo', 'launcher', 'saw', 'minigun', 'arc', 'rail'];
  const MAX_WEAPON_LEVEL = 3;       // each level: +30% damage
  const START_PACKS = 3;           // ammo packs a newly bought gun comes with
  const MAX_PACKS = 8;              // reserve cap, in ammo packs

  const STRUCTS = {
    wood: { name: 'Barricade', desc: 'Cheap planks. Buys you seconds.', cost: 30, hp: 260, block: true, wall: true },
    steel: { name: 'Steel Wall', desc: 'Four times tougher than wood.', cost: 110, hp: 1000, block: true, wall: true },
    bunker: { name: 'Bunker Wall', desc: 'Reinforced concrete. Three times tougher than steel: one cell that holds a whole flank.', cost: 380, hp: 3000, block: true, wall: true },
    fence: { name: 'Shock Fence', desc: 'A live wire wall: every zombie that hits it takes a jolt, and small ones are stunned for a moment.', cost: 160, hp: 520, block: true, wall: true, zap: 26 },
    gate: { name: 'Gate', desc: 'Survivors walk through. The dead do not.', cost: 85, hp: 380, block: true, gate: true, wall: true },
    sandbag: { name: 'Sandbags', desc: 'The cheapest wall. Weak, but perfect for plugging a diagonal gap.', cost: 12, hp: 110, block: true, wall: true },
    mud: { name: 'Mud Pit', desc: 'Slows zombies to half speed. No damage, but it never wears out.', cost: 25, hp: 400, block: false },
    beartrap: { name: 'Bear Trap', desc: 'Clamps the first zombie that steps on it: 60 damage and held for 4 s (big ones break free sooner). Single use.', cost: 35, hp: 1, block: false, dmg: 60, hold: 4 },
    torch: { name: 'Torch', desc: 'A small light (150 radius) so you can see them coming. Zombies walk past it.', cost: 20, hp: 80, block: false, glow: 150 },
    wire: { name: 'Razor Wire', desc: 'Slows whatever crosses it to 60% speed and shreds it a little.', cost: 70, hp: 160, block: false },
    trail: { name: 'Blood Trail', desc: 'Zombies follow the smell: they take a route up to 3x longer to walk along it. Paint a road through your killzone.', cost: 15, hp: 200, block: false },
    ward: { name: 'Warding Totem', desc: 'A pole of skulls the dead will not go near: their routes bend around it (they keep about 100 px away), though nothing stops them.', cost: 400, hp: 500, block: true, wardR: 3.5 },
    spikes: { name: 'Spike Trap', desc: 'A floor trap: whatever steps on it gets impaled by steel spikes (ignores armour). Resets in 1.2 s; each strike wears it down.', cost: 140, hp: 300, block: false, dmg: 110, cd: 1.2 },
    mine: { name: 'Mine', desc: 'One loud surprise. Single use.', cost: 60, hp: 1, block: false },
    lamp: { name: 'Flood Lamp', desc: 'Floods the area with light. Zombies caught in it are exposed: they take 30% more damage.', cost: 60, hp: 120, block: true, light: 300 },
    husk: { name: 'Wyrm Husk', desc: 'A dead length of Bonewyrm. Survivors can step over it; the horde has to climb over, chew through or go around. Rots away at dawn.',
      cost: 0, hp: 500, block: true, walk: true, husk: true },
    lure: { name: 'Noise Lure', desc: 'A blaring radio. Zombies go for it instead of you until it is smashed. Bait them into a killzone.', cost: 120, hp: 600, block: true, lure: true },
    turret: { name: 'Gun Turret', desc: 'Auto-fires at anything in range. Free ammo.', cost: 500, hp: 320, block: true, walk: true, range: 340, dmg: 13, cd: 0.16 },
    cannon: { name: 'Mortar Turret', desc: 'Lobs explosive shells into crowds.', cost: 1600, hp: 380, block: true, walk: true, range: 430, dmg: 95, cd: 1.5, blast: 80 },
    tesla: { name: 'Tesla Coil', desc: 'Zaps and stuns up to four nearby zombies.', cost: 1150, hp: 300, block: true, walk: true, range: 175, dmg: 42, cd: 0.85 },
    napalm: { name: 'Napalm Lobber', desc: 'Lobs fuel canisters into the thickest crowd. Each one leaves a pool of fire for 5 seconds.',
      cost: 2000, hp: 340, block: true, walk: true, range: 470, cd: 2.4, pool: 70, poolT: 5 },
    leviathan: { name: 'Leviathan Cannon', desc: 'Colossal artillery that shells the thickest crowd anywhere on the map, but only within a 70° arc in the direction you set it facing. Its shells hit harder every night from 10.',
      cost: 10000, hp: 1600, block: true, walk: true, aimed: true, range: 2400, minRange: 300, arc: 0.61, dmg: 1100, cd: 3.2, blast: 210, flight: 1.4 },
    phoenix: { name: 'Phoenix Pyre', desc: 'The last ember, rekindled. Every 30 s at night it erupts in a ring of phoenix fire that sweeps the whole map, burning every zombie, healing every survivor and mending your camp.',
      cost: 1000000, hp: 8000, block: true, walk: true, range: 2400, charge: 30, novaSpeed: 1100, dmg: 2600, repair: 0.25 },
    sunlance: { name: 'Sunlance', desc: 'An orbital beam: a pillar of light that crawls after the densest crowd anywhere on the map and melts whatever is under it.',
      cost: 100000, hp: 3000, block: true, walk: true, range: 2400, beamR: 110, beamSpeed: 280, dmg: 400, on: 14, off: 4 },
    hellmouth: { name: 'Hellmouth', desc: 'A colossal flame cannon. Every 12 s it erupts and sweeps a 950 px jet of fire across a 70° arc it is bolted facing (you aim it when placing) and back again, burning everything in its path.',
      cost: 50000, hp: 3500, block: true, walk: true, aimed: true, range: 950, reach: 950, minRange: 40, arc: 0.61, charge: 12, sweep: 5, width: 0.2, dmg: 550, burn: 4, poolEvery: 0.2 },
    gravity: { name: 'Gravity Well', desc: 'A swirling vortex that drags every zombie within 230 into a tight ring around it. No damage: bunch them up for your splash turrets.', cost: 1800, hp: 900, block: true, walk: true, range: 230, pull: 560, hold: 70 },
    medic: { name: 'Med Station', desc: 'Heals survivors standing nearby. Survivors walk through it; the dead do not.', cost: 600, hp: 260, block: true, walk: true, range: 110 },
  };
  // A turret for every gun: fires that gun automatically, belt-fed: never runs out of ammo and never reloads.
  // Priced by how much it actually kills (see test/turrets.js), with the Gun Turret as the yardstick.
  // vs. the hand-held gun: damage and fire delay. Range is the gun's own (no cap: the Sniper Turret reaches 1300). Gun turrets are belt-fed (they never reload), so the guns
  // that used to spend a lot of their time reloading hit a bit softer to keep their value per dollar where it was
  // (mul, measured with `SEEDS=12 npm run turrets`).
  const GUN_TURRET = { dmg: 0.8, rate: 1.15,
    mul: { pistol: 1, smg: 0.85, shotgun: 1, rifle: 0.74, sniper: 1, flamer: 1, launcher: 0.76, minigun: 0.88, arc: 0.78, cryo: 1, saw: 1, rail: 1 } };
  const GT_SHORT = { pistol: 'Pistol', smg: 'SMG', shotgun: 'Shotgun', rifle: 'Rifle', sniper: 'Sniper', flamer: 'Flame',
    launcher: 'Grenade', minigun: 'Minigun', arc: 'Arc', cryo: 'Cryo', saw: 'Saw', rail: 'Rail' };
  const GT_COST = { pistol: 250, smg: 400, shotgun: 650, rifle: 700, sniper: 1500, flamer: 1500, launcher: 2000, minigun: 1600, arc: 2400, cryo: 1100, saw: 1500, rail: 1800 };
  // Burning: a flame puff (Scorcher, Flame Turret) or a napalm pool sets a zombie alight. It burns for a few
  // seconds; touching more fire only refreshes the timer, it never stacks. Fire ignores armour.
  const BURN = { dps: 14, bigMul: 3, bigR: 25 };
  const GT_IDS = [];
  for (const w of WEAPON_ORDER) {
    const id = 'gt_' + w;
    GT_IDS.push(id);
    STRUCTS[id] = { name: GT_SHORT[w] + ' Turret', desc: 'Fires a ' + WEAPONS[w].name + ' at anything in range.',
      cost: GT_COST[w], hp: 320, block: true, walk: true, gun: w };
  }
  // How each turret really works (shown under it in the shop). Numbers are for an unupgraded turret.
  const TURRET_INFO = {
    turret: 'The basic sentry. Steady stream of small bullets, shorter range (340) than any gun turret. ' +
      'One target at a time. The yardstick every other turret is priced against.',
    gt_pistol: 'Cheapest turret. Accurate, steady small hits. Good for covering a quiet side early on.',
    gt_smg: 'Fires very fast but sprays wide, so at long range many bullets miss. Best placed close to where zombies bunch up.',
    gt_shotgun: 'Seven pellets per blast, short range (330). Every blast shoves zombies back, so it holds a choke point or ' +
      'keeps them off a wall. Pellets can hit two zombies each.',
    gt_rifle: 'Accurate and fast with full range. Best single-target value for the money. Weak point: Ironhides\' armour ' +
      'eats almost half of each small bullet.',
    gt_sniper: 'Longest reach of any turret (1300): covers most of the map from one spot. Each shot pierces up to 7 zombies ' +
      'in a line and shrugs off armour.',
    gt_flamer: 'Short range (230) cone of fire that sets everything it touches burning (see Burning above). Listed dps is just the ' +
      'flames; burning adds a lot more. Put it right behind a wall where crowds pile up.',
    gt_launcher: 'Grenades explode on impact and hurt everything nearby. Fires slowly but never stops to reload. Superb against crowds, ' +
      'wasted on single runners.',
    gt_minigun: 'A very high fire rate that never lets up, with pierce through one extra zombie. ' +
      'Shreds crowds at full range.',
    gt_arc: 'Lightning never misses: each bolt jumps between up to 6 zombies (each jump 14% weaker) and briefly stuns them. ' +
      'Best when zombies are packed together. Small zombies can be held frozen; big ones resist and soon shrug it off.',
    gt_cryo: 'Chills everything it hits to half speed for 2.5 s (big zombies slow less), so crowds bunch up and stay longer in ' +
      'your killzone. Light damage on its own: pair it with the turrets that do the killing.',
    gt_saw: 'Each sawblade rips through up to 15 zombies and ricochets off the edge of the map to come back through them again.',
    gt_rail: 'Crosses the whole map in an instant, through every zombie in a line, with no falloff. Slow to fire.',
    cannon: 'Lobs a heavy explosive shell every 1.5 s. Big splash, range 430. The shell lands where the target was, so fast zombies ' +
      'can dodge it; slow crowds and big zombies cannot.',
    tesla: 'Zaps the 4 closest zombies every 0.85 s and stuns each for half a second. Short range (175). It can hold small ' +
      'zombies in place; Brutes, Ironhides and Tarborns resist, and mini-bosses only flinch before shrugging it off (blue crackle: ' +
      'immune for a few seconds). Put it where they break through.',
    leviathan: 'Every 3.2 s drops a colossal shell on the thickest crowd it can see: 1100 damage across a 210 radius, ' +
      'anywhere on the map. The catch: it is bolted facing one way and only fires within a 70° arc of the direction you face ' +
      'when you place it (pick it up with Move to re-aim). Nothing outside that arc, and nothing within 300 of it, is ever ' +
      'shelled. It cannot see into Smokebelcher smoke either, and every Leviathan you own draws more of them.',
    phoenix: 'The Rekindling. It charges for 30 s through the night (its flame grows), then erupts in a ring of phoenix fire ' +
      'that sweeps out across the entire map. Every zombie it passes takes damage that keeps pace with the nights, enough to kill ' +
      'anything up to a Colossus outright (the Abomination shrugs off most of it), and is set alight. As it erupts it heals ' +
      'every survivor to full, repairs every build by a quarter and gives the campfire a quarter of its health back. ' +
      'A Disruptor\'s EMP stalls its charge.',
    sunlance: 'Calls down an orbital beam, a pillar of white-gold light 110 wide, that locks on to the densest crowd anywhere on ' +
      'the map and follows it (280 px/s), switching only when a clearly bigger crowd appears. Everything under it takes 400 x that night\'s zombie toughness per second, ignoring armour: small ' +
      'fry and Brutes melt, and it is the one gun that kills mini-bosses and Colossi quickly. It burns for 14 s, rests for 4 s, ' +
      'cannot see into smoke, and a Disruptor\'s EMP shuts it off.',
    hellmouth: 'It charges for 12 s (the ring around it fills), then erupts: for 5 s a 950 px jet of ' +
      'fire sweeps across its 70° arc and back. Everything the jet touches takes huge damage (ignores armour, keeps pace ' +
      'with the nights: anything up to Brute size dies, mini-bosses lose about half their health) and is set burning, napalm pools are left burning along the ground, and any Tarborn tar goes up. ' +
      'It is bolted facing one way like the Leviathan (put it down, then point and click to aim it), and it waits for something ' +
      'to be in its arc before it erupts, so no charge is wasted.',
    gravity: 'Drags every zombie within 230 toward it and holds them in a tight ring 70 out, so the crowd bunches up where your ' +
      'Grenade, Arc, Napalm, Mortar and Leviathan fire does the most. Big zombies resist the pull. It does no damage itself, and ' +
      'the crowd it gathers will chew on it, so wall it in.',
    napalm: 'Every 2.4 s lobs a canister at the thickest crowd that is not already burning (range 470), leading moving targets. ' +
      'The pool burns for 5 s and sets alight anything that walks through. Fire ignores armour and is triple on big zombies, so it ' +
      'is great against Juggernauts. Burning does not stack, so two Lobbers aim at different crowds.',
  };
  // every turret, cheapest first: used to group them together in the build menus
  const TURRET_IDS = ['turret'].concat(GT_IDS, ['cannon', 'tesla', 'napalm', 'gravity', 'leviathan', 'hellmouth', 'sunlance', 'phoenix']).sort((a, b) => STRUCTS[a].cost - STRUCTS[b].cost);
  const STRUCT_ORDER = ['sandbag', 'wood', 'steel', 'bunker', 'fence', 'gate', 'mud', 'wire', 'beartrap', 'torch', 'trail', 'ward', 'spikes', 'mine', 'lamp', 'lure', 'medic'].concat(TURRET_IDS);
  const TOOLS = {
    move: { name: 'Move', desc: 'Pick up any build and put it somewhere else. Free.' },
    sell: { name: 'Salvage', desc: 'Remove a structure for a partial refund.' },
  };

  const PERKS = {
    vitality: { name: 'Thick Skin', desc: '+25 max health per level.', cost: 220 },
    agility: { name: 'Fleet Feet', desc: '+7% move speed per level.', cost: 200 },
    hands: { name: 'Quick Hands', desc: '-12% reload time per level.', cost: 200 },
    deadeye: { name: 'Deadeye', desc: 'Each level: your own shots get a 6% chance to crit for triple damage.', cost: 240 },
    regen: { name: 'Second Wind', desc: 'Slowly regenerate health.', cost: 280 },
    engineer: { name: 'Engineer', desc: 'Per level: walls, traps and gear -8% cost (turrets full price); every build +12% health.', cost: 240 },
  };
  const PERK_ORDER = ['vitality', 'agility', 'hands', 'deadeye', 'regen', 'engineer'];
  // perks that were removed: what each level cost, so a save that had them gets the money back
  const RETIRED_PERKS = { scavenger: 260 };
  const MAX_PERK_LEVEL = 5;

  const ITEMS = {};

  // from = first night it can appear. cost = spawn budget it uses. All melee: nothing shoots.
  // stun (Arc lightning, Tesla Coil): small zombies can be held frozen. Big ones resist: a stun lasts `mul` as long, and
  // once they have soaked `cap` seconds of it they shrug it off and cannot be stunned for `imm` seconds.
  const ZOMBIES = {
    walker: { name: 'Shambler', hp: 60, speed: 52, dmg: 10, r: 13, bounty: 9, cost: 1, from: 1, color: '#9fc27a',
      desc: 'Slow. Takes the shortest path to you and chews through walls.' },
    runner: { name: 'Sprinter', hp: 34, speed: 128, dmg: 7, r: 11, bounty: 11, cost: 1.2, from: 2, color: '#e0d6a8',
      desc: 'Fast and fragile. Arrives first and sprints around any gap.' },
    crawler: { name: 'Crawler', hp: 30, speed: 40, dmg: 8, r: 11, bounty: 8, cost: 0.8, from: 3, color: '#c7a07a', wireproof: true,
      desc: 'A legless torso dragging itself along. Slow, but it slips under razor wire without slowing down.' },
    brute: { name: 'Brute', hp: 460, speed: 40, dmg: 28, r: 22, bounty: 45, cost: 5, from: 4, wreck: 3, knock: 0.04, stun: { mul: 0.6, cap: 1.2, imm: 1.5 }, color: '#ff9a6e',
      desc: 'Tanky, shrugs off knockback, smashes walls three times faster.' },
    bloater: { name: 'Bloater', hp: 95, speed: 68, dmg: 0, r: 16, bounty: 16, cost: 2.5, from: 5, blast: 95, color: '#e6f06a',
      desc: 'Explodes when it touches you or a wall. Pop it at range.' },
    screamer: { name: 'Screamer', hp: 110, speed: 58, dmg: 8, r: 13, bounty: 30, cost: 3, from: 6, scream: true, color: '#f0f0ff',
      desc: 'Shrieks when it spots you: every zombie nearby goes berserk (faster, hits harder). Kill it first.' },
    leaper: { name: 'Leaper', hp: 80, speed: 78, dmg: 14, r: 12, bounty: 26, cost: 3, from: 7, leap: true, color: '#7fd0c0',
      desc: 'Vaults over single walls (a turret or lamp behind the wall does not stop it) and pounces on survivors. Build walls two thick.' },
    ironhide: { name: 'Ironhide', hp: 300, speed: 48, dmg: 20, r: 17, bounty: 40, cost: 5, from: 8, armor: 9, wreck: 2, knock: 0.3, stun: { mul: 0.6, cap: 1.2, imm: 1.5 }, color: '#b8c4d0',
      desc: 'Armour plates shrug off small bullets. Use heavy guns, fire or explosions.' },
    splitter: { name: 'Splitter', hp: 160, speed: 55, dmg: 14, r: 17, bounty: 24, cost: 3.5, from: 9, split: 3, color: '#e07ad8',
      desc: 'Bursts into three fast Splitlings when it dies.' },
    splitling: { name: 'Splitling', hp: 30, speed: 118, dmg: 6, r: 9, bounty: 3, cost: 0, from: 99, color: '#f0a0e8',
      desc: 'Small, fast leftovers of a Splitter.' },
    tarborn: { name: 'Tarborn', hp: 240, speed: 50, dmg: 16, r: 17, bounty: 36, cost: 4, from: 11, tar: true, knock: 0.6, stun: { mul: 0.6, cap: 1.2, imm: 1.5 }, color: '#8a8aa0',
      desc: 'A hulk dripping black tar. It leaves a sticky trail that slows survivors to half speed, and bursts into a big ' +
        'puddle when it dies. Tar catches fire from flames, napalm, explosions or a burning zombie, and the fire runs along the ' +
        'whole trail, setting every zombie in it alight.' },
    juggernaut: { name: 'Juggernaut', hp: 2000, speed: 40, dmg: 40, r: 28, bounty: 260, cost: 20, from: 13, armor: 6, wreck: 8, knock: 0.05, charge: true, stun: { mul: 0.3, cap: 0.5, imm: 3 }, color: '#ff6a3a',
      desc: 'Armoured mini-boss. Charges in a straight line, bulldozing through walls and survivors.' },
    broodmother: { name: 'Broodmother', hp: 1500, speed: 32, dmg: 25, r: 30, bounty: 220, cost: 18, from: 15, brood: true, wreck: 3, knock: 0.1, stun: { mul: 0.3, cap: 0.5, imm: 3 }, color: '#d0e070',
      desc: 'Swollen mini-boss that births 3 Crawlers every 2 seconds, and bursts into 8 more when it dies. Kill it fast, far from your walls.' },
    // Bonewyrm: a rare giant centipede (from night 10). A head plus a chain of body segments that follow its exact path.
    // Kill a segment and everything behind it breaks off into a carcass (a Wyrm Husk) that blocks the ground until dawn.
    wyrm: { name: 'Bonewyrm', hp: 1100, speed: 64, dmg: 34, r: 22, bounty: 320, cost: 0, from: 10, wreck: 3, knock: 0.12, stun: { mul: 0.3, cap: 0.5, imm: 3 }, color: '#e8d6a8',
      segs: 12, segGap: 25, rare: true, wyrmHead: true, segType: 'wyrmseg',
      desc: 'A giant bone centipede. Its body crushes anything it touches. Shoot a segment off and everything behind it dies and ' +
        'lies there as a carcass the horde must climb over, chew through or walk around. The head only gets faster and angrier.' },
    wyrmseg: { name: 'Bonewyrm body', hp: 230, speed: 64, dmg: 10, r: 17, bounty: 18, cost: 0, from: 999, knock: 0, stun: { mul: 0 }, color: '#d8c49a', seg: true,
      grind: 60, desc: 'A segment of the Bonewyrm. Kill it to cut the wyrm in two.' },
    // the Bonewyrm's bigger, bloodier cousin (rare, from night 25)
    gorewyrm: { name: 'Gorewyrm', hp: 4200, speed: 44, dmg: 60, r: 32, bounty: 1100, cost: 0, from: 25, wreck: 6, knock: 0.04, stun: { mul: 0.2, cap: 0.4, imm: 4 },
      color: '#c8402e', segs: 18, segGap: 34, rare: true, wyrmHead: true, segType: 'goreseg', gore: true, huskMul: 2,
      desc: 'A colossal centipede of raw flesh over cracked bone, far bigger, tougher and slower than the Bonewyrm. Its body grinds ' +
        'through walls and crushes survivors, and it smears the ground with blood. Cut it apart like a Bonewyrm, but every piece you ' +
        'cut off bursts open and spills a Crawler.' },
    goreseg: { name: 'Gorewyrm body', hp: 780, speed: 44, dmg: 24, r: 23, bounty: 40, cost: 0, from: 999, knock: 0, stun: { mul: 0 }, color: '#b0382a', seg: true,
      grind: 150, gore: true, desc: 'A segment of the Gorewyrm. Kill it to cut the wyrm in two; the pieces behind it burst into Crawlers.' },
    boss: { name: 'Abomination', hp: 3200, speed: 46, dmg: 45, r: 40, bounty: 500, cost: 0, from: 5, wreck: 1.5, knock: 0.08, stun: { mul: 0.15, cap: 0.25, imm: 4 }, color: '#ff4a4a',
      hide: 0.5, regen: 0.015,
      desc: 'Huge, and it hunts survivors, not walls. Thick hide: turrets and mines do half damage. Heals if nobody hurts it for a few seconds. ' +
        'Its ground-slam hurls survivors away, and it births Sprinters every 8 seconds. You have to fight it yourselves.' },
    // the Leviathan's counter: belches smoke the artillery cannot see through
    smoker: { name: 'Smokebelcher', hp: 280, speed: 46, dmg: 12, r: 18, bounty: 30, cost: 3, from: 12, smoke: true, knock: 0.6, color: '#9a9aa4',
      stun: { mul: 0.6, cap: 1.2, imm: 1.5 },
      desc: 'A bloated zombie that belches thick black smoke as it walks. A Leviathan Cannon cannot see into smoke, so the ' +
        'horde behind it walks in safe from the big gun (other turrets still see through it). Every Leviathan you own draws ' +
        'more of them. Kill it and the smoke clears in a few seconds.' },
    // ---- late threats aimed at a big turret camp
    gorefly: { name: 'Gorefly', hp: 45, speed: 112, dmg: 7, r: 7, bounty: 4, cost: 3, from: 14, fly: true, pack: 8, knock: 1.4, color: '#e0603a',
      desc: 'Swarms of 8 flying, blood-bloated insects. They fly straight over walls and wire to your turrets (or you) and gnaw ' +
        'them apart. Mines, spike traps, tar and burning ground do not touch them: shoot them down.' },
    disruptor: { name: 'Disruptor', hp: 520, speed: 50, dmg: 14, r: 16, bounty: 60, cost: 6, from: 16, emp: { r: 280, every: 6, dur: 2.5 },
      stun: { mul: 0.5, cap: 1, imm: 2 }, color: '#7ad8ff',
      desc: 'Crackling with stolen current. Every 6 s it fires an EMP pulse that knocks every turret within 280 offline for 2.5 s. ' +
        'Kill it before it reaches your guns.' },
    colossus: { name: 'Colossus', hp: 2500, speed: 26, dmg: 60, r: 46, bounty: 900, cost: 0, from: 22, armor: 20, wreck: 10, knock: 0,
      noChill: true, stun: { mul: 0 }, stomp: { every: 4, r: 140, sdmg: 60 }, color: '#b0a08a',
      desc: 'A towering armoured giant (from night 22, more of them later). Its 20 armour shrugs off small bullets (Minigun rounds lose ' +
        'most of their damage); Snipers, Rail, fire and explosions get through. Every 4 s it stomps, battering every build within 140. ' +
        'It cannot be stunned, chilled, knocked back or pulled.' },
    // night 20: a necromancer that hangs back and raises the dead
    gravecaller: { name: 'Gravecaller', hp: 900, speed: 58, dmg: 12, r: 16, bounty: 160, cost: 10, from: 20, raise: true, knock: 0.5, stun: { mul: 0.5, cap: 0.8, imm: 2.5 }, color: '#b48cff',
      desc: 'A robed necromancer. It hangs back out of reach and every 6 seconds raises up to 4 zombies that just died near it ' +
        '(raised ones pay nothing when killed again). It backs away when you come close: chase it down, or snipe it, before it ' +
        'undoes all your work.' },
  };


  const DIFFICULTY = {
    easy: { name: 'Easy', hp: 0.8, count: 0.75, dmg: 0.7, cash: 1.2 },
    normal: { name: 'Normal', hp: 1, count: 1, dmg: 1, cash: 1 },
    hard: { name: 'Hard', hp: 1.25, count: 1.3, dmg: 1.3, cash: 0.9 },
  };

  const PLAYER_COLORS = ['#ff5a4f', '#4fb4ff', '#ffd23f', '#6ee36a', '#d77bff', '#ff9d3c', '#4fe3d2', '#ff7ac0'];

  // ---- Supply drops: you start with a small kit, and every 5 nights a supply crate unlocks the next tier of gear.
  // UNLOCK_AFTER[id] = the night that has to be survived first (0 / missing = available from the start).
  const TIERS = {
    5: ['rifle', 'sniper', 'lamp', 'medic', 'lure', 'gt_pistol', 'gt_smg', 'gt_shotgun', 'gt_rifle', 'cannon', 'regen', 'engineer'],
    10: ['flamer', 'launcher', 'cryo', 'bunker', 'fence', 'spikes', 'tesla', 'gt_sniper', 'gt_flamer', 'gt_launcher', 'gt_cryo', 'deadeye'],
    15: ['saw', 'minigun', 'trail', 'ward', 'gravity', 'napalm', 'gt_minigun', 'gt_saw'],
    20: ['arc', 'rail', 'gt_arc', 'gt_rail', 'leviathan'],
    25: ['hellmouth'],
    30: ['sunlance'],
    50: ['phoenix'],
  };
  const UNLOCK_AFTER = {};
  for (const n of Object.keys(TIERS)) for (const id of TIERS[n]) UNLOCK_AFTER[id] = +n;
  // available during night `night` (and the day before it)? `all` = dev / terminal switch
  function unlocked(id, night, all) { return !!all || (UNLOCK_AFTER[id] || 0) < (night || 1); }
  // the next supply drop after `night`: { after, ids } or null
  function nextDrop(night) {
    for (const n of Object.keys(TIERS).map(Number).sort((a, b) => a - b)) if (n >= (night || 1)) return { after: n, ids: TIERS[n] };
    return null;
  }
  const itemName = (id) => (WEAPONS[id] || STRUCTS[id] || PERKS[id] || {}).name || id;
  // money with thousands separators: 12,500 / 100,000 / 1,000,000
  function fmt(n) { return Math.floor(+n || 0).toLocaleString('en-US'); }
  function weaponLevelCost(id, lvl) { // cost to go from lvl -> lvl+1
    const base = Math.max(WEAPONS[id].cost, 300);
    return Math.round(base * (0.45 + 0.25 * lvl) / 10) * 10;
  }
  function perkCost(id, lvl) { return PERKS[id].cost * (lvl + 1); }
  // A scouting report from an older version can name enemies that no longer exist (the Burrower): drop them.
  function cleanForecast(fc) {
    if (!fc || typeof fc !== 'object') return fc || null;
    const ok = (t) => !!ZOMBIES[t];
    return Object.assign({}, fc, { types: (fc.types || []).filter(ok), fresh: (fc.fresh || []).filter(ok),
      featured: ok(fc.featured) ? fc.featured : 'walker' });
  }
  function turretRange(id) {          // how far a turret reaches (gun turrets: their gun's full range)
    const d = STRUCTS[id];
    return d.gun ? WEAPONS[d.gun].range : d.range;
  }
  // Engineer: discounts walls, traps and gear (-8% a level), never turrets: discounting every turret too doubled the
  // whole late-game economy together with the old Scavenger perk.
  function structCost(id, engineerLvl) {
    const per = TURRET_IDS.indexOf(id) >= 0 ? 0 : 0.08;
    return Math.max(1, Math.round(STRUCTS[id].cost * (1 - per * (engineerLvl || 0))));
  }

  const GD = {
    CELL: 40, GW: 48, GH: 27, W: 1920, H: 1080,
    WEAPONS, WEAPON_ORDER, MAX_WEAPON_LEVEL, MAX_PACKS, START_PACKS,
    STRUCTS, STRUCT_ORDER, TOOLS, PERKS, PERK_ORDER, MAX_PERK_LEVEL, ITEMS, RETIRED_PERKS,
    ZOMBIES, DIFFICULTY, PLAYER_COLORS,
    START_MONEY: 350,          // covers the smaller early nights (less kill money) plus a little head start
    GUN_TURRET, GT_IDS, TURRET_IDS, TURRET_INFO, BURN,
    weaponLevelCost, perkCost, structCost, turretRange, cleanForecast, TIERS, UNLOCK_AFTER, unlocked, nextDrop, itemName, fmt,
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = GD;
  else root.GD = GD;
})(typeof window !== 'undefined' ? window : globalThis);
