import * as THREE from 'three';
import { fbm2, noise2, smooth, mulberry32, lerp } from './noise.js';
import { LAKE, CITY, GRAVE, FOREST } from './config.js';
import { shared } from './sky.js';

// ============================================================
// 地形：起伏的丘陵、环绕的远山、湖盆、被压平的城市和墓地
// heightAt() 同时用于渲染与碰撞，保证脚踩在看得见的地面上
// ============================================================

function rectWeight(x, z, R, feather) {
  const dx = Math.max(R.minX - x, 0, x - R.maxX);
  const dz = Math.max(R.minZ - z, 0, z - R.maxZ);
  return 1 - smooth(0, feather, Math.hypot(dx, dz));
}

export function lakeRadiusAt(x, z) {
  const a = Math.atan2(z - LAKE.z, x - LAKE.x);
  return LAKE.r + 3 + noise2(Math.cos(a) * 1.6 + 5, Math.sin(a) * 1.6 + 2) * 4;
}

export function heightAt(x, z) {
  let h = 2.2 + fbm2(x * 0.0042, z * 0.0042, 4) * 9 + noise2(x * 0.03, z * 0.03) * 0.7;

  // 环绕的远山
  const r = Math.hypot(x * 0.92, (z + 60) * 0.85);
  const ring = smooth(470, 760, r);
  h += ring * (60 + (fbm2(x * 0.0036 + 7.3, z * 0.0036 - 2.1, 5) + 0.5) * 150);

  // 城市：平地
  const wc = rectWeight(x, z, CITY, 45);
  h = lerp(h, 0.12, wc);

  // 墓地与通往湖边的小路：平缓
  const wg = 1 - smooth(70, 150, Math.hypot(x - GRAVE.x, (z - GRAVE.z) * 0.85));
  const corridor = (1 - smooth(20, 60, Math.abs(x))) * smooth(130, 170, z) * (1 - smooth(300, 340, z));
  const flatW = Math.max(wg, corridor);
  h = lerp(h, 1.0 + noise2(x * 0.04, z * 0.04) * 0.5, flatW * 0.85);

  // 森林：缓坡
  const wf = rectWeight(x, z, FOREST, 60);
  h = lerp(h, h * 0.5 + 1.5, wf * 0.6);

  // 湖盆
  const dl = Math.hypot(x - LAKE.x, z - LAKE.z);
  if (dl < LAKE.r + 90) {
    const rr = lakeRadiusAt(x, z);
    const nearLake = 1 - smooth(rr + 10, rr + 80, dl);
    h = Math.max(h, lerp(h, 0.9, nearLake));
    const shore = smooth(rr - 16, rr + 2, dl);
    h = lerp(-5.5 + noise2(x * 0.05, z * 0.05) * 0.8, h, shore);
  }
  return h;
}

// 草地 / 路 / 泥岸 / 岩石 的颜色（线性空间）
const COL = {
  grassA: new THREE.Color(0x1e3326), grassB: new THREE.Color(0x2a4230), grassC: new THREE.Color(0x1a2e2c),
  dirt: new THREE.Color(0x3e3224), mud: new THREE.Color(0x2c2820), lakebed: new THREE.Color(0x0b1418),
  asphalt: new THREE.Color(0x1a1b20), rock: new THREE.Color(0x2a2d36), snow: new THREE.Color(0x9aa6c4),
  forest: new THREE.Color(0x15261c), grave: new THREE.Color(0x222e22),
};

function colorAt(x, z, h, slope, out) {
  const n = noise2(x * 0.02, z * 0.02) * 0.5 + 0.5;
  const n2 = noise2(x * 0.11 + 9, z * 0.11) * 0.5 + 0.5;
  out.copy(COL.grassA).lerp(COL.grassB, n).lerp(COL.grassC, n2 * 0.5);

  const wg = 1 - smooth(60, 110, Math.hypot(x - GRAVE.x, (z - GRAVE.z) * 0.85));
  out.lerp(COL.grave, wg * 0.6);
  // 墓地中间的土路，一直通到湖边
  const path = (1 - smooth(2.5, 5.5, Math.abs(x + Math.sin(z * 0.03) * 3))) * smooth(150, 175, z) * (1 - smooth(345, 355, z));
  out.lerp(COL.dirt, path * (0.7 + n2 * 0.3));

  const wf = rectWeight(x, z, FOREST, 30);
  out.lerp(COL.forest, wf * 0.8);

  const dl = Math.hypot(x - LAKE.x, z - LAKE.z);
  if (dl < LAKE.r + 30) {
    const rr = lakeRadiusAt(x, z);
    out.lerp(COL.mud, 1 - smooth(rr - 2, rr + 7, dl));
    out.lerp(COL.lakebed, 1 - smooth(rr - 12, rr - 3, dl));
  }
  const wc = rectWeight(x, z, CITY, 12);
  out.lerp(COL.asphalt, wc);

  const rock = smooth(0.45, 0.8, slope) + smooth(60, 110, h) * 0.6;
  out.lerp(COL.rock, Math.min(1, rock));
  out.lerp(COL.snow, smooth(150, 200, h + n * 25) * (1 - smooth(0.7, 0.95, slope)));
  return out;
}

