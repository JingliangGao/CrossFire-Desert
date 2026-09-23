/** 武器定义表 + 背包槽位模型 —— 独立成模块，供 fps / pickups / UI 共同引用 */

export interface WeaponDef {
  name: string;
  type: "gun" | "knife" | "grenade";
  /** 精美皮肤档：出生地武器架与对应第一人称枪模用金色件 */
  tier: "std" | "prime";
  kind: "rifle" | "sniper" | "pistol" | "smg" | "shotgun" | "rocket" | "lmg";
  dmg: number;
  headMul: number;
  rpm: number;
  mag: number;
  reserve: number;
  auto: boolean;
  spread: number;
  recoil: number;
  reload: number;
  fov: number;
  scope: boolean;
  opticY: number;
  reticle: "mil" | "dot";
  pellets?: number;
  splash?: number;
  splashR?: number;
}

export const WEAPONS: WeaponDef[] = [
  { name: "M4A1", type: "gun", tier: "prime", kind: "rifle", dmg: 28, headMul: 4, rpm: 680, mag: 30, reserve: 90, auto: true, spread: 0.012, recoil: 0.9, reload: 2.1, fov: 32, scope: true, opticY: 0.082, reticle: "dot" },
  { name: "AK-47", type: "gun", tier: "prime", kind: "rifle", dmg: 35, headMul: 4, rpm: 600, mag: 30, reserve: 90, auto: true, spread: 0.018, recoil: 1.5, reload: 2.3, fov: 34, scope: true, opticY: 0.079, reticle: "dot" },
  { name: "AWM", type: "gun", tier: "std", kind: "sniper", dmg: 135, headMul: 2.4, rpm: 44, mag: 5, reserve: 25, auto: false, spread: 0.002, recoil: 4.2, reload: 3.2, fov: 14, scope: true, opticY: 0.108, reticle: "mil" },
  { name: "Desert Eagle", type: "gun", tier: "prime", kind: "pistol", dmg: 58, headMul: 4, rpm: 270, mag: 7, reserve: 35, auto: false, spread: 0.018, recoil: 2.2, reload: 1.7, fov: 46, scope: true, opticY: 0.05, reticle: "dot" },
  { name: "MP5", type: "gun", tier: "std", kind: "smg", dmg: 18, headMul: 3.2, rpm: 900, mag: 30, reserve: 120, auto: true, spread: 0.02, recoil: 0.55, reload: 1.9, fov: 40, scope: true, opticY: 0.072, reticle: "dot" },
  { name: "XM1014", type: "gun", tier: "prime", kind: "shotgun", dmg: 16, headMul: 1.5, rpm: 75, mag: 7, reserve: 28, auto: false, spread: 0.07, recoil: 2.8, reload: 2.6, fov: 48, scope: true, opticY: 0.078, reticle: "dot", pellets: 8 },
  { name: "RPG-7", type: "gun", tier: "prime", kind: "rocket", dmg: 160, headMul: 1, rpm: 30, mag: 1, reserve: 5, auto: false, spread: 0.004, recoil: 4.5, reload: 2.8, fov: 50, scope: true, opticY: 0.09, reticle: "dot", splash: 140, splashR: 6.5 },
  { name: "M249", type: "gun", tier: "prime", kind: "lmg", dmg: 24, headMul: 2.6, rpm: 780, mag: 100, reserve: 200, auto: true, spread: 0.026, recoil: 1.15, reload: 4.2, fov: 38, scope: true, opticY: 0.086, reticle: "dot" },
  { name: "匕首", type: "knife", tier: "std", kind: "pistol", dmg: 90, headMul: 3, rpm: 150, mag: 0, reserve: 0, auto: false, spread: 0, recoil: 0.4, reload: 0, fov: 75, scope: false, opticY: 0.05, reticle: "dot" },
  { name: "手雷", type: "grenade", tier: "std", kind: "pistol", dmg: 0, headMul: 1, rpm: 55, mag: 0, reserve: 0, auto: false, spread: 0, recoil: 1.2, reload: 0, fov: 75, scope: false, opticY: 0.05, reticle: "dot", splash: 130, splashR: 6 },
];

export const KNIFE_ID = 8;
export const GRENADE_ID = 9;
export const MAX_SLOTS = 7;
export const GRENADE_STACK = 2;
/** 近战有效射程（与 air.ray 的贴身射程一致） */
export const KNIFE_RANGE = 2.2;

export const WEAPON_NAMES = WEAPONS.map((w) => w.name);

export type InventorySlot =
  | { type: "gun"; defId: number; ammo: number; reserve: number; prime?: boolean }
  | { type: "knife"; defId: number }
  | { type: "grenade"; defId: number; count: number };

export const defOf = (id: number) => WEAPONS[id];

/** HUD 弹药：枪=弹匣，手雷=剩余颗数，匕首=-1（渲染为 ∞） */
export function slotAmmo(s: InventorySlot): number {
  if (s.type === "gun") return s.ammo;
  if (s.type === "grenade") return s.count;
  return -1;
}

export function slotReserve(s: InventorySlot): number {
  return s.type === "gun" ? s.reserve : 0;
}

export function slotLabel(s: InventorySlot): string {
  return WEAPONS[s.defId].name;
}

export function makeStartLoadout(): InventorySlot[] {
  return [
    { type: "gun", defId: 4, ammo: WEAPONS[4].mag, reserve: WEAPONS[4].reserve }, // MP5
    { type: "gun", defId: 2, ammo: WEAPONS[2].mag, reserve: WEAPONS[2].reserve }, // AWM
    { type: "knife", defId: KNIFE_ID },
    { type: "grenade", defId: GRENADE_ID, count: 2 },
  ];
}
