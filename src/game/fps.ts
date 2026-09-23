import * as THREE from "three";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/addons/postprocessing/UnrealBloomPass.js";
import { SMAAPass } from "three/addons/postprocessing/SMAAPass.js";
import { OutputPass } from "three/addons/postprocessing/OutputPass.js";
import { buildMap, type Box, type MapData } from "./map";
import { AirDirector, type AirTarget } from "./air";
import { buildGunModel, goldify } from "./guns";
import { animateBeast, buildBeast } from "./beast";
import { animateNpc, buildNpc, muzzleWorld, type NpcModel } from "./npc";
import { buildSpawnPickups, dropPickup, removePickup, updatePickups, type Pickup } from "./pickups";
import {
  GRENADE_ID,
  GRENADE_STACK,
  KNIFE_ID,
  KNIFE_RANGE,
  MAX_SLOTS,
  WEAPON_NAMES,
  defOf,
  makeStartLoadout,
  slotAmmo,
  slotLabel,
  slotReserve,
  type InventorySlot,
  type WeaponDef,
} from "./weapons";
import { Net, type InMsg } from "./net";
import { snd } from "./sound";

export { GRENADE_STACK, KNIFE_ID, MAX_SLOTS, WEAPON_NAMES };
export type { InventorySlot, WeaponDef };

export type Status = "menu" | "playing" | "paused" | "over";
export { PLAYER_NAME } from "./names";

export interface FeedItem {
  id: number;
  name: string;
  gun: string;
  head: boolean;
}

export interface Marker {
  x: number;
  y: number;
  name: string;
  hp: number;
  alien?: boolean;
}

export interface HudState {
  status: Status;
  hp: number;
  armor: number;
  ammo: number;
  reserve: number;
  weapon: string;
  weaponIdx: number;
  weaponType: "gun" | "knife" | "grenade";
  slots: { name: string; type: "gun" | "knife" | "grenade" }[];
  reloading: number;
  kills: number;
  headshots: number;
  streak: number;
  bestStreak: number;
  score: number;
  time: number;
  wave: number;
  alive: number;
  radar: { px: number; pz: number; yaw: number; dots: number[]; aliens: number[] };
  feed: FeedItem[];
  prompt: string;
  alert: string;
  markers: Marker[];
  peers: number;
  net: "off" | "ws" | "local";
}

const GRAV = 26;
const JUMP_V = 9.15;
const PLAYER_R = 0.4;
const PLAYER_H = 1.75;
const EYE = 1.55;

interface Bot {
  npc: NpcModel;
  name: string;
  kind: "soldier" | "beast" | "boss";
  x: number;
  y: number;
  z: number;
  hp: number;
  yaw: number;
  alive: boolean;
  die: number;
  fire: number;
  burst: number;
  wp: number;
  anim: number;
  hurt: number;
  flashT: number;
}

interface Part {
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  life: number;
  max: number;
  r: number;
  g: number;
  b: number;
}

export class Fps {
  readonly radarShapes: { x: number; z: number; w: number; d: number }[];

  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera: THREE.PerspectiveCamera;
  private overlay: CanvasRenderingContext2D;
  private overlayCv: HTMLCanvasElement;
  private onHud: (h: HudState) => void;
  private map: MapData;
  private boxes: Box[];
  private sun: THREE.DirectionalLight;
  private dust!: THREE.Points;
  private tmp = new THREE.Vector3();
  private composer!: EffectComposer;
  private bloom!: UnrealBloomPass;
  private smaa?: SMAAPass;
  private dpr = 1;
  private adsT = 0;
  private scopeFrame!: THREE.Group;
  private coarse = false;

  private raf = 0;
  private last = 0;
  private t = 0;
  status: Status = "menu";

  private px = 0;
  private py = 0;
  private pz = 62;
  private vx = 0;
  private vy = 0;
  private vz = 0;
  private yaw = 0;
  private pitch = 0;
  private grounded = true;
  private hp = 100;
  private armor = 100;
  private bob = 0;
  private stepT = 0;
  private hurtFlash = 0;
  private hurtDir = 0;
  private deathT = 0;
  private menuCam = 0;

  private wIdx = 0;
  /** 槽位化背包：最多 7 格，取代「8 把枪永远全有」 */
  private slots: InventorySlot[] = makeStartLoadout();
  private pickups: Pickup[] = [];
  private nearPickup: Pickup | null = null;
  private nearPrompt = "";
  private msg = "";
  private msgT = 0;
  private nades: { mesh: THREE.Group; x: number; y: number; z: number; vx: number; vy: number; vz: number; life: number }[] = [];
  private air!: AirDirector;
  private rockets: { mesh: THREE.Group; x: number; y: number; z: number; vx: number; vy: number; vz: number; life: number }[] = [];
  private net: Net | null = null;
  private peers = new Map<
    string,
    { npc: NpcModel; x: number; y: number; z: number; yaw: number; tx: number; ty: number; tz: number; tyaw: number; name: string }
  >();
  private netT = 0;
  private netMode: "off" | "ws" | "local" = "off";
  private fireCd = 0;
  private reloadT = 0;
  private firing = false;
  private semiLatch = false;
  private scoped = false;
  private gun = new THREE.Group();
  private muzzle!: THREE.PointLight;
  private muzzleT = 0;
  private gunKick = 0;
  private swapT = 0;

  private bots: Bot[] = [];
  private wave = 1;
  private kills = 0;
  private headshots = 0;
  private streak = 0;
  private bestStreak = 0;
  private score = 0;
  private feed: FeedItem[] = [];
  private feedId = 1;
  private hitT = 0;
  private hitHead = 0;
  private shake = 0;

  private parts!: THREE.Points;
  private pPos!: Float32Array;
  private pCol!: Float32Array;
  private pool: Part[] = [];
  private decals: THREE.Mesh[] = [];
  private decalI = 0;
  private tracers: { mesh: THREE.Mesh; life: number }[] = [];
  private tracerI = 0;

  private keys = new Set<string>();
  private moveAxis = { x: 0, y: 0 };
  private sig = "";
  private lastEmitT = 0;

  constructor(cv: HTMLCanvasElement, ov: HTMLCanvasElement, onHud: (h: HudState) => void, botNames: string[]) {
    this.onHud = onHud;
    this.botNames = botNames;
    this.overlayCv = ov;
    this.overlay = ov.getContext("2d")!;
    const coarse = window.matchMedia?.("(pointer: coarse)").matches;
    this.coarse = !!coarse;
    this.renderer = new THREE.WebGLRenderer({ canvas: cv, antialias: !coarse, powerPreference: "high-performance" });
    // GPU 丢上下文时必须阻止默认行为，浏览器才会尝试恢复；否则画布会一直黑屏闪烁
    cv.addEventListener("webglcontextlost", (e) => e.preventDefault());
    // 与 resize() 保持同一像素比上限并同步 this.dpr，否则 resize 会把像素比顶回 2.0
    this.dpr = Math.min(coarse ? 1.35 : 2, window.devicePixelRatio || 1);
    this.renderer.setPixelRatio(this.dpr);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.16;

    // fog is what actually caps visible distance — it thins out as you aim
    this.scene.fog = new THREE.Fog(0xdcc49b, 150, 560);
    this.camera = new THREE.PerspectiveCamera(75, 16 / 9, 0.06, 1600);
    this.scene.add(this.camera);

    this.map = buildMap(this.scene);
    this.boxes = this.map.colliders;
    this.radarShapes = this.map.radar;

    this.sun = new THREE.DirectionalLight(0xfff1d0, 2.85);
    this.sun.position.set(48, 90, 32);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(coarse ? 1536 : 4096, coarse ? 1536 : 4096);
    const c = this.sun.shadow.camera;
    c.left = -52;
    c.right = 52;
    c.top = 52;
    c.bottom = -52;
    c.near = 1;
    c.far = 260;
    this.sun.shadow.bias = -0.0006;
    this.sun.shadow.normalBias = 0.035;
    this.scene.add(this.sun);
    this.scene.add(this.sun.target);
    this.scene.add(new THREE.HemisphereLight(0xbcd8f5, 0xc09a66, 1.25));
    const bounce = new THREE.DirectionalLight(0xffe0b0, 0.55);
    bounce.position.set(-40, 26, -30);
    this.scene.add(bounce);

    // the sky becomes a real IBL source: metals and glazed tiles pick up reflections
    const sky = this.scene.children.find((o) => o instanceof THREE.Mesh && (o as THREE.Mesh).material instanceof THREE.MeshBasicMaterial) as THREE.Mesh | undefined;
    const skyMat = sky?.material as THREE.MeshBasicMaterial | undefined;
    if (skyMat?.map) {
      const pmrem = new THREE.PMREMGenerator(this.renderer);
      pmrem.compileEquirectangularShader();
      this.scene.environment = pmrem.fromEquirectangular(skyMat.map).texture;
      this.scene.environmentIntensity = 0.42;
      pmrem.dispose();
    }

    this.buildGun(this.slots[0].defId);
    this.buildFx();
    this.dust = this.scene.children.find((o) => o instanceof THREE.Points) as THREE.Points;

    // post chain: render → bloom (muzzle flash, sun glints, glossy tile) → SMAA → output
    this.composer = new EffectComposer(this.renderer);
    this.composer.addPass(new RenderPass(this.scene, this.camera));
    this.bloom = new UnrealBloomPass(new THREE.Vector2(1, 1), 0.42, 0.75, 0.86);
    this.composer.addPass(this.bloom);
    // SMAA 需要 3 个全屏 pass，高 DPI 手机收益极低却显著增加 GPU 压力，仅桌面端启用
    if (!coarse) {
      this.smaa = new SMAAPass();
      this.composer.addPass(this.smaa);
    }
    this.composer.addPass(new OutputPass());
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;

    this.px = this.map.playerSpawn.x;
    this.pz = this.map.playerSpawn.z;
    this.pickups = buildSpawnPickups(this.scene, this.map.playerSpawn);
    this.air = new AirDirector(this.scene);
    this.net = new Net({
      onPeer: (m) => this.onPeer(m),
      onStatus: (s, _n) => {
        this.netMode = s;
        this.emit(true);
      },
    });
    this.spawnBots(6);

    window.addEventListener("keydown", this.onKeyDown);
    window.addEventListener("wheel", this.onWheel, { passive: true });
    window.addEventListener("keyup", this.onKeyUp);
    window.addEventListener("resize", this.resize);
    window.addEventListener("mousedown", this.onMouseDown);
    window.addEventListener("mouseup", this.onMouseUp);
    window.addEventListener("mousemove", this.onMouseMove);
    this.resize();
    this.loop(performance.now());
    this.emit(true);
  }

  private botNames: string[];

