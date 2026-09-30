import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { mulberry32, noise2 } from './noise.js';
import { FOREST, LAKE, CITY, GRAVE, WORLD_R } from './config.js';
import { heightAt, lakeRadiusAt, rectWeight } from './terrain.js';
import { shared } from './sky.js';

// ============================================================
// 森林：几十棵比城市还高的巨杉，树尖刺破下方的林海——梦里就是在这些树尖之间跳跃
// 树会随风轻轻摇摆；站在树尖上的人也跟着摇
// ============================================================

const SWAY_AMP = 0.006; // 以树高为单位

// 与着色器里完全一致的摇摆函数（用于让站在树尖上的玩家跟着晃）
export function swayOffset(x, z, t, out) {
  const ph = x * 0.05 + z * 0.037;
  out.x = (Math.sin(t * 0.7 + ph) + 0.4 * Math.sin(t * 1.9 + ph * 2.0)) * SWAY_AMP;
  out.z = (Math.cos(t * 0.6 + ph * 1.3) + 0.4 * Math.sin(t * 1.7 + ph)) * SWAY_AMP;
  return out;
}

function colorize(geo, fn) {
  const pos = geo.attributes.position, c = new Float32Array(pos.count * 3), col = new THREE.Color();
  for (let i = 0; i < pos.count; i++) {
    fn(pos.getX(i), pos.getY(i), pos.getZ(i), col);
    c[i * 3] = col.r; c[i * 3 + 1] = col.g; c[i * 3 + 2] = col.b;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(c, 3));
  return geo;
}

// 单位高度（0→1）的针叶树
// 结构：树干 0→crownTop，枝层都在 crownTop 以下，最顶上一根细长的树尖正好到 y=1（人就站在这里）
function coniferGeometry(seed, { layers = 14, radius = 0.15, radial = 12, trunkR = 0.02, droop = 0.4, jag = 0.28, start = 0.22, crownTop = 0.92 } = {}) {
  const r = mulberry32(seed);
  const parts = [];
  const trunk = new THREE.CylinderGeometry(trunkR * 0.08, trunkR, crownTop, 8, 6);
  trunk.translate(0, crownTop / 2, 0);
  {
    const p = trunk.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i), y = p.getY(i), z = p.getZ(i), a = Math.atan2(z, x);
      const k = 1 + 0.12 * Math.sin(a * 7 + y * 40) + (y < 0.06 ? (0.06 - y) * 8 : 0);
      p.setXYZ(i, x * k, y, z * k);
    }
  }
  trunk.computeVertexNormals();
  colorize(trunk, (x, y, z, c) => c.setRGB(0.07, 0.045, 0.03).multiplyScalar(0.7 + 0.3 * Math.sin(Math.atan2(z, x) * 9)));
  parts.push(trunk);

  const s1 = r() * 10, s2 = r() * 10;
  for (let i = 0; i < layers; i++) {
    const t = i / (layers - 1);
    const y0 = start + t * (crownTop - 0.07 - start);
    const R = radius * Math.pow(1 - t, 0.8) * (0.85 + r() * 0.3) + 0.012;
    const H = Math.min((0.1 + 0.05 * (1 - t)) * (0.9 + r() * 0.2), crownTop - y0);
    const g = new THREE.ConeGeometry(R, H, radial, 3, false);
    const p = g.attributes.position;
    const rot = r() * Math.PI * 2;
    const hue = r();
    for (let k = 0; k < p.count; k++) {
      let x = p.getX(k), y = p.getY(k), z = p.getZ(k);
      const d = Math.hypot(x, z);
      if (d > 1e-5) {
        const a = Math.atan2(z, x) + rot;
        const f = 1 + jag * (0.6 * Math.sin(a * 5 + s1 + i) + 0.4 * Math.sin(a * 9 + s2 - i));
        x *= f; z *= f;
        const dn = d / R;
        y -= droop * H * dn * dn * f;
      }
      p.setXYZ(k, x, y, z);
    }
    g.computeVertexNormals();
    g.translate(0, y0 + H * 0.5, 0);
    colorize(g, (x, y, z, c) => {
      const dn = Math.min(1, Math.hypot(x, z) / (R * 1.2));
      const inner = new THREE.Color(0.012, 0.03, 0.022);
      const tip = new THREE.Color(0.05, 0.12 + hue * 0.03, 0.08 + hue * 0.04);
      c.copy(inner).lerp(tip, Math.pow(dn, 0.7));
      c.multiplyScalar(0.8 + t * 0.4);
    });
    parts.push(g);
  }
  // 树尖
  const tipLen = 1 - crownTop + 0.04;
  const tip = new THREE.ConeGeometry(0.011, tipLen, 8);
  tip.translate(0, 1 - tipLen / 2, 0);
  colorize(tip, (x, y, z, c) => c.setRGB(0.05, 0.13, 0.09));
  parts.push(tip);
  return mergeGeometries(parts.map(g => g.index ? g.toNonIndexed() : g));
}

