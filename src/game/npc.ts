import * as THREE from "three";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";

/* ============================================================================
 * Human-form enemies.
 *
 * Built facing +Z (which matches the yaw convention used by the AI), with a
 * real skeleton — pelvis, spine, neck, shoulder/elbow/hip/knee pivots — and
 * rounded geometry throughout so nothing reads as a cardboard box.
 * ========================================================================== */

export interface NpcModel {
  group: THREE.Group;
  hips: THREE.Object3D;
  torso: THREE.Object3D;
  head: THREE.Object3D;
  armL: THREE.Object3D;
  armR: THREE.Object3D;
  foreL: THREE.Object3D;
  foreR: THREE.Object3D;
  legL: THREE.Object3D;
  legR: THREE.Object3D;
  shinL: THREE.Object3D;
  shinR: THREE.Object3D;
  gunTip: THREE.Object3D;
  flash: THREE.Mesh;
  height: number;
}

const SKINS = [0x9a7250, 0x84603f, 0xa8805c, 0x765336];
const SHIRTS = [0x6d6644, 0x5c5b46, 0x7c6440, 0x4f5340, 0x8a7a58];
const VESTS = [0x2a2a24, 0x33322a, 0x24302a];
const HEADWEAR = ["keffiyeh", "beanie", "hair", "balaclava"];
const rnd = <T,>(a: T[]): T => a[Math.floor(Math.random() * a.length)];

const rb = (w: number, h: number, d: number, r = 0.022) => new RoundedBoxGeometry(w, h, d, 2, Math.min(r, w / 2.1, h / 2.1, d / 2.1));
const cap = (r: number, l: number) => new THREE.CapsuleGeometry(r, l, 4, 10);
const sph = (r: number, s = 12) => new THREE.SphereGeometry(r, s, s - 2);

function add(parent: THREE.Object3D, geo: THREE.BufferGeometry, m: THREE.Material, x = 0, y = 0, z = 0) {
  const mesh = new THREE.Mesh(geo, m);
  mesh.position.set(x, y, z);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  parent.add(mesh);
  return mesh;
}

