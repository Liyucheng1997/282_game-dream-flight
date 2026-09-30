import * as THREE from 'three';
import { GLSL_NOISE, mulberry32 } from './noise.js';
import { shared } from './sky.js';

// ============================================================
// 角色：有关节的人形骨架（做梦的人 / 僵尸）+ 幽灵
// 所有动作都用“姿势”（一组关节角）描述，再平滑混合，避免动作切换时跳变
// ============================================================

const PI = Math.PI;

function capsule(r, len, mat, radial = 10) {
  const m = new THREE.Mesh(new THREE.CapsuleGeometry(r, len, 4, radial), mat);
  m.castShadow = true;
  return m;
}

// 旋转体（躯干、骨盆）：按轮廓 [[半径, 高度], ...] 生成
function lathe(profile, mat, sx = 1, sz = 0.7) {
  const m = new THREE.Mesh(new THREE.LatheGeometry(profile.map(([r, y]) => new THREE.Vector2(r, y)), 20), mat);
  m.scale.set(sx, 1, sz);
  m.castShadow = true;
  return m;
}

function stripeTexture(bg, stripe, n = 14) {
  const c = document.createElement('canvas'); c.width = 128; c.height = 64;
  const g = c.getContext('2d');
  g.fillStyle = bg; g.fillRect(0, 0, 128, 64);
  g.fillStyle = stripe;
  for (let i = 0; i < n; i++) g.fillRect(i * 128 / n, 0, 128 / n * 0.35, 64);
  // 细小的星星图案（睡衣）
  g.fillStyle = 'rgba(255,255,230,0.55)';
  for (let i = 0; i < 18; i++) { const x = Math.random() * 128, y = Math.random() * 64; g.fillRect(x, y, 2, 2); }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

function tatteredTexture(seed, base) {
  const c = document.createElement('canvas'); c.width = c.height = 128;
  const g = c.getContext('2d');
  const r = mulberry32(seed);
  g.fillStyle = base; g.fillRect(0, 0, 128, 128);
  for (let i = 0; i < 300; i++) { g.fillStyle = `rgba(${r() < 0.6 ? '0,0,0' : '90,70,40'},${r() * 0.25})`; g.fillRect(r() * 128, r() * 128, 2 + r() * 10, 2 + r() * 10); }
  // 破洞（配合 alphaTest）
  g.globalCompositeOperation = 'destination-out';
  for (let i = 0; i < 9; i++) { g.beginPath(); g.ellipse(r() * 128, r() * 128, 3 + r() * 8, 2 + r() * 6, r() * 3, 0, PI * 2); g.fill(); }
  // 撕裂的下摆
  g.beginPath(); g.moveTo(0, 128);
  for (let x = 0; x <= 128; x += 8) g.lineTo(x, 116 + r() * 12 - (x % 16 ? 6 : 0));
  g.lineTo(128, 128); g.fill();
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

// ------------------------------------------------------------
// 人形骨架
// ------------------------------------------------------------
export function buildHumanoid({ skin, shirt, pants, hair, eyes, zombie = false }) {
  const root = new THREE.Group();          // 脚底，面朝 +z
  const pivot = new THREE.Group();         // 身体中心（游泳/飞行时绕它放平）
  pivot.position.y = 0.95;
  root.add(pivot);

  const hips = new THREE.Group(); pivot.add(hips);
  const pelvis = lathe([[0, -0.12], [0.09, -0.115], [0.14, -0.06], [0.145, 0.0], [0.135, 0.06], [0.128, 0.1], [0, 0.1]], pants, 1.0, 0.72);
  hips.add(pelvis);

  const spine = new THREE.Group(); spine.position.y = 0.06; hips.add(spine);
  // 躯干：腰细、胸宽、肩膀圆润地收向脖子
  const torso = lathe([[0, -0.02], [0.128, -0.02], [0.13, 0.08], [0.145, 0.2], [0.165, 0.32], [0.172, 0.4], [0.16, 0.46], [0.11, 0.51], [0.05, 0.53], [0, 0.535]], shirt, 1.08, 0.66);
  spine.add(torso);
  if (!zombie) {
    // 睡衣领口
    const collar = new THREE.Mesh(new THREE.TorusGeometry(0.075, 0.022, 6, 16), shirt);
    collar.rotation.x = PI / 2 - 0.25; collar.position.set(0, 0.47, 0.01);
    spine.add(collar);
  }

  const neck = new THREE.Group(); neck.position.y = 0.5; spine.add(neck);
  const neckM = capsule(0.045, 0.06, skin, 8); neckM.position.y = 0.04; neck.add(neckM);
  const head = new THREE.Group(); head.position.y = 0.1; neck.add(head);
  // 头：蛋形，下巴略收
  const skullGeo = new THREE.SphereGeometry(0.115, 24, 18);
  { const p = skullGeo.attributes.position; for (let i = 0; i < p.count; i++) { const y = p.getY(i); if (y < 0) { const k = 1 + y * 2.2; p.setX(i, p.getX(i) * k); p.setZ(i, p.getZ(i) * (1 + y * 1.2)); } } skullGeo.computeVertexNormals(); }
  const skull = new THREE.Mesh(skullGeo, skin);
  skull.scale.set(0.9, 1.1, 0.98); skull.position.y = 0.065; skull.castShadow = true;
  head.add(skull);
  const nose = new THREE.Mesh(new THREE.SphereGeometry(0.016, 8, 6), skin);
  nose.scale.set(0.8, 1.2, 1); nose.position.set(0, 0.045, 0.11);
  head.add(nose);
  for (const sx of [-1, 1]) {
    const ear = new THREE.Mesh(new THREE.SphereGeometry(0.025, 8, 6), skin);
    ear.scale.set(0.5, 1, 0.8); ear.position.set(sx * 0.105, 0.05, 0);
    head.add(ear);
    const eye = new THREE.Mesh(new THREE.SphereGeometry(zombie ? 0.024 : 0.016, 10, 8), eyes);
    eye.position.set(sx * 0.042, 0.075, 0.1);
    head.add(eye);
  }
  if (hair) {
    const cap = new THREE.Mesh(new THREE.SphereGeometry(0.125, 20, 14, 0, PI * 2, 0, PI * 0.5), hair);
    cap.scale.set(0.95, 1.05, 1.05); cap.position.set(0, 0.075, -0.012); cap.rotation.x = -0.5;
    cap.castShadow = true;
    head.add(cap);
    const fringe = new THREE.Mesh(new THREE.SphereGeometry(0.06, 10, 6, 0, PI * 2, 0, PI * 0.5), hair);
    fringe.scale.set(1.6, 0.5, 0.9); fringe.position.set(0.02, 0.145, 0.06); fringe.rotation.set(0.5, 0, -0.2);
    head.add(fringe);
  }

  function arm(side) {
    const sh = new THREE.Group(); sh.position.set(side * 0.215, 0.43, 0); spine.add(sh);
    const shoulderBall = new THREE.Mesh(new THREE.SphereGeometry(0.058, 10, 8), shirt); sh.add(shoulderBall);
    const upper = capsule(0.052, 0.2, shirt); upper.position.y = -0.15; sh.add(upper);
    const el = new THREE.Group(); el.position.y = -0.3; sh.add(el);
    const fore = capsule(0.047, 0.19, zombie ? skin : shirt); fore.position.y = -0.12; el.add(fore);
    if (!zombie) {
      const cuff = capsule(0.043, 0.03, skin); cuff.position.y = -0.24; el.add(cuff);
    }
    const wr = new THREE.Group(); wr.position.y = -0.27; el.add(wr);
    const hand = new THREE.Mesh(new THREE.BoxGeometry(0.075, 0.1, 0.035, 2, 2, 1), skin);
    hand.position.y = -0.055; hand.castShadow = true; wr.add(hand);
    const thumb = capsule(0.013, 0.035, skin, 6); thumb.position.set(side * -0.04, -0.03, 0.015); thumb.rotation.z = side * 0.5; wr.add(thumb);
    return { sh, el, wr };
  }
  function leg(side) {
    const hp = new THREE.Group(); hp.position.set(side * 0.095, -0.03, 0); hips.add(hp);
    const thigh = capsule(0.075, 0.28, pants); thigh.position.y = -0.21; hp.add(thigh);
    const kn = new THREE.Group(); kn.position.y = -0.43; hp.add(kn);
    const shin = capsule(0.06, 0.29, pants); shin.position.y = -0.2; kn.add(shin);
    const an = new THREE.Group(); an.position.y = -0.42; kn.add(an);
    const foot = new THREE.Mesh(new THREE.BoxGeometry(0.085, 0.06, 0.22, 2, 1, 2), skin);
    foot.position.set(0, -0.03, 0.05); foot.castShadow = true; an.add(foot);
    return { hp, kn, an };
  }
  const L = arm(-1), R = arm(1), LL = leg(-1), RL = leg(1);
  L.sh.position.x = -0.2; R.sh.position.x = 0.2;

  return {
    root, pivot, spine, neck, head,
    lSh: L.sh, lEl: L.el, lWr: L.wr, rSh: R.sh, rEl: R.el, rWr: R.wr,
    lHip: LL.hp, lKnee: LL.kn, lAnk: LL.an, rHip: RL.hp, rKnee: RL.kn, rAnk: RL.an,
  };
}

// ------------------------------------------------------------
// 姿势：一组关节角。所有动作函数都返回这样的对象
// ------------------------------------------------------------
export const POSE_KEYS = ['pitch', 'roll', 'lift', 'spineX', 'spineY', 'spineZ', 'neckX', 'neckZ',
  'lShX', 'lShY', 'lShZ', 'lElX', 'rShX', 'rShY', 'rShZ', 'rElX',
  'lHipX', 'lHipZ', 'lKneeX', 'lAnkX', 'rHipX', 'rHipZ', 'rKneeX', 'rAnkX'];

export function basePose() {
  const p = {};
  for (const k of POSE_KEYS) p[k] = 0;
  p.lShZ = -0.08; p.rShZ = 0.08; p.lElX = -0.12; p.rElX = -0.12;
  return p;
}

export function applyPose(rig, p) {
  rig.pivot.rotation.set(p.pitch, 0, p.roll);
  rig.pivot.position.y = 0.95 + p.lift;
  rig.spine.rotation.set(p.spineX, p.spineY, p.spineZ);
  rig.neck.rotation.set(p.neckX, 0, p.neckZ);
  rig.lSh.rotation.set(p.lShX, p.lShY, p.lShZ);
  rig.rSh.rotation.set(p.rShX, p.rShY, p.rShZ);
  rig.lEl.rotation.x = p.lElX; rig.rEl.rotation.x = p.rElX;
  rig.lHip.rotation.set(p.lHipX, 0, p.lHipZ);
  rig.rHip.rotation.set(p.rHipX, 0, p.rHipZ);
  rig.lKnee.rotation.x = p.lKneeX; rig.rKnee.rotation.x = p.rKneeX;
  rig.lAnk.rotation.x = p.lAnkX; rig.rAnk.rotation.x = p.rAnkX;
}

export class PoseBlender {
  constructor() { this.cur = basePose(); }
  update(target, dt, rate = 12) {
    const k = 1 - Math.exp(-rate * dt);
    for (const key of POSE_KEYS) this.cur[key] += (target[key] - this.cur[key]) * k;
    return this.cur;
  }
}

// 关键帧采样（余弦插值），keys = [[t, v], ...]，t ∈ [0,1)
function sampleKeys(keys, t) {
  for (let i = 0; i < keys.length - 1; i++) {
    const a = keys[i], b = keys[i + 1];
    if (t >= a[0] && t <= b[0]) {
      const u = (t - a[0]) / (b[0] - a[0] || 1);
      return a[1] + (b[1] - a[1]) * (0.5 - 0.5 * Math.cos(u * PI));
    }
  }
  return keys[keys.length - 1][1];
}

export const Poses = {
  idle(t) {
    const p = basePose();
    const br = Math.sin(t * 1.6);
    p.spineX = 0.02 + br * 0.015; p.lift = br * 0.004;
    p.lShX = br * 0.03; p.rShX = -br * 0.03;
    p.neckX = Math.sin(t * 0.4) * 0.05;
    p.lKneeX = 0.05; p.rKneeX = 0.05; p.lHipX = -0.03; p.rHipX = -0.03;
    return p;
  },
  run(t, amt = 1) {
    const p = basePose();
    const s = Math.sin(t), c = Math.cos(t);
    p.spineX = 0.22 * amt; p.spineY = s * 0.12 * amt;
    p.neckX = -0.12 * amt;
    p.lift = (Math.abs(c) * 0.07 - 0.03) * amt;
    p.lHipX = -s * 0.85 * amt; p.rHipX = s * 0.85 * amt;
    p.lKneeX = (Math.max(0, c) * 1.5 + 0.15) * amt; p.rKneeX = (Math.max(0, -c) * 1.5 + 0.15) * amt;
    p.lAnkX = (Math.max(0, c) * 0.4 - 0.1) * amt; p.rAnkX = (Math.max(0, -c) * 0.4 - 0.1) * amt;
    p.lShX = s * 0.9 * amt; p.rShX = -s * 0.9 * amt;
    p.lElX = -1.3 * amt - 0.1; p.rElX = -1.3 * amt - 0.1;
    p.lShZ = -0.12; p.rShZ = 0.12;
    return p;
  },
  jump(vy) {
    const p = basePose();
    const up = THREE.MathUtils.clamp(vy / 9, -1, 1);
    p.spineX = 0.1; p.neckX = -0.1;
    p.lHipX = -0.9; p.lKneeX = 1.4; p.rHipX = 0.2; p.rKneeX = 0.5 - up * 0.2;
    p.lShX = -2.2 + up * 0.4; p.rShX = 0.6; p.lElX = -0.6; p.rElX = -0.8;
    p.lShZ = -0.3; p.rShZ = 0.5;
    return p;
  },
  // 蛙泳：t ∈ [0,1)，0 开始向外划
  breaststroke(t, pitch = PI / 2 - 0.1) {
    const p = basePose();
    p.pitch = pitch;
    // 手臂：外划 → 内收（肘弯曲，手收到胸前）→ 向前伸 → 滑行
    const shX = sampleKeys([[0, -PI], [0.15, -2.75], [0.42, -1.55], [0.62, -PI], [1, -PI]], t);
    const shZ = sampleKeys([[0, -0.05], [0.15, -0.75], [0.42, -0.45], [0.62, -0.05], [1, -0.05]], t);
    const el = sampleKeys([[0, 0], [0.15, -0.35], [0.42, -2.0], [0.62, -0.1], [1, 0]], t);
    p.lShX = shX; p.rShX = shX; p.lShZ = shZ; p.rShZ = -shZ; p.lElX = el; p.rElX = el;
    p.lShY = sampleKeys([[0, 0], [0.42, 0.5], [0.62, 0], [1, 0]], t); p.rShY = -p.lShY;
    // 腿：收腿（膝盖弯、脚向外翻）→ 用力蹬夹 → 并拢滑行
    const hipX = sampleKeys([[0, 0], [0.35, 0], [0.58, -0.75], [0.74, 0.05], [1, 0]], t);
    const hipZ = sampleKeys([[0, 0.02], [0.35, 0.02], [0.58, 0.35], [0.7, 0.45], [0.8, 0.02], [1, 0.02]], t);
    const knee = sampleKeys([[0, 0.05], [0.35, 0.1], [0.58, 2.1], [0.74, 0.1], [1, 0.05]], t);
    const ank = sampleKeys([[0, 1.1], [0.4, 0.8], [0.58, -0.3], [0.72, 0.5], [0.85, 1.1], [1, 1.1]], t);
    p.lHipX = hipX; p.rHipX = hipX; p.lHipZ = -hipZ; p.rHipZ = hipZ; p.lKneeX = knee; p.rKneeX = knee; p.lAnkX = ank; p.rAnkX = ank;
    // 划水时抬头换气
    p.neckX = -0.55 - sampleKeys([[0, 0], [0.35, 0.35], [0.6, 0], [1, 0]], t);
    p.spineX = -sampleKeys([[0, 0], [0.38, 0.18], [0.6, 0], [1, 0]], t);
    p.lift = sampleKeys([[0, 0], [0.38, 0.06], [0.65, 0], [1, 0]], t);
    return p;
  },
  // 飞行中两次划水之间：伸展滑翔，像在水里漂
  glide(t, pitch, roll) {
    const p = Poses.breaststroke(0.85, pitch);
    const f = Math.sin(t * 1.3);
    p.lShZ = -0.12 - f * 0.05; p.rShZ = 0.12 + f * 0.05;
    p.lHipZ = -0.06 - f * 0.03; p.rHipZ = 0.06 + f * 0.03;
    p.lKneeX = 0.12 + Math.max(0, Math.sin(t * 1.3 + 1)) * 0.25; p.rKneeX = 0.12 + Math.max(0, Math.sin(t * 1.3 + 2)) * 0.25;
    p.roll = roll;
    return p;
  },
  // 下坠时手脚乱划
  fall(t, pitch) {
    const p = Poses.breaststroke(0.2, pitch);
    p.lShX = -2.4 + Math.sin(t * 9) * 0.4; p.rShX = -2.4 + Math.sin(t * 9 + 2) * 0.4;
    p.lShZ = -1.0; p.rShZ = 1.0;
    p.lKneeX = 0.6 + Math.sin(t * 8) * 0.4; p.rKneeX = 0.6 + Math.sin(t * 8 + 1.5) * 0.4;
    p.lHipX = -0.3 + Math.sin(t * 8) * 0.3; p.rHipX = -0.3 - Math.sin(t * 8) * 0.3;
    return p;
  },
  // 立水（没往前游时）
  tread(t) {
    const p = basePose();
    p.pitch = 0.35; p.lift = -0.1;
    const s = Math.sin(t * 3);
    p.lShX = -1.5; p.rShX = -1.5; p.lShZ = -0.6 - s * 0.3; p.rShZ = 0.6 + s * 0.3; p.lElX = -0.5; p.rElX = -0.5;
    p.lHipX = -0.4 + s * 0.3; p.rHipX = -0.4 - s * 0.3; p.lKneeX = 0.9; p.rKneeX = 0.9;
    p.neckX = -0.3;
    return p;
  },
  // 站在树尖上：张开双臂保持平衡
  balance(t) {
    const p = basePose();
    const w = Math.sin(t * 2.1), w2 = Math.sin(t * 1.3 + 1);
    p.lShZ = -1.35 + w * 0.15; p.rShZ = 1.35 + w * 0.15;
    p.lElX = -0.2; p.rElX = -0.2;
    p.roll = w * 0.05; p.spineZ = -w * 0.06; p.spineX = 0.05 + w2 * 0.03;
    p.lHipX = -0.15; p.rHipX = 0.1; p.lKneeX = 0.3; p.rKneeX = 0.15;
    p.neckX = 0.15;
    return p;
  },
  zombieWalk(t, amt = 1) {
    const p = basePose();
    const s = Math.sin(t), c = Math.cos(t);
    p.spineX = 0.35; p.spineZ = Math.sin(t * 0.5) * 0.12; p.spineY = s * 0.1;
    p.neckX = 0.25; p.neckZ = 0.35 + Math.sin(t * 0.7) * 0.1;
    p.lift = Math.abs(c) * 0.05 * amt - 0.04;
    p.roll = s * 0.06 * amt;
    p.lHipX = -s * 0.5 * amt; p.rHipX = s * 0.45 * amt;
    p.lKneeX = 0.25 + Math.max(0, c) * 0.6 * amt; p.rKneeX = 0.2 + Math.max(0, -c) * 0.35 * amt;
    p.lShX = -1.45 + s * 0.12; p.rShX = -1.3 - s * 0.12;
    p.lShZ = -0.08; p.rShZ = 0.15;
    p.lElX = -0.25; p.rElX = -0.45;
    return p;
  },
  zombieRise(t) {
    const p = Poses.zombieWalk(t * 3, 0.3);
    p.lShX = -2.6 + Math.sin(t * 7) * 0.4; p.rShX = -2.2 + Math.sin(t * 6 + 1) * 0.5;
    p.spineX = 0.5 + Math.sin(t * 5) * 0.1;
    return p;
  },
};

// ------------------------------------------------------------
// 做梦的人：穿条纹睡衣、光着脚
// ------------------------------------------------------------
export function createPlayerModel() {
  const skin = new THREE.MeshStandardMaterial({ color: 0xf0c4a0, roughness: 0.65 });
  const shirt = new THREE.MeshStandardMaterial({ map: stripeTexture('#8fb4e8', '#e8f0ff'), roughness: 0.85 });
  const pants = new THREE.MeshStandardMaterial({ map: stripeTexture('#6e90cc', '#d8e4ff'), roughness: 0.85 });
  const hair = new THREE.MeshStandardMaterial({ color: 0x17120f, roughness: 0.7 });
  const eyes = new THREE.MeshStandardMaterial({ color: 0x0a0a10, roughness: 0.2 });
  const rig = buildHumanoid({ skin, shirt, pants, hair, eyes });
  return rig;
}

export function createZombieModel(seed) {
  const r = mulberry32(seed);
  const tone = new THREE.Color().setHSL(0.2 + r() * 0.1, 0.18 + r() * 0.12, 0.3 + r() * 0.08, THREE.SRGBColorSpace);
  // 皮肤带一点幽绿的自发光：夜里也能看清它们的轮廓
  const skin = new THREE.MeshStandardMaterial({ color: tone, roughness: 0.85, emissive: new THREE.Color(0.03, 0.07, 0.03) });
  const clothCols = ['#3a3428', '#2c3038', '#402a28', '#34382c'];
  const shirt = new THREE.MeshStandardMaterial({ map: tatteredTexture(seed, clothCols[(r() * 4) | 0]), roughness: 1, alphaTest: 0.5, side: THREE.DoubleSide });
  const pants = new THREE.MeshStandardMaterial({ map: tatteredTexture(seed + 7, '#23242a'), roughness: 1, alphaTest: 0.5, side: THREE.DoubleSide });
  const eyes = new THREE.MeshBasicMaterial({ color: new THREE.Color(6, 1.0, 0.3) });
  const hair = r() < 0.6 ? new THREE.MeshStandardMaterial({ color: 0x1a1812, roughness: 1 }) : null;
  const rig = buildHumanoid({ skin, shirt, pants, hair, eyes, zombie: true });
  const s = 0.95 + r() * 0.15;
  rig.root.scale.setScalar(s);
  return rig;
}

// ------------------------------------------------------------
// 幽灵：半透明、边缘发光、下摆像布一样飘，脸上是两个黑洞般的眼睛和张开的嘴
// ------------------------------------------------------------
const ghostVert = /* glsl */`
uniform float uTime, uPhase;
varying vec3 vN, vView, vLocal;
varying float vH;
void main() {
  vec3 p = position;
  float h = clamp((p.y + 0.2) / 2.6, 0.0, 1.0);
  float lower = 1.0 - smoothstep(0.35, 0.9, h);
  float a = atan(p.z, p.x);
  float wave = sin(uTime * 3.0 + a * 4.0 + p.y * 3.0 + uPhase) * 0.12 + sin(uTime * 5.3 + a * 7.0 - p.y * 5.0) * 0.05;
  p.xz += normalize(p.xz + 1e-4) * wave * lower;
  p.z -= lower * lower * (0.35 + 0.15 * sin(uTime * 2.0 + uPhase)); // 下摆向后拖
  p.y += sin(uTime * 4.0 + a * 3.0) * 0.05 * lower;
  vLocal = position; vH = h;
  vec4 wp = modelMatrix * vec4(p, 1.0);
  vN = normalize(mat3(modelMatrix) * normal);
  vView = normalize(cameraPosition - wp.xyz);
  gl_Position = projectionMatrix * viewMatrix * wp;
}`;
const ghostFrag = /* glsl */`
uniform float uTime, uPhase, uAlpha;
varying vec3 vN, vView, vLocal;
varying float vH;
${GLSL_NOISE}
void main() {
  float fres = pow(1.0 - abs(dot(normalize(vN), vView)), 2.2);
  float a = atan(vLocal.z, vLocal.x);
  // 撕裂的下摆
  float hem = 0.08 + vnoise2(vec2(a * 3.0 + uPhase, uTime * 0.6)) * 0.22;
  if (vH < hem) discard;
  float body = 0.18 + 0.2 * vnoise3(vLocal * 3.0 + vec3(0.0, -uTime * 0.8, 0.0));
  vec3 col = mix(vec3(0.35, 0.45, 0.85), vec3(0.7, 0.78, 1.0), vH) * (body * 0.8 + fres * 0.9);
  float alpha = (body * 0.7 + fres * 0.7) * smoothstep(hem, hem + 0.15, vH);
  // 脸：眼睛和嘴是黑洞
  vec2 f = vLocal.xy - vec2(0.0, 2.08);
  if (vLocal.z > 0.2) {
    float e1 = length((f - vec2(-0.17, 0.08)) * vec2(1.0, 0.7));
    float e2 = length((f - vec2(0.17, 0.08)) * vec2(1.0, 0.7));
    float mo = length((f - vec2(0.0, -0.2)) * vec2(1.3, 0.8 + 0.2 * sin(uTime * 3.0 + uPhase)));
    float hole = 1.0 - smoothstep(0.07, 0.1, min(min(e1, e2), mo));
    col = mix(col, vec3(0.0), hole);
    alpha = mix(alpha, 0.95, hole);
  }
  gl_FragColor = vec4(col, alpha * uAlpha);
}`;

export function createGhostModel(phase) {
  // 轮廓：圆头 → 肩 → 越往下越宽的裹尸布
  const pts = [];
  const prof = [[0.0, 2.45], [0.2, 2.42], [0.36, 2.3], [0.44, 2.1], [0.43, 1.85], [0.38, 1.65], [0.46, 1.45], [0.56, 1.1], [0.66, 0.6], [0.78, 0.1], [0.86, -0.2]];
  for (const [x, y] of prof) pts.push(new THREE.Vector2(x, y));
  const geo = new THREE.LatheGeometry(pts, 32);
  const uniforms = { uTime: shared.uTime, uPhase: { value: phase }, uAlpha: { value: 1 } };
  const mat = new THREE.ShaderMaterial({
    uniforms, vertexShader: ghostVert, fragmentShader: ghostFrag,
    transparent: true, depthWrite: false, side: THREE.DoubleSide, blending: THREE.NormalBlending,
  });
  const g = new THREE.Group();
  const body = new THREE.Mesh(geo, mat);
  g.add(body);
  // 伸向前方的袖子
  const sleeveGeo = new THREE.CylinderGeometry(0.03, 0.16, 0.9, 10, 4, true);
  sleeveGeo.translate(0, -0.45, 0);
  for (const sx of [-1, 1]) {
    const sl = new THREE.Mesh(sleeveGeo, mat);
    sl.position.set(sx * 0.4, 1.65, 0.1);
    sl.rotation.set(-1.25, 0, sx * 0.25);
    g.add(sl);
  }
  // 光晕
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const cg = c.getContext('2d');
  const gr = cg.createRadialGradient(32, 32, 0, 32, 32, 32);
  gr.addColorStop(0, 'rgba(150,170,255,0.22)'); gr.addColorStop(1, 'rgba(150,170,255,0)');
  cg.fillStyle = gr; cg.fillRect(0, 0, 64, 64);
  const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(c), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
  halo.scale.setScalar(5); halo.position.y = 1.6;
  g.add(halo);
  g.userData.mat = mat;
  g.userData.halo = halo;
  return g;
}