  destroy() {
    cancelAnimationFrame(this.raf);
    window.removeEventListener("keydown", this.onKeyDown);
    window.removeEventListener("keyup", this.onKeyUp);
    window.removeEventListener("wheel", this.onWheel);
    window.removeEventListener("resize", this.resize);
    window.removeEventListener("mousedown", this.onMouseDown);
    window.removeEventListener("mouseup", this.onMouseUp);
    window.removeEventListener("mousemove", this.onMouseMove);
    this.net?.destroy();
    this.renderer.dispose();
  }

  // ------------------------------------------------------------------ input
  private get locked() {
    return document.pointerLockElement === this.renderer.domElement;
  }

  lock() {
    if (this.coarse) return; // pointer lock is unstable on touch devices — touch controls cover it
    const el = this.renderer.domElement as HTMLCanvasElement & { requestPointerLock(): unknown };
    try {
      const r = el.requestPointerLock() as unknown;
      if (r && typeof (r as Promise<void>).catch === "function") (r as Promise<void>).catch(() => {});
    } catch {
      /* drag-to-look fallback covers it */
    }
  }

  private onKeyDown = (e: KeyboardEvent) => {
    const k = e.key.toLowerCase();
    if (this.status === "playing" && [" ", "w", "a", "s", "d", "arrowup", "arrowdown", "arrowleft", "arrowright"].includes(k))
      e.preventDefault();
    this.keys.add(k);
    snd.unlock();
    if (this.status !== "playing") return;
    if (k === "r") this.startReload();
    if (k >= "1" && k <= "7") this.switchWeapon(parseInt(k, 10) - 1);
    if (k === "q") this.cycleWeapon(1);
    if (k === "e") this.cycleWeapon(-1);
    if (k === "f") this.pickupAction();
    if (k === "g") this.dropCurrent();
    if (k === " ") this.jump();
  };
  private onWheel = (e: WheelEvent) => {
    if (this.status !== "playing" || e.deltaY === 0) return;
    this.cycleWeapon(e.deltaY > 0 ? 1 : -1);
  };
  private onKeyUp = (e: KeyboardEvent) => this.keys.delete(e.key.toLowerCase());

  private onMouseDown = (e: MouseEvent) => {
    if (this.status !== "playing") return;
    snd.unlock();
    if (e.button === 0) {
      this.firing = true;
      this.semiLatch = false;
    }
    if (e.button === 2) this.toggleScope();
  };
  private onMouseUp = (e: MouseEvent) => {
    if (e.button === 0) this.firing = false;
  };
  private onMouseMove = (e: MouseEvent) => {
    if (this.status !== "playing" || !this.locked) return;
    const s = this.scoped ? 0.0007 : 0.0022;
    this.yaw -= e.movementX * s;
    this.pitch = Math.max(-1.5, Math.min(1.5, this.pitch - e.movementY * s));
  };

  setMove(x: number, y: number) {
    this.moveAxis.x = x;
    this.moveAxis.y = y;
  }
  look(dx: number, dy: number) {
    if (this.status !== "playing") return;
    const s = this.scoped ? 0.0016 : 0.004;
    this.yaw -= dx * s;
    this.pitch = Math.max(-1.5, Math.min(1.5, this.pitch - dy * s));
  }
  setFiring(v: boolean) {
    this.firing = v;
    this.semiLatch = false;
    snd.unlock();
  }
  jump() {
    if (this.grounded) {
      this.vy = JUMP_V;
      this.grounded = false;
    }
  }
  reloadNow() {
    this.startReload();
  }
  weaponNow(i: number) {
    this.switchWeapon(i);
  }
  /** 触屏「枪」按钮：在当前 slots 内循环 */
  cycleWeapon(dir: number) {
    const n = this.slots.length;
    if (n <= 1) return;
    this.switchWeapon((this.wIdx + dir + n) % n);
  }
  /** 触屏「拾」按钮 */
  pickupNow() {
    this.pickupAction();
  }
  /** 触屏「丢」按钮 */
  dropNow() {
    this.dropCurrent();
  }
  toggleScope() {
    if (!this.w.scope) return; // 匕首/手雷没有镜子
    this.scoped = !this.scoped;
    snd.click();
  }
  /** 只读背包状态，供触屏按钮判断 */
  get inventory() {
    return { count: this.slots.length, max: MAX_SLOTS };
  }

  // ------------------------------------------------------------------ state
  startGame() {
    this.status = "playing";
    this.hp = 100;
    this.armor = 100;
    this.kills = 0;
    this.headshots = 0;
    this.streak = 0;
    this.bestStreak = 0;
    this.score = 0;
    this.wave = 1;
    this.deathT = 0;
    this.t = 0;
    this.feed = [];
    // 开局 loadout：MP5 + AWM + 匕首 + 手雷×2（顺带修掉 ammo/reserve 只写 4 个的历史 bug）
    this.slots = makeStartLoadout();
    this.wIdx = 0;
    this.reloadT = 0;
    this.scoped = false;
    this.msg = "";
    this.msgT = 0;
    this.nearPickup = null;
    this.nearPrompt = "";
    this.nades.forEach((n) => this.scene.remove(n.mesh));
    this.nades = [];
    this.pickups.forEach((p) => removePickup(this.scene, p));
    this.pickups = buildSpawnPickups(this.scene, this.map.playerSpawn);
    this.buildGun(this.slots[0].defId);
    this.px = this.map.playerSpawn.x;
    this.py = 0;
    this.pz = this.map.playerSpawn.z;
    this.vx = this.vy = this.vz = 0;
    this.yaw = 0;
    this.pitch = 0;
    for (const b of this.bots) this.scene.remove(b.npc.group);
    this.bots = [];
    for (const [, p] of this.peers) this.scene.remove(p.npc.group);
    this.peers.clear();
    this.spawnBots(6);
    snd.click();
    this.emit(true);
  }
  pause() {
    if (this.status === "playing") {
      this.status = "paused";
      this.emit(true);
    }
  }
  resume() {
    if (this.status === "paused") {
      this.status = "playing";
      this.lock();
      this.emit(true);
    }
  }
  toMenu() {
    this.status = "menu";
    this.menuCam = 0;
    this.emit(true);
  }

  // ---------------------------------------------------------------- weapons
  private get slot(): InventorySlot {
    return this.slots[this.wIdx] ?? this.slots[0];
  }
  private get w(): WeaponDef {
    return defOf(this.slot.defId);
  }

  private switchWeapon(i: number) {
    if (i === this.wIdx || i < 0 || i >= this.slots.length || this.swapT > 0) return;
    this.selectSlot(i, 0.45);
  }

  /** 直接切到槽位 i（拾取入包时也走这里） */
  private selectSlot(i: number, swap: number) {
    this.wIdx = i;
    this.reloadT = 0;
    this.scoped = false;
    this.swapT = swap;
    this.buildGun(this.slot.defId);
    snd.swap();
    this.emit(true);
  }

  private startReload() {
    const s = this.slot;
    if (s.type !== "gun") return;
    const w = this.w;
    if (this.reloadT > 0 || s.ammo >= w.mag || s.reserve <= 0) return;
    this.reloadT = w.reload;
    this.scoped = false;
    snd.reload();
    this.emit(true);
  }

  private finishReload() {
    const s = this.slot;
    if (s.type !== "gun") return;
    const w = this.w;
    const take = Math.min(w.mag - s.ammo, s.reserve);
    s.ammo += take;
    s.reserve -= take;
    this.emit(true);
  }

  private say(text: string) {
    this.msg = text;
    this.msgT = 2.2;
  }

  /** F / 触屏「拾」：靠近 ≤2.5m 的地面武器入包；满 7 格拒绝 */
  private pickupAction() {
    const p = this.nearPickup;
    if (!p || p.taken) return;
    const def = defOf(p.defId);
    if (def.type === "grenade") {
      const take = p.count ?? 1;
      const ex = this.slots.find((s): s is Extract<InventorySlot, { type: "grenade" }> => s.type === "grenade");
      if (ex && ex.count + take <= GRENADE_STACK) {
        ex.count += take;
        this.nearPickup = null;
        removePickup(this.scene, p);
        this.pickups = this.pickups.filter((q) => q !== p);
        this.selectSlot(this.slots.indexOf(ex), 0.35);
        return;
      }
    }
    if (this.slots.length >= MAX_SLOTS) {
      this.say(`背包已满 (${MAX_SLOTS}/${MAX_SLOTS}) · 先按 G 丢弃`);
      snd.click();
      this.emit(true);
      return;
    }
    let slot: InventorySlot;
    if (def.type === "gun") {
      slot = {
        type: "gun",
        defId: p.defId,
        ammo: p.ammo ?? def.mag,
        reserve: p.reserve ?? def.reserve,
        prime: p.prime || undefined,
      };
    } else if (def.type === "grenade") {
      slot = { type: "grenade", defId: p.defId, count: Math.min(GRENADE_STACK, p.count ?? 1) };
    } else {
      slot = { type: "knife", defId: p.defId };
    }
    this.slots.push(slot);
    this.nearPickup = null;
    removePickup(this.scene, p);
    this.pickups = this.pickups.filter((q) => q !== p);
    this.selectSlot(this.slots.length - 1, 0.35);
  }

  /** G / 触屏「丢」：丢弃当前手持武器；匕首不可丢，保证永远有近战 */
  private dropCurrent() {
    const s = this.slot;
    if (!s) return;
    if (s.type === "knife") {
      this.say("匕首不可丢弃 · 必须留一把近战");
      snd.click();
      this.emit(true);
      return;
    }
    const p = dropPickup(
      this.scene,
      s.type === "gun"
        ? { type: "gun", defId: s.defId, ammo: s.ammo, reserve: s.reserve, prime: s.prime }
        : { type: "grenade", defId: s.defId, count: s.count },
      this.px,
      this.pz,
      this.yaw,
    );
    this.pickups.push(p);
    this.slots.splice(this.wIdx, 1);
    if (this.slots.length === 0) {
      this.slots.push({ type: "knife", defId: KNIFE_ID });
      this.wIdx = 0;
    } else if (this.wIdx >= this.slots.length) this.wIdx = this.slots.length - 1;
    this.selectSlot(this.wIdx, 0.4);
  }

  /** 每帧：靠近检测 → HUD 提示 */
  private stepPickups(dt: number) {
    updatePickups(this.pickups, this.t, dt);
    let best: Pickup | null = null;
    let bd = 2.5;
    for (const p of this.pickups) {
      if (p.taken) continue;
      const d = Math.hypot(p.x - this.px, p.z - this.pz);
      if (d < bd) {
        bd = d;
        best = p;
      }
    }
    this.nearPickup = best;
    if (!best) this.nearPrompt = "";
    else if (this.slots.length >= MAX_SLOTS)
      this.nearPrompt = `背包已满 (${MAX_SLOTS}/${MAX_SLOTS}) · 先按 G 丢弃`;
    else this.nearPrompt = `按 F 拾取 · ${defOf(best.defId).name}`;
    if (this.msgT > 0) this.msgT -= dt;
  }

