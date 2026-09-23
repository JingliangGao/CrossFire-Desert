import * as THREE from "three";
import { GRENADE_ID, KNIFE_ID } from "./weapons";

/** MP5 / XM1014 / RPG-7 / M249 — each carries a real optic the ADS pose lines up with. */
export function buildExtraGun(g: THREE.Group, idx: number) {
  const steel = new THREE.MeshStandardMaterial({ color: 0x2c3134, metalness: 0.88, roughness: 0.32 });
  const blued = new THREE.MeshStandardMaterial({ color: 0x15171a, metalness: 0.8, roughness: 0.46 });
  const poly = new THREE.MeshStandardMaterial({ color: 0x1c1e20, metalness: 0.08, roughness: 0.78 });
  const od = new THREE.MeshStandardMaterial({ color: 0x4d5538, metalness: 0.35, roughness: 0.62 });
  const wood = new THREE.MeshStandardMaterial({ color: 0x6e4a28, metalness: 0.05, roughness: 0.55 });
  const glass = new THREE.MeshStandardMaterial({
    color: 0x14524c,
    metalness: 0.92,
    roughness: 0.05,
    emissive: 0x0c403c,
    emissiveIntensity: 0.55,
  });

  const box = (w: number, h: number, d: number, x: number, y: number, z: number, m: THREE.Material, rx = 0) => {
    const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m);
    b.position.set(x, y, z);
    b.rotation.x = rx;
    g.add(b);
    return b;
  };
  const tube = (r: number, l: number, x: number, y: number, z: number, m: THREE.Material) => {
    const b = new THREE.Mesh(new THREE.CylinderGeometry(r, r, l, 14), m);
    b.rotation.x = Math.PI / 2;
    b.position.set(x, y, z);
    g.add(b);
    return b;
  };
  const rail = (y: number, z0: number, len: number, n: number) => {
    box(0.032, 0.009, len, 0, y, z0, blued);
    for (let i = 0; i < n; i++) box(0.034, 0.01, (len / n) * 0.52, 0, y + 0.007, z0 - len / 2 + ((i + 0.5) * len) / n, blued);
  };
  const optic = (y: number, z0: number, len: number, r: number) => {
    tube(r, len, 0, y, z0, blued);
    tube(r * 1.35, 0.045, 0, y, z0 - len / 2, blued);
    tube(r * 1.15, 0.04, 0, y, z0 + len / 2, poly);
    const eye = new THREE.Mesh(new THREE.CircleGeometry(r * 0.86, 18), glass);
    eye.position.set(0, y, z0 + len / 2 + 0.004);
    g.add(eye);
    tube(0.013, 0.02, 0, y + r + 0.012, z0, steel);
    box(0.028, y - r - 0.018, 0.035, 0, (y - r) / 2, z0, steel);
  };

  if (idx === 4) {
    // MP5
    box(0.055, 0.07, 0.28, 0, 0, 0, steel);
    rail(0.04, 0.0, 0.16, 8);
    tube(0.012, 0.22, 0, 0.004, -0.22, blued);
    box(0.04, 0.16, 0.05, 0, -0.12, -0.02, poly, 0.12);
    box(0.048, 0.06, 0.16, 0, -0.01, 0.2, poly);
    box(0.04, 0.08, 0.055, 0, -0.06, 0.12, poly, -0.3);
    box(0.05, 0.04, 0.14, 0, 0.01, -0.12, poly);
    optic(0.072, -0.02, 0.12, 0.02);
  } else if (idx === 5) {
    // XM1014
    box(0.06, 0.07, 0.42, 0, 0, -0.02, steel);
    tube(0.016, 0.28, 0, 0.012, -0.28, blued);
    box(0.07, 0.05, 0.22, 0, -0.02, -0.16, poly);
    box(0.055, 0.08, 0.2, 0, -0.02, 0.24, poly);
    box(0.045, 0.09, 0.06, 0, -0.08, 0.1, poly, -0.25);
    box(0.03, 0.04, 0.08, 0.04, 0.01, 0.02, blued);
    for (let i = 0; i < 5; i++) box(0.062, 0.012, 0.012, 0, -0.03, -0.02 - i * 0.018, wood);
    optic(0.078, -0.04, 0.11, 0.02);
  } else if (idx === 6) {
    // RPG-7
    tube(0.038, 0.62, 0, 0.01, -0.05, od);
    tube(0.055, 0.16, 0, 0.01, -0.28, od);
    tube(0.028, 0.22, 0, 0.01, 0.28, od);
    box(0.04, 0.05, 0.1, 0, -0.04, 0.08, wood);
    box(0.035, 0.1, 0.05, 0, -0.08, 0.16, wood, -0.2);
    box(0.02, 0.04, 0.04, 0, 0.05, 0.02, blued);
    const warhead = new THREE.Mesh(new THREE.ConeGeometry(0.05, 0.16, 12), od);
    warhead.rotation.x = -Math.PI / 2;
    warhead.position.set(0, 0.01, -0.42);
    g.add(warhead);
    optic(0.09, 0.02, 0.14, 0.018);
  } else {
    // M249
    box(0.07, 0.08, 0.4, 0, 0, 0, steel);
    rail(0.046, 0.02, 0.28, 14);
    tube(0.014, 0.32, 0, 0.006, -0.32, blued);
    box(0.09, 0.12, 0.16, 0, -0.08, -0.04, od);
    box(0.08, 0.08, 0.22, 0, -0.02, -0.16, poly);
    box(0.06, 0.08, 0.22, 0, -0.02, 0.26, poly);
    box(0.045, 0.09, 0.06, 0, -0.07, 0.12, poly, -0.3);
    box(0.05, 0.04, 0.08, 0, 0.02, -0.46, steel);
    optic(0.086, -0.02, 0.15, 0.022);
  }
}

