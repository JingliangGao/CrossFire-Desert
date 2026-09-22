import * as THREE from "three";
import {
  pbrCloth,
  pbrCrate,
  pbrGround,
  pbrMetal,
  pbrTile,
  pbrWall,
  std,
  texDecal,
  texSiteMark,
  texSky,
  texSoft,
} from "./textures";

export interface Box {
  x0: number;
  y0: number;
  z0: number;
  x1: number;
  y1: number;
  z1: number;
}

export interface MapData {
  colliders: Box[];
  radar: { x: number; z: number; w: number; d: number }[];
  playerSpawn: { x: number; y: number; z: number };
  enemySpawns: { x: number; y: number; z: number }[];
  waypoints: { x: number; z: number }[];
  decalTex: THREE.Texture;
  softTex: THREE.Texture;
}

export const MAP_HALF = 76;

/**
 * Every client seeds the world identically at module load, so the town — and
 * therefore hit resolution between LAN players — matches on every device.
 */
let mapSeed = 20260214 | 0;
(function seedWorld() {
  const orig = Math.random;
  const next = () => {
    mapSeed = (mapSeed + 0x6d2b79f5) | 0;
    let t = Math.imul(mapSeed ^ (mapSeed >>> 15), 1 | mapSeed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  Math.random = next;
  void orig;
})();

/* ============================================================================
 * Static scenery. Boxes of one material are merged into one draw call with
 * per-box vertex colour tinting, so the town costs a handful of draws while
 * no two walls look like clones.
 * ========================================================================== */
class Acc {
  pos: number[] = [];
  nor: number[] = [];
  uvs: number[] = [];
  col: number[] = [];
  idx: number[] = [];

  add(g: THREE.BufferGeometry, cx: number, cy: number, cz: number, tile: number, tint: number, rotY = 0) {
    const uv = g.attributes.uv as THREE.BufferAttribute;
    const p = g.attributes.position.array as ArrayLike<number>;
    const n = g.attributes.normal.array as ArrayLike<number>;
    const u = uv.array as ArrayLike<number>;
    // scale every face by its own size so texel density stays constant
    g.computeBoundingBox();
    const bb = g.boundingBox!;
    const sx = bb.max.x - bb.min.x;
    const sy = bb.max.y - bb.min.y;
    const sz = bb.max.z - bb.min.z;
    const face: [number, number][] = [
      [sz, sy],
      [sz, sy],
      [sx, sz],
      [sx, sz],
      [sx, sy],
      [sx, sy],
    ];
    for (let f = 0; f < 6; f++) {
      const su = face[f][0] / tile;
      const sv = face[f][1] / tile;
      for (let i = 0; i < 4; i++) uv.setXY(f * 4 + i, uv.getX(f * 4 + i) * su, uv.getY(f * 4 + i) * sv);
    }
    if (rotY) g.rotateY(rotY);
    g.translate(cx, cy, cz);
    const base = this.pos.length / 3;
    for (let i = 0; i < p.length; i++) this.pos.push(p[i]);
    for (let i = 0; i < n.length; i++) this.nor.push(n[i]);
    for (let i = 0; i < u.length; i++) this.uvs.push(u[i]);
    for (let i = 0; i < p.length / 3; i++) {
      // vertex colours are linear 0..1 — 0..255 would blow the scene out to white
      this.col.push(((tint >> 16) & 255) / 255, ((tint >> 8) & 255) / 255, (tint & 255) / 255);
    }
    const gi = g.index!.array as ArrayLike<number>;
    for (let i = 0; i < gi.length; i++) this.idx.push(gi[i] + base);
    g.dispose();
  }

  /** raw geometry (arches, cylinders) with a uniform texel scale on every face */
  addRaw(g: THREE.BufferGeometry, cx: number, cy: number, cz: number, tile: number, tint: number, rotY = 0) {
    const uv = g.attributes.uv as THREE.BufferAttribute;
    const p = g.attributes.position.array as ArrayLike<number>;
    for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) / tile, uv.getY(i) / tile);
    const n = g.attributes.normal.array as ArrayLike<number>;
    const u = uv.array as ArrayLike<number>;
    if (rotY) g.rotateY(rotY);
    g.translate(cx, cy, cz);
    const base = this.pos.length / 3;
    for (let i = 0; i < p.length; i++) this.pos.push(p[i]);
    for (let i = 0; i < n.length; i++) this.nor.push(n[i]);
    for (let i = 0; i < u.length; i++) this.uvs.push(u[i]);
    for (let i = 0; i < p.length / 3; i++) this.col.push(tint >> 16 & 255, tint >> 8 & 255, tint & 255);
    const gi = g.index?.array as ArrayLike<number> | undefined;
    if (gi) for (let i = 0; i < gi.length; i++) this.idx.push(gi[i] + base);
    else for (let i = 0; i < p.length / 3; i++) this.idx.push(i + base);
    g.dispose();
  }

  build() {
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute("normal", new THREE.Float32BufferAttribute(this.nor, 3));
    g.setAttribute("uv", new THREE.Float32BufferAttribute(this.uvs, 2));
    g.setAttribute("color", new THREE.Float32BufferAttribute(this.col, 3));
    g.setIndex(this.idx);
    return g;
  }
}

