import * as THREE from 'three';

// ============================================================
// 梦中飞行 —— 复现一个反复出现的梦：
// 被僵尸和鬼追 → 跳进湖里游泳 → 用游泳的姿势飞起来
// → 越飞越高 → 飞越高楼 → 落在树尖上，在树与树之间跳跃
// ============================================================

// ---------- 基础 ----------
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x070818);
scene.fog = new THREE.FogExp2(0x0a0c22, 0.0038);

const camera = new THREE.PerspectiveCamera(62, innerWidth / innerHeight, 0.1, 1200);
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(innerWidth, innerHeight);
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
document.body.appendChild(renderer.domElement);

addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
});

// ---------- 灯光 ----------
scene.add(new THREE.AmbientLight(0x4a5290, 1.6));
const moonLight = new THREE.DirectionalLight(0xaabcff, 1.6);
moonLight.position.set(-150, 220, -200);
scene.add(moonLight);
const fillLight = new THREE.HemisphereLight(0x39427a, 0x141828, 1.0);
scene.add(fillLight);

// ---------- 天空：月亮与星星 ----------
function makeGlowTexture(inner, outer) {
  const c = document.createElement('canvas'); c.width = c.height = 128;
  const g = c.getContext('2d');
  const grad = g.createRadialGradient(64, 64, 4, 64, 64, 64);
  grad.addColorStop(0, inner); grad.addColorStop(1, outer);
  g.fillStyle = grad; g.fillRect(0, 0, 128, 128);
  return new THREE.CanvasTexture(c);
}
const moon = new THREE.Mesh(
  new THREE.SphereGeometry(22, 24, 24),
  new THREE.MeshBasicMaterial({ color: 0xfff6d8, fog: false })
);
moon.position.set(-260, 260, -520);
scene.add(moon);
const moonGlow = new THREE.Sprite(new THREE.SpriteMaterial({
  map: makeGlowTexture('rgba(255,246,216,0.9)', 'rgba(255,246,216,0)'),
  transparent: true, fog: false, depthWrite: false
}));
moonGlow.scale.set(160, 160, 1);
moonGlow.position.copy(moon.position);
scene.add(moonGlow);

{
  const starGeo = new THREE.BufferGeometry();
  const n = 900, pos = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    const th = Math.random() * Math.PI * 2, ph = Math.random() * Math.PI * 0.48;
    const r = 900;
    pos[i * 3] = r * Math.sin(ph) * Math.cos(th);
    pos[i * 3 + 1] = r * Math.cos(ph) + 20;
    pos[i * 3 + 2] = r * Math.sin(ph) * Math.sin(th);
  }
  starGeo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  scene.add(new THREE.Points(starGeo, new THREE.PointsMaterial({
    color: 0xcdd6ff, size: 1.6, sizeAttenuation: false, fog: false, transparent: true, opacity: 0.85
  })));
}

// ---------- 地面 ----------
const ground = new THREE.Mesh(
  new THREE.CircleGeometry(900, 64),
  new THREE.MeshStandardMaterial({ color: 0x131c22, roughness: 1 })
);
ground.rotation.x = -Math.PI / 2;
scene.add(ground);

// ---------- 湖 ----------
const LAKE = { x: 0, z: 110, r: 55 };
const lakeBed = new THREE.Mesh(
  new THREE.CircleGeometry(LAKE.r + 3, 48),
  new THREE.MeshStandardMaterial({ color: 0x0a1524, roughness: 1 })
);
lakeBed.rotation.x = -Math.PI / 2;
lakeBed.position.set(LAKE.x, 0.02, LAKE.z);
scene.add(lakeBed);

const water = new THREE.Mesh(
  new THREE.CircleGeometry(LAKE.r, 48),
  new THREE.MeshStandardMaterial({
    color: 0x1b3a6b, roughness: 0.25, metalness: 0.3,
    transparent: true, opacity: 0.88, emissive: 0x0a1a3a, emissiveIntensity: 0.6
  })
);
water.rotation.x = -Math.PI / 2;
water.position.set(LAKE.x, 0.28, LAKE.z);
scene.add(water);

// 湖面波纹（游泳时扩散的圆环）
const ripples = [];
const rippleGeo = new THREE.RingGeometry(0.5, 0.65, 24);
function spawnRipple(x, z) {
  const m = new THREE.Mesh(rippleGeo, new THREE.MeshBasicMaterial({
    color: 0x9fd8ff, transparent: true, opacity: 0.5, side: THREE.DoubleSide, depthWrite: false
  }));
  m.rotation.x = -Math.PI / 2;
  m.position.set(x, 0.34, z);
  scene.add(m);
  ripples.push({ mesh: m, age: 0 });
}

// ---------- 出生地：墓地与枯树 ----------
const rng = mulberry32(20260814);
function mulberry32(a) {
  return function () {
    a |= 0; a = a + 0x6D2B79F5 | 0;
    let t = Math.imul(a ^ a >>> 15, 1 | a);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}
{
  const graveMat = new THREE.MeshStandardMaterial({ color: 0x3a3f4d, roughness: 0.9 });
  for (let i = 0; i < 26; i++) {
    const g = new THREE.Mesh(new THREE.BoxGeometry(1.4, 2.2, 0.4), graveMat);
    g.position.set((rng() - 0.5) * 180, 1.1, 215 + rng() * 130);
    g.rotation.y = (rng() - 0.5) * 0.8;
    g.rotation.z = (rng() - 0.5) * 0.2;
    scene.add(g);
  }
  const deadMat = new THREE.MeshStandardMaterial({ color: 0x241d18, roughness: 1 });
  for (let i = 0; i < 14; i++) {
    const t = new THREE.Group();
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.55, 9, 6), deadMat);
    trunk.position.y = 4.5;
    t.add(trunk);
    for (let b = 0; b < 3; b++) {
      const br = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.2, 4.5, 5), deadMat);
      br.position.y = 6 + b * 1.2;
      br.rotation.z = (rng() - 0.5) * 2.2;
      br.position.x = (rng() - 0.5) * 2;
      t.add(br);
    }
    let tx = (rng() - 0.5) * 260, tz = 190 + rng() * 160;
    if (Math.abs(tx) < 16) tx += tx < 0 ? -16 : 16; // 别挡住出生点的路
    t.position.set(tx, 0, tz);
    scene.add(t);
  }
  // 零散灌木
  const bushMat = new THREE.MeshStandardMaterial({ color: 0x18251c, roughness: 1 });
  for (let i = 0; i < 60; i++) {
    const b = new THREE.Mesh(new THREE.IcosahedronGeometry(0.9 + rng() * 1.4, 0), bushMat);
    const x = (rng() - 0.5) * 700, z = (rng() - 0.5) * 800;
    if (Math.hypot(x - LAKE.x, z - LAKE.z) < LAKE.r + 6) continue;
    b.position.set(x, 0.5, z);
    b.scale.y = 0.6;
    scene.add(b);
  }
}

