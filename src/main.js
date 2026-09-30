import * as THREE from 'three';
import { START, LAKE, WORLD_R } from './config.js';
import { smooth, clamp01, mulberry32 } from './noise.js';
import { shared, atmos, computeAtmos, createSky } from './sky.js';
import { heightAt, createTerrain, createGrass, createLakeFlora } from './terrain.js';
import { createWater } from './water.js';
import { createGraveyard } from './graveyard.js';
import { createCity } from './city.js';
import { createForest, swayOffset } from './forest.js';
import { createPlayerModel, createZombieModel, createGhostModel, applyPose, PoseBlender, Poses } from './characters.js';
import { createClouds, createMotes, createFireflies, ParticlePool, createAirRipples, createBeacon } from './fx.js';
import { createPost } from './post.js';
import { DreamAudio } from './audio.js';

// ============================================================
// 梦中飞行 —— 复现一个反复出现的梦：
// 被僵尸和鬼追 → 跳进湖里游泳 → 用游泳的姿势飞起来
// → 越飞越高 → 飞越高楼 → 落在树尖上，在树与树之间跳跃 → 天亮了
// ============================================================

const PI = Math.PI;
const $ = id => document.getElementById(id);
const nextFrame = () => new Promise(r => setTimeout(r, 16)); // 用 setTimeout：后台标签页里 rAF 会停

// ---------- 渲染器 ----------
const renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));
renderer.setSize(innerWidth, innerHeight);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
document.body.prepend(renderer.domElement);

const scene = new THREE.Scene();
scene.fog = new THREE.FogExp2(0x0b0e26, 0.0026);
const camera = new THREE.PerspectiveCamera(60, innerWidth / innerHeight, 0.1, 2600);
camera.position.set(0, 4, START.z + 10);

const post = createPost(renderer, scene, camera);
// 每帧检查窗口尺寸（有些环境改变视口时不会触发 resize 事件）
const _size = new THREE.Vector2();
function checkResize() {
  if (window.__dream && window.__dream.fixedSize) return;
  renderer.getSize(_size);
  if (_size.x === innerWidth && _size.y === innerHeight) return;
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
  post.setSize(innerWidth, innerHeight);
}

// ---------- 光 ----------
const hemi = new THREE.HemisphereLight(0x2b3a7a, 0x0c0d18, 1.1);
scene.add(hemi);
const mainLight = new THREE.DirectionalLight(0x9db4ff, 1.2);
mainLight.castShadow = true;
mainLight.shadow.mapSize.set(2048, 2048);
Object.assign(mainLight.shadow.camera, { left: -70, right: 70, top: 70, bottom: -70, near: 1, far: 700 });
mainLight.shadow.bias = -0.0004;
mainLight.shadow.normalBias = 0.05;
scene.add(mainLight, mainLight.target);

// ---------- 世界（异步分步构建，显示进度）----------
const W = {}; // 世界里的各个部件
const loadBar = $('loadFill'), loadText = $('loadText');
async function stage(label, frac, fn) {
  loadText.textContent = label;
  loadBar.style.width = (frac * 100).toFixed(0) + '%';
  await nextFrame();
  fn();
}

async function buildWorld() {
  await stage('铺开夜空……', 0.05, () => {
    W.sky = createSky();
    scene.add(W.sky.mesh);
  });
  await stage('隆起山丘……', 0.15, () => { W.terrain = createTerrain(); scene.add(W.terrain); });
  await stage('长出青草……', 0.3, () => { W.grass = createGrass(); scene.add(W.grass); });
  await stage('注满湖水……', 0.4, () => {
    W.water = createWater(); scene.add(W.water.mesh);
    W.flora = createLakeFlora(); scene.add(W.flora.group);
  });
  await stage('竖起墓碑……', 0.5, () => { W.grave = createGraveyard(); scene.add(W.grave.group); });
  await stage('盖起城市……', 0.62, () => { W.city = createCity(); scene.add(W.city.group); });
  await stage('种下巨树……', 0.75, () => { W.forest = createForest(); scene.add(W.forest.group); });
  await stage('聚起云雾……', 0.85, () => {
    W.clouds = createClouds(); scene.add(W.clouds.clouds, W.clouds.mist);
    W.motes = createMotes(); scene.add(W.motes.points);
    W.fireflies = createFireflies(); scene.add(W.fireflies.points);
    W.particles = new ParticlePool(); scene.add(W.particles.points);
    W.airRipples = createAirRipples(); scene.add(W.airRipples.group);
    W.beacon = createBeacon(); scene.add(W.beacon.mesh);
  });
  await stage('唤醒它们……', 0.93, () => { buildActors(); });
  await stage('入梦……', 1, () => {
    W.pmrem = new THREE.PMREMGenerator(renderer);
    refreshEnv(0);
    renderer.compile(scene, camera);
  });
}

let envDawn = -1, envRT = null;
function refreshEnv(dawn) {
  computeAtmos(dawn);
  const rt = W.pmrem.fromScene(W.sky.envScene, 0.03);
  if (envRT) envRT.dispose();
  envRT = rt;
  scene.environment = rt.texture;
  envDawn = dawn;
}

// ---------- 角色 ----------
let rig, blender;
const zombies = [], ghosts = [];
function buildActors() {
  rig = createPlayerModel();
  blender = new PoseBlender();
  scene.add(rig.root);

  const r = mulberry32(99);
  // 大多数从身后的坟里爬出来，还有几个在前方两侧
  const behind = W.grave.graves.filter(g => g.z > START.z + 4).slice(0, 9);
  const front = W.grave.graves.filter(g => g.z < START.z - 4 && Math.abs(g.x) > 8 && Math.abs(g.x) < 40)
    .sort((a, b) => Math.abs(a.x) - Math.abs(b.x)).slice(0, 7);
  [...behind, ...front].forEach((gv, i) => {
    const zr = createZombieModel(1000 + i * 17);
    zr.root.visible = false;
    scene.add(zr.root);
    zombies.push({
      rig: zr, blender: new PoseBlender(), grave: gv.clone(), pos: new THREE.Vector3(),
      state: 'buried', riseDelay: i < 9 ? 0.4 + i * 0.3 : 0.25 + (i - 9) * 0.3, riseT: 0,
      speed: 8.2 + r() * 2.4, phase: r() * 10, heading: 0, groanT: 2 + r() * 6,
    });
  });
  const ghostStarts = [[48, 326], [-40, 340], [30, 350], [-60, 300], [70, 300]];
  ghostStarts.forEach(([x, z], i) => {
    const g = createGhostModel(i * 1.7);
    g.visible = false;
    scene.add(g);
    ghosts.push({ g, pos: new THREE.Vector3(x, 0, z), start: new THREE.Vector3(x, 0, z), speed: 9.6 + i * 0.45, phase: r() * 10, appear: 0, delay: 1.2 + i * 0.6 });
  });
}

