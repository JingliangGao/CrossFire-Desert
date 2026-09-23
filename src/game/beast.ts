import * as THREE from "three";
import type { NpcModel } from "./npc";

/* ============================================================================
 * 异形 Xenomorph —— 双足趾行，光滑长头壳、无眼、肋状外骨骼、背管、分节长尾。
 * 结构复用 NpcModel 的关节约定，可无缝接进现有动画与判定：
 *   armL/armR → 双臂, legL/legR → 双腿, torso → 胸腔, head → 头
 * 尾巴链与下颚挂 group.userData（tail / jaw / innerJaw），不改 NpcModel 接口。
 * ========================================================================== */

const rb = (w: number, h: number, d: number) => new THREE.BoxGeometry(w, h, d);
const sph = (r: number, s = 12) => new THREE.SphereGeometry(r, s, Math.max(6, s - 4));
const cone = (r: number, h: number, s = 8) => new THREE.ConeGeometry(r, h, s);
const cap = (r: number, l: number) => new THREE.CapsuleGeometry(r, l, 4, 10);

function put(parent: THREE.Object3D, geo: THREE.BufferGeometry, m: THREE.Material, x = 0, y = 0, z = 0) {
  const b = new THREE.Mesh(geo, m);
  b.position.set(x, y, z);
  b.castShadow = true;
  b.receiveShadow = true;
  parent.add(b);
  return b;
}

/** pivot-based limb hanging downward from (x, y, z) */
function limb(
  parent: THREE.Object3D,
  len: number,
  r0: number,
  r1: number,
  m: THREE.Material,
  x: number,
  y: number,
  z: number,
) {
  const pivot = new THREE.Object3D();
  pivot.position.set(x, y, z);
  const g = new THREE.CylinderGeometry(r0, r1, len, 8);
  g.translate(0, -len / 2, 0);
  const mesh = new THREE.Mesh(g, m);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  pivot.add(mesh);
  parent.add(pivot);
  return pivot;
}

/** default digitigrade standing pose — animateBeast() swings around these */
const BASE_LEG = -0.35;
const BASE_SHIN = 0.75;
const BASE_ARM = 0.45;
const BASE_FORE = 0.55;
const BASE_HIP_Y = 0.78;
/** 静息尾节俯仰：起始微垂、末节上翘，形成经典 S 曲线 */
const tailBase = (i: number) => -0.14 + i * 0.032;