export function buildNpc(): NpcModel {
  const height = 0.94 + Math.random() * 0.13;
  const bulk = 0.9 + Math.random() * 0.2;
  const skin = new THREE.MeshStandardMaterial({ color: rnd(SKINS), roughness: 0.72 });
  const shirt = new THREE.MeshStandardMaterial({ color: rnd(SHIRTS), roughness: 0.94 });
  const pants = new THREE.MeshStandardMaterial({ color: 0x4a4534, roughness: 0.96 });
  const vest = new THREE.MeshStandardMaterial({ color: rnd(VESTS), roughness: 0.62, metalness: 0.12 });
  const boot = new THREE.MeshStandardMaterial({ color: 0x241d16, roughness: 0.68 });
  const dark = new THREE.MeshStandardMaterial({ color: 0x1a1a18, roughness: 0.85 });
  const steel = new THREE.MeshStandardMaterial({ color: 0x1d2023, metalness: 0.78, roughness: 0.36 });
  const cloth = new THREE.MeshStandardMaterial({ color: rnd([0xd8d2c4, 0xc9c2b2, 0x8f3f33]), roughness: 0.98 });
  const hairM = new THREE.MeshStandardMaterial({ color: rnd([0x1c1712, 0x2e241a, 0x3a2c1e]), roughness: 0.9 });
  const eyeW = new THREE.MeshStandardMaterial({ color: 0xe8e2d8, roughness: 0.35 });
  const band = new THREE.MeshStandardMaterial({
    color: 0xff2a1a,
    emissive: 0xff2a1a,
    emissiveIntensity: 0.9,
    roughness: 0.5,
  });

  const group = new THREE.Group();
  group.scale.setScalar(height);

  const hips = new THREE.Object3D();
  hips.position.y = 0.95;
  group.add(hips);
  add(hips, rb(0.33 * bulk, 0.2, 0.23, 0.06), pants, 0, -0.04, 0);

  /* ---------------------------------------------------------------- torso */
  const torso = new THREE.Object3D();
  hips.add(torso);
  add(torso, rb(0.3 * bulk, 0.3, 0.2, 0.07), shirt, 0, 0.16, 0); // abdomen
  add(torso, rb(0.42 * bulk, 0.34, 0.25, 0.09), shirt, 0, 0.44, 0); // ribcage
  add(torso, sph(0.1 * bulk), shirt, -0.2 * bulk, 0.56, 0); // deltoids
  add(torso, sph(0.1 * bulk), shirt, 0.2 * bulk, 0.56, 0);
  // body armour over the chest, with shoulder straps and pouches
  add(torso, rb(0.4 * bulk, 0.3, 0.28, 0.05), vest, 0, 0.44, 0.01);
  for (const s of [-1, 1]) {
    const strap = add(torso, rb(0.07, 0.26, 0.05, 0.02), vest, s * 0.14 * bulk, 0.56, 0.1);
    strap.rotation.x = -0.5;
  }
  add(torso, rb(0.3, 0.1, 0.07, 0.03), vest, 0, 0.3, 0.15); // cummerbund
  for (const x of [-0.1, 0, 0.1]) add(torso, rb(0.08, 0.1, 0.06, 0.02), dark, x, 0.3, 0.2);
  add(torso, rb(0.1, 0.12, 0.06, 0.02), dark, 0.17 * bulk, 0.46, -0.13); // rear pouch
  // neck
  add(torso, cap(0.055, 0.07), skin, 0, 0.64, 0);

  /* ----------------------------------------------------------------- head */
  const head = new THREE.Object3D();
  head.position.y = 0.7;
  torso.add(head);
  add(head, sph(0.115, 14), skin, 0, 0.09, 0).scale.set(0.94, 1.1, 1.02);
  add(head, sph(0.085), skin, 0, 0.03, 0.015).scale.set(0.9, 0.8, 0.95); // jaw
  add(head, rb(0.028, 0.05, 0.05, 0.012), skin, 0, 0.085, 0.105); // nose
  add(head, rb(0.17, 0.028, 0.05, 0.012), hairM, 0, 0.14, 0.09); // brow
  for (const s of [-1, 1]) {
    add(head, sph(0.023, 8), eyeW, s * 0.045, 0.115, 0.088);
    add(head, sph(0.012, 6), dark, s * 0.047, 0.115, 0.104); // pupil
    add(head, sph(0.03, 8), skin, s * 0.108, 0.09, -0.005); // ear
  }
  add(head, rb(0.05, 0.014, 0.02, 0.006), dark, 0, 0.03, 0.1); // mouth
  if (Math.random() < 0.55) add(head, sph(0.075, 10), hairM, 0, 0.01, 0.035).scale.set(1, 0.62, 0.95); // beard

  const kind = rnd(HEADWEAR);
  if (kind === "keffiyeh") {
    const wrap = add(head, sph(0.126, 14), cloth, 0, 0.1, -0.01);
    wrap.scale.set(1, 0.86, 1);
    add(head, rb(0.2, 0.16, 0.14, 0.05), cloth, 0, 0.02, -0.1); // drape down the back
    add(head, rb(0.19, 0.035, 0.19, 0.014), dark, 0, 0.185, 0); // agal cord
  } else if (kind === "beanie") {
    const b = add(head, sph(0.124, 14), dark, 0, 0.1, 0);
    b.scale.set(1, 0.82, 1);
    add(head, rb(0.23, 0.05, 0.23, 0.02), dark, 0, 0.05, 0);
  } else if (kind === "hair") {
    const h = add(head, sph(0.124, 14), hairM, 0, 0.105, -0.015);
    h.scale.set(1.03, 0.9, 1.04);
  } else {
    const b = add(head, sph(0.122, 14), dark, 0, 0.1, 0);
    b.scale.set(1, 1.04, 1);
    add(head, rb(0.2, 0.09, 0.06, 0.02), dark, 0, 0.115, 0.09); // balaclava brow
    add(head, rb(0.14, 0.05, 0.05, 0.02), dark, 0, 0.01, 0.09);
  }
  // goggles pushed up on the forehead
  const goggles = add(head, rb(0.2, 0.045, 0.06, 0.02), steel, 0, 0.18, 0.07);
  goggles.rotation.x = -0.25;

  /* ----------------------------------------------------------------- arms */
  const armL = new THREE.Object3D();
  armL.position.set(-0.22 * bulk, 0.56, 0);
  torso.add(armL);
  add(armL, cap(0.055 * bulk, 0.2), shirt, 0, -0.15, 0);
  add(armL, cap(0.07, 0.07), band, 0, -0.09, 0); // red identifier band
  const foreL = new THREE.Object3D();
  foreL.position.y = -0.28;
  armL.add(foreL);
  add(foreL, cap(0.047 * bulk, 0.17), shirt, 0, -0.11, 0);
  add(foreL, cap(0.05, 0.05), skin, 0, -0.2, 0); // wrist
  add(foreL, rb(0.06, 0.1, 0.07, 0.02), dark, 0, -0.26, 0.01); // glove

  const armR = new THREE.Object3D();
  armR.position.set(0.22 * bulk, 0.56, 0);
  torso.add(armR);
  add(armR, cap(0.055 * bulk, 0.2), shirt, 0, -0.15, 0);
  const foreR = new THREE.Object3D();
  foreR.position.y = -0.28;
  armR.add(foreR);
  add(foreR, cap(0.047 * bulk, 0.17), shirt, 0, -0.11, 0);
  add(foreR, cap(0.05, 0.05), skin, 0, -0.2, 0);
  add(foreR, rb(0.06, 0.1, 0.07, 0.02), dark, 0, -0.26, 0.01);

  /* ----------------------------------------------------------------- legs */
  const legL = new THREE.Object3D();
  legL.position.set(-0.11 * bulk, -0.08, 0);
  hips.add(legL);
  add(legL, cap(0.075 * bulk, 0.24), pants, 0, -0.19, 0);
  const shinL = new THREE.Object3D();
  shinL.position.y = -0.4;
  legL.add(shinL);
  add(shinL, cap(0.06 * bulk, 0.22), pants, 0, -0.15, 0);
  add(shinL, rb(0.1, 0.1, 0.24, 0.03), boot, 0, -0.3, 0.05); // boot
  add(shinL, rb(0.105, 0.03, 0.25, 0.012), dark, 0, -0.345, 0.05); // sole

  const legR = new THREE.Object3D();
  legR.position.set(0.11 * bulk, -0.08, 0);
  hips.add(legR);
  add(legR, cap(0.075 * bulk, 0.24), pants, 0, -0.19, 0);
  const shinR = new THREE.Object3D();
  shinR.position.y = -0.4;
  legR.add(shinR);
  add(shinR, cap(0.06 * bulk, 0.22), pants, 0, -0.15, 0);
  add(shinR, rb(0.1, 0.1, 0.24, 0.03), boot, 0, -0.3, 0.05);
  add(shinR, rb(0.105, 0.03, 0.25, 0.012), dark, 0, -0.345, 0.05);

  /* -------------------------------------------------------------- rifle */
  // carried on the torso so the arms only pose around it
  // the model faces +Z (matching the AI's yaw), so the muzzle points +Z
  const rifle = new THREE.Group();
  rifle.position.set(0.07, 0.34, 0.06);
  torso.add(rifle);
  add(rifle, rb(0.05, 0.07, 0.34, 0.02), steel, 0, 0, 0.02); // receiver
  add(rifle, cap(0.014, 0.3), steel, 0, 0.01, 0.26); // barrel forward
  add(rifle, rb(0.04, 0.13, 0.06, 0.015), dark, 0, -0.09, -0.02); // magazine
  add(rifle, rb(0.04, 0.05, 0.1, 0.02), dark, 0, -0.03, -0.18); // grip
  add(rifle, rb(0.045, 0.05, 0.14, 0.02), dark, 0, 0.0, -0.26); // stock
  add(rifle, rb(0.03, 0.03, 0.12, 0.015), dark, 0, 0.05, 0.16); // handguard
  add(rifle, rb(0.02, 0.035, 0.02, 0.006), steel, 0, 0.08, -0.08); // rear sight
  add(rifle, rb(0.014, 0.03, 0.014, 0.005), steel, 0, 0.08, 0.26); // front post

  const gunTip = new THREE.Object3D();
  gunTip.position.set(0, 0.02, 0.44);
  rifle.add(gunTip);

  const fc = document.createElement("canvas");
  fc.width = fc.height = 64;
  const fctx = fc.getContext("2d")!;
  const fgr = fctx.createRadialGradient(32, 32, 0, 32, 32, 32);
  fgr.addColorStop(0, "rgba(255,246,214,1)");
  fgr.addColorStop(0.3, "rgba(255,186,88,0.92)");
  fgr.addColorStop(1, "rgba(255,140,40,0)");
  fctx.fillStyle = fgr;
  fctx.fillRect(0, 0, 64, 64);
  const flash = new THREE.Mesh(
    new THREE.PlaneGeometry(0.4, 0.4),
    new THREE.MeshBasicMaterial({
      map: new THREE.CanvasTexture(fc),
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    }),
  );
  flash.visible = false;
  gunTip.add(flash);

  return { group, hips, torso, head, armL, armR, foreL, foreR, legL, legR, shinL, shinR, gunTip, flash, height };
}