// ---------- 平台（楼顶 / 树尖）----------
const roofs = [];   // {minX,maxX,minZ,maxZ,y,tall}
const trees = [];   // {x,z,r,y,id}
const blinkers = []; // 闪烁的航标灯

// ---------- 高楼 ----------
function makeWindowTexture(w, h, litRatio) {
  const c = document.createElement('canvas'); c.width = 128; c.height = 256;
  const g = c.getContext('2d');
  g.fillStyle = '#12141f'; g.fillRect(0, 0, 128, 256);
  const cols = 6, rows = 14;
  for (let i = 0; i < cols; i++) for (let j = 0; j < rows; j++) {
    if (Math.random() < litRatio) {
      g.fillStyle = Math.random() < 0.7 ? '#ffd88a' : '#9fd8ff';
      g.globalAlpha = 0.5 + Math.random() * 0.5;
      g.fillRect(8 + i * 20, 8 + j * 17, 10, 9);
      g.globalAlpha = 1;
    }
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}
{
  const layout = [
    { x: -60, z: -70, w: 22, d: 22, h: 34 },
    { x: -22, z: -95, w: 20, d: 20, h: 48 },
    { x: 30, z: -75, w: 24, d: 18, h: 40 },
    { x: 68, z: -105, w: 20, d: 20, h: 55 },
    { x: -75, z: -130, w: 26, d: 20, h: 60 },
    { x: 5, z: -140, w: 26, d: 26, h: 78, tall: true },   // 最高的摩天楼
    { x: 55, z: -155, w: 18, d: 18, h: 46 },
    { x: -35, z: -170, w: 22, d: 22, h: 52 },
    { x: 95, z: -70, w: 16, d: 16, h: 30 },
    { x: -105, z: -90, w: 18, d: 18, h: 38 },
  ];
  for (const b of layout) {
    const tex = makeWindowTexture(b.w, b.h, b.tall ? 0.5 : 0.35);
    const mat = new THREE.MeshStandardMaterial({
      color: 0x1a1e2e, roughness: 0.8,
      emissive: 0xffffff, emissiveMap: tex, emissiveIntensity: 0.85, map: tex
    });
    const sideMat = [mat, mat, new THREE.MeshStandardMaterial({ color: 0x232a3d, roughness: 0.9 }), // top
      new THREE.MeshStandardMaterial({ color: 0x11141f }), mat, mat];
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(b.w, b.h, b.d), sideMat);
    mesh.position.set(b.x, b.h / 2, b.z);
    scene.add(mesh);
    // 楼顶边沿
    const rim = new THREE.Mesh(
      new THREE.BoxGeometry(b.w + 1, 0.8, b.d + 1),
      new THREE.MeshStandardMaterial({ color: 0x2c3350 })
    );
    rim.position.set(b.x, b.h + 0.4, b.z);
    scene.add(rim);
    if (b.tall) {
      // 摩天楼顶的红色航标灯
      const bx = b.x + b.w / 2 - 2, bz = b.z + b.d / 2 - 2; // 立在楼顶角落
      const beaconMesh = new THREE.Mesh(new THREE.SphereGeometry(0.7, 10, 10),
        new THREE.MeshBasicMaterial({ color: 0xff4455 }));
      beaconMesh.position.set(bx, b.h + 3.4, bz);
      scene.add(beaconMesh);
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 3, 6),
        new THREE.MeshStandardMaterial({ color: 0x444a66 }));
      pole.position.set(bx, b.h + 1.9, bz);
      scene.add(pole);
      blinkers.push(beaconMesh);
    }
    roofs.push({
      minX: b.x - b.w / 2, maxX: b.x + b.w / 2,
      minZ: b.z - b.d / 2, maxZ: b.z + b.d / 2,
      y: b.h + 0.8, tall: !!b.tall
    });
  }
}