// 细节噪声贴图（按世界坐标采样，避免拉伸）
function makeDetailTexture() {
  const s = 256, c = document.createElement('canvas'); c.width = c.height = s;
  const g = c.getContext('2d');
  const img = g.createImageData(s, s);
  const r = mulberry32(99);
  for (let i = 0; i < s * s; i++) {
    const x = i % s, y = (i / s) | 0;
    const v = 150 + noise2(x * 0.08, y * 0.08) * 40 + noise2(x * 0.3, y * 0.3) * 25 + (r() - 0.5) * 40;
    img.data[i * 4] = img.data[i * 4 + 1] = img.data[i * 4 + 2] = Math.max(0, Math.min(255, v));
    img.data[i * 4 + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

export function createTerrain() {
  // 非均匀网格：游戏区域密（约 2 米），远山稀疏
  const N = 420, C1 = 430, C2 = 1150, CZ = -60;
  const geo = new THREE.PlaneGeometry(1, 1, N, N);
  geo.rotateX(-Math.PI / 2);
  const pos = geo.attributes.position;
  const warp = s => s * (C1 + C2 * s * s * s * s);
  for (let i = 0; i < pos.count; i++) {
    const x = warp(pos.getX(i) * 2), z = warp(pos.getZ(i) * 2) + CZ;
    pos.setXYZ(i, x, heightAt(x, z), z);
  }
  geo.computeVertexNormals();
  const nor = geo.attributes.normal;
  const colors = new Float32Array(pos.count * 3);
  const tmp = new THREE.Color();
  for (let i = 0; i < pos.count; i++) {
    const slope = 1 - nor.getY(i);
    colorAt(pos.getX(i), pos.getZ(i), pos.getY(i), slope, tmp);
    colors[i * 3] = tmp.r; colors[i * 3 + 1] = tmp.g; colors[i * 3 + 2] = tmp.b;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));

  const detail = makeDetailTexture();
  const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.96, metalness: 0 });
  mat.onBeforeCompile = (sh) => {
    sh.uniforms.uDetail = { value: detail };
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vWPos;')
      .replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\nvWPos = (modelMatrix * vec4(transformed, 1.0)).xyz;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vWPos;\nuniform sampler2D uDetail;')
      .replace('#include <color_fragment>', `#include <color_fragment>
        float dt = texture2D(uDetail, vWPos.xz * 0.11).r * 0.6 + texture2D(uDetail, vWPos.xz * 0.013).r * 0.8;
        diffuseColor.rgb *= 0.35 + dt * 0.75;`);
  };
  const mesh = new THREE.Mesh(geo, mat);
  mesh.receiveShadow = true;
  return mesh;
}