// ============================================================
// 游戏状态
// ============================================================
const S = {
  phase: 'loading',        // loading | title | escape | swim | dream | free
  pos: new THREE.Vector3(START.x, 0, START.z),
  vel: new THREE.Vector3(),
  heading: START.heading,
  grounded: true,
  groundKind: 'ground',    // ground | roof | tallroof | tree | water
  treeId: -1,
  inWater: false,
  dreamPower: 0,
  strokeCd: 0,
  strokeT: 1,
  runCycle: 0, swimCycle: 0,
  moveSpeed: 0,
  maxAlt: 0, strokes: 0, treeJumps: 0, lastTreeId: -1,
  escapeTime: 0, msgTimer: 0, caughtLock: 0, ended: false,
  dawn: 0, dawnTarget: 0,
  danger: 0, fade: 0,
  hint40: false, hintClouds: false, hintEdge: 0, leftTree: -1,
};
const obj = { lake: false, power: false, fly: false, high: false, roof: false, tree: false, jumps: false };
const audio = new DreamAudio();

const keys = {};
addEventListener('keydown', e => {
  keys[e.code] = true;
  if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) e.preventDefault();
  if (e.code === 'Enter') onEnter();
  if (e.code === 'KeyM') { const m = audio.toggleMute(); showFleeting(m ? '静音' : '声音开启'); }
});
addEventListener('keyup', e => { keys[e.code] = false; });
addEventListener('blur', () => { for (const k in keys) keys[k] = false; });
$('startOverlay').addEventListener('click', () => onEnter());
$('endOverlay').addEventListener('click', () => onEnter());

const K = {
  fwd: () => keys.KeyW || keys.ArrowUp,
  back: () => keys.KeyS || keys.ArrowDown,
  left: () => keys.KeyA || keys.ArrowLeft,
  right: () => keys.KeyD || keys.ArrowRight,
  jump: () => keys.Space,
  down: () => keys.ShiftLeft || keys.ShiftRight,
};

function onEnter() {
  if (S.phase === 'title') {
    audio.init();
    $('startOverlay').classList.add('hidden');
    S.phase = 'escape';
    S.escapeTime = 0;
    showMessage('快跑！它们从坟里爬出来了！', '冲向前方发光的湖 —— 梦里的水是安全的', 4.5);
    updateControls();
    $('hud').classList.add('show');
  } else if (S.ended && $('endOverlay').classList.contains('show')) {
    $('endOverlay').classList.remove('show');
    S.phase = 'free';
    showMessage('继续做梦吧', '整个梦境都是你的了，自由飞行', 4);
    updateControls();
  }
}

// ---------- HUD ----------
const msgEl = $('message'), subEl = $('submessage');
function showMessage(main, sub, dur = 3.5) {
  msgEl.textContent = main;
  subEl.textContent = sub || '';
  msgEl.style.opacity = 1; subEl.style.opacity = 1;
  S.msgTimer = dur;
}
let fleetTimer = null;
function showFleeting(text) {
  msgEl.textContent = text; subEl.textContent = '';
  msgEl.style.opacity = 1;
  if (fleetTimer) clearTimeout(fleetTimer);
  fleetTimer = setTimeout(() => { if (S.msgTimer <= 0) msgEl.style.opacity = 0; }, 1200);
}
function setObj(id, state) { $('obj-' + id).className = 'obj ' + state; }
function refreshObjectives() {
  setObj('lake', obj.lake ? 'done' : 'todo');
  setObj('power', obj.power ? 'done' : (obj.lake ? 'todo' : 'locked'));
  setObj('fly', obj.fly ? 'done' : (obj.power ? 'todo' : 'locked'));
  setObj('high', obj.high ? 'done' : (obj.fly ? 'todo' : 'locked'));
  setObj('roof', obj.roof ? 'done' : (obj.fly ? 'todo' : 'locked'));
  setObj('tree', obj.tree ? 'done' : (obj.fly ? 'todo' : 'locked'));
  setObj('jumps', obj.jumps ? 'done' : (obj.tree ? 'todo' : 'locked'));
}
function complete(id) {
  if (obj[id]) return;
  obj[id] = true;
  refreshObjectives();
  audio.chime();
}
refreshObjectives();

const controlsEl = $('controls');
function updateControls() {
  if (S.phase === 'escape') {
    controlsEl.innerHTML = '<b>W</b> 向前跑 · <b>A / D</b> 转向<br><b>空格</b> 跳跃<br>别回头！';
  } else if (S.phase === 'swim') {
    controlsEl.innerHTML = '<b>W</b> 向前游 · <b>A / D</b> 转向<br>不停地游，积攒梦力……';
  } else {
    controlsEl.innerHTML = '<b>空格</b> 划水（飞行的关键！一下一下按）<br><b>W</b> 向前滑翔 · <b>A / D</b> 转向<br><b>Shift</b> 下降 · <b>S</b> 减速<br>落在楼顶 / 树尖上可以站住，<b>空格</b> 起跳';
  }
  controlsEl.innerHTML += '<br><span class="mute">M 静音</span>';
}
const powerWrap = $('powerWrap'), powerFill = $('powerFill');
const altimeter = $('altimeter'), altNum = altimeter.querySelector('.num');

// ---------- 工具 ----------
const fwdVec = (h = S.heading) => new THREE.Vector3(Math.sin(h), 0, Math.cos(h));
const inLake = (x, z, margin = 0) => Math.hypot(x - LAKE.x, z - LAKE.z) < LAKE.r - margin;
// 僵尸和鬼不敢下水：岸边以外才算“干地”
const dry = (x, z, h = 0.25) => !inLake(x, z, -14) || heightAt(x, z) > h;