function swayMaterial(opts = {}) {
  const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9, metalness: 0, ...opts });
  mat.onBeforeCompile = (sh) => {
    sh.uniforms.uTime = shared.uTime;
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', `#include <common>
        uniform float uTime;
        vec2 swayOff(vec2 w, float t) {
          float ph = w.x * 0.05 + w.y * 0.037;
          return vec2(sin(t * 0.7 + ph) + 0.4 * sin(t * 1.9 + ph * 2.0), cos(t * 0.6 + ph * 1.3) + 0.4 * sin(t * 1.7 + ph)) * ${SWAY_AMP.toFixed(4)};
        }`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        #ifdef USE_INSTANCING
          // 在世界空间里摇摆（与实例的旋转无关），再换回模型空间
          mat3 im3 = mat3(instanceMatrix);
          vec2 sw = swayOff(instanceMatrix[3].xz, uTime) * length(im3[1]);
          float hh = max(position.y, 0.0);
          vec3 lo = transpose(im3) * vec3(sw.x, 0.0, sw.y) * hh * hh;
          transformed += lo / vec3(dot(im3[0], im3[0]), dot(im3[1], im3[1]), dot(im3[2], im3[2]));
        #endif`);
  };
  return mat;
}

function haloTexture() {
  const c = document.createElement('canvas'); c.width = c.height = 128;
  const g = c.getContext('2d');
  const gr = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  gr.addColorStop(0, 'rgba(255,255,255,1)');
  gr.addColorStop(0.15, 'rgba(255,255,255,0.5)');
  gr.addColorStop(0.5, 'rgba(255,255,255,0.08)');
  gr.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gr; g.fillRect(0, 0, 128, 128);
  return new THREE.CanvasTexture(c);
}

