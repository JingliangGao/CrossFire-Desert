import * as THREE from "three";
import { snd } from "./sound";

export interface AirTarget {
  kind: "player" | "bot";
  id: number;
  x: number;
  y: number;
  z: number;
}

export interface AirHooks {
  playing: boolean;
  px: number;
  py: number;
  pz: number;
  targets: AirTarget[];
  /** true when a world box sits on the segment */
  blocked(ox: number, oy: number, oz: number, dx: number, dy: number, dz: number, max: number): boolean;
  groundY(x: number, y: number, z: number): number;
  onPlayerHit(amt: number, fx: number, fz: number): void;
  onBotHit(id: number, amt: number): void;
  onBlast(x: number, y: number, z: number, radius: number, dmg: number): void;
  onAlienDown(name: string, byPlayer: boolean): void;
}

interface Craft {
  kind: "heli" | "jet" | "ufo";
  group: THREE.Group;
  x: number;
  y: number;
  z: number;
  vx: number;
  vz: number;
  rotors: THREE.Object3D[];
  dropLeft: number;
  dropT: number;
  dropping: boolean;
  age: number;
}

interface Faller {
  mesh: THREE.Object3D;
  x: number;
  y: number;
  z: number;
  vy: number;
  kind: "bomb" | "pod";
}

interface Alien {
  group: THREE.Group;
  name: string;
  x: number;
  y: number;
  z: number;
  hp: number;
  yaw: number;
  alive: boolean;
  die: number;
  fire: number;
  phase: number;
  hurt: number;
}

interface Bolt {
  mesh: THREE.Mesh;
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  life: number;
}

interface Boom {
  mesh: THREE.Mesh;
  life: number;
}

const ALIEN_NAMES = ["灰人·零号", "灰人·观测者", "灰人·收割者", "灰人·导航员", "灰人·先遣"];

function slab(
  ox: number,
  oy: number,
  oz: number,
  dx: number,
  dy: number,
  dz: number,
  box: [number, number, number, number, number, number],
  maxT: number,
): number {
  let t0 = 0;
  let t1 = maxT;
  const axes: [number, number, number, number][] = [
    [ox, dx, box[0], box[3]],
    [oy, dy, box[1], box[4]],
    [oz, dz, box[2], box[5]],
  ];
  for (let a = 0; a < 3; a++) {
    const [o, d, lo, hi] = axes[a];
    if (Math.abs(d) < 1e-8) {
      if (o < lo || o > hi) return -1;
      continue;
    }
    let ta = (lo - o) / d;
    let tb = (hi - o) / d;
    if (ta > tb) {
      const tmp = ta;
      ta = tb;
      tb = tmp;
    }
    if (ta > t0) t0 = ta;
    if (tb < t1) t1 = tb;
    if (t0 > t1) return -1;
  }
  return t0 > 0.001 ? t0 : -1;
}

export class AirDirector {
  alert = "";
  private alertT = 0;
  private next = 8;
  private crafts: Craft[] = [];
  private fallers: Faller[] = [];
  private aliens: Alien[] = [];
  private bolts: Bolt[] = [];
  private booms: Boom[] = [];
  private serial = 1;
  private boltMat: THREE.MeshBasicMaterial;
  private boomMat: THREE.MeshBasicMaterial;