// 脚下支撑面：地面 / 水 / 楼顶 / 树尖
function supportAt(x, z, py) {
  let best = { y: heightAt(x, z), kind: 'ground', treeId: -1 };
  if (inLake(x, z, 1) && best.y < 0) best = { y: 0, kind: 'water', treeId: -1 };
  for (const r of W.city.roofs) {
    const inside = r.type === 'box'
      ? (x > r.minX - 0.3 && x < r.maxX + 0.3 && z > r.minZ - 0.3 && z < r.maxZ + 0.3)
      : Math.hypot(x - r.x, z - r.z) < r.r + 0.3;
    if (inside && r.y <= py + 1.2 && r.y > best.y) best = { y: r.y, kind: r.tall ? 'tallroof' : 'roof', treeId: -1 };
  }
  for (const t of W.forest.trees) {
    if (Math.hypot(x - t.x, z - t.z) < t.r && t.y <= py + 1.2 && t.y > best.y) best = { y: t.y, kind: 'tree', treeId: t.id };
  }
  return best;
}

// 楼的墙体：把人推出去
function collideWalls(prevY) {
  const R = 0.45;
  for (const w of W.city.walls) {
    if (S.pos.y >= w.top - 0.05 || prevY >= w.top - 0.3) continue;
    if (w.type === 'box') {
      const x0 = w.minX - R, x1 = w.maxX + R, z0 = w.minZ - R, z1 = w.maxZ + R;
      const { x, z } = S.pos;
      if (x > x0 && x < x1 && z > z0 && z < z1) {
        const d = [x - x0, x1 - x, z - z0, z1 - z];
        const m = Math.min(...d);
        if (m === d[0]) { S.pos.x = x0; S.vel.x = Math.min(S.vel.x, 0); }
        else if (m === d[1]) { S.pos.x = x1; S.vel.x = Math.max(S.vel.x, 0); }
        else if (m === d[2]) { S.pos.z = z0; S.vel.z = Math.min(S.vel.z, 0); }
        else { S.pos.z = z1; S.vel.z = Math.max(S.vel.z, 0); }
      }
    } else {
      const dx = S.pos.x - w.x, dz = S.pos.z - w.z, d = Math.hypot(dx, dz);
      if (d < w.r + R && d > 1e-4) {
        S.pos.x = w.x + dx / d * (w.r + R); S.pos.z = w.z + dz / d * (w.r + R);
        const vn = (S.vel.x * dx + S.vel.z * dz) / d;
        if (vn < 0) { S.vel.x -= vn * dx / d; S.vel.z -= vn * dz / d; }
      }
    }
  }
}

function resetZombies(quick) {
  zombies.forEach((z, i) => {
    z.state = 'buried'; z.riseT = 0;
    z.rig.root.visible = false;
    if (quick) z.riseDelay = 0.3 + i * 0.15;
  });
  ghosts.forEach((g, i) => { g.pos.copy(g.start); g.appear = 0; g.g.visible = false; if (quick) g.delay = 0.5 + i * 0.3; });
}

function resetToStart() {
  S.pos.set(START.x, heightAt(START.x, START.z), START.z);
  S.vel.set(0, 0, 0);
  S.heading = START.heading;
  S.grounded = true;
  S.dreamPower = 0;
  S.escapeTime = 0;
  resetZombies(true);
}

// ============================================================
// 主循环
// ============================================================
const clock = new THREE.Clock();
let time = 0;
const tmpV = new THREE.Vector3(), tmpV2 = new THREE.Vector3();

// 自适应画质：持续掉帧就降低渲染分辨率
let perfAcc = 0, perfN = 0, pixelRatio = renderer.getPixelRatio();
function adaptQuality(rawDt) {
  perfAcc += rawDt; perfN++;
  if (perfN < 120) return;
  const avg = perfAcc / perfN;
  perfAcc = 0; perfN = 0;
  if (avg > 0.024 && pixelRatio > 0.6) {
    pixelRatio = Math.max(0.6, pixelRatio * 0.85);
    renderer.setPixelRatio(pixelRatio);
    post.composer.setPixelRatio(pixelRatio);
    post.setSize(innerWidth, innerHeight);
  }
}

function frame() {
  requestAnimationFrame(frame);
  const rawDt = clock.getDelta();
  const dt = Math.min(rawDt, 0.05);
  if (S.phase !== 'loading' && rawDt < 0.2) adaptQuality(rawDt);
  checkResize();
  if (!window.__dream.paused) tick(dt); // 调试暂停时只渲染，不推进
  post.composer.render(dt);
}

function tick(dt) {
  time += dt;
  shared.uTime.value = time;
  if (S.phase === 'escape' || S.phase === 'swim' || S.phase === 'dream' || S.phase === 'free') update(dt);
  else if (S.phase === 'title') { animatePlayer(dt); rig.root.position.copy(S.pos); rig.root.rotation.y = S.heading; }
  updateEnemies(dt);
  updateWorld(dt);
  updateCamera(dt);
}

function update(dt) {
  const turn = (S.phase === 'escape' || S.phase === 'swim' || S.grounded) ? 2.6 : 2.0;
  if (K.left()) S.heading += turn * dt;
  if (K.right()) S.heading -= turn * dt;
  const fwd = fwdVec();

  if (S.phase === 'escape') updateEscape(dt, fwd);
  else if (S.phase === 'swim') updateSwim(dt, fwd);
  else updateDream(dt, fwd);

  if (S.msgTimer > 0) {
    S.msgTimer -= dt;
    if (S.msgTimer <= 0) { msgEl.style.opacity = 0; subEl.style.opacity = 0; }
  }

  rig.root.position.copy(S.pos);
  rig.root.rotation.y = S.heading;
  animatePlayer(dt);

  if (obj.fly) {
    altimeter.classList.add('show');
    altNum.textContent = Math.max(0, S.pos.y).toFixed(0);
  }
  powerFill.style.width = Math.min(100, S.dreamPower) + '%';
}

