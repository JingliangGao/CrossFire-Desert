import { sfx } from "./audio";

export type Status = "attract" | "playing" | "paused" | "over";

export interface HudState {
  score: number;
  coins: number;
  combo: number;
  lives: number;
  meters: number;
}

export type OnHud = (h: HudState, s: Status) => void;

export const VW = 960;
export const VH = 540;
const GROUND_Y = 430;
const GRAV = 2350;
const MAX_FALL = 1150;
const JUMP_V = 805;
const RUN_SPD = 305;
const ACCEL = 2400;
const FRICTION_G = 2800;
const FRICTION_A = 900;

const INK = "#1B0F09";
const LAMP = "#FFE9B8";
const CINNABAR = "#D1402F";
const GILD = "#E0A73C";
const JADE = "#4E8C72";

type SolidKind = "ground" | "plat" | "block";
interface Solid {
  x: number;
  y: number;
  w: number;
  h: number;
  kind: SolidKind;
}
interface Coin {
  x: number;
  y: number;
  got: boolean;
}
interface Enemy {
  x: number;
  y: number;
  w: number;
  h: number;
  vx: number;
  minX: number;
  maxX: number;
  kind: "imp" | "moth";
  alive: boolean;
  die: number;
  base: number;
  t: number;
}
interface Part {
  x: number;
  y: number;
  vx: number;
  vy: number;
  rot: number;
  vr: number;
  s: number;
  life: number;
  max: number;
  col: string;
  g: number;
}
interface Floater {
  x: number;
  y: number;
  vy: number;
  life: number;
  text: string;
  col: string;
}
interface Decor {
  x: number;
  kind: number;
}

interface Player {
  x: number;
  y: number;
  w: number;
  h: number;
  vx: number;
  vy: number;
  face: number;
  onGround: boolean;
  coyote: number;
  buffer: number;
  invuln: number;
  phase: number;
  dying: number;
  land: number;
}

const rnd = (a: number, b: number) => a + Math.random() * (b - a);
const clamp = (v: number, a: number, b: number) => (v < a ? a : v > b ? b : v);

export class Game {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private onHud: OnHud;
  private raf = 0;
  private last = 0;
  private acc = 0;
  private freeze = 0;
  private paper: HTMLImageElement | null = null;
  private ro: ResizeObserver | null = null;

  status: Status = "attract";
  private solids: Solid[] = [];
  private coins: Coin[] = [];
  private enemies: Enemy[] = [];
  private decor: Decor[] = [];
  private parts: Part[] = [];
  private floats: Floater[] = [];

  private p: Player = {
    x: 120,
    y: GROUND_Y - 54,
    w: 26,
    h: 54,
    vx: 0,
    vy: 0,
    face: 1,
    onGround: true,
    coyote: 0,
    buffer: 0,
    invuln: 0,
    phase: 0,
    dying: 0,
    land: 0,
  };

  private cam = { x: 0, shake: 0, sx: 0, sy: 0 };
  private genX = 0;
  private maxX = 120;
  private lastSafe = { x: 120, y: GROUND_Y - 54 };
  private t = 0;
  private score = 0;
  private coinsN = 0;
  private combo = 0;
  private comboT = 0;
  private lives = 3;
  private meters = 0;
  private hud: HudState = { score: 0, coins: 0, combo: 0, lives: 3, meters: 0 };
  private hudStatus: Status = "attract";
  private input = { move: 0, jump: false, jumpEdge: false };
  private scale = 1;
  private offX = 0;
  private offY = 0;

  constructor(canvas: HTMLCanvasElement, onHud: OnHud) {
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d", { alpha: false })!;
    this.onHud = onHud;
    const img = new Image();
    img.src = "images/paper.jpg";
    img.onload = () => (this.paper = img);
    this.buildWorld(true);
    this.resize();
    if (typeof ResizeObserver !== "undefined") {
      this.ro = new ResizeObserver(() => this.resize());
      this.ro.observe(canvas);
    }
    window.addEventListener("resize", this.resize);
    this.loop(performance.now());
    this.emit();
  }

  destroy() {
    cancelAnimationFrame(this.raf);
    this.ro?.disconnect();
    window.removeEventListener("resize", this.resize);
  }

  private resize = () => {
    const r = this.canvas.getBoundingClientRect();
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const cw = Math.max(1, Math.round(r.width * dpr));
    const ch = Math.max(1, Math.round(r.height * dpr));
    if (this.canvas.width !== cw || this.canvas.height !== ch) {
      this.canvas.width = cw;
      this.canvas.height = ch;
    }
    const s = Math.min(cw / VW, ch / VH);
    this.scale = s;
    this.offX = (cw - VW * s) / 2;
    this.offY = (ch - VH * s) / 2;
  };

  // ---------------------------------------------------------------- world gen
  private buildWorld(fresh: boolean) {
    this.solids = [];
    this.coins = [];
    this.enemies = [];
    this.decor = [];
    this.parts = [];
    this.floats = [];
    this.genX = 0;
    if (fresh) {
      this.addGround(-400, 1100, "ground");
      this.genX = 700;
    }
    this.generate();
  }

  private addGround(x: number, w: number, kind: SolidKind, y = GROUND_Y) {
    this.solids.push({ x, y, w, h: kind === "ground" ? 150 : 22, kind });
    for (let d = x + 60; d < x + w - 60; d += rnd(170, 260)) {
      this.decor.push({ x: d, kind: Math.floor(rnd(0, 4)) });
    }
  }

  private coinArc(x: number, y: number, n: number, spread = 34, up = 46) {
    for (let i = 0; i < n; i++) {
      const u = n === 1 ? 0 : i / (n - 1);
      this.coins.push({ x: x + u * spread * (n - 1), y: y - Math.sin(u * Math.PI) * up, got: false });
    }
  }