  constructor(private scene: THREE.Scene) {
    this.boltMat = new THREE.MeshBasicMaterial({
      color: 0x9dffef,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    this.boomMat = new THREE.MeshBasicMaterial({
      color: 0xffb15a,
      transparent: true,
      opacity: 0.85,
      depthWrite: false,
    });
  }

  reset() {
    for (const c of this.crafts) this.scene.remove(c.group);
    for (const f of this.fallers) this.scene.remove(f.mesh);
    for (const a of this.aliens) this.scene.remove(a.group);
    for (const b of this.bolts) this.scene.remove(b.mesh);
    for (const b of this.booms) this.scene.remove(b.mesh);
    this.crafts = [];
    this.fallers = [];
    this.aliens = [];
    this.bolts = [];
    this.booms = [];
    this.next = 8;
    this.alert = "";
    this.alertT = 0;
  }

  alienCount() {
    return this.aliens.filter((a) => a.alive).length;
  }

  contacts(): number[] {
    const out: number[] = [];
    for (const a of this.aliens) if (a.alive) out.push(Math.round(a.x), Math.round(a.z));
    for (const c of this.crafts) out.push(Math.round(c.x), Math.round(c.z));
    return out;
  }

  plates(): { x: number; y: number; z: number; name: string; hp: number }[] {
    return this.aliens
      .filter((a) => a.alive)
      .map((a) => ({ x: a.x, y: a.y + 1.85, z: a.z, name: a.name, hp: Math.max(0, Math.round(a.hp)) }));
  }

  ray(ox: number, oy: number, oz: number, dx: number, dy: number, dz: number, maxT: number) {
    let bestT = maxT;
    let best: { index: number; t: number; head: boolean } | null = null;
    for (let index = 0; index < this.aliens.length; index++) {
      const a = this.aliens[index];
      if (!a.alive) continue;
      // 小灰人 ~1.65m：大头盒 / 细躯干盒 / 细腿盒
      const parts: [number, number, number, number, number, number, boolean][] = [
        [a.x - 0.2, a.y + 1.15, a.z - 0.22, a.x + 0.2, a.y + 1.68, a.z + 0.24, true],
        [a.x - 0.19, a.y + 0.55, a.z - 0.14, a.x + 0.19, a.y + 1.15, a.z + 0.14, false],
        [a.x - 0.13, a.y, a.z - 0.13, a.x + 0.13, a.y + 0.55, a.z + 0.13, false],
      ];
      for (const [x0, y0, z0, x1, y1, z1, head] of parts) {
        const t = slab(ox, oy, oz, dx, dy, dz, [x0, y0, z0, x1, y1, z1], bestT);
        if (t > 0 && t < bestT) {
          bestT = t;
          best = { index, t, head };
        }
      }
    }
    return best;
  }

  hurt(index: number, dmg: number, byPlayer: boolean) {
    const a = this.aliens[index];
    if (!a || !a.alive) return;
    a.hp -= dmg;
    a.hurt = 0.15;
    if (a.hp <= 0) this.killAlien(a, byPlayer);
  }

  splash(x: number, y: number, z: number, radius: number, dmg: number, byPlayer: boolean) {
    for (let i = 0; i < this.aliens.length; i++) {
      const a = this.aliens[i];
      if (!a.alive) continue;
      const d = Math.hypot(a.x - x, a.y + 1 - y, a.z - z);
      if (d < radius) this.hurt(i, dmg * (1 - d / radius), byPlayer);
    }
  }

  private killAlien(a: Alien, byPlayer: boolean) {
    a.alive = false;
    a.die = 2.2;
    this.hooks?.onAlienDown(a.name, byPlayer);
  }

  private hooks: AirHooks | null = null;

  update(dt: number, hooks: AirHooks) {
    this.hooks = hooks;
    this.alertT = Math.max(0, this.alertT - dt);
    if (this.alertT <= 0) this.alert = "";
    if (!hooks.playing) return;

    this.next -= dt;
    if (this.next <= 0) {
      this.spawnCraft();
      this.next = 18 + Math.random() * 16;
    }

    for (let i = this.crafts.length - 1; i >= 0; i--) {
      const c = this.crafts[i];
      c.age += dt;
      c.x += c.vx * dt;
      c.z += c.vz * dt + Math.sin(c.age * 1.4) * dt * 1.6;
      const bob = c.kind === "ufo" ? Math.sin(c.age * 2.2) * 1.4 : Math.sin(c.age * 1.6) * 0.35;
      c.group.position.set(c.x, c.y + bob, c.z);
      c.group.rotation.y = Math.atan2(c.vx, c.vz);
      for (const r of c.rotors) r.rotation.y += dt * (c.kind === "jet" ? 0 : 28);

      const near = Math.hypot(c.x - hooks.px, c.z - hooks.pz);
      if (!c.dropping && (near < (c.kind === "jet" ? 34 : 22) || (c.age > 2.4 && Math.abs(c.x) < 8))) {
        c.dropping = true;
        c.dropLeft = c.kind === "ufo" ? 2 : c.kind === "jet" ? 2 : 3;
        c.dropT = 0.05;
      }
      if (c.dropping && c.dropLeft > 0) {
        c.dropT -= dt;
        if (c.dropT <= 0) {
          c.dropLeft--;
          c.dropT = c.kind === "jet" ? 0.18 : 0.42;
          this.drop(c);
        }
      }
      if (Math.abs(c.x) > 130 || Math.abs(c.z) > 130) {
        this.scene.remove(c.group);
        this.crafts.splice(i, 1);
      }
    }

    for (let i = this.fallers.length - 1; i >= 0; i--) {
      const f = this.fallers[i];
      f.vy -= 16 * dt;
      f.y += f.vy * dt;
      f.mesh.position.set(f.x, f.y, f.z);
      f.mesh.rotation.x += dt * 2;
      const g = hooks.groundY(f.x, f.y + 1, f.z);
      if (f.y <= g + 0.35) {
        this.scene.remove(f.mesh);
        this.fallers.splice(i, 1);
        if (f.kind === "bomb") this.detonate(f.x, g + 0.4, f.z, hooks);
        else this.hatch(f.x, g, f.z);
      }
    }

    this.updateAliens(dt, hooks);
    this.updateBolts(dt, hooks);

    for (let i = this.booms.length - 1; i >= 0; i--) {
      const b = this.booms[i];
      b.life -= dt;
      const k = Math.max(0, b.life / 0.55);
      b.mesh.scale.setScalar(1 + (1 - k) * 7);
      (b.mesh.material as THREE.MeshBasicMaterial).opacity = k * 0.8;
      if (b.life <= 0) {
        this.scene.remove(b.mesh);
        this.booms.splice(i, 1);
      }
    }
  }

  private spawnCraft() {
    const roll = Math.random();
    const kind: Craft["kind"] = roll < 0.34 ? "heli" : roll < 0.67 ? "jet" : "ufo";
    const fromLeft = Math.random() < 0.5;
    const z = -30 + Math.random() * 60;
    const group = kind === "heli" ? buildHeli() : kind === "jet" ? buildJet() : buildUfo();
    const y = kind === "jet" ? 42 : kind === "heli" ? 28 : 24;
    const speed = kind === "jet" ? 62 : kind === "heli" ? 16 : 13;
    const vx = (fromLeft ? 1 : -1) * speed;
    group.position.set(fromLeft ? -100 : 100, y, z);
    this.scene.add(group);
    const rotors = group.userData.rotors as THREE.Object3D[];
    this.crafts.push({
      kind,
      group,
      x: fromLeft ? -100 : 100,
      y,
      z,
      vx,
      vz: (Math.random() - 0.5) * 4,
      rotors,
      dropLeft: 0,
      dropT: 0,
      dropping: false,
      age: 0,
    });
    this.alert = kind === "heli" ? "武装直升机入境 · 投弹" : kind === "jet" ? "战斗机俯冲 · 投弹" : "不明飞行物 · 外星空降";
    this.alertT = 4.2;
    if (kind === "jet") snd.jet();
    else if (kind === "heli") snd.heli();
    else snd.ufo();
  }

  private drop(c: Craft) {
    if (c.kind === "ufo") {
      const pod = buildPod();
      pod.position.set(c.x, c.y - 1.2, c.z);
      this.scene.add(pod);
      this.fallers.push({ mesh: pod, x: c.x + (Math.random() - 0.5) * 6, y: c.y - 1.2, z: c.z + (Math.random() - 0.5) * 6, vy: -2, kind: "pod" });
    } else {
      const bomb = buildBomb();
      bomb.position.set(c.x, c.y - 1.4, c.z);
      this.scene.add(bomb);
      this.fallers.push({
        mesh: bomb,
        x: c.x + (Math.random() - 0.5) * 4,
        y: c.y - 1.4,
        z: c.z + (Math.random() - 0.5) * 4,
        vy: c.kind === "jet" ? -6 : -1,
        kind: "bomb",
      });
      snd.whoosh();
    }
  }

  private detonate(x: number, y: number, z: number, hooks: AirHooks) {
    const boom = new THREE.Mesh(new THREE.SphereGeometry(1, 16, 12), this.boomMat.clone());
    boom.position.set(x, y, z);
    this.scene.add(boom);
    this.booms.push({ mesh: boom, life: 0.55 });
    snd.blast();
    const radius = 7.5;
    const dmg = 78;
    hooks.onBlast(x, y, z, radius, dmg);
    this.splash(x, y, z, radius, dmg * 0.8, false);
    const pd = Math.hypot(hooks.px - x, hooks.pz - z);
    if (pd < radius) hooks.onPlayerHit(dmg * (1 - pd / radius) * 0.72, x, z);
    for (const t of hooks.targets) {
      if (t.kind !== "bot") continue;
      const d = Math.hypot(t.x - x, t.z - z);
      if (d < radius) hooks.onBotHit(t.id, dmg * (1 - d / radius));
    }
  }

  /** remote / splash damage against whichever alien stands near a point */
  hurtNear(x: number, y: number, z: number, r: number, dmg: number) {
    for (let i = 0; i < this.aliens.length; i++) {
      const a = this.aliens[i];
      if (!a.alive) continue;
      if (Math.hypot(a.x - x, a.y + 1 - y, a.z - z) < r) this.hurt(i, dmg, true);
    }
  }

  private hatch(x: number, y: number, z: number) {
    if (this.alienCount() >= 5) return;
    const alien = buildAlien();
    alien.position.set(x, y, z);
    this.scene.add(alien);
    this.aliens.push({
      group: alien,
      name: ALIEN_NAMES[this.serial++ % ALIEN_NAMES.length],
      x,
      y,
      z,
      hp: 140,
      yaw: 0,
      alive: true,
      die: 0,
      fire: 0.6 + Math.random() * 0.6,
      phase: Math.random() * 6,
      hurt: 0,
    });
    snd.ufo();
  }

  private updateAliens(dt: number, hooks: AirHooks) {
    for (let i = this.aliens.length - 1; i >= 0; i--) {
      const a = this.aliens[i];
      a.hurt = Math.max(0, a.hurt - dt);
      if (!a.alive) {
        a.die -= dt;
        a.group.rotation.x = Math.min(1.4, a.group.rotation.x + dt * 2.2);
        a.group.position.y = Math.max(a.y - 0.4, a.group.position.y - dt * 0.4);
        if (a.die <= 0) {
          this.scene.remove(a.group);
          this.aliens.splice(i, 1);
        }
        continue;
      }
      // prefer the player, otherwise the nearest soldier
      let tx = hooks.px;
      let tz = hooks.pz;
      let ty = hooks.py + 1.2;
      let best = Math.hypot(tx - a.x, tz - a.z);
      for (const t of hooks.targets) {
        if (t.kind !== "bot") continue;
        const d = Math.hypot(t.x - a.x, t.z - a.z);
        if (d < best - 4) {
          best = d;
          tx = t.x;
          tz = t.z;
          ty = t.y + 1.1;
        }
      }
      const dx = tx - a.x;
      const dz = tz - a.z;
      const dist = Math.hypot(dx, dz) || 1;
      a.yaw = Math.atan2(dx, dz);
      const speed = dist > 14 ? 3.3 : dist < 8 ? -1.4 : 0.4;
      const nx = a.x + (dx / dist) * speed * dt;
      const nz = a.z + (dz / dist) * speed * dt;
      if (!hooks.blocked(a.x, a.y + 0.8, a.z, nx - a.x, 0, nz - a.z, 1)) {
        a.x = nx;
        a.z = nz;
      }
      a.phase += dt * 6;
      const bob = Math.abs(Math.sin(a.phase)) * 0.04;
      a.group.position.set(a.x, a.y + bob, a.z);
      a.group.rotation.y = a.yaw;
      a.group.rotation.z = Math.sin(a.phase) * 0.04 + a.hurt * 0.3;

      a.fire -= dt;
      if (a.fire <= 0 && dist < 42) {
        a.fire = 0.85 + Math.random() * 0.45;
        const ox = a.x;
        const oy = a.y + 1.05;
        const oz = a.z;
        const len = Math.hypot(tx - ox, ty - oy, tz - oz) || 1;
        const dx2 = (tx - ox) / len;
        const dy2 = (ty - oy) / len;
        const dz2 = (tz - oz) / len;
        const spread = 0.04;
        const vx = dx2 + (Math.random() - 0.5) * spread;
        const vy = dy2 + (Math.random() - 0.5) * spread;
        const vz = dz2 + (Math.random() - 0.5) * spread;
        const n = Math.hypot(vx, vy, vz);
        this.fireBolt(ox, oy, oz, (vx / n) * 34, (vy / n) * 34, (vz / n) * 34);
        snd.alien();
      }
    }
  }

  private fireBolt(x: number, y: number, z: number, vx: number, vy: number, vz: number) {
    const mesh = new THREE.Mesh(new THREE.SphereGeometry(0.12, 8, 6), this.boltMat);
    mesh.position.set(x, y, z);
    this.scene.add(mesh);
    this.bolts.push({ mesh, x, y, z, vx, vy, vz, life: 1.6 });
  }

  private updateBolts(dt: number, hooks: AirHooks) {
    for (let i = this.bolts.length - 1; i >= 0; i--) {
      const b = this.bolts[i];
      b.life -= dt;
      const nx = b.x + b.vx * dt;
      const ny = b.y + b.vy * dt;
      const nz = b.z + b.vz * dt;
      const step = Math.hypot(b.vx, b.vy, b.vz) * dt;
      let hit = false;
      if (hooks.blocked(b.x, b.y, b.z, b.vx, b.vy, b.vz, step)) hit = true;
      const pd = Math.hypot(nx - hooks.px, nz - hooks.pz);
      if (pd < 0.55 && ny > hooks.py && ny < hooks.py + 1.8) {
        hooks.onPlayerHit(18 + Math.random() * 10, b.x, b.z);
        hit = true;
      }
      for (const t of hooks.targets) {
        if (t.kind !== "bot") continue;
        if (Math.hypot(nx - t.x, nz - t.z) < 0.55 && ny > t.y && ny < t.y + 1.85) {
          hooks.onBotHit(t.id, 26 + Math.random() * 14);
          hit = true;
          break;
        }
      }
      if (hit || b.life <= 0 || ny < -2) {
        this.scene.remove(b.mesh);
        this.bolts.splice(i, 1);
      } else {
        b.x = nx;
        b.y = ny;
        b.z = nz;
        b.mesh.position.set(nx, ny, nz);
      }
    }
  }
}

function buildHeli() {
  const g = new THREE.Group();
  const olive = new THREE.MeshStandardMaterial({ color: 0x4e5836, roughness: 0.72, metalness: 0.25 });
  const dark = new THREE.MeshStandardMaterial({ color: 0x232820, roughness: 0.6, metalness: 0.4 });
  const glass = new THREE.MeshStandardMaterial({
    color: 0x8ec8d8,
    roughness: 0.08,
    metalness: 0.6,
    transparent: true,
    opacity: 0.72,
  });
  const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.85, 2.4, 6, 12), olive);
  body.rotation.x = -Math.PI / 2;
  body.castShadow = true;
  g.add(body);
  const nose = new THREE.Mesh(new THREE.SphereGeometry(0.72, 12, 10), glass);
  nose.scale.set(1.1, 0.8, 0.85);
  nose.position.z = 1.55;
  g.add(nose);
  const tail = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.32, 3.2), olive);
  tail.position.set(0, 0.25, -2.5);
  g.add(tail);
  const fin = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.9, 0.7), olive);
  fin.position.set(0, 0.7, -3.9);
  g.add(fin);
  const stab = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.08, 0.35), olive);
  stab.position.set(0, 0.35, -3.7);
  g.add(stab);
  for (const s of [-1, 1]) {
    const skid = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.08, 2.4), dark);
    skid.position.set(s * 0.7, -1.05, 0.1);
    g.add(skid);
    const leg = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.45, 0.06), dark);
    leg.position.set(s * 0.55, -0.75, 0.4);
    g.add(leg);
  }
  const mast = new THREE.Object3D();
  mast.position.y = 0.95;
  const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.18, 0.16, 10), dark);
  mast.add(hub);
  for (let i = 0; i < 4; i++) {
    const blade = new THREE.Mesh(new THREE.BoxGeometry(4.6, 0.04, 0.22), dark);
    blade.rotation.y = (i / 4) * Math.PI;
    mast.add(blade);
  }
  g.add(mast);
  const tailRotor = new THREE.Object3D();
  tailRotor.position.set(0.2, 0.7, -3.9);
  for (let i = 0; i < 2; i++) {
    const blade = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.9, 0.1), dark);
    blade.rotation.z = i * 1.2;
    tailRotor.add(blade);
  }
  g.add(tailRotor);
  g.userData.rotors = [mast, tailRotor];
  return g;
}

