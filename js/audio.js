// js/audio.js — SFX + Procedural Music Engine
let ctx, master, engGain, engOsc, engOsc2, subOsc, tireGain, windGain;
let musicGain, musicPlaying = false, currentTrack = -1;
let musicNodes = []; // active music oscillators/sources

export function init(volume) {
  ctx = new (window.AudioContext || window.webkitAudioContext)();
  master = ctx.createGain(); master.gain.value = volume * .5; master.connect(ctx.destination);
  musicGain = ctx.createGain(); musicGain.gain.value = .12; musicGain.connect(master);

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

export function updateEngine(rpm, absSpeed, throttle, isDrift, engineOn) {
  if (!ctx || !engOsc) return;
  const t = ctx.currentTime;
  if (engineOn) {
    const bf = 55 + rpm * 200 + absSpeed * 45;
    engOsc.frequency.setTargetAtTime(bf, t, .02);
    engOsc2.frequency.setTargetAtTime(bf * 2, t, .02);
    subOsc.frequency.setTargetAtTime(bf * .5, t, .03);
    engGain.gain.setTargetAtTime(.06 + throttle * .12 + absSpeed * .04, t, .04);
  } else engGain.gain.setTargetAtTime(0, t, .1);
  tireGain.gain.setTargetAtTime(isDrift ? .07 : absSpeed * .008, t, .04);
  windGain.gain.setTargetAtTime(absSpeed * .025, t, .08);
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
  } else if (type === 'nit') {
    const o = ctx.createOscillator(); o.type = 'sawtooth';
    o.frequency.setValueAtTime(200, t); o.frequency.exponentialRampToValueAtTime(900, t + .4);
    const g = ctx.createGain(); g.gain.setValueAtTime(.1, t); g.gain.exponentialRampToValueAtTime(.001, t + .7);
    o.connect(g); g.connect(master); o.start(); o.stop(t + .8);
  } else if (type === 'gear') {
    const o = ctx.createOscillator(); o.type = 'square';
    o.frequency.setValueAtTime(350, t); o.frequency.exponentialRampToValueAtTime(150, t + .06);
    const g = ctx.createGain(); g.gain.setValueAtTime(.08, t); g.gain.exponentialRampToValueAtTime(.001, t + .08);
    o.connect(g); g.connect(master); o.start(); o.stop(t + .12);
  } else if (type === 'beep') {
    const o = ctx.createOscillator(); o.frequency.value = intensity || 440;
    const g = ctx.createGain(); g.gain.setValueAtTime(.18, t); g.gain.exponentialRampToValueAtTime(.001, t + .3);
    o.connect(g); g.connect(master); o.start(); o.stop(t + .3);
  } else if (type === 'coin') {
    [800, 1000, 1200].forEach((f, i) => {
      const o = ctx.createOscillator(); o.frequency.value = f; o.type = 'sine';
      const g = ctx.createGain(); g.gain.setValueAtTime(.08, t + i * .08); g.gain.exponentialRampToValueAtTime(.001, t + i * .08 + .2);
      o.connect(g); g.connect(master); o.start(t + i * .08); o.stop(t + i * .08 + .25);
    });
  }
}

// ============ PROCEDURAL MUSIC ============
const TRACKS = ['Night Drive', 'Neon Rush', 'Midnight Cruise'];
export function getTrackName() { return currentTrack >= 0 ? TRACKS[currentTrack] : 'Off'; }

export function nextTrack() {
  stopMusic();
  currentTrack = (currentTrack + 1) % TRACKS.length;
  startMusic(currentTrack);
  return TRACKS[currentTrack];
}

export function stopMusic() {
  musicNodes.forEach(n => { try { n.stop(); } catch {} });
  musicNodes = [];
  musicPlaying = false;
}

function startMusic(idx) {
  if (!ctx) return;
  musicPlaying = true;
  if (idx === 0) playNightDrive();
  else if (idx === 1) playNeonRush();
  else playMidnightCruise();
}

function noteFreq(note, octave) {
  const notes = { C:0,D:2,E:4,F:5,G:7,A:9,B:11 };
  return 440 * Math.pow(2, (notes[note[0]] + (note[1]==='#'?1:0) - 9) / 12 + (octave - 4));
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

function loopTrack(fn, intervalSec) {
  fn();
  const id = setInterval(() => { if (musicPlaying) fn(); else clearInterval(id); }, intervalSec * 1000);
  musicNodes._loopId = id;
}

function playNightDrive() {
  const bpm = 120, beat = 60 / bpm;
  const bassNotes = [55, 55, 73.4, 73.4, 65.4, 65.4, 82.4, 82.4]; // A1 A1 D2 D2 C2 C2 E2 E2
  const padChord1 = [220, 277, 330]; // Am
  const padChord2 = [196, 247, 294]; // G
  const melody = [440, 0, 523, 494, 440, 0, 392, 440, 523, 0, 587, 523, 494, 440, 392, 0];

  loopTrack(() => {
    if (!musicPlaying) return;
    // Bass
    scheduleNotes(bassNotes, 'sawtooth', 0, beat, .06, 300);
    // Pad
    padChord1.forEach(f => scheduleNotes([f, f, f, f], 'sine', 0, beat * 2, .025));
    padChord2.forEach(f => scheduleNotes([f, f, f, f], 'sine', beat * 4, beat * 2, .025));
    // Melody
    scheduleNotes(melody, 'triangle', 0, beat * .5, .03, 2000);
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
    // Ambient shimmer
    const shimmer = Array.from({length:16}, () => 600 + Math.random() * 400);
    scheduleNotes(shimmer, 'sine', 0, beat * .5, .008);
  }, beat * 8);
}

export function startDefaultMusic() {
  if (!ctx) return;
  currentTrack = 0;
  startMusic(0);
}
