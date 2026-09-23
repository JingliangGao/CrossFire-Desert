import * as THREE from "three";
import { buildGunModel, goldify } from "./guns";
import { GRENADE_STACK, WEAPONS } from "./weapons";

/** 相对 playerSpawn 的偏移：南广场木箱/油桶间错落，半径 5–12m */
const SPAWN_POINTS: [number, number][] = [
  [4.5, -6.5],
  [-5.5, -6],
  [9, -2],
  [-9, -1],
  [6, 6],
  [-6, 5],
];
/** 金色沙漠之鹰 / M249 火神 / RPG-7 / XM1014 / M4A1 / AK-47 */
const PRIME_IDS = [3, 7, 6, 5, 0, 1];

export interface Pickup {
  defId: number;
  prime: boolean;
  x: number;
  y: number;
  z: number;
  /** 展示台 + 光柱 + 武器，整体挂在场景上 */
  group: THREE.Group;
  /** 武器本体：缓慢旋转/浮动 */
  holder: THREE.Group;
  light: THREE.PointLight | null;
  taken: boolean;
  phase: number;
  /** 手雷叠层 / 掉落枪的弹药状态 */
  count?: number;
  ammo?: number;
  reserve?: number;
}

function buildStand(prime: boolean) {
  const g = new THREE.Group();
  const crate = new THREE.Mesh(
    new THREE.BoxGeometry(1.0, 0.52, 0.66),
    new THREE.MeshStandardMaterial({ color: 0x2a2e26, metalness: 0.55, roughness: 0.55 }),
  );
  crate.position.y = 0.26;
  crate.castShadow = crate.receiveShadow = true;
  g.add(crate);
  // 金色描边 + 铆钉条
  const trim = new THREE.Mesh(
    new THREE.BoxGeometry(1.04, 0.06, 0.7),
    new THREE.MeshStandardMaterial({
      color: prime ? 0xc9a227 : 0x6d7a6a,
      metalness: 0.95,
      roughness: 0.24,
      emissive: prime ? 0x3a2a06 : 0x000000,
      emissiveIntensity: prime ? 0.5 : 0,
    }),
  );
  trim.position.y = 0.5;
  g.add(trim);
  for (const sx of [-0.42, 0.42]) {
    for (const sz of [-0.26, 0.26]) {
      const rivet = new THREE.Mesh(
        new THREE.SphereGeometry(0.035, 8, 6),
        new THREE.MeshStandardMaterial({ color: 0xb8a060, metalness: 0.9, roughness: 0.3 }),
      );
      rivet.position.set(sx, 0.34, sz);
      g.add(rivet);
    }
  }
  // 底座光柱：暖色加性圆筒，从箱面升起
  const pillar = new THREE.Mesh(
    new THREE.CylinderGeometry(0.3, 0.42, 1.5, 20, 1, true),
    new THREE.MeshBasicMaterial({
      color: prime ? 0xffb64a : 0x8fd8ff,
      transparent: true,
      opacity: 0.13,
      side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    }),
  );
  pillar.position.y = 1.25;
  g.add(pillar);
  const ring = new THREE.Mesh(
    new THREE.TorusGeometry(0.34, 0.02, 6, 28),
    new THREE.MeshBasicMaterial({ color: prime ? 0xffd27a : 0xa8e4ff, transparent: true, opacity: 0.75 }),
  );
  ring.rotation.x = Math.PI / 2;
  ring.position.y = 0.55;
  g.add(ring);
  return { group: g, pillar, ring };
}

function buildGrenadeStack(count: number): THREE.Group {
  const g = new THREE.Group();
  const shell = new THREE.MeshStandardMaterial({ color: 0x4d5538, metalness: 0.4, roughness: 0.55 });
  const cap = new THREE.MeshStandardMaterial({ color: 0x8a8f7a, metalness: 0.8, roughness: 0.35 });
  const n = Math.max(1, Math.min(GRENADE_STACK, count));
  for (let i = 0; i < n; i++) {
    const b = new THREE.Mesh(new THREE.SphereGeometry(0.085, 12, 10), shell);
    b.scale.set(1, 1.2, 1);
    b.position.set((i - (n - 1) / 2) * 0.2, 0.1, 0);
    g.add(b);
    const c = new THREE.Mesh(new THREE.CylinderGeometry(0.034, 0.04, 0.05, 10), cap);
    c.position.set(b.position.x, 0.22, 0);
    g.add(c);
    const lever = new THREE.Mesh(new THREE.BoxGeometry(0.016, 0.1, 0.03), cap);
    lever.position.set(b.position.x + 0.05, 0.14, 0);
    g.add(lever);
  }
  return g;
}