// ------- 逃亡 -------
function updateEscape(dt, fwd) {
  S.escapeTime += dt;
  const target = K.fwd() ? 13 : (K.back() ? -5 : 0);
  S.moveSpeed += (target - S.moveSpeed) * (1 - Math.exp(-6 * dt));
  S.pos.x += fwd.x * S.moveSpeed * dt;
  S.pos.z += fwd.z * S.moveSpeed * dt;
  // 不许跑出梦的边界太远
  S.pos.x = THREE.MathUtils.clamp(S.pos.x, -260, 260);
  S.pos.z = Math.min(S.pos.z, 420);

  const gy = heightAt(S.pos.x, S.pos.z);
  if (S.grounded && K.jump()) { S.vel.y = 7.5; S.grounded = false; }
  if (!S.grounded) {
    S.vel.y -= 22 * dt;
    S.pos.y += S.vel.y * dt;
    if (S.pos.y <= gy) { S.pos.y = gy; S.vel.y = 0; S.grounded = true; audio.land(); }
  } else S.pos.y = gy;

  // 被抓
  if (S.caughtLock > 0) S.caughtLock -= dt;
  else {
    for (const z of zombies) {
      if (z.state === 'walk' && Math.hypot(z.pos.x - S.pos.x, z.pos.z - S.pos.z) < 1.0 && S.pos.y - z.pos.y < 1.4) return caught();
    }
    for (const g of ghosts) {
      if (g.appear > 0.8 && Math.hypot(g.pos.x - S.pos.x, g.pos.z - S.pos.z) < 1.2 && S.pos.y - g.pos.y < 1.8) return caught();
    }
  }

  // 入水
  if (inLake(S.pos.x, S.pos.z, -8) && gy < -0.35) {
    S.phase = 'swim';
    complete('lake');
    updateControls();
    powerWrap.classList.add('show');
    showMessage('扑通！安全了……', '僵尸和鬼不敢下水。往前游，游着游着就会想起怎么飞', 5);
    splash(S.pos.x, S.pos.z, 1.5);
    S.moveSpeed = 6;
  }
}

function caught() {
  S.caughtLock = 3;
  const ov = $('caughtOverlay');
  ov.classList.add('show');
  audio.noiseBurst({ dur: 1.2, freq: 200, q: 0.5, gain: 0.5, type: 'lowpass' });
  setTimeout(() => ov.classList.remove('show'), 1800);
  resetToStart();
}

function splash(x, z, k = 1) {
  W.water.ripple(x, z, 1.4 * k);
  setTimeout(() => W.water.ripple(x + 0.5, z - 0.3, 0.9 * k), 220);
  for (let i = 0; i < 80 * k; i++) {
    const a = Math.random() * PI * 2, s = 1 + Math.random() * 4;
    W.particles.emit({ x: x + Math.cos(a) * 0.5, y: 0.1, z: z + Math.sin(a) * 0.5, vx: Math.cos(a) * s, vy: 3 + Math.random() * 6 * k, vz: Math.sin(a) * s, g: 14, drag: 0.5, life: 0.8 + Math.random() * 0.6, size: 0.12 + Math.random() * 0.12, r: 0.7, gg: 0.9, b: 1.3 });
  }
  audio.splash();
}

// ------- 游泳 -------
function updateSwim(dt, fwd) {
  const swimming = K.fwd();
  let spd;
  if (swimming) {
    S.swimCycle = (S.swimCycle + dt / 1.1) % 1;
    const surge = Math.exp(-Math.pow((S.swimCycle - 0.78) * 5, 2));
    spd = 5 + 6 * surge;
    if (Math.abs(S.swimCycle - 0.7) < dt / 1.1) { W.water.ripple(S.pos.x, S.pos.z, 0.8); audio.stroke(true); }
  } else spd = 0.8;
  S.moveSpeed += (spd - S.moveSpeed) * (1 - Math.exp(-5 * dt));
  const nx = S.pos.x + fwd.x * S.moveSpeed * dt, nz = S.pos.z + fwd.z * S.moveSpeed * dt;
  const hn = heightAt(nx, nz);
  if (hn < -0.6 || hn < heightAt(S.pos.x, S.pos.z)) { S.pos.x = nx; S.pos.z = nz; }
  S.pos.y = -1.02 + Math.sin(time * 2.6) * 0.05;

  S.dreamPower += (swimming ? 17 : 3) * dt;
  if (swimming && Math.random() < dt * 14) {
    const b = fwdVec().multiplyScalar(-0.8);
    W.particles.emit({ x: S.pos.x + b.x + (Math.random() - 0.5) * 0.6, y: 0.05, z: S.pos.z + b.z + (Math.random() - 0.5) * 0.6, vy: 0.6, g: 2, life: 0.8, size: 0.08, r: 0.5, gg: 0.8, b: 1.2 });
  }

  if (S.dreamPower >= 40 && !S.hint40) { S.hint40 = true; showMessage('身体开始变轻了……', '继续游！', 3); }
  if (S.dreamPower >= 100) {
    S.phase = 'dream';
    complete('power'); obj.fly = true; refreshObjectives();
    updateControls();
    powerWrap.classList.remove('show');
    S.vel.set(fwd.x * 4, 8, fwd.z * 4);
    S.grounded = false;
    S.strokeT = 0.1;
    splash(S.pos.x, S.pos.z, 1);
    showMessage('你飞起来了！！', '保持游泳的姿势 —— 按空格划水，一下一下，越飞越高！', 6);
    audio.chime([523.3, 659.3, 784, 1046.5, 1318.5]);
  }
}

// ------- 梦境飞行（含楼顶 / 树尖着陆）-------
function strokeFX() {
  const f = fwdVec();
  const c = tmpV.copy(S.pos).add(tmpV2.set(0, 0.95, 0)).addScaledVector(f, -0.8);
  W.airRipples.spawn(c, f);
  for (let i = 0; i < 26; i++) {
    const a = Math.random() * PI * 2, s = 2 + Math.random() * 3;
    const side = new THREE.Vector3(Math.cos(a), Math.sin(a), 0).applyAxisAngle(new THREE.Vector3(0, 1, 0), S.heading);
    W.particles.emit({ x: c.x, y: c.y, z: c.z, vx: side.x * s - f.x * 3, vy: side.y * s, vz: side.z * s - f.z * 3, drag: 2.5, life: 0.9, size: 0.12, r: 0.6, gg: 0.85, b: 1.5 });
  }
  audio.stroke(S.inWater);
}

