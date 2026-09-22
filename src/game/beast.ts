import * as THREE from "three";
import type { NpcModel } from "./npc";

/* ============================================================================
 * 异形怪 —— 四足外星猎兽，矮、宽、快；大型个体是首领。
 * 结构复用 NpcModel 的关节约定，可无缝接进现有动画与判定：
 *   armL/armR → 前腿, legL/legR → 后腿, torso → 胸腔, head → 头
 * ========================================================================== */

const SKIN = [0x6f8f72, 0x5d7a5f, 0x7d6a4e];
const rnd = <T,>(a: T[]): T => a[Math.floor(Math.random() * a.length)];

const rb = (w: number, h: number, d: number) => new THREE.BoxGeometry(w, h, d);
const sph = (r: number, s = 12) => new THREE.SphereGeometry(r, s, Math.max(6, s - 4));
const cone = (r: number, h: number, s = 8) => new THREE.ConeGeometry(r, h, s);

function put(parent: THREE.Object3D, geo: THREE.BufferGeometry, m: THREE.Material, x = 0, y = 0, z = 0) {
  const b = new THREE.Mesh(geo, m);
  b.position.set(x, y, z);
  b.castShadow = true;
  b.receiveShadow = true;
  parent.add(b);
  return b;
}

/** pivot-based limb hanging downward from (x, y, z) */
function limb(parent: THREE.Object3D, len: number, r0: number, r1: number, m: THREE.Material, x: number, y: number, z: number) {
  const pivot = new THREE.Object3D();
  pivot.position.set(x, y, z);
  const g = new THREE.CylinderGeometry(r0, r1, len, 8);
  g.translate(0, -len / 2, 0);
  pivot.add(put(pivot, g, m) as never as never);
  parent.add(pivot);
  return pivot;
}

export function buildBeast(big: boolean): NpcModel {
  const S = big ? 2.35 : 1;
  const skin = new THREE.MeshStandardMaterial({
    color: rnd(SKIN),
    roughness: 0.62,
    metalness: 0.1,
    emissive: 0x0b1a16,
    emissiveIntensity: 0.3,
  });
  const plate = new THREE.MeshStandardMaterial({ color: 0x2c3129, roughness: 0.45, metalness: 0.35 });
  const claw = new THREE.MeshStandardMaterial({ color: 0xd8d2c0, roughness: 0.3, metalness: 0.2 });
  const eye = new THREE.MeshStandardMaterial({ color: 0xff5a2a, emissive: 0xff3c12, emissiveIntensity: 2, roughness: 0.2 });
  const spike = new THREE.MeshStandardMaterial({
    color: big ? 0xff2a1a : 0x39ffe0,
    emissive: big ? 0xff2a1a : 0x14c8b4,
    emissiveIntensity: 1.5,
    roughness: 0.3,
  });

  const group = new THREE.Group();
  group.scale.setScalar(S);

  const hips = new THREE.Object3D();
  hips.position.y = 0.62;
  group.add(hips);
  put(hips, rb(0.36, 0.3, 0.62), skin, 0, 0, -0.12);

  const torso = new THREE.Object3D();
  hips.add(torso);
  put(torso, rb(0.44, 0.36, 0.7), skin, 0, 0.04, 0.26);
  put(torso, rb(0.5, 0.14, 0.5), plate, 0, 0.2, 0.24);
  put(torso, rb(0.46, 0.08, 0.44), plate, 0, -0.1, 0.24);
  for (let i = 0; i < 5; i++) {
    const s = put(torso, cone(0.05 - i * 0.004, 0.2 + (i % 2) * 0.1), spike, 0, 0.26, 0.06 + i * 0.14);
    s.rotation.x = -0.25;
  }

  const head = new THREE.Object3D();
  head.position.set(0, 0.16, 0.66);
  torso.add(head);
  const skull = put(head, sph(0.17, 12), skin);
  skull.scale.set(1, 0.86, 1.15);
  put(head, rb(0.2, 0.1, 0.22), plate, 0, 0.1, -0.04);
  put(head, rb(0.16, 0.07, 0.16), skin, 0, -0.04, 0.14);
  for (const s of [-1, 1]) {
    const e = put(head, sph(0.05, 8), eye, s * 0.08, 0.03, 0.11);
    e.scale.set(1, 0.7, 1);
    put(head, cone(0.03, 0.16, 6), claw, s * 0.12, 0.1, -0.06).rotation.z = s * 0.6;
    put(head, cone(0.022, 0.09, 6), claw, s * 0.06, -0.05, 0.16).rotation.x = 1.4;
  }
  for (let i = 0; i < 4; i++) {
    const t = put(torso, sph(0.07 - i * 0.013, 8), skin, 0, -0.02 - i * 0.03, -0.2 - i * 0.17);
    t.scale.z = 1.6;
  }

  /* front pair (mapped onto armL/armR) */
  const armL = limb(torso, 0.4, 0.07, 0.05, skin, -0.2, -0.04, 0.34);
  const foreL = limb(armL, 0.34, 0.05, 0.038, skin, 0, -0.4, 0);
  put(foreL, rb(0.1, 0.05, 0.16), plate, 0, -0.36, 0.04);
  put(foreL, cone(0.02, 0.1, 6), claw, 0.03, -0.4, 0.1);

  const armR = limb(torso, 0.4, 0.07, 0.05, skin, 0.2, -0.04, 0.34);
  const foreR = limb(armR, 0.34, 0.05, 0.038, skin, 0, -0.4, 0);
  put(foreR, rb(0.1, 0.05, 0.16), plate, 0, -0.36, 0.04);
  put(foreR, cone(0.02, 0.1, 6), claw, -0.03, -0.4, 0.1);

  /* hind pair (mapped onto legL/legR) */
  const legL = limb(hips, 0.42, 0.085, 0.06, skin, -0.2, -0.06, -0.3);
  const shinL = limb(legL, 0.36, 0.055, 0.04, skin, 0, -0.42, 0);
  put(shinL, rb(0.11, 0.06, 0.18), plate, 0, -0.38, 0.05);

  const legR = limb(hips, 0.42, 0.085, 0.06, skin, 0.2, -0.06, -0.3);
  const shinR = limb(legR, 0.36, 0.055, 0.04, skin, 0, -0.42, 0);
  put(shinR, rb(0.11, 0.06, 0.18), plate, 0, -0.38, 0.05);

  /* muzzle: source of tracers + flash card */
  const gunTip = new THREE.Object3D();
  gunTip.position.set(0, 0, 0.24);
  head.add(gunTip);
  const fc = document.createElement("canvas");
  fc.width = fc.height = 64;
  const fctx = fc.getContext("2d")!;
  const fgr = fctx.createRadialGradient(32, 32, 0, 32, 32, 32);
  fgr.addColorStop(0, "rgba(255,246,214,1)");
  fgr.addColorStop(0.3, "rgba(120,255,230,0.9)");
  fgr.addColorStop(1, "rgba(40,255,220,0)");
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

  return { group, hips, torso, head, armL, armR, foreL, foreR, legL, legR, shinL, shinR, gunTip, flash, height: S };
}