  /** first-person weapon: full part breakdown — rails, bipods, bolts, optics */
  private buildGun(defId: number) {
    this.camera.remove(this.gun);
    const g = buildGunModel(defId);
    if (this.slot.type === "gun" && this.slot.prime) goldify(g);
    g.traverse((o) => {
      if (o instanceof THREE.Mesh) o.castShadow = false;
    });
    this.gun = g;
    this.camera.add(g);
  }

  // -------------------------------------------------------------------- fx
  private buildFx() {
    const N = 460;
    this.pPos = new Float32Array(N * 3);
    this.pCol = new Float32Array(N * 3);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(this.pPos, 3));
    geo.setAttribute("color", new THREE.BufferAttribute(this.pCol, 3));
    for (let i = 0; i < N; i++) {
      this.pool.push({ x: 0, y: -999, z: 0, vx: 0, vy: 0, vz: 0, life: 0, max: 1, r: 1, g: 1, b: 1 });
      this.pPos[i * 3 + 1] = -999;
    }
    this.parts = new THREE.Points(
      geo,
      new THREE.PointsMaterial({
        map: this.map.softTex,
        size: 0.32,
        vertexColors: true,
        transparent: true,
        depthWrite: false,
      }),
    );
    this.parts.frustumCulled = false;
    this.scene.add(this.parts);

