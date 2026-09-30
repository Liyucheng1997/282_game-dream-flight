import * as THREE from 'three';
import { mulberry32 } from './noise.js';
import { CITY } from './config.js';

// ============================================================
// 城市：几十栋亮着零星窗灯的高楼，楼顶有水塔、空调外机、天线和闪烁的航标灯
// 最高的那栋是装饰艺术风格的摩天楼，楼顶有停机坪
// ============================================================

// 立面贴图：一张颜色图 + 一张窗灯发光图
function makeFacade(seed, style) {
  const W = 512, H = 1024, cols = 16, rows = 32;
  const r = mulberry32(seed);
  const cc = document.createElement('canvas'); cc.width = W; cc.height = H;
  const ec = document.createElement('canvas'); ec.width = W; ec.height = H;
  const g = cc.getContext('2d'), ge = ec.getContext('2d');
  const base = style === 'glass' ? '#1a2230' : style === 'brick' ? '#2a2024' : '#23252c';
  g.fillStyle = base; g.fillRect(0, 0, W, H);
  ge.fillStyle = '#000'; ge.fillRect(0, 0, W, H);
  // 墙面污渍
  for (let i = 0; i < 1200; i++) {
    g.fillStyle = `rgba(${r() < 0.5 ? '0,0,0' : '255,255,255'},${r() * 0.04})`;
    g.fillRect(r() * W, r() * H, 2 + r() * 20, 2 + r() * 40);
  }
  const cw = W / cols, rh = H / rows;
  const warm = ['#ffcf88', '#ffd9a0', '#ffc070', '#fff0c8'];
  const cool = ['#a8d0ff', '#c8e4ff', '#88b8ff'];
  for (let j = 0; j < rows; j++) {
    // 楼层线
    g.fillStyle = style === 'glass' ? 'rgba(120,150,190,0.25)' : 'rgba(0,0,0,0.35)';
    g.fillRect(0, j * rh, W, 2);
    const floorLit = r() < 0.7;
    for (let i = 0; i < cols; i++) {
      const pad = style === 'glass' ? 1.5 : style === 'brick' ? 6 : 4;
      const x = i * cw + pad, y = j * rh + pad + 1, w = cw - pad * 2, h = rh - pad * 2 - (style === 'brick' ? 3 : 0);
      // 玻璃
      const gl = g.createLinearGradient(x, y, x + w, y + h);
      gl.addColorStop(0, style === 'glass' ? '#2a3a55' : '#141a26');
      gl.addColorStop(1, style === 'glass' ? '#18223a' : '#0b0e16');
      g.fillStyle = gl; g.fillRect(x, y, w, h);
      if (floorLit && r() < 0.34) {
        const c = r() < 0.72 ? warm[(r() * warm.length) | 0] : cool[(r() * cool.length) | 0];
        const k = 0.35 + r() * 0.65;
        ge.globalAlpha = k; ge.fillStyle = c; ge.fillRect(x, y, w, h);
        // 窗帘 / 人影
        if (r() < 0.4) { ge.globalAlpha = k * 0.7; ge.fillStyle = '#000'; ge.fillRect(x + (r() < 0.5 ? 0 : w * 0.55), y, w * 0.45, h); }
        if (r() < 0.12) { ge.globalAlpha = 0.8; ge.fillStyle = '#000'; ge.fillRect(x + w * 0.4, y + h * 0.35, w * 0.18, h * 0.65); }
        ge.globalAlpha = 1;
        g.fillStyle = c; g.globalAlpha = 0.25; g.fillRect(x, y, w, h); g.globalAlpha = 1;
      }
    }
  }
  const mk = (cv, srgb) => {
    const t = new THREE.CanvasTexture(cv);
    if (srgb) t.colorSpace = THREE.SRGBColorSpace;
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.anisotropy = 8;
    return t;
  };
  return { map: mk(cc, true), emissive: mk(ec, true), cols, rows };
}