/**
 * 第一人称 / 展示用枪模，按 defId 构建（不再依赖固定槽位序号）。
 * 局部坐标被 ADS 对齐（opticY）手调过，禁止改动枪械零件的相对位置。
 */
export function buildGunModel(idx: number): THREE.Group {
  const g = new THREE.Group();
  const steel = new THREE.MeshStandardMaterial({ color: 0x2e3336, metalness: 0.9, roughness: 0.3 });
  const blued = new THREE.MeshStandardMaterial({ color: 0x17191b, metalness: 0.85, roughness: 0.42 });
  const parker = new THREE.MeshStandardMaterial({ color: 0x3d4245, metalness: 0.5, roughness: 0.66 });
  const poly = new THREE.MeshStandardMaterial({ color: 0x1e2022, metalness: 0.08, roughness: 0.76 });
  const wood = new THREE.MeshStandardMaterial({ color: 0x7a4a24, metalness: 0.04, roughness: 0.48 });
  const gold = new THREE.MeshStandardMaterial({ color: 0xc9a227, metalness: 0.95, roughness: 0.26 });
  const rubber = new THREE.MeshStandardMaterial({ color: 0x141414, metalness: 0.0, roughness: 0.95 });
  const glass = new THREE.MeshStandardMaterial({
    color: 0x123c3a,
    metalness: 0.9,
    roughness: 0.04,
    emissive: 0x0d4a44,
    emissiveIntensity: 0.5,
  });
  const glove = new THREE.MeshStandardMaterial({ color: 0x2b2721, roughness: 0.92 });
  const olive = new THREE.MeshStandardMaterial({ color: 0x4d5538, metalness: 0.35, roughness: 0.6 });

  const add = (geo: THREE.BufferGeometry, m: THREE.Material, x: number, y: number, z: number, rx = 0) => {
    const b = new THREE.Mesh(geo, m);
    b.position.set(x, y, z);
    b.rotation.x = rx;
    g.add(b);
    return b;
  };
  const box = (w: number, h: number, d: number, x: number, y: number, z: number, m: THREE.Material, rx = 0) =>
    add(new THREE.BoxGeometry(w, h, d), m, x, y, z, rx);
  /** cylinder laid along the barrel axis (-Z) */
  const tube = (r: number, l: number, x: number, y: number, z: number, m: THREE.Material, seg = 16) =>
    add(new THREE.CylinderGeometry(r, r, l, seg), m, x, y, z, Math.PI / 2);
  const cone = (r1: number, r2: number, l: number, x: number, y: number, z: number, m: THREE.Material) =>
    add(new THREE.CylinderGeometry(r1, r2, l, 16), m, x, y, z, Math.PI / 2);
  const ball = (r: number, x: number, y: number, z: number, m: THREE.Material) =>
    add(new THREE.SphereGeometry(r, 12, 10), m, x, y, z);
  /** picatinny teeth along Z */
  const rail = (y: number, z0: number, len: number, n: number, m: THREE.Material) => {
    box(0.034, 0.01, len, 0, y, z0, m);
    for (let i = 0; i < n; i++) {
      const z = z0 - len / 2 + ((i + 0.5) * len) / n;
      box(0.036, 0.012, (len / n) * 0.55, 0, y + 0.008, z, m);
    }
  };
  /** a complete optic: body, bells, turrets, mount, eyepiece glass */
  const optic = (y: number, z0: number, len: number, r: number, bellR: number) => {
    tube(r, len, 0, y, z0, blued, 20);
    tube(bellR, 0.07, 0, y, z0 - len / 2 + 0.02, blued, 20); // objective bell
    tube(r * 1.16, 0.05, 0, y, z0 + len / 2 - 0.02, rubber, 20); // eyepiece cup
    tube(r * 1.1, 0.022, 0, y, z0 + len / 2 - 0.06, parker, 18); // magnification ring
    // lens seen from the shooter's eye
    const eye = new THREE.Mesh(new THREE.CircleGeometry(r * 0.92, 22), glass);
    eye.position.set(0, y, z0 + len / 2 + 0.005);
    g.add(eye);
    // top elevation turret + side windage turret
    tube(0.014, 0.022, 0, y + r + 0.012, z0, parker, 12);
    add(new THREE.CylinderGeometry(0.016, 0.016, 0.016, 12), blued, 0, y + r + 0.03, z0).rotation.x = 0;
    box(0.012, 0.014, 0.008, 0, y + r + 0.04, z0, steel);
    const side = new THREE.Mesh(new THREE.CylinderGeometry(0.013, 0.013, 0.024, 12), parker);
    side.rotation.z = Math.PI / 2;
    side.position.set(r + 0.014, y, z0);
    g.add(side);
    // mount ring + clamp reaching down to the rail
    tube(r * 1.22, 0.02, 0, y, z0 - len * 0.3, parker, 18);
    tube(r * 1.22, 0.02, 0, y, z0 + len * 0.28, parker, 18);
    box(0.03, y - r - 0.02, 0.04, 0, (y - r) / 2, z0 - len * 0.3, parker);
    box(0.03, y - r - 0.02, 0.04, 0, (y - r) / 2, z0 + len * 0.28, parker);
    // turret caps
    const sc = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.015, 0.02, 12), parker);
    sc.rotation.z = Math.PI / 2;
    sc.position.set(r + 0.03, y, z0);
    g.add(sc);
  };

  if (idx === KNIFE_ID) {
    /* --------------------------------------------------------------- 匕首 */
    box(0.032, 0.036, 0.15, 0, -0.05, 0.09, poly); // grip
    for (let i = 0; i < 4; i++) box(0.034, 0.004, 0.15, 0, -0.062 + i * 0.022, 0.09, blued);
    box(0.038, 0.042, 0.03, 0, -0.05, 0.17, parker); // pommel
    box(0.1, 0.02, 0.03, 0, -0.03, 0.01, parker); // guard
    box(0.02, 0.05, 0.3, 0, -0.005, -0.15, steel); // blade
    box(0.006, 0.014, 0.28, 0, 0.016, -0.15, parker); // fuller / edge catch
    cone(0.02, 0.006, 0.08, 0, -0.005, -0.34, steel); // tip
    box(0.024, 0.052, 0.02, 0, -0.005, -0.01, gold); // bolster
    const fist = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.075, 0.1), glove);
    fist.position.set(0.006, -0.07, 0.09);
    g.add(fist);
    const cuff = new THREE.Mesh(new THREE.BoxGeometry(0.078, 0.05, 0.04), poly);
    cuff.position.set(0.006, -0.09, 0.16);
    g.add(cuff);
    g.position.set(0.22, -0.2, -0.4);
    return g;
  }

  if (idx === GRENADE_ID) {
    /* -------------------------------------------------------------- 手雷 */
    const body = add(new THREE.SphereGeometry(0.075, 14, 12), olive, 0, -0.03, -0.06);
    body.scale.set(1, 1.2, 1);
    add(new THREE.CylinderGeometry(0.03, 0.036, 0.05, 12), parker, 0, 0.06, -0.06);
    box(0.014, 0.11, 0.03, 0.05, 0.0, -0.06, parker); // safety lever
    box(0.03, 0.012, 0.03, 0, 0.085, -0.06, gold); // pin ring boss
    add(new THREE.TorusGeometry(0.022, 0.005, 6, 14), gold, 0.06, 0.075, -0.06).rotation.y = Math.PI / 2;
    const fist = new THREE.Mesh(new THREE.BoxGeometry(0.075, 0.08, 0.1), glove);
    fist.position.set(0.006, -0.075, 0.02);
    g.add(fist);
    const cuff = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.05, 0.04), poly);
    cuff.position.set(0.006, -0.095, 0.09);
    g.add(cuff);
    g.position.set(0.22, -0.2, -0.4);
    return g;
  }

  if (idx >= 4) {
    buildExtraGun(g, idx);
  } else if (idx === 0) {
    /* ----------------------------------------------------------- M4A1 */
    box(0.072, 0.055, 0.34, 0, 0, 0.02, steel); // upper
    box(0.066, 0.05, 0.18, 0, -0.05, 0.06, steel); // lower
    rail(0.033, 0.02, 0.3, 15, blued);
    box(0.012, 0.03, 0.07, 0.038, 0.004, -0.06, blued); // ejection port
    box(0.02, 0.02, 0.05, 0.036, -0.01, 0.1, parker); // forward assist
    box(0.05, 0.014, 0.03, 0, 0.03, 0.16, blued); // charging handle
    box(0.07, 0.055, 0.07, 0, -0.055, -0.06, steel); // magwell
    box(0.056, 0.17, 0.072, 0, -0.16, -0.05, poly, 0.14); // magazine
    box(0.06, 0.014, 0.076, 0, -0.245, -0.07, blued); // floorplate
    box(0.05, 0.012, 0.06, 0, -0.08, 0.02, blued); // trigger guard
    box(0.045, 0.09, 0.07, 0, -0.075, 0.13, poly, -0.3); // pistol grip
    box(0.01, 0.03, 0.012, 0, -0.075, 0.07, blued); // trigger
    tube(0.016, 0.16, 0, -0.005, 0.24, parker); // buffer tube
    box(0.058, 0.07, 0.15, 0, -0.012, 0.3, poly); // collapsible stock
    box(0.05, 0.03, 0.05, 0, 0.03, 0.26, poly); // cheek riser
    box(0.05, 0.008, 0.03, 0, -0.05, 0.36, blued); // butt plate
    box(0.012, 0.05, 0.02, 0, -0.06, 0.29, blued); // sling loop
    tube(0.032, 0.26, 0, 0, -0.24, poly, 12); // handguard
    for (let i = 0; i < 5; i++) box(0.066, 0.014, 0.02, 0, 0.03, -0.34 + i * 0.05, blued);
    box(0.03, 0.03, 0.05, 0, 0.028, -0.36, steel); // gas block
    box(0.04, 0.05, 0.03, 0, 0.05, -0.37, steel); // front sight wings
    box(0.008, 0.04, 0.01, 0, 0.055, -0.37, steel);
    tube(0.011, 0.2, 0, 0, -0.45, blued); // barrel
    cone(0.017, 0.02, 0.05, 0, 0, -0.56, steel); // A2 birdcage
    box(0.036, 0.008, 0.03, 0, 0.004, -0.57, blued);
    optic(0.082, -0.02, 0.17, 0.024, 0.033); // ACOG
  } else if (idx === 1) {
    /* ----------------------------------------------------------- AK-47 */
    box(0.07, 0.06, 0.3, 0, 0, 0.03, steel); // receiver
    box(0.062, 0.03, 0.26, 0, 0.04, 0.03, parker); // dust cover
    box(0.03, 0.02, 0.05, 0, 0.05, -0.06, blued); // rear sight block
    rail(0.05, 0.1, 0.09, 5, blued);
    box(0.072, 0.056, 0.16, 0, -0.004, -0.15, wood); // lower handguard
    box(0.06, 0.03, 0.14, 0, 0.03, -0.15, wood); // upper handguard
    tube(0.013, 0.15, 0, 0.045, -0.14, blued); // gas tube
    box(0.036, 0.04, 0.04, 0, 0.03, -0.24, steel); // gas block
    tube(0.01, 0.24, 0, 0, -0.34, blued); // barrel
    box(0.036, 0.05, 0.024, 0, 0.035, -0.44, steel); // front sight base
    box(0.01, 0.04, 0.012, 0, 0.05, -0.44, steel); // post
    box(0.03, 0.03, 0.05, 0, 0.0, -0.5, steel, 0.3); // slant brake
    // curved magazine — the AK silhouette
    box(0.05, 0.1, 0.07, 0, -0.1, -0.03, poly, 0.16);
    box(0.05, 0.1, 0.07, 0, -0.185, -0.06, poly, 0.5);
    box(0.05, 0.08, 0.07, 0, -0.255, -0.11, poly, 0.78);
    box(0.056, 0.012, 0.074, 0, -0.3, -0.14, blued, 0.78);
    box(0.045, 0.085, 0.07, 0, -0.07, 0.14, wood, -0.34); // grip
    box(0.05, 0.012, 0.055, 0, -0.07, 0.05, blued); // trigger guard
    box(0.01, 0.028, 0.012, 0, -0.068, 0.08, blued); // trigger
    box(0.016, 0.02, 0.06, 0.04, -0.02, 0.12, gold, 0.2); // selector lever
    box(0.055, 0.07, 0.2, 0, -0.02, 0.27, wood, -0.06); // stock
    box(0.05, 0.05, 0.05, 0, -0.03, 0.19, wood, -0.06);
    box(0.056, 0.075, 0.014, 0, -0.03, 0.37, steel, -0.06); // butt plate
    box(0.014, 0.04, 0.02, 0, -0.06, 0.3, blued); // sling swivel
    optic(0.079, -0.03, 0.19, 0.023, 0.031); // PSO-style side scope
  } else if (idx === 2) {
    /* ------------------------------------------------------------ AWM */
    box(0.07, 0.07, 0.44, 0, 0, 0.06, steel); // receiver
    rail(0.04, 0.08, 0.34, 17, blued);
    tube(0.017, 0.2, 0, 0.026, 0.06, parker); // bolt body
    ball(0.019, 0.055, 0.0, 0.14, steel); // bolt knob
    tube(0.011, 0.06, 0.04, 0.0, 0.14, steel);
    box(0.03, 0.03, 0.04, 0, -0.045, 0.06, parker); // bottom metal
    box(0.05, 0.012, 0.06, 0, -0.07, 0.05, blued); // trigger guard
    box(0.01, 0.03, 0.012, 0, -0.066, 0.09, gold); // trigger
    box(0.02, 0.02, 0.05, 0.042, -0.02, 0.0, parker, 0.2); // safety
    tube(0.017, 0.5, 0, 0.005, -0.34, blued, 20); // fluted barrel
    for (let i = 0; i < 5; i++) box(0.036, 0.006, 0.4, 0, 0.005, -0.34, parker);
    cone(0.024, 0.028, 0.07, 0, 0.005, -0.63, steel); // muzzle brake
    for (let i = 0; i < 3; i++) box(0.05, 0.04, 0.012, 0, 0.005, -0.61 + i * 0.02, blued);
    box(0.06, 0.1, 0.26, 0, -0.04, 0.33, poly); // thumbhole stock
    box(0.05, 0.06, 0.1, 0, -0.04, 0.24, poly);
    box(0.045, 0.075, 0.11, 0, -0.05, 0.2, poly, -0.25); // pistol grip
    box(0.045, 0.03, 0.16, 0, 0.02, 0.4, poly); // cheek riser
    box(0.05, 0.1, 0.03, 0, -0.05, 0.46, blued); // butt plate
    // bipod, folded back
    box(0.012, 0.09, 0.012, -0.03, -0.07, -0.42, parker, 0.9);
    box(0.012, 0.09, 0.012, 0.03, -0.07, -0.42, parker, 0.9);
    box(0.06, 0.03, 0.05, 0, -0.03, -0.42, parker);
    optic(0.108, 0.0, 0.34, 0.03, 0.046); // big glass
  } else {
    /* ------------------------------------------------- Desert Eagle (gold) */
    box(0.05, 0.05, 0.24, 0, 0, -0.03, gold); // slide
    box(0.044, 0.04, 0.16, 0, -0.045, 0.02, gold); // frame
    for (let i = 0; i < 7; i++) box(0.052, 0.05, 0.006, 0, 0, 0.06 - i * 0.014, blued); // serrations
    box(0.04, 0.05, 0.1, 0, -0.1, 0.1, gold, -0.28); // grip
    for (let i = 0; i < 5; i++) box(0.042, 0.004, 0.1, 0, -0.075 - i * 0.022, 0.1 + i * 0.006, blued, -0.28);
    box(0.04, 0.012, 0.07, 0, -0.062, 0.0, blued); // trigger guard
    box(0.01, 0.03, 0.012, 0, -0.056, 0.03, gold); // trigger
    box(0.014, 0.03, 0.02, 0, 0.03, 0.1, blued, 0.3); // hammer
    box(0.05, 0.01, 0.16, 0, 0.03, -0.05, blued); // top rib
    tube(0.012, 0.07, 0, 0, -0.16, blued); // barrel
    cone(0.016, 0.014, 0.03, 0, 0, -0.19, gold);
    box(0.04, 0.014, 0.1, 0, -0.028, -0.05, blued); // under-rail
    box(0.012, 0.02, 0.02, 0.03, -0.01, 0.06, gold); // safety
    box(0.01, 0.024, 0.008, 0, 0.038, -0.13, steel); // front post
    box(0.03, 0.02, 0.02, 0, 0.038, 0.07, steel); // rear notch
    optic(0.05, -0.04, 0.1, 0.019, 0.026); // micro red dot
  }

  // gloved support hand
  const fist = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.075, 0.1), glove);
  fist.position.set(0.006, idx === 3 ? -0.07 : -0.075, idx === 3 ? 0.08 : -0.19);
  g.add(fist);
  const cuff = new THREE.Mesh(new THREE.BoxGeometry(0.078, 0.05, 0.04), poly);
  cuff.position.set(0.006, fist.position.y - 0.02, fist.position.z + 0.07);
  g.add(cuff);

  g.position.set(0.22, -0.2, -0.4);
  return g;
}

const GOLD = new THREE.Color(0xc9a227);

/** 精美档（prime）皮肤：把不透明金属件染成金色高光，玻璃与镜片保持原样 */
export function goldify(root: THREE.Object3D) {
  root.traverse((o) => {
    if (!(o instanceof THREE.Mesh)) return;
    const m = o.material;
    if (!(m instanceof THREE.MeshStandardMaterial)) return;
    if (m.transparent || m.roughness < 0.1) return;
    const c = m.clone();
    c.color.lerp(GOLD, 0.62);
    c.metalness = Math.max(c.metalness, 0.9);
    c.roughness = Math.min(c.roughness, 0.3);
    c.emissive = new THREE.Color(0x3a2a06);
    c.emissiveIntensity = 0.35;
    o.material = c;
  });
}