function buildJet() {
  const g = new THREE.Group();
  const grey = new THREE.MeshStandardMaterial({ color: 0x8d93a0, roughness: 0.45, metalness: 0.55 });
  const dark = new THREE.MeshStandardMaterial({ color: 0x2a2e36, roughness: 0.4, metalness: 0.6 });
  const hot = new THREE.MeshStandardMaterial({
    color: 0xffb060,
    emissive: 0xff6a1a,
    emissiveIntensity: 1.4,
    roughness: 0.3,
  });
  const fuse = new THREE.Mesh(new THREE.CapsuleGeometry(0.45, 4.2, 6, 12), grey);
  fuse.rotation.x = -Math.PI / 2;
  g.add(fuse);
  const nose = new THREE.Mesh(new THREE.ConeGeometry(0.42, 1.3, 12), grey);
  nose.rotation.x = Math.PI / 2;
  nose.position.z = 2.7;
  g.add(nose);
  const wing = new THREE.Mesh(new THREE.BoxGeometry(5.4, 0.08, 1.3), grey);
  wing.position.set(0, -0.05, -0.2);
  g.add(wing);
  for (const s of [-1, 1]) {
    const tail = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.9, 0.7), grey);
    tail.position.set(s * 0.7, 0.45, -2.3);
    tail.rotation.z = s * -0.3;
    g.add(tail);
  }
  const burn = new THREE.Mesh(new THREE.SphereGeometry(0.28, 10, 8), hot);
  burn.scale.set(1, 1, 1.8);
  burn.position.z = -2.55;
  g.add(burn);
  const canopy = new THREE.Mesh(
    new THREE.SphereGeometry(0.32, 10, 8),
    new THREE.MeshStandardMaterial({ color: 0x203040, roughness: 0.1, metalness: 0.7 }),
  );
  canopy.scale.set(0.7, 0.55, 1.3);
  canopy.position.set(0, 0.28, 1.1);
  g.add(canopy);
  g.add(new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.2, 0.2), dark));
  g.userData.rotors = [];
  return g;
}