// ------------------------------------------------------------
// 草：几万根会随风摆动的草叶
// ------------------------------------------------------------
export function createGrass() {
  const r = mulberry32(4242);
  // 一簇草 = 6 根草叶，每根 4 段三角带，底宽顶尖
  const verts = [], uvs = [], idx = [], bc = [];
  for (let k = 0; k < 6; k++) {
    const a = r() * Math.PI, ox = (r() - 0.5) * 0.5, oz = (r() - 0.5) * 0.5;
    const hk = 0.6 + r() * 0.7, lean = (r() - 0.5) * 0.5;
    const ca = Math.cos(a), sa = Math.sin(a);
    const base = verts.length / 3;
    for (let i = 0; i <= 4; i++) {
      const t = i / 4, w = 0.045 * (1 - t * 0.92), y = t * hk, l = lean * t * t;
      verts.push(ox - w * ca + l * sa, y, oz - w * sa - l * ca, ox + w * ca + l * sa, y, oz + w * sa - l * ca);
      uvs.push(0, t, 1, t);
      const c = 0.3 + t * t * 1.2;
      bc.push(c * 0.9, c, c * 0.95, c * 0.9, c, c * 0.95);
      if (i < 4) { const q = base + i * 2; idx.push(q, q + 1, q + 2, q + 1, q + 3, q + 2); }
    }
  }
  const blade = new THREE.BufferGeometry();
  blade.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
  blade.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  blade.setAttribute('color', new THREE.Float32BufferAttribute(bc, 3));
  blade.setIndex(idx);
  blade.computeVertexNormals();
  // 草叶法线朝上，月光下才会有一层柔和的高光
  { const n = blade.attributes.normal; for (let i = 0; i < n.count; i++) n.setXYZ(i, n.getX(i) * 0.3, 1, n.getZ(i) * 0.3); }

  const spots = [];
  const tryAdd = (x, z) => {
    const dl = Math.hypot(x - LAKE.x, z - LAKE.z);
    if (dl < lakeRadiusAt(x, z) + 1.5) return;
    if (rectWeight(x, z, CITY, 0) > 0.5) return;
    if (Math.abs(x + Math.sin(z * 0.03) * 3) < 3.2 && z > 150 && z < 350) return; // 土路
    spots.push([x, heightAt(x, z), z]);
  };
  const COUNT = 36000;
  for (let i = 0; spots.length < COUNT && i < COUNT * 3; i++) {
    const k = r();
    if (k < 0.5) { // 墓地和小路周围
      tryAdd(GRAVE.x + (r() - 0.5) * 240, GRAVE.z + (r() - 0.5) * 200 - 30);
    } else { // 湖岸
      const a = r() * Math.PI * 2, d = LAKE.r + 2 + Math.pow(r(), 1.6) * 75;
      tryAdd(LAKE.x + Math.cos(a) * d, LAKE.z + Math.sin(a) * d);
    }
  }

  const mat = new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide });
  mat.onBeforeCompile = (sh) => {
    sh.uniforms.uTime = shared.uTime;
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nuniform float uTime;')
      .replace('#include <project_vertex>', `
        vec4 mvPosition = vec4(transformed, 1.0);
        #ifdef USE_INSTANCING
          mvPosition = instanceMatrix * mvPosition;
        #endif
        vec2 base = instanceMatrix[3].xz;
        float wave = sin(uTime * 1.7 + base.x * 0.13 + base.y * 0.09) + 0.5 * sin(uTime * 3.1 + base.x * 0.4);
        float bend = uv.y * uv.y;
        mvPosition.x += (0.12 + wave * 0.12) * bend;
        mvPosition.z += (0.05 + wave * 0.06) * bend;
        mvPosition = modelViewMatrix * mvPosition;
        gl_Position = projectionMatrix * mvPosition;`);
  };
  const mesh = new THREE.InstancedMesh(blade, mat, spots.length);
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), p = new THREE.Vector3(), e = new THREE.Euler();
  const col = new THREE.Color();
  spots.forEach((sp, i) => {
    e.set((r() - 0.5) * 0.3, r() * Math.PI, (r() - 0.5) * 0.3);
    q.setFromEuler(e);
    const hgt = 0.45 + r() * 0.5;
    const wid = 0.8 + r() * 0.6;
    s.set(wid, hgt, wid);
    p.set(sp[0], sp[1] - 0.05, sp[2]);
    m.compose(p, q, s);
    mesh.setMatrixAt(i, m);
    col.setHSL(0.28 + r() * 0.14, 0.3, 0.16 + r() * 0.1);
    mesh.setColorAt(i, col);
  });
  mesh.frustumCulled = false;
  return mesh;
}