    const dmat = new THREE.MeshBasicMaterial({
      map: this.map.decalTex,
      transparent: true,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -4,
    });
    for (let i = 0; i < 34; i++) {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(0.26, 0.26), dmat);
      m.visible = false;
      this.decals.push(m);
      this.scene.add(m);
    }
    for (let i = 0; i < 18; i++) {
      const m = new THREE.Mesh(
        new THREE.BoxGeometry(0.03, 0.03, 1),
        new THREE.MeshBasicMaterial({ color: 0xffd48a, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }),
      );
      m.visible = false;
      this.tracers.push({ mesh: m, life: 0 });
      this.scene.add(m);
    }

    this.muzzle = new THREE.PointLight(0xffc46a, 0, 14, 2);
    this.muzzle.position.set(0.22, -0.12, -0.85);
    this.camera.add(this.muzzle);

    this.buildScopeFrame();
  }

  /**
   * The scope body, drawn as real geometry 10 cm in front of the eye. Its inner
   * lip sits at 0.75 of the half-frustum, so the machined chamfer you see at the
   * edge of the screen is the physical rim of the optic — and because the ring
   * scales with tan(fov/2) it fills the same screen fraction at any magnification.
   */
  private buildScopeFrame() {
    const cv = document.createElement("canvas");
    cv.width = cv.height = 512;
    const c = cv.getContext("2d")!;
    const cx = 256;
    const cy = 256;
    c.fillStyle = "#0e1012";
    c.fillRect(0, 0, 512, 512);
    // ring geometry normalises UVs by the outer radius: 0.25 == the inner lip
    const g = c.createRadialGradient(cx, cy, 0, cx, cy, 256);
    g.addColorStop(0, "#0e1012");
    g.addColorStop(0.23, "#0e1012");
    g.addColorStop(0.249, "#d8dee2"); // machined chamfer catching light
    g.addColorStop(0.256, "#8a9195");
    g.addColorStop(0.27, "#22272a");
    g.addColorStop(0.34, "#171b1e");
    g.addColorStop(1, "#0c0e10");
    c.fillStyle = g;
    c.beginPath();
    c.arc(cx, cy, 256, 0, Math.PI * 2);
    c.fill();
    // knurled adjustment ring near the eyepiece
    for (let i = 0; i < 120; i++) {
      const a = (i / 120) * Math.PI * 2;
      const r0 = 0.58 + (i % 2 ? 0.0 : 0.04);
      const r1 = 0.98;
      c.strokeStyle = i % 4 === 0 ? "rgba(215,222,226,0.16)" : "rgba(255,255,255,0.05)";
      c.lineWidth = i % 4 === 0 ? 2.4 : 1.6;
      c.beginPath();
      c.moveTo(cx + Math.cos(a) * 256 * r0, cy + Math.sin(a) * 256 * r0);
      c.lineTo(cx + Math.cos(a) * 256 * r1, cy + Math.sin(a) * 256 * r1);
      c.stroke();
    }
    const tex = new THREE.CanvasTexture(cv);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 16;

    const grp = new THREE.Group();
    const body = new THREE.Mesh(
      new THREE.RingGeometry(0.75, 3.0, 96, 1),
      new THREE.MeshStandardMaterial({
        map: tex,
        metalness: 0.6,
        roughness: 0.44,
        side: THREE.DoubleSide,
        envMapIntensity: 0.7,
      }),
    );
    grp.add(body);
    // anti-reflective coating tint just inside the lip
    const coat = new THREE.Mesh(
      new THREE.RingGeometry(0.75, 1.25, 96, 1),
      new THREE.MeshBasicMaterial({
        color: 0x1d5a52,
        transparent: true,
        opacity: 0.14,
        side: THREE.DoubleSide,
        depthWrite: false,
      }),
    );
    coat.position.z = -0.004;
    grp.add(coat);
    grp.position.set(0, 0, -0.1);
    grp.visible = false;
    this.scopeFrame = grp;
    this.camera.add(grp);
  }

  private burst(x: number, y: number, z: number, n: number, col: [number, number, number], spd: number) {
    for (let i = 0; i < n; i++) {
      const p = this.pool.find((q) => q.life <= 0);
      if (!p) return;
      const a = Math.random() * Math.PI * 2;
      const b = (Math.random() - 0.5) * Math.PI;
      const v = spd * (0.4 + Math.random());
      p.x = x;
      p.y = y;
      p.z = z;
      p.vx = Math.cos(a) * Math.cos(b) * v;
      p.vy = Math.sin(b) * v + spd * 0.25;
      p.vz = Math.sin(a) * Math.cos(b) * v;
      p.max = p.life = 0.35 + Math.random() * 0.5;
      p.r = col[0];
      p.g = col[1];
      p.b = col[2];
    }
  }

  private addDecal(x: number, y: number, z: number, nx: number, ny: number, nz: number) {
    const d = this.decals[this.decalI++ % this.decals.length];
    d.position.set(x + nx * 0.02, y + ny * 0.02, z + nz * 0.02);
    d.lookAt(x + nx, y + ny, z + nz);
    d.visible = true;
  }

  private addTracer(x: number, y: number, z: number, tx: number, ty: number, tz: number) {
    const tr = this.tracers[this.tracerI++ % this.tracers.length];
    const len = Math.hypot(tx - x, ty - y, tz - z);
    tr.mesh.position.set((x + tx) / 2, (y + ty) / 2, (z + tz) / 2);
    tr.mesh.scale.set(1, 1, len);
    tr.mesh.lookAt(tx, ty, tz);
    tr.mesh.visible = true;
    tr.life = 0.06;
  }

  // ------------------------------------------------------------------- bots
  private spawnBots(n: number) {
    for (let i = 0; i < n; i++) this.spawnBot();
  }

  private spawnBot() {
    const spots = this.map.enemySpawns;
    let best = spots[0];
    let bd = -1;
    for (const s of spots) {
      const j = Math.hypot(s.x - this.px, s.z - this.pz) + Math.random() * 34;
      if (j > bd) {
        bd = j;
        best = s;
      }
    }
    const roll = Math.random();
    const kind: Bot["kind"] = roll < 0.3 ? "beast" : roll < 0.38 && this.wave >= 2 ? "boss" : "soldier";
    const npc = kind === "soldier" ? buildNpc() : buildBeast(kind === "boss");
    let sx = best.x;
    let sz = best.z;
    for (let i = 0; i < 14; i++) {
      const tx = best.x + (Math.random() - 0.5) * 7;
      const tz = best.z + (Math.random() - 0.5) * 7;
      sx = tx;
      sz = tz;
      if (!this.hits(tx, 0, tz, 0.45, 1.8)) break;
    }
    npc.group.position.set(sx, 0, sz);
    this.scene.add(npc.group);
    this.bots.push({
      npc,
      kind,
      name:
        kind === "boss"
          ? "异形·暴君"
          : kind === "beast"
            ? "异形·猎手"
            : this.botNames[Math.floor(Math.random() * this.botNames.length)],
      x: sx,
      y: 0,
      z: sz,
      hp: kind === "boss" ? 900 : kind === "beast" ? 150 : 100,
      yaw: 0,
      alive: true,
      die: 0,
      fire: 0.8 + Math.random(),
      burst: 0,
      wp: Math.floor(Math.random() * this.map.waypoints.length),
      anim: Math.random() * 6,
      hurt: 0,
      flashT: 0,
    });
  }

  private los(x: number, y: number, z: number) {
    const dx = this.px - x;
    const dy = this.py + EYE - y;
    const dz = this.pz - z;
    const len = Math.hypot(dx, dy, dz);
    return this.rayWorld(x, y, z, dx / len, dy / len, dz / len, len) < 0;
  }

  // -------------------------------------------------------------- collision
  private hits(x: number, y: number, z: number, r: number, h: number) {
    for (let i = 0; i < this.boxes.length; i++) {
      const b = this.boxes[i];
      if (x + r > b.x0 && x - r < b.x1 && y + h > b.y0 && y < b.y1 && z + r > b.z0 && z - r < b.z1) return true;
    }
    return false;
  }

  private rayWorld(ox: number, oy: number, oz: number, dx: number, dy: number, dz: number, maxT: number, nrm?: { x: number; y: number; z: number }) {
    let best = -1;
    let bt = maxT;
    for (let i = 0; i < this.boxes.length; i++) {
      const b = this.boxes[i];
      let t0 = 0;
      let t1 = bt;
      let nx = 0;
      let ny = 0;
      let nz = 0;
      const ax: [number, number, number, number][] = [
        [ox, dx, b.x0, b.x1],
        [oy, dy, b.y0, b.y1],
        [oz, dz, b.z0, b.z1],
      ];
      let ok = true;
      for (let a = 0; a < 3; a++) {
        const [o, d, lo, hi] = ax[a];
        if (Math.abs(d) < 1e-8) {
          if (o < lo || o > hi) {
            ok = false;
            break;
          }
          continue;
        }
        let ta = (lo - o) / d;
        let tb = (hi - o) / d;
        let s = -1;
        if (ta > tb) {
          const tmp = ta;
          ta = tb;
          tb = tmp;
          s = 1;
        }
        if (ta > t0) {
          t0 = ta;
          nx = a === 0 ? s : 0;
          ny = a === 1 ? s : 0;
          nz = a === 2 ? s : 0;
        }
        if (tb < t1) t1 = tb;
        if (t0 > t1) {
          ok = false;
          break;
        }
      }
      if (ok && t0 < bt && t0 > 0.0001) {
        bt = t0;
        best = t0;
        if (nrm) {
          nrm.x = nx;
          nrm.y = ny;
          nrm.z = nz;
        }
      }
    }
    return best;
  }

  private rayBots(ox: number, oy: number, oz: number, dx: number, dy: number, dz: number, maxT: number) {
    let hit: { bot: Bot; t: number; head: boolean } | null = null;
    for (const b of this.bots) {
      if (!b.alive) continue;
      const hh = b.kind === "soldier" ? 1.9 : b.kind === "boss" ? 3.45 : 1.5;
      const ww = b.kind === "soldier" ? 0.3 : b.kind === "boss" ? 1.0 : 0.5;
      const y0 = 0;
      const headLow = y0 + hh * (b.kind === "soldier" ? 0.79 : 0.78);
      const parts: [number, number, number, number, number, number, boolean][] = [
        [b.x - ww, b.y + headLow, b.z - ww, b.x + ww, b.y + hh, b.z + ww, true],
        [b.x - ww, b.y + y0, b.z - ww, b.x + ww, b.y + headLow, b.z + ww, false],
      ];
      for (const [x0, y0, z0, x1, y1, z1, head] of parts) {
        let t0 = 0;
        let t1 = hit ? hit.t : maxT;
        const ax: [number, number, number, number][] = [
          [ox, dx, x0, x1],
          [oy, dy, y0, y1],
          [oz, dz, z0, z1],
        ];
        let ok = true;
        for (let a = 0; a < 3; a++) {
          const [o, d, lo, hi] = ax[a];
          if (Math.abs(d) < 1e-8) {
            if (o < lo || o > hi) {
              ok = false;
              break;
            }
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
          if (t0 > t1) {
            ok = false;
            break;
          }
        }
        if (ok && t0 < t1 && t0 > 0.0001 && t0 < (hit ? hit.t : maxT)) hit = { bot: b, t: t0, head };
      }
    }
    return hit;
  }

  // ----------------------------------------------------------------- firing
  private shoot() {
    const s = this.slot;
    const w = this.w;
    if (this.fireCd > 0 || this.swapT > 0) return;
    if (s.type === "knife") return this.knifeAttack(w);
    if (s.type === "grenade") return this.throwGrenade(w);
    if (this.reloadT > 0) return;
    if (s.ammo <= 0) {
      snd.click();
      this.fireCd = 0.25;
      return;
    }
    s.ammo--;
    this.fireCd = 60 / w.rpm;
    snd.shot(w.kind);
    this.muzzleT = 0.05;
    this.muzzle.intensity = w.kind === "rocket" ? 8 : 30;
    this.gunKick = Math.min(0.13, this.gunKick + 0.05 + w.recoil * 0.012);
    this.pitch += w.recoil * 0.0055 * (this.scoped ? 0.45 : 1);
    this.yaw += (Math.random() - 0.5) * w.recoil * 0.004;
    this.shake = Math.min(1, this.shake + w.recoil * 0.06);

    const moving = Math.hypot(this.vx, this.vz) > 1.2;
    const baseSpread = w.spread * (moving ? 2.6 : 1) * (this.scoped ? 0.15 : 1) * (this.grounded ? 1 : 3) + this.gunKick * 0.05;

    const aim = new THREE.Vector3();
    this.camera.getWorldDirection(aim);
    if (w.kind === "rocket") {
      this.launchRocket(aim);
    } else {
      const pellets = w.pellets ?? 1;
      for (let p = 0; p < pellets; p++) this.firePellet(aim, baseSpread * (pellets > 1 ? 1 : 1) + (pellets > 1 ? w.spread : 0), w);
    }
    if (s.ammo === 0) this.startReload();
    this.emit(true);
  }

  /** 匕首：短射程扇形判定，高倍率伤害 */
  private knifeAttack(w: WeaponDef) {
    this.fireCd = 60 / w.rpm;
    snd.whoosh();
    this.gunKick = Math.min(0.13, this.gunKick + 0.04);
    this.swapT = Math.max(this.swapT, 0);
    const aim = new THREE.Vector3();
    this.camera.getWorldDirection(aim);
    const ox = this.px;
    const oy = this.py + EYE;
    const oz = this.pz;
    const bh = this.rayBots(ox, oy, oz, aim.x, aim.y, aim.z, KNIFE_RANGE);
    const ah = this.air.ray(ox, oy, oz, aim.x, aim.y, aim.z, KNIFE_RANGE);
    const wt = this.rayWorld(ox, oy, oz, aim.x, aim.y, aim.z, KNIFE_RANGE);
    const botT = bh ? bh.t : 999;
    const alienT = ah ? ah.t : 999;
    const worldT = wt > 0 ? wt : 999;
    if (bh && botT <= alienT && botT < worldT) {
      const hx = ox + aim.x * bh.t;
      const hy = oy + aim.y * bh.t;
      const hz = oz + aim.z * bh.t;
      const dmg = Math.round(w.dmg * (bh.head ? w.headMul : 1));
      bh.bot.hp -= dmg;
      bh.bot.hurt = 0.14;
      this.burst(hx, hy, hz, bh.head ? 12 : 7, [0.55, 0.06, 0.05], 2.4);
      this.hitT = 0.22;
      if (bh.head) this.hitHead = 0.3;
      snd.hit(bh.head);
      if (bh.bot.hp <= 0) this.killBot(bh.bot, bh.head);
    } else if (ah && alienT < worldT) {
      const hx = ox + aim.x * ah.t;
      const hy = oy + aim.y * ah.t;
      const hz = oz + aim.z * ah.t;
      const dmg = Math.round(w.dmg * (ah.head ? w.headMul : 1));
      this.air.hurt(ah.index, dmg, true);
      this.burst(hx, hy, hz, 10, [0.4, 0.95, 0.85], 2.2);
      this.hitT = 0.22;
      if (ah.head) this.hitHead = 0.3;
      snd.hit(ah.head);
    }
    this.emit(true);
  }

  /** 手雷：独立投掷循环，不占用枪械开火；引信 1.5s + 抛物线 */
  private throwGrenade(w: WeaponDef) {
    const s = this.slot;
    if (s.type !== "grenade" || s.count <= 0) return;
    s.count--;
    this.fireCd = 60 / w.rpm;
    snd.swap();
    const aim = new THREE.Vector3();
    this.camera.getWorldDirection(aim);
    const ox = this.px;
    const oy = this.py + EYE - 0.1;
    const oz = this.pz;
    const spd = 17;
    const mesh = this.buildGrenadeMesh();
    mesh.position.set(ox, oy, oz);
    mesh.lookAt(ox + aim.x, oy + aim.y, oz + aim.z);
    this.scene.add(mesh);
    this.nades.push({
      mesh,
      x: ox,
      y: oy,
      z: oz,
      vx: aim.x * spd,
      vy: aim.y * spd + 3.2,
      vz: aim.z * spd,
      life: 1.5,
    });
    if (s.count <= 0) {
      this.slots.splice(this.wIdx, 1);
      if (this.slots.length === 0) this.slots.push({ type: "knife", defId: KNIFE_ID });
      this.wIdx = Math.min(this.wIdx, this.slots.length - 1);
      this.selectSlot(this.wIdx, 0.4);
    }
    this.emit(true);
  }

  private buildGrenadeMesh(): THREE.Group {
    const g = new THREE.Group();
    const shell = new THREE.MeshStandardMaterial({ color: 0x4d5538, metalness: 0.4, roughness: 0.55 });
    const body = new THREE.Mesh(new THREE.SphereGeometry(0.075, 12, 10), shell);
    body.scale.set(1, 1.2, 1);
    g.add(body);
    const cap = new THREE.Mesh(
      new THREE.CylinderGeometry(0.03, 0.036, 0.05, 10),
      new THREE.MeshStandardMaterial({ color: 0x8a8f7a, metalness: 0.8, roughness: 0.35 }),
    );
    cap.position.y = 0.09;
    g.add(cap);
    return g;
  }

  private updateGrenades(dt: number) {
    for (let i = this.nades.length - 1; i >= 0; i--) {
      const n = this.nades[i];
      n.life -= dt;
      n.vy -= GRAV * dt;
      const speed = Math.hypot(n.vx, n.vy, n.vz);
      const step = speed * dt + 0.16;
      const len = speed || 1;
      const dx = n.vx / len;
      const dy = n.vy / len;
      const dz = n.vz / len;
      const wt = this.rayWorld(n.x, n.y, n.z, dx, dy, dz, step);
      const hitWall = wt > 0 && wt <= step;
      const hitGround = n.y <= 0.14 && n.vy < 0;
      if (n.life <= 0 || hitWall || hitGround) {
        const hx = hitWall ? n.x + dx * wt : n.x;
        const hy = hitWall ? Math.max(0.3, n.y + dy * wt) : Math.max(0.3, n.y);
        const hz = hitWall ? n.z + dz * wt : n.z;
        const w = defOf(GRENADE_ID);
        this.explode(hx, hy, hz, w.splashR ?? 6, w.splash ?? 130, true);
        this.scene.remove(n.mesh);
        this.nades.splice(i, 1);
      } else {
        n.x += n.vx * dt;
        n.y += n.vy * dt;
        n.z += n.vz * dt;
        n.mesh.position.set(n.x, n.y, n.z);
        n.mesh.rotation.x += dt * 6;
        n.mesh.rotation.z += dt * 4;
      }
    }
  }

  private firePellet(aim: THREE.Vector3, spread: number, w: WeaponDef) {
    const dir = aim.clone();
    dir.x += (Math.random() - 0.5) * spread;
    dir.y += (Math.random() - 0.5) * spread;
    dir.z += (Math.random() - 0.5) * spread;
    dir.normalize();
    const ox = this.px;
    const oy = this.py + EYE;
    const oz = this.pz;
    const nrm = { x: 0, y: 0, z: 0 };
    const wt = this.rayWorld(ox, oy, oz, dir.x, dir.y, dir.z, 300, nrm);
    const bh = this.rayBots(ox, oy, oz, dir.x, dir.y, dir.z, 300);
    const ah = this.air.ray(ox, oy, oz, dir.x, dir.y, dir.z, 300);
    const botT = bh ? bh.t : 999;
    const alienT = ah ? ah.t : 999;
    const worldT = wt > 0 ? wt : 999;
    if (bh && botT <= alienT && botT < worldT) {
      const hx = ox + dir.x * bh.t;
      const hy = oy + dir.y * bh.t;
      const hz = oz + dir.z * bh.t;
      this.addTracer(ox, oy, oz, hx, hy, hz);
      const dmg = Math.round(w.dmg * Math.max(0.45, 1 - bh.t / 130) * (bh.head ? w.headMul : 1));
      bh.bot.hp -= dmg;
      bh.bot.hurt = 0.12;
      this.burst(hx, hy, hz, bh.head ? 12 : 7, [0.55, 0.06, 0.05], 2.4);
      this.hitT = 0.22;
      if (bh.head) this.hitHead = 0.3;
      snd.hit(bh.head);
      if (bh.bot.hp <= 0) this.killBot(bh.bot, bh.head);
    } else if (ah && alienT < worldT) {
      const hx = ox + dir.x * ah.t;
      const hy = oy + dir.y * ah.t;
      const hz = oz + dir.z * ah.t;
      this.addTracer(ox, oy, oz, hx, hy, hz);
      const dmg = Math.round(w.dmg * (ah.head ? w.headMul : 1));
      this.air.hurt(ah.index, dmg, true);
      this.net?.send({ t: "h", id: this.net.id, kind: "alien", p: [hx, hy, hz], dmg, head: ah.head });
      this.burst(hx, hy, hz, 10, [0.4, 0.95, 0.85], 2.2);
      this.hitT = 0.22;
      if (ah.head) this.hitHead = 0.3;
      snd.hit(ah.head);
    } else if (wt > 0) {
      const hx = ox + dir.x * wt;
      const hy = oy + dir.y * wt;
      const hz = oz + dir.z * wt;
      this.addTracer(ox, oy, oz, hx, hy, hz);
      this.addDecal(hx, hy, hz, nrm.x, nrm.y, nrm.z);
      this.burst(hx + nrm.x * 0.1, hy + nrm.y * 0.1, hz + nrm.z * 0.1, 6, [0.82, 0.74, 0.55], 1.8);
    } else {
      this.addTracer(ox, oy, oz, ox + dir.x * 300, oy + dir.y * 300, oz + dir.z * 300);
    }
  }

  private launchRocket(dir: THREE.Vector3) {
    const g = new THREE.Group();
    const body = new THREE.Mesh(
      new THREE.CylinderGeometry(0.055, 0.07, 0.72, 10),
      new THREE.MeshStandardMaterial({ color: 0x4d5538, roughness: 0.55, metalness: 0.4 }),
    );
    body.rotation.x = Math.PI / 2;
    g.add(body);
    const flame = new THREE.Mesh(
      new THREE.SphereGeometry(0.09, 8, 6),
      new THREE.MeshBasicMaterial({ color: 0xffb060 }),
    );
    flame.position.z = 0.4;
    g.add(flame);
    const ox = this.px;
    const oy = this.py + EYE - 0.05;
    const oz = this.pz;
    g.position.set(ox, oy, oz);
    g.lookAt(ox + dir.x, oy + dir.y, oz + dir.z);
    this.scene.add(g);
    const spd = 38;
    this.rockets.push({ mesh: g, x: ox, y: oy, z: oz, vx: dir.x * spd, vy: dir.y * spd, vz: dir.z * spd, life: 3.2 });
    snd.whoosh();
  }

  private updateRockets(dt: number) {
    for (let i = this.rockets.length - 1; i >= 0; i--) {
      const r = this.rockets[i];
      r.life -= dt;
      r.vy -= 4 * dt;
      const step = Math.hypot(r.vx, r.vy, r.vz) * dt + 0.3;
      const len = Math.hypot(r.vx, r.vy, r.vz) || 1;
      const dx = r.vx / len;
      const dy = r.vy / len;
      const dz = r.vz / len;
      const wt = this.rayWorld(r.x, r.y, r.z, dx, dy, dz, step);
      const bh = this.rayBots(r.x, r.y, r.z, dx, dy, dz, step);
      const ah = this.air.ray(r.x, r.y, r.z, dx, dy, dz, step);
      const t = Math.min(wt > 0 ? wt : 99, bh ? bh.t : 99, ah ? ah.t : 99);
      if ((t < 90 && t <= step) || r.life <= 0 || r.y < 0.2) {
        const hx = r.x + dx * Math.min(t, step);
        const hy = Math.max(0.3, r.y + dy * Math.min(t, step));
        const hz = r.z + dz * Math.min(t, step);
        this.explode(hx, hy, hz, this.w.splashR ?? 6.5, this.w.splash ?? 140, true);
        this.scene.remove(r.mesh);
        this.rockets.splice(i, 1);
      } else {
        r.x += r.vx * dt;
        r.y += r.vy * dt;
        r.z += r.vz * dt;
        r.mesh.position.set(r.x, r.y, r.z);
        r.mesh.lookAt(r.x + r.vx, r.y + r.vy, r.z + r.vz);
      }
    }
  }

  private explode(x: number, y: number, z: number, radius: number, dmg: number, byPlayer: boolean) {
    this.burst(x, y + 0.4, z, 28, [1, 0.55, 0.15], 7);
    this.burst(x, y + 0.2, z, 16, [0.25, 0.2, 0.16], 4);
    snd.blast();
    const pd = Math.hypot(this.px - x, this.pz - z);
    this.shake = Math.min(1, this.shake + Math.max(0, 1 - pd / 18));
    if (pd < radius) this.hurtPlayer(dmg * (1 - pd / radius) * (byPlayer ? 0.4 : 0.7), x, z);
    for (const b of this.bots) {
      if (!b.alive) continue;
      const d = Math.hypot(b.x - x, b.z - z);
      if (d < radius) {
        b.hp -= dmg * (1 - d / radius);
        b.hurt = 0.2;
        if (b.hp <= 0) this.killBot(b, false);
      }
    }
    this.air.splash(x, y, z, radius, dmg, byPlayer);
  }

  private airTargets(): AirTarget[] {
    const out: AirTarget[] = [];
    this.bots.forEach((b, id) => {
      if (b.alive) out.push({ kind: "bot", id, x: b.x, y: b.y, z: b.z });
    });
    return out;
  }

  // ------------------------------------------------------------------ net
  /** broadcast our transform ~12Hz and interpolate everyone else's avatar */
  private stepNet(dt: number) {
    const n = this.net;
    if (!n) return;
    this.netT -= dt;
    if (this.netT <= 0) {
      this.netT = 0.08;
      n.send({
        t: "p",
        id: n.id,
        name: n.name,
        x: this.px,
        y: this.py,
        z: this.pz,
        yaw: this.yaw,
        hp: Math.round(this.hp),
      });
    }
    for (const [, p] of this.peers) {
      const k = Math.min(1, dt * 11);
      p.x += (p.tx - p.x) * k;
      p.y += (p.ty - p.y) * k;
      p.z += (p.tz - p.z) * k;
      let d = p.tyaw - p.yaw;
      while (d > Math.PI) d -= Math.PI * 2;
      while (d < -Math.PI) d += Math.PI * 2;
      p.yaw += d * k;
      p.npc.group.position.set(p.x, p.y, p.z);
      p.npc.group.rotation.y = p.yaw;
      const speed = Math.hypot(p.tx - p.x, p.tz - p.z) * 6;
      p.npc.group.visible = this.py > p.y - 60;
      animateNpc(p.npc, performance.now() * 0.004, Math.min(5, speed + 2), true, 0, 0);
      p.npc.flash.visible = false;
    }
  }

  private onPeer(m: InMsg) {
    if (m.t === "j" || m.t === "p") {
      let p = this.peers.get(m.id);
      if (!p && m.t === "j") {
        const npc = buildNpc();
        npc.group.position.set(m.x, m.y, m.z);
        this.scene.add(npc.group);
        p = { npc, x: m.x, y: m.y, z: m.z, yaw: m.yaw, tx: m.x, ty: m.y, tz: m.z, tyaw: m.yaw, name: m.name || "队友" };
        this.peers.set(m.id, p);
        this.feed = [{ id: this.feedId++, name: p.name, gun: "已加入战场", head: false }, ...this.feed].slice(0, 5);
        snd.click();
        this.emit(true); // 队友进场才强制刷新 HUD；12.5Hz 的位置包由每帧常规 emit 兜底
      }
      if (p) {
        p.tx = m.x;
        p.ty = m.y;
        p.tz = m.z;
        p.tyaw = m.yaw;
        if (m.t === "j") {
          p.x = m.x;
          p.y = m.y;
          p.z = m.z;
        }
      }
    } else if (m.t === "x") {
      const p = this.peers.get(m.id);
      if (p) {
        this.scene.remove(p.npc.group);
        this.peers.delete(m.id);
        this.emit(true);
      }
    } else if (m.t === "h") {
      const p = this.peers.get(m.id);
      const origin = p ? [p.x, p.y + 1.5, p.z] : null;
      if (origin) this.addTracer(origin[0], origin[1], origin[2], m.p[0], m.p[1], m.p[2]);
      if (m.kind === "bot") {
        let best: { bot: Bot; d: number } | null = null;
        for (const b of this.bots) {
          if (!b.alive) continue;
          const d = Math.hypot(b.x - m.p[0], b.z - m.p[2]);
          if (d < 2.4 && (!best || d < best.d)) best = { bot: b, d };
        }
        if (best) {
          best.bot.hp -= m.dmg;
          best.bot.hurt = 0.14;
          this.burst(m.p[0], m.p[1], m.p[2], 6, [0.55, 0.06, 0.05], 2);
          if (best.bot.hp <= 0) this.killBot(best.bot, m.head);
        }
      } else {
        this.air.hurtNear(m.p[0], m.p[1], m.p[2], 2.4, m.dmg);
        this.burst(m.p[0], m.p[1], m.p[2], 6, [0.4, 0.95, 0.85], 2);
      }
    }
  }

  private stepAir(dt: number) {
    this.air.update(dt, {
      playing: this.status === "playing",
      px: this.px,
      py: this.py,
      pz: this.pz,
      targets: this.airTargets(),
      blocked: (ox, oy, oz, dx, dy, dz, max) => {
        const len = Math.hypot(dx, dy, dz) || 1;
        const t = this.rayWorld(ox, oy, oz, dx / len, dy / len, dz / len, Math.max(max, 0.05));
        return t > 0 && t < max;
      },
      groundY: (x, y, z) => {
        const t = this.rayWorld(x, y, z, 0, -1, 0, 80);
        return t > 0 ? y - t : 0;
      },
      onPlayerHit: (amt, fx, fz) => this.hurtPlayer(amt, fx, fz),
      onBotHit: (id, amt) => {
        const b = this.bots[id];
        if (!b || !b.alive) return;
        b.hp -= amt;
        b.hurt = 0.16;
        if (b.hp <= 0) this.killBot(b, false);
      },
      onBlast: (x, y, z) => {
        this.burst(x, y + 0.5, z, 26, [1, 0.5, 0.12], 8);
        this.burst(x, y, z, 12, [0.3, 0.24, 0.18], 4);
        const pd = Math.hypot(this.px - x, this.pz - z);
        this.shake = Math.min(1, this.shake + Math.max(0, 1 - pd / 22));
      },
      onAlienDown: (name, byPlayer) => {
        this.kills++;
        this.streak++;
        this.bestStreak = Math.max(this.bestStreak, this.streak);
        this.score += byPlayer ? 280 : 80;
        this.feed = [{ id: this.feedId++, name, gun: byPlayer ? this.w.name : "空袭", head: false }, ...this.feed].slice(0, 5);
        snd.kill();
        this.emit(true);
      },
    });
  }

  private killBot(b: Bot, head: boolean) {
    b.alive = false;
    b.die = 2.4;
    this.kills++;
    this.streak++;
    this.bestStreak = Math.max(this.bestStreak, this.streak);
    if (head) this.headshots++;
    const base = b.kind === "boss" ? 600 : b.kind === "beast" ? 200 : 100;
    this.score += base + (head ? 150 : 0) + Math.min(200, this.streak * 10);
    this.feed = [{ id: this.feedId++, name: b.name, gun: this.w.name, head }, ...this.feed].slice(0, 5);
    snd.kill();
    const col: [number, number, number] = b.kind === "soldier" ? [0.5, 0.05, 0.05] : [0.2, 0.9, 0.75];
    this.burst(b.x, b.y + 1.2, b.z, b.kind === "boss" ? 30 : 16, col, b.kind === "boss" ? 6 : 3);
    if (b.kind === "boss") {
      this.shake = 1;
      this.score += 500;
      this.feed = [{ id: this.feedId++, name: "异形·暴君", gun: "已被击杀", head: false }, ...this.feed].slice(0, 5);
    }
    if (this.kills % 6 === 0) {
      this.wave++;
      this.spawnBot();
      this.spawnBot();
    }
    this.emit(true);
  }

  private hurtPlayer(amt: number, fromX: number, fromZ: number) {
    if (this.status !== "playing") return;
    const absorbed = Math.min(this.armor, amt * 0.5);
    this.armor -= absorbed;
    this.hp -= amt - absorbed;
    this.hurtFlash = 1;
    this.shake = Math.min(1, this.shake + 0.5);
    this.hurtDir = Math.atan2(-(fromX - this.px), -(fromZ - this.pz)) - this.yaw;
    snd.hurt();
    if (this.hp <= 0) {
      this.hp = 0;
      this.status = "over";
      this.deathT = 1.6;
      this.streak = 0;
      snd.die();
    }
    this.emit(true);
  }

  // ------------------------------------------------------------------- loop
  private lastW = 0;
  private lastH = 0;
  private resize = () => {
    const cv = this.renderer.domElement;
    const r = cv.getBoundingClientRect();
    const w = Math.max(1, Math.round(r.width));
    const h = Math.max(1, Math.round(r.height));
    // 与构造函数一致的像素比上限，手机绝不能升到 2.0
    const base = Math.min(this.coarse ? 1.35 : 2, window.devicePixelRatio || 1);
    // 开镜时超采样，让放大画面保持清晰而不是露出纹素。
    // 只作用于 WebGL composer；overlay 始终用 base，两者像素比互相独立
    const want = this.scoped ? Math.min(3, base * 1.6) : base;
    // 尺寸与像素比都没变就直接返回：设置 canvas.width/height 会清空画布，
    // 多余调用在手机（地址栏伸缩触发连环 resize）上表现为整页闪烁
    if (w === this.lastW && h === this.lastH && Math.abs(want - this.dpr) <= 0.01) return;
    this.lastW = w;
    this.lastH = h;
    if (Math.abs(want - this.dpr) > 0.01) {
      this.dpr = want;
      this.renderer.setPixelRatio(want);
      this.composer?.setPixelRatio(want);
    }
    this.renderer.setSize(w, h, false);
    this.composer?.setSize(w, h);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    // overlay 画布按 device 像素开尺寸，但统一用 setTransform(base) 切到 CSS 像素坐标系，
    // drawOverlay 里所有坐标/线宽一律写 CSS 像素，禁止再乘 devicePixelRatio
    this.overlayCv.width = Math.round(w * base);
    this.overlayCv.height = Math.round(h * base);
    this.overlay.setTransform(base, 0, 0, base, 0, 0);
  };

  private loop = (now: number) => {
    this.raf = requestAnimationFrame(this.loop);
    let dt = (now - this.last) / 1000;
    this.last = now;
    if (!isFinite(dt) || dt <= 0) dt = 1 / 60;
    if (dt > 0.05) dt = 0.05;
    this.update(dt);
    this.render(dt);
    this.emit(false);
  };

  private update(dt: number) {
    this.t += dt;
    if (this.status === "menu") {
      this.menuCam += dt * 0.05;
      this.stepFx(dt);
      this.stepPickups(dt);
      return;
    }
    if (this.status === "over") {
      this.deathT = Math.max(0, this.deathT - dt);
      this.stepFx(dt);
      this.updateBots(dt);
      this.stepPickups(dt);
      return;
    }
    if (this.status !== "playing") return;
    this.stepNet(dt);

    let mx = 0;
    let mz = 0;
    const k = this.keys;
    if (k.has("a") || k.has("arrowleft")) mx -= 1;
    if (k.has("d") || k.has("arrowright")) mx += 1;
    if (k.has("w") || k.has("arrowup")) mz -= 1;
    if (k.has("s") || k.has("arrowdown")) mz += 1;
    mx += this.moveAxis.x;
    mz += this.moveAxis.y;
    const ml = Math.hypot(mx, mz);
    if (ml > 1) {
      mx /= ml;
      mz /= ml;
    }
    const speed = (k.has("shift") ? 2.6 : 5.6) * (this.scoped ? 0.5 : 1);
    const s = Math.sin(this.yaw);
    const c = Math.cos(this.yaw);
    const wx = mx * c + mz * s;
    const wz = -mx * s + mz * c;
    const acc = this.grounded ? 34 : 10;
    this.vx += (wx * speed - this.vx) * Math.min(1, acc * dt);
    this.vz += (wz * speed - this.vz) * Math.min(1, acc * dt);

    const nx = this.px + this.vx * dt;
    if (!this.hits(nx, this.py, this.pz, PLAYER_R, PLAYER_H)) this.px = nx;
    else if (!this.hits(nx, this.py + 0.6, this.pz, PLAYER_R, PLAYER_H)) {
      this.px = nx;
      this.py += 0.6;
    } else this.vx = 0;
    const nz = this.pz + this.vz * dt;
    if (!this.hits(this.px, this.py, nz, PLAYER_R, PLAYER_H)) this.pz = nz;
    else if (!this.hits(this.px, this.py + 0.6, nz, PLAYER_R, PLAYER_H)) {
      this.pz = nz;
      this.py += 0.6;
    } else this.vz = 0;

    this.vy -= GRAV * dt;
    const ny = this.py + this.vy * dt;
    if (!this.hits(this.px, ny, this.pz, PLAYER_R, PLAYER_H)) {
      this.py = ny;
      this.grounded = false;
    } else if (this.vy < 0) {
      this.grounded = true;
      this.vy = 0;
    } else this.vy = 0;
    if (this.py <= 0) {
      this.py = 0;
      if (this.vy < 0) this.vy = 0;
      this.grounded = true;
    }
    this.px = Math.max(-74, Math.min(74, this.px));
    this.pz = Math.max(-74, Math.min(74, this.pz));

    const spd = Math.hypot(this.vx, this.vz);
    if (this.grounded && spd > 0.6) {
      this.bob += dt * spd * 1.7;
      this.stepT -= dt * spd;
      if (this.stepT <= 0) {
        this.stepT = 3.2;
        snd.step();
      }
    }

    this.fireCd -= dt;
    this.swapT = Math.max(0, this.swapT - dt);
    if (this.reloadT > 0) {
      this.reloadT -= dt;
      if (this.reloadT <= 0) {
        this.reloadT = 0;
        this.finishReload();
      }
    }
    if (this.firing && (this.w.auto || !this.semiLatch) && this.fireCd <= 0) {
      this.shoot();
      this.semiLatch = true;
    }
    this.gunKick = Math.max(0, this.gunKick - dt * 0.55);
    this.muzzleT -= dt;
    if (this.muzzleT <= 0) this.muzzle.intensity = 0;
    this.hitT = Math.max(0, this.hitT - dt);
    this.hitHead = Math.max(0, this.hitHead - dt);
    this.hurtFlash = Math.max(0, this.hurtFlash - dt * 1.5);
    this.shake = Math.max(0, this.shake - dt * 2.6);

    this.updateRockets(dt);
    this.updateGrenades(dt);
    this.stepPickups(dt);
    this.stepAir(dt);
    this.updateBots(dt);
    this.stepFx(dt);
  }

  private updateBots(dt: number) {
    for (const b of this.bots) {
      b.hurt = Math.max(0, b.hurt - dt);
      b.flashT = Math.max(0, b.flashT - dt);
      b.npc.flash.visible = b.flashT > 0;
      if (b.npc.flash.visible) b.npc.flash.rotation.z = Math.random() * 6.28;
      if (!b.alive) {
        b.die -= dt;
        if (b.kind === "soldier") animateNpc(b.npc, 0, 0, false, 0, Math.max(0, b.die));
        else animateBeast(b.npc, 0, 0, false, 0, Math.max(0, b.die));
        b.npc.group.position.y = Math.max(-0.4, b.npc.group.position.y - dt * 0.35);
        if (b.die <= 0) {
          const s = this.map.enemySpawns[Math.floor(Math.random() * this.map.enemySpawns.length)];
          b.x = s.x + (Math.random() - 0.5) * 5;
          b.z = s.z + (Math.random() - 0.5) * 5;
          for (let i = 0; i < 10 && this.hits(b.x, 0, b.z, 0.45, 1.8); i++) {
            b.x = s.x + (Math.random() - 0.5) * 7;
            b.z = s.z + (Math.random() - 0.5) * 7;
          }
          b.y = 0;
          b.hp = 100;
          b.alive = true;
          b.npc.group.rotation.set(0, 0, 0);
          b.npc.group.position.set(b.x, 0, b.z);
        }
        continue;
      }

      const dx = this.px - b.x;
      const dz = this.pz - b.z;
      const dist = Math.hypot(dx, dz);
      const see = dist < 64 && this.los(b.x, b.y + 1.5, b.z);
      let mvx = 0;
      let mvz = 0;
      let speed = 2.7;
      if (see) {
        b.yaw = Math.atan2(dx, dz);
        const want = dist > 18 ? 1 : dist < 9 ? -1 : 0;
        const nx = dx / (dist || 1);
        const nz = dz / (dist || 1);
        const strafe = Math.sin(this.t * 1.3 + b.anim) * 0.85;
        mvx = nx * want - nz * strafe;
        mvz = nz * want + nx * strafe;
        speed = 3.5;
        b.fire -= dt;
        if (b.fire <= 0) {
          b.fire = (0.8 + Math.random() * 0.7) * Math.max(0.5, 1 - this.wave * 0.04);
          b.burst = 2 + Math.floor(Math.random() * 3);
        }
        if (b.burst > 0) {
          b.fire -= dt * 4;
          if (b.fire <= 0) {
            b.burst--;
            b.fire = 0.12;
            b.flashT = 0.05;
            snd.enemyShot(dist);
            muzzleWorld(b.npc, this.tmp);
            this.addTracer(
              this.tmp.x,
              this.tmp.y,
              this.tmp.z,
              this.px + (Math.random() - 0.5) * 0.8,
              this.py + EYE - 0.25 + (Math.random() - 0.5) * 0.5,
              this.pz + (Math.random() - 0.5) * 0.8,
            );
            if (Math.random() < Math.max(0.14, 0.6 - dist / 130))
              this.hurtPlayer(7 + Math.random() * 9 + this.wave * 0.6, b.x, b.z);
          }
        }
      } else {
        const wpt = this.map.waypoints[b.wp];
        const dxw = wpt.x - b.x;
        const dzw = wpt.z - b.z;
        const dw = Math.hypot(dxw, dzw);
        if (dw < 3) b.wp = (b.wp + 1) % this.map.waypoints.length;
        mvx = dxw / (dw || 1);
        mvz = dzw / (dw || 1);
        b.yaw = Math.atan2(mvx, mvz);
        b.fire = Math.max(b.fire, 0.6);
      }

      const vx = mvx * speed;
      const vz = mvz * speed;
      const nx2 = b.x + vx * dt;
      if (!this.hits(nx2, b.y, b.z, 0.4, 1.8)) b.x = nx2;
      else if (!this.hits(nx2, b.y + 0.6, b.z, 0.4, 1.8)) {
        b.x = nx2;
        b.y += 0.6;
      } else b.wp = Math.floor(Math.random() * this.map.waypoints.length);
      const nz2 = b.z + vz * dt;
      if (!this.hits(b.x, b.y, nz2, 0.4, 1.8)) b.z = nz2;
      else if (!this.hits(b.x, b.y + 0.6, nz2, 0.4, 1.8)) {
        b.z = nz2;
        b.y += 0.6;
      }
      if (!this.hits(b.x, b.y - 0.1, b.z, 0.4, 1.8)) b.y = Math.max(0, b.y - GRAV * dt * 0.5);

      b.anim += dt * speed * 2.4;
      b.npc.group.position.set(b.x, b.y, b.z);
      b.npc.group.rotation.y = b.yaw;
      if (b.kind === "soldier") animateNpc(b.npc, b.anim, speed, see, b.hurt, 0);
      else animateBeast(b.npc, b.anim, speed, see, b.hurt, 0);
    }
  }

  private stepFx(dt: number) {
    for (let i = 0; i < this.pool.length; i++) {
      const p = this.pool[i];
      if (p.life <= 0) {
        this.pPos[i * 3 + 1] = -999;
        continue;
      }
      p.life -= dt;
      p.vy -= 9 * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.z += p.vz * dt;
      const k = Math.max(0, p.life / p.max);
      this.pPos[i * 3] = p.x;
      this.pPos[i * 3 + 1] = p.y;
      this.pPos[i * 3 + 2] = p.z;
      this.pCol[i * 3] = p.r * k;
      this.pCol[i * 3 + 1] = p.g * k;
      this.pCol[i * 3 + 2] = p.b * k;
    }
    (this.parts.geometry.attributes.position as THREE.BufferAttribute).needsUpdate = true;
    (this.parts.geometry.attributes.color as THREE.BufferAttribute).needsUpdate = true;
    for (const tr of this.tracers) {
      if (tr.life > 0) {
        tr.life -= dt;
        (tr.mesh.material as THREE.MeshBasicMaterial).opacity = Math.max(0, tr.life / 0.06) * 0.9;
        if (tr.life <= 0) tr.mesh.visible = false;
      }
    }
    if (this.dust) {
      this.dust.position.set(this.px, 0, this.pz);
      this.dust.rotation.y += dt * 0.02;
    }
  }

  // ----------------------------------------------------------------- render
  private render(dt: number) {
    if (this.status === "menu") {
      const a = this.menuCam;
      this.camera.position.set(Math.sin(a) * 58, 24 + Math.sin(a * 0.7) * 7, Math.cos(a) * 58);
      this.camera.lookAt(0, 3.5, 0);
      this.gun.visible = false;
    } else {
      let camY = this.py + EYE + Math.sin(this.bob * 2) * 0.035;
      let roll = Math.cos(this.bob) * 0.012;
      if (this.status === "over") {
        const k = Math.min(1, (1.6 - this.deathT) / 1.1);
        camY = this.py + EYE - k * 1.15;
        roll = k * 0.7;
      }
      this.camera.position.set(this.px + Math.cos(this.bob) * 0.02, camY, this.pz);
      this.camera.rotation.order = "YXZ";
      this.camera.rotation.set(this.pitch, this.yaw, roll);
      // only the full tube scope hides the weapon; rifles keep theirs in view
      this.gun.visible = this.status !== "over" && !(this.scoped && this.w.scope);
    }
    this.adsT += ((this.scoped ? 1 : 0) - this.adsT) * Math.min(1, dt * 16);
    // aiming thins the haze: a sniper sight has to reach the far end of the map
    const fog = this.scene.fog as THREE.Fog;
    const reach = this.w.scope ? 1 : 0.55;
    const wantNear = 150 + this.adsT * reach * 430;
    const wantFar = 560 + this.adsT * reach * 900;
    fog.near += (wantNear - fog.near) * Math.min(1, dt * 8);
    fog.far += (wantFar - fog.far) * Math.min(1, dt * 8);

    const targetFov = this.scoped ? this.w.fov : 75;
    this.camera.fov += (targetFov - this.camera.fov) * Math.min(1, dt * 14);
    this.camera.updateProjectionMatrix();

    // keep the scope rim locked to 75% of the half-frustum at every magnification
    this.scopeFrame.visible = this.scoped && this.status !== "over";
    if (this.scopeFrame.visible) {
      const s = Math.tan((this.camera.fov * Math.PI) / 360) * 0.1;
      this.scopeFrame.scale.set(s, s, 1);
    }

    if (this.shake > 0) {
      const s = this.shake * this.shake * 0.12;
      this.camera.position.x += (Math.random() - 0.5) * s;
      this.camera.position.y += (Math.random() - 0.5) * s;
    }

    const sway = Math.sin(this.bob) * 0.02;
    const recoil = -this.gunKick;
    let gx = 0.22 + sway * 0.5;
    let gy = -0.2 + Math.abs(Math.sin(this.bob)) * -0.012 + recoil * 0.4;
    let gz = -0.4 + recoil * 0.9;
    let grot = 0;
    if (this.reloadT > 0) {
      const k = 1 - this.reloadT / this.w.reload;
      grot = Math.sin(k * Math.PI) * 0.8;
      gy -= Math.sin(k * Math.PI) * 0.18;
    }
    if (this.swapT > 0) {
      const k = this.swapT / 0.45;
      gy -= k * 0.3;
      grot += k * 0.9;
    }
    // the weapon rises so its optic sits exactly on the optical axis
    const ads = this.scoped ? this.adsT : 0;
    if (ads > 0) {
      const breathe = Math.sin(this.t * 1.7) * 0.004;
      gx += (0 - gx) * ads;
      gy += (-this.w.opticY - gy) * ads + breathe * ads;
      gz += (-0.3 - gz) * ads;
      grot *= 1 - ads;
    }
    this.gun.position.set(gx, gy, gz);
    this.gun.rotation.set(grot, 0, grot * 0.3);

    this.sun.position.set(this.px + 48, 90, this.pz + 32);
    this.sun.target.position.set(this.px, 0, this.pz);
    this.sun.target.updateMatrixWorld();

    // a scoped shot deserves a harder bloom; hide the view model behind the lens
    const bloomTarget = this.scoped ? 0.68 : 0.4;
    this.bloom.strength += (bloomTarget - this.bloom.strength) * Math.min(1, dt * 8);
    this.composer.render();
    this.drawOverlay();
  }

  private drawOverlay() {
    const ctx = this.overlay;
    // CSS 像素：resize() 已 setTransform(base)。此前用 overlayCv.width（device 像素）
    // 当作画布尺寸，再被 base 变换放大一次 → base=2 时准星偏到 base² 倍位置，与 3D 瞄准框错位
    const W = this.lastW || this.overlayCv.width;
    const H = this.lastH || this.overlayCv.height;
    ctx.clearRect(0, 0, W, H);
    if (this.status === "menu") return;

    const dmg = Math.max(this.hurtFlash, this.status === "over" ? 0.55 : 0);
    if (dmg > 0.01) {
      const g = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.25, W / 2, H / 2, Math.max(W, H) * 0.62);
      g.addColorStop(0, "rgba(150,10,6,0)");
      g.addColorStop(1, `rgba(150,10,6,${0.72 * dmg})`);
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, W, H);
    }
    if (this.hurtFlash > 0.35 && this.status === "playing") {
      ctx.save();
      ctx.translate(W / 2, H / 2);
      ctx.rotate(-this.hurtDir);
      ctx.strokeStyle = `rgba(255,60,40,${this.hurtFlash})`;
      ctx.lineWidth = 5;
      ctx.beginPath();
      ctx.arc(0, 0, Math.min(W, H) * 0.22, -Math.PI / 2 - 0.45, -Math.PI / 2 + 0.45);
      ctx.stroke();
      ctx.restore();
    }

    // 唯一屏幕中心：准星、镜内刻线、弹着点全部以它为基准
    const cx = W / 2;
    const cy = H / 2;
    const w = this.w;
    if (this.scoped && w.scope) {
      // the black surround AND its rim are real geometry now (buildScopeFrame);
      // the rim sits at 0.75 of the half-frustum, so 2D only paints lens content
      // 3D 内唇 = 0.75 * 竖直半高 → CSS 半径 = 0.375 * cssH（透视下横竖一致）
      const r = H * 0.375;
      const shade = ctx.createRadialGradient(cx, cy, r * 0.3, cx, cy, r);
      shade.addColorStop(0, "rgba(0,0,0,0)");
      shade.addColorStop(0.7, "rgba(0,0,0,0.16)");
      shade.addColorStop(1, "rgba(0,0,0,0.55)");
      ctx.save();
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.clip();
      ctx.fillStyle = shade;
      ctx.fillRect(cx - r, cy - r, r * 2, r * 2);
      ctx.restore();
      if (w.reticle === "dot") {
        // ACOG / red dot: etched cross, glow ring and a floating dot
        ctx.strokeStyle = "rgba(120,170,150,0.45)";
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(cx, cy, r * 0.5, 0, Math.PI * 2);
        ctx.stroke();
        ctx.strokeStyle = "rgba(20,18,16,0.7)";
        ctx.lineWidth = 1.2;
        ctx.beginPath();
        for (let i = 1; i <= 3; i++) {
          const o = (r * 0.8 * i) / 4;
          ctx.moveTo(cx - o, cy - 5);
          ctx.lineTo(cx + o, cy - 5);
          ctx.moveTo(cx - o, cy + 5);
          ctx.lineTo(cx + o, cy + 5);
        }
        ctx.stroke();
        const dot = ctx.createRadialGradient(cx, cy, 0, cx, cy, 11);
        dot.addColorStop(0, "rgba(255,70,50,0.98)");
        dot.addColorStop(0.34, "rgba(255,50,40,0.5)");
        dot.addColorStop(1, "rgba(255,40,30,0)");
        ctx.fillStyle = dot;
        ctx.beginPath();
        ctx.arc(cx, cy, 11, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = "rgba(255,244,238,0.95)";
        ctx.beginPath();
        ctx.arc(cx, cy, 2.4, 0, Math.PI * 2);
        ctx.fill();
      } else {
      // mil-dot reticle with a fine centre
      ctx.strokeStyle = "rgba(12,10,8,0.9)";
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      ctx.moveTo(cx - r * 0.98, cy);
      ctx.lineTo(cx - 9, cy);
      ctx.moveTo(cx + 9, cy);
      ctx.lineTo(cx + r * 0.98, cy);
      ctx.moveTo(cx, cy - r * 0.98);
      ctx.lineTo(cx, cy - 9);
      ctx.moveTo(cx, cy + 9);
      ctx.lineTo(cx, cy + r * 0.98);
      ctx.stroke();
      ctx.fillStyle = "rgba(12,10,8,0.9)";
      for (let i = 1; i <= 4; i++) {
        const o = (r * 0.98 * i) / 5;
        ctx.fillRect(cx - 1.5, cy + o - 1.5, 3, 3);
        ctx.fillRect(cx - 1.5, cy - o - 1.5, 3, 3);
        ctx.fillRect(cx + o - 1.5, cy - 1.5, 3, 3);
        ctx.fillRect(cx - o - 1.5, cy - 1.5, 3, 3);
      }
      ctx.fillStyle = "rgba(200,40,20,0.95)";
      ctx.fillRect(cx - 1.2, cy - 1.2, 2.4, 2.4);
      // breath sway in the lens
      ctx.strokeStyle = "rgba(255,255,255,0.06)";
      ctx.lineWidth = 26;
      ctx.beginPath();
      ctx.arc(cx + Math.sin(this.t * 0.9) * 6, cy + Math.cos(this.t * 1.2) * 5, r * 0.6, 0, Math.PI * 2);
      ctx.stroke();
      }
      ctx.fillStyle = "rgba(255,255,255,0.6)";
      ctx.font = "600 13px Rajdhani, sans-serif";
      ctx.textAlign = "right";
      ctx.fillText(`×${(75 / w.fov).toFixed(1)}`, cx + r * 0.92, cy + r * 0.94);
    } else if (this.scoped) {
      // reflex / iron sight: the weapon stays visible, only a tint and a dot
      const a = this.adsT;
      const vign = ctx.createRadialGradient(cx, cy, Math.min(W, H) * 0.3, cx, cy, Math.max(W, H) * 0.7);
      vign.addColorStop(0, "rgba(0,0,0,0)");
      vign.addColorStop(1, `rgba(6,10,8,${0.5 * a})`);
      ctx.fillStyle = vign;
      ctx.fillRect(0, 0, W, H);
      // the 3D weapon now rises to the sight line, so only the optic glass is drawn
      ctx.strokeStyle = `rgba(120,170,150,${0.28 * a})`;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(cx, cy, 24, 0, Math.PI * 2);
      ctx.stroke();
      // red dot with bloom
      const dot = ctx.createRadialGradient(cx, cy, 0, cx, cy, 9);
      dot.addColorStop(0, `rgba(255,70,50,${0.95 * a})`);
      dot.addColorStop(0.35, `rgba(255,50,40,${0.55 * a})`);
      dot.addColorStop(1, "rgba(255,40,30,0)");
      ctx.fillStyle = dot;
      ctx.beginPath();
      ctx.arc(cx, cy, 9, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = `rgba(255,240,235,${0.9 * a})`;
      ctx.beginPath();
      ctx.arc(cx, cy, 2, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = `rgba(255,255,255,${0.42 * a})`;
      ctx.font = "600 13px Rajdhani, sans-serif";
      ctx.textAlign = "right";
      ctx.fillText(this.w.kind === "pistol" ? "×1.4" : "×1.9", W - 26, H - 26);
    } else {
      const moving = Math.hypot(this.vx, this.vz) > 1.2;
      const spread = w.spread * (moving ? 2.6 : 1) * (this.grounded ? 1 : 3) + this.gunKick * 0.05;
      const gap = 4 + (spread / Math.tan((this.camera.fov * Math.PI) / 360)) * (H / 2) * 0.9;
      const len = 8;
      ctx.strokeStyle = "rgba(126,255,140,0.92)";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(cx - gap - len, cy);
      ctx.lineTo(cx - gap, cy);
      ctx.moveTo(cx + gap, cy);
      ctx.lineTo(cx + gap + len, cy);
      ctx.moveTo(cx, cy - gap - len);
      ctx.lineTo(cx, cy - gap);
      ctx.moveTo(cx, cy + gap);
      ctx.lineTo(cx, cy + gap + len);
      ctx.stroke();
      ctx.fillStyle = "rgba(126,255,140,0.95)";
      ctx.fillRect(cx - 1, cy - 1, 2, 2);
    }

    if (this.hitT > 0) {
      const k = this.hitT / 0.22;
      const r = 9 * (1.4 - k * 0.4);
      ctx.strokeStyle = this.hitHead > 0 ? `rgba(255,140,20,${k})` : `rgba(255,255,255,${k})`;
      ctx.lineWidth = this.hitHead > 0 ? 3.4 : 2.4;
      ctx.beginPath();
      for (const [sx, sy] of [
        [-1, -1],
        [1, -1],
        [-1, 1],
        [1, 1],
      ]) {
        ctx.moveTo(cx + sx * r * 0.35, cy + sy * r * 0.35);
        ctx.lineTo(cx + sx * r, cy + sy * r);
      }
      ctx.stroke();
    }
    if (slotAmmo(this.slot) === 0 && this.slot.type === "gun" && this.status === "playing") {
      ctx.fillStyle = "rgba(226,58,46,0.85)";
      ctx.font = `700 15px Rajdhani, sans-serif`;
      ctx.textAlign = "center";
      ctx.fillText("R  装弹", cx, cy + 58);
    }
  }

  // -------------------------------------------------------------------- hud
  private emit(force: boolean) {
    // HUD 不需要逐帧刷新：普通上报限速到 10–20 次/秒。之前几乎每帧都 setHud，
    // 手机端每秒 60 次整树重渲染导致页面闪烁；状态跳变仍走 force 立即上报
    const now = performance.now();
    if (!force && now - this.lastEmitT < (this.coarse ? 100 : 50)) return;
    this.lastEmitT = now;
    const dots: number[] = [];
    const markers: Marker[] = [];
    for (const b of this.bots) {
      if (!b.alive) continue;
      const d = Math.hypot(b.x - this.px, b.z - this.pz);
      if (d < 46) dots.push(Math.round(b.x), Math.round(b.z));
      // project the head onto the screen for the nameplate
      const plateY = b.kind === "soldier" ? 2.05 : b.kind === "boss" ? 3.7 : 1.7;
      this.tmp.set(b.x, b.y + plateY, b.z).project(this.camera);
      if (this.tmp.z < 1 && this.tmp.x > -1.08 && this.tmp.x < 1.08 && this.tmp.y > -1.05 && this.tmp.y < 1.05) {
        markers.push({
          x: (this.tmp.x * 0.5 + 0.5) * 100,
          y: (-this.tmp.y * 0.5 + 0.5) * 100,
          name: b.name,
          hp: Math.max(0, Math.round(b.hp)),
        });
      }
    }
    for (const p of this.air.plates()) {
      this.tmp.set(p.x, p.y, p.z).project(this.camera);
      if (this.tmp.z < 1 && this.tmp.x > -1.08 && this.tmp.x < 1.08 && this.tmp.y > -1.05 && this.tmp.y < 1.05) {
        markers.push({
          x: (this.tmp.x * 0.5 + 0.5) * 100,
          y: (-this.tmp.y * 0.5 + 0.5) * 100,
          name: p.name,
          hp: p.hp,
          alien: true,
        });
      }
    }
    const aliens = this.air.contacts();
    const cur = this.slot;
    const h: HudState = {
      status: this.status,
      hp: Math.max(0, Math.round(this.hp)),
      armor: Math.max(0, Math.round(this.armor)),
      ammo: slotAmmo(cur),
      reserve: slotReserve(cur),
      weapon: slotLabel(cur),
      weaponIdx: this.wIdx,
      weaponType: cur.type,
      slots: this.slots.map((s) => ({ name: slotLabel(s), type: s.type })),
      reloading: this.reloadT > 0 ? 1 - this.reloadT / this.w.reload : 0,
      kills: this.kills,
      headshots: this.headshots,
      streak: this.streak,
      bestStreak: this.bestStreak,
      score: this.score,
      time: Math.floor(this.t),
      wave: this.wave,
      alive: this.bots.filter((b) => b.alive).length + this.air.alienCount() + this.peers.size,
      radar: { px: Math.round(this.px), pz: Math.round(this.pz), yaw: this.yaw, dots, aliens },
      feed: this.feed,
      prompt:
        this.msgT > 0 && this.msg
          ? this.msg
          : this.nearPrompt ||
            (this.reloadT > 0 ? "装弹中" : this.swapT > 0 ? "切换武器" : ""),
      alert: this.air.alert,
      markers,
      peers: this.peers.size,
      net: this.netMode,
    };
    const sig = [
      h.status, h.hp, h.armor, h.ammo, h.reserve, h.weaponIdx, Math.round(h.reloading * 24),
      h.kills, h.streak, h.score, h.time, h.wave, h.alive, h.radar.px, h.radar.pz,
      Math.round(h.radar.yaw * 8), dots.join(","), aliens.join(","), h.alert, h.prompt,
      h.slots.map((s) => s.name).join(","),
      h.feed.map((f) => f.id).join(","),
      h.markers.map((m) => `${Math.round(m.x * 4)}:${Math.round(m.y * 4)}:${m.hp}:${m.name.length}`).join(","),
    ].join("|");
    if (force || sig !== this.sig) {
      this.sig = sig;
      this.onHud(h);
    }
  }
}
