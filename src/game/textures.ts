import * as THREE from "three";

/* ============================================================================
 * Material system.
 *
 * Every surface gets three maps: a photographed scan (with a hand-painted
 * canvas fallback), a Sobel-derived normal map so plaster grain, wood knots
 * and tile glaze actually catch the light, and a roughness map so speculars
 * break up instead of looking like plastic.
 * ========================================================================== */

const cache = new Map<string, PbrSet>();

export interface PbrSet {
  map: THREE.Texture;
  normalMap: THREE.Texture;
  roughnessMap: THREE.Texture;
}

function paint(size: number, fn: (c: CanvasRenderingContext2D, s: number) => void, url?: string) {
  const cv = document.createElement("canvas");
  cv.width = cv.height = size;
  const ctx = cv.getContext("2d")!;
  fn(ctx, size);
  const tex = new THREE.CanvasTexture(cv);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 16;
  if (url) {
    const img = new Image();
    img.onload = () => {
      ctx.drawImage(img, 0, 0, size, size);
      tex.needsUpdate = true;
    };
    img.src = url;
  }
  return { cv, ctx, tex };
}

/** Sobel the luminance of an already-painted canvas into a tangent-space normal map. */
function normalFrom(cv: HTMLCanvasElement, size: number, strength: number) {
  const src = cv.getContext("2d")!.getImageData(0, 0, size, size).data;
  const out = document.createElement("canvas");
  out.width = out.height = size;
  const octx = out.getContext("2d")!;
  const img = octx.createImageData(size, size);
  const lum = new Float32Array(size * size);
  for (let i = 0; i < size * size; i++) {
    lum[i] = (src[i * 4] * 0.299 + src[i * 4 + 1] * 0.587 + src[i * 4 + 2] * 0.114) / 255;
  }
  const at = (x: number, y: number) => lum[((y + size) % size) * size + ((x + size) % size)];
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const gx =
        at(x - 1, y - 1) + 2 * at(x - 1, y) + at(x - 1, y + 1) - at(x + 1, y - 1) - 2 * at(x + 1, y) - at(x + 1, y + 1);
      const gy =
        at(x - 1, y - 1) + 2 * at(x, y - 1) + at(x + 1, y - 1) - at(x - 1, y + 1) - 2 * at(x, y + 1) - at(x + 1, y + 1);
      let nx = gx * strength;
      let ny = gy * strength;
      const nz = 1;
      const l = Math.hypot(nx, ny, nz);
      nx /= l;
      ny /= l;
      const i = (y * size + x) * 4;
      img.data[i] = (nx * 0.5 + 0.5) * 255;
      img.data[i + 1] = (ny * 0.5 + 0.5) * 255;
      img.data[i + 2] = (nz / l) * 0.5 * 255 + 127;
      img.data[i + 3] = 255;
    }
  }
  octx.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(out);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 16;
  return t;
}

/** soft blotchy roughness so highlights never look uniform */
function roughFrom(size: number, lo: number, hi: number, blotch = 8) {
  const cv = document.createElement("canvas");
  cv.width = cv.height = size;
  const c = cv.getContext("2d")!;
  const mid = Math.round(((lo + hi) / 2) * 255);
  c.fillStyle = `rgb(${mid},${mid},${mid})`;
  c.fillRect(0, 0, size, size);
  for (let i = 0; i < 1100; i++) {
    const x = Math.random() * size;
    const y = Math.random() * size;
    const r = 4 + Math.random() * blotch * 4;
    const v = Math.round((lo + Math.random() * (hi - lo)) * 255);
    const gr = c.createRadialGradient(x, y, 0, x, y, r);
    gr.addColorStop(0, `rgba(${v},${v},${v},0.5)`);
    gr.addColorStop(1, "rgba(0,0,0,0)");
    c.fillStyle = gr;
    c.beginPath();
    c.arc(x, y, r, 0, Math.PI * 2);
    c.fill();
  }
  // fine grain so speculars shimmer
  for (let i = 0; i < 4000; i++) {
    const v = Math.round((lo + Math.random() * (hi - lo)) * 255);
    c.fillStyle = `rgba(${v},${v},${v},0.3)`;
    c.fillRect(Math.random() * size, Math.random() * size, 2, 2);
  }
  const t = new THREE.CanvasTexture(cv);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(blotch, blotch);
  return t;
}

function pbr(
  key: string,
  size: number,
  fn: (c: CanvasRenderingContext2D, s: number) => void,
  url: string | undefined,
  strength: number,
  rlo: number,
  rhi: number,
): PbrSet {
  const hit = cache.get(key);
  if (hit) return hit;
  const { cv, tex } = paint(size, fn, url);
  const set: PbrSet = { map: tex, normalMap: normalFrom(cv, size, strength), roughnessMap: roughFrom(256, rlo, rhi) };
  cache.set(key, set);
  return set;
}