export function buildBeast(big: boolean): NpcModel {
  const S = big ? 2.3 : 1;
  // 近黑几丁质 + 微弱青色湿光
  const shell = new THREE.MeshStandardMaterial({
    color: 0x1a1c1a,
    roughness: 0.3,
    metalness: 0.75,
    emissive: 0x0a2426,
    emissiveIntensity: 0.35,
  });
  const plate = new THREE.MeshStandardMaterial({
    color: big ? 0x3a403c : 0x2a2f2e,
    roughness: 0.42,
    metalness: 0.55,
    emissive: 0x06181a,
    emissiveIntensity: 0.25,
  });
  const bone = new THREE.MeshStandardMaterial({ color: 0xd8d2c0, roughness: 0.35, metalness: 0.2 });

  const group = new THREE.Group();
  group.scale.setScalar(S);

  /* ------------------------------------------------------------------ 骨盆 */
  const hips = new THREE.Object3D();
  hips.position.y = BASE_HIP_Y;
  group.add(hips);
  put(hips, rb(0.3, 0.22, 0.34), shell, 0, 0.02, -0.04);
  put(hips, rb(0.34, 0.1, 0.3), plate, 0, 0.12, -0.04);

  /* ------------------------------------------------------------------ 胸腔 */
  const torso = new THREE.Object3D();
  torso.position.y = 0.05;
  hips.add(torso);
  // 腹部 → 胸甲的前倾躯干
  const abdomen = put(torso, cap(0.13, 0.22), shell, 0, 0.14, 0.02);
  abdomen.scale.z = 0.8;
  const chest = put(torso, rb(0.34, 0.4, 0.28), shell, 0, 0.4, 0.04);
  chest.scale.set(1, 1, 1);
  chest.rotation.x = -0.1;
  // 肋骨状分节外骨骼
  for (let i = 0; i < 5; i++) {
    const w = 0.36 - i * 0.02;
    put(torso, rb(w, 0.035, 0.3), plate, 0, 0.55 - i * 0.07, 0.05 - i * 0.005);
  }
  put(torso, rb(0.26, 0.06, 0.22), plate, 0, 0.2, 0.06); // 髋上甲片
  // 背部 4 根蒸汽管 / 背鳍（Boss 更粗）
  for (let i = 0; i < 4; i++) {
    const s = i < 2 ? -1 : 1;
    const k = i % 2;
    const t = put(
      torso,
      cone(big ? 0.06 - k * 0.012 : 0.045 - k * 0.01, big ? 0.42 : 0.34, 6),
      plate,
      s * (0.1 + k * 0.055),
      0.5 - k * 0.07,
      -0.1 - k * 0.04,
    );
    t.rotation.x = -0.55 - k * 0.12; // 向后上方
    t.rotation.z = s * 0.18;
  }
  // 高耸的肩胛驼峰，头直接埋进躯干（无颈）
  put(torso, sph(0.16, 10), shell, 0, 0.56, -0.02).scale.set(1.25, 0.7, 1);

  /* -------------------------------------------------------------------- 头 */
  const head = new THREE.Object3D();
  head.position.set(0, 0.52, 0.18);
  torso.add(head);
  // 光滑长头壳：前伸蛋形罩，后脑拉长（无眼）
  const dome = put(head, sph(0.14, 16), shell, 0, 0.03, big ? 0.2 : 0.16);
  dome.scale.set(big ? 1.3 : 1.0, 0.84, big ? 2.7 : 2.35);
  // 后脑收束锥 + 细棱
  const rear = put(head, cone(0.105, 0.3, 8), shell, 0, 0.035, -0.18);
  rear.rotation.x = -Math.PI / 2;
  rear.scale.set(big ? 1.25 : 1, 1, 1);
  for (const s of [-1, 1]) {
    const ridge = put(head, rb(0.018, 0.028, big ? 0.66 : 0.58), plate, s * (big ? 0.11 : 0.085), 0.1, big ? 0.16 : 0.12);
    ridge.rotation.x = -0.05;
  }
  put(head, rb(0.05, 0.02, big ? 0.6 : 0.5), plate, 0, 0.12, big ? 0.14 : 0.1); // 中脊
  // 上颚 + 外排锥牙
  put(head, rb(0.15, 0.055, 0.3), shell, 0, -0.075, 0.14);
  for (let i = 0; i < 4; i++) {
    const tx = (i - 1.5) * 0.038;
    put(head, cone(0.014, 0.05, 5), bone, tx, -0.11, 0.26).rotation.x = Math.PI;
    for (const s of [-1, 1]) put(head, cone(0.012, 0.045, 5), bone, s * 0.06, -0.1, 0.1 + i * 0.05).rotation.x = Math.PI;
  }
  // 下颚（可张合）+ 内槽牙（攻击时弹出）
  const jaw = new THREE.Object3D();
  jaw.position.set(0, -0.1, 0.02);
  head.add(jaw);
  put(jaw, rb(0.13, 0.045, 0.28), shell, 0, -0.01, 0.14);
  for (let i = 0; i < 4; i++) {
    const tx = (i - 1.5) * 0.034;
    put(jaw, cone(0.013, 0.045, 5), bone, tx, 0.03, 0.24);
    for (const s of [-1, 1]) put(jaw, cone(0.011, 0.04, 5), bone, s * 0.055, 0.02, 0.1 + i * 0.05);
  }
  const innerJaw = new THREE.Object3D();
  innerJaw.position.set(0, -0.03, 0.1);
  jaw.add(innerJaw);
  put(innerJaw, cap(0.022, 0.1), shell, 0, 0, 0.06);
  put(innerJaw, sph(0.03, 8), shell, 0, 0, 0.13);
  for (const s of [-1, 1]) put(innerJaw, cone(0.01, 0.03, 5), bone, s * 0.018, 0.02, 0.15);
  put(innerJaw, cone(0.01, 0.03, 5), bone, 0, -0.02, 0.15);

  /* -------------------------------------------------------------------- 双臂 */
  const armL = limb(torso, 0.32, 0.05, 0.038, shell, -0.2, 0.44, 0.04);
  armL.rotation.x = BASE_ARM;
  const foreL = limb(armL, 0.3, 0.038, 0.028, shell, 0, -0.32, 0);
  foreL.rotation.x = BASE_FORE;
  put(foreL, rb(0.07, 0.05, 0.1), plate, 0, -0.3, 0.02);
  for (let i = 0; i < 3; i++) {
    const cl = put(foreL, cone(0.012, 0.1, 5), bone, (i - 1) * 0.03, -0.37, 0.03);
    cl.rotation.x = Math.PI;
  }

  const armR = limb(torso, 0.32, 0.05, 0.038, shell, 0.2, 0.44, 0.04);
  armR.rotation.x = BASE_ARM;
  const foreR = limb(armR, 0.3, 0.038, 0.028, shell, 0, -0.32, 0);
  foreR.rotation.x = BASE_FORE;
  put(foreR, rb(0.07, 0.05, 0.1), plate, 0, -0.3, 0.02);
  for (let i = 0; i < 3; i++) {
    const cl = put(foreR, cone(0.012, 0.1, 5), bone, (i - 1) * 0.03, -0.37, 0.03);
    cl.rotation.x = Math.PI;
  }

  /* ------------------------------------------------------------------ 双腿 */
  // 趾行：大腿前折、小腿后折、爪足着地
  const legL = limb(hips, 0.36, 0.075, 0.05, shell, -0.16, -0.04, -0.02);
  legL.rotation.x = BASE_LEG;
  const shinL = limb(legL, 0.34, 0.05, 0.035, shell, 0, -0.36, 0);
  shinL.rotation.x = BASE_SHIN;
  put(shinL, rb(0.09, 0.05, 0.16), plate, 0, -0.32, 0.04);
  put(shinL, rb(0.07, 0.07, 0.1), shell, 0, -0.34, -0.02);
  for (let i = 0; i < 3; i++) {
    const toe = put(shinL, cone(0.016, 0.12, 5), bone, (i - 1) * 0.03, -0.4, 0.1);
    toe.rotation.x = Math.PI / 2.6;
  }

  const legR = limb(hips, 0.36, 0.075, 0.05, shell, 0.16, -0.04, -0.02);
  legR.rotation.x = BASE_LEG;
  const shinR = limb(legR, 0.34, 0.05, 0.035, shell, 0, -0.36, 0);
  shinR.rotation.x = BASE_SHIN;
  put(shinR, rb(0.09, 0.05, 0.16), plate, 0, -0.32, 0.04);
  put(shinR, rb(0.07, 0.07, 0.1), shell, 0, -0.34, -0.02);
  for (let i = 0; i < 3; i++) {
    const toe = put(shinR, cone(0.016, 0.12, 5), bone, (i - 1) * 0.03, -0.4, 0.1);
    toe.rotation.x = Math.PI / 2.6;
  }

  /* -------------------------------------------------- 分节长尾（9 节链式） */
  const tailPivots: THREE.Object3D[] = [];
  let node: THREE.Object3D = hips;
  const segLen = 0.26;
  for (let i = 0; i < 9; i++) {
    const p = new THREE.Object3D();
    p.position.set(0, i === 0 ? 0.06 : 0, i === 0 ? -0.2 : -segLen);
    p.rotation.x = tailBase(i);
    node.add(p);
    const r0 = 0.065 * (1 - i * 0.085);
    const r1 = 0.065 * (1 - (i + 1) * 0.085);
    const g = new THREE.CylinderGeometry(Math.max(0.012, r1), Math.max(0.014, r0), segLen, 8);
    g.rotateX(Math.PI / 2);
    g.translate(0, 0, -segLen / 2);
    put(p, g, shell);
    // 节间骨环
    const ring = put(p, sph(Math.max(0.016, r0 * 1.15), 8), plate, 0, 0, 0);
    ring.scale.z = 0.6;
    tailPivots.push(p);
    node = p;
  }
  const barb = put(node, cone(0.03, 0.18, 6), bone, 0, 0, -segLen - 0.07);
  barb.rotation.x = -Math.PI / 2;

  /* ---------------------------------------- 口部枪口（曳光弹/火光挂点） */
  const gunTip = new THREE.Object3D();
  gunTip.position.set(0, -0.05, big ? 0.42 : 0.36);
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

  group.userData.tail = tailPivots;
  group.userData.jaw = jaw;
  group.userData.innerJaw = innerJaw;

  return { group, hips, torso, head, armL, armR, foreL, foreR, legL, legR, shinL, shinR, gunTip, flash, height: S };
}