export function createForest() {
  const group = new THREE.Group();
  const r = mulberry32(5150);
  const trees = []; // 可站立的巨杉 {x,z,r,y,h,id}

  // ---------- 巨杉 ----------
  const heroVariants = [0, 1, 2, 3].map(i => coniferGeometry(100 + i, { layers: 16, radius: 0.14, radial: 13 }));
  const heroMat = swayMaterial();
  const spots = [];
  let attempts = 0;
  while (spots.length < 26 && attempts < 2000) {
    attempts++;
    const x = (r() - 0.5) * 250;
    const z = -240 - r() * 205;
    if (spots.some(s => Math.hypot(s.x - x, s.z - z) < 24)) continue;
    spots.push({ x, z });
  }
  const perVariant = heroVariants.map(() => []);
  spots.forEach((s, i) => {
    const h = 52 + r() * 22;
    const y0 = heightAt(s.x, s.z);
    perVariant[i % 4].push({ ...s, h, y0, rot: r() * Math.PI * 2 });
    trees.push({ x: s.x, z: s.z, r: 4.4, y: y0 + h, h, id: i });
  });
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), p = new THREE.Vector3(), sc = new THREE.Vector3();
  heroVariants.forEach((geo, k) => {
    const list = perVariant[k];
    const im = new THREE.InstancedMesh(geo, heroMat, list.length);
    list.forEach((o, i) => {
      m.compose(p.set(o.x, o.y0 - 0.5, o.z), q.setFromEuler(e.set(0, o.rot, 0)), sc.set(o.h * 1.05, o.h, o.h * 1.05));
      im.setMatrixAt(i, m);
    });
    im.castShadow = true; im.receiveShadow = true;
    group.add(im);
  });
  // trees 的 y 要和几何对齐：几何顶点在 y=1（缩放后 h），平移 -0.5
  trees.forEach(t => { t.y -= 0.5; });

  // 树尖上的光晕（指引可以落脚的地方）
  const halo = haloTexture();
  const halos = trees.map(t => {
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: halo, color: new THREE.Color(0.6, 1.2, 1.6), transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false }));
    sp.scale.setScalar(4.5);
    sp.position.set(t.x, t.y + 1.2, t.z);
    group.add(sp);
    return sp;
  });

  // ---------- 林海与散布在大地上的树 ----------
  const bgVariants = [coniferGeometry(7, { layers: 8, radius: 0.2, radial: 8, droop: 0.35 }), coniferGeometry(9, { layers: 9, radius: 0.17, radial: 8 }), coniferGeometry(13, { layers: 7, radius: 0.23, radial: 7, jag: 0.35 })];
  const bgMat = swayMaterial();
  const forestSpots = [], farSpots = [];
  const okSpot = (x, z) => {
    if (Math.hypot(x - LAKE.x, z - LAKE.z) < lakeRadiusAt(x, z) + 6) return false;
    if (rectWeight(x, z, CITY, 0) > 0.01) return false;
    if (x > GRAVE.minX - 10 && x < GRAVE.maxX + 10 && z > 160 && z < GRAVE.maxZ + 10) return false;
    if (Math.abs(x) < 30 && z > 150 && z < 300) return false;
    return true;
  };
  for (let i = 0; i < 1400; i++) {
    const x = FOREST.minX - 40 + r() * (FOREST.maxX - FOREST.minX + 80);
    const z = FOREST.minZ - 30 + r() * (FOREST.maxZ - FOREST.minZ + 40);
    if (spots.some(s => Math.hypot(s.x - x, s.z - z) < 5)) continue;
    forestSpots.push([x, z, 18 + r() * 20]);
  }
  for (let i = 0; i < 2600 && farSpots.length < 1500; i++) {
    const a = r() * Math.PI * 2, d = 60 + Math.sqrt(r()) * (WORLD_R + 80);
    const x = Math.cos(a) * d, z = Math.sin(a) * d - 60;
    if (!okSpot(x, z)) continue;
    const dens = noise2(x * 0.01, z * 0.01);
    if (dens < -0.05) continue;
    const y = heightAt(x, z);
    if (y > 170) continue;
    farSpots.push([x, z, 12 + r() * 18]);
  }
  const place = (list, castShadow) => {
    bgVariants.forEach((geo, k) => {
      const sub = list.filter((_, i) => i % bgVariants.length === k);
      const im = new THREE.InstancedMesh(geo, bgMat, sub.length);
      sub.forEach(([x, z, h], i) => {
        m.compose(p.set(x, heightAt(x, z) - 0.4, z), q.setFromEuler(e.set((r() - 0.5) * 0.05, r() * 6, (r() - 0.5) * 0.05)), sc.set(h * (0.9 + r() * 0.3), h, h * (0.9 + r() * 0.3)));
        im.setMatrixAt(i, m);
      });
      im.castShadow = castShadow; im.receiveShadow = true;
      group.add(im);
    });
  };
  place(forestSpots, true);
  place(farSpots, false);

  function update(t, visible, visitedId) {
    halos.forEach((h, i) => {
      const target = visible ? (trees[i].id === visitedId ? 0.12 : 0.5 + 0.2 * Math.sin(t * 2 + i)) : 0;
      h.material.opacity += (target - h.material.opacity) * 0.05;
      h.material.color.setRGB(trees[i].id === visitedId ? 1.6 : 0.6, trees[i].id === visitedId ? 1.2 : 1.2, trees[i].id === visitedId ? 0.5 : 1.6);
      const o = swayOffset(trees[i].x, trees[i].z, t, _sw);
      h.position.set(trees[i].x + o.x * trees[i].h, trees[i].y + 1.2, trees[i].z + o.z * trees[i].h);
    });
  }

  return { group, trees, update };
}
const _sw = { x: 0, z: 0 };