  private addImp(x: number, y: number, minX: number, maxX: number) {
    this.enemies.push({
      x,
      y: y - 32,
      w: 30,
      h: 32,
      vx: Math.random() < 0.5 ? -62 : 62,
      minX,
      maxX,
      kind: "imp",
      alive: true,
      die: 0,
      base: y - 32,
      t: rnd(0, 6),
    });
  }

  private addMoth(x: number, y: number) {
    this.enemies.push({
      x,
      y,
      w: 34,
      h: 24,
      vx: Math.random() < 0.5 ? -78 : 78,
      minX: x - 120,
      maxX: x + 120,
      kind: "moth",
      alive: true,
      die: 0,
      base: y,
      t: rnd(0, 6),
    });
  }

  private generate() {
    while (this.genX < this.cam.x + VW + 520) {
      const d = clamp(this.genX / 17000, 0, 1);
      const first = this.genX < 900;
      const w = rnd(300, 500);
      const x = this.genX;
      this.addGround(x, w, "ground");

      if (Math.random() < 0.75) this.coinArc(x + 60, GROUND_Y - 60, 4 + Math.floor(rnd(0, 3)));

      if (!first && Math.random() < 0.42 + 0.3 * d) {
        this.addImp(x + w * rnd(0.35, 0.8), GROUND_Y, x + 6, x + w - 36);
      }
      if (!first && Math.random() < 0.22 + 0.22 * d) {
        this.addMoth(x + rnd(60, w - 60), GROUND_Y - rnd(120, 210));
      }

      // floating platform cluster
      if (Math.random() < 0.5) {
        const pw = rnd(110, 190);
        const px = x + rnd(20, Math.max(40, w - pw - 20));
        const py = GROUND_Y - rnd(86, 116);
        this.addGround(px, pw, "plat", py);
        this.coinArc(px + 12, py - 34, Math.max(2, Math.floor(pw / 40)), 34);
        if (Math.random() < 0.3 + 0.2 * d) this.addImp(px + 20, py, px + 4, px + pw - 34);
        if (Math.random() < 0.28) {
          const p2w = rnd(90, 150);
          this.addGround(px + rnd(-40, 60), p2w, "plat", py - rnd(70, 84));
          this.coinArc(px + rnd(-20, 40), py - 130, 3, 32);
        }
      }

      // stone steps
      if (!first && Math.random() < 0.22) {
        let sx = x + rnd(30, 80);
        const steps = 2 + Math.floor(rnd(0, 2));
        for (let i = 0; i < steps; i++) {
          this.addGround(sx, 74, "block", GROUND_Y - 30 - i * 30);
          sx += 82;
        }
        this.coinArc(sx - 82 * steps + 12, GROUND_Y - 30 - steps * 30 - 30, steps + 1, 34);
      }

      // gap
      let gap = first ? 0 : Math.random() < 0.22 ? 0 : rnd(78, 105 + 62 * d);
      if (gap > 130 && Math.random() < 0.5) {
        // bridge platform over a wide gap
        this.addGround(x + w + 8, gap - 16, "plat", GROUND_Y - rnd(72, 96));
        this.coinArc(x + w + 30, GROUND_Y - 140, 3, 32);
        gap = 0;
      }
      if (gap > 0) this.coinArc(x + w + 6, GROUND_Y - 74, 3, 30, 34);

      this.genX = x + w + gap;
    }
    // cull
    const left = this.cam.x - 700;
    if (this.solids.length > 220) this.solids = this.solids.filter((s) => s.x + s.w > left);
    if (this.coins.length > 160) this.coins = this.coins.filter((c) => c.x > left);
    if (this.enemies.length > 60) this.enemies = this.enemies.filter((e) => e.x > left);
    if (this.decor.length > 200) this.decor = this.decor.filter((e) => e.x > this.cam.x * 0.46 - 300);
  }

  private solidAt(px: number, py: number): boolean {
    for (let i = 0; i < this.solids.length; i++) {
      const s = this.solids[i];
      if (px > s.x && px < s.x + s.w && py > s.y && py < s.y + s.h) return true;
    }
    return false;
  }

  // ------------------------------------------------------------------- input
  setMove(dir: number) {
    this.input.move = dir;
  }
  setJump(down: boolean) {
    if (down && !this.input.jump) this.input.jumpEdge = true;
    this.input.jump = down;
    if (down) sfx.unlock();
  }
  startGame() {
    this.status = "playing";
    this.score = 0;
    this.coinsN = 0;
    this.combo = 0;
    this.lives = 3;
    this.meters = 0;
    this.maxX = 120;
    this.cam.shake = 0;
    this.buildWorld(true);
    this.p = {
      x: 120,
      y: GROUND_Y - 54,
      w: 26,
      h: 54,
      vx: 0,
      vy: 0,
      face: 1,
      onGround: true,
      coyote: 0,
      buffer: 0,
      invuln: 0.6,
      phase: 0,
      dying: 0,
      land: 0,
    };
    this.lastSafe = { x: 120, y: GROUND_Y - 54 };
    this.cam.x = 0;
    sfx.start();
    this.emit();
  }
  togglePause(): Status {
    if (this.status === "playing") this.status = "paused";
    else if (this.status === "paused") this.status = "playing";
    this.emit();
    return this.status;
  }
  pause() {
    if (this.status === "playing") {
      this.status = "paused";
      this.emit();
    }
  }
  toAttract() {
    this.status = "attract";
    this.buildWorld(true);
    this.p.x = 120;
    this.p.y = GROUND_Y - 54;
    this.p.dying = 0;
    this.p.vx = 0;
    this.cam.x = 0;
    this.emit();
  }