export const pbrWall = () =>
  pbr("wall", 2048, (c, s) => {
    c.fillStyle = "#C9A97A";
    c.fillRect(0, 0, s, s);
    for (let i = 0; i < 2600; i++) {
      c.fillStyle = `rgba(${150 + Math.random() * 90},${120 + Math.random() * 70},${80 + Math.random() * 50},0.4)`;
      c.beginPath();
      c.arc(Math.random() * s, Math.random() * s, Math.random() * 7 + 1, 0, Math.PI * 2);
      c.fill();
    }
    c.strokeStyle = "rgba(104,80,52,0.5)";
    c.lineWidth = 5;
    for (let y = 0; y < s; y += s / 4) {
      c.beginPath();
      c.moveTo(0, y + Math.random() * 6);
      c.lineTo(s, y + Math.random() * 6);
      c.stroke();
    }
  }, "images/tex_wall.jpg", 2.6, 0.72, 0.98);

export const pbrGround = () =>
  pbr("ground", 1024, (c, s) => {
    c.fillStyle = "#D9BD8B";
    c.fillRect(0, 0, s, s);
    for (let i = 0; i < 5000; i++) {
      const g = Math.random() * 60;
      c.fillStyle = `rgba(${190 + g},${165 + g},${120 + g},0.55)`;
      c.beginPath();
      c.arc(Math.random() * s, Math.random() * s, Math.random() * 4 + 0.6, 0, Math.PI * 2);
      c.fill();
    }
    for (let i = 0; i < 240; i++) {
      c.fillStyle = `rgba(${120 + Math.random() * 50},${110 + Math.random() * 40},${95 + Math.random() * 30},0.8)`;
      c.beginPath();
      c.ellipse(Math.random() * s, Math.random() * s, Math.random() * 5 + 2, Math.random() * 3 + 1, Math.random() * 3, 0, Math.PI * 2);
      c.fill();
    }
  }, "images/tex_ground.jpg", 2.2, 0.86, 1.0);

export const pbrCrate = () =>
  pbr("crate", 512, (c, s) => {
    c.fillStyle = "#8F6238";
    c.fillRect(0, 0, s, s);
    const rows = 5;
    for (let r = 0; r < rows; r++) {
      const y = (r * s) / rows;
      const shade = 0.86 + Math.random() * 0.26;
      c.fillStyle = `rgb(${Math.min(255, 150 * shade)},${Math.min(255, 102 * shade)},${Math.min(255, 58 * shade)})`;
      c.fillRect(0, y + 2, s, s / rows - 4);
      // grain
      c.strokeStyle = "rgba(70,44,20,0.28)";
      c.lineWidth = 1.2;
      for (let i = 0; i < 22; i++) {
        const gy = y + Math.random() * (s / rows);
        c.beginPath();
        c.moveTo(0, gy);
        c.bezierCurveTo(s * 0.3, gy + Math.random() * 4 - 2, s * 0.7, gy + Math.random() * 4 - 2, s, gy);
        c.stroke();
      }
    }
    // frame slats
    c.strokeStyle = "rgba(58,36,16,0.85)";
    c.lineWidth = 10;
    c.strokeRect(5, 5, s - 10, s - 10);
    c.lineWidth = 7;
    c.beginPath();
    c.moveTo(8, 8);
    c.lineTo(s - 8, s - 8);
    c.moveTo(s - 8, 8);
    c.lineTo(8, s - 8);
    c.stroke();
  }, "images/tex_crate.jpg", 3.4, 0.68, 0.95);

export const pbrTile = () =>
  pbr("tile", 512, (c, s) => {
    c.fillStyle = "#EDE1C8";
    c.fillRect(0, 0, s, s);
    const u = s / 4;
    for (let y = 0; y < 4; y++)
      for (let x = 0; x < 4; x++) {
        const dark = (x + y) % 2 === 0;
        c.fillStyle = dark ? "#2C6C8C" : "#3B84A4";
        c.save();
        c.translate(x * u + u / 2, y * u + u / 2);
        c.rotate(Math.PI / 4);
        const r = u * 0.4;
        c.beginPath();
        for (let i = 0; i < 4; i++) {
          const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
          c[i ? "lineTo" : "moveTo"](Math.cos(a) * r, Math.sin(a) * r);
        }
        c.closePath();
        c.fill();
        c.restore();
      }
    c.strokeStyle = "rgba(214,202,176,0.9)";
    c.lineWidth = 3;
    for (let i = 0; i <= 4; i++) {
      c.beginPath();
      c.moveTo(i * u, 0);
      c.lineTo(i * u, s);
      c.moveTo(0, i * u);
      c.lineTo(s, i * u);
      c.stroke();
    }
  }, "images/tex_tile.jpg", 1.5, 0.12, 0.42);

export const pbrMetal = () =>
  pbr("metal", 512, (c, s) => {
    c.fillStyle = "#4A5145";
    c.fillRect(0, 0, s, s);
    for (let i = 0; i < 1400; i++) {
      c.fillStyle = `rgba(${90 + Math.random() * 70},${95 + Math.random() * 65},${80 + Math.random() * 55},0.35)`;
      c.fillRect(Math.random() * s, Math.random() * s, Math.random() * 26 + 4, 1.6);
    }
    // rust blooms
    for (let i = 0; i < 60; i++) {
      const x = Math.random() * s;
      const y = Math.random() * s;
      const r = 6 + Math.random() * 22;
      const g = c.createRadialGradient(x, y, 0, x, y, r);
      g.addColorStop(0, "rgba(122,62,26,0.75)");
      g.addColorStop(1, "rgba(122,62,26,0)");
      c.fillStyle = g;
      c.beginPath();
      c.arc(x, y, r, 0, Math.PI * 2);
      c.fill();
    }
  }, undefined, 2.0, 0.32, 0.78);

