// js/audio.js — SFX + Procedural Music Engine (overhauled)
let ctx, master, engGain, engOsc, engOsc2, subOsc, tireGain, windGain, turboGain, turboOsc;
let musicGain, musicCompressor, musicPlaying = false, currentTrack = -1;
let musicNodes = [];
let loopHandle = null;
let lastBackfire = 0;
let duckTarget = 1;

export function init(volume) {
  if (ctx) return;
  ctx = new (window.AudioContext || window.webkitAudioContext)();
  if (ctx.state === 'suspended') ctx.resume().catch(() => {});

  master = ctx.createGain(); master.gain.value = volume * .5;
  const masterComp = ctx.createDynamicsCompressor();
  masterComp.threshold.value = -8; masterComp.ratio.value = 4; masterComp.attack.value = .003; masterComp.release.value = .25;
  master.connect(masterComp); masterComp.connect(ctx.destination);

  musicGain = ctx.createGain(); musicGain.gain.value = .12;
  musicCompressor = ctx.createDynamicsCompressor();
  musicCompressor.threshold.value = -16; musicCompressor.ratio.value = 6;
  musicGain.connect(musicCompressor); musicCompressor.connect(master);

  // Engine layers
  engGain = ctx.createGain(); engGain.gain.value = 0;
  const ef = ctx.createBiquadFilter(); ef.type = 'lowpass'; ef.frequency.value = 900;
  engGain.connect(ef); ef.connect(master);

  engOsc = ctx.createOscillator(); engOsc.type = 'sawtooth'; engOsc.frequency.value = 80; engOsc.connect(engGain); engOsc.start();
  engOsc2 = ctx.createOscillator(); engOsc2.type = 'square'; engOsc2.frequency.value = 160;
  const g2 = ctx.createGain(); g2.gain.value = .12; engOsc2.connect(g2); g2.connect(engGain); engOsc2.start();
  subOsc = ctx.createOscillator(); subOsc.type = 'sine'; subOsc.frequency.value = 40;
  const sg = ctx.createGain(); sg.gain.value = .25; subOsc.connect(sg); sg.connect(engGain); subOsc.start();
  const h3 = ctx.createOscillator(); h3.type = 'triangle'; h3.frequency.value = 240;
  const h3g = ctx.createGain(); h3g.gain.value = .05; h3.connect(h3g); h3g.connect(engGain); h3.start();

  // Turbo whistle (nitro)
  turboOsc = ctx.createOscillator(); turboOsc.type = 'sine'; turboOsc.frequency.value = 800;
  turboGain = ctx.createGain(); turboGain.gain.value = 0;
  turboOsc.connect(turboGain); turboGain.connect(master); turboOsc.start();

  // Tire noise
  const bs = ctx.sampleRate * 2;
  const tn = ctx.createBufferSource(); const nb = ctx.createBuffer(1, bs, ctx.sampleRate);
  const nd = nb.getChannelData(0); for (let i = 0; i < bs; i++) nd[i] = Math.random() * 2 - 1;
  tn.buffer = nb; tn.loop = true;
  tireGain = ctx.createGain(); tireGain.gain.value = 0;
  const tf = ctx.createBiquadFilter(); tf.type = 'bandpass'; tf.frequency.value = 2200; tf.Q.value = .6;
  tn.connect(tf); tf.connect(tireGain); tireGain.connect(master); tn.start();

  // Wind noise
  const wn = ctx.createBufferSource(); const wb = ctx.createBuffer(1, bs, ctx.sampleRate);
  const wd = wb.getChannelData(0); for (let i = 0; i < bs; i++) wd[i] = Math.random() * 2 - 1;
  wn.buffer = wb; wn.loop = true;
  windGain = ctx.createGain(); windGain.gain.value = 0;
  const wf = ctx.createBiquadFilter(); wf.type = 'highpass'; wf.frequency.value = 3500;
  wn.connect(wf); wf.connect(windGain); windGain.connect(master); wn.start();
}