function makePickup(
  scene: THREE.Scene,
  defId: number,
  x: number,
  z: number,
  opts: { prime?: boolean; count?: number; ammo?: number; reserve?: number; weapon?: THREE.Object3D } = {},
): Pickup {
  const prime = opts.prime ?? WEAPONS[defId]?.tier === "prime";
  const { group, pillar, ring } = buildStand(prime);
  group.position.set(x, 0, z);
  group.userData.pillar = pillar;
  group.userData.ring = ring;

  const holder = new THREE.Group();
  holder.position.y = 1.12;
  group.add(holder);

  let weapon: THREE.Object3D;
  if (opts.weapon) weapon = opts.weapon;
  else if (opts.count !== undefined) weapon = buildGrenadeStack(opts.count);
  else {
    weapon = buildGunModel(defId);
    weapon.position.set(0, 0, 0);
    if (prime) goldify(weapon);
    // 第一人称模型约真实比例，展示时略微放大更醒目
    weapon.scale.setScalar(1.15);
  }
  holder.add(weapon);

  const light = new THREE.PointLight(prime ? 0xffb04a : 0x9fe0ff, 5.5, 7, 2);
  light.position.set(0, 1.35, 0);
  group.add(light);

  scene.add(group);
  return {
    defId,
    prime,
    x,
    y: 0,
    z,
    group,
    holder,
    light,
    taken: false,
    phase: Math.random() * Math.PI * 2,
    count: opts.count,
    ammo: opts.ammo,
    reserve: opts.reserve,
  };
}

/** 开局在南广场错落摆放 6 把发光精美枪 */
export function buildSpawnPickups(scene: THREE.Scene, spawn: { x: number; z: number }): Pickup[] {
  const out: Pickup[] = [];
  SPAWN_POINTS.forEach(([ox, oz], i) => {
    const defId = PRIME_IDS[i % PRIME_IDS.length];
    out.push(
      makePickup(scene, defId, spawn.x + ox, spawn.z + oz, {
        prime: true,
        ammo: WEAPONS[defId].mag,
        reserve: WEAPONS[defId].reserve,
      }),
    );
  });
  return out;
}

/** G 丢弃：枪/手雷落回世界，可再捡回（带轻微随机散落位移） */
export function dropPickup(
  scene: THREE.Scene,
  slot: { type: "gun" | "grenade"; defId: number; ammo?: number; reserve?: number; count?: number; prime?: boolean },
  fromX: number,
  fromZ: number,
  yaw: number,
): Pickup {
  const dx = Math.sin(yaw) * 1.4 + (Math.random() - 0.5) * 0.6;
  const dz = Math.cos(yaw) * 1.4 + (Math.random() - 0.5) * 0.6;
  return makePickup(scene, slot.defId, fromX + dx, fromZ + dz, {
    prime: slot.prime,
    count: slot.type === "grenade" ? slot.count : undefined,
    ammo: slot.type === "gun" ? slot.ammo : undefined,
    reserve: slot.type === "gun" ? slot.reserve : undefined,
  });
}

export function removePickup(scene: THREE.Scene, p: Pickup) {
  scene.remove(p.group);
}

/** 缓慢旋转/浮动 + 光柱脉动；返回最近可拾取物的距离信息由调用方判断 */
export function updatePickups(list: Pickup[], t: number, dt: number) {
  for (const p of list) {
    if (p.taken) continue;
    p.phase += dt;
    p.holder.rotation.y += dt * 0.7;
    p.holder.position.y = 1.12 + Math.sin(p.phase * 1.4) * 0.06;
    if (p.light) p.light.intensity = 4.6 + Math.sin(t * 2.4 + p.phase) * 1.4;
    const pillar = p.group.userData.pillar as THREE.Mesh | undefined;
    if (pillar) (pillar.material as THREE.MeshBasicMaterial).opacity = 0.1 + (Math.sin(t * 3 + p.phase) * 0.5 + 0.5) * 0.08;
    const ring = p.group.userData.ring as THREE.Mesh | undefined;
    if (ring) {
      ring.rotation.z += dt * 0.8;
      ring.scale.setScalar(1 + Math.sin(t * 2 + p.phase) * 0.05);
    }
  }
}