// ---------- 森林（高大的杉树，树尖可以站）----------
{
  const trunkMat = new THREE.MeshStandardMaterial({ color: 0x2b1f16, roughness: 1 });
  const leafMats = [
    new THREE.MeshStandardMaterial({ color: 0x14351f, roughness: 1 }),
    new THREE.MeshStandardMaterial({ color: 0x18402a, roughness: 1 }),
    new THREE.MeshStandardMaterial({ color: 0x0f2c1a, roughness: 1 }),
  ];
  const spots = [];
  let attempts = 0;
  while (spots.length < 26 && attempts < 500) {
    attempts++;
    const x = (rng() - 0.5) * 250;
    const z = -235 - rng() * 200;
    if (spots.some(s => Math.hypot(s.x - x, s.z - z) < 24)) continue;
    spots.push({ x, z });
  }
  spots.forEach((s, i) => {
    const h = 52 + rng() * 22; // 52~74 米，高度接近，方便连跳
    const g = new THREE.Group();
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.9, 1.6, h * 0.55, 8), trunkMat);
    trunk.position.y = h * 0.275;
    g.add(trunk);
    const mat = leafMats[i % 3];
    let base = h * 0.32;
    const layers = 5;
    for (let L = 0; L < layers; L++) {
      const t = L / (layers - 1);
      const r = (1 - t * 0.72) * (7 + rng() * 2);
      const ch = h * 0.2;
      const cone = new THREE.Mesh(new THREE.ConeGeometry(r, ch, 9), mat);
      cone.position.y = base + t * (h - base - ch * 0.4);
      g.add(cone);
    }
    // 树尖平台（视觉上略平的顶）
    const tip = new THREE.Mesh(new THREE.ConeGeometry(2.6, 3.4, 8), mat);
    tip.position.y = h - 1.2;
    g.add(tip);
    g.position.set(s.x, 0, s.z);
    scene.add(g);
    trees.push({ x: s.x, z: s.z, r: 4.4, y: h + 0.4, id: i });
  });
}

// ---------- 引导光柱 ----------
const beacon = new THREE.Mesh(
  new THREE.CylinderGeometry(2.4, 2.4, 320, 16, 1, true),
  new THREE.MeshBasicMaterial({
    color: 0x9fc4ff, transparent: true, opacity: 0.13,
    side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending
  })
);
beacon.position.set(LAKE.x, 160, LAKE.z);
scene.add(beacon);

// ---------- 玩家模型（低多边形小人）----------
const player = new THREE.Group();          // 位置 + 朝向（yaw）
const body = new THREE.Group();            // 俯仰（游泳 / 飞行时放平）
player.add(body);
scene.add(player);

const skinMat = new THREE.MeshStandardMaterial({ color: 0xe8b98a, roughness: 0.8 });
const shirtMat = new THREE.MeshStandardMaterial({ color: 0x3a7bd5, roughness: 0.8 });
const pantsMat = new THREE.MeshStandardMaterial({ color: 0x2c3350, roughness: 0.9 });

const torso = new THREE.Mesh(new THREE.BoxGeometry(0.9, 1.1, 0.5), shirtMat);
torso.position.y = 1.45;
body.add(torso);
const head = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.55, 0.55), skinMat);
head.position.y = 2.3;
body.add(head);
const hair = new THREE.Mesh(new THREE.BoxGeometry(0.58, 0.2, 0.58),
  new THREE.MeshStandardMaterial({ color: 0x1a1a22 }));
hair.position.y = 2.62;
body.add(hair);

function makeLimb(mat, len, thick) {
  const g = new THREE.Group();
  const m = new THREE.Mesh(new THREE.BoxGeometry(thick, len, thick), mat);
  m.position.y = -len / 2;
  g.add(m);
  return g;
}
const armL = makeLimb(skinMat, 1.0, 0.26); armL.position.set(-0.62, 1.95, 0); body.add(armL);
const armR = makeLimb(skinMat, 1.0, 0.26); armR.position.set(0.62, 1.95, 0); body.add(armR);
const legL = makeLimb(pantsMat, 1.0, 0.32); legL.position.set(-0.24, 0.95, 0); body.add(legL);
const legR = makeLimb(pantsMat, 1.0, 0.32); legR.position.set(0.24, 0.95, 0); body.add(legR);

// 假投影（圆形贴地阴影）
const blobShadow = new THREE.Mesh(
  new THREE.CircleGeometry(1.1, 20),
  new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.35, depthWrite: false })
);
blobShadow.rotation.x = -Math.PI / 2;
scene.add(blobShadow);

// 飞行拖尾星尘
const trailBits = [];
const trailGeo = new THREE.SphereGeometry(0.16, 6, 6);
const trailMat = new THREE.MeshBasicMaterial({
  color: 0xcdd8ff, transparent: true, opacity: 0.8, depthWrite: false, blending: THREE.AdditiveBlending
});
function spawnTrail(p) {
  const m = new THREE.Mesh(trailGeo, trailMat.clone());
  m.position.copy(p);
  m.position.x += (Math.random() - 0.5) * 0.6;
  m.position.y += (Math.random() - 0.5) * 0.6;
  m.position.z += (Math.random() - 0.5) * 0.6;
  scene.add(m);
  trailBits.push({ mesh: m, age: 0 });
}

// ---------- 僵尸 ----------
const zombies = [];
{
  const zBodyMat = new THREE.MeshStandardMaterial({ color: 0x4a7a45, roughness: 1 });
  const zClothMat = new THREE.MeshStandardMaterial({ color: 0x3d3a30, roughness: 1 });
  for (let i = 0; i < 14; i++) {
    const z = new THREE.Group();
    const zb = new THREE.Group();
    z.add(zb);
    const t = new THREE.Mesh(new THREE.BoxGeometry(0.95, 1.1, 0.5), zClothMat);
    t.position.y = 1.45; zb.add(t);
    const h = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.6, 0.6), zBodyMat);
    h.position.y = 2.3; zb.add(h);
    const e1 = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.1, 0.05),
      new THREE.MeshBasicMaterial({ color: 0xff2222 }));
    e1.position.set(-0.14, 2.35, 0.31); zb.add(e1);
    const e2 = e1.clone(); e2.position.x = 0.14; zb.add(e2);
    const aL = makeLimb(zBodyMat, 1.0, 0.26); aL.position.set(-0.64, 1.95, 0);
    aL.rotation.x = -Math.PI / 2.2; zb.add(aL); // 僵尸手向前伸
    const aR = makeLimb(zBodyMat, 1.0, 0.26); aR.position.set(0.64, 1.95, 0);
    aR.rotation.x = -Math.PI / 2.4; zb.add(aR);
    const lL = makeLimb(zClothMat, 1.0, 0.34); lL.position.set(-0.25, 0.95, 0); zb.add(lL);
    const lR = makeLimb(zClothMat, 1.0, 0.34); lR.position.set(0.25, 0.95, 0); zb.add(lR);
    const ang = (i / 14) * Math.PI * 1.2 - Math.PI * 0.6;
    z.position.set(Math.sin(ang) * 55 + (rng() - 0.5) * 30, 0, 300 + Math.cos(ang) * 40 + rng() * 40);
    scene.add(z);
    zombies.push({ mesh: z, inner: zb, limbs: { aL, aR, lL, lR }, speed: 9.2 + (i % 4) * 0.7, phase: rng() * 10 });
  }
}