// ------------------------------------------------------------
// 湖边：芦苇、会发光的梦之花、睡莲
// ------------------------------------------------------------
export function createLakeFlora() {
  const group = new THREE.Group();
  const r = mulberry32(777);

  // 芦苇
  const reedGeo = new THREE.CylinderGeometry(0.02, 0.035, 1, 4, 1);
  reedGeo.translate(0, 0.5, 0);
  const reedMat = new THREE.MeshLambertMaterial({ color: 0x2a3524 });
  const reedN = 900;
  const reeds = new THREE.InstancedMesh(reedGeo, reedMat, reedN);
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), p = new THREE.Vector3(), e = new THREE.Euler();
  let n = 0;
  for (let i = 0; i < reedN * 4 && n < reedN; i++) {
    const a = r() * Math.PI * 2;
    const x0 = LAKE.x + Math.cos(a), z0 = LAKE.z + Math.sin(a);
    const rr = lakeRadiusAt(x0, z0);
    const d = rr - 4 + r() * 5;
    const x = LAKE.x + Math.cos(a) * d, z = LAKE.z + Math.sin(a) * d;
    if (x > -8 && x < 8 && z > 150) continue; // 给入水口留开
    const hy = heightAt(x, z);
    e.set((r() - 0.5) * 0.25, r() * 6, (r() - 0.5) * 0.25);
    q.setFromEuler(e);
    s.set(1, 1.2 + r() * 1.6, 1);
    p.set(x, Math.min(hy, 0) - 0.1, z);
    m.compose(p, q, s);
    reeds.setMatrixAt(n++, m);
  }
  reeds.count = n;
  group.add(reeds);

  // 梦之花：岸边微微发光的花
  const stemGeo = new THREE.CylinderGeometry(0.012, 0.018, 0.5, 3); stemGeo.translate(0, 0.25, 0);
  const bloomGeo = new THREE.SphereGeometry(0.07, 8, 6); bloomGeo.scale(1, 0.7, 1); bloomGeo.translate(0, 0.52, 0);
  const flowerN = 520;
  const stems = new THREE.InstancedMesh(stemGeo, new THREE.MeshLambertMaterial({ color: 0x1f3a26 }), flowerN);
  const bloomMat = new THREE.MeshBasicMaterial({ color: 0xffffff, toneMapped: true });
  const blooms = new THREE.InstancedMesh(bloomGeo, bloomMat, flowerN);
  const palette = [new THREE.Color(0.4, 1.6, 2.2), new THREE.Color(1.4, 0.7, 2.4), new THREE.Color(0.6, 2.0, 1.4), new THREE.Color(2.2, 1.2, 1.8)];
  const flowerPos = [];
  for (let i = 0; i < flowerN; i++) {
    const a = r() * Math.PI * 2;
    const x0 = LAKE.x + Math.cos(a), z0 = LAKE.z + Math.sin(a);
    const d = lakeRadiusAt(x0, z0) + 0.5 + Math.pow(r(), 2) * 14;
    const x = LAKE.x + Math.cos(a) * d, z = LAKE.z + Math.sin(a) * d;
    const y = heightAt(x, z);
    const sc = 0.7 + r() * 0.8;
    m.compose(p.set(x, y, z), q.setFromEuler(e.set((r() - 0.5) * 0.4, r() * 6, (r() - 0.5) * 0.4)), s.set(sc, sc, sc));
    stems.setMatrixAt(i, m);
    blooms.setMatrixAt(i, m);
    blooms.setColorAt(i, palette[(r() * palette.length) | 0].clone().multiplyScalar(0.25 + r() * 0.35));
    flowerPos.push(new THREE.Vector3(x, y + 0.5 * sc, z));
  }
  group.add(stems, blooms);

  // 睡莲叶与几朵发光的莲花
  const padShape = new THREE.Shape();
  padShape.absarc(0, 0, 1, 0.25, Math.PI * 2 - 0.05, false);
  padShape.lineTo(0, 0);
  const padGeo = new THREE.ShapeGeometry(padShape, 16);
  padGeo.rotateX(-Math.PI / 2);
  const padN = 140;
  const pads = new THREE.InstancedMesh(padGeo, new THREE.MeshStandardMaterial({ color: 0x173a22, roughness: 0.5, side: THREE.DoubleSide }), padN);
  const lotusGeo = new THREE.ConeGeometry(0.22, 0.28, 7, 1, true); lotusGeo.rotateX(Math.PI); lotusGeo.translate(0, 0.16, 0);
  const lotusN = 26;
  const lotus = new THREE.InstancedMesh(lotusGeo, new THREE.MeshBasicMaterial({ color: 0xffffff, side: THREE.DoubleSide }), lotusN);
  let li = 0, pi = 0;
  for (let i = 0; i < padN; i++) {
    const a = r() * Math.PI * 2, d = LAKE.r * (0.35 + Math.sqrt(r()) * 0.55);
    const x = LAKE.x + Math.cos(a) * d, z = LAKE.z + Math.sin(a) * d;
    if (Math.abs(x) < 7 && z > LAKE.z) { continue; }
    const sc = 0.5 + r() * 0.7;
    m.compose(p.set(x, 0.03, z), q.setFromEuler(e.set(0, r() * 6, 0)), s.set(sc, 1, sc));
    pads.setMatrixAt(pi++, m);
    if (li < lotusN && r() < 0.25) {
      m.compose(p.set(x + 0.2, 0.03, z), q.setFromEuler(e.set(0, r() * 6, 0)), s.set(1, 1, 1));
      lotus.setMatrixAt(li, m);
      lotus.setColorAt(li, new THREE.Color(2.4, 1.1, 1.9).multiplyScalar(0.3 + r() * 0.3));
      li++;
    }
  }
  pads.count = pi;
  lotus.count = li;
  group.add(pads, lotus);

  return { group, flowerPos };
}

export { rectWeight };