function updateDream(dt, fwd) {
  S.strokeCd -= dt;
  const prevY = S.pos.y;

  if (S.grounded) {
    const onTree = S.groundKind === 'tree';
    const target = onTree ? 0 : (K.fwd() ? 7 : (K.back() ? -3 : 0));
    S.moveSpeed += (target - S.moveSpeed) * (1 - Math.exp(-8 * dt));
    if (onTree) {
      // 站在树尖上：跟着树一起摇
      const t = W.forest.trees[S.treeId];
      const o = swayOffset(t.x, t.z, time, { x: 0, z: 0 });
      S.pos.set(t.x + o.x * t.h, t.y, t.z + o.z * t.h);
    } else {
      S.pos.x += fwd.x * S.moveSpeed * dt;
      S.pos.z += fwd.z * S.moveSpeed * dt;
      collideWalls(prevY);
      const s2 = supportAt(S.pos.x, S.pos.z, S.pos.y);
      if (s2.y < S.pos.y - 0.4) {
        S.grounded = false; // 走出楼顶边缘：掉下去（但这是梦，随时可以划水）
        S.vel.set(fwd.x * S.moveSpeed * 0.8, 0, fwd.z * S.moveSpeed * 0.8);
      } else S.pos.y = s2.y;
    }
    if (K.jump() && S.strokeCd <= 0) {
      const big = onTree;
      S.leftTree = big ? S.treeId : -1;
      S.vel.set(fwd.x * (big ? 9 : 5), big ? 16 : 11, fwd.z * (big ? 9 : 5));
      S.grounded = false;
      S.strokeCd = 0.35;
      S.strokeT = 0.05;
      if (big) { showFleeting('跳！'); W.airRipples.spawn(tmpV.copy(S.pos), new THREE.Vector3(0, 1, 0)); }
      audio.stroke(false);
    }
    return;
  }

  // ---- 空中：游泳式飞行 ----
  const gravity = S.vel.y > 0 ? -6.5 : -9;
  S.vel.y += gravity * dt;
  S.vel.y = Math.max(S.vel.y, -16);

  if (K.jump() && S.strokeCd <= 0) {
    S.strokeCd = 0.42;
    S.strokeT = 0.08;
    S.strokes++;
    S.vel.x += fwd.x * 7.5;
    S.vel.z += fwd.z * 7.5;
    S.vel.y = Math.max(S.vel.y, 0) * 0.4 + 8.2;
    strokeFX();
    S.inWater = false;
  }
  if (K.fwd()) { S.vel.x += fwd.x * 13 * dt; S.vel.z += fwd.z * 13 * dt; }
  if (K.back()) { S.vel.x *= Math.exp(-2.2 * dt); S.vel.z *= Math.exp(-2.2 * dt); }
  if (K.down()) S.vel.y -= 18 * dt;

  // 空气阻力、限速、软高度上限
  S.vel.x *= Math.exp(-0.55 * dt);
  S.vel.z *= Math.exp(-0.55 * dt);
  const hs = Math.hypot(S.vel.x, S.vel.z);
  if (hs > 26) { S.vel.x *= 26 / hs; S.vel.z *= 26 / hs; }
  if (S.pos.y > 190 && S.vel.y > 0) S.vel.y *= Math.exp(-2 * dt);

  // 梦的边界：轻轻把人推回来
  const edge = Math.hypot(S.pos.x, S.pos.z + 60);
  if (edge > WORLD_R) {
    S.vel.x -= S.pos.x / edge * 20 * dt;
    S.vel.z -= (S.pos.z + 60) / edge * 20 * dt;
    if (time - S.hintEdge > 6) { S.hintEdge = time; showMessage('梦的边缘……', '再往外就什么都没有了', 2.5); }
  }

  // 梦境磁力：下落时轻轻被最近的树尖吸引（梦里跳树总是刚好落上）
  if (S.vel.y < 0) {
    let bestT = null, bestD = 13;
    for (const t of W.forest.trees) {
      const d = Math.hypot(S.pos.x - t.x, S.pos.z - t.z);
      if (d < bestD && S.pos.y > t.y - 1 && S.pos.y < t.y + 35 && t.id !== S.leftTree) { bestD = d; bestT = t; }
    }
    if (bestT) {
      // 把水平速度平滑地“对准”树尖（带阻尼，不会来回晃），越接近越稳
      const k = 1 - Math.exp(-3.2 * dt);
      S.vel.x += ((bestT.x - S.pos.x) * 1.4 - S.vel.x) * k;
      S.vel.z += ((bestT.z - S.pos.z) * 1.4 - S.vel.z) * k;
    }
  }

  S.pos.addScaledVector(S.vel, dt);
  collideWalls(prevY);
  if (S.leftTree >= 0) {
    const lt = W.forest.trees[S.leftTree];
    if (Math.hypot(S.pos.x - lt.x, S.pos.z - lt.z) > 14) S.leftTree = -1;
  }

  // 星尘拖尾：从手脚洒出来
  if (!S.inWater) {
    for (const j of [rig.lWr, rig.rWr, rig.lAnk, rig.rAnk]) {
      if (Math.random() < dt * 14) {
        j.getWorldPosition(tmpV);
        const warm = S.dawn * 0.6;
        W.particles.emit({ x: tmpV.x, y: tmpV.y, z: tmpV.z, vx: S.vel.x * 0.1, vy: -0.3, vz: S.vel.z * 0.1, drag: 1, life: 1.2, size: 0.1 + Math.random() * 0.08, r: 0.7 + warm, gg: 0.8 + warm * 0.3, b: 1.5 - warm * 0.6 });
      }
    }
  }

  // 着陆
  const s3 = supportAt(S.pos.x, S.pos.z, S.pos.y);
  if (S.vel.y <= 0 && S.pos.y <= s3.y + 0.25) {
    if (s3.kind === 'water') {
      // 落回湖里 —— 浮着，再划水就能再飞
      if (!S.inWater) splash(S.pos.x, S.pos.z, 0.6);
      S.inWater = true;
      S.pos.y = -1.02;
      S.vel.set(0, 0, 0);
      if (Math.random() < dt * 2) W.water.ripple(S.pos.x, S.pos.z, 0.4);
    } else {
      S.pos.y = s3.y;
      S.vel.set(0, 0, 0);
      S.grounded = true;
      S.inWater = false;
      S.groundKind = s3.kind === 'tallroof' ? 'roof' : s3.kind;
      S.treeId = s3.treeId;
      onLand(s3);
    }
  }

  if (S.pos.y > S.maxAlt) {
    S.maxAlt = S.pos.y;
    if (!obj.high && S.maxAlt >= 50) {
      complete('high');
      showMessage('越飞越高！', '整座城市都在你脚下。前面就是高楼和森林', 4);
    }
    if (!S.hintClouds && S.maxAlt >= 158) {
      S.hintClouds = true;
      showMessage('云海之上', '月亮从来没有离得这么近', 4);
    }
  }
}