// ---------- 鬼 ----------
const ghosts = [];
{
  for (let i = 0; i < 5; i++) {
    const g = new THREE.Group();
    const sheet = new THREE.Mesh(
      new THREE.ConeGeometry(0.9, 2.6, 10, 1, true),
      new THREE.MeshStandardMaterial({
        color: 0xdfe6ff, transparent: true, opacity: 0.55,
        emissive: 0x8899ff, emissiveIntensity: 0.5, side: THREE.DoubleSide
      })
    );
    sheet.position.y = 1.6;
    g.add(sheet);
    const headG = new THREE.Mesh(new THREE.SphereGeometry(0.55, 12, 12),
      new THREE.MeshStandardMaterial({
        color: 0xeef2ff, transparent: true, opacity: 0.7,
        emissive: 0x9aa8ff, emissiveIntensity: 0.6
      }));
    headG.position.y = 2.8;
    g.add(headG);
    const eyeMat = new THREE.MeshBasicMaterial({ color: 0x111133 });
    const ey1 = new THREE.Mesh(new THREE.SphereGeometry(0.09, 6, 6), eyeMat);
    ey1.position.set(-0.18, 2.9, 0.48); g.add(ey1);
    const ey2 = ey1.clone(); ey2.position.x = 0.18; g.add(ey2);
    const glow = new THREE.Sprite(new THREE.SpriteMaterial({
      map: makeGlowTexture('rgba(160,175,255,0.55)', 'rgba(160,175,255,0)'),
      transparent: true, depthWrite: false
    }));
    glow.scale.set(6, 6, 1); glow.position.y = 2;
    g.add(glow);
    g.position.set((rng() - 0.5) * 120, 0, 320 + rng() * 60);
    scene.add(g);
    ghosts.push({ mesh: g, speed: 10.5 + i * 0.4, phase: rng() * 10 });
  }
}

// ============================================================
// 游戏状态
// ============================================================
const S = {
  phase: 'title',          // title | escape | swim | dream | free
  pos: new THREE.Vector3(0, 0, 290),
  vel: new THREE.Vector3(),
  heading: Math.PI,        // 面向 -z（湖的方向）
  grounded: true,
  groundKind: 'ground',    // ground | roof | tree | water
  groundTreeId: -1,
  dreamPower: 0,
  strokeCd: 0,
  strokeAnim: 0,
  maxAlt: 0,
  strokes: 0,
  treeJumps: 0,
  lastTreeId: -1,
  runTime: 0,
  msgTimer: 0,
  caughtLock: 0,
  ended: false,
};
const obj = { lake: false, power: false, fly: false, high: false, roof: false, tree: false, jumps: false };

const keys = {};
addEventListener('keydown', e => {
  keys[e.code] = true;
  if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) e.preventDefault();
  if (e.code === 'Enter') onEnter();
});
addEventListener('keyup', e => { keys[e.code] = false; });

function onEnter() {
  if (S.phase === 'title') {
    document.getElementById('startOverlay').style.display = 'none';
    S.phase = 'escape';
    showMessage('快跑！它们追上来了！', '冲向前方发光的湖 —— 梦里的水是安全的', 4.5);
    updateControls();
  } else if (S.ended && document.getElementById('endOverlay').style.display !== 'none') {
    document.getElementById('endOverlay').style.display = 'none';
    S.phase = 'free';
    showMessage('继续做梦吧', '整个梦境都是你的了，自由飞行', 4);
    updateControls();
  }
}

// ---------- HUD ----------
const msgEl = document.getElementById('message');
const subEl = document.getElementById('submessage');
function showMessage(main, sub, dur = 3.5) {
  msgEl.textContent = main;
  subEl.textContent = sub || '';
  msgEl.style.opacity = 1;
  subEl.style.opacity = 1;
  S.msgTimer = dur;
}
function setObj(id, state) { // done | todo | locked
  const el = document.getElementById('obj-' + id);
  el.className = 'obj ' + state;
}
function refreshObjectives() {
  setObj('lake', obj.lake ? 'done' : 'todo');
  setObj('power', obj.power ? 'done' : (obj.lake ? 'todo' : 'locked'));
  setObj('fly', obj.fly ? 'done' : (obj.power ? 'todo' : 'locked'));
  setObj('high', obj.high ? 'done' : (obj.fly ? 'todo' : 'locked'));
  setObj('roof', obj.roof ? 'done' : (obj.fly ? 'todo' : 'locked'));
  setObj('tree', obj.tree ? 'done' : (obj.fly ? 'todo' : 'locked'));
  setObj('jumps', obj.jumps ? 'done' : (obj.tree ? 'todo' : 'locked'));
}
refreshObjectives();

const controlsEl = document.getElementById('controls');
function updateControls() {
  if (S.phase === 'escape') {
    controlsEl.innerHTML = '<b>W</b> 向前跑 · <b>A / D</b> 转向<br><b>空格</b> 跳跃<br>别回头！';
  } else if (S.phase === 'swim') {
    controlsEl.innerHTML = '<b>W</b> 向前游 · <b>A / D</b> 转向<br>不停地游，积攒梦力……';
  } else {
    controlsEl.innerHTML = '<b>空格</b> 划水冲刺（飞行的关键！）<br><b>W</b> 滑翔向前 · <b>A / D</b> 转向<br><b>Shift</b> 下降 · <b>S</b> 减速<br>落到楼顶 / 树尖上可以站立，<b>空格</b> 起跳';
  }
}

