import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { mulberry32, noise2 } from './noise.js';
import { GRAVE, START } from './config.js';
import { heightAt } from './terrain.js';

// ============================================================
// 墓地：成排的墓碑、十字架、方尖碑、陵墓、铁栅栏、枯树、灯笼与蜡烛
// ============================================================

function stoneTexture(seed, base = [92, 96, 104]) {
  const s = 256, c = document.createElement('canvas'); c.width = c.height = s;
  const g = c.getContext('2d');
  const img = g.createImageData(s, s);
  const r = mulberry32(seed);
  for (let i = 0; i < s * s; i++) {
    const x = i % s, y = (i / s) | 0;
    const n = noise2(x * 0.05 + seed, y * 0.05) * 0.5 + noise2(x * 0.2, y * 0.2 + seed) * 0.3 + (r() - 0.5) * 0.25;
    const moss = Math.max(0, noise2(x * 0.03 - seed, y * 0.03 + 3) - 0.1) * 1.6 * (y / s);
    img.data[i * 4] = base[0] * (1 + n * 0.5) * (1 - moss * 0.5);
    img.data[i * 4 + 1] = base[1] * (1 + n * 0.5) * (1 + moss * 0.15);
    img.data[i * 4 + 2] = base[2] * (1 + n * 0.5) * (1 - moss * 0.6);
    img.data[i * 4 + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  // 刻痕与裂纹
  g.strokeStyle = 'rgba(20,20,26,0.55)'; g.lineWidth = 1.2;
  for (let k = 0; k < 6; k++) {
    g.beginPath(); let x = r() * s, y = r() * s; g.moveTo(x, y);
    for (let j = 0; j < 6; j++) { x += (r() - 0.5) * 40; y += r() * 30; g.lineTo(x, y); }
    g.stroke();
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

// 圆顶墓碑
function roundedStone() {
  const w = 0.9, h = 1.3, sh = new THREE.Shape();
  sh.moveTo(-w / 2, 0); sh.lineTo(-w / 2, h - w / 2);
  sh.absarc(0, h - w / 2, w / 2, Math.PI, 0, true);
  sh.lineTo(w / 2, 0); sh.lineTo(-w / 2, 0);
  const g = new THREE.ExtrudeGeometry(sh, { depth: 0.22, bevelEnabled: true, bevelSize: 0.035, bevelThickness: 0.035, bevelSegments: 2, curveSegments: 12 });
  g.translate(0, 0, -0.11);
  const base = new THREE.BoxGeometry(1.15, 0.22, 0.5); base.translate(0, 0.11, 0);
  g.translate(0, 0.2, 0);
  return mergeGeometries([g.toNonIndexed(), base.toNonIndexed()]);
}
function crossStone() {
  const a = new THREE.BoxGeometry(0.22, 1.9, 0.2); a.translate(0, 1.15, 0);
  const b = new THREE.BoxGeometry(0.95, 0.22, 0.2); b.translate(0, 1.55, 0);
  const base = new THREE.BoxGeometry(0.7, 0.25, 0.5); base.translate(0, 0.12, 0);
  const step = new THREE.BoxGeometry(0.5, 0.2, 0.36); step.translate(0, 0.33, 0);
  return mergeGeometries([a, b, base, step].map(g => g.toNonIndexed()));
}
function obelisk() {
  const shaft = new THREE.CylinderGeometry(0.16, 0.26, 2.4, 4, 1); shaft.rotateY(Math.PI / 4); shaft.translate(0, 1.6, 0);
  const tip = new THREE.ConeGeometry(0.2, 0.4, 4); tip.rotateY(Math.PI / 4); tip.translate(0, 3.0, 0);
  const base = new THREE.BoxGeometry(0.8, 0.4, 0.8); base.translate(0, 0.2, 0);
  const base2 = new THREE.BoxGeometry(0.55, 0.25, 0.55); base2.translate(0, 0.52, 0);
  return mergeGeometries([shaft, tip, base, base2].map(g => g.toNonIndexed()));
}
function slabStone() {
  const s = new THREE.BoxGeometry(1.0, 0.95, 0.18); s.translate(0, 0.47, 0);
  const cap = new THREE.BoxGeometry(1.1, 0.1, 0.24); cap.translate(0, 0.98, 0);
  const tomb = new THREE.BoxGeometry(1.0, 0.25, 2.0); tomb.translate(0, 0.12, 1.1);
  return mergeGeometries([s, cap, tomb].map(g => g.toNonIndexed()));
}

// 枯树：递归分叉
function deadTreeGeometry(seed) {
  const r = mulberry32(seed);
  const parts = [];
  const up = new THREE.Vector3(0, 1, 0);
  function branch(start, dir, len, rad, depth) {
    const segs = 3;
    let p = start.clone(), d = dir.clone();
    for (let s = 0; s < segs; s++) {
      const l = len / segs;
      const r0 = rad * (1 - s / segs * 0.45), r1 = rad * (1 - (s + 1) / segs * 0.45);
      const g = new THREE.CylinderGeometry(r1, r0, l, 6, 1);
      g.translate(0, l / 2, 0);
      g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(up, d));
      g.translate(p.x, p.y, p.z);
      parts.push(g.toNonIndexed());
      p.addScaledVector(d, l);
      d.add(new THREE.Vector3((r() - 0.5) * 0.5, (r() - 0.3) * 0.3, (r() - 0.5) * 0.5)).normalize();
    }
    if (depth <= 0 || rad < 0.03) return;
    const kids = 2 + (r() < 0.45 ? 1 : 0);
    for (let k = 0; k < kids; k++) {
      const nd = d.clone().add(new THREE.Vector3((r() - 0.5) * 1.6, (r() - 0.2) * 0.8, (r() - 0.5) * 1.6)).normalize();
      branch(p, nd, len * (0.55 + r() * 0.2), rad * 0.62, depth - 1);
    }
  }
  branch(new THREE.Vector3(0, -0.5, 0), new THREE.Vector3(0, 1, 0), 5.5, 0.42, 4);
  // 根
  for (let k = 0; k < 5; k++) {
    const a = k / 5 * Math.PI * 2 + r();
    const g = new THREE.CylinderGeometry(0.04, 0.22, 2.0, 5);
    g.translate(0, 1.0, 0);
    g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(up, new THREE.Vector3(Math.cos(a), 0.35, Math.sin(a)).normalize()));
    g.translate(0, 0.1, 0);
    parts.push(g.toNonIndexed());
  }
  return mergeGeometries(parts);
}

function flameTexture() {
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const g = c.getContext('2d');
  const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grad.addColorStop(0, 'rgba(255,255,230,1)');
  grad.addColorStop(0.25, 'rgba(255,190,90,0.8)');
  grad.addColorStop(1, 'rgba(255,120,30,0)');
  g.fillStyle = grad; g.fillRect(0, 0, 64, 64);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export function createGraveyard() {
  const group = new THREE.Group();
  const r = mulberry32(20260814);
  const flickers = [];   // {light, sprite, base}
  const graves = [];     // 僵尸从这些坟里爬出来

  const stoneMat = new THREE.MeshStandardMaterial({ map: stoneTexture(3), roughness: 0.92, color: 0xb0b4c0 });
  const darkStoneMat = new THREE.MeshStandardMaterial({ map: stoneTexture(8, [70, 72, 80]), roughness: 0.95, color: 0x9a9ca8 });
  const types = [roundedStone(), crossStone(), obelisk(), slabStone()];
  const weights = [0.45, 0.25, 0.08, 0.22];
  const placements = types.map(() => []);

  for (let z = GRAVE.minZ + 12; z < GRAVE.maxZ - 6; z += 8.5) {
    for (let x = GRAVE.minX + 8; x < GRAVE.maxX - 6; x += 5.2) {
      if (Math.abs(x) < 7) continue;                 // 中间的小路
      if (r() < 0.28) continue;
      if (Math.hypot(x - 48, z - 332) < 16) continue; // 陵墓
      const px = x + (r() - 0.5) * 1.6, pz = z + (r() - 0.5) * 1.8;
      let k = 0, u = r();
      while (u > weights[k]) { u -= weights[k]; k++; }
      placements[k].push({ x: px, z: pz, rot: (r() - 0.5) * 0.35 + (r() < 0.05 ? Math.PI : 0), tiltX: (r() - 0.5) * 0.25, tiltZ: (r() - 0.5) * 0.2, s: 0.85 + r() * 0.35 });
      graves.push(new THREE.Vector3(px, 0, pz + 1.3));
    }
  }
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), p = new THREE.Vector3(), s = new THREE.Vector3();
  types.forEach((geo, k) => {
    const list = placements[k];
    const im = new THREE.InstancedMesh(geo, k === 2 ? darkStoneMat : stoneMat, list.length);
    const col = new THREE.Color();
    list.forEach((o, i) => {
      e.set(o.tiltX, o.rot, o.tiltZ);
      m.compose(p.set(o.x, heightAt(o.x, o.z) - 0.08, o.z), q.setFromEuler(e), s.setScalar(o.s));
      im.setMatrixAt(i, m);
      col.setHSL(0.6, 0.05 + r() * 0.05, 0.55 + r() * 0.35);
      im.setColorAt(i, col);
    });
    im.castShadow = im.receiveShadow = true;
    group.add(im);
  });

  // ---------- 陵墓 ----------
  {
    const mz = new THREE.Group();
    const mx = 48, mzz = 332, y0 = heightAt(mx, mzz);
    const add = (geo, mat, x, y, z) => { const me = new THREE.Mesh(geo, mat); me.position.set(x, y, z); me.castShadow = me.receiveShadow = true; mz.add(me); return me; };
    add(new THREE.BoxGeometry(11, 0.5, 9), darkStoneMat, 0, 0.25, 0);
    add(new THREE.BoxGeometry(10, 0.4, 8), darkStoneMat, 0, 0.7, 0);
    add(new THREE.BoxGeometry(8, 5, 6), stoneMat, 0, 3.4, 0.6);
    const colGeo = new THREE.CylinderGeometry(0.3, 0.36, 4.6, 12);
    for (let i = 0; i < 4; i++) add(colGeo, stoneMat, -3.3 + i * 2.2, 3.2, -3.1);
    add(new THREE.BoxGeometry(9, 0.5, 7.4), darkStoneMat, 0, 6.1, 0);
    const ped = new THREE.Shape(); ped.moveTo(-4.6, 0); ped.lineTo(4.6, 0); ped.lineTo(0, 2); ped.lineTo(-4.6, 0);
    const pedGeo = new THREE.ExtrudeGeometry(ped, { depth: 7.4, bevelEnabled: false }); pedGeo.translate(0, 0, -3.7);
    add(pedGeo, stoneMat, 0, 6.35, 0);
    // 门缝里透出诡异的绿光
    const door = add(new THREE.PlaneGeometry(2.2, 3.4), new THREE.MeshBasicMaterial({ color: new THREE.Color(0.15, 0.9, 0.45) }), 0, 2.6, -2.41);
    door.rotation.y = Math.PI;
    add(new THREE.BoxGeometry(0.35, 3.9, 0.35), darkStoneMat, -1.3, 2.85, -2.45);
    add(new THREE.BoxGeometry(0.35, 3.9, 0.35), darkStoneMat, 1.3, 2.85, -2.45);
    add(new THREE.BoxGeometry(3.0, 0.4, 0.4), darkStoneMat, 0, 4.6, -2.45);
    add(new THREE.BoxGeometry(1.0, 3.3, 0.1), darkStoneMat, -0.75, 2.55, -2.75).rotation.y = 0.6;
    const glow = new THREE.PointLight(0x44ff99, 12, 22, 1.8);
    glow.position.set(0, 2.5, -4);
    mz.add(glow);
    flickers.push({ light: glow, base: 12, speed: 3 });
    mz.position.set(mx, y0, mzz);
    mz.rotation.y = 0.6;
    group.add(mz);
  }

  // ---------- 铁栅栏 ----------
  {
    const post = new THREE.CylinderGeometry(0.04, 0.04, 2.2, 5); post.translate(0, 1.1, 0);
    const spike = new THREE.ConeGeometry(0.07, 0.25, 4); spike.translate(0, 2.3, 0);
    const picket = mergeGeometries([post.toNonIndexed(), spike.toNonIndexed()]);
    const pts = [];
    const edge = (x0, z0, x1, z1) => {
      const L = Math.hypot(x1 - x0, z1 - z0), n = Math.floor(L / 0.45);
      for (let i = 0; i <= n; i++) {
        const t = i / n, x = x0 + (x1 - x0) * t, z = z0 + (z1 - z0) * t;
        if (z0 === GRAVE.minZ && z1 === GRAVE.minZ && Math.abs(x) < 9) continue; // 大门开着
        if (r() < 0.04) continue; // 缺了几根
        pts.push([x, z, (r() - 0.5) * 0.12]);
      }
    };
    const { minX, maxX, minZ, maxZ } = GRAVE;
    edge(minX, minZ, maxX, minZ); edge(minX, maxZ, maxX, maxZ);
    edge(minX, minZ, minX, maxZ); edge(maxX, minZ, maxX, maxZ);
    const ironMat = new THREE.MeshStandardMaterial({ color: 0x15161a, roughness: 0.5, metalness: 0.8 });
    const im = new THREE.InstancedMesh(picket, ironMat, pts.length);
    pts.forEach(([x, z, tilt], i) => {
      m.compose(p.set(x, heightAt(x, z) - 0.1, z), q.setFromEuler(e.set(tilt, 0, tilt * 0.5)), s.set(1, 1, 1));
      im.setMatrixAt(i, m);
    });
    im.castShadow = true;
    group.add(im);
    // 横杆
    const railMat = ironMat;
    const rail = (x0, z0, x1, z1, y) => {
      const L = Math.hypot(x1 - x0, z1 - z0);
      const g = new THREE.BoxGeometry(L, 0.05, 0.05);
      const me = new THREE.Mesh(g, railMat);
      me.position.set((x0 + x1) / 2, heightAt((x0 + x1) / 2, (z0 + z1) / 2) + y, (z0 + z1) / 2);
      me.rotation.y = -Math.atan2(z1 - z0, x1 - x0);
      group.add(me);
    };
    for (const y of [0.4, 1.9]) {
      rail(minX, minZ, -9, minZ, y); rail(9, minZ, maxX, minZ, y);
      rail(minX, maxZ, maxX, maxZ, y); rail(minX, minZ, minX, maxZ, y); rail(maxX, minZ, maxX, maxZ, y);
    }
    // 大门门柱 + 拱
    for (const sx of [-9.5, 9.5]) {
      const pillar = new THREE.Mesh(new THREE.BoxGeometry(1.1, 4.2, 1.1), darkStoneMat);
      pillar.position.set(sx, heightAt(sx, minZ) + 2.1, minZ);
      pillar.castShadow = true;
      group.add(pillar);
      const cap = new THREE.Mesh(new THREE.SphereGeometry(0.5, 12, 8), stoneMat);
      cap.position.set(sx, heightAt(sx, minZ) + 4.6, minZ);
      group.add(cap);
    }
    const arch = new THREE.Mesh(new THREE.TorusGeometry(9.5, 0.09, 6, 40, Math.PI), ironMat);
    arch.position.set(0, heightAt(0, minZ) + 3.6, minZ);
    arch.scale.set(1, 0.3, 1);
    group.add(arch);
    // 半开的铁门
    for (const sx of [-1, 1]) {
      const gate = new THREE.Group();
      for (let i = 0; i < 9; i++) {
        const b = new THREE.Mesh(picket, ironMat);
        b.position.x = sx * (0.3 + i * 0.95);
        b.scale.y = 1.2;
        gate.add(b);
      }
      gate.position.set(sx * 9, heightAt(sx * 9, minZ), minZ);
      gate.rotation.y = sx * -1.9;
      group.add(gate);
    }
  }

  // ---------- 枯树 ----------
  {
    const bark = new THREE.MeshStandardMaterial({ color: 0x1c1712, roughness: 1 });
    const variants = [deadTreeGeometry(11), deadTreeGeometry(23), deadTreeGeometry(57)];
    const spots = [];
    for (let i = 0; i < 30; i++) {
      let x = (r() - 0.5) * 300, z = GRAVE.z + (r() - 0.5) * 220 - 20;
      if (Math.abs(x) < 16 && z < GRAVE.maxZ + 20) x += x < 0 ? -18 : 18;
      if (z < 170) continue;
      spots.push([x, z]);
    }
    variants.forEach((geo, k) => {
      const list = spots.filter((_, i) => i % 3 === k);
      const im = new THREE.InstancedMesh(geo, bark, list.length);
      list.forEach(([x, z], i) => {
        const sc = 0.9 + r() * 0.9;
        m.compose(p.set(x, heightAt(x, z), z), q.setFromEuler(e.set((r() - 0.5) * 0.15, r() * 6, (r() - 0.5) * 0.15)), s.set(sc, sc * (0.9 + r() * 0.4), sc));
        im.setMatrixAt(i, m);
      });
      im.castShadow = true;
      group.add(im);
    });
  }

  // ---------- 灯笼（小路两旁）----------
  {
    const flame = flameTexture();
    const poleMat = new THREE.MeshStandardMaterial({ color: 0x1a1a1e, roughness: 0.6, metalness: 0.6 });
    const glassMat = new THREE.MeshStandardMaterial({ color: 0x331a08, emissive: 0xffa040, emissiveIntensity: 2.2, roughness: 0.3 });
    const lanterns = [[-5, 255], [5, 290], [-5, 322]];
    for (const [x, z] of lanterns) {
      const y = heightAt(x, z);
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.09, 2.8, 6), poleMat);
      pole.position.set(x, y + 1.4, z); pole.castShadow = true; group.add(pole);
      const arm = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.05, 0.05), poleMat);
      arm.position.set(x + Math.sign(-x) * 0.3, y + 2.75, z); group.add(arm);
      const lx = x + Math.sign(-x) * 0.6;
      const lamp = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.2, 0.42, 6), glassMat);
      lamp.position.set(lx, y + 2.45, z); group.add(lamp);
      const roof = new THREE.Mesh(new THREE.ConeGeometry(0.28, 0.2, 6), poleMat);
      roof.position.set(lx, y + 2.75, z); group.add(roof);
      const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: flame, color: 0xffb060, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
      sp.scale.setScalar(1.6); sp.position.set(lx, y + 2.45, z); group.add(sp);
      const light = new THREE.PointLight(0xff9a40, 9, 18, 1.8);
      light.position.set(lx, y + 2.3, z);
      group.add(light);
      flickers.push({ light, sprite: sp, base: 9, speed: 9 + r() * 4 });
    }
    // 坟前的小蜡烛
    const candleGeo = new THREE.CylinderGeometry(0.035, 0.035, 0.22, 6); candleGeo.translate(0, 0.11, 0);
    const candleMat = new THREE.MeshStandardMaterial({ color: 0xe8e0c8, emissive: 0x402a10 });
    const cn = 40;
    const candles = new THREE.InstancedMesh(candleGeo, candleMat, cn);
    for (let i = 0; i < cn; i++) {
      const gv = graves[(r() * graves.length) | 0];
      const x = gv.x + (r() - 0.5) * 0.8, z = gv.z - 0.5 + (r() - 0.5) * 0.3;
      const y = heightAt(x, z);
      m.compose(p.set(x, y, z), q.identity(), s.set(1, 0.6 + r(), 1));
      candles.setMatrixAt(i, m);
      const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: flame, color: 0xffc070, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
      sp.scale.setScalar(0.35); sp.position.set(x, y + 0.3 + 0.1 * r(), z);
      group.add(sp);
      flickers.push({ sprite: sp, base: 0.35, speed: 12 + r() * 6 });
    }
    group.add(candles);
  }

  function update(t) {
    for (const f of flickers) {
      const k = 0.85 + 0.1 * Math.sin(t * f.speed) + 0.06 * Math.sin(t * f.speed * 2.3 + 1.3);
      if (f.light) f.light.intensity = f.base * k;
      if (f.sprite) f.sprite.material.opacity = 0.7 + 0.3 * k;
    }
  }

  // 按离出生点远近排序：前面的坟先裂开
  graves.sort((a, b) => a.distanceTo(new THREE.Vector3(START.x, 0, START.z + 30)) - b.distanceTo(new THREE.Vector3(START.x, 0, START.z + 30)));
  return { group, graves, update };
}