  private emit() {
    const h: HudState = {
      score: Math.floor(this.score),
      coins: this.coinsN,
      combo: this.combo,
      lives: this.lives,
      meters: this.meters,
    };
    if (
      h.score !== this.hud.score ||
      h.coins !== this.hud.coins ||
      h.combo !== this.hud.combo ||
      h.lives !== this.hud.lives ||
      h.meters !== this.hud.meters ||
      this.hudStatus !== this.status
    ) {
      this.hud = h;
      this.hudStatus = this.status;
      this.onHud(h, this.status);
    }
  }

  // -------------------------------------------------------------------- loop
  private loop = (now: number) => {
    this.raf = requestAnimationFrame(this.loop);
    let dt = (now - this.last) / 1000;
    this.last = now;
    if (!isFinite(dt) || dt <= 0) dt = 1 / 60;
    if (dt > 0.1) dt = 0.1;
    this.acc += dt;
    let guard = 0;
    while (this.acc >= 1 / 120 && guard++ < 8) {
      const step = Math.min(1 / 60, this.acc);
      this.acc -= step;
      if (this.freeze > 0) {
        this.freeze -= step;
      } else {
        this.update(step);
      }
    }
    this.draw();
  };

  private update(dt: number) {
    this.t += dt;
    const active = this.status === "playing" || this.status === "attract";
    if (!active) {
      this.stepParts(dt);
      return;
    }

    const p = this.p;

    // ---- attract-mode puppet master
    let move = this.input.move;
    let wantJump = this.input.jumpEdge;
    if (this.status === "attract") {
      move = 1;
      const fx = p.x + p.w + 34;
      const groundAhead = this.solidAt(fx, p.y + p.h + 14) || this.solidAt(fx + 24, p.y + p.h + 14);
      const foeAhead = this.enemies.some(
        (e) => e.alive && e.x > p.x && e.x - (p.x + p.w) < 62 && Math.abs(e.y - p.y) < 60,
      );
      wantJump = p.onGround && (!groundAhead || foeAhead || (this.t > 0.5 && Math.abs(p.vx) < 40));
    }
    this.input.jumpEdge = false;

    if (p.dying > 0) {
      p.dying -= dt;
      p.vy = Math.min(MAX_FALL, p.vy + GRAV * 0.35 * dt);
      p.y += p.vy * dt;
      p.x += p.vx * dt;
      this.stepParts(dt);
      if (p.dying <= 0) this.afterDeath();
      this.camera(dt);
      this.generate();
      return;
    }

    // ---- horizontal
    const acc = p.onGround ? ACCEL : ACCEL * 0.72;
    if (move !== 0) {
      p.vx += move * acc * dt;
      p.face = move > 0 ? 1 : -1;
      if (Math.abs(p.vx) > RUN_SPD) p.vx = RUN_SPD * Math.sign(p.vx);
    } else {
      const f = (p.onGround ? FRICTION_G : FRICTION_A) * dt;
      if (Math.abs(p.vx) <= f) p.vx = 0;
      else p.vx -= f * Math.sign(p.vx);
    }

    // ---- jump (buffer + coyote + variable height)
    p.coyote = p.onGround ? 0.1 : Math.max(0, p.coyote - dt);
    p.buffer = wantJump ? 0.12 : Math.max(0, p.buffer - dt);
    if (p.buffer > 0 && p.coyote > 0) {
      p.vy = -JUMP_V;
      p.onGround = false;
      p.coyote = 0;
      p.buffer = 0;
      sfx.jump();
      this.burst(p.x + p.w / 2, p.y + p.h, 5, LAMP, 90, Math.PI, Math.PI);
    }
    const jumpHeld = this.status === "attract" ? true : this.input.jump;
    if (!jumpHeld && p.vy < -300) p.vy = -300;

    // ---- integrate + collide (axis separated)
    p.vy = Math.min(MAX_FALL, p.vy + GRAV * dt);
    p.x += p.vx * dt;
    this.collide(p, true);
    const wasAir = !p.onGround;
    p.onGround = false;
    p.y += p.vy * dt;
    this.collide(p, false);
    if (p.onGround && wasAir) {
      p.land = 1;
      this.burst(p.x + p.w / 2, p.y + p.h, 6, "rgba(27,15,9,0.5)", 110, Math.PI * 0.15, Math.PI * 0.7);
    }
    p.land = Math.max(0, p.land - dt * 5);
    if (p.onGround) p.phase += Math.abs(p.vx) * dt * 0.055;
    else p.phase += dt * 2;
    p.invuln = Math.max(0, p.invuln - dt);

    // ---- camera
    this.camera(dt);
    this.generate();

    // ---- coins
    const cx = p.x + p.w / 2;
    const cy = p.y + p.h / 2;
    for (let i = 0; i < this.coins.length; i++) {
      const c = this.coins[i];
      if (c.got) continue;
      const dx = c.x - cx;
      const dy = c.y - cy;
      if (dx * dx + dy * dy < 30 * 30) {
        c.got = true;
        this.coinsN++;
        this.score += 10;
        sfx.coin();
        this.burst(c.x, c.y, 8, GILD, 170);
        this.floats.push({ x: c.x, y: c.y - 8, vy: -52, life: 0.7, text: "+10", col: GILD });
      }
    }

    // ---- enemies
    for (let i = 0; i < this.enemies.length; i++) {
      const e = this.enemies[i];
      e.t += dt;
      if (!e.alive) {
        e.die -= dt;
        continue;
      }
      e.x += e.vx * dt;
      if (e.x < e.minX) {
        e.x = e.minX;
        e.vx = Math.abs(e.vx);
      }
      if (e.x > e.maxX) {
        e.x = e.maxX;
        e.vx = -Math.abs(e.vx);
      }
      if (e.kind === "moth") e.y = e.base + Math.sin(e.t * 2.2) * 26;

      // overlap with player
      if (
        p.x < e.x + e.w &&
        p.x + p.w > e.x &&
        p.y < e.y + e.h &&
        p.y + p.h > e.y &&
        p.invuln <= 0
      ) {
        const stomp = p.vy > 60 && p.y + p.h - e.y < 26;
        if (stomp) {
          e.alive = false;
          e.die = 0.5;
          this.combo = this.comboT > 0 ? this.combo + 1 : 1;
          this.comboT = 3;
          const gain = 50 * this.combo;
          this.score += gain;
          p.vy = -640;
          p.onGround = false;
          this.freeze = 0.06;
          this.cam.shake = Math.min(1, this.cam.shake + 0.5);
          sfx.stomp(this.combo);
          this.burst(e.x + e.w / 2, e.y + e.h / 2, 14, INK, 220);
          this.burst(e.x + e.w / 2, e.y + e.h / 2, 6, CINNABAR, 180);
          this.floats.push({
            x: e.x + e.w / 2,
            y: e.y - 6,
            vy: -64,
            life: 0.9,
            text: this.combo > 1 ? `連擊 ×${this.combo}  +${gain}` : `+${gain}`,
            col: CINNABAR,
          });
        } else {
          this.hurt();
        }
      }
    }

    // ---- combo timer
    if (this.comboT > 0) {
      this.comboT -= dt;
      if (this.comboT <= 0) this.combo = 0;
    }

    // ---- fall out of the stage
    if (p.y > VH + 120) this.hurt(true);

    // ---- score for distance
    if (p.x > this.maxX) {
      this.score += (p.x - this.maxX) / 12;
      this.maxX = p.x;
    }
    this.meters = Math.floor(Math.max(0, this.maxX - 120) / 24);

    // safe spot memory: any stretch of solid ground wide enough to stand on
    if (p.onGround && p.dying <= 0) {
      const fx = p.x + p.w / 2;
      if (this.solidAt(fx - 16, p.y + p.h + 14) && this.solidAt(fx + 16, p.y + p.h + 14)) {
        this.lastSafe = { x: p.x, y: p.y };
      }
    }

    this.stepParts(dt);
    this.emit();
  }