function buildUfo() {
  const g = new THREE.Group();
  const hull = new THREE.MeshStandardMaterial({ color: 0xcfd6dc, roughness: 0.28, metalness: 0.72 });
  const glow = new THREE.MeshStandardMaterial({
    color: 0x39ffe0,
    emissive: 0x14ffd2,
    emissiveIntensity: 1.6,
    roughness: 0.2,
  });
  const disc = new THREE.Mesh(new THREE.CylinderGeometry(2.4, 3.1, 0.55, 28), hull);
  g.add(disc);
  const dome = new THREE.Mesh(
    new THREE.SphereGeometry(1.15, 18, 12, 0, Math.PI * 2, 0, Math.PI / 2),
    new THREE.MeshStandardMaterial({
      color: 0x8ef6ff,
      emissive: 0x146a66,
      emissiveIntensity: 0.45,
      roughness: 0.08,
      metalness: 0.4,
      transparent: true,
      opacity: 0.78,
    }),
  );
  dome.position.y = 0.2;
  g.add(dome);
  const ring = new THREE.Object3D();
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * Math.PI * 2;
    const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.14, 8, 6), glow);
    lamp.position.set(Math.cos(a) * 2.15, -0.22, Math.sin(a) * 2.15);
    ring.add(lamp);
  }
  g.add(ring);
  const beam = new THREE.Mesh(
    new THREE.ConeGeometry(1.3, 6, 16, 1, true),
    new THREE.MeshBasicMaterial({
      color: 0x7dfff0,
      transparent: true,
      opacity: 0.16,
      side: THREE.DoubleSide,
      depthWrite: false,
    }),
  );
  beam.position.y = -3.2;
  beam.rotation.x = Math.PI;
  g.add(beam);
  g.userData.rotors = [ring];
  return g;
}