const powerWrap = document.getElementById('powerWrap');
const powerFill = document.getElementById('powerFill');
const altimeter = document.getElementById('altimeter');
const altNum = altimeter.querySelector('.num');

// ---------- 工具 ----------
function forwardVec() {
  return new THREE.Vector3(Math.sin(S.heading), 0, Math.cos(S.heading));
}
function inLake(x, z, margin = 0) {
  return Math.hypot(x - LAKE.x, z - LAKE.z) < LAKE.r - margin;
}
// 计算脚下支撑面高度（地面 / 楼顶 / 树尖），返回 {y, kind, treeId}
function supportAt(x, z, py) {
  let best = { y: 0, kind: inLake(x, z, 1) ? 'water' : 'ground', treeId: -1 };
  for (const r of roofs) {
    if (x > r.minX - 0.4 && x < r.maxX + 0.4 && z > r.minZ - 0.4 && z < r.maxZ + 0.4) {
      if (r.y <= py + 1.2 && r.y > best.y) best = { y: r.y, kind: r.tall ? 'tallroof' : 'roof', treeId: -1 };
    }
  }
  for (const t of trees) {
    if (Math.hypot(x - t.x, z - t.z) < t.r) {
      if (t.y <= py + 1.2 && t.y > best.y) best = { y: t.y, kind: 'tree', treeId: t.id };
    }
  }
  return best;
}

function resetToStart() {
  S.pos.set(0, 0, 290);
  S.vel.set(0, 0, 0);
  S.heading = Math.PI;
  S.grounded = true;
  S.dreamPower = 0;
  zombies.forEach((z, i) => {
    const ang = (i / 14) * Math.PI * 1.2 - Math.PI * 0.6;
    z.mesh.position.set(Math.sin(ang) * 55 + (rng() - 0.5) * 30, 0, 335 + Math.cos(ang) * 40);
  });
  ghosts.forEach((g, i) => {
    g.mesh.position.set((rng() - 0.5) * 120, 0, 350 + rng() * 40);
  });
}

// ============================================================
// 主循环
// ============================================================
const clock = new THREE.Clock();
let time = 0;

function animate() {
  requestAnimationFrame(animate);
  const dt = Math.min(clock.getDelta(), 0.05);
  time += dt;

  if (S.phase !== 'title') update(dt);
  updateFX(dt);
  updateCamera(dt);
  renderer.render(scene, camera);
}

function update(dt) {
  const fwd = forwardVec();
  const turnSpd = (S.phase === 'escape' || S.phase === 'swim') ? 2.8 : 2.2;
  if (keys['KeyA'] || keys['ArrowLeft']) S.heading += turnSpd * dt;
  if (keys['KeyD'] || keys['ArrowRight']) S.heading -= turnSpd * dt;

  // ------- 阶段逻辑 -------
  if (S.phase === 'escape') updateEscape(dt, fwd);
  else if (S.phase === 'swim') updateSwim(dt, fwd);
  else updateDream(dt, fwd);

  // ------- 消息淡出 -------
  if (S.msgTimer > 0) {
    S.msgTimer -= dt;
    if (S.msgTimer <= 0) { msgEl.style.opacity = 0; subEl.style.opacity = 0; }
  }

  // ------- 敌人 -------
  updateEnemies(dt);

  // ------- 应用位置 -------
  player.position.copy(S.pos);
  player.rotation.y = S.heading;

  // 假影子
  const sup = supportAt(S.pos.x, S.pos.z, 1e9);
  blobShadow.position.set(S.pos.x, sup.y + 0.06, S.pos.z);
  const dh = Math.max(0, S.pos.y - sup.y);
  blobShadow.material.opacity = Math.max(0, 0.35 - dh * 0.004);
  blobShadow.scale.setScalar(1 + dh * 0.01);

  // 动画
  animatePlayer(dt);

  // HUD
  const alt = Math.max(0, S.pos.y);
  if (obj.fly) {
    altimeter.style.display = 'block';
    altNum.textContent = alt.toFixed(0);
  }
  powerFill.style.width = Math.min(100, S.dreamPower) + '%';
}

// ------- 逃亡 -------
function updateEscape(dt, fwd) {
  S.runTime += dt;
  const running = keys['KeyW'] || keys['ArrowUp'];
  const back = keys['KeyS'] || keys['ArrowDown'];
  const spd = running ? 15 : (back ? -6 : 0);
  S.pos.x += fwd.x * spd * dt;
  S.pos.z += fwd.z * spd * dt;

  // 跳跃
  if (S.grounded && keys['Space']) { S.vel.y = 9; S.grounded = false; }
  if (!S.grounded) {
    S.vel.y -= 26 * dt;
    S.pos.y += S.vel.y * dt;
    if (S.pos.y <= 0) { S.pos.y = 0; S.vel.y = 0; S.grounded = true; }
  }

  // 被抓
  if (S.caughtLock > 0) { S.caughtLock -= dt; }
  else {
    for (const z of zombies) {
      if (z.mesh.position.distanceTo(S.pos) < 1.8 && S.pos.y < 2.5) return caught();
    }
    for (const g of ghosts) {
      if (g.mesh.position.distanceTo(S.pos) < 1.9 && S.pos.y < 3) return caught();
    }
  }

  // 入水
  if (inLake(S.pos.x, S.pos.z, 3)) {
    S.phase = 'swim';
    obj.lake = true;
    refreshObjectives();
    updateControls();
    powerWrap.style.display = 'block';
    beacon.material.opacity = 0.0;
    showMessage('扑通！安全了……', '僵尸和鬼不敢下水。往前游，游着游着就会想起怎么飞', 5);
    for (let i = 0; i < 10; i++) spawnRipple(S.pos.x + (Math.random() - 0.5) * 3, S.pos.z + (Math.random() - 0.5) * 3);
  }
}