/** hit-box scale: bosses are much easier to hit */
export function beastScale(big: boolean) {
  return big ? { w: 1.9, h: 1.55, y0: 0.1 } : { w: 1.25, h: 0.95, y0: 0.05 };
}

export function animateBeast(m: NpcModel, phase: number, speed: number, aiming: boolean, hurt: number, dead: number) {
  if (dead > 0) {
    const k = Math.min(1, (2.4 - dead) * 2.4);
    m.group.rotation.x = k * 1.45;
    m.legL.rotation.x = -0.5 * k;
    m.legR.rotation.x = 0.6 * k;
    m.armL.rotation.x = 0.8 * k;
    m.armR.rotation.x = -0.8 * k;
    m.torso.rotation.z = 0.4 * k;
    m.head.rotation.x = 0.5 * k;
    return;
  }
  const amp = Math.min(1, speed / 4);
  const f = Math.sin(phase);
  const b = Math.sin(phase + Math.PI * 0.55);
  m.armL.rotation.x = -f * 0.72 * amp;
  m.armR.rotation.x = -b * 0.72 * amp;
  m.legL.rotation.x = b * 0.66 * amp;
  m.legR.rotation.x = f * 0.66 * amp;
  m.foreL.rotation.x = Math.max(0, f) * 0.85 * amp;
  m.foreR.rotation.x = Math.max(0, b) * 0.85 * amp;
  m.shinL.rotation.x = Math.max(0, -b) * 0.9 * amp;
  m.shinR.rotation.x = Math.max(0, -f) * 0.9 * amp;
  m.hips.position.y = 0.62 + Math.abs(Math.cos(phase)) * 0.05 * amp;
  m.torso.rotation.y = -f * 0.1 * amp;
  m.torso.rotation.x = hurt * 1.2 + (aiming ? 0.06 : 0);
  m.head.rotation.x = aiming ? -0.16 : Math.sin(phase * 0.5) * 0.06;
  m.head.rotation.y = aiming ? 0 : Math.sin(phase * 0.31) * 0.14;
}