  private camera(dt: number) {
    const target = this.p.x - VW * 0.34;
    this.cam.x += (target - this.cam.x) * Math.min(1, dt * 9);
    this.cam.x = Math.max(0, this.cam.x);
    this.cam.shake = Math.max(0, this.cam.shake - dt * 1.7);
    const s = this.cam.shake * this.cam.shake * 16;
    this.cam.sx = (Math.random() * 2 - 1) * s;
    this.cam.sy = (Math.random() * 2 - 1) * s;
  }

  private collide(p: Player, horizontal: boolean) {
    for (let i = 0; i < this.solids.length; i++) {
      const s = this.solids[i];
      // touching (feet exactly on a surface) must NOT count as an overlap,
      // otherwise every horizontal step while grounded snaps the player out sideways
      if (p.x + p.w <= s.x || p.x >= s.x + s.w || p.y + p.h <= s.y || p.y >= s.y + s.h) continue;
      if (horizontal) {
        if (p.vx > 0) p.x = s.x - p.w;
        else if (p.vx < 0) p.x = s.x + s.w;
        p.vx = 0;
      } else {
        if (p.vy > 0) {
          p.y = s.y - p.h;
          p.vy = 0;
          p.onGround = true;
        } else if (p.vy < 0) {
          p.y = s.y + s.h;
          p.vy = 40;
          this.burst(p.x + p.w / 2, p.y, 5, INK, 130, -Math.PI * 0.85, Math.PI * 0.7);
        }
      }
    }
  }

  private hurt(fell = false) {
    const p = this.p;
    p.dying = 0.85;
    p.vy = -330;
    p.vx = fell ? 0 : -p.face * 140;
    this.combo = 0;
    this.comboT = 0;
    this.cam.shake = 1;
    this.freeze = 0.09;
    sfx.hurt();
    // the puppet folds: joints snap apart into cut paper
    this.burst(p.x + p.w / 2, p.y + p.h / 2, 18, CINNABAR, 260);
    this.burst(p.x + p.w / 2, p.y + p.h / 2, 10, LAMP, 200);
    this.burst(p.x + p.w / 2, p.y + p.h / 2, 8, INK, 240);
  }

  private afterDeath() {
    if (this.status === "attract") {
      // the demo never ends: the puppet is simply re-hung on the rods
      const p = this.p;
      p.x = Math.max(120, this.cam.x + VW * 0.3);
      p.y = GROUND_Y - 140;
      p.vx = 0;
      p.vy = 0;
      p.dying = 0;
      p.invuln = 2;
      p.face = 1;
      return;
    }
    this.lives--;
    if (this.lives <= 0) {
      this.lives = 0;
      this.status = "over";
      sfx.over();
      this.emit();
      return;
    }
    const p = this.p;
    p.x = this.lastSafe.x;
    p.y = this.lastSafe.y;
    p.vx = 0;
    p.vy = 0;
    p.dying = 0;
    p.invuln = 1.8;
    p.face = 1;
    this.cam.x = Math.max(0, p.x - VW * 0.34);
    this.emit();
  }

