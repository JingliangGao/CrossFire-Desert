let ctx: AudioContext | null = null;
let muted = false;

try {
  muted = localStorage.getItem("piying.mute") === "1";
} catch {
  muted = false;
}

function ac(): AudioContext | null {
  if (muted) return null;
  if (!ctx) {
    const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
  }
  if (ctx.state === "suspended") void ctx.resume();
  return ctx;
}

type Wave = OscillatorType;

function blip(freq: number, to: number, dur: number, type: Wave, gain = 0.14, delay = 0) {
  const c = ac();
  if (!c) return;
  const t = c.currentTime + delay;
  const osc = c.createOscillator();
  const g = c.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t);
  osc.frequency.exponentialRampToValueAtTime(Math.max(40, to), t + dur);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(gain, t + 0.008);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  osc.connect(g).connect(c.destination);
  osc.start(t);
  osc.stop(t + dur + 0.02);
}

function noise(dur: number, gain = 0.18, lp = 1600, delay = 0) {
  const c = ac();
  if (!c) return;
  const t = c.currentTime + delay;
  const len = Math.floor(c.sampleRate * dur);
  const buf = c.createBuffer(1, len, c.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
  const src = c.createBufferSource();
  src.buffer = buf;
  const f = c.createBiquadFilter();
  f.type = "lowpass";
  f.frequency.setValueAtTime(lp, t);
  const g = c.createGain();
  g.gain.setValueAtTime(gain, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  src.connect(f).connect(g).connect(c.destination);
  src.start(t);
}

export const sfx = {
  get muted() {
    return muted;
  },
  toggle(): boolean {
    muted = !muted;
    try {
      localStorage.setItem("piying.mute", muted ? "1" : "0");
    } catch {
      /* ignore */
    }
    if (!muted) ac();
    return muted;
  },
  unlock() {
    ac();
  },
  jump() {
    blip(420, 780, 0.14, "triangle", 0.11);
  },
  coin() {
    blip(980, 1560, 0.07, "square", 0.07);
    blip(1470, 1980, 0.09, "square", 0.05, 0.05);
  },
  stomp(combo: number) {
    blip(180 + combo * 40, 60 + combo * 30, 0.16, "square", 0.12);
    noise(0.1, 0.1, 900);
  },
  hurt() {
    blip(320, 70, 0.34, "sawtooth", 0.12);
    noise(0.3, 0.14, 700);
  },
  over() {
    blip(300, 120, 0.5, "triangle", 0.12);
    blip(200, 70, 0.7, "triangle", 0.1, 0.14);
    noise(0.4, 0.08, 500, 0.1);
  },
  start() {
    blip(520, 660, 0.1, "triangle", 0.1);
    blip(660, 990, 0.16, "triangle", 0.1, 0.09);
  },
};
