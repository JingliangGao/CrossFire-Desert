import * as THREE from "three";

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
