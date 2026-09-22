let ctx: AudioContext | null = null;
let muted = false;
try {
  muted = localStorage.getItem("cf.mute") === "1";
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

function noise(dur: number, gain: number, lp: number, hp = 0, delay = 0) {
  const c = ac();
  if (!c) return;
  const t = c.currentTime + delay;
  const len = Math.max(1, Math.floor(c.sampleRate * dur));
  const buf = c.createBuffer(1, len, c.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 1.6);
  const src = c.createBufferSource();
  src.buffer = buf;
  const f = c.createBiquadFilter();
  f.type = "lowpass";
  f.frequency.setValueAtTime(lp, t);
  f.frequency.exponentialRampToValueAtTime(Math.max(120, lp * 0.25), t + dur);
  if (hp) {
    const h = c.createBiquadFilter();
    h.type = "highpass";
    h.frequency.setValueAtTime(hp, t);
    src.connect(f).connect(h);
    h.connect(c.destination);
  } else {
    src.connect(f).connect(c.destination);
  }
  const g = c.createGain();
  g.gain.setValueAtTime(gain, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  src.disconnect();
  src.connect(f);
  f.disconnect();
  f.connect(g).connect(c.destination);
  if (hp) {
    const h = c.createBiquadFilter();
    h.type = "highpass";
    h.frequency.setValueAtTime(hp, t);
    f.disconnect();
    f.connect(h).connect(g).connect(c.destination);
  }
  src.start(t);
}

function tone(freq: number, to: number, dur: number, type: OscillatorType, gain = 0.1, delay = 0) {
  const c = ac();
  if (!c) return;
  const t = c.currentTime + delay;
  const o = c.createOscillator();
  const g = c.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, t);
  o.frequency.exponentialRampToValueAtTime(Math.max(30, to), t + dur);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(gain, t + 0.006);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g).connect(c.destination);
  o.start(t);
  o.stop(t + dur + 0.02);
}

export const snd = {
  get muted() {
    return muted;
  },
  toggle(): boolean {
    muted = !muted;
    try {
      localStorage.setItem("cf.mute", muted ? "1" : "0");
    } catch {
      /* ignore */
    }
    if (!muted) ac();
    return muted;
  },
  unlock() {
    ac();
  },
  shot(kind: "rifle" | "sniper" | "pistol" | "smg" | "shotgun" | "rocket" | "lmg") {
    if (kind === "sniper") {
      noise(0.4, 0.5, 5200, 90);
      tone(150, 45, 0.3, "sawtooth", 0.16);
    } else if (kind === "shotgun") {
      noise(0.22, 0.48, 2800, 80);
      tone(110, 40, 0.18, "sawtooth", 0.14);
    } else if (kind === "rocket") {
      noise(0.35, 0.3, 1800, 60);
      tone(220, 70, 0.28, "sawtooth", 0.1);
    } else if (kind === "pistol") {
      noise(0.14, 0.32, 4200, 140);
      tone(220, 70, 0.1, "square", 0.08);
    } else if (kind === "smg" || kind === "lmg") {
      noise(0.07, 0.22, 4200, 180);
      tone(210, 80, 0.05, "square", 0.05);
    } else {
      noise(0.1, 0.28, 3800, 160);
      tone(180, 60, 0.07, "square", 0.06);
    }
  },
  blast() {
    noise(0.5, 0.55, 900, 40);
    tone(90, 36, 0.55, "sawtooth", 0.2);
  },
  whoosh() {
    noise(0.28, 0.12, 2200, 180);
  },
  jet() {
    noise(0.45, 0.16, 2400, 300);
    tone(520, 180, 0.4, "sawtooth", 0.06);
  },
  heli() {
    noise(0.5, 0.1, 900, 80);
    tone(70, 90, 0.4, "sawtooth", 0.05);
  },
  ufo() {
    tone(640, 980, 0.35, "sine", 0.07);
    tone(420, 260, 0.4, "sine", 0.05, 0.05);
  },
  alien() {
    tone(980, 420, 0.1, "sawtooth", 0.05);
  },
  hit(head: boolean) {
    tone(head ? 1450 : 900, head ? 1750 : 700, 0.07, "square", 0.07);
    if (head) tone(2100, 2400, 0.06, "square", 0.05, 0.05);
  },
  kill() {
    tone(520, 780, 0.1, "triangle", 0.08);
    tone(780, 1180, 0.12, "triangle", 0.07, 0.08);
  },
  reload() {
    noise(0.05, 0.18, 2400, 400);
    noise(0.06, 0.16, 1800, 300, 0.5);
    tone(320, 240, 0.05, "square", 0.05, 0.5);
  },
  swap() {
    noise(0.06, 0.14, 2600, 500);
  },
  hurt() {
    tone(200, 60, 0.3, "sawtooth", 0.14);
  },
  enemyShot(dist: number) {
    const g = Math.max(0.02, 0.2 * (1 - dist / 70));
    noise(0.09, g, 2600, 120);
  },
  step() {
    noise(0.05, 0.05, 900);
  },
  die() {
    tone(160, 40, 0.8, "sawtooth", 0.18);
    noise(0.5, 0.14, 800);
  },
  click() {
    tone(600, 500, 0.04, "square", 0.04);
  },
};