export const pbrCloth = () =>
  pbr("cloth", 512, (c, s) => {
    for (let i = 0; i < 10; i++) {
      c.fillStyle = i % 2 ? "#DCD0AE" : "#B23F2E";
      c.fillRect((i * s) / 10, 0, s / 10, s);
    }
    for (let i = 0; i < 4000; i++) {
      c.fillStyle = `rgba(60,45,25,${Math.random() * 0.12})`;
      c.fillRect(Math.random() * s, Math.random() * s, 2, 2);
    }
  }, undefined, 1.1, 0.85, 1.0);

export function std(
  set: PbrSet,
  o: { roughness?: number; metalness?: number; color?: number; side?: THREE.Side; repeat?: number } = {},
) {
  const m = new THREE.MeshStandardMaterial({
    map: set.map,
    normalMap: set.normalMap,
    roughnessMap: set.roughnessMap,
    roughness: o.roughness ?? 1,
    metalness: o.metalness ?? 0,
    color: o.color ?? 0xffffff,
    side: o.side ?? THREE.FrontSide,
  });
  if (o.repeat) {
    m.map = m.map!.clone();
    m.normalMap = m.normalMap!.clone();
    m.roughnessMap = m.roughnessMap!.clone();
    for (const t of [m.map, m.normalMap, m.roughnessMap]) {
      t!.repeat.set(o.repeat, o.repeat);
      t!.needsUpdate = true;
    }
  }
  m.normalScale.set(1.1, 1.1);
  return m;
}

/* ------------------------------------------------------------------ decals */
function simple(size: number, fn: (c: CanvasRenderingContext2D, s: number) => void) {
  const cv = document.createElement("canvas");
  cv.width = cv.height = size;
  fn(cv.getContext("2d")!, size);
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export const texDecal = () =>
  simple(128, (c, s) => {
    c.clearRect(0, 0, s, s);
    const g = c.createRadialGradient(s / 2, s / 2, 1, s / 2, s / 2, s / 2);
    g.addColorStop(0, "rgba(10,7,4,0.95)");
    g.addColorStop(0.3, "rgba(24,17,10,0.85)");
    g.addColorStop(0.45, "rgba(190,168,124,0.4)");
    g.addColorStop(1, "rgba(0,0,0,0)");
    c.fillStyle = g;
    c.fillRect(0, 0, s, s);
    c.strokeStyle = "rgba(18,12,7,0.55)";
    c.lineWidth = 2;
    for (let i = 0; i < 7; i++) {
      const a = Math.random() * Math.PI * 2;
      c.beginPath();
      c.moveTo(s / 2, s / 2);
      c.lineTo(s / 2 + Math.cos(a) * s * 0.44, s / 2 + Math.sin(a) * s * 0.44);
      c.stroke();
    }
  });

export const texSoft = () =>
  simple(128, (c, s) => {
    const g = c.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
    g.addColorStop(0, "rgba(255,255,255,1)");
    g.addColorStop(0.35, "rgba(255,255,255,0.5)");
    g.addColorStop(1, "rgba(255,255,255,0)");
    c.fillStyle = g;
    c.fillRect(0, 0, s, s);
  });

export const texSiteMark = (letter: string) =>
  simple(256, (c, s) => {
    c.clearRect(0, 0, s, s);
    c.strokeStyle = "rgba(232,178,42,0.9)";
    c.lineWidth = 11;
    c.strokeRect(16, 16, s - 32, s - 32);
    c.fillStyle = "rgba(232,178,42,0.9)";
    c.font = "bold 154px Rajdhani, sans-serif";
    c.textAlign = "center";
    c.textBaseline = "middle";
    c.fillText(letter, s / 2, s / 2 + 10);
  });

export const texSky = () => {
  const t = simple(1024, (c, s) => {
    const g = c.createLinearGradient(0, 0, 0, s);
    g.addColorStop(0, "#6E9FCB");
    g.addColorStop(0.4, "#A9C3D6");
    g.addColorStop(0.62, "#DCD6BE");
    g.addColorStop(0.78, "#E7D3AC");
    g.addColorStop(1, "#D2B486");
    c.fillStyle = g;
    c.fillRect(0, 0, s, s);
    // haze bands
    for (let i = 0; i < 40; i++) {
      const y = s * 0.45 + Math.random() * s * 0.5;
      c.fillStyle = `rgba(255,246,226,${Math.random() * 0.06})`;
      c.fillRect(0, y, s, 2 + Math.random() * 12);
    }
  });
  t.wrapS = THREE.ClampToEdgeWrapping;
  t.wrapT = THREE.ClampToEdgeWrapping;
  return t;
};