/** slight per-object tint so a repeated wall never reads as a clone */
const vary = (amt = 0.12) => {
  const v = 1 - amt / 2 + Math.random() * amt;
  const r = Math.min(255, Math.round(v * 255));
  return (r << 16) | (Math.round(v * 250) << 8) | Math.round(v * 240);
};

/** an extruded wall with a semicircular opening — a real arch you walk through */
function archWall(w: number, h: number, d: number, span: number) {
  const s = new THREE.Shape();
  s.moveTo(-w / 2, 0);
  s.lineTo(-w / 2, h);
  s.lineTo(w / 2, h);
  s.lineTo(w / 2, 0);
  s.lineTo(span / 2, 0);
  s.absarc(0, 0, span / 2, 0, Math.PI, false);
  s.lineTo(-w / 2, 0);
  return new THREE.ExtrudeGeometry(s, { depth: d, bevelEnabled: true, bevelSize: 0.05, bevelThickness: 0.05, bevelSegments: 1, curveSegments: 14 });
}

export function buildMap(scene: THREE.Scene): MapData {
  const colliders: Box[] = [];
  const radar: { x: number; z: number; w: number; d: number }[] = [];
  const acc = {
    wall: new Acc(),
    crate: new Acc(),
    tile: new Acc(),
    metal: new Acc(),
    cloth: new Acc(),
  };
  const lowTint = 0xa89880;

  const box = (x: number, y: number, z: number, w: number, h: number, d: number) => {
    colliders.push({ x0: x - w / 2, x1: x + w / 2, y0: y - h / 2, y1: y + h / 2, z0: z - d / 2, z1: z + d / 2 });
  };
  const put = (
    m: "wall" | "crate" | "tile" | "metal" | "cloth",
    x: number,
    z: number,
    w: number,
    h: number,
    d: number,
    y = 0,
    tile = 2.6,
    rotY = 0,
    collide = true,
  ) => {
    acc[m].add(new THREE.BoxGeometry(w, h, d), x, y + h / 2, z, tile, vary(), rotY);
    if (collide) {
      box(x, y + h / 2, z, w, h, d);
      if (h >= 1.6) radar.push({ x, z, w, d });
    }
  };

  /* ------------------------------------------------------------- ground */
  const groundMat = std(pbrGround(), { roughness: 1 });
  groundMat.map!.repeat.set(52, 52);
  groundMat.normalMap!.repeat.set(52, 52);
  groundMat.roughnessMap!.repeat.set(52, 52);
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(760, 760, 1, 1), groundMat);
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  scene.add(ground);

  const sky = new THREE.Mesh(
    new THREE.SphereGeometry(420, 40, 24),
    new THREE.MeshBasicMaterial({ map: texSky(), side: THREE.BackSide, fog: false, depthWrite: false }),
  );
  scene.add(sky);
  // the sun itself, low contrast so it reads as haze
  const sunSprite = new THREE.Mesh(
    new THREE.SphereGeometry(9, 16, 12),
    new THREE.MeshBasicMaterial({ color: 0xfff4d2, fog: false }),
  );
  sunSprite.position.set(150, 210, 100);
  scene.add(sunSprite);

  /* ----------------------------------------------------------- perimeter */
  const H = MAP_HALF;
  put("wall", 0, -H - 1.5, 2 * H + 8, 9, 3, 0, 3.2);
  put("wall", 0, H + 1.5, 2 * H + 8, 9, 3, 0, 3.2);
  put("wall", -H - 1.5, 0, 3, 9, 2 * H + 8, 0, 3.2);
  put("wall", H + 1.5, 0, 3, 9, 2 * H + 8, 0, 3.2);
  // crenellated crowns on the town walls
  for (let x = -H + 3; x < H; x += 6.5) {
    put("wall", x, -H - 1.5, 2.4, 1.1, 3.4, 9, 2.4, 0, false);
    put("wall", x, H + 1.5, 2.4, 1.1, 3.4, 9, 2.4, 0, false);
  }

  /* ----------------------------------------------------------- buildings */
  const blocks: [number, number, number, number, number][] = [
    [-26, 8, 20, 7, 30],
    [26, 8, 20, 7, 30],
    [-26, -24, 20, 9, 18],
    [26, -24, 20, 9, 18],
    [-46, 30, 16, 6, 20],
    [46, 30, 16, 6, 20],
  ];
  for (const [x, z, w, h, d] of blocks) {
    put("wall", x, z, w, h, d, 0, 3.4);
    // parapet with crenellations — a roof you can actually fight from
    put("wall", x, z - d / 2 + 0.35, w, 1.0, 0.7, h, 2.2);
    put("wall", x, z + d / 2 - 0.35, w, 1.0, 0.7, h, 2.2);
    for (let i = -1; i <= 1; i++) {
      put("wall", x + i * (w / 3), z - d / 2 + 0.35, 1.5, 1.7, 0.7, h + 1, 2.2, 0, false);
      put("wall", x + i * (w / 3), z + d / 2 - 0.35, 1.5, 1.7, 0.7, h + 1, 2.2, 0, false);
    }
    // pilasters + shuttered windows on both faces
    for (let i = -1; i <= 1; i++) {
      const px = x + i * (w / 3);
      acc.wall.add(new THREE.BoxGeometry(1.1, h * 0.92, 0.34), px, h * 0.46, z + d / 2 + 0.14, 2.6, vary());
      acc.wall.add(new THREE.BoxGeometry(1.1, h * 0.92, 0.34), px, h * 0.46, z - d / 2 - 0.14, 2.6, vary());
      for (const s of [1, -1]) {
        // recess
        acc.wall.add(new THREE.BoxGeometry(2.3, 1.7, 0.3), px + w / 6, h * 0.55, z + s * (d / 2 + 0.02), 2.6, lowTint);
        // wooden shutter pair
        acc.crate.add(new THREE.BoxGeometry(1.0, 1.6, 0.1), px + w / 6 - 0.55, h * 0.55, z + s * (d / 2 + 0.16), 1.4, vary(0.3));
        acc.crate.add(new THREE.BoxGeometry(1.0, 1.6, 0.1), px + w / 6 + 0.55, h * 0.55, z + s * (d / 2 + 0.16), 1.4, vary(0.3));
      }
    }
    // roof stair: tallest step against the wall, descending outward
    const steps = Math.ceil(h / 0.55);
    const dir = x > 0 ? -1 : 1;
    for (let i = 0; i < steps; i++)
      put("wall", x + dir * (w / 2 + 1.5 + i * 0.62), z, 4.6, 0.55, 6.4, (steps - i - 1) * 0.55, 1.8);
  }

  /* --------------------------------------------- A long: arcade + big gate */
  for (let i = 0; i < 9; i++) {
    const z = 48 - i * 10;
    for (const cx of [43, 62]) {
      acc.wall.addRaw(new THREE.CylinderGeometry(0.85, 0.95, 7.4, 14), cx, 3.7, z, 2.6, vary());
      acc.wall.addRaw(new THREE.CylinderGeometry(1.25, 1.15, 0.6, 14), cx, 7.6, z, 2.2, vary());
      acc.wall.addRaw(new THREE.CylinderGeometry(1.2, 1.3, 0.5, 14), cx, 0.25, z, 2.2, vary());
      box(cx, 3.7, z, 1.9, 7.4, 1.9);
    }
    acc.wall.add(new THREE.BoxGeometry(19, 0.7, 2.4), 52.5, 7.9, z, 2.8, vary());
    // arched spandrel between the columns
    acc.wall.addRaw(archWall(19, 7.4, 0.35, 15.5), 52.5, 0, z, 2.8, vary());
  }
  // gate wall
  put("wall", 52.5, -42, 27, 9.5, 3, 0, 3.4);
  put("wall", 39.5, -42, 3, 9.5, 13, 0, 3.4);
  put("wall", 65.5, -42, 3, 9.5, 13, 0, 3.4);
  acc.wall.addRaw(archWall(27, 12.5, 3, 9), 52.5, 0, -42, 3.4, vary());
  box(39.5, 4.75, -42, 3, 9.5, 13);
  box(65.5, 4.75, -42, 3, 9.5, 13);

  /* ----------------------------------------------- B market: covered lane */
  for (let i = 0; i < 8; i++) {
    const z = 46 - i * 11;
    for (const cx of [-52, -64]) {
      acc.wall.addRaw(new THREE.CylinderGeometry(0.7, 0.8, 5.8, 12), cx, 2.9, z, 2.4, vary());
      box(cx, 2.9, z, 1.6, 5.8, 1.6);
    }
  }
  put("wall", -58, 8, 17, 0.45, 98, 5.8, 3.4, 0, false);
  for (let i = 0; i < 7; i++) {
    const z = 40 - i * 12;
    put("crate", -58, z, 4.2, 1.05, 2.4, 0, 1.3);
    // sagging striped awning: a plane with its verts pulled down
    const g = new THREE.PlaneGeometry(5.4, 3.4, 8, 5);
    const p = g.attributes.position as THREE.BufferAttribute;
    for (let v = 0; v < p.count; v++) {
      const u = (p.getX(v) / 5.4 + 0.5) * Math.PI;
      p.setZ(v, p.getZ(v) - Math.sin(u) * 0.5);
    }
    g.computeVertexNormals();
    acc.cloth.addRaw(g, -58, 3.3, z, 2.2, vary(0.1));
    put("crate", -62.5, z + 3, 1.55, 1.55, 1.55, 0, 1.2);
  }

  /* --------------------------------------------- mid: tiled fountain plaza */
  const fz = 24;
  acc.tile.addRaw(new THREE.CylinderGeometry(6.6, 6.9, 1.1, 40), 0, 0.55, fz, 2.4, vary(0.05));
  acc.tile.addRaw(new THREE.CylinderGeometry(6.2, 6.2, 0.9, 40), 0, 1.5, fz, 2.4, vary(0.05), 0);
  box(0, 0.55, fz, 13, 1.1, 13);
  const water = new THREE.Mesh(
    new THREE.CylinderGeometry(5.9, 5.9, 0.12, 40),
    new THREE.MeshStandardMaterial({ color: 0x2b6b8a, roughness: 0.06, metalness: 0.4 }),
  );
  water.position.set(0, 1.62, fz);
  water.receiveShadow = true;
  scene.add(water);
  // tiered centrepiece
  acc.tile.addRaw(new THREE.CylinderGeometry(0.5, 0.75, 3.6, 20), 0, 3.3, fz, 1.6, vary(0.05));
  acc.tile.addRaw(new THREE.CylinderGeometry(1.7, 1.5, 0.32, 24), 0, 5.1, fz, 1.8, vary(0.05));
  box(0, 3.3, fz, 1.4, 3.6, 1.4);
  for (const sx of [-9.2, 9.2]) {
    acc.tile.add(new THREE.BoxGeometry(0.4, 4.4, 3.2), sx, 2.2, fz, 1.8, vary(0.06));
    acc.wall.add(new THREE.BoxGeometry(0.5, 0.5, 3.6), sx, 4.55, fz, 1.8, vary(0.06));
    box(sx, 2.2, fz, 0.5, 4.4, 3.2);
  }

  /* ------------------------------------------------------ crates + barrels */
  const crateSpots: [number, number, number][] = [
    [-14, 58, 1.9], [-12.2, 58.2, 1.9], [-13.1, 58.1, 1.9],
    [16, 54, 1.9], [18, 54.2, 1.9], [17, 55.9, 1.9],
    [0, 44, 2.3], [3, 44.3, 1.7], [-4, 40, 1.7],
    [8, 30, 1.9], [-8, 30, 1.9], [-30, 46, 2.1], [30, 46, 2.1],
    [-20, -2, 1.9], [20, -2, 1.9], [-20, -46, 2.1], [20, -46, 2.1],
    [48, -30, 1.9], [-50, -30, 1.9], [53, 10, 1.9], [-47, 10, 1.9],
    [0, -20, 2.1], [0, -31, 1.7], [34, 34, 1.9], [-34, 34, 1.9],
  ];
  for (const [x, z, s] of crateSpots) {
    const h = s * 0.82;
    put("crate", x, z, s, h, s, 0, 1.25, (Math.random() - 0.5) * 0.06);
    if (Math.random() < 0.45) put("crate", x + 0.15, z - 0.1, s * 0.78, h * 0.8, s * 0.78, h, 1.2);
    if (Math.random() < 0.25) put("crate", x - 0.2, z + 0.15, s * 0.6, h * 0.6, s * 0.6, h * 1.8, 1.1);
  }

  const barrelMat = std(pbrMetal(), { roughness: 0.55, metalness: 0.5 });
  const hoopMat = new THREE.MeshStandardMaterial({ color: 0x8a7c5e, roughness: 0.4, metalness: 0.7 });
  const barrels: [number, number][] = [
    [12, 50], [-10, 52], [22, 20], [-22, 20], [38, -20], [-38, -20],
    [10, -50], [-10, -50], [56, 40], [-58, -20], [46, -14], [-45, -14],
  ];
  for (const [x, z] of barrels) {
    const b = new THREE.Mesh(new THREE.CylinderGeometry(0.62, 0.62, 1.5, 20), barrelMat);
    b.position.set(x, 0.75, z);
    b.castShadow = b.receiveShadow = true;
    scene.add(b);
    for (const hy of [0.35, 1.15]) {
      const hoop = new THREE.Mesh(new THREE.TorusGeometry(0.635, 0.035, 6, 22), hoopMat);
      hoop.rotation.x = Math.PI / 2;
      hoop.position.set(x, hy, z);
      scene.add(hoop);
    }
    const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.63, 0.63, 0.06, 20), hoopMat);
    cap.position.set(x, 1.52, z);
    scene.add(cap);
    box(x, 0.75, z, 1.25, 1.5, 1.25);
  }

  // sandbag emplacements
  const bagMat = new THREE.MeshStandardMaterial({ color: 0xa89066, roughness: 1 });
  for (const [x, z, rot] of [[6, 48, 0], [-6, 48, 0], [30, -35, 0], [-30, -35, 0], [50, -44, 1.2]] as [number, number, number][]) {
    for (let r = 0; r < 2; r++)
      for (let i = 0; i < 4; i++) {
        const bag = new THREE.Mesh(new THREE.SphereGeometry(0.36, 10, 8), bagMat);
        bag.scale.set(1.5, 0.62, 0.9);
        bag.position.set(x + (i - 1.5) * 0.72 + (r % 2) * 0.34, 0.24 + r * 0.36, z + Math.sin(i * 1.7) * 0.06);
        bag.rotation.set(0.1, rot + i * 0.06, 0.12);
        bag.castShadow = bag.receiveShadow = true;
        scene.add(bag);
      }
    box(x, 0.45, z, 3.0, 0.95, 1.0);
  }

  /* ------------------------------------------------------------ bombsites */
  const sites: [{ x: number; z: number }, string][] = [
    [{ x: 52, z: -58 }, "A"],
    [{ x: -55, z: -56 }, "B"],
  ];
  for (const [s, letter] of sites) {
    const m = new THREE.Mesh(
      new THREE.PlaneGeometry(9.5, 9.5),
      new THREE.MeshStandardMaterial({ map: texSiteMark(letter), transparent: true, roughness: 1 }),
    );
    m.rotation.x = -Math.PI / 2;
    m.position.set(s.x, 0.04, s.z);
    scene.add(m);
    for (let i = 0; i < 5; i++) put("crate", s.x - 4 + i * 2.2, s.z + 6 + (i % 2) * 2, 1.9, 1.55, 1.9, 0, 1.25);
    put("crate", s.x + 5, s.z - 3, 2.3, 1.9, 2.3, 0, 1.3);
    put("crate", s.x + 5.3, s.z - 3.1, 1.8, 1.5, 1.8, 1.9, 1.2);
  }

  /* ------------------------------------------------------ CT north yard */
  put("wall", 0, -68, 34, 4.6, 2, 0, 3);
  for (const sx of [-24, 24]) {
    const b = new THREE.Mesh(new THREE.BoxGeometry(3.2, 2.6, 7.4), barrelMat);
    b.position.set(sx, 1.3, -62);
    b.castShadow = b.receiveShadow = true;
    scene.add(b);
    box(sx, 1.3, -62, 3.2, 2.6, 7.4);
  }
  for (let i = 0; i < 4; i++) put("crate", -8 + i * 5, -60, 1.9, 1.55, 1.9, 0, 1.25);

  /* ------------------------------------------------- archways on the lanes */
  for (const [x, z, rot] of [[0, 40, 0], [0, -6, 0], [38, 24, Math.PI / 2], [-38, 24, Math.PI / 2]] as [number, number, number][]) {
    acc.wall.addRaw(archWall(11, 6.4, 1.6, 5.6), x, 0, z, 3, vary(), rot);
    box(x + (rot ? 0 : -4.2), 3.2, z + (rot ? -4.2 : 0), rot ? 1.6 : 2.6, 6.4, rot ? 2.6 : 1.6);
    box(x + (rot ? 0 : 4.2), 3.2, z + (rot ? 4.2 : 0), rot ? 1.6 : 2.6, 6.4, rot ? 2.6 : 1.6);
  }

  /* ------------------------------------------------------------- palms */
  const trunkMat = new THREE.MeshStandardMaterial({ color: 0x7c5c36, roughness: 1 });
  const frondMat = new THREE.MeshStandardMaterial({ color: 0x5c7f3e, roughness: 0.85, side: THREE.DoubleSide });
  const frondMat2 = new THREE.MeshStandardMaterial({ color: 0x4e6d34, roughness: 0.85, side: THREE.DoubleSide });
  for (const [x, z] of [[-9.5, 31], [9.5, 31], [-10, 17], [10, 17], [34, 57], [-34, 57], [42, -8], [-42, -8], [60, 26]] as [number, number][]) {
    // curved trunk from stacked tapered segments
    let ty = 0;
    let tx = x;
    let tz = z;
    const lean = (Math.random() - 0.5) * 0.1;
    for (let s = 0; s < 6; s++) {
      const seg = new THREE.Mesh(new THREE.CylinderGeometry(0.3 - s * 0.02, 0.34 - s * 0.02, 1.25, 10), trunkMat);
      tx += lean * s * 0.16;
      seg.position.set(tx, ty + 0.62, tz);
      seg.rotation.z = lean * (s + 1) * 0.1;
      seg.castShadow = seg.receiveShadow = true;
      scene.add(seg);
      ty += 1.18;
    }
    const crown = new THREE.Group();
    crown.position.set(tx, ty + 0.2, tz);
    for (let i = 0; i < 9; i++) {
      const a = (i / 9) * Math.PI * 2;
      const g = new THREE.PlaneGeometry(4.8, 0.95, 6, 1);
      const p = g.attributes.position as THREE.BufferAttribute;
      for (let v = 0; v < p.count; v++) {
        const u = p.getX(v) / 4.8 + 0.5;
        p.setY(v, p.getY(v) + Math.pow(u, 2) * -1.5);
      }
      g.computeVertexNormals();
      const leaf = new THREE.Mesh(g, i % 2 ? frondMat : frondMat2);
      leaf.position.set(Math.cos(a) * 2.2, 0.15, Math.sin(a) * 2.2);
      leaf.rotation.set(-0.25, -a, 0);
      leaf.castShadow = true;
      crown.add(leaf);
    }
    scene.add(crown);
    box(x, 3, z, 0.75, 6, 0.75);
  }

  /* -------------------------------------------- distant dunes + minarets */
  const duneMat = new THREE.MeshStandardMaterial({ color: 0xc9a97a, roughness: 1 });
  for (let i = 0; i < 22; i++) {
    const a = (i / 22) * Math.PI * 2;
    const r = 155 + (i % 5) * 48;
    const d = new THREE.Mesh(new THREE.SphereGeometry(40 + (i % 3) * 18, 16, 10), duneMat);
    d.position.set(Math.cos(a) * r, -16 - (i % 3) * 6, Math.sin(a) * r);
    d.scale.y = 0.5;
    scene.add(d);
  }
  for (const [x, z, h] of [[-125, -62, 36], [112, -98, 46], [138, 42, 30], [-145, 38, 40]] as [number, number, number][]) {
    const t = new THREE.Mesh(new THREE.CylinderGeometry(2.2, 3.4, h, 14), duneMat);
    t.position.set(x, h / 2, z);
    scene.add(t);
    const balcony = new THREE.Mesh(new THREE.CylinderGeometry(3.6, 3.2, 2.2, 14), duneMat);
    balcony.position.set(x, h * 0.78, z);
    scene.add(balcony);
    const cap = new THREE.Mesh(new THREE.ConeGeometry(3.4, 6.4, 14), duneMat);
    cap.position.set(x, h + 3, z);
    scene.add(cap);
  }

  /* ------------------------------------------------------- bake scenery */
  const mats: Record<string, THREE.MeshStandardMaterial> = {
    wall: std(pbrWall(), { roughness: 0.95 }),
    crate: std(pbrCrate(), { roughness: 0.85 }),
    tile: std(pbrTile(), { roughness: 0.35, metalness: 0.05 }),
    metal: std(pbrMetal(), { roughness: 0.55, metalness: 0.45 }),
    cloth: std(pbrCloth(), { roughness: 1, side: THREE.DoubleSide }),
  };
  for (const k of Object.keys(acc) as (keyof typeof acc)[]) {
    const mesh = new THREE.Mesh(acc[k].build(), mats[k]);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    scene.add(mesh);
  }

  /* ------------------------------------------------------- dust motes */
  const dustGeo = new THREE.BufferGeometry();
  const dn = 260;
  const dp = new Float32Array(dn * 3);
  for (let i = 0; i < dn; i++) {
    dp[i * 3] = (Math.random() - 0.5) * 60;
    dp[i * 3 + 1] = Math.random() * 9;
    dp[i * 3 + 2] = (Math.random() - 0.5) * 60;
  }
  dustGeo.setAttribute("position", new THREE.BufferAttribute(dp, 3));
  const dust = new THREE.Points(
    dustGeo,
    new THREE.PointsMaterial({ color: 0xfff0d0, size: 0.055, transparent: true, opacity: 0.5, depthWrite: false }),
  );
  dust.frustumCulled = false;
  scene.add(dust);

  return {
    colliders,
    radar,
    playerSpawn: { x: 0, y: 0, z: 62 },
    enemySpawns: [
      { x: 53, y: 0, z: -20 },
      { x: -55, y: 0, z: -12 },
      { x: 0, y: 0, z: -46 },
      { x: 53, y: 0, z: 43 },
      { x: -45, y: 0, z: 44 },
      { x: 20, y: 0, z: -30 },
      { x: -22, y: 0, z: -30 },
      { x: 0, y: 0, z: 16 },
    ],
    waypoints: [
      { x: 0, z: 58 }, { x: 0, z: 36 }, { x: 0, z: 8 }, { x: 0, z: -18 },
      { x: 0, z: -44 }, { x: 0, z: -62 }, { x: 40, z: 34 }, { x: 52, z: 8 },
      { x: 52, z: -24 }, { x: 52, z: -58 }, { x: -52, z: 34 }, { x: -55, z: 4 },
      { x: -55, z: -28 }, { x: -55, z: -56 }, { x: 26, z: 24 }, { x: -26, z: 24 },
      { x: 30, z: -24 }, { x: -30, z: -24 },
    ],
    decalTex: texDecal(),
    softTex: texSoft(),
  };
}