/* ============================================================================
 * Gait and poses. Positive X rotation swings a limb toward -Z, so the forward
 * stroke of a stride (the model faces +Z) uses negative angles.
 * ========================================================================== */
export function animateNpc(m: NpcModel, phase: number, speed: number, aiming: boolean, hurt: number, dead: number) {
  const sw = Math.sin(phase);
  const cw = Math.cos(phase);

  if (dead > 0) {
    const k = Math.min(1, (2.4 - dead) * 2.4);
    m.group.rotation.x = k * 1.45;
    m.legL.rotation.x = -0.35 * k;
    m.legR.rotation.x = 0.4 * k;
    m.shinL.rotation.x = 0.55 * k;
    m.shinR.rotation.x = 0.2 * k;
    m.armL.rotation.set(-1.1 * k, 0, -0.7 * k);
    m.armR.rotation.set(-0.7 * k, 0, 0.9 * k);
    m.foreL.rotation.x = -0.6 * k;
    m.foreR.rotation.x = -0.4 * k;
    m.torso.rotation.x = 0.25 * k;
    m.head.rotation.set(0.3 * k, 0, 0.4 * k);
    return;
  }

  const amp = Math.min(1, speed / 3.8);
  const idle = 1 - amp;

  /* ---- legs: thigh swing + knee that only bends backwards ---- */
  const thighA = -sw * 0.78 * amp;
  const thighB = sw * 0.78 * amp;
  m.legL.rotation.x = thighA;
  m.legR.rotation.x = thighB;
  m.shinL.rotation.x = Math.max(0, Math.sin(phase + 1.15)) * 0.95 * amp;
  m.shinR.rotation.x = Math.max(0, Math.sin(phase + 1.15 + Math.PI)) * 0.95 * amp;
  // keep the boots roughly level with the ground
  const footL = -(thighA + m.shinL.rotation.x) * 0.55;
  const footR = -(thighB + m.shinR.rotation.x) * 0.55;
  m.shinL.rotation.z = footL;
  m.shinR.rotation.z = footR;

  /* ---- pelvis: vertical bob and lateral roll over the stance leg ---- */
  m.hips.position.y = 0.95 + Math.abs(cw) * 0.035 * amp + Math.sin(phase * 0.5) * 0.006 * idle;
  m.hips.rotation.z = -sw * 0.07 * amp;

  /* ---- torso: counter-rotates against the hips, leans into the run ---- */
  m.torso.rotation.y = sw * 0.16 * amp;
  m.torso.rotation.x = (aiming ? 0.1 : 0.04) + amp * 0.09 + hurt * 1.25;
  m.torso.rotation.z = sw * 0.03 * amp;
  m.head.rotation.x = aiming ? -0.07 : -0.04 - amp * 0.05 + hurt * 0.5;
  m.head.rotation.y = aiming ? -sw * 0.06 * amp : -sw * 0.16 * amp;
  m.head.rotation.z = hurt * 0.45;

  /* ---- arms: right carries the rifle, left swings or supports it ---- */
  if (aiming) {
    m.armR.rotation.set(-1.42, -0.1, 0.26);
    m.foreR.rotation.set(-0.34, 0, 0.1);
    m.armL.rotation.set(-1.18, 0.34, -0.5);
    m.foreL.rotation.set(-0.62, 0, -0.2);
  } else {
    const swing = sw * 0.62 * amp;
    // right arm cradles the weapon across the chest
    m.armR.rotation.set(-0.55 - amp * 0.1, -0.16, 0.3);
    m.foreR.rotation.set(-1.15, 0, 0.15);
    // left arm swings free when patrolling
    m.armL.rotation.set(swing + idle * 0.1, 0, 0.16);
    m.foreL.rotation.set(-0.28 - Math.max(0, -swing) * 0.5, 0, -0.1);
  }
}

/** world-space position of the muzzle, for tracers and flash */
export function muzzleWorld(m: NpcModel, out: THREE.Vector3) {
  return m.gunTip.getWorldPosition(out);
}