function helipadTexture() {
  const c = document.createElement('canvas'); c.width = c.height = 256;
  const g = c.getContext('2d');
  g.fillStyle = '#2a2d36'; g.fillRect(0, 0, 256, 256);
  g.strokeStyle = '#d8d0a0'; g.lineWidth = 8;
  g.beginPath(); g.arc(128, 128, 96, 0, Math.PI * 2); g.stroke();
  g.fillStyle = '#e8e0b0'; g.font = 'bold 120px Arial'; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText('H', 128, 136);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function roadTexture() {
  const c = document.createElement('canvas'); c.width = 64; c.height = 256;
  const g = c.getContext('2d');
  g.fillStyle = '#18191d'; g.fillRect(0, 0, 64, 256);
  for (let i = 0; i < 300; i++) { g.fillStyle = `rgba(255,255,255,${Math.random() * 0.03})`; g.fillRect(Math.random() * 64, Math.random() * 256, 2, 2); }
  g.fillStyle = '#8a8060'; g.fillRect(30, 0, 4, 128);
  g.fillStyle = '#3a3a40'; g.fillRect(2, 0, 2, 256); g.fillRect(60, 0, 2, 256);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

export function createCity() {
  const group = new THREE.Group();
  const r = mulberry32(8283);
  const roofs = [];      // 可站立的平台 {type, minX,maxX,minZ,maxZ | x,z,r, y, tall}
  const walls = [];      // 墙体碰撞
  const blinkers = [];   // 闪烁航标灯
  const windowMats = [];

  const facades = [
    makeFacade(1, 'plain'), makeFacade(2, 'glass'), makeFacade(3, 'brick'),
    makeFacade(4, 'plain'), makeFacade(5, 'glass'),
  ];
  const roofMat = new THREE.MeshStandardMaterial({ color: 0x2a2c33, roughness: 0.95 });
  const rimMat = new THREE.MeshStandardMaterial({ color: 0x3a3d48, roughness: 0.8 });
  const metalMat = new THREE.MeshStandardMaterial({ color: 0x4a4e5a, roughness: 0.5, metalness: 0.7 });
  const blinkMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(3, 0.2, 0.25) });

  function facadeMat(f, w, h, d) {
    const floors = Math.max(3, Math.round(h / 3.3));
    const colsW = Math.max(3, Math.round(w / 2.1));
    const map = f.map.clone(), em = f.emissive.clone();
    const ox = Math.floor(r() * 16) / 16, oy = Math.floor(r() * 32) / 32;
    for (const t of [map, em]) { t.repeat.set(colsW / f.cols, floors / f.rows); t.offset.set(ox, oy); t.needsUpdate = true; }
    const mat = new THREE.MeshStandardMaterial({
      map, emissiveMap: em, emissive: 0xffffff, emissiveIntensity: 1.6,
      roughness: 0.55, metalness: 0.35, envMapIntensity: 0.8,
    });
    windowMats.push(mat);
    return mat;
  }

  // 一个“体块”：带立面贴图的盒子 + 楼顶 + 女儿墙
  function box(x, z, w, d, y0, h, f, tall = false) {
    const mat = facadeMat(f, w, h, d);
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), [mat, mat, roofMat, roofMat, mat, mat]);
    mesh.position.set(x, y0 + h / 2, z);
    // 楼身不投影：几十米高的楼在低角度月光下影子上百米，会被阴影贴图的边界截出硬边
    mesh.receiveShadow = true;
    group.add(mesh);
    const top = y0 + h;
    // 女儿墙
    const t = 0.35, ph = 0.9;
    for (const [px, pz, pw, pd] of [[x, z - d / 2 + t / 2, w, t], [x, z + d / 2 - t / 2, w, t], [x - w / 2 + t / 2, z, t, d], [x + w / 2 - t / 2, z, t, d]]) {
      const p = new THREE.Mesh(new THREE.BoxGeometry(pw, ph, pd), rimMat);
      p.position.set(px, top + ph / 2, pz);
      group.add(p);
    }
    roofs.push({ type: 'box', minX: x - w / 2, maxX: x + w / 2, minZ: z - d / 2, maxZ: z + d / 2, y: top, tall });
    walls.push({ type: 'box', minX: x - w / 2, maxX: x + w / 2, minZ: z - d / 2, maxZ: z + d / 2, top });
    return top;
  }

  function cylinder(x, z, rad, y0, h, f) {
    const mat = facadeMat(f, rad * Math.PI * 2, h, 1);
    const mesh = new THREE.Mesh(new THREE.CylinderGeometry(rad, rad, h, 28, 1, false), [mat, roofMat, roofMat]);
    mesh.position.set(x, y0 + h / 2, z);
    mesh.receiveShadow = true;
    group.add(mesh);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(rad - 0.2, 0.3, 6, 28), rimMat);
    ring.rotation.x = Math.PI / 2; ring.position.set(x, y0 + h + 0.3, z);
    group.add(ring);
    roofs.push({ type: 'circle', x, z, r: rad, y: y0 + h, tall: false });
    walls.push({ type: 'circle', x, z, r: rad, top: y0 + h });
    return y0 + h;
  }

  // 楼顶杂物（实例化）
  const tanks = [], acs = [], huts = [], antennas = [];
  function roofClutter(x, z, w, d, top, big) {
    const n = 1 + ((r() * 3) | 0);
    for (let i = 0; i < n; i++) {
      const px = x + (r() - 0.5) * (w - 5), pz = z + (r() - 0.5) * (d - 5);
      const k = r();
      if (k < 0.3) tanks.push([px, top, pz, 0.8 + r() * 0.5]);
      else if (k < 0.75) acs.push([px, top, pz, r() * Math.PI]);
      else huts.push([px, top, pz, r() * Math.PI]);
    }
    if (big || r() < 0.3) {
      const ax = x + (w / 2 - 1.5) * (r() < 0.5 ? 1 : -1), az = z + (d / 2 - 1.5) * (r() < 0.5 ? 1 : -1);
      const ah = 5 + r() * 8;
      antennas.push([ax, top, az, ah]);
      const b = new THREE.Mesh(new THREE.SphereGeometry(0.28, 8, 6), blinkMat.clone());
      b.position.set(ax, top + ah + 0.2, az);
      group.add(b);
      blinkers.push({ mesh: b, phase: r() * 6 });
    }
  }

  // ---------- 街区布局 ----------
  const xs = [-132, -99, -66, -33, 0, 33, 66, 99, 132];
  const zs = [-62, -96, -130, -164, -196];
  for (const bx of xs) {
    for (const bz of zs) {
      const isTallest = bx === 0 && bz === -130;
      if (isTallest) continue;
      if ((bx === 66 && bz === -96) || (bx === -99 && bz === -164)) continue; // 两个小广场
      const dist = Math.hypot(bx, (bz + 130) * 1.3);
      const hMax = 22 + 44 * Math.exp(-((dist / 95) ** 2));
      const n = r() < 0.3 ? 2 : 1;
      for (let k = 0; k < n; k++) {
        const w = n === 2 ? 10 + r() * 3 : 16 + r() * 7;
        const d = 15 + r() * 8;
        const x = bx + (n === 2 ? (k === 0 ? -6.5 : 6.5) : (r() - 0.5) * 3);
        const z = bz + (r() - 0.5) * 3;
        const h = Math.min(66, hMax * (0.55 + r() * 0.5) + r() * 6);
        const f = facades[(r() * facades.length) | 0];
        const style = r();
        let top;
        if (style < 0.14 && n === 1) {
          top = cylinder(x, z, Math.min(w, d) / 2, 0, h, facades[1]);
          roofClutter(x, z, Math.min(w, d) * 0.7, Math.min(w, d) * 0.7, top, h > 45);
        } else if (style < 0.5 && h > 30) {
          const h1 = h * (0.55 + r() * 0.15);
          box(x, z, w, d, 0, h1, f);
          const w2 = w * 0.68, d2 = d * 0.68;
          top = box(x, z, w2, d2, h1, h - h1, f);
          roofClutter(x, z, w2, d2, top, h > 45);
        } else {
          top = box(x, z, w, d, 0, h, f);
          roofClutter(x, z, w, d, top, h > 45);
        }
      }
    }
  }

  // ---------- 最高的摩天楼 ----------
  let tallTop;
  {
    const x = 0, z = -130, f = facades[3];
    box(x, z, 26, 26, 0, 50, f);
    box(x, z, 20, 20, 50, 18, f);
    tallTop = box(x, z, 15, 15, 68, 12, f, true);
    // 顶部发光的装饰艺术鳍片
    const finMat = new THREE.MeshStandardMaterial({ color: 0x8890a8, metalness: 0.9, roughness: 0.3, emissive: new THREE.Color(0.6, 0.55, 0.4), emissiveIntensity: 0.6 });
    for (const [fx, fz, rw, rd] of [[7.6, 0, 0.4, 4], [-7.6, 0, 0.4, 4], [0, 7.6, 4, 0.4], [0, -7.6, 4, 0.4]]) {
      const fin = new THREE.Mesh(new THREE.BoxGeometry(rw, 16, rd), finMat);
      fin.position.set(x + fx, 72, z + fz);
      group.add(fin);
    }
    // 楼顶一圈灯带
    const ring = new THREE.Mesh(new THREE.BoxGeometry(15.4, 0.25, 15.4), new THREE.MeshBasicMaterial({ color: new THREE.Color(2.2, 1.9, 1.3) }));
    ring.position.set(x, tallTop - 0.4, z);
    group.add(ring);
    // 停机坪
    const pad = new THREE.Mesh(new THREE.CircleGeometry(5.5, 40), new THREE.MeshStandardMaterial({ map: helipadTexture(), roughness: 0.8 }));
    pad.rotation.x = -Math.PI / 2; pad.position.set(x, tallTop + 0.03, z);
    pad.receiveShadow = true;
    group.add(pad);
    for (let i = 0; i < 12; i++) {
      const a = i / 12 * Math.PI * 2;
      const l = new THREE.Mesh(new THREE.SphereGeometry(0.13, 6, 4), new THREE.MeshBasicMaterial({ color: new THREE.Color(0.4, 2.5, 0.8) }));
      l.position.set(x + Math.cos(a) * 5.8, tallTop + 0.12, z + Math.sin(a) * 5.8);
      group.add(l);
    }
    // 角落的天线塔 + 红灯
    const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.25, 14, 6), metalMat);
    mast.position.set(x + 6, tallTop + 7, z + 6); group.add(mast);
    for (const hy of [7, 14.3]) {
      const b = new THREE.Mesh(new THREE.SphereGeometry(0.4, 10, 8), blinkMat.clone());
      b.position.set(x + 6, tallTop + hy, z + 6);
      group.add(b);
      blinkers.push({ mesh: b, phase: hy });
    }
  }

  // 实例化楼顶杂物
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), p = new THREE.Vector3(), s = new THREE.Vector3();
  {
    const tank = new THREE.CylinderGeometry(1.2, 1.2, 2.2, 14); tank.translate(0, 2.4, 0);
    const im = new THREE.InstancedMesh(tank, new THREE.MeshStandardMaterial({ color: 0x3a3028, roughness: 0.9 }), tanks.length);
    const cone = new THREE.ConeGeometry(1.3, 0.8, 14); cone.translate(0, 3.9, 0);
    const im2 = new THREE.InstancedMesh(cone, roofMat, tanks.length);
    const leg = new THREE.CylinderGeometry(0.08, 0.08, 1.3, 4); leg.translate(0, 0.65, 0);
    const im3 = new THREE.InstancedMesh(leg, metalMat, tanks.length * 4);
    tanks.forEach(([x, y, z, sc], i) => {
      m.compose(p.set(x, y, z), q.identity(), s.setScalar(sc));
      im.setMatrixAt(i, m); im2.setMatrixAt(i, m);
      for (let k = 0; k < 4; k++) {
        const a = k * Math.PI / 2 + 0.78;
        m.compose(p.set(x + Math.cos(a) * sc, y, z + Math.sin(a) * sc), q.identity(), s.setScalar(sc));
        im3.setMatrixAt(i * 4 + k, m);
      }
    });
    im.castShadow = im2.castShadow = true;
    group.add(im, im2, im3);

    const ac = new THREE.BoxGeometry(2.2, 1.2, 1.6); ac.translate(0, 0.6, 0);
    const imA = new THREE.InstancedMesh(ac, metalMat, acs.length);
    acs.forEach(([x, y, z, rot], i) => { m.compose(p.set(x, y, z), q.setFromEuler(e.set(0, rot, 0)), s.set(1, 1, 1)); imA.setMatrixAt(i, m); });
    imA.castShadow = true;
    group.add(imA);

    const hut = new THREE.BoxGeometry(3, 2.6, 3); hut.translate(0, 1.3, 0);
    const imH = new THREE.InstancedMesh(hut, rimMat, huts.length);
    huts.forEach(([x, y, z, rot], i) => { m.compose(p.set(x, y, z), q.setFromEuler(e.set(0, rot, 0)), s.set(1, 1, 1)); imH.setMatrixAt(i, m); });
    imH.castShadow = true;
    group.add(imH);

    const ant = new THREE.CylinderGeometry(0.05, 0.12, 1, 5); ant.translate(0, 0.5, 0);
    const imT = new THREE.InstancedMesh(ant, metalMat, antennas.length);
    antennas.forEach(([x, y, z, h], i) => { m.compose(p.set(x, y, z), q.identity(), s.set(1, h, 1)); imT.setMatrixAt(i, m); });
    group.add(imT);
  }

  // ---------- 道路、路灯、路面光斑 ----------
  {
    const rt = roadTexture();
    const roadMat = new THREE.MeshStandardMaterial({ map: rt, roughness: 0.75, metalness: 0.1 });
    const lampPts = [];
    // 南北向道路（x 在街区之间）
    for (let i = 0; i < xs.length - 1; i++) {
      const x = (xs[i] + xs[i + 1]) / 2, L = CITY.maxZ - CITY.minZ + 30;
      const tex = rt.clone(); tex.repeat.set(1, L / 12); tex.needsUpdate = true;
      const g = new THREE.PlaneGeometry(8, L); g.rotateX(-Math.PI / 2);
      const me = new THREE.Mesh(g, roadMat.clone()); me.material.map = tex;
      me.position.set(x, 0.18, (CITY.maxZ + CITY.minZ) / 2);
      me.receiveShadow = true;
      group.add(me);
      for (let z = CITY.minZ; z < CITY.maxZ; z += 22) lampPts.push([x + 4.6, z, -1], [x - 4.6, z + 11, 1]);
    }
    // 东西向道路
    for (let j = 0; j < zs.length - 1; j++) {
      const z = (zs[j] + zs[j + 1]) / 2, L = CITY.maxX - CITY.minX + 30;
      const tex = rt.clone(); tex.repeat.set(1, L / 12); tex.needsUpdate = true;
      const g = new THREE.PlaneGeometry(8, L); g.rotateX(-Math.PI / 2); g.rotateY(Math.PI / 2);
      const me = new THREE.Mesh(g, roadMat.clone()); me.material.map = tex;
      me.position.set(0, 0.2, z);
      me.receiveShadow = true;
      group.add(me);
    }
    const pole = new THREE.CylinderGeometry(0.08, 0.12, 6, 5); pole.translate(0, 3, 0);
    const poles = new THREE.InstancedMesh(pole, metalMat, lampPts.length);
    const head = new THREE.BoxGeometry(0.9, 0.18, 0.4); head.translate(0, 6, 0);
    const heads = new THREE.InstancedMesh(head, new THREE.MeshBasicMaterial({ color: new THREE.Color(2.6, 1.9, 1.1) }), lampPts.length);
    const poolGeo = new THREE.CircleGeometry(3.4, 24); poolGeo.rotateX(-Math.PI / 2);
    const poolTex = (() => {
      const c = document.createElement('canvas'); c.width = c.height = 64; const g = c.getContext('2d');
      const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
      gr.addColorStop(0, 'rgba(255,200,130,0.2)'); gr.addColorStop(1, 'rgba(255,170,90,0)');
      g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
      return new THREE.CanvasTexture(c);
    })();
    const pools = new THREE.InstancedMesh(poolGeo, new THREE.MeshBasicMaterial({ map: poolTex, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }), lampPts.length);
    lampPts.forEach(([x, z, side], i) => {
      m.compose(p.set(x, 0, z), q.identity(), s.set(1, 1, 1));
      poles.setMatrixAt(i, m);
      heads.setMatrixAt(i, m.compose(p.set(x + side * 0.4, 0, z), q.identity(), s.set(1, 1, 1)));
      pools.setMatrixAt(i, m.compose(p.set(x + side * 1.8, 0.25, z), q.identity(), s.set(1, 1, 1)));
    });
    group.add(poles, heads, pools);
  }

  // ---------- 街上零星的车灯 ----------
  const cars = [];
  const carGeo = new THREE.BufferGeometry();
  const CAR_N = 18;
  const carPos = new Float32Array(CAR_N * 2 * 3), carCol = new Float32Array(CAR_N * 2 * 3);
  carGeo.setAttribute('position', new THREE.BufferAttribute(carPos, 3));
  carGeo.setAttribute('color', new THREE.BufferAttribute(carCol, 3));
  for (let i = 0; i < CAR_N; i++) {
    const ns = r() < 0.5;
    const lane = ns ? (xs[(r() * (xs.length - 1)) | 0] + 16.5) : (zs[(r() * (zs.length - 1)) | 0] - 17);
    cars.push({ ns, lane, t: r(), speed: (0.018 + r() * 0.02) * (r() < 0.5 ? 1 : -1) });
  }
  const carMat = new THREE.PointsMaterial({ size: 0.9, vertexColors: true, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, map: (() => {
    const c = document.createElement('canvas'); c.width = c.height = 32; const g = c.getContext('2d');
    const gr = g.createRadialGradient(16, 16, 0, 16, 16, 16); gr.addColorStop(0, '#fff'); gr.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = gr; g.fillRect(0, 0, 32, 32); return new THREE.CanvasTexture(c);
  })() });
  const carPoints = new THREE.Points(carGeo, carMat);
  carPoints.frustumCulled = false;
  group.add(carPoints);

  function update(t, dt, dawn) {
    for (const b of blinkers) {
      const on = Math.sin(t * 2.6 + b.phase) > 0.55;
      b.mesh.material.color.setRGB(on ? 3.2 : 0.25, on ? 0.2 : 0.02, on ? 0.25 : 0.03);
    }
    // 天亮后，窗灯渐渐熄灭
    const wi = 1.6 * (1 - dawn * 0.75);
    for (const mat of windowMats) mat.emissiveIntensity = wi;
    cars.forEach((c, i) => {
      c.t = (c.t + c.speed * dt + 1) % 1;
      const along = c.ns ? CITY.minZ - 10 + c.t * (CITY.maxZ - CITY.minZ + 20) : CITY.minX - 10 + c.t * (CITY.maxX - CITY.minX + 20);
      const dir = Math.sign(c.speed);
      const off = dir * 1.8;
      let x, z, dx, dz;
      if (c.ns) { x = c.lane - off; z = along; dx = 0; dz = -dir; }
      else { x = along; z = c.lane + off; dx = dir; dz = 0; }
      const k = i * 6;
      // 前灯（白）
      carPos[k] = x + dx * 1.8; carPos[k + 1] = 0.9; carPos[k + 2] = z + dz * 1.8;
      carCol[k] = 2.2; carCol[k + 1] = 2.1; carCol[k + 2] = 1.8;
      // 尾灯（红）
      carPos[k + 3] = x - dx * 1.8; carPos[k + 4] = 0.9; carPos[k + 5] = z - dz * 1.8;
      carCol[k + 3] = 2.4; carCol[k + 4] = 0.15; carCol[k + 5] = 0.1;
    });
    carGeo.attributes.position.needsUpdate = true;
    carGeo.attributes.color.needsUpdate = true;
  }

  return { group, roofs, walls, update, tallTop };
}