function caught() {
  S.caughtLock = 3;
  const ov = document.getElementById('caughtOverlay');
  ov.style.display = 'flex';
  setTimeout(() => { ov.style.display = 'none'; }, 1800);
  resetToStart();
}

// ------- 游泳 -------
function updateSwim(dt, fwd) {
  const swimming = keys['KeyW'] || keys['ArrowUp'];
  const spd = swimming ? 8.5 : 1.5;
  const nx = S.pos.x + fwd.x * spd * dt;
  const nz = S.pos.z + fwd.z * spd * dt;
  // 不许游出湖（梦的边界感）—— 除非已经会飞
  if (inLake(nx, nz, 1.5)) { S.pos.x = nx; S.pos.z = nz; }
  S.pos.y = -0.55 + Math.sin(time * 3.2) * 0.12;

  S.dreamPower += (swimming ? 17 : 4) * dt;
  if (swimming && Math.random() < dt * 8) spawnRipple(S.pos.x, S.pos.z);

  if (S.dreamPower >= 40 && !S._hint40) { S._hint40 = true; showMessage('身体开始变轻了……', '继续游！', 3); }
  if (S.dreamPower >= 100) {
    S.phase = 'dream';
    obj.power = true; obj.fly = true;
    refreshObjectives();
    updateControls();
    powerWrap.style.display = 'none';
    S.vel.set(fwd.x * 4, 7, fwd.z * 4);
    S.grounded = false;
    showMessage('你飞起来了！！', '保持游泳的姿势 —— 按空格划水，一下一下，越飞越高！', 6);
    beacon.position.set(5, 200, -140); // 指向摩天楼
    beacon.material.opacity = 0.12;
  }
}

// ------- 梦境飞行（含楼顶 / 树尖着陆）-------
function updateDream(dt, fwd) {
  S.strokeCd -= dt;
  const sup = supportAt(S.pos.x, S.pos.z, S.pos.y);

  if (S.grounded) {
    // 站在楼顶 / 树尖 / 地面上
    const walking = keys['KeyW'] || keys['ArrowUp'];
    const back = keys['KeyS'] || keys['ArrowDown'];
    const spd = walking ? 8 : (back ? -4 : 0);
    S.pos.x += fwd.x * spd * dt;
    S.pos.z += fwd.z * spd * dt;
    const s2 = supportAt(S.pos.x, S.pos.z, S.pos.y);
    if (s2.y < S.pos.y - 0.4) {
      // 走出边缘 → 落下（但这是梦，可以随时划水）
      S.grounded = false;
      S.vel.set(fwd.x * spd * 0.6, 0, fwd.z * spd * 0.6);
    } else {
      S.pos.y = s2.y;
    }
    if (keys['Space'] && S.strokeCd <= 0) {
      // 起跳：树尖上是超级大跳
      const big = S.groundKind === 'tree';
      S.vel.set(fwd.x * (big ? 9 : 5), big ? 16 : 11, fwd.z * (big ? 9 : 5));
      S.grounded = false;
      S.strokeCd = 0.35;
      S.strokeAnim = 1;
      if (big) showFleeting('跳！');
    }
  } else {
    // 空中：游泳式飞行
    const gravity = S.vel.y > 0 ? -6.5 : -9;
    S.vel.y += gravity * dt;
    S.vel.y = Math.max(S.vel.y, -16);

    if (keys['Space'] && S.strokeCd <= 0) {
      S.strokeCd = 0.42;
      S.strokeAnim = 1;
      S.strokes++;
      S.vel.x += fwd.x * 7.5;
      S.vel.z += fwd.z * 7.5;
      S.vel.y = Math.max(S.vel.y, 0) * 0.4 + 8.2;
    }
    if (keys['KeyW'] || keys['ArrowUp']) {
      S.vel.x += fwd.x * 13 * dt;
      S.vel.z += fwd.z * 13 * dt;
    }
    if (keys['KeyS'] || keys['ArrowDown']) {
      S.vel.x *= Math.exp(-2.2 * dt);
      S.vel.z *= Math.exp(-2.2 * dt);
    }
    if (keys['ShiftLeft'] || keys['ShiftRight']) S.vel.y -= 18 * dt;

    // 空气阻力 + 限速
    S.vel.x *= Math.exp(-0.55 * dt);
    S.vel.z *= Math.exp(-0.55 * dt);
    const hs = Math.hypot(S.vel.x, S.vel.z);
    if (hs > 26) { S.vel.x *= 26 / hs; S.vel.z *= 26 / hs; }
    // 软高度上限
    if (S.pos.y > 150 && S.vel.y > 0) S.vel.y *= Math.exp(-2 * dt);

    // 梦境磁力：下落时轻轻被最近的树尖吸引（梦里跳树总是刚好落上）
    if (S.vel.y < 0) {
      let bestT = null, bestD = 10;
      for (const t of trees) {
        const d = Math.hypot(S.pos.x - t.x, S.pos.z - t.z);
        if (d < bestD && S.pos.y > t.y - 2 && S.pos.y < t.y + 30) { bestD = d; bestT = t; }
      }
      if (bestT) {
        S.vel.x += (bestT.x - S.pos.x) * 1.6 * dt;
        S.vel.z += (bestT.z - S.pos.z) * 1.6 * dt;
      }
    }

    S.pos.addScaledVector(S.vel, dt);

    // 拖尾
    if (Math.random() < dt * 20) spawnTrail(S.pos.clone().add(new THREE.Vector3(0, 1, 0)));

    // 着陆检测
    const s3 = supportAt(S.pos.x, S.pos.z, S.pos.y);
    if (S.vel.y <= 0 && S.pos.y <= s3.y + 0.25) {
      if (s3.kind === 'water') {
        // 落回湖里 —— 浮着，可以再次划水起飞
        S.pos.y = -0.4;
        S.vel.set(0, 0, 0);
        spawnRipple(S.pos.x, S.pos.z);
        if (keys['Space'] && S.strokeCd <= 0) { /* 立即可再飞 */ }
      } else {
        S.pos.y = s3.y;
        S.vel.set(0, 0, 0);
        S.grounded = true;
        S.groundKind = s3.kind === 'tallroof' ? 'roof' : s3.kind;
        onLand(s3);
      }
    }

    // 最高纪录
    if (S.pos.y > S.maxAlt) {
      S.maxAlt = S.pos.y;
      if (!obj.high && S.maxAlt >= 50) {
        obj.high = true;
        refreshObjectives();
        showMessage('越飞越高！', '整座城市都在你脚下。前面就是高楼和森林', 4);
      }
    }
  }
}