function buildBomb() {
  const g = new THREE.Group();
  const mat = new THREE.MeshStandardMaterial({ color: 0x2a2e24, roughness: 0.55, metalness: 0.45 });
  const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.18, 0.55, 4, 8), mat);
  g.add(body);
  for (let i = 0; i < 4; i++) {
    const fin = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.02, 0.16), mat);
    fin.position.y = -0.32;
    fin.rotation.y = (i / 4) * Math.PI;
    g.add(fin);
  }
  const band = new THREE.MeshStandardMaterial({ color: 0xe23a2e, roughness: 0.5 });
  const stripe = new THREE.Mesh(new THREE.CylinderGeometry(0.19, 0.19, 0.08, 10), band);
  g.add(stripe);
  return g;
}

function buildPod() {
  const g = new THREE.Group();
  const shell = new THREE.Mesh(
    new THREE.CapsuleGeometry(0.38, 0.7, 5, 10),
    new THREE.MeshStandardMaterial({
      color: 0xb7fff4,
      emissive: 0x1a8f86,
      emissiveIntensity: 0.7,
      roughness: 0.25,
      metalness: 0.4,
    }),
  );
  g.add(shell);
  return g;
}

function buildAlien() {
  const g = new THREE.Group();
  // 小灰人：灰绿哑光肤质 + 近黑反光杏仁眼（《第三类接触》式宇航员外星人）
  const skin = new THREE.MeshStandardMaterial({
    color: 0x9aa79e,
    roughness: 0.62,
    metalness: 0.06,
    emissive: 0x0e1412,
    emissiveIntensity: 0.12,
  });
  const dark = new THREE.MeshStandardMaterial({ color: 0x12181a, roughness: 0.3, metalness: 0.5 });
  const eye = new THREE.MeshStandardMaterial({
    color: 0x05070a,
    roughness: 0.1,
    metalness: 0.7,
    emissive: 0x02060a,
    emissiveIntensity: 0.4,
  });
  const glint = new THREE.MeshBasicMaterial({ color: 0xcfeee8 });

  // 超大光滑颅顶：前额高耸、后脑拉长的椭球（身高约 1.65m）
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.29, 20, 16), skin);
  head.scale.set(0.78, 1.02, 1.22);
  head.position.set(0, 1.38, -0.03);
  head.castShadow = true;
  g.add(head);
  // 小下颌：无鼻，仅一道嘴缝
  const jaw = new THREE.Mesh(new THREE.SphereGeometry(0.11, 12, 10), skin);
  jaw.scale.set(0.8, 0.9, 1.1);
  jaw.position.set(0, 1.2, 0.13);
  g.add(jaw);
  const mouth = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.012, 0.02), dark);
  mouth.position.set(0, 1.19, 0.22);
  g.add(mouth);
  // 巨大黑色杏仁眼：占脸约一半，外角上挑、湿润反光
  for (const s of [-1, 1]) {
    const e = new THREE.Mesh(new THREE.SphereGeometry(0.085, 14, 12), eye);
    e.scale.set(0.85, 1.35, 0.55);
    e.position.set(s * 0.1, 1.4, 0.17);
    e.rotation.z = -s * 0.5;
    e.rotation.y = s * 0.25;
    g.add(e);
    const gl = new THREE.Mesh(new THREE.SphereGeometry(0.014, 6, 5), glint);
    gl.position.set(s * 0.12, 1.45, 0.215);
    g.add(gl);
  }
  // 细长颈
  const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.055, 0.16, 10), skin);
  neck.position.y = 1.14;
  g.add(neck);
  // 窄肩细腰躯干（去掉战术背心）
  const torso = new THREE.Mesh(new THREE.CapsuleGeometry(0.13, 0.34, 4, 10), skin);
  torso.position.y = 0.9;
  torso.scale.set(1, 1, 0.75);
  g.add(torso);
  const chest = new THREE.Mesh(new THREE.SphereGeometry(0.15, 12, 10), skin);
  chest.scale.set(1.15, 0.7, 0.75);
  chest.position.y = 1.06;
  g.add(chest);
  const pelvis = new THREE.Mesh(new THREE.SphereGeometry(0.11, 10, 8), skin);
  pelvis.scale.set(1.1, 0.8, 0.8);
  pelvis.position.y = 0.58;
  g.add(pelvis);
  // 纤细四肢
  for (const s of [-1, 1]) {
    const shoulder = new THREE.Mesh(new THREE.SphereGeometry(0.05, 8, 6), skin);
    shoulder.position.set(s * 0.17, 1.08, 0);
    g.add(shoulder);
    const upper = new THREE.Mesh(new THREE.CapsuleGeometry(0.035, 0.26, 3, 6), skin);
    upper.position.set(s * 0.19, 0.9, 0.02);
    upper.rotation.z = s * 0.12;
    g.add(upper);
    const fore = new THREE.Mesh(new THREE.CapsuleGeometry(0.032, 0.24, 3, 6), skin);
    fore.position.set(s * 0.21, 0.65, 0.06);
    fore.rotation.x = -0.25;
    g.add(fore);
    const hand = new THREE.Mesh(new THREE.SphereGeometry(0.04, 8, 6), skin);
    hand.scale.set(1, 1.3, 0.7);
    hand.position.set(s * 0.21, 0.5, 0.1);
    g.add(hand);
    const thigh = new THREE.Mesh(new THREE.CapsuleGeometry(0.05, 0.24, 3, 6), skin);
    thigh.position.set(s * 0.07, 0.42, 0);
    g.add(thigh);
    const shin = new THREE.Mesh(new THREE.CapsuleGeometry(0.04, 0.22, 3, 6), skin);
    shin.position.set(s * 0.07, 0.16, 0.01);
    g.add(shin);
    const foot = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.04, 0.14), skin);
    foot.position.set(s * 0.07, 0.02, 0.04);
    g.add(foot);
  }
  // 前臂式能量发射器（细管，替代原人形步枪），出膛高度与 fireBolt y+1.05 对齐
  const emitter = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.024, 0.18, 8), dark);
  emitter.rotation.x = Math.PI / 2;
  emitter.position.set(0.17, 1.02, 0.2);
  g.add(emitter);
  const tip = new THREE.Mesh(
    new THREE.SphereGeometry(0.028, 8, 6),
    new THREE.MeshStandardMaterial({ color: 0x7dfff0, emissive: 0x39ffe8, emissiveIntensity: 2 }),
  );
  tip.position.set(0.17, 1.02, 0.3);
  g.add(tip);
  return g;
}