export function setVolume(v) { if (master) master.gain.value = v * .5; }
export function isReady() { return !!ctx; }
export function resume() { if (ctx && ctx.state === 'suspended') ctx.resume().catch(() => {}); }

export function muteEngine() {
  if (!ctx) return;
  const t = ctx.currentTime;
  engGain.gain.setTargetAtTime(0, t, .05);
  tireGain.gain.setTargetAtTime(0, t, .05);
  windGain.gain.setTargetAtTime(0, t, .05);
  turboGain.gain.setTargetAtTime(0, t, .05);
}

let prevThrottle = 0, prevRpm = 0;
export function updateEngine(rpm, absSpeed, throttle, isDrift, engineOn, nitro = false) {
  if (!ctx || !engOsc) return;
  const t = ctx.currentTime;
  if (engineOn) {
    const bf = 55 + rpm * 200 + absSpeed * 45;
    engOsc.frequency.setTargetAtTime(bf, t, .02);
    engOsc2.frequency.setTargetAtTime(bf * 2, t, .02);
    subOsc.frequency.setTargetAtTime(bf * .5, t, .03);
    engGain.gain.setTargetAtTime((.06 + throttle * .12 + absSpeed * .04) * duckTarget, t, .04);
    // Backfire: throttle release at high rpm
    if (prevThrottle > .5 && throttle < .2 && prevRpm > .75 && t - lastBackfire > .3) {
      backfire();
      lastBackfire = t;
    }
  } else engGain.gain.setTargetAtTime(0, t, .1);
  tireGain.gain.setTargetAtTime(isDrift ? .07 : absSpeed * .008, t, .04);
  windGain.gain.setTargetAtTime(absSpeed * .025, t, .08);
  // Turbo whistle (subtle when nitro)
  if (nitro) {
    turboOsc.frequency.setTargetAtTime(700 + rpm * 600, t, .04);
    turboGain.gain.setTargetAtTime(.025, t, .08);
  } else turboGain.gain.setTargetAtTime(0, t, .15);
  prevThrottle = throttle; prevRpm = rpm;
}