  // ------------------------------------------------------------------ fx
  private burst(x: number, y: number, n: number, col: string, spd = 200, a0 = 0, a1 = Math.PI * 2) {
    for (let i = 0; i < n; i++) {
      const a = rnd(a0, a1);
      const v = rnd(spd * 0.35, spd);
      const life = rnd(0.35, 0.85);
      this.parts.push({
        x,
        y,
        vx: Math.cos(a) * v,
        vy: Math.sin(a) * v - 60,
        rot: rnd(0, 6.28),
        vr: rnd(-9, 9),
        s: rnd(2.5, 6.5),
        life,
        max: life,
        col,
        g: rnd(500, 950),
      });
    }
    if (this.parts.length > 320) this.parts.splice(0, this.parts.length - 320);
  }

  private stepParts(dt: number) {
    for (let i = this.parts.length - 1; i >= 0; i--) {
      const q = this.parts[i];
      q.life -= dt;
      if (q.life <= 0) {
        this.parts.splice(i, 1);
        continue;
      }
      q.vy += q.g * dt;
      q.vx *= 1 - 1.4 * dt;
      q.x += q.vx * dt;
      q.y += q.vy * dt;
      q.rot += q.vr * dt;
    }
    for (let i = this.floats.length - 1; i >= 0; i--) {
      const f = this.floats[i];
      f.life -= dt;
      f.y += f.vy * dt;
      f.vy *= 1 - 1.6 * dt;
      if (f.life <= 0) this.floats.splice(i, 1);
    }
    // the stage lamp flickers even while paused
  }

  // ------------------------------------------------------------------ draw
  private draw() {
    const ctx = this.ctx;
    const cw = this.canvas.width;
    const ch = this.canvas.height;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = "#F0DFB8";
    ctx.fillRect(0, 0, cw, ch);
    ctx.setTransform(this.scale, 0, 0, this.scale, this.offX, this.offY);
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, 0, VW, VH);
    ctx.clip();

    this.drawSky();

    const camx = this.cam.x + this.cam.sx;
    ctx.save();
    ctx.translate(-camx * 0.22, this.cam.sy);
    this.drawHills(0.0016, VH - 150, 62, "rgba(27,15,9,0.13)", 0.22);
    ctx.restore();

    ctx.save();
    ctx.translate(-camx * 0.46, this.cam.sy);
    this.drawHills(0.0034, VH - 112, 40, "rgba(27,15,9,0.22)", 0.46);
    this.drawDecor();
    ctx.restore();

    ctx.save();
    ctx.translate(-camx, this.cam.sy);
    this.drawSolids();
    this.drawCoins();
    this.drawEnemies();
    if (!(this.p.invuln > 0 && this.status === "playing" && Math.floor(this.t * 14) % 2 === 0)) {
      this.drawPuppet();
    }
    this.drawParts();
    this.drawFloats();
    ctx.restore();

