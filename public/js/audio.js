// Last Ember - sound + music, all synthesized (no audio files).
// Effects are mostly tonal (thumps, knocks, in-key notes) with only tiny noise transients - no hiss beds.
// The soundtrack is generated live in D minor and locked to the server's clock, so every device
// in the room plays the same bar at the same time.
(function (root) {
  'use strict';
  let ac = null, sfx = null, mus = null, master = null, verb = null, echo = null, noiseBuf = null;
  let muted = false, musicOn = true;
  const vol = { master: 1, music: 1, sfx: 1 };
  try { Object.assign(vol, JSON.parse(localStorage.getItem('le_vol') || '{}')); } catch (e) { /* defaults */ }
  const last = {};
  const R = (a, b) => a + Math.random() * (b - a);
  const hz = (midi) => 440 * Math.pow(2, (midi - 69) / 12);
  let clock = () => Date.now();

  function impulse(seconds) {
    const len = Math.floor(ac.sampleRate * seconds), buf = ac.createBuffer(2, len, ac.sampleRate);
    for (let ch = 0; ch < 2; ch++) {
      const d = buf.getChannelData(ch);
      let lp = 0;
      for (let i = 0; i < len; i++) { lp += (Math.random() * 2 - 1 - lp) * 0.2; d[i] = lp * Math.pow(1 - i / len, 4); }
    }
    return buf;
  }
  function init() {
    if (ac) { if (ac.state === 'suspended') ac.resume(); return; }
    const AC = root.AudioContext || root.webkitAudioContext;
    if (!AC) return;
    ac = new AC();
    const comp = ac.createDynamicsCompressor();
    comp.threshold.value = -18; comp.knee.value = 10; comp.ratio.value = 3.5; comp.attack.value = 0.005; comp.release.value = 0.25;
    master = ac.createGain();
    comp.connect(master); master.connect(ac.destination);
    sfx = ac.createGain(); sfx.connect(comp);
    mus = ac.createGain(); mus.connect(comp);
    applyGains();
    verb = ac.createConvolver(); verb.buffer = impulse(2.2);
    const vg = ac.createGain(); vg.gain.value = 0.35; verb.connect(vg); vg.connect(comp);
    // tempo-free echo for melodies
    echo = ac.createDelay(1.5); echo.delayTime.value = 0.47;
    const fb = ac.createGain(); fb.gain.value = 0.38;
    const ef = ac.createBiquadFilter(); ef.type = 'lowpass'; ef.frequency.value = 2200;
    echo.connect(ef); ef.connect(fb); fb.connect(echo);
    const eg = ac.createGain(); eg.gain.value = 0.5; ef.connect(eg); eg.connect(mus);
    noiseBuf = ac.createBuffer(1, ac.sampleRate, ac.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    setInterval(schedule, 40);
    // phones/tablets: keep the context alive after the first touch
    const unlock = () => { if (ac.state !== 'running') ac.resume(); };
    root.addEventListener('pointerdown', unlock, { passive: true });
    root.addEventListener('keydown', unlock);
  }

  // ---------------------------------------------------------------- building blocks
  function dest(bus, pan, wet, echoAmt) {
    const g = ac.createGain();
    let node = g;
    if (ac.createStereoPanner && pan) {
      const p = ac.createStereoPanner(); p.pan.value = Math.max(-1, Math.min(1, pan));
      g.connect(p); node = p;
    }
    node.connect(bus);
    if (wet) { const s = ac.createGain(); s.gain.value = wet; node.connect(s); s.connect(verb); }
    if (echoAmt) { const s = ac.createGain(); s.gain.value = echoAmt; node.connect(s); s.connect(echo); }
    return g;
  }
  function env(g, t, vol, attack, decay) {
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0002, vol), t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + attack + decay);
  }
  // one oscillator note with optional pitch drop and filter
  function tone(d, o, t0) {
    const t = (t0 !== undefined ? t0 : ac.currentTime) + (o.delay || 0);
    const osc = ac.createOscillator();
    osc.type = o.wave || 'sine';
    osc.frequency.setValueAtTime(o.f0, t);
    if (o.f1) osc.frequency.exponentialRampToValueAtTime(o.f1, t + (o.sweep || o.dur));
    if (o.detune) osc.detune.value = o.detune;
    const g = ac.createGain();
    env(g, t, o.vol, o.attack || 0.003, o.dur);
    let node = osc;
    if (o.lp) {
      const f = ac.createBiquadFilter(); f.type = 'lowpass'; f.Q.value = o.q || 0.8;
      f.frequency.setValueAtTime(o.lp, t);
      if (o.lp1) f.frequency.exponentialRampToValueAtTime(o.lp1, t + (o.lpT || o.dur));
      osc.connect(f); node = f;
    }
    node.connect(g); g.connect(d);
    osc.start(t); osc.stop(t + (o.attack || 0.003) + o.dur + 0.05);
  }
  // a very short noise transient (gun crack, click). Never longer than a few tens of ms.
  function tick(d, o) {
    const t = ac.currentTime + (o.delay || 0);
    const src = ac.createBufferSource(); src.buffer = noiseBuf;
    const f = ac.createBiquadFilter(); f.type = o.type || 'bandpass'; f.frequency.value = o.f; f.Q.value = o.q || 1;
    const g = ac.createGain(); env(g, t, o.vol, 0.001, o.dur);
    src.connect(f); f.connect(g); g.connect(d);
    src.start(t, Math.random() * 0.5); src.stop(t + o.dur + 0.03);
  }
  // vowel-filtered voice: moans, roars, shrieks (no breath noise)
  function voice(d, o) {
    const t = ac.currentTime + (o.delay || 0);
    const osc = ac.createOscillator(); osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(o.f0, t); osc.frequency.linearRampToValueAtTime(o.f1, t + o.dur);
    const vib = ac.createOscillator(), vgn = ac.createGain();
    vib.frequency.value = o.vib || 5; vgn.gain.value = o.f0 * (o.vibAmt || 0.03);
    vib.connect(vgn); vgn.connect(osc.frequency);
    const g = ac.createGain(); env(g, t, o.vol, o.attack || 0.1, o.dur);
    for (const [fa, fb, q, gain] of o.formants) {
      const f = ac.createBiquadFilter(); f.type = 'bandpass'; f.Q.value = q;
      f.frequency.setValueAtTime(fa, t); f.frequency.linearRampToValueAtTime(fb, t + o.dur);
      const fg = ac.createGain(); fg.gain.value = gain;
      osc.connect(f); f.connect(fg); fg.connect(g);
    }
    g.connect(d);
    osc.start(t); vib.start(t); osc.stop(t + o.dur + 0.2); vib.stop(t + o.dur + 0.2);
  }

  // ---------------------------------------------------------------- effects
  // Guns: built from filtered noise the way a real shot is - a sharp broadband muzzle crack, a blast whose
  // brightness collapses within a few ms, a low chest-thump, then the surroundings throwing it back (tail).
  // Rifles add the supersonic snap; the shotgun racks its pump and the Longshot works its bolt.
  // noise burst: filter sweeps f0 -> f1, instant attack, exponential decay
  function blast(d, o) {
    const t = ac.currentTime + (o.delay || 0), a = o.attack || 0.0006;
    const src = ac.createBufferSource(); src.buffer = noiseBuf; src.loop = true;
    const f = ac.createBiquadFilter(); f.type = o.type || 'lowpass'; f.Q.value = o.q || 0.7;
    f.frequency.setValueAtTime(o.f0, t);
    if (o.f1) f.frequency.exponentialRampToValueAtTime(o.f1, t + (o.sweep || o.dur));
    const g = ac.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(Math.max(0.0002, o.vol), t + a);
    g.gain.exponentialRampToValueAtTime(0.0001, t + a + o.dur);
    src.connect(f); f.connect(g); g.connect(d);
    src.start(t, Math.random() * 0.9); src.stop(t + a + o.dur + 0.05);
  }
  function gunshot(d, o) {
    const v = o.vol * R(0.86, 1.04), p = R(0.93, 1.07);
    blast(d, { type: 'highpass', f0: 1800 * p, q: 0.5, dur: o.crackT || 0.014, vol: v * o.crack });                       // muzzle crack
    blast(d, { type: 'lowpass', f0: o.bright * p, f1: o.dark * p, sweep: o.len * 0.5, q: 0.6, dur: o.len, vol: v });     // the bang
    blast(d, { type: 'lowpass', f0: 320 * p, f1: 70, q: 0.9, dur: o.len * 1.7, vol: v * o.boom, attack: 0.002 });          // low boom
    tone(d, { f0: o.sub * p, f1: o.sub * 0.4, dur: o.len * 0.8, vol: v * o.boom * 0.55, attack: 0.001 });                   // chest thump
    if (o.snap) blast(d, { type: 'highpass', f0: 5000, q: 0.7, dur: 0.005, vol: v * o.snap });                            // supersonic snap
    if (o.tail) blast(d, { type: 'bandpass', f0: 1100 * p, f1: 350, q: 0.6, dur: o.tail, vol: v * 0.16, delay: 0.018, attack: 0.012 }); // echo off the surroundings
  }
  // metal-on-metal action noise (pump, bolt, slide)
  function clack(d, delay, f, vol) {
    blast(d, { type: 'bandpass', f0: f, q: 3.5, dur: 0.025, vol, delay });
    tone(d, { wave: 'square', f0: f * 0.31, f1: f * 0.22, dur: 0.02, vol: vol * 0.25, lp: 3000, delay });
  }
  const GUNS = {
    pistol: (d) => gunshot(d, { vol: 0.62, crack: 0.75, bright: 7500, dark: 450, len: 0.11, boom: 0.6, sub: 115, tail: 0.28 }),
    smg: (d) => gunshot(d, { vol: 0.34, crack: 0.65, bright: 6500, dark: 600, len: 0.065, boom: 0.45, sub: 135, tail: 0.14, crackT: 0.01 }),
    shotgun: (d) => {
      gunshot(d, { vol: 1.0, crack: 0.85, bright: 5200, dark: 220, len: 0.3, boom: 1.1, sub: 62, tail: 0.6, crackT: 0.02 });
      clack(d, 0.36, 2300, 0.13); clack(d, 0.5, 1900, 0.16);                                                                  // pump: back... forward
    },
    rifle: (d) => gunshot(d, { vol: 0.5, crack: 0.85, bright: 8500, dark: 500, len: 0.1, boom: 0.6, sub: 100, tail: 0.32, snap: 0.6 }),
    sniper: (d) => {
      gunshot(d, { vol: 1.05, crack: 1, bright: 9500, dark: 280, len: 0.32, boom: 1.1, sub: 55, tail: 1.1, snap: 1, crackT: 0.02 });
      clack(d, 0.55, 1600, 0.1); clack(d, 0.72, 2600, 0.09);                                                                  // bolt up and back... home
    },
    flame: (d) => { blast(d, { type: 'bandpass', f0: R(500, 700), f1: 300, q: 0.6, dur: 0.18, vol: 0.09, attack: 0.03 });
      tone(d, { wave: 'sawtooth', f0: R(60, 75), f1: 50, dur: 0.2, vol: 0.05, lp: 300, attack: 0.04 }); },
    launcher: (d) => {                                                                                                         // hollow "thoomp" of a grenade tube
      blast(d, { type: 'lowpass', f0: 1400, f1: 160, sweep: 0.06, q: 1.2, dur: 0.16, vol: 0.55 });
      tone(d, { f0: 160, f1: 55, dur: 0.18, vol: 0.5, attack: 0.002 });
      blast(d, { type: 'highpass', f0: 2500, dur: 0.008, vol: 0.2 });
    },
    minigun: (d) => gunshot(d, { vol: 0.26, crack: 0.6, bright: 6500, dark: 700, len: 0.05, boom: 0.4, sub: 140, tail: 0.08, crackT: 0.008 }),
    leviathan: (d) => {        // a colossal gun: a deep boom that rolls on, and the shell whistling away
      gunshot(d, { vol: 1.2, crack: 1, bright: 4000, dark: 120, len: 0.5, boom: 1.6, sub: 38, tail: 1.6, crackT: 0.03 });
      tone(d, { f0: 1600, f1: 700, dur: 1.2, vol: 0.03, delay: 0.25 });
    },
    cryo: (d) => { blast(d, { type: 'highpass', f0: 3000, dur: 0.05, vol: 0.18 }); tone(d, { f0: 2400, f1: 900, dur: 0.12, vol: 0.06 }); tone(d, { wave: 'triangle', f0: 3200, f1: 2600, dur: 0.18, vol: 0.025, delay: 0.03 }); },
    saw: (d) => { blast(d, { type: 'lowpass', f0: 1200, f1: 300, dur: 0.15, vol: 0.4 }); tone(d, { wave: 'sawtooth', f0: 900, f1: 1400, dur: 0.35, vol: 0.05, lp: 4000 }); },
    rail: (d) => { tone(d, { wave: 'sawtooth', f0: 200, f1: 1800, sweep: 0.08, dur: 0.1, vol: 0.08, lp: 5000 }); blast(d, { type: 'highpass', f0: 2500, dur: 0.04, vol: 0.5, delay: 0.08 });
      tone(d, { f0: 70, f1: 35, dur: 0.4, vol: 0.5, delay: 0.08 }); blast(d, { type: 'bandpass', f0: 900, f1: 300, q: 0.6, dur: 0.9, vol: 0.12, delay: 0.1, attack: 0.02 }); },
    arc: (d) => { tone(d, { wave: 'square', f0: R(110, 130), f1: 55, dur: 0.18, vol: 0.12, lp: 3000, lp1: 300 }); tone(d, { wave: 'sawtooth', f0: 1760, f1: 220, dur: 0.12, vol: 0.05, lp: 4000 }); },
    turret: (d) => gunshot(d, { vol: 0.24, crack: 0.6, bright: 6500, dark: 600, len: 0.06, boom: 0.4, sub: 130, tail: 0.1, crackT: 0.008 }),
    cannon: (d) => {                                                                                                           // mortar: deep boom, long rumble
      blast(d, { type: 'lowpass', f0: 2500, f1: 120, sweep: 0.08, q: 0.7, dur: 0.35, vol: 0.7 });
      tone(d, { f0: 90, f1: 35, dur: 0.35, vol: 0.55, attack: 0.002 });
      blast(d, { type: 'lowpass', f0: 300, f1: 80, dur: 0.9, vol: 0.18, delay: 0.03, attack: 0.02 });
    },
  };
  // ---- alternative gun sound styles (picked per device in the Audio panel). Each falls back to the
  // Realistic set above for anything it does not define (flame, arc, launcher...).
  // Arcade punch: the original tonal sound - tiny crack, pitched body, sub thump
  function punch(d, o) {
    const v = o.vol * R(0.85, 1.05), p = R(0.95, 1.05);
    tick(d, { f: o.crack * p, q: 0.7, type: 'highpass', dur: 0.018, vol: v * 0.45 });
    tone(d, { wave: 'triangle', f0: o.body * p, f1: o.body * 0.35 * p, dur: o.len, vol: v * 0.7, lp: 2400, lp1: 400 });
    tone(d, { f0: o.sub * p, f1: o.sub * 0.4, dur: o.len * 1.3, vol: v });
  }
  // Retro 8-bit: square-wave zaps and stepped noise
  function zap(d, o) {
    const p = R(0.96, 1.04);
    tone(d, { wave: 'square', f0: o.f0 * p, f1: o.f1, dur: o.len, vol: o.vol, lp: 5000 });
    blast(d, { type: 'lowpass', f0: o.noise, dur: o.len * 0.6, vol: o.vol * 0.7 });
  }
  // Cinematic heavy: the realistic shot, bigger and further away (long thunder roll after it)
  function heavy(d, o) {
    gunshot(d, Object.assign({}, o, { vol: o.vol * 1.1, boom: o.boom * 1.6, len: o.len * 1.25, tail: (o.tail || 0.1) * 1.8 }));
    blast(d, { type: 'lowpass', f0: 220, f1: 60, q: 0.7, dur: (o.tail || 0.2) * 2.2, vol: o.vol * 0.22, delay: 0.05, attack: 0.04 });
  }
  function thwip(d, o) {                // suppressor: a soft puff of gas and a little thump, no crack
    const p = R(0.94, 1.06);
    blast(d, { type: 'bandpass', f0: o.f * p, f1: o.f * 0.35, q: 1.1, dur: o.len, vol: o.vol, attack: 0.002 });
    tone(d, { f0: o.sub * p, f1: o.sub * 0.5, dur: o.len * 1.2, vol: o.vol * 0.45 });
    clack(d, 0.012, 3600 * p, o.vol * 0.2);
  }
  function pew(d, o) {                  // laser: a falling saw zap with a sine shimmer
    const p = R(0.95, 1.05);
    tone(d, { wave: 'sawtooth', f0: o.f0 * p, f1: o.f1, dur: o.len, vol: o.vol, lp: 6000, lp1: 1500 });
    tone(d, { f0: o.f0 * 0.7 * p, f1: o.f1 * 0.7, dur: o.len * 1.2, vol: o.vol * 0.8 });
  }
  function cowboy(d, o) {               // black powder: dull, boomy, a long canyon echo; ricochets now and then
    gunshot(d, { vol: o.vol, crack: 0.5, bright: 4500, dark: 300, len: o.len, boom: 1.2, sub: o.sub, tail: o.tail, crackT: 0.02 });
    blast(d, { type: 'lowpass', f0: 500, f1: 150, dur: o.tail * 0.8, vol: o.vol * 0.12, delay: 0.25, attack: 0.03 });   // the echo coming back
    if (Math.random() < 0.3) tone(d, { f0: R(2600, 3400), f1: R(1300, 1700), dur: 0.35, vol: 0.035, delay: R(0.05, 0.15) });
  }
  function pop(d, o) {                  // cartoon pop: a cork and a little boing
    const p = R(0.9, 1.1), dl = o.delay || 0;
    tone(d, { f0: o.f * p, f1: o.f * 0.25, dur: 0.08, vol: o.vol, delay: dl });
    blast(d, { type: 'bandpass', f0: 1400 * p, q: 2, dur: 0.04, vol: o.vol * 0.8, delay: dl });
    if (Math.random() < 0.25) tone(d, { wave: 'triangle', f0: o.f * 0.6, f1: o.f * 1.4, dur: 0.12, vol: o.vol * 0.25, delay: dl + 0.06 });
  }
  function snap(d, o) {                 // cap gun: a dry paper snap
    const dl = o.delay || 0;
    blast(d, { type: 'highpass', f0: 2200, dur: 0.018, vol: o.vol, delay: dl });
    blast(d, { type: 'bandpass', f0: o.f * R(0.9, 1.1), q: 3, dur: 0.03, vol: o.vol * 0.6, delay: dl });
  }
  const GUN_STYLES = {
    real: { name: 'Realistic', desc: 'Sharp crack, quick bang, echo off the surroundings.', set: GUNS },
    arcade: { name: 'Arcade punch', desc: 'Clean tonal thumps: snappy and light, easy on the ears in long fights.', set: {
      pistol: (d) => punch(d, { vol: 0.42, crack: 3000, body: 420, sub: 150, len: 0.09 }),
      smg: (d) => punch(d, { vol: 0.22, crack: 3600, body: 520, sub: 170, len: 0.05 }),
      shotgun: (d) => { punch(d, { vol: 0.7, crack: 2200, body: 260, sub: 95, len: 0.22 }); clack(d, 0.32, 1500, 0.08); clack(d, 0.42, 1200, 0.08); },
      rifle: (d) => punch(d, { vol: 0.32, crack: 3400, body: 380, sub: 130, len: 0.08 }),
      sniper: (d) => { punch(d, { vol: 0.8, crack: 4200, body: 300, sub: 75, len: 0.3 }); tone(d, { f0: 2400, f1: 1800, dur: 0.6, vol: 0.02, delay: 0.05 }); },
      minigun: (d) => punch(d, { vol: 0.18, crack: 3300, body: 480, sub: 160, len: 0.045 }),
      turret: (d) => punch(d, { vol: 0.15, crack: 3200, body: 600, sub: 180, len: 0.04 }),
    } },
    heavy: { name: 'Cinematic heavy', desc: 'Huge booms with a long rolling echo, like a war film.', set: {
      pistol: (d) => heavy(d, { vol: 0.6, crack: 0.75, bright: 7000, dark: 380, len: 0.12, boom: 0.6, sub: 100, tail: 0.35 }),
      smg: (d) => heavy(d, { vol: 0.32, crack: 0.6, bright: 6000, dark: 500, len: 0.07, boom: 0.45, sub: 120, tail: 0.18, crackT: 0.01 }),
      shotgun: (d) => { heavy(d, { vol: 0.95, crack: 0.8, bright: 4500, dark: 180, len: 0.32, boom: 1.1, sub: 55, tail: 0.7, crackT: 0.02 });
        clack(d, 0.42, 2100, 0.12); clack(d, 0.56, 1700, 0.15); },
      rifle: (d) => heavy(d, { vol: 0.5, crack: 0.85, bright: 8000, dark: 420, len: 0.11, boom: 0.6, sub: 90, tail: 0.4, snap: 0.6 }),
      sniper: (d) => { heavy(d, { vol: 1.0, crack: 1, bright: 9000, dark: 240, len: 0.34, boom: 1.1, sub: 48, tail: 1.2, snap: 1, crackT: 0.02 });
        clack(d, 0.7, 1500, 0.1); clack(d, 0.88, 2400, 0.09); },
      minigun: (d) => heavy(d, { vol: 0.24, crack: 0.6, bright: 6000, dark: 600, len: 0.055, boom: 0.4, sub: 130, tail: 0.1, crackT: 0.008 }),
      turret: (d) => heavy(d, { vol: 0.22, crack: 0.6, bright: 6000, dark: 520, len: 0.065, boom: 0.4, sub: 120, tail: 0.12, crackT: 0.008 }),
    } },
    retro: { name: 'Retro 8-bit', desc: 'Chiptune zaps and crunchy noise, like an old console.', set: {
      pistol: (d) => zap(d, { f0: 900, f1: 120, len: 0.09, vol: 0.12, noise: 2500 }),
      smg: (d) => zap(d, { f0: 1200, f1: 300, len: 0.05, vol: 0.07, noise: 3000 }),
      shotgun: (d) => { zap(d, { f0: 300, f1: 50, len: 0.2, vol: 0.18, noise: 1500 }); tone(d, { wave: 'square', f0: 660, dur: 0.04, vol: 0.05, delay: 0.3 }); tone(d, { wave: 'square', f0: 880, dur: 0.04, vol: 0.05, delay: 0.38 }); },
      rifle: (d) => zap(d, { f0: 1000, f1: 150, len: 0.08, vol: 0.1, noise: 3500 }),
      sniper: (d) => { zap(d, { f0: 1600, f1: 60, len: 0.3, vol: 0.16, noise: 2000 }); tone(d, { wave: 'square', f0: 2093, f1: 1047, dur: 0.15, vol: 0.03, delay: 0.1 }); },
      minigun: (d) => zap(d, { f0: 1400, f1: 400, len: 0.04, vol: 0.06, noise: 3500 }),
      turret: (d) => zap(d, { f0: 1300, f1: 350, len: 0.045, vol: 0.05, noise: 3000 }),
      launcher: (d) => zap(d, { f0: 200, f1: 600, len: 0.15, vol: 0.12, noise: 800 }),
      cannon: (d) => zap(d, { f0: 150, f1: 40, len: 0.3, vol: 0.16, noise: 700 }),
    } },
    suppressed: { name: 'Suppressed', desc: 'Silenced spec-ops guns: soft thwips and the clack of the action.', set: {
      pistol: (d) => thwip(d, { f: 2600, vol: 0.32, len: 0.05, sub: 200 }),
      smg: (d) => thwip(d, { f: 3000, vol: 0.18, len: 0.035, sub: 230 }),
      shotgun: (d) => { thwip(d, { f: 1500, vol: 0.5, len: 0.12, sub: 110 }); clack(d, 0.3, 2000, 0.1); clack(d, 0.42, 1700, 0.12); },
      rifle: (d) => thwip(d, { f: 2800, vol: 0.26, len: 0.045, sub: 180 }),
      sniper: (d) => { thwip(d, { f: 2000, vol: 0.55, len: 0.1, sub: 120 }); blast(d, { type: 'highpass', f0: 5000, dur: 0.004, vol: 0.2, delay: 0.02 }); clack(d, 0.5, 1600, 0.09); clack(d, 0.66, 2500, 0.08); },
      minigun: (d) => thwip(d, { f: 3200, vol: 0.14, len: 0.03, sub: 240 }),
      turret: (d) => thwip(d, { f: 3300, vol: 0.13, len: 0.03, sub: 250 }),
    } },
    laser: { name: 'Sci-fi laser', desc: 'Pew-pew energy weapons: falling zaps, a humming beam on the sniper.', set: {
      pistol: (d) => pew(d, { f0: 2200, f1: 320, len: 0.12, vol: 0.09 }),
      smg: (d) => pew(d, { f0: 2800, f1: 600, len: 0.06, vol: 0.05 }),
      shotgun: (d) => { for (const k of [0.8, 1, 1.25]) pew(d, { f0: 1500 * k, f1: 180 * k, len: 0.18, vol: 0.06 }); },
      rifle: (d) => pew(d, { f0: 2500, f1: 450, len: 0.09, vol: 0.07 }),
      sniper: (d) => { pew(d, { f0: 3500, f1: 90, len: 0.45, vol: 0.12 }); tone(d, { wave: 'sawtooth', f0: 110, f1: 55, dur: 0.4, vol: 0.06, lp: 900 }); },
      minigun: (d) => pew(d, { f0: 3000, f1: 900, len: 0.04, vol: 0.04 }),
      turret: (d) => pew(d, { f0: 3200, f1: 1000, len: 0.045, vol: 0.035 }),
      launcher: (d) => { tone(d, { f0: 300, f1: 900, dur: 0.18, vol: 0.12 }); pew(d, { f0: 600, f1: 2400, len: 0.18, vol: 0.05 }); },
      cannon: (d) => { tone(d, { f0: 200, f1: 40, dur: 0.4, vol: 0.3 }); pew(d, { f0: 900, f1: 60, len: 0.4, vol: 0.06 }); },
    } },
    western: { name: 'Old West', desc: 'Black-powder booms rolling down a canyon, with the odd ricochet whine.', set: {
      pistol: (d) => cowboy(d, { vol: 0.65, len: 0.16, sub: 85, tail: 0.9 }),
      smg: (d) => cowboy(d, { vol: 0.3, len: 0.07, sub: 110, tail: 0.3 }),
      shotgun: (d) => { cowboy(d, { vol: 1.0, len: 0.32, sub: 55, tail: 1.2 }); clack(d, 0.5, 1400, 0.1); },
      rifle: (d) => { cowboy(d, { vol: 0.55, len: 0.13, sub: 90, tail: 0.8 }); clack(d, 0.35, 1800, 0.06); },
      sniper: (d) => { cowboy(d, { vol: 1.0, len: 0.3, sub: 50, tail: 1.5 }); clack(d, 0.6, 1500, 0.08); clack(d, 0.75, 2200, 0.07); },
      minigun: (d) => cowboy(d, { vol: 0.24, len: 0.055, sub: 120, tail: 0.15 }),
      turret: (d) => cowboy(d, { vol: 0.22, len: 0.06, sub: 120, tail: 0.18 }),
    } },
    cartoon: { name: 'Cartoon', desc: 'Silly pops, boings and KA-BLAMs. Not scary at all.', set: {
      pistol: (d) => pop(d, { f: 700, vol: 0.2 }),
      smg: (d) => pop(d, { f: 1000, vol: 0.1 }),
      shotgun: (d) => { tone(d, { wave: 'square', f0: 220, f1: 55, dur: 0.22, vol: 0.12, lp: 1500 }); blast(d, { type: 'lowpass', f0: 900, dur: 0.25, vol: 0.4 }); tone(d, { f0: 300, f1: 900, dur: 0.15, vol: 0.06, delay: 0.25 }); },
      rifle: (d) => pop(d, { f: 850, vol: 0.15 }),
      sniper: (d) => { tone(d, { f0: 1900, f1: 350, dur: 0.28, vol: 0.12 }); pop(d, { f: 500, vol: 0.25, delay: 0.26 }); },
      minigun: (d) => pop(d, { f: 1200, vol: 0.07 }),
      turret: (d) => pop(d, { f: 1300, vol: 0.06 }),
      launcher: (d) => { tone(d, { f0: 250, f1: 700, dur: 0.12, vol: 0.12 }); tone(d, { wave: 'triangle', f0: 180, f1: 120, dur: 0.3, vol: 0.08, delay: 0.1 }); },
      cannon: (d) => { tone(d, { wave: 'triangle', f0: 120, f1: 300, dur: 0.15, vol: 0.2 }); blast(d, { type: 'lowpass', f0: 600, dur: 0.3, vol: 0.35 }); },
    } },
    cap: { name: 'Cap gun', desc: 'Toy cap guns: dry little snaps. Quiet and tidy for long sessions.', set: {
      pistol: (d) => snap(d, { vol: 0.32, f: 3800 }),
      smg: (d) => snap(d, { vol: 0.17, f: 4200 }),
      shotgun: (d) => { snap(d, { vol: 0.45, f: 2600 }); snap(d, { vol: 0.25, f: 3200, delay: 0.015 }); },
      rifle: (d) => snap(d, { vol: 0.26, f: 4000 }),
      sniper: (d) => { snap(d, { vol: 0.5, f: 3000 }); tone(d, { wave: 'square', f0: 2400, dur: 0.012, vol: 0.04, delay: 0.25 }); },
      minigun: (d) => snap(d, { vol: 0.13, f: 4400 }),
      turret: (d) => snap(d, { vol: 0.12, f: 4500 }),
    } },
  };
  let gunStyle = 'real';
  try { const g = localStorage.getItem('le_gunstyle'); if (GUN_STYLES[g]) gunStyle = g; } catch (e) { /* defaults */ }
  const gunFn = (name, style) => { const st = GUN_STYLES[style || gunStyle] || GUN_STYLES.real; return st.set[name] || GUNS[name]; };
  const SFX = {
    hit: (d) => { tone(d, { f0: R(170, 210), f1: 70, dur: 0.06, vol: 0.16 }); tick(d, { f: 900, q: 2, dur: 0.012, vol: 0.05 }); },
    die: (d) => { tone(d, { wave: 'triangle', f0: R(200, 250), f1: 55, dur: 0.18, vol: 0.22, lp: 900 }); tone(d, { f0: 90, f1: 40, dur: 0.15, vol: 0.25 }); },
    groan: (d) => {
      const f = R(70, 105), formants = Math.random() < 0.5 ? [[520, 420, 7, 1.3], [880, 720, 8, 0.6]] : [[400, 560, 7, 1.3], [700, 980, 8, 0.5]];
      voice(d, { f0: f * 1.1, f1: f * 0.85, dur: R(0.8, 1.3), vol: 0.045, attack: 0.25, vib: R(3, 6), vibAmt: 0.04, formants });
    },
    explosion: (d) => { tone(d, { f0: 95, f1: 30, dur: 0.8, vol: 0.9 }); tone(d, { wave: 'triangle', f0: 220, f1: 60, dur: 0.3, vol: 0.35 });
      tick(d, { f: 900, q: 0.4, type: 'lowpass', dur: 0.25, vol: 0.35 }); },
    structHit: (d) => { const f = R(300, 360); tone(d, { f0: f, f1: f * 0.8, dur: 0.06, vol: 0.2 }); tone(d, { f0: f * 1.6, dur: 0.04, vol: 0.08 }); },
    fireHit: (d) => { const f = R(140, 190); tone(d, { wave: 'triangle', f0: f, f1: f * 0.6, dur: 0.12, vol: 0.28, lp: 900 });
      for (let i = 0; i < 3; i++) blast(d, { type: 'bandpass', f0: R(2500, 4000), q: 4, dur: 0.02, vol: 0.12, delay: R(0.02, 0.15) }); },
    fireOut: (d) => { blast(d, { type: 'bandpass', f0: 1800, f1: 400, q: 0.5, dur: 1.4, vol: 0.35, attack: 0.05 }); tone(d, { f0: 70, f1: 30, dur: 1.2, vol: 0.4 }); },
    // Gravecaller raising the dead: a rising, wordless moan over a deep thud and the ground cracking open
    raise: (d) => {
      voice(d, { f0: 140, f1: 260, dur: 1.1, vol: 0.16, attack: 0.15, vib: 5, vibAmt: 0.03, formants: [[450, 800, 6, 1.3], [800, 1150, 7, 0.6]] });
      voice(d, { f0: 70, f1: 130, dur: 1.1, vol: 0.12, attack: 0.15, vib: 4, vibAmt: 0.03, formants: [[450, 800, 6, 1.3]] });
      tone(d, { f0: 70, f1: 32, dur: 0.6, vol: 0.4 });
      for (let i = 0; i < 4; i++) blast(d, { type: 'bandpass', f0: R(300, 700), q: 2, dur: 0.08, vol: 0.12, delay: 0.1 + i * R(0.05, 0.12) });
    },
    // tar catching fire: a rising whoosh and a crackle
    tarFire: (d) => {
      blast(d, { type: 'lowpass', f0: 300, f1: 2600, sweep: 0.25, q: 0.8, dur: 0.45, vol: 0.22, attack: 0.04 });
      for (let i = 0; i < 4; i++) blast(d, { type: 'bandpass', f0: R(1800, 3500), q: 4, dur: 0.02, vol: 0.06, delay: R(0.05, 0.4) });
    },
    shrug: (d) => { tone(d, { wave: 'sawtooth', f0: 900, f1: 180, dur: 0.12, vol: 0.05, lp: 3000 }); blast(d, { type: 'highpass', f0: 4000, dur: 0.05, vol: 0.06 }); },
    // Hellmouth erupting: a huge rolling roar of fire for the whole sweep
    hellStart: (d) => {
      blast(d, { type: 'lowpass', f0: 200, f1: 1400, sweep: 0.5, q: 0.8, dur: 5.1, vol: 0.55, attack: 0.15 });
      blast(d, { type: 'bandpass', f0: 600, f1: 300, q: 0.5, dur: 5.1, vol: 0.25, attack: 0.3 });
      tone(d, { wave: 'sawtooth', f0: 55, f1: 40, dur: 5.1, vol: 0.12, lp: 220, attack: 0.2 });
      tone(d, { f0: 70, f1: 30, dur: 0.6, vol: 0.6 });
      for (let i = 0; i < 32; i++) blast(d, { type: 'bandpass', f0: R(1500, 4000), q: 3, dur: 0.03, vol: 0.08, delay: R(0, 4.9) });
    },
    nova: (d) => {             // the Rekindling: a deep boom, a rushing roar, and a rising choir chord
      tone(d, { f0: 70, f1: 25, dur: 1.4, vol: 0.9 });
      blast(d, { type: 'lowpass', f0: 300, f1: 3000, sweep: 1.2, q: 0.7, dur: 2.2, vol: 0.45, attack: 0.05 });
      [57, 62, 66, 69].forEach((m, i) => voice(d, { f0: hz(m), f1: hz(m + 12), dur: 2.2, vol: 0.05, attack: 0.3, vib: 5 + i * 0.4, vibAmt: 0.01, formants: [[800, 900, 6, 1.2], [1150, 1300, 7, 0.6]], delay: 0.1 }));
    },
    supply: (d) => {           // a whistle as it falls, a thump, and a little fanfare
      tone(d, { f0: 1800, f1: 600, dur: 1.8, vol: 0.03 });
      tone(d, { f0: 90, f1: 40, dur: 0.3, vol: 0.4, delay: 2.2 });
      [67, 71, 74, 79].forEach((m, i) => tone(d, { wave: 'triangle', f0: hz(m), dur: 0.5, vol: 0.07, delay: 2.4 + i * 0.12, lp: 3000 }));
    },
    sunOn: (d) => {            // the orbital beam punching down through the sky
      tone(d, { wave: 'sawtooth', f0: 80, f1: 1600, sweep: 0.6, dur: 0.9, vol: 0.08, lp: 5000 });
      blast(d, { type: 'bandpass', f0: 3000, f1: 800, q: 0.7, dur: 1.4, vol: 0.25, attack: 0.05 });
      tone(d, { f0: 55, f1: 40, dur: 2.5, vol: 0.3, attack: 0.1 });
    },
    emp: (d) => { tone(d, { wave: 'sawtooth', f0: 2400, f1: 90, dur: 0.5, vol: 0.09, lp: 4000 }); tone(d, { wave: 'square', f0: 60, dur: 0.4, vol: 0.06, lp: 400 }); blast(d, { type: 'highpass', f0: 3000, dur: 0.25, vol: 0.08 }); },
    stomp: (d) => { tone(d, { f0: 60, f1: 22, dur: 0.9, vol: 0.9 }); blast(d, { type: 'lowpass', f0: 500, f1: 80, dur: 0.6, vol: 0.4 }); },
    spikes: (d) => { blast(d, { type: 'bandpass', f0: 3200, q: 3, dur: 0.06, vol: 0.18 }); tone(d, { wave: 'triangle', f0: 1700, f1: 1300, dur: 0.12, vol: 0.05 }); tone(d, { f0: 120, f1: 60, dur: 0.08, vol: 0.2 }); },
    crit: (d) => { tone(d, { wave: 'triangle', f0: 1568, dur: 0.08, vol: 0.06 }); tone(d, { wave: 'triangle', f0: 2093, dur: 0.12, vol: 0.05, delay: 0.05 }); },
    ricochet: (d) => tone(d, { wave: 'triangle', f0: R(2500, 3200), f1: R(1300, 1700), dur: 0.15, vol: 0.05 }),
    structDie: (d) => { for (let i = 0; i < 4; i++) tone(d, { f0: R(220, 420), f1: 120, dur: 0.07, vol: 0.18, delay: i * R(0.04, 0.07) }); tone(d, { f0: 80, f1: 40, dur: 0.25, vol: 0.3 }); },
    build: (d) => { tone(d, { f0: 784, f1: 760, dur: 0.07, vol: 0.14 }); tone(d, { f0: 1175, dur: 0.06, vol: 0.06 }); tone(d, { f0: 587, dur: 0.08, vol: 0.12, delay: 0.1 }); },
    sell: (d) => { tone(d, { wave: 'triangle', f0: 880, dur: 0.12, vol: 0.08 }); tone(d, { wave: 'triangle', f0: 659, dur: 0.16, vol: 0.08, delay: 0.08 }); },
    buy: (d) => { tone(d, { wave: 'triangle', f0: hz(74), dur: 0.15, vol: 0.09 }); tone(d, { wave: 'triangle', f0: hz(81), dur: 0.25, vol: 0.09, delay: 0.08 }); tone(d, { f0: hz(93), dur: 0.2, vol: 0.03, delay: 0.08 }); },
    deny: (d) => tone(d, { wave: 'triangle', f0: 110, f1: 95, dur: 0.16, vol: 0.18, lp: 600 }),
    hurt: (d) => { tone(d, { f0: 140, f1: 55, dur: 0.14, vol: 0.4 }); tone(d, { wave: 'triangle', f0: 330, f1: 200, dur: 0.08, vol: 0.08 }); },
    down: (d) => { for (let i = 0; i < 3; i++) { tone(d, { f0: 60, f1: 45, dur: 0.12, vol: 0.5, delay: i * 0.8 }); tone(d, { f0: 55, f1: 42, dur: 0.1, vol: 0.32, delay: i * 0.8 + 0.22 }); }
      tone(d, { wave: 'triangle', f0: hz(50), dur: 2.2, vol: 0.08, attack: 0.6, lp: 400 }); },
    revive: (d) => { [62, 65, 69, 74].forEach((m, i) => tone(d, { wave: 'triangle', f0: hz(m), dur: 0.6, vol: 0.07, delay: i * 0.07, lp: 2500 })); },
    heal: () => {},
    reload: (d) => { tone(d, { wave: 'square', f0: 1400, dur: 0.012, vol: 0.05, lp: 3000 }); tone(d, { wave: 'square', f0: 950, dur: 0.015, vol: 0.06, lp: 3000, delay: 0.15 }); },
    swap: (d) => tone(d, { wave: 'triangle', f0: 600, f1: 500, dur: 0.04, vol: 0.06 }),
    dry: (d) => tone(d, { wave: 'square', f0: 1200, dur: 0.01, vol: 0.05, lp: 2500 }),
    join: (d) => { tone(d, { wave: 'triangle', f0: hz(69), dur: 0.2, vol: 0.08 }); tone(d, { wave: 'triangle', f0: hz(74), dur: 0.35, vol: 0.08, delay: 0.1 }); },
    slam: (d) => { tone(d, { f0: 75, f1: 24, dur: 0.9, vol: 1.0 }); tone(d, { wave: 'triangle', f0: 160, f1: 50, dur: 0.4, vol: 0.4 }); },
    boss: (d) => { voice(d, { f0: 52, f1: 40, dur: 2.2, vol: 0.35, attack: 0.35, vib: 7, vibAmt: 0.06, formants: [[340, 270, 5, 1.5], [680, 500, 6, 0.8]] }); tone(d, { f0: 41, dur: 2, vol: 0.3, attack: 0.4 }); },
    // Bonewyrm: a rattling, clicking shriek (hundreds of bone legs), then a deep groan
    wyrm: (d) => {
      for (let i = 0; i < 18; i++) tick(d, { f: R(1800, 3600), q: 4, dur: 0.02, vol: 0.09, delay: i * 0.045 + R(0, 0.02) });
      voice(d, { f0: 180, f1: 70, dur: 1.8, vol: 0.3, attack: 0.15, vib: 11, vibAmt: 0.08, formants: [[700, 380, 6, 1.3], [1500, 900, 7, 0.6]], delay: 0.3 });
      tone(d, { f0: 48, f1: 36, dur: 1.6, vol: 0.3, attack: 0.3, delay: 0.3 });
    },
    sever: (d) => {
      tone(d, { wave: 'triangle', f0: 420, f1: 90, dur: 0.35, vol: 0.3, lp: 1400 });
      for (let i = 0; i < 6; i++) tick(d, { f: R(1500, 3000), q: 3, dur: 0.025, vol: 0.12, delay: i * 0.03 });
      voice(d, { f0: 260, f1: 520, dur: 0.6, vol: 0.18, attack: 0.03, vib: 14, vibAmt: 0.06, formants: [[1200, 1900, 6, 1], [2600, 3200, 7, 0.5]], delay: 0.05 });
    },
    // Gorewyrm: lower and wetter, a slurping, grinding roar
    gorewyrm: (d) => {
      for (let i = 0; i < 14; i++) blast(d, { type: 'bandpass', f0: R(300, 900), q: 3, dur: 0.06, vol: 0.12, delay: i * 0.07 + R(0, 0.03) });
      voice(d, { f0: 110, f1: 45, dur: 2.4, vol: 0.35, attack: 0.2, vib: 7, vibAmt: 0.1, formants: [[500, 300, 5, 1.4], [900, 600, 6, 0.6]], delay: 0.2 });
      tone(d, { f0: 38, f1: 28, dur: 2.2, vol: 0.4, attack: 0.3, delay: 0.2 });
    },
    wyrmDie: (d) => { tone(d, { f0: 90, f1: 28, dur: 1.4, vol: 0.6 }); voice(d, { f0: 140, f1: 50, dur: 1.5, vol: 0.25, attack: 0.05, vib: 6, vibAmt: 0.1, formants: [[600, 300, 5, 1.2]] }); },
    elite: (d) => { voice(d, { f0: 65, f1: 55, dur: 1.4, vol: 0.25, attack: 0.2, vib: 6, vibAmt: 0.05, formants: [[420, 360, 5, 1.4], [800, 640, 6, 0.7]] }); },
    scream: (d) => voice(d, { f0: R(420, 480), f1: R(560, 640), dur: 0.75, vol: 0.12, attack: 0.04, vib: 13, vibAmt: 0.05, formants: [[2300, 2800, 6, 1], [3300, 3700, 7, 0.6]] }),
    leap: (d) => tone(d, { wave: 'triangle', f0: 200, f1: 600, dur: 0.18, vol: 0.06, lp: 1500 }),
    land: (d) => tone(d, { f0: 120, f1: 50, dur: 0.1, vol: 0.25 }),
    surface: (d) => { tone(d, { f0: 70, f1: 30, dur: 0.5, vol: 0.5 }); for (let i = 0; i < 4; i++) tone(d, { f0: R(180, 300), f1: 90, dur: 0.06, vol: 0.12, delay: R(0.05, 0.3) }); },
    charge: (d) => voice(d, { f0: 72, f1: 95, dur: 0.9, vol: 0.28, attack: 0.08, vib: 9, vibAmt: 0.05, formants: [[450, 620, 5, 1.4], [900, 1150, 6, 0.6]] }),
    split: (d) => { tone(d, { wave: 'triangle', f0: 300, f1: 70, dur: 0.22, vol: 0.25, lp: 900 }); tone(d, { f0: 140, f1: 60, dur: 0.12, vol: 0.2 }); },
    brood: (d) => tone(d, { wave: 'triangle', f0: 180, f1: 90, dur: 0.25, vol: 0.15, lp: 700 }),
    acid: (d) => tone(d, { wave: 'triangle', f0: 260, f1: 120, dur: 0.15, vol: 0.12 }),
    nightStart: (d) => { [26, 38, 45].forEach((m, i) => tone(d, { wave: 'sawtooth', f0: hz(m), detune: i * 6, dur: 3, vol: 0.12, attack: 0.4, lp: 140, lp1: 1100, lpT: 1.5, q: 2 })); },
    dawn: (d) => { [55, 62, 65, 69, 74].forEach((m, i) => tone(d, { wave: 'triangle', f0: hz(m), dur: 2.4, vol: 0.05, attack: 0.5 + i * 0.12, lp: 1800 })); },
    over: (d) => { [50, 53, 57].forEach((m) => tone(d, { wave: 'sawtooth', f0: hz(m), dur: 3.5, vol: 0.06, attack: 0.5, lp: 500, lp1: 160 })); },
  };
  const WET = { hellStart: 0.4, raise: 0.6, fireOut: 0.6, fireHit: 0.2, smg: 0.1, minigun: 0.06, turret: 0.08, explosion: 0.4, boss: 0.6, elite: 0.5, scream: 0.5, nightStart: 0.6, dawn: 0.5, over: 0.6, down: 0.4, revive: 0.4, slam: 0.5,
    surface: 0.4, charge: 0.5, groan: 0.5, sniper: 0.5, shotgun: 0.3, pistol: 0.15, rifle: 0.15, launcher: 0.2, cannon: 0.3, die: 0.15 };
  const MIN_GAP = { spikes: 0.08, crit: 0.06, ricochet: 0.1, saw: 0.1, cryo: 0.06, shrug: 0.25, tarFire: 0.18, fireHit: 0.2, pistol: 0.04, smg: 0.06, rifle: 0.05, minigun: 0.055, flame: 0.12, turret: 0.08, hit: 0.05, die: 0.05, groan: 0.7,
    structHit: 0.1, arc: 0.08, explosion: 0.08, hurt: 0.15, build: 0.06, deny: 0.2, acid: 0.1, scream: 0.4, leap: 0.12, land: 0.12,
    split: 0.1, brood: 0.3, surface: 0.15, reload: 0.08, swap: 0.08 };

  const KEY_SFX = { gorewyrm: 1, nova: 1, supply: 1, sunOn: 1, stomp: 1, emp: 1, hellStart: 1, raise: 1, fireOut: 1, fireHit: 1, nightStart: 1, dawn: 1, boss: 1, over: 1, down: 1, revive: 1, elite: 1, explosion: 1, deny: 1, buy: 1, wyrm: 1, sever: 1, wyrmDie: 1 };
  const VOICE_CAP = /Android|iPhone|iPad|Mobile/i.test(navigator.userAgent || '') ? 6 : 10;   // per 0.1 s
  const burst = { t: 0, n: 0 };
  function play(name, x, key) {
    if (!ac || muted || ac.state !== 'running') return;
    const k = key || name, now = ac.currentTime;
    if (last[k] && now - last[k] < (MIN_GAP[k] || 0.02)) return;
    // overall cap: in a huge fight, drop routine sounds instead of choking slower devices
    if (now - burst.t > 0.1) { burst.t = now; burst.n = 0; }
    if (!KEY_SFX[name] && ++burst.n > VOICE_CAP) return;
    last[k] = now;
    const pan = typeof x === 'number' ? (x / 1920 - 0.5) * 1.2 : 0;
    try {
      const fn = SFX[name] || gunFn(name);
      if (fn) fn(dest(sfx, pan, WET[name] || 0.08));
    } catch (e) { /* never let audio break the game */ }
  }
  function shot(wid, x) {
    const w = (root.GD && root.GD.WEAPONS[wid]) ? root.GD.WEAPONS[wid].sfx : wid;
    play(w, x, w);
  }

  // ---------------------------------------------------------------- the soundtrack
  // D minor. Chords as MIDI notes (root first). Everything is chosen from the shared clock, so all
  // devices pick the same chord and the same melody notes for each step.
  const CH = { Dm: [50, 53, 57], Bb: [46, 50, 53], F: [53, 57, 60], C: [48, 52, 55], Gm: [55, 58, 62], A: [45, 49, 52] };
  const PROG = { menu: ['Dm', 'F', 'C', 'Bb'], day: ['Dm', 'Bb', 'F', 'C'], night: ['Dm', 'Dm', 'Bb', 'C'], over: ['Dm', 'Bb', 'Gm', 'A'] };
  const BPM = { menu: 70, day: 74, night: 98, over: 60 };
  const PENTA = [62, 65, 67, 69, 72, 74, 77, 79];
  const music = { mode: 'menu', intensity: 0, boss: false, blood: false, nextStep: -1, lastMode: '' };
  function hash(n) { n = (n ^ 61) ^ (n >>> 16); n = n + (n << 3); n = n ^ (n >>> 4); n = Math.imul(n, 0x27d4eb2d); return ((n ^ (n >>> 15)) >>> 0) / 4294967296; }

  function synthVoice(t, step, mode) {
    const bar = Math.floor(step / 16), s = step % 16;
    const prog = PROG[mode], chord = CH[prog[bar % prog.length]];
    const m = music, night = mode === 'night', D = (w, e) => dest(mus, 0, w || 0, e || 0);
    // pad: on every bar
    if (s === 0) {
      const barLen = 16 * 60 / BPM[mode] / 4;
      chord.forEach((n, i) => {
        tone(D(0.35), { wave: 'triangle', f0: hz(n), dur: barLen * 0.95, vol: night ? 0.035 : 0.045, attack: barLen * 0.25, lp: night ? 700 : 1300, detune: i * 4 - 4 }, t);
        tone(D(0.35), { wave: 'sawtooth', f0: hz(n), dur: barLen * 0.95, vol: 0.012, attack: barLen * 0.3, lp: 500, detune: 7 }, t);
      });
      if (m.blood && night) tone(D(0.4), { wave: 'triangle', f0: hz(chord[0] + 1), dur: barLen * 0.9, vol: 0.02, attack: barLen * 0.4, lp: 600 }, t);
      if (mode !== 'night') tone(D(0.3), { f0: hz(chord[0] - 12), dur: barLen, vol: 0.05, attack: 0.3 }, t);
    }
    if (night) {
      const I = m.intensity;
      // kick
      if (s % 4 === 0 && (s % 8 === 0 || I > 0.35)) tone(D(), { f0: 120, f1: 42, sweep: 0.12, dur: 0.2, vol: 0.32 + I * 0.15 }, t);
      // driving bass: 8ths with a little syncopation
      const pat = [1, 0, 1, 1, 0, 1, 1, 0];
      if (s % 2 === 0 && pat[(s / 2) % 8]) {
        const n = chord[0] - 12 + ((s === 14 && bar % 2) ? 7 : 0);
        tone(D(), { wave: 'sawtooth', f0: hz(n), dur: 0.2, vol: 0.09, lp: 180 + I * 500, lp1: 90, q: 3 }, t);
      }
      // soft off-beat tick (tonal, not hiss)
      if (s % 4 === 2 && I > 0.2) tone(D(), { wave: 'square', f0: 1900, dur: 0.012, vol: 0.012, lp: 4000 }, t);
      // tension arp when it gets busy
      if (I > 0.5) {
        const n = chord[s % 3] + 12 + (s % 8 >= 4 ? 12 : 0);
        tone(D(0.1, 0.25), { wave: 'sawtooth', f0: hz(n), dur: 0.09, vol: 0.018 + (I - 0.5) * 0.03, lp: 1600, lp1: 500 }, t);
      }
      // boss: heavy brass stabs
      if (m.boss && (s === 0 || s === 6)) {
        for (const o of [-24, -12]) tone(D(0.3), { wave: 'sawtooth', f0: hz(chord[0] + o), dur: 0.5, vol: 0.06, attack: 0.02, lp: 300, lp1: 1600, lpT: 0.15, q: 2 }, t);
      }
    } else if (mode !== 'over') {
      // calm melody: sparse plucks from the minor pentatonic, with echo
      const r = hash(step * 7 + 3);
      if ((s % 4 === 0 && r < 0.55) || (s % 2 === 0 && r < 0.12)) {
        const n = PENTA[Math.floor(hash(step * 13 + 1) * PENTA.length)];
        tone(D(0.2, 0.55), { wave: 'triangle', f0: hz(n), dur: 0.6, vol: 0.05, lp: 3000 }, t);
        tone(D(0, 0.4), { f0: hz(n + 12), dur: 0.25, vol: 0.012 }, t);
      }
    }
  }
  // ---- alternative soundtracks (picked per device). Same chords and clock, so devices still stay in step
  // when they use the same style.
  const at0 = (t) => Math.max(0, t - ac.currentTime);            // blast() takes a delay, not a time
  function tom(D, t, f, vol, decay) {
    tone(D, { f0: f, f1: f * 0.55, sweep: decay || 0.25, dur: decay || 0.25, vol }, t);
    blast(D, { type: 'lowpass', f0: f * 9, dur: 0.025, vol: vol * 0.35, delay: at0(t) });
  }
  function bow(D, t, n, dur, vol, lp, attack) {         // a bowed string: two detuned saws, filtered
    for (const det of [-9, 9]) tone(D, { wave: 'sawtooth', f0: hz(n), detune: det, dur, vol, attack: attack || 0.01, lp: lp || 1200, q: 0.6 }, t);
  }
  // Dread drone: slow drones, cold wind, a heartbeat that quickens with the fight. No melody.
  function droneVoice(t, step, mode) {
    const bar = Math.floor(step / 16), s = step % 16, m = music, night = mode === 'night';
    const chord = CH[PROG[mode][Math.floor(bar / 2) % PROG[mode].length]], barLen = 16 * 60 / BPM[mode] / 4;
    const D = (w, e) => dest(mus, 0, w || 0, e || 0);
    if (s === 0 && bar % 2 === 0) {
      tone(D(0.5), { f0: hz(chord[0] - 12), dur: barLen * 2, vol: 0.07, attack: barLen * 0.8 }, t);
      tone(D(0.5), { wave: 'triangle', f0: hz(chord[0] - 5), dur: barLen * 2, vol: 0.025, attack: barLen, lp: 500 }, t);
      if (night && m.blood) tone(D(0.5), { wave: 'triangle', f0: hz(chord[0] - 11), dur: barLen * 2, vol: 0.02, attack: barLen, lp: 500 }, t);
      blast(D(0.4), { type: 'bandpass', f0: 500, f1: 260, sweep: barLen * 2, q: 1.2, dur: barLen * 1.9, vol: 0.012, attack: barLen * 0.7, delay: at0(t) });
    }
    if (night) {
      const k = m.intensity > 0.6 ? 2 : m.intensity > 0.3 ? 4 : 8;      // heartbeat every k steps
      if (s % k === 0) {
        tone(D(), { f0: 72, f1: 40, sweep: 0.1, dur: 0.14, vol: 0.32 }, t);
        tone(D(), { f0: 64, f1: 38, sweep: 0.1, dur: 0.12, vol: 0.2 }, t + 0.17);
      }
      if (m.boss && s === 8) bow(D(0.5), t, chord[0] - 24, barLen * 0.45, 0.03, 300, 0.2);
      if (s === 12 && hash(step * 5) < 0.3) tone(D(0.6, 0.5), { f0: hz(chord[2] + 24 + 1), dur: 1.6, vol: 0.012 }, t);   // a wrong note, far away
    } else if (mode !== 'over' && s % 8 === 0 && hash(step * 11 + 2) < 0.3) {
      tone(D(0.5, 0.6), { f0: hz(PENTA[Math.floor(hash(step * 3) * PENTA.length)] + 12), dur: 2.4, vol: 0.02 }, t);    // a lonely bell
    }
  }
  // War drums: hand drums by day, pounding toms and taiko at night
  function drumVoice(t, step, mode) {
    const bar = Math.floor(step / 16), s = step % 16, m = music, night = mode === 'night', I = m.intensity;
    const chord = CH[PROG[mode][bar % PROG[mode].length]], barLen = 16 * 60 / BPM[mode] / 4;
    const D = (w, e) => dest(mus, 0, w || 0, e || 0);
    if (s === 0) tone(D(0.3), { wave: 'triangle', f0: hz(chord[0] - 12), dur: barLen, vol: night ? 0.035 : 0.03, attack: barLen * 0.3, lp: 500 }, t);
    if (mode === 'over') { if (s === 0) tom(D(0.6), t, 55, 0.4, 0.8); return; }
    if (!night) {
      const pat = [1, 0, 0, 1, 0, 0, 1, 0, 1, 0, 0, 1, 0, 1, 0, 0];
      if (pat[s]) tom(D(0.2), t, s % 8 === 0 ? 100 : 150, 0.1);
      if (s % 2 === 0) blast(D(), { type: 'highpass', f0: 6500, dur: 0.03, vol: 0.006, delay: at0(t) });
      return;
    }
    if (s === 0 || s === 6 || s === 8 || s === 11 || (I > 0.5 && (s === 3 || s === 14))) tom(D(0.3), t, 58, 0.42, 0.4);   // taiko
    if (s === 4 || s === 12) tom(D(0.2), t, 140, 0.22);
    if (I > 0.3 && s >= 13) tom(D(0.15), t, 210 + (s - 13) * 30, 0.12, 0.15);                                           // roll into the bar
    if (s % 2 === 1 && I > 0.2) blast(D(), { type: 'highpass', f0: 7000, dur: 0.025, vol: 0.008 + I * 0.008, delay: at0(t) });
    if (m.boss && (s === 2 || s === 10)) tom(D(0.5), t, 45, 0.5, 0.6);
    if (s === 0) bow(D(0.3), t, chord[0] - 12, barLen * 0.9, 0.012, 260 + I * 400, 0.3);
  }
  // Horror strings: slow swells by day; a sawing ostinato that tightens as the night gets worse
  function stringVoice(t, step, mode) {
    const bar = Math.floor(step / 16), s = step % 16, m = music, night = mode === 'night', I = m.intensity;
    const chord = CH[PROG[mode][bar % PROG[mode].length]], barLen = 16 * 60 / BPM[mode] / 4;
    const D = (w, e) => dest(mus, 0, w || 0, e || 0);
    if (s === 0) chord.forEach((n) => bow(D(0.5), t, n - (night ? 12 : 0), barLen * 0.95, night ? 0.01 : 0.014, night ? 700 : 1400, barLen * 0.4));
    if (!night) {
      if (mode !== 'over' && s === 8 && hash(step * 7 + 1) < 0.5) bow(D(0.5, 0.3), t, PENTA[Math.floor(hash(step * 13) * PENTA.length)], barLen * 0.5, 0.012, 2200, 0.3);
      return;
    }
    tone(D(0.15), { wave: 'sawtooth', f0: hz(chord[0] - 12 + (s % 4 === 0 ? 12 : 0)), detune: s % 2 ? 7 : -7, dur: 0.09,     // ostinato
      vol: 0.022 + I * 0.016, attack: 0.01, lp: 800 + I * 1600, q: 0.6 }, t);
    if (I > 0.6 && s % 2 === 0) { bow(D(0.4), t, chord[2] + 12, 0.12, 0.005, 3000); bow(D(0.4), t, chord[2] + 13, 0.12, 0.004, 3000); }
    if (m.blood && s === 8) bow(D(0.5), t, chord[0] + 1, barLen * 0.4, 0.008, 1500, 0.2);
    if (m.boss && (s === 0 || s === 6)) for (const o of [-24, -12]) tone(D(0.3), { wave: 'sawtooth', f0: hz(chord[0] + o), dur: 0.5, vol: 0.05, attack: 0.02, lp: 300, lp1: 1600, lpT: 0.15, q: 2 }, t);
  }
  const ctx = (step, mode) => {
    const bar = Math.floor(step / 16), s = step % 16, prog = PROG[mode];
    return { bar, s, chord: CH[prog[bar % prog.length]], barLen: 16 * 60 / BPM[mode] / 4, night: mode === 'night', I: music.intensity, m: music,
      D: (w, e) => dest(mus, 0, w || 0, e || 0) };
  };
  const kick = (D, t, v) => tone(D, { f0: 150, f1: 45, sweep: 0.1, dur: 0.18, vol: v }, t);
  const hat = (D, t, v) => blast(D, { type: 'highpass', f0: 8000, dur: 0.02, vol: v, delay: at0(t) });
  const snare = (D, t, v) => { blast(D, { type: 'bandpass', f0: 1800, q: 0.7, dur: 0.12, vol: v, delay: at0(t) }); tone(D, { f0: 220, f1: 140, dur: 0.07, vol: v * 0.6 }, t); };
  // Chiptune: square-wave arpeggios and a bouncing bass, like an old console game
  function chipVoice(t, step, mode) {
    const { s, chord, night, I, m, D } = ctx(step, mode);
    if (mode === 'over') { if (s % 4 === 0) tone(D(0.2), { wave: 'square', f0: hz(chord[(s / 4) % 3] + 12 - s / 2), dur: 0.3, vol: 0.02, lp: 3000 }, t); return; }
    const every = night ? 1 : 2;
    if (s % every === 0) tone(D(0.1), { wave: 'square', f0: hz(chord[(s / every) % 3] + (night ? 24 : 12)), dur: 0.09, vol: night ? 0.016 : 0.014, lp: 4000 }, t);
    if (s % 4 === 0) tone(D(), { wave: 'square', f0: hz(chord[0] - 12 + (s % 8 === 4 ? 7 : 0)), dur: 0.18, vol: 0.03, lp: 1800 }, t);
    if (night) {
      if (s % 4 === 0) kick(D(), t, 0.22 + I * 0.1);
      if (s % 2 === 1 && I > 0.3) hat(D(), t, 0.012);
      if (m.boss && s % 8 === 6) tone(D(), { wave: 'square', f0: hz(chord[0] + 1), dur: 0.12, vol: 0.02, lp: 3000 }, t);
    }
  }
  // Synthwave: gated pads, an echoing arpeggio, punchy drums at night - an 80s horror soundtrack
  function waveVoice(t, step, mode) {
    const { s, chord, night, I, m, D, barLen } = ctx(step, mode);
    if (s === 0) chord.forEach((n, i) => tone(D(0.4), { wave: 'sawtooth', f0: hz(n), detune: i * 6 - 6, dur: barLen * 0.95, vol: 0.016, attack: barLen * 0.15, lp: 1800, lp1: 700, lpT: barLen, q: 1.5 }, t));
    if (mode === 'over') return;
    if (s % 2 === 0) tone(D(0.15, 0.45), { wave: 'sawtooth', f0: hz(chord[(s / 2) % 3] + 12 + (s >= 8 ? 12 : 0)), dur: 0.12, vol: 0.014, lp: 2500, lp1: 800 }, t);
    if (!night) { if (s === 0 || s === 8) tone(D(), { wave: 'sawtooth', f0: hz(chord[0] - 12), dur: barLen * 0.45, vol: 0.03, lp: 400 }, t); return; }
    if (s % 2 === 0) tone(D(), { wave: 'sawtooth', f0: hz(chord[0] - 12 + (s % 4 === 2 ? 12 : 0)), dur: 0.13, vol: 0.04, lp: 300 + I * 600, q: 3 }, t);
    if (s % 8 === 0) kick(D(), t, 0.3);
    if (s % 8 === 4) snare(D(0.4), t, 0.1 + I * 0.05);
    if (s % 2 === 1) hat(D(), t, 0.008 + I * 0.006);
    if (m.boss && s === 0) tone(D(0.5), { wave: 'sawtooth', f0: hz(chord[0] - 24), dur: barLen, vol: 0.05, lp: 200, lp1: 1200, lpT: barLen * 0.5, q: 4 }, t);
  }
  // Creepy music box: a slightly out-of-tune wind-up box; at night it plays faster and wronger over a low hum
  function boxVoice(t, step, mode) {
    const { s, chord, night, I, m, D, barLen } = ctx(step, mode);
    const bell = (n, v, dl) => { const f = hz(n) * (1 + (hash(step * 9 + n) - 0.5) * 0.012); tone(D(0.4, 0.3), { f0: f, dur: 1.4, vol: v }, t + (dl || 0)); tone(D(0.4), { f0: f * 2.76, dur: 0.5, vol: v * 0.25 }, t + (dl || 0)); };
    if (night) {
      if (s === 0) tone(D(0.5), { wave: 'triangle', f0: hz(chord[0] - 24), dur: barLen, vol: 0.05, attack: barLen * 0.3, lp: 300 }, t);
      if (s % (I > 0.5 ? 1 : 2) === 0) bell(PENTA[Math.floor(hash(step * 7 + 1) * PENTA.length)] + 12 + (hash(step) < 0.15 ? 1 : 0), 0.022);
      if (m.boss && s % 4 === 0) bell(chord[0] + 13, 0.02);
      return;
    }
    if (s % 2 === 0 && (mode !== 'over' || s % 4 === 0) && hash(step * 3 + 5) < 0.75) bell(PENTA[(Math.floor(step / 2) * 3) % PENTA.length] + 12, 0.026);
    if (s === 0) bell(chord[0], 0.02);
  }
  // Industrial: clanking metal, a grinding bass and a machine-like pulse
  function ironVoice(t, step, mode) {
    const { s, chord, night, I, m, D, barLen } = ctx(step, mode);
    const clank = (f, v) => { blast(D(0.4), { type: 'bandpass', f0: f, q: 12, dur: 0.25, vol: v, delay: at0(t) }); blast(D(0.4), { type: 'bandpass', f0: f * 1.47, q: 14, dur: 0.18, vol: v * 0.6, delay: at0(t) }); };
    if (s === 0) blast(D(0.3), { type: 'bandpass', f0: 300, f1: 180, q: 1, dur: barLen, vol: 0.012, attack: barLen * 0.3, delay: at0(t) });
    if (!night) {
      if (mode !== 'over' && s % 8 === 4 && hash(step * 5) < 0.6) clank(R(1500, 2600), 0.05);
      if (s === 0) tone(D(0.3), { wave: 'sawtooth', f0: hz(chord[0] - 24), dur: barLen, vol: 0.03, attack: barLen * 0.3, lp: 180, q: 4 }, t);
      return;
    }
    if (s % 4 === 0) kick(D(), t, 0.34);
    const pat = [1, 0, 1, 1, 0, 1, 0, 1];
    if (s % 2 === 0 && pat[(s / 2) % 8]) tone(D(), { wave: 'sawtooth', f0: hz(chord[0] - 24), dur: 0.12, vol: 0.06, lp: 220 + I * 500, q: 8 }, t);
    if (s % 8 === 4) clank(2200, 0.06 + I * 0.04);
    if (I > 0.4 && s % 2 === 1) hat(D(), t, 0.01);
    if (m.boss && (s === 2 || s === 10)) clank(900, 0.1);
  }
  // Dark choir: wordless voices, an "ah" by day and a low chant at night
  function choirVoice(t, step, mode) {
    const { s, chord, night, I, m, D, barLen } = ctx(step, mode);
    const AH = [[800, 800, 6, 1.2], [1150, 1150, 7, 0.6]], OH = [[450, 450, 6, 1.3], [800, 800, 7, 0.5]];
    if (s === 0) {
      chord.forEach((n, i) => voice(D(0.6), { f0: hz(n - (night ? 12 : 0)), f1: hz(n - (night ? 12 : 0)), dur: barLen * 0.95, vol: 0.022, attack: barLen * 0.35, vib: 4.5 + i * 0.4, vibAmt: 0.008, formants: night ? OH : AH, delay: at0(t) }));
    }
    if (night && s % 8 === 0) voice(D(0.4), { f0: hz(chord[0] - 24), f1: hz(chord[0] - 24), dur: 0.5, vol: 0.05 + I * 0.03, attack: 0.04, vib: 3, vibAmt: 0.01, formants: OH, delay: at0(t) });
    if (night && m.boss && s === 8) voice(D(0.6), { f0: hz(chord[2] + 13), f1: hz(chord[2] + 12), dur: barLen * 0.4, vol: 0.02, attack: 0.2, vib: 6, vibAmt: 0.02, formants: AH, delay: at0(t) });
    if (night && s % 4 === 0) tone(D(), { f0: 90, f1: 45, dur: 0.2, vol: 0.12 + I * 0.1 }, t);
  }
  // ---- pieces shared by the choir / drone / war-drum family
  const AH = [[800, 800, 6, 1.2], [1150, 1150, 7, 0.6]], OH = [[450, 450, 6, 1.3], [800, 800, 7, 0.5]], OO = [[320, 320, 6, 1.4], [700, 700, 7, 0.4]];
  function choirPad(D, t, notes, len, vol, formants, vib) {
    notes.forEach((n, i) => voice(D, { f0: hz(n), f1: hz(n), dur: len, vol, attack: len * 0.35, vib: (vib || 4.5) + i * 0.4, vibAmt: 0.008, formants, delay: at0(t) }));
  }
  function heartbeat(D, t, s, I) {
    const k = I > 0.6 ? 2 : I > 0.3 ? 4 : 8;
    if (s % k === 0) { tone(D, { f0: 72, f1: 40, sweep: 0.1, dur: 0.14, vol: 0.3 }, t); tone(D, { f0: 64, f1: 38, sweep: 0.1, dur: 0.12, vol: 0.19 }, t + 0.17); }
  }
  function lowDrone(D, t, root, len, vol) {
    tone(D, { f0: hz(root - 12), dur: len, vol, attack: len * 0.4 }, t);
    tone(D, { wave: 'triangle', f0: hz(root - 5), dur: len, vol: vol * 0.35, attack: len * 0.5, lp: 500 }, t);
  }
  function warTaiko(D, t, s, I, boss) {         // the War drums night pattern: taiko, toms and a roll into each bar
    if (s === 0 || s === 6 || s === 8 || s === 11 || (I > 0.5 && (s === 3 || s === 14))) tom(D, t, 58, 0.42, 0.4);
    if (s === 4 || s === 12) tom(D, t, 140, 0.22);
    if (I > 0.3 && s >= 13) tom(D, t, 210 + (s - 13) * 30, 0.12, 0.15);
    if (boss && (s === 2 || s === 10)) tom(D, t, 45, 0.5, 0.6);
  }
  function bellToll(D, t, n, vol) { const f = hz(n); tone(D, { f0: f, dur: 3, vol }, t); tone(D, { f0: f * 2.76, dur: 1.2, vol: vol * 0.3 }, t); tone(D, { f0: f * 0.5, dur: 3.5, vol: vol * 0.5 }, t); }
  // Requiem: the Dark choir over the Dread drone, a heartbeat at night, and the war drums when a boss is out
  function requiemVoice(t, step, mode) {
    const { s, bar, chord, night, I, m, D, barLen } = ctx(step, mode);
    if (s === 0 && bar % 2 === 0) lowDrone(D(0.5), t, chord[0], barLen * 2, 0.06);
    if (s === 0) choirPad(D(0.6), t, chord.map((n) => n - (night ? 12 : 0)), barLen * 0.95, 0.018, night ? OH : AH);
    if (night) { if (m.boss) warTaiko(D(0.3), t, s, I, true); else heartbeat(D(), t, s, I); }
  }
  // Ritual: monks chanting low over hand drums by day; at night the chant drives the full war drums
  function ritualVoice(t, step, mode) {
    const { s, chord, night, I, m, D, barLen } = ctx(step, mode);
    if (s === 0 || s === 8) voice(D(0.4), { f0: hz(chord[0] - 24), f1: hz(chord[0] - 24), dur: barLen * 0.48, vol: 0.05, attack: 0.08, vib: 3, vibAmt: 0.01, formants: OO, delay: at0(t) });
    if (s === 0) choirPad(D(0.5), t, [chord[0] - 12, chord[2] - 12], barLen * 0.95, 0.014, OO, 3.5);
    if (mode === 'over') return;
    if (!night) { const pat = [1, 0, 0, 1, 0, 0, 1, 0, 1, 0, 0, 1, 0, 1, 0, 0]; if (pat[s]) tom(D(0.2), t, s % 8 === 0 ? 100 : 150, 0.09); return; }
    warTaiko(D(0.3), t, s, I, m.boss);
    if (s === 4 && I > 0.5) voice(D(0.5), { f0: hz(chord[0] - 12), f1: hz(chord[0] - 10), dur: 0.35, vol: 0.06, attack: 0.02, vib: 6, vibAmt: 0.02, formants: AH, delay: at0(t) });   // a shout
  }
  // Cathedral: an organ drone and choir under stone arches; a bell tolls the bars at night; war drums for bosses
  function cathedralVoice(t, step, mode) {
    const { s, bar, chord, night, I, m, D, barLen } = ctx(step, mode);
    if (s === 0) {
      for (const [o, v] of [[-24, 0.03], [-12, 0.02], [-5, 0.012]]) tone(D(0.7), { wave: 'sawtooth', f0: hz(chord[0] + o), dur: barLen * 0.98, vol: v, attack: barLen * 0.2, lp: 700, q: 0.5 }, t);
      chord.forEach((n) => tone(D(0.7), { f0: hz(n), dur: barLen * 0.98, vol: 0.016, attack: barLen * 0.2 }, t));
      choirPad(D(0.7), t, chord, barLen * 0.95, 0.012, night ? OH : AH);
    }
    if (night && s === 0) bellToll(D(0.7), t, chord[0] + 12, 0.04 + I * 0.02);
    if (!night && s === 0 && bar % 4 === 0) bellToll(D(0.7), t, chord[0] + 12, 0.025);
    if (night && m.boss) warTaiko(D(0.4), t, s, I, true);
  }
  // Abyss: almost nothing - a sub drone and far-away choir swells; the heartbeat at night; for a boss, huge slow taiko
  function abyssVoice(t, step, mode) {
    const { s, bar, chord, night, I, m, D, barLen } = ctx(step, mode);
    if (s === 0 && bar % 2 === 0) { lowDrone(D(0.6), t, chord[0] - 12, barLen * 2, 0.08); blast(D(0.5), { type: 'bandpass', f0: 420, f1: 240, sweep: barLen * 2, q: 1.2, dur: barLen * 1.9, vol: 0.01, attack: barLen * 0.7, delay: at0(t) }); }
    if (s === 8 && bar % 2 === 1) choirPad(D(0.8), t, [chord[2] + 12], barLen * 1.4, 0.012, OO, 3);
    if (!night) return;
    if (m.boss) { if (s === 0 || s === 8) tom(D(0.6), t, 42, 0.6, 0.9); if (s === 12) tom(D(0.5), t, 50, 0.4, 0.6); }
    else heartbeat(D(), t, s, I);
  }
  // Funeral march: a slow procession - the war drums in a march, a low choir and a bell; tighter as the night worsens
  function funeralVoice(t, step, mode) {
    const { s, bar, chord, night, I, m, D, barLen } = ctx(step, mode);
    if (s === 0) choirPad(D(0.6), t, [chord[0] - 12, chord[1] - 12, chord[2] - 12], barLen * 0.95, 0.016, OH, 3.5);
    if (s === 0 && bar % 2 === 0) bellToll(D(0.6), t, chord[0], 0.03);
    if (mode === 'over') { if (s === 0) tom(D(0.6), t, 55, 0.35, 0.8); return; }
    if (s === 0 || s === 8) tom(D(0.3), t, 58, night ? 0.4 : 0.22, 0.45);
    if (s === 14 || (s === 15 && night)) tom(D(0.2), t, 120, night ? 0.16 : 0.08, 0.2);        // the pickup into each step of the march
    if (night && I > 0.4 && s % 2 === 1) tom(D(0.15), t, 260, 0.05, 0.08);                    // snare-like rattle
    if (night && m.boss) warTaiko(D(0.3), t, s, I, true);
  }
  const MUSIC_STYLES = {
    synth: { name: 'Dark synth', desc: 'Moody synth pads by day; a driving bass and kick at night.', fn: synthVoice },
    drone: { name: 'Dread drone', desc: 'Near silence: deep drones, cold wind and a heartbeat that races as the fight gets worse.', fn: droneVoice },
    drums: { name: 'War drums', desc: 'Hand drums by day; pounding taiko and toms at night.', fn: drumVoice },
    strings: { name: 'Horror strings', desc: 'Slow string swells by day; sawing, tightening strings at night, like a horror film.', fn: stringVoice },
    chip: { name: 'Chiptune', desc: 'Square-wave arpeggios and a bouncing bass, like an old console game.', fn: chipVoice },
    wave: { name: 'Synthwave', desc: '80s horror-movie synths: gated pads, an echoing arpeggio, punchy drums at night.', fn: waveVoice },
    musicbox: { name: 'Creepy music box', desc: 'A slightly out-of-tune wind-up box. At night it plays faster and wronger over a low hum.', fn: boxVoice },
    iron: { name: 'Industrial', desc: 'Clanking metal, a grinding bass and a machine-like pulse.', fn: ironVoice },
    choir: { name: 'Dark choir', desc: 'Wordless voices: a soft "ah" by day, a low chant and drum at night.', fn: choirVoice },
    requiem: { name: 'Requiem', desc: 'The Dark choir over the Dread drone, a heartbeat at night, and the war drums when a boss is out.', fn: requiemVoice },
    ritual: { name: 'Ritual', desc: 'Monks chanting low over hand drums by day; at night the chant drives the full war drums.', fn: ritualVoice },
    cathedral: { name: 'Cathedral', desc: 'Organ drone and choir under stone arches; a bell tolls each bar at night; war drums for bosses.', fn: cathedralVoice },
    abyss: { name: 'Abyss', desc: 'Almost nothing: a sub drone and far-off choir swells, the heartbeat at night, huge slow taiko for a boss.', fn: abyssVoice },
    funeral: { name: 'Funeral march', desc: 'A slow procession: war drums in a march, low choir and a bell, tightening as the night gets worse.', fn: funeralVoice },
  };
  let musicStyle = 'synth';
  try { const g = localStorage.getItem('le_musicstyle'); if (MUSIC_STYLES[g]) musicStyle = g; } catch (e) { /* defaults */ }
  function voiceAt(t, step, mode) { (MUSIC_STYLES[(preview && preview.style) || musicStyle] || MUSIC_STYLES.synth).fn(t, step, mode); }
  // preview: play a mode (day / night) for a few seconds, whatever the game is doing
  let preview = null;
  // the game is paused: the soundtrack holds its breath (a preview from the audio settings still plays)
  const musicHeld = () => music.paused && !(preview && Date.now() <= preview.until);
  let heldWas = false;
  function schedule() {
    if (preview && Date.now() > preview.until) preview = null;
    const held = musicHeld();
    if (held !== heldWas) { heldWas = held; applyGains(); }
    if (!ac || ac.state !== 'running' || !musicOn || muted || held) { music.nextStep = -1; return; }
    const mode = preview ? preview.mode : music.mode, stepMs = 60000 / BPM[mode] / 4;
    const now = clock();
    const key = mode + '|' + ((preview && preview.style) || musicStyle);
    if (key !== music.lastMode) { music.lastMode = key; music.nextStep = -1; }
    if (music.nextStep < 0) music.nextStep = Math.floor(now / stepMs) + 1;
    const ahead = 220;
    while (music.nextStep * stepMs < now + ahead) {
      const at = ac.currentTime + (music.nextStep * stepMs - now) / 1000;
      if (at >= ac.currentTime - 0.01) {
        const keep = music.intensity;
        if (preview && mode === 'night') music.intensity = 0.7;              // preview the night at full tension
        try { voiceAt(Math.max(at, ac.currentTime), music.nextStep, mode); } catch (e) { /* ignore */ }
        music.intensity = keep;
      }
      music.nextStep++;
    }
  }
  // Called often by the page: what the game is doing right now.
  function setMusic(state) {
    music.mode = PROG[state.mode] ? state.mode : 'menu';
    music.intensity = Math.max(0, Math.min(1, state.intensity || 0));
    music.boss = !!state.boss; music.blood = !!state.blood;
    const p = !!state.paused;
    if (p !== music.paused) { music.paused = p; heldWas = musicHeld(); applyGains(); }
  }

  function applyGains() {
    if (!master) return;
    const t = ac.currentTime;
    master.gain.setTargetAtTime(muted ? 0 : 0.9 * vol.master, t, 0.03);
    // paused: fade out over a fraction of a second (notes already playing die away instead of cutting off)
    mus.gain.setTargetAtTime(musicOn && !musicHeld() ? 0.55 * vol.music : 0, t, musicHeld() ? 0.12 : 0.03);
    sfx.gain.setTargetAtTime(vol.sfx, t, 0.03);
  }
  function toggleMute() { muted = !muted; applyGains(); return muted; }
  function setMuted(v) { muted = !!v; applyGains(); }
  function setMusicOn(v) { musicOn = !!v; applyGains(); }
  // Volumes 0..1, remembered on this device.
  function setVolumes(v) {
    for (const k of ['master', 'music', 'sfx']) if (typeof v[k] === 'number') vol[k] = Math.max(0, Math.min(1, v[k]));
    try { localStorage.setItem('le_vol', JSON.stringify(vol)); } catch (e) { /* private mode */ }
    applyGains();
  }

  // Sound for a game event (every screen that shows the game uses this).
  function event(e) {
    switch (e.type) {
      case 'shot': shot(e.wid, e.x); break;
      case 'fireHit': case 'fireOut':
      case 'hit': case 'die': case 'explosion': case 'acid': case 'structHit': case 'structDie': case 'hurt':
      case 'scream': case 'leap': case 'land': case 'surface': case 'charge': case 'split': case 'brood':
        play(e.type, e.x); break;
      case 'arc': if (!e.quiet) play('arc', e.pts[0].x); break;
      case 'build': play(e.armed ? 'reload' : 'build', e.x); break;
      case 'lift': play('swap'); break;
      case 'reload': play('reload', e.x); break;
      case 'raise': play('raise', e.x); break;
      case 'tarFire': play('tarFire', e.x); break;
      case 'shrug': play('shrug', e.x); break;
      case 'ricochet': play('ricochet', e.x); break;
      case 'spikes': play('spikes', e.x); break;
      case 'hellStart': play('hellStart', e.x); break;
      case 'emp': play('emp', e.x); break;
      case 'sunOn': play('sunOn', e.x); break;
      case 'supply': play('supply'); break;
      case 'nova': play('nova', e.x); break;
      case 'stomp': play('stomp', e.x); break;
      case 'crit': play('crit', e.x); break;
      case 'wyrm': play(e.ztype === 'gorewyrm' ? 'gorewyrm' : 'wyrm'); break;
      case 'sell': case 'down': case 'revive': case 'slam': case 'boss': case 'over': case 'elite': case 'wyrmDie':
        play(e.type); break;
      case 'sever':
        play(e.type); break;
      case 'nightStart': play('nightStart'); break;
      case 'dawn': if (!e.first) play('dawn'); break;
    }
  }

  // ---- style choices (this device only)
  const list = (o) => Object.keys(o).map((id) => ({ id, name: o[id].name, desc: o[id].desc }));
  function setGunStyle(id) {
    if (!GUN_STYLES[id]) return;
    gunStyle = id;
    try { localStorage.setItem('le_gunstyle', id); } catch (e) { /* private mode */ }
  }
  function setMusicStyle(id) {
    if (!MUSIC_STYLES[id]) return;
    musicStyle = id;
    try { localStorage.setItem('le_musicstyle', id); } catch (e) { /* private mode */ }
  }
  // fire a short demo volley in a gun style: pistol, rifle, shotgun, sniper, an SMG burst and a turret burst
  function previewGuns(id) {
    init();
    if (!ac) return;
    if (muted) setMuted(false);            // asking to hear it means you want sound on
    const seq = [['pistol', 0], ['pistol', 0.25], ['rifle', 0.7], ['rifle', 0.82], ['rifle', 0.94], ['shotgun', 1.4], ['sniper', 2.5]];
    for (let i = 0; i < 8; i++) seq.push(['smg', 3.7 + i * 0.075]);
    for (let i = 0; i < 6; i++) seq.push(['turret', 4.6 + i * 0.12]);
    for (const [g, at] of seq) setTimeout(() => { try { gunFn(g, id)(dest(sfx, 0, WET[g] || 0.08)); } catch (e) { /* ignore */ } }, at * 1000);
  }
  // hear a soundtrack style for a while. keep: also make it this device's choice (otherwise just an audition)
  function previewMusic(id, mode, keep, seconds) {
    init();
    if (id && keep) setMusicStyle(id);
    preview = { mode: mode === 'day' ? 'day' : 'night', until: Date.now() + (seconds || 14) * 1000, style: id && MUSIC_STYLES[id] ? id : null };
    if (!musicOn) setMusicOn(true);
    if (muted) setMuted(false);
  }
  // one shot of one gun in a style (sound test page)
  function previewGun(style, name) {
    init();
    if (muted) setMuted(false);
    try { gunFn(name, style)(dest(sfx, 0, WET[name] || 0.08)); } catch (e) { /* ignore */ }
  }

  root.AudioFX = {
    gunStyles: list(GUN_STYLES), musicStyles: list(MUSIC_STYLES),
    getGunStyle: () => gunStyle, getMusicStyle: () => musicStyle, setGunStyle, setMusicStyle, previewGuns, previewGun, previewMusic,
    previewing: () => (preview && Date.now() < preview.until ? { style: preview.style, mode: preview.mode, left: (preview.until - Date.now()) / 1000 } : null),
    stopPreview: () => { preview = null; },
    init, play, shot, event, setMusic, toggleMute, setMuted, setMusicOn, setVolumes, getVolumes: () => Object.assign({}, vol),
    setClock: (fn) => { clock = fn; },
    isMuted: () => muted, isMusicOn: () => musicOn,
    debug: () => ({ state: ac ? ac.state : 'none', mode: music.mode, intensity: music.intensity, step: music.nextStep }),
    setAmbient: () => {},     // kept for older callers; the soundtrack replaces the old ambience
  };
})(window);