/** hit-box scale: 双足异形站立高 ~1.5m，Boss 2.3×；打尾巴不进盒（尾在 ww 之外） */
export function beastScale(big: boolean) {
  return big ? { w: 1.0, h: 3.45, y0: 0 } : { w: 0.5, h: 1.5, y0: 0 };
}

export function animateBeast(m: NpcModel, phase: number, speed: number, aiming: boolean, hurt: number, dead: number) {
  const tail = (m.group.userData.tail as THREE.Object3D[] | undefined) ?? [];
  const jaw = m.group.userData.jaw as THREE.Object3D | undefined;
  const inner = m.group.userData.innerJaw as THREE.Object3D | undefined;

  if (dead > 0) {
    const k = Math.min(1, (2.4 - dead) * 2.4);
    m.group.rotation.x = k * 1.45;
    m.legL.rotation.x = BASE_LEG - 0.5 * k;
    m.legR.rotation.x = BASE_LEG + 0.6 * k;
    m.shinL.rotation.x = BASE_SHIN + 0.4 * k;
    m.shinR.rotation.x = BASE_SHIN - 0.3 * k;
    m.armL.rotation.x = BASE_ARM + 0.8 * k;
    m.armR.rotation.x = BASE_ARM - 0.7 * k;
    m.foreL.rotation.x = BASE_FORE + 0.3 * k;
    m.foreR.rotation.x = BASE_FORE - 0.3 * k;
    m.torso.rotation.z = 0.4 * k;
    m.head.rotation.x = 0.5 * k;
    if (jaw) jaw.rotation.x = 0.45 * k;
    if (inner) inner.position.z = 0.1 * k;
    for (let i = 0; i < tail.length; i++) {
      tail[i].rotation.x = tailBase(i) - 0.1 * k;
      tail[i].rotation.y = 0;
    }
    return;
  }

  const amp = Math.min(1, speed / 4);
  const f = Math.sin(phase);
  const b = Math.sin(phase + Math.PI * 0.55);

  /* ---- 双足步态：大腿前摆、膝盖只向后弯 ---- */
  m.legL.rotation.x = BASE_LEG - f * 0.62 * amp;
  m.legR.rotation.x = BASE_LEG + f * 0.62 * amp;
  m.shinL.rotation.x = BASE_SHIN + Math.max(0, Math.sin(phase + 1.2)) * 0.85 * amp;
  m.shinR.rotation.x = BASE_SHIN + Math.max(0, Math.sin(phase + 1.2 + Math.PI)) * 0.85 * amp;

  /* ---- 躯干前倾 + 左右拧转 ---- */
  m.hips.position.y = BASE_HIP_Y + Math.abs(Math.cos(phase)) * 0.05 * amp;
  m.torso.rotation.x = 0.14 + (aiming ? 0.05 : 0) + hurt * 1.2;
  m.torso.rotation.y = -f * 0.09 * amp;
  m.torso.rotation.z = b * 0.03 * amp;

  /* ---- 双臂反向摆，前臂回收 ---- */
  m.armL.rotation.x = BASE_ARM - b * 0.5 * amp;
  m.armR.rotation.x = BASE_ARM + b * 0.5 * amp;
  m.foreL.rotation.x = BASE_FORE + Math.max(0, b) * 0.35 * amp;
  m.foreR.rotation.x = BASE_FORE + Math.max(0, -b) * 0.35 * amp;

  /* ---- 头：瞄准时压低，平时随步伐扫视（无眼所以靠整体转向） ---- */
  m.head.rotation.x = aiming ? -0.14 : 0.05 + Math.sin(phase * 0.5) * 0.05;
  m.head.rotation.y = aiming ? 0 : Math.sin(phase * 0.31) * 0.14;

  /* ---- 撕咬：张颚 + 内槽牙弹出 ---- */
  if (jaw) jaw.rotation.x = aiming ? 0.42 + Math.sin(phase * 9) * 0.12 : 0.08 + Math.sin(phase * 0.6) * 0.04;
  if (inner) inner.position.z = aiming ? 0.15 + Math.sin(phase * 9) * 0.04 : 0;

  /* ---- 尾巴链式跟随摆动 ---- */
  const tAmp = 0.45 + amp * 0.55;
  for (let i = 0; i < tail.length; i++) {
    tail[i].rotation.y = Math.sin(phase * 0.8 + i * 0.55) * (0.1 + i * 0.022) * tAmp;
    tail[i].rotation.x = tailBase(i) + Math.sin(phase * 0.55 + i * 0.4) * 0.05 * tAmp;
  }
}