function onLand(sup) {
  audio.land();
  for (let i = 0; i < 14; i++) {
    const a = Math.random() * PI * 2;
    W.particles.emit({ x: S.pos.x, y: S.pos.y + 0.1, z: S.pos.z, vx: Math.cos(a) * 2, vy: 0.5, vz: Math.sin(a) * 2, drag: 3, life: 0.6, size: 0.1, r: 0.8, gg: 0.9, b: 1.3 });
  }
  if (sup.kind === 'tallroof' && !obj.roof) {
    complete('roof');
    showMessage('登上了最高的楼顶！', '远处的森林里，巨树的树尖在月光下发亮 —— 飞过去！', 5);
  }
  if (sup.kind === 'tree') {
    if (!obj.tree) {
      complete('tree');
      showMessage('站上树尖了！', '在树尖起跳会跳得特别高 —— 连跳 5 棵树！', 5);
    }
    if (sup.treeId !== S.lastTreeId) {
      if (S.lastTreeId !== -1) {
        S.treeJumps++;
        showFleeting(`树尖跳跃 ${S.treeJumps} / 5`);
        audio.chime([784 * Math.pow(1.122, S.treeJumps), 1046.5 * Math.pow(1.122, S.treeJumps)]);
        if (S.treeJumps >= 5 && !obj.jumps) { complete('jumps'); endDream(); }
      }
      S.lastTreeId = sup.treeId;
    }
  }
  if (sup.kind === 'ground') S.lastTreeId = -1;
}

function endDream() {
  S.ended = true;
  setTimeout(() => {
    $('endStats').innerHTML =
      `这一夜，你从僵尸和鬼的手里逃了出来，<br>` +
      `游过一片湖，然后用游泳的姿势飞上了天。<br><br>` +
      `最高飞行高度 <b>${S.maxAlt.toFixed(0)} 米</b>　·　` +
      `划水 <b>${S.strokes}</b> 下　·　` +
      `树尖跳跃 <b>${S.treeJumps}</b> 棵`;
    $('endOverlay').classList.add('show');
  }, 2600);
}

// ------- 敌人 -------
function updateEnemies(dt) {
  if (!zombies.length) return;
  const chasing = S.phase === 'escape';
  let nearest = 1e9;
  for (const z of zombies) {
    if (z.state === 'buried') {
      if (chasing && S.escapeTime > z.riseDelay) {
        z.state = 'rising'; z.riseT = 0;
        z.pos.set(z.grave.x, heightAt(z.grave.x, z.grave.z), z.grave.z);
        z.heading = Math.atan2(S.pos.x - z.pos.x, S.pos.z - z.pos.z);
        z.rig.root.visible = true;
        if (Math.random() < 0.5) audio.groan();
      } else continue;
    }
    const gy = heightAt(z.pos.x, z.pos.z);
    let pose;
    if (z.state === 'rising') {
      z.riseT += dt;
      const k = smooth(0, 1.3, z.riseT);
      z.pos.y = gy - 1.9 * (1 - k);
      pose = Poses.zombieRise(time + z.phase);
      if (Math.random() < dt * 30 * (1 - k)) {
        W.particles.emit({ x: z.pos.x + (Math.random() - 0.5), y: gy + 0.1, z: z.pos.z + (Math.random() - 0.5), vx: (Math.random() - 0.5) * 2, vy: 2 + Math.random() * 2, vz: (Math.random() - 0.5) * 2, g: 9, life: 0.7, size: 0.08, r: 0.25, gg: 0.2, b: 0.15 });
      }
      if (z.riseT > 1.3) z.state = 'walk';
    } else {
      let moving = false;
      if (chasing) {
        const dx = S.pos.x - z.pos.x, dz = S.pos.z - z.pos.z, d = Math.hypot(dx, dz);
        nearest = Math.min(nearest, d);
        if (d > 0.6) {
          const nx = z.pos.x + dx / d * z.speed * dt, nz = z.pos.z + dz / d * z.speed * dt;
          if (dry(nx, nz)) { z.pos.x = nx; z.pos.z = nz; moving = true; }
          z.heading = Math.atan2(dx, dz);
        }
      } else {
        // 玩家下水后：它们聚在岸边，徒劳地伸着手
        const dx = LAKE.x - z.pos.x, dz = LAKE.z - z.pos.z, d = Math.hypot(dx, dz);
        const sp = 1.2;
        const nx = z.pos.x + dx / d * sp * dt, nz = z.pos.z + dz / d * sp * dt;
        if (d < 140 && dry(nx, nz, 1.5)) { z.pos.x = nx; z.pos.z = nz; moving = true; }
        z.heading += (Math.atan2(S.pos.x - z.pos.x, S.pos.z - z.pos.z) - z.heading) * 0.02;
      }
      z.pos.y = heightAt(z.pos.x, z.pos.z);
      pose = Poses.zombieWalk(time * (moving ? z.speed * 0.55 : 1.5) + z.phase, moving ? 1 : 0.25);
      z.groanT -= dt;
      if (z.groanT < 0 && chasing) { z.groanT = 4 + Math.random() * 7; if (Math.hypot(S.pos.x - z.pos.x, S.pos.z - z.pos.z) < 30) audio.groan(); }
    }
    z.rig.root.position.copy(z.pos);
    z.rig.root.rotation.y = z.heading;
    applyPose(z.rig, z.blender.update(pose, dt, 10));
  }

  for (const g of ghosts) {
    if (chasing && S.escapeTime > g.delay) g.appear = Math.min(1, g.appear + dt * 0.8);
    if (g.appear <= 0) { g.g.visible = false; continue; }
    g.g.visible = true;
    g.g.userData.mat.uniforms.uAlpha.value = g.appear;
    if (chasing) {
      const dx = S.pos.x - g.pos.x, dz = S.pos.z - g.pos.z, d = Math.hypot(dx, dz);
      nearest = Math.min(nearest, d);
      if (d > 0.5 && g.appear > 0.5) {
        const wob = Math.sin(time * 1.7 + g.phase) * 3.5;
        const nx = g.pos.x + (dx / d * g.speed + (-dz / d) * wob) * dt;
        const nz = g.pos.z + (dz / d * g.speed + (dx / d) * wob) * dt;
        if (dry(nx, nz)) { g.pos.x = nx; g.pos.z = nz; }
        g.g.rotation.y = Math.atan2(dx, dz);
      }
    } else {
      g.pos.x += Math.sin(time * 0.4 + g.phase) * 1.5 * dt;
      g.pos.z += Math.cos(time * 0.33 + g.phase) * 1.5 * dt;
    }
    g.pos.y = heightAt(g.pos.x, g.pos.z) + 0.5 + Math.sin(time * 2.2 + g.phase) * 0.35;
    g.g.position.copy(g.pos);
    if (Math.random() < dt * 20) {
      W.particles.emit({ x: g.pos.x + (Math.random() - 0.5) * 0.8, y: g.pos.y + 0.3 + Math.random() * 1.5, z: g.pos.z + (Math.random() - 0.5) * 0.8, vy: 0.3, drag: 1, life: 1.2, size: 0.18, r: 0.35, gg: 0.4, b: 0.8 });
    }
  }
  const target = chasing ? clamp01(1 - (nearest - 2) / 22) : 0;
  S.danger += (target - S.danger) * (1 - Math.exp(-3 * dt));
}