function backfire() {
  if (!ctx) return;
  const t = ctx.currentTime;
  const n = ctx.createBufferSource(), buf = ctx.createBuffer(1, ctx.sampleRate * .08 | 0, ctx.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * Math.exp(-i / (ctx.sampleRate * .015));
  n.buffer = buf;
  const g = ctx.createGain(); g.gain.value = .25;
  const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 350;
  n.connect(f); f.connect(g); g.connect(master); n.start();
  duck(.15);
}

function duck(amount) {
  if (!ctx) return;
  duckTarget = 1 - amount;
  if (musicGain) musicGain.gain.setTargetAtTime(.12 * duckTarget, ctx.currentTime, .05);
  setTimeout(() => {
    duckTarget = 1;
    if (musicGain && ctx) musicGain.gain.setTargetAtTime(.12, ctx.currentTime, .3);
  }, 250);
}

export function sfx(type, intensity) {
  if (!ctx) return;
  const t = ctx.currentTime;
  if (type === 'hit') {
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.type = 'sine'; o.frequency.value = 80 + Math.random() * 80;
    g.gain.setValueAtTime(Math.min(intensity * .3, .4), t); g.gain.exponentialRampToValueAtTime(.001, t + .25);
    o.connect(g); g.connect(master); o.start(); o.stop(t + .3);
    const n = ctx.createBufferSource(), buf = ctx.createBuffer(1, ctx.sampleRate * .15 | 0, ctx.sampleRate);
    const d = buf.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * Math.exp(-i / (ctx.sampleRate * .04));
    n.buffer = buf; const ng = ctx.createGain(); ng.gain.value = Math.min(intensity * .15, .2);
    n.connect(ng); ng.connect(master); n.start();
    duck(Math.min(intensity * .3, .4));
  } else if (type === 'nit') {
    const o = ctx.createOscillator(); o.type = 'sawtooth';
    o.frequency.setValueAtTime(200, t); o.frequency.exponentialRampToValueAtTime(900, t + .4);
    const g = ctx.createGain(); g.gain.setValueAtTime(.1, t); g.gain.exponentialRampToValueAtTime(.001, t + .7);
    o.connect(g); g.connect(master); o.start(); o.stop(t + .8);
  } else if (type === 'gear') {
    // Upshift: quick clutch click + engine rev blip
    const o = ctx.createOscillator(); o.type = 'square';
    o.frequency.setValueAtTime(320, t); o.frequency.exponentialRampToValueAtTime(150, t + .06);
    const g = ctx.createGain(); g.gain.setValueAtTime(.07, t); g.gain.exponentialRampToValueAtTime(.001, t + .08);
    o.connect(g); g.connect(master); o.start(); o.stop(t + .12);
    // rev blip layer
    const r = ctx.createOscillator(); r.type = 'sawtooth';
    r.frequency.setValueAtTime(180, t); r.frequency.exponentialRampToValueAtTime(420, t + .05); r.frequency.exponentialRampToValueAtTime(220, t + .14);
    const rg = ctx.createGain(); rg.gain.setValueAtTime(.05, t); rg.gain.exponentialRampToValueAtTime(.001, t + .16);
    const rf = ctx.createBiquadFilter(); rf.type = 'lowpass'; rf.frequency.value = 1200;
    r.connect(rf); rf.connect(rg); rg.connect(master); r.start(); r.stop(t + .18);
  } else if (type === 'beep') {
    const o = ctx.createOscillator(); o.frequency.value = intensity || 440;
    const g = ctx.createGain(); g.gain.setValueAtTime(.18, t); g.gain.exponentialRampToValueAtTime(.001, t + .3);
    o.connect(g); g.connect(master); o.start(); o.stop(t + .3);
  } else if (type === 'coin') {
    [800, 1000, 1200, 1500].forEach((f, i) => {
      const o = ctx.createOscillator(); o.frequency.value = f; o.type = 'sine';
      const g = ctx.createGain(); g.gain.setValueAtTime(.08, t + i * .06); g.gain.exponentialRampToValueAtTime(.001, t + i * .06 + .2);
      o.connect(g); g.connect(master); o.start(t + i * .06); o.stop(t + i * .06 + .25);
    });
  } else if (type === 'boost') {
    // Boost pad pickup
    const o = ctx.createOscillator(); o.type = 'sawtooth';
    o.frequency.setValueAtTime(150, t); o.frequency.exponentialRampToValueAtTime(1500, t + .3);
    const g = ctx.createGain(); g.gain.setValueAtTime(.15, t); g.gain.exponentialRampToValueAtTime(.001, t + .35);
    o.connect(g); g.connect(master); o.start(); o.stop(t + .4);
  } else if (type === 'warn') {
    const o = ctx.createOscillator(); o.frequency.value = 320; o.type = 'square';
    const g = ctx.createGain(); g.gain.setValueAtTime(.06, t); g.gain.exponentialRampToValueAtTime(.001, t + .12);
    o.connect(g); g.connect(master); o.start(); o.stop(t + .15);
  } else if (type === 'ach') {
    [523, 659, 784, 1046].forEach((f, i) => {
      const o = ctx.createOscillator(); o.type = 'triangle'; o.frequency.value = f;
      const g = ctx.createGain(); g.gain.setValueAtTime(.1, t + i * .1); g.gain.exponentialRampToValueAtTime(.001, t + i * .1 + .3);
      o.connect(g); g.connect(master); o.start(t + i * .1); o.stop(t + i * .1 + .35);
    });
  } else if (type === 'lap') {
    // Lap complete chime
    [659, 880].forEach((f, i) => {
      const o = ctx.createOscillator(); o.type = 'sine'; o.frequency.value = f;
      const g = ctx.createGain(); g.gain.setValueAtTime(.12, t + i * .12); g.gain.exponentialRampToValueAtTime(.001, t + i * .12 + .4);
      o.connect(g); g.connect(master); o.start(t + i * .12); o.stop(t + i * .12 + .45);
    });
  }
}

// ============ PROCEDURAL MUSIC ============
const TRACKS = ['Night Drive', 'Neon Rush', 'Midnight Cruise', 'Cyber Highway', 'Retro Wave'];
export function getTrackName() { return currentTrack >= 0 ? TRACKS[currentTrack] : 'Off'; }

export function nextTrack() {
  stopMusic();
  currentTrack = (currentTrack + 1) % TRACKS.length;
  startMusic(currentTrack);
  return TRACKS[currentTrack];
}

export function stopMusic() {
  if (loopHandle) { clearInterval(loopHandle); loopHandle = null; }
  musicNodes.forEach(n => { try { n.stop(); } catch {} });
  musicNodes = [];
  musicPlaying = false;
}

function startMusic(idx) {
  if (!ctx) return;
  musicPlaying = true;
  const tracks = [playNightDrive, playNeonRush, playMidnightCruise, playCyberHighway, playRetroWave];
  (tracks[idx] || playNightDrive)();
}

function scheduleNotes(freqs, type, startTime, noteLen, gv, filterFreq) {
  const t = ctx.currentTime + startTime;
  freqs.forEach((f, i) => {
    if (f === 0) return;
    const o = ctx.createOscillator(); o.type = type; o.frequency.value = f;
    const g = ctx.createGain(); g.gain.setValueAtTime(gv, t + i * noteLen);
    g.gain.exponentialRampToValueAtTime(.001, t + i * noteLen + noteLen * .9);
    if (filterFreq) {
      const flt = ctx.createBiquadFilter(); flt.type = 'lowpass'; flt.frequency.value = filterFreq;
      o.connect(flt); flt.connect(g);
    } else o.connect(g);
    g.connect(musicGain); o.start(t + i * noteLen); o.stop(t + i * noteLen + noteLen);
    musicNodes.push(o);
  });
}

function scheduleKick(times, startTime, gv) {
  times.forEach(t => {
    const o = ctx.createOscillator(), g = ctx.createGain();
    const at = ctx.currentTime + startTime + t;
    o.frequency.setValueAtTime(150, at); o.frequency.exponentialRampToValueAtTime(40, at + .08);
    g.gain.setValueAtTime(gv, at); g.gain.exponentialRampToValueAtTime(.001, at + .1);
    o.connect(g); g.connect(musicGain); o.start(at); o.stop(at + .12);
    musicNodes.push(o);
  });
}

function scheduleHihat(times, startTime, gv) {
  times.forEach(t => {
    const at = ctx.currentTime + startTime + t;
    const n = ctx.createBufferSource(), buf = ctx.createBuffer(1, ctx.sampleRate * .05 | 0, ctx.sampleRate);
    const d = buf.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * Math.exp(-i / (ctx.sampleRate * .012));
    n.buffer = buf;
    const f = ctx.createBiquadFilter(); f.type = 'highpass'; f.frequency.value = 6000;
    const g = ctx.createGain(); g.gain.value = gv;
    n.connect(f); f.connect(g); g.connect(musicGain); n.start(at);
    musicNodes.push(n);
  });
}

function loopTrack(fn, intervalSec) {
  fn();
  loopHandle = setInterval(() => { if (musicPlaying) fn(); else { clearInterval(loopHandle); loopHandle = null; } }, intervalSec * 1000);
}

function playNightDrive() {
  const bpm = 120, beat = 60 / bpm;
  const bassNotes = [55, 55, 73.4, 73.4, 65.4, 65.4, 82.4, 82.4];
  const padChord1 = [220, 277, 330];
  const padChord2 = [196, 247, 294];
  const melody = [440, 0, 523, 494, 440, 0, 392, 440, 523, 0, 587, 523, 494, 440, 392, 0];
  loopTrack(() => {
    if (!musicPlaying) return;
    scheduleNotes(bassNotes, 'sawtooth', 0, beat, .06, 300);
    padChord1.forEach(f => scheduleNotes([f, f, f, f], 'sine', 0, beat * 2, .025));
    padChord2.forEach(f => scheduleNotes([f, f, f, f], 'sine', beat * 4, beat * 2, .025));
    scheduleNotes(melody, 'triangle', 0, beat * .5, .03, 2000);
    scheduleKick([0, beat * 2, beat * 4, beat * 6], 0, .15);
    scheduleHihat([beat, beat * 3, beat * 5, beat * 7], 0, .04);
  }, beat * 8);
}

function playNeonRush() {
  const bpm = 140, beat = 60 / bpm;
  const bass = [82.4, 0, 82.4, 82.4, 0, 110, 98, 0, 82.4, 0, 82.4, 82.4, 0, 73.4, 82.4, 0];
  const arp = [330, 415, 494, 659, 494, 415, 330, 247, 294, 370, 440, 587, 440, 370, 294, 220];
  loopTrack(() => {
    if (!musicPlaying) return;
    scheduleNotes(bass, 'square', 0, beat * .5, .05, 250);
    scheduleNotes(arp, 'sawtooth', 0, beat * .25, .02, 3000);
    scheduleKick([0, beat, beat * 2, beat * 3, beat * 4, beat * 5, beat * 6, beat * 7], 0, .14);
    scheduleHihat(Array.from({length: 16}, (_, i) => i * beat * .5), 0, .03);
  }, beat * 8);
}

function playMidnightCruise() {
  const bpm = 95, beat = 60 / bpm;
  const pad = [165, 196, 247, 220, 165, 196, 247, 262];
  const bass = [55, 0, 55, 0, 65.4, 0, 73.4, 0];
  loopTrack(() => {
    if (!musicPlaying) return;
    scheduleNotes(pad, 'sine', 0, beat, .035);
    scheduleNotes(bass, 'sine', 0, beat, .04, 200);
    const shimmer = Array.from({length: 16}, () => 600 + Math.random() * 400);
    scheduleNotes(shimmer, 'sine', 0, beat * .5, .008);
    scheduleKick([0, beat * 4], 0, .1);
  }, beat * 8);
}

function playCyberHighway() {
  const bpm = 128, beat = 60 / bpm;
  const bass = [110, 110, 0, 110, 146.8, 0, 110, 0, 98, 0, 110, 110, 130.8, 0, 110, 0];
  const lead = [659, 0, 587, 523, 659, 0, 784, 698, 587, 0, 523, 494, 587, 659, 523, 0];
  const pad = [220, 277, 329];
  loopTrack(() => {
    if (!musicPlaying) return;
    scheduleNotes(bass, 'sawtooth', 0, beat * .5, .055, 320);
    scheduleNotes(lead, 'square', 0, beat * .5, .025, 2200);
    pad.forEach(f => scheduleNotes([f, f], 'sine', 0, beat * 4, .02));
    scheduleKick([0, beat, beat * 2, beat * 3, beat * 4, beat * 5, beat * 6, beat * 7], 0, .15);
    scheduleHihat(Array.from({length: 16}, (_, i) => beat * .5 * i + beat * .25), 0, .035);
  }, beat * 8);
}

function playRetroWave() {
  const bpm = 110, beat = 60 / bpm;
  const bass = [73.4, 73.4, 73.4, 0, 110, 0, 98, 82.4];
  const arp1 = [294, 370, 440, 587, 440, 370, 294, 220];
  const arp2 = [330, 415, 494, 659, 494, 415, 330, 247];
  loopTrack(() => {
    if (!musicPlaying) return;
    scheduleNotes(bass, 'triangle', 0, beat, .05, 280);
    scheduleNotes(arp1, 'sawtooth', 0, beat * .5, .025, 2500);
    scheduleNotes(arp2, 'sawtooth', beat * 4, beat * 0.5, .025, 2500);
    scheduleKick([0, beat * 2, beat * 4, beat * 6], 0, .14);
    scheduleHihat(Array.from({length: 8}, (_, i) => i * beat + beat * .5), 0, .03);
  }, beat * 8);
}

export function startDefaultMusic() {
  if (!ctx) return;
  currentTrack = 0;
  startMusic(0);
}