function onLand(sup) {
  if (sup.kind === 'tallroof' && !obj.roof) {
    obj.roof = true;
    refreshObjectives();
    showMessage('登上了最高的楼顶！', '远处的森林里，树尖在月光下发亮 —— 飞过去！', 5);
    const t = trees[Math.floor(trees.length / 2)];
    beacon.position.set(t.x, 200, t.z);
  }
  if (sup.kind === 'tree') {
    if (!obj.tree) {
      obj.tree = true;
      refreshObjectives();
      showMessage('站上树尖了！', '在树尖起跳会跳得特别高 —— 连跳 5 棵树！', 5);
      beacon.material.opacity = 0;
    }
    if (sup.treeId !== S.lastTreeId) {
      if (S.lastTreeId !== -1) {
        S.treeJumps++;
        showFleeting(`树尖跳跃 ${S.treeJumps} / 5`);
        if (S.treeJumps >= 5 && !obj.jumps) {
          obj.jumps = true;
          refreshObjectives();
          endDream();
        }
      }
      S.lastTreeId = sup.treeId;
    }
  }
  if (sup.kind === 'ground') {
    S.lastTreeId = -1;
  }
  S.groundTreeId = sup.treeId;
}

let fleetTimer = null;
function showFleeting(text) {
  msgEl.textContent = text;
  subEl.textContent = '';
  msgEl.style.opacity = 1;
  if (fleetTimer) clearTimeout(fleetTimer);
  fleetTimer = setTimeout(() => { if (S.msgTimer <= 0) msgEl.style.opacity = 0; }, 1200);
}

function endDream() {
  S.ended = true;
  setTimeout(() => {
    document.getElementById('endStats').innerHTML =
      `这一夜，你从僵尸和鬼的手里逃了出来，<br>` +
      `游过一片湖，然后用游泳的姿势飞上了天。<br><br>` +
      `最高飞行高度：<b>${S.maxAlt.toFixed(0)} 米</b>　·　` +
      `划水次数：<b>${S.strokes}</b> 下　·　` +
      `树尖跳跃：<b>${S.treeJumps}</b> 棵树`;
    document.getElementById('endOverlay').style.display = 'flex';
  }, 1200);
}

// ------- 敌人 AI -------
function updateEnemies(dt) {
  const chasing = S.phase === 'escape';
  for (const z of zombies) {
    const p = z.mesh.position;
    const target = chasing ? S.pos : null;
    if (target) {
      const dx = target.x - p.x, dz = target.z - p.z;
      const d = Math.hypot(dx, dz);
      if (d > 0.5) {
        const nx = p.x + dx / d * z.speed * dt;
        const nz = p.z + dz / d * z.speed * dt;
        // 僵尸不下水
        if (!inLake(nx, nz, -2)) { p.x = nx; p.z = nz; }
        z.mesh.rotation.y = Math.atan2(dx, dz);
      }
    } else {
      // 梦境阶段：慢慢游荡
      p.x += Math.sin(time * 0.3 + z.phase) * 0.6 * dt;
      p.z += Math.cos(time * 0.25 + z.phase) * 0.6 * dt;
    }
    // 蹒跚动画
    const s = Math.sin(time * 7 + z.phase);
    z.limbs.lL.rotation.x = s * 0.55;
    z.limbs.lR.rotation.x = -s * 0.55;
    z.inner.rotation.z = Math.sin(time * 3.5 + z.phase) * 0.08;
  }
  for (const g of ghosts) {
    const p = g.mesh.position;
    if (chasing) {
      const dx = S.pos.x - p.x, dz = S.pos.z - p.z;
      const d = Math.hypot(dx, dz);
      if (d > 0.5) {
        const wob = Math.sin(time * 2.2 + g.phase) * 4;
        const nx = p.x + (dx / d * g.speed + Math.cos(time + g.phase) * wob * 0.3) * dt;
        const nz = p.z + dz / d * g.speed * dt;
        if (!inLake(nx, nz, -1)) { p.x = nx; p.z = nz; }
        g.mesh.rotation.y = Math.atan2(dx, dz);
      }
    } else {
      p.x += Math.sin(time * 0.4 + g.phase) * 1.2 * dt;
      p.z += Math.cos(time * 0.33 + g.phase) * 1.2 * dt;
    }
    p.y = 0.6 + Math.sin(time * 2.4 + g.phase) * 0.5;
  }
}