    this.drawVignette();
    ctx.restore();
  }

  private drawSky() {
    const ctx = this.ctx;
    if (this.paper) {
      ctx.drawImage(this.paper, -20, -20, VW + 40, VH + 40);
    } else {
      const g = ctx.createRadialGradient(VW * 0.5, VH * 0.34, 40, VW * 0.5, VH * 0.4, VH * 1.05);
      g.addColorStop(0, "#FFF0CB");
      g.addColorStop(0.45, "#F0DFB8");
      g.addColorStop(1, "#C9A96F");
      ctx.fillStyle = g;
      ctx.fillRect(-20, -20, VW + 40, VH + 40);
    }
    // lamp bloom behind the action
    const g2 = ctx.createRadialGradient(VW * 0.5, VH * 0.3, 10, VW * 0.5, VH * 0.3, 380);
    g2.addColorStop(0, "rgba(255,240,200,0.55)");
    g2.addColorStop(1, "rgba(255,240,200,0)");
    ctx.fillStyle = g2;
    ctx.fillRect(0, 0, VW, VH);
  }

  private drawHills(freq: number, base: number, amp: number, col: string, par: number) {
    const ctx = this.ctx;
    const x0 = Math.floor((this.cam.x * par - 200) / 40) * 40;
    ctx.fillStyle = col;
    ctx.beginPath();
    ctx.moveTo(x0, VH + 40);
    for (let x = x0; x < x0 + VW + 400; x += 16) {
      const y =
        base +
        Math.sin(x * freq) * amp +
        Math.sin(x * freq * 2.3 + 1.2) * amp * 0.45 +
        Math.sin(x * freq * 0.5 + 3) * amp * 0.7;
      ctx.lineTo(x, y);
    }
    ctx.lineTo(x0 + VW + 400, VH + 40);
    ctx.closePath();
    ctx.fill();
  }

  private drawDecor() {
    const ctx = this.ctx;
    const left = this.cam.x * 0.46 - 160;
    const right = left + VW + 320;
    ctx.fillStyle = "rgba(27,15,9,0.34)";
    for (let i = 0; i < this.decor.length; i++) {
      const d = this.decor[i];
      if (d.x < left || d.x > right) continue;
      const x = d.x;
      const y = VH - 98;
      ctx.save();
      ctx.translate(x, y);
      if (d.kind === 0) {
        // willow
        ctx.fillRect(-3, -66, 6, 66);
        ctx.beginPath();
        ctx.ellipse(0, -78, 30, 26, 0, 0, Math.PI * 2);
        ctx.fill();
      } else if (d.kind === 1) {
        // pagoda
        for (let k = 0; k < 3; k++) {
          const w = 54 - k * 13;
          const yy = -22 - k * 24;
          ctx.beginPath();
          ctx.moveTo(-w / 2 - 8, yy);
          ctx.lineTo(w / 2 + 8, yy);
          ctx.lineTo(w / 2 - 6, yy - 15);
          ctx.lineTo(-w / 2 + 6, yy - 15);
          ctx.closePath();
          ctx.fill();
        }
        ctx.fillRect(-2, -100, 4, 14);
      } else if (d.kind === 2) {
        // rockery
        ctx.beginPath();
        ctx.moveTo(-34, 0);
        ctx.quadraticCurveTo(-22, -44, -4, -34);
        ctx.quadraticCurveTo(12, -58, 34, 0);
        ctx.closePath();
        ctx.fill();
      } else {
        // bamboo
        for (let k = 0; k < 3; k++) {
          const bx = -14 + k * 13;
          ctx.fillRect(bx, -70 - k * 12, 4, 70 + k * 12);
        }
      }
      ctx.restore();
    }
  }

  private drawSolids() {
    const ctx = this.ctx;
    const left = this.cam.x - 60;
    const right = left + VW + 120;
    for (let i = 0; i < this.solids.length; i++) {
      const s = this.solids[i];
      if (s.x + s.w < left || s.x > right) continue;
      ctx.fillStyle = INK;
      if (s.kind === "ground") {
        ctx.fillRect(s.x, s.y + 6, s.w, s.h);
        // rolled top edge of the hide
        ctx.beginPath();
        ctx.moveTo(s.x, s.y + 12);
        ctx.quadraticCurveTo(s.x, s.y + 2, s.x + 12, s.y + 3);
        ctx.lineTo(s.x + s.w - 12, s.y + 3);
        ctx.quadraticCurveTo(s.x + s.w, s.y + 2, s.x + s.w, s.y + 12);
        ctx.lineTo(s.x + s.w, s.y + 22);
        ctx.lineTo(s.x, s.y + 22);
        ctx.closePath();
        ctx.fill();
        // punched lace
        ctx.fillStyle = "rgba(255,233,184,0.9)";
        for (let x = s.x + 18; x < s.x + s.w - 12; x += 28) {
          ctx.beginPath();
          ctx.moveTo(x, s.y + 8);
          ctx.lineTo(x + 5, s.y + 13);
          ctx.lineTo(x, s.y + 18);
          ctx.lineTo(x - 5, s.y + 13);
          ctx.closePath();
          ctx.fill();
          ctx.beginPath();
          ctx.arc(x + 14, s.y + 32, 2.6, 0, Math.PI * 2);
          ctx.fill();
        }
        // carved cut lines
        ctx.strokeStyle = "rgba(255,233,184,0.32)";
        ctx.lineWidth = 2;
        for (let x = s.x + 30; x < s.x + s.w - 10; x += 64) {
          ctx.beginPath();
          ctx.moveTo(x, s.y + 44);
          ctx.quadraticCurveTo(x + 14, s.y + 74, x - 4, s.y + 104);
          ctx.stroke();
        }
      } else {
        ctx.fillRect(s.x, s.y, s.w, s.h);
        ctx.fillStyle = "rgba(255,233,184,0.88)";
        for (let x = s.x + 14; x < s.x + s.w - 8; x += 24) {
          ctx.beginPath();
          ctx.arc(x, s.y + 11, 2.4, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.fillStyle = INK;
        ctx.fillRect(s.x + 4, s.y + 4, s.w - 8, 2);
      }
    }
  }

  private drawCoins() {
    const ctx = this.ctx;
    const left = this.cam.x - 40;
    const right = left + VW + 80;
    for (let i = 0; i < this.coins.length; i++) {
      const c = this.coins[i];
      if (c.got || c.x < left || c.x > right) continue;
      const spin = Math.cos(this.t * 3.2 + c.x * 0.05);
      const sx = Math.max(0.18, Math.abs(spin));
      ctx.save();
      ctx.translate(c.x, c.y + Math.sin(this.t * 2.4 + c.x * 0.03) * 3);
      ctx.scale(sx, 1);
      ctx.shadowColor = "rgba(224,167,60,0.85)";
      ctx.shadowBlur = 12;
      ctx.fillStyle = GILD;
      ctx.beginPath();
      ctx.arc(0, 0, 9.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.shadowBlur = 0;
      ctx.fillStyle = "rgba(27,15,9,0.85)";
      ctx.fillRect(-3, -3, 6, 6);
      ctx.strokeStyle = "rgba(27,15,9,0.55)";
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      ctx.arc(0, 0, 7, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }
  }

  private drawEnemies() {
    const ctx = this.ctx;
    const left = this.cam.x - 80;
    const right = left + VW + 160;
    for (let i = 0; i < this.enemies.length; i++) {
      const e = this.enemies[i];
      if (e.x + e.w < left || e.x > right) continue;
      if (!e.alive && e.die <= 0) continue;
      ctx.save();
      ctx.translate(e.x + e.w / 2, e.y + e.h);
      if (!e.alive) {
        const k = clamp(e.die / 0.5, 0, 1);
        ctx.globalAlpha = k;
        ctx.rotate((1 - k) * 2.2 * Math.sign(e.vx));
        ctx.scale(1 + (1 - k) * 0.5, k);
      }
      const dir = e.vx > 0 ? 1 : -1;
      ctx.scale(dir, 1);
      if (e.kind === "imp") {
        const wob = Math.sin(e.t * 9) * 3;
        ctx.strokeStyle = INK;
        ctx.lineCap = "round";
        ctx.lineWidth = 5;
        ctx.beginPath();
        ctx.moveTo(-6, -6);
        ctx.lineTo(-9 + wob, 0);
        ctx.moveTo(6, -6);
        ctx.lineTo(9 - wob, 0);
        ctx.stroke();
        // hunched body
        ctx.fillStyle = INK;
        ctx.beginPath();
        ctx.moveTo(-14, -4);
        ctx.quadraticCurveTo(-18, -26, -2, -30);
        ctx.quadraticCurveTo(14, -32, 13, -10);
        ctx.quadraticCurveTo(12, -2, 4, -3);
        ctx.closePath();
        ctx.fill();
        // horns + ear
        ctx.beginPath();
        ctx.moveTo(-4, -29);
        ctx.lineTo(-8, -42);
        ctx.lineTo(2, -30);
        ctx.closePath();
        ctx.fill();
        ctx.beginPath();
        ctx.moveTo(8, -27);
        ctx.lineTo(17, -36);
        ctx.lineTo(12, -22);
        ctx.closePath();
        ctx.fill();
        // glowing eye + tusk
        ctx.fillStyle = CINNABAR;
        ctx.beginPath();
        ctx.arc(7, -22, 2.6, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = LAMP;
        ctx.beginPath();
        ctx.arc(12, -13, 1.8, 0, Math.PI * 2);
        ctx.fill();
      } else {
        const flap = Math.sin(e.t * 16);
        ctx.fillStyle = INK;
        ctx.save();
        ctx.translate(0, -12);
        ctx.rotate(flap * 0.5);
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.quadraticCurveTo(-26, -18, -18, 6);
        ctx.quadraticCurveTo(-8, 10, 0, 2);
        ctx.closePath();
        ctx.fill();
        ctx.restore();
        ctx.save();
        ctx.translate(0, -12);
        ctx.rotate(-flap * 0.5);
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.quadraticCurveTo(26, -18, 18, 6);
        ctx.quadraticCurveTo(8, 10, 0, 2);
        ctx.closePath();
        ctx.fill();
        ctx.restore();
        ctx.beginPath();
        ctx.ellipse(0, -12, 4.5, 11, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = INK;
        ctx.lineWidth = 1.8;
        ctx.beginPath();
        ctx.moveTo(0, -21);
        ctx.quadraticCurveTo(6, -30, 11, -28);
        ctx.moveTo(0, -21);
        ctx.quadraticCurveTo(-2, -31, -7, -30);
        ctx.stroke();
        ctx.fillStyle = CINNABAR;
        ctx.beginPath();
        ctx.arc(0, -14, 2.2, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    }
  }

  // the star of the show: an articulated shadow puppet with pinned joints
  private drawPuppet() {
    const ctx = this.ctx;
    const p = this.p;
    const cx = p.x + p.w / 2;
    const feet = p.y + p.h;
    const dying = p.dying > 0;

    let legA = 0;
    let legB = 0;
    let armA = 0;
    let armB = 0;
    let lean = 0;
    let bob = 0;
    if (dying) {
      legA = 1.5;
      legB = -1.2;
      armA = -2.2;
      armB = 2.0;
      lean = Math.sin(this.t * 22) * 0.35;
    } else if (!p.onGround) {
      const up = p.vy < 0;
      legA = up ? 0.7 : 0.35;
      legB = up ? -0.55 : -0.15;
      armA = up ? -1.9 : -1.3;
      armB = up ? 1.5 : 1.0;
      lean = p.face * 0.12;
    } else if (Math.abs(p.vx) > 12) {
      const s = Math.sin(p.phase);
      legA = s * 0.85;
      legB = -s * 0.85;
      armA = -s * 0.95;
      armB = s * 0.95;
      lean = p.face * 0.08;
      bob = Math.abs(Math.cos(p.phase)) * 1.6;
    } else {
      const s = Math.sin(this.t * 1.8) * 0.1;
      legA = s;
      legB = -s;
      armA = -0.25 + s;
      armB = 0.25 - s;
      bob = Math.sin(this.t * 1.8) * 0.8;
    }
    if (p.land > 0) bob += p.land * 4;

    const hide = dying ? "rgba(209,64,47,0.55)" : "rgba(209,64,47,0.95)";
    const hideBack = dying ? "rgba(150,44,34,0.4)" : "rgba(150,44,34,0.75)";

    ctx.save();
    ctx.translate(cx, feet - bob);
    if (dying) ctx.rotate(Math.sin(this.t * 9) * 0.4 + (1 - p.dying / 0.85) * 1.4 * p.face);
    ctx.scale(p.face * 0.72, 0.72);
    ctx.rotate(lean);
    ctx.translate(0, -30); // hip pin sits 30 units above the feet

    const drawLimb = (
      ox: number,
      oy: number,
      a1: number,
      l1: number,
      a2: number,
      l2: number,
      col: string,
    ) => {
      const kx = ox + Math.sin(a1) * l1;
      const ky = oy + Math.cos(a1) * l1;
      const ex = kx + Math.sin(a1 + a2) * l2;
      const ey = ky + Math.cos(a1 + a2) * l2;
      ctx.strokeStyle = INK;
      ctx.lineWidth = 11;
      ctx.beginPath();
      ctx.moveTo(ox, oy);
      ctx.lineTo(kx, ky);
      ctx.lineTo(ex, ey);
      ctx.stroke();
      ctx.strokeStyle = col;
      ctx.lineWidth = 6.5;
      ctx.beginPath();
      ctx.moveTo(ox, oy);
      ctx.lineTo(kx, ky);
      ctx.lineTo(ex, ey);
      ctx.stroke();
      // pinned joint
      ctx.fillStyle = GILD;
      ctx.beginPath();
      ctx.arc(kx, ky, 2.6, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = INK;
      ctx.beginPath();
      ctx.arc(kx, ky, 1.1, 0, Math.PI * 2);
      ctx.fill();
      return [ex, ey];
    };

    // back limbs (thinner, dimmer hide)
    drawLimb(0, -26, armB + 0.2, 12, 0.5 + armB * 0.4, 12, hideBack);
    drawLimb(0, 0, legB, 15, Math.max(0, -legB) * 0.7 + 0.08, 15, hideBack);

    // torso: a cut hide plate
    ctx.fillStyle = INK;
    ctx.beginPath();
    ctx.moveTo(-11, 2);
    ctx.quadraticCurveTo(-14, -18, -8, -32);
    ctx.lineTo(8, -32);
    ctx.quadraticCurveTo(13, -18, 10, 2);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = hide;
    ctx.beginPath();
    ctx.moveTo(-8, 0);
    ctx.quadraticCurveTo(-10.5, -18, -5.5, -29);
    ctx.lineTo(5.5, -29);
    ctx.quadraticCurveTo(9.5, -18, 7.5, 0);
    ctx.closePath();
    ctx.fill();
    // punched ornament on the breastplate
    ctx.fillStyle = LAMP;
    ctx.beginPath();
    ctx.arc(0, -20, 2.2, 0, Math.PI * 2);
    ctx.arc(0, -12, 1.7, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = JADE;
    ctx.beginPath();
    ctx.moveTo(-3.5, -6);
    ctx.lineTo(0, -2);
    ctx.lineTo(3.5, -6);
    ctx.closePath();
    ctx.fill();

    // front limbs
    drawLimb(0, 0, legA, 15, Math.max(0, legA) * 0.6 + 0.08, 15, hide);
    const hand = drawLimb(0, -26, armA, 12, 0.5 + armA * 0.4, 12, hide) as number[];

    // control rod to the hand (a nod to the puppeteer)
    ctx.strokeStyle = "rgba(27,15,9,0.55)";
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.moveTo(hand[0], hand[1]);
    ctx.lineTo(hand[0] + 26, hand[1] - 44);
    ctx.stroke();

    // head with headdress
    ctx.save();
    ctx.translate(0, -32);
    ctx.rotate(Math.sin(this.t * 3) * 0.04 + (dying ? 0.5 : 0));
    ctx.fillStyle = INK;
    ctx.beginPath();
    ctx.arc(1, -9, 11, 0, Math.PI * 2);
    ctx.fill();
    // headdress plume
    ctx.beginPath();
    ctx.moveTo(-4, -18);
    ctx.quadraticCurveTo(-18, -30, -26, -20);
    ctx.quadraticCurveTo(-14, -24, -6, -15);
    ctx.closePath();
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(2, -19);
    ctx.lineTo(6, -34);
    ctx.lineTo(10, -19);
    ctx.closePath();
    ctx.fill();
    // profile: brow, nose, chin
    ctx.beginPath();
    ctx.moveTo(9, -14);
    ctx.quadraticCurveTo(15, -11, 11, -6);
    ctx.quadraticCurveTo(14, -1, 7, 1);
    ctx.quadraticCurveTo(11, -6, 6, -10);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = hide;
    ctx.beginPath();
    ctx.arc(0, -8, 7.6, 0, Math.PI * 2);
    ctx.fill();
    // eye perforation + cheek tint
    ctx.fillStyle = LAMP;
    ctx.beginPath();
    ctx.arc(3, -10, 2.4, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = INK;
    ctx.beginPath();
    ctx.arc(3.6, -10, 1.1, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "rgba(224,167,60,0.85)";
    ctx.beginPath();
    ctx.arc(-1, -4, 2, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    ctx.restore();
  }

  private drawParts() {
    const ctx = this.ctx;
    for (let i = 0; i < this.parts.length; i++) {
      const q = this.parts[i];
      const a = clamp(q.life / q.max, 0, 1);
      ctx.save();
      ctx.globalAlpha = 0.35 + a * 0.65;
      ctx.translate(q.x, q.y);
      ctx.rotate(q.rot);
      ctx.fillStyle = q.col;
      ctx.fillRect(-q.s / 2, -q.s / 2, q.s, q.s * 0.62);
      ctx.restore();
    }
    ctx.globalAlpha = 1;
  }

  private drawFloats() {
    const ctx = this.ctx;
    ctx.textAlign = "center";
    for (let i = 0; i < this.floats.length; i++) {
      const f = this.floats[i];
      ctx.save();
      ctx.globalAlpha = clamp(f.life * 1.6, 0, 1);
      ctx.font = "700 22px 'Noto Serif SC', serif";
      ctx.lineWidth = 4;
      ctx.strokeStyle = "rgba(255,233,184,0.9)";
      ctx.strokeText(f.text, f.x, f.y);
      ctx.fillStyle = f.col;
      ctx.fillText(f.text, f.x, f.y);
      ctx.restore();
    }
    ctx.globalAlpha = 1;
    ctx.textAlign = "start";
  }

  private drawVignette() {
    const ctx = this.ctx;
    const g = ctx.createRadialGradient(VW / 2, VH / 2, VH * 0.42, VW / 2, VH / 2, VH * 0.95);
    g.addColorStop(0, "rgba(27,15,9,0)");
    g.addColorStop(1, "rgba(27,15,9,0.42)");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, VW, VH);
    // moving lamp flicker
    const f = 0.04 + (Math.sin(this.t * 7.3) * 0.5 + 0.5) * 0.035;
    ctx.fillStyle = `rgba(255,233,184,${f})`;
    ctx.fillRect(0, 0, VW, VH);
    if (this.status === "attract" || this.status === "over") {
      ctx.fillStyle = "rgba(27,15,9,0.18)";
      ctx.fillRect(0, 0, VW, VH);
    }
  }
}