// ------- 玩家动画 -------
function animatePlayer(dt) {
  let pose, rate = 10;
  const roll = (K.left() ? 0.35 : 0) - (K.right() ? 0.35 : 0);
  if (S.phase === 'title' || S.phase === 'loading') pose = Poses.idle(time);
  else if (S.phase === 'escape') {
    if (!S.grounded) pose = Poses.jump(S.vel.y);
    else if (Math.abs(S.moveSpeed) > 0.8) { S.runCycle += dt * Math.abs(S.moveSpeed) * 0.72; pose = Poses.run(S.runCycle, clamp01(Math.abs(S.moveSpeed) / 13)); rate = 16; }
    else pose = Poses.idle(time);
  } else if (S.phase === 'swim' || S.inWater) {
    if (S.phase === 'swim' && K.fwd()) { pose = Poses.breaststroke(S.swimCycle); rate = 14; }
    else pose = Poses.tread(time);
  } else if (S.grounded) {
    if (S.groundKind === 'tree') pose = Poses.balance(time);
    else if (Math.abs(S.moveSpeed) > 0.5) { S.runCycle += dt * Math.abs(S.moveSpeed) * 0.72; pose = Poses.run(S.runCycle, clamp01(Math.abs(S.moveSpeed) / 13)); }
    else pose = Poses.idle(time);
  } else {
    const pitch = PI / 2 - THREE.MathUtils.clamp(S.vel.y * 0.035, -0.45, 0.4);
    if (S.strokeT < 1) {
      S.strokeT += dt / 0.85;
      pose = Poses.breaststroke(Math.min(S.strokeT, 0.999), pitch);
      pose.roll = roll;
      rate = 16;
    } else if (S.vel.y < -12) pose = Poses.fall(time, pitch + 0.25);
    else pose = Poses.glide(time, pitch, roll);
  }
  applyPose(rig, blender.update(pose, dt, rate));
}

// ------- 世界：天色、光照、特效 -------
function updateWorld(dt) {
  // 梦的进度决定天色
  let target = 0;
  if (S.phase === 'swim') target = 0.04;
  if (obj.fly) target = 0.12;
  if (obj.high) target = 0.22;
  if (obj.roof) target = 0.38;
  if (obj.tree) target = 0.52 + S.treeJumps * 0.096;
  if (S.ended) target = 1;
  S.dawnTarget = target;
  S.dawn += (target - S.dawn) * (1 - Math.exp(-(S.ended ? 0.35 : 0.25) * dt));
  shared.uDawn.value = S.dawn;
  computeAtmos(S.dawn);
  if (Math.abs(S.dawn - envDawn) > 0.04) refreshEnv(S.dawn);

  scene.fog.color.copy(atmos.fog);
  scene.fog.density = THREE.MathUtils.lerp(0.0026, 0.0016, S.dawn);
  hemi.color.copy(atmos.hemiSky); hemi.groundColor.copy(atmos.hemiGround); hemi.intensity = atmos.hemiIntensity;
  mainLight.color.copy(atmos.lightColor);
  mainLight.intensity = atmos.lightIntensity;
  // 阴影相机跟着玩家
  const focus = S.phase === 'title' || S.phase === 'loading' ? tmpV.set(START.x, 0, START.z) : S.pos;
  mainLight.target.position.copy(focus);
  mainLight.position.copy(focus).addScaledVector(atmos.lightDir, 350);
  mainLight.target.updateMatrixWorld();
  renderer.toneMappingExposure = THREE.MathUtils.lerp(1.05, 0.9, S.dawn);

  W.sky.mesh.position.copy(camera.position);
  W.water.update(atmos);
  W.grave.update(time);
  W.city.update(time, dt, S.dawn);
  W.forest.update(time, obj.fly, S.groundKind === 'tree' && S.grounded ? S.treeId : S.lastTreeId);
  W.clouds.update(atmos, S.dawn);
  W.motes.uniforms.uCam.value.copy(camera.position);
  W.motes.uniforms.uAmount.value = (S.phase === 'dream' || S.phase === 'free') ? 0.9 : 0.45;
  W.fireflies.uniforms.uNight.value = 1 - smooth(0.6, 0.95, S.dawn);
  W.particles.update(dt);
  W.airRipples.update(dt);

  // 指引光柱
  let beaconTarget = 0;
  const bp = W.beacon.mesh.position;
  if (S.phase === 'escape') { bp.set(LAKE.x, 0, LAKE.z); beaconTarget = 0.5; }
  else if ((S.phase === 'dream') && !obj.roof) { bp.set(0, W.city.tallTop, -130); beaconTarget = 0.4; }
  else if (S.phase === 'dream' && !obj.tree) { const t = W.forest.trees[13]; bp.set(t.x, t.y + 2, t.z); beaconTarget = 0.4; }
  W.beacon.uniforms.uOpacity.value += (beaconTarget - W.beacon.uniforms.uOpacity.value) * (1 - Math.exp(-2 * dt));

  // 后期参数
  const spd = S.vel.length();
  const flying = (S.phase === 'dream' || S.phase === 'free') && !S.grounded;
  post.dream.uTime.value = time;
  post.dream.uSpeed.value += ((flying ? smooth(14, 30, spd) : 0) - post.dream.uSpeed.value) * (1 - Math.exp(-4 * dt));
  post.dream.uDanger.value = S.danger;
  post.bloom.strength = THREE.MathUtils.lerp(0.8, 0.5, S.dawn);

  audio.update({
    chase: S.danger,
    speed: flying ? spd : Math.abs(S.moveSpeed) * 0.3,
    dawn: S.dawn,
    nearWater: clamp01(1 - (Math.hypot(S.pos.x - LAKE.x, S.pos.z - LAKE.z) - LAKE.r) / 40) * clamp01(1 - S.pos.y / 40),
  });
}