// ------- 玩家动画 -------
function animatePlayer(dt) {
  S.strokeAnim = Math.max(0, S.strokeAnim - dt * 2.2);

  if (S.phase === 'escape' || (S.grounded && S.phase !== 'swim')) {
    // 直立
    body.rotation.x = THREE.MathUtils.lerp(body.rotation.x, 0, 1 - Math.exp(-10 * dt));
    body.position.y = 0;
    const moving = keys['KeyW'] || keys['ArrowUp'] || keys['KeyS'] || keys['ArrowDown'];
    if (moving) {
      const s = Math.sin(time * 11);
      legL.rotation.x = s * 0.9;
      legR.rotation.x = -s * 0.9;
      armL.rotation.x = -s * 0.8;
      armR.rotation.x = s * 0.8;
      armL.rotation.z = 0; armR.rotation.z = 0;
    } else {
      legL.rotation.x = legR.rotation.x = 0;
      armL.rotation.x = Math.sin(time * 1.5) * 0.06;
      armR.rotation.x = -Math.sin(time * 1.5) * 0.06;
      armL.rotation.z = 0; armR.rotation.z = 0;
    }
  } else {
    // 游泳 / 飞行：身体放平，蛙泳划水
    const targetPitch = 1.35;
    body.rotation.x = THREE.MathUtils.lerp(body.rotation.x, targetPitch, 1 - Math.exp(-6 * dt));
    body.position.y = S.phase === 'swim' ? 0.6 : 0.9;

    // 蛙泳循环：手臂从前伸 → 向外划开 → 收回
    const cycle = S.phase === 'swim' ? time * 4.5 : time * 3.2;
    const stroke = S.strokeAnim; // 划水瞬间的强化
    const sweep = (Math.sin(cycle) * 0.5 + 0.5); // 0..1
    const armForward = -2.6;   // 手臂指向头前方向
    const armOut = 1.1 + stroke * 0.5;
    armL.rotation.x = armForward + sweep * 1.3 + stroke * 0.5;
    armR.rotation.x = armForward + sweep * 1.3 + stroke * 0.5;
    armL.rotation.z = -(1 - sweep) * armOut * 0.5 - 0.15;
    armR.rotation.z = (1 - sweep) * armOut * 0.5 + 0.15;

    // 蹬腿
    const kick = Math.sin(cycle + 1.2);
    legL.rotation.x = 0.25 + kick * 0.45 + stroke * 0.4;
    legR.rotation.x = 0.25 - kick * 0.45 + stroke * 0.4;

    // 飞行时轻微侧倾
    if (S.phase !== 'swim') {
      const roll = (keys['KeyA'] || keys['ArrowLeft'] ? 0.25 : 0) - (keys['KeyD'] || keys['ArrowRight'] ? 0.25 : 0);
      body.rotation.z = THREE.MathUtils.lerp(body.rotation.z, roll, 1 - Math.exp(-5 * dt));
    }
  }
}

// ------- 粒子与环境动画 -------
function updateFX(dt) {
  for (let i = ripples.length - 1; i >= 0; i--) {
    const r = ripples[i];
    r.age += dt;
    r.mesh.scale.setScalar(1 + r.age * 6);
    r.mesh.material.opacity = Math.max(0, 0.5 - r.age * 0.45);
    if (r.age > 1.2) { scene.remove(r.mesh); r.mesh.material.dispose(); ripples.splice(i, 1); }
  }
  for (let i = trailBits.length - 1; i >= 0; i--) {
    const t = trailBits[i];
    t.age += dt;
    t.mesh.material.opacity = Math.max(0, 0.8 - t.age * 1.1);
    t.mesh.position.y -= dt * 0.5;
    if (t.age > 0.8) { scene.remove(t.mesh); t.mesh.material.dispose(); trailBits.splice(i, 1); }
  }
  // 引导光柱呼吸
  if (beacon.material.opacity > 0.01) {
    beacon.material.opacity = 0.1 + Math.sin(time * 2) * 0.045;
  }
  // 航标灯闪烁
  for (const b of blinkers) {
    b.material.color.setHex(Math.sin(time * 4) > 0 ? 0xff4455 : 0x551118);
  }
  // 水面微光
  water.material.emissiveIntensity = 0.5 + Math.sin(time * 1.7) * 0.15;
}

// ------- 相机 -------
const camPos = new THREE.Vector3(0, 6, 302);
function updateCamera(dt) {
  const fwd = forwardVec();
  let dist = 9, height = 4.2, lookAhead = 6, lookUp = 2;
  if (S.phase === 'swim') { dist = 10; height = 5; }
  if (S.phase === 'dream' || S.phase === 'free') {
    if (!S.grounded) { dist = 12; height = 4.5; lookAhead = 10; lookUp = 1; }
    else { dist = 10; height = 4.5; }
  }
  if (S.phase === 'title') {
    // 开场：环绕镜头
    const a = time * 0.12;
    camera.position.set(Math.sin(a) * 24, 8 + Math.sin(time * 0.3) * 2, 290 + Math.cos(a) * 24);
    camera.lookAt(S.pos.x, 3, S.pos.z);
    return;
  }
  const target = new THREE.Vector3(
    S.pos.x - fwd.x * dist,
    S.pos.y + height,
    S.pos.z - fwd.z * dist
  );
  const k = 1 - Math.exp(-4.5 * dt);
  camPos.lerp(target, k);
  camera.position.copy(camPos);
  camera.lookAt(
    S.pos.x + fwd.x * lookAhead,
    S.pos.y + lookUp,
    S.pos.z + fwd.z * lookAhead
  );
}

// 初始位置
player.position.copy(S.pos);
resetToStart();
animate();

// ---------- 调试钩子（供自动化测试） ----------
window.__dream = {
  S, obj, keys, camera, renderer, trees, roofs,
  step(dt = 1 / 60, n = 1) {
    for (let i = 0; i < n; i++) {
      time += dt;
      if (S.phase !== 'title') update(dt);
      updateFX(dt);
      updateCamera(dt);
    }
    renderer.render(scene, camera);
  },
  setSize(w, h) {
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    renderer.setSize(w, h, false);
  },
  shot(q = 0.7) {
    renderer.render(scene, camera);
    return renderer.domElement.toDataURL('image/jpeg', q);
  }
};