// ------- 相机 -------
const camPos = new THREE.Vector3(0, 6, START.z + 12);
const lookPos = new THREE.Vector3(0, 1, START.z);
let camRoll = 0, camFov = 60, camHeading = START.heading;
function updateCamera(dt) {
  if (S.phase === 'title' || S.phase === 'loading') {
    // 开场：缓缓环绕，身后是墓地，远处是湖和月亮
    const a = time * 0.07 + 0.6;
    camera.position.set(START.x + Math.sin(a) * 9, heightAt(START.x, START.z) + 2.4 + Math.sin(time * 0.3) * 0.4, START.z + Math.cos(a) * 9);
    camera.lookAt(START.x, heightAt(START.x, START.z) + 1.6, START.z - 4);
    camPos.copy(camera.position);
    lookPos.set(START.x, 1.5, START.z);
    return;
  }
  // 相机朝向平滑跟随人物朝向
  let dh = S.heading - camHeading;
  dh = Math.atan2(Math.sin(dh), Math.cos(dh));
  camHeading += dh * (1 - Math.exp(-5 * dt));
  const fwd = fwdVec(camHeading);

  let dist = 5.2, height = 2.3, ahead = 4, up = 1.2;
  const flying = (S.phase === 'dream' || S.phase === 'free') && !S.grounded && !S.inWater;
  if (S.phase === 'swim' || S.inWater) { dist = 5.2; height = 2.8; up = 0.2; ahead = 5; }
  if (flying) {
    const spd = Math.hypot(S.vel.x, S.vel.z);
    dist = 3.8 + spd * 0.05; height = 3.0 - THREE.MathUtils.clamp(S.vel.y * 0.05, -0.8, 0.8); ahead = 5; up = 0.9;
  } else if (S.phase === 'dream' || S.phase === 'free') {
    dist = 6; height = 2.6; up = 1.3;
    if (S.groundKind === 'tree') { dist = 7.5; height = 3.2; } // 树尖上：看得见脚下的深渊
  }
  const target = tmpV.set(S.pos.x - fwd.x * dist, S.pos.y + height, S.pos.z - fwd.z * dist);
  if (flying) target.addScaledVector(S.vel, 1 / 9); // 抵消跟随的滞后，人物不会越飞越远
  // 相机别钻到地下、水下
  const floor = Math.max(heightAt(target.x, target.z) + 0.7, inLake(target.x, target.z) ? 0.6 : -1e9);
  target.y = Math.max(target.y, floor);
  camPos.lerp(target, 1 - Math.exp(-(flying ? 9 : 5) * dt));
  camPos.y = Math.max(camPos.y, floor);
  camera.position.copy(camPos);
  lookPos.lerp(tmpV2.set(S.pos.x + fwd.x * ahead, S.pos.y + up, S.pos.z + fwd.z * ahead), 1 - Math.exp(-8 * dt));
  camera.lookAt(lookPos);

  const rollT = flying ? ((K.left() ? -0.12 : 0) + (K.right() ? 0.12 : 0)) : 0;
  camRoll += (rollT - camRoll) * (1 - Math.exp(-3 * dt));
  camera.rotateZ(camRoll);
  const fovT = flying ? 62 + smooth(8, 28, S.vel.length()) * 9 : (S.phase === 'escape' ? 58 + S.danger * 6 : 60);
  camFov += (fovT - camFov) * (1 - Math.exp(-3 * dt));
  camera.fov = camFov;
  camera.updateProjectionMatrix();
}

// ============================================================
// 启动
// ============================================================
(async () => {
  try {
    await buildWorld();
  } catch (err) {
    loadText.textContent = '梦境生成失败：' + err.message;
    throw err;
  }
  S.pos.set(START.x, heightAt(START.x, START.z), START.z);
  S.phase = 'title';
  $('loading').classList.add('hidden');
  $('pressStart').classList.add('show');
  frame();
})();

// ---------- 调试钩子（供自动化测试） ----------
window.__dream = {
  S, obj, keys, camera, renderer, W, zombies, ghosts,
  step(dt = 1 / 60, n = 1) { for (let i = 0; i < n; i++) tick(dt); checkResize(); post.composer.render(dt); },
  start() { onEnter(); },
  setSize(w, h) { this.fixedSize = true; camera.aspect = w / h; camera.updateProjectionMatrix(); renderer.setSize(w, h, false); post.setSize(w, h); },
  // 截图存到开发服务器（.claude/serve_nocache.py）
  async save(name = 'shot') { await fetch('/shot?name=' + name, { method: 'POST', body: this.shot(0.85) }); return name; },
  paused: false,
  // 暂停后从任意位置看（测试用）
  look(px, py, pz, tx, ty, tz, fov = 60) {
    this.paused = true;
    camera.position.set(px, py, pz); camera.up.set(0, 1, 0); camera.lookAt(tx, ty, tz);
    camera.fov = fov; camera.updateProjectionMatrix();
    W.sky.mesh.position.copy(camera.position);
    W.motes.uniforms.uCam.value.copy(camera.position);
    checkResize();
    post.composer.render(0.016);
  },
  shot(q = 0.8) { post.composer.render(0.016); return renderer.domElement.toDataURL('image/jpeg', q); },
  // 直接跳到某个梦境阶段（测试用）
  jump(phase) {
    if (S.phase === 'title') onEnter();
    if (phase === 'swim') { S.pos.set(0, 0, LAKE.z + 30); }
    if (phase === 'fly') { S.pos.set(0, 0, LAKE.z); S.phase = 'swim'; S.dreamPower = 99.9; complete('lake'); }
    if (phase === 'roof') { S.phase = 'dream'; obj.fly = true; S.pos.set(0, W.city.tallTop + 5, -130); S.vel.set(0, -1, 0); S.grounded = false; }
    if (phase === 'tree') { S.phase = 'dream'; obj.fly = obj.high = obj.roof = true; const t = W.forest.trees[13]; S.pos.set(t.x, t.y + 4, t.z); S.vel.set(0, -1, 0); S.grounded = false; refreshObjectives(); updateControls(); }
  },
};
