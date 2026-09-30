import * as THREE from 'three';
import { mulberry32 } from './noise.js';
import { LAKE, GRAVE, FOREST } from './config.js';
import { heightAt } from './terrain.js';
import { shared } from './sky.js';

// ============================================================
// 特效：云海、地面雾、漂浮的梦之光尘、萤火虫、粒子（星尘拖尾 / 水花）、空中涟漪、指引光柱
// ============================================================

function puffTexture(seed) {
  const s = 256, c = document.createElement('canvas'); c.width = c.height = s;
  const g = c.getContext('2d');
  const r = mulberry32(seed);
  for (let i = 0; i < 38; i++) {
    const a = r() * Math.PI * 2, d = Math.pow(r(), 0.7) * 48;
    const x = s / 2 + Math.cos(a) * d, y = s / 2 + Math.sin(a) * d * 0.7;
    const rad = Math.min(24 + r() * 50, 122 - d);
    const gr = g.createRadialGradient(x, y, 0, x, y, rad);
    gr.addColorStop(0, `rgba(255,255,255,${0.16 + r() * 0.14})`);
    gr.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = gr; g.fillRect(0, 0, s, s);
  }
  const t = new THREE.CanvasTexture(c);
  return t;
}

// ------------------------------------------------------------
// 实例化的面向镜头的面片（云、雾）
// ------------------------------------------------------------
class Billboards {
  constructor(items, { texture, lit, shade, near = 6, drift = 2, heightFade = 0, blending = THREE.NormalBlending }) {
    const base = new THREE.PlaneGeometry(1, 1);
    const geo = new THREE.InstancedBufferGeometry();
    geo.index = base.index;
    geo.setAttribute('position', base.attributes.position);
    geo.setAttribute('uv', base.attributes.uv);
    const off = new Float32Array(items.length * 3), data = new Float32Array(items.length * 4);
    items.forEach((it, i) => {
      off.set([it.x, it.y, it.z], i * 3);
      data.set([it.s, it.rot, it.a, it.seed], i * 4);
    });
    geo.setAttribute('iOffset', new THREE.InstancedBufferAttribute(off, 3));
    geo.setAttribute('iData', new THREE.InstancedBufferAttribute(data, 4));
    geo.instanceCount = items.length;

    this.uniforms = THREE.UniformsUtils.merge([THREE.UniformsLib.fog, {
      uTex: { value: texture }, uLit: { value: new THREE.Color(lit) }, uShade: { value: new THREE.Color(shade) },
      uNear: { value: near }, uDrift: { value: drift }, uOpacity: { value: 1 }, uHeightFade: { value: heightFade },
    }]);
    this.uniforms.uTime = shared.uTime;
    const mat = new THREE.ShaderMaterial({
      uniforms: this.uniforms, transparent: true, depthWrite: false, fog: true, blending,
      vertexShader: /* glsl */`
        attribute vec3 iOffset; attribute vec4 iData;
        uniform float uTime, uNear, uDrift, uHeightFade;
        varying vec2 vUv; varying float vAlpha, vShade;
        #include <fog_pars_vertex>
        void main() {
          vUv = uv;
          float rot = iData.y + uTime * 0.03 * (fract(iData.w * 7.13) - 0.5);
          vec2 q = vec2(cos(rot) * position.x - sin(rot) * position.y, sin(rot) * position.x + cos(rot) * position.y);
          vec3 right = vec3(viewMatrix[0][0], viewMatrix[1][0], viewMatrix[2][0]);
          vec3 up = vec3(viewMatrix[0][1], viewMatrix[1][1], viewMatrix[2][1]);
          vec3 center = iOffset + vec3(sin(uTime * 0.05 + iData.w * 6.0), 0.0, cos(uTime * 0.04 + iData.w * 5.0)) * uDrift;
          vec3 wp = center + (right * q.x + up * q.y) * iData.x;
          // 用面片中心的距离淡出：镜头钻进云雾里时整片变淡，而不是露出硬边
          float d = distance(center, cameraPosition);
          vAlpha = iData.z * smoothstep(uNear + iData.x * 0.25, uNear * 2.0 + iData.x * 0.6, d);
          // 贴地的雾从高处俯看会露出一团团的边缘：镜头高了就淡出
          vAlpha *= 1.0 - uHeightFade * smoothstep(6.0, 22.0, cameraPosition.y - iOffset.y);
          vShade = clamp(position.y + 0.5, 0.0, 1.0);
          vec4 mvPosition = viewMatrix * vec4(wp, 1.0);
          gl_Position = projectionMatrix * mvPosition;
          #include <fog_vertex>
        }`,
      fragmentShader: /* glsl */`
        uniform sampler2D uTex; uniform vec3 uLit, uShade; uniform float uOpacity;
        varying vec2 vUv; varying float vAlpha, vShade;
        #include <fog_pars_fragment>
        void main() {
          float a = texture2D(uTex, vUv).a * smoothstep(0.5, 0.38, length(vUv - 0.5));
          vec3 col = mix(uShade, uLit, smoothstep(0.2, 0.9, vShade));
          gl_FragColor = vec4(col, a * vAlpha * uOpacity);
          #include <fog_fragment>
        }`,
    });
    this.mesh = new THREE.Mesh(geo, mat);
    this.mesh.frustumCulled = false;
  }
}

export function createClouds() {
  const r = mulberry32(31337);
  const tex = puffTexture(5);
  const items = [];
  // 云层：飞得够高才会穿过去
  for (let c = 0; c < 55; c++) {
    const cx = (r() - 0.5) * 700, cz = 150 - r() * 700, cy = 108 + r() * 45;
    const n = 6 + ((r() * 7) | 0);
    for (let i = 0; i < n; i++) {
      items.push({ x: cx + (r() - 0.5) * 70, y: cy + (r() - 0.5) * 10, z: cz + (r() - 0.5) * 50, s: 35 + r() * 45, rot: r() * 6, a: 0.45 + r() * 0.35, seed: r() });
    }
  }
  const clouds = new Billboards(items, { texture: tex, lit: 0x8890c0, shade: 0x1c2040, near: 7, drift: 6 });

  // 墓地的地面雾（泛着幽绿） + 湖面薄雾
  const mistItems = [];
  for (let i = 0; i < 110; i++) {
    const x = GRAVE.x + (r() - 0.5) * 200, z = GRAVE.z + (r() - 0.5) * 170;
    mistItems.push({ x, y: heightAt(x, z) + 0.8 + r() * 1.4, z, s: 10 + r() * 12, rot: r() * 6, a: 0.16 + r() * 0.14, seed: r() });
  }
  for (let i = 0; i < 60; i++) {
    const a = r() * Math.PI * 2, d = Math.sqrt(r()) * LAKE.r * 0.95;
    mistItems.push({ x: LAKE.x + Math.cos(a) * d, y: 0.9 + r() * 1.2, z: LAKE.z + Math.sin(a) * d, s: 12 + r() * 14, rot: r() * 6, a: 0.1 + r() * 0.1, seed: r() });
  }
  // 林间雾气
  for (let i = 0; i < 90; i++) {
    const x = FOREST.minX + r() * (FOREST.maxX - FOREST.minX), z = FOREST.minZ + r() * (FOREST.maxZ - FOREST.minZ);
    mistItems.push({ x, y: heightAt(x, z) + 12 + r() * 16, z, s: 28 + r() * 26, rot: r() * 6, a: 0.12 + r() * 0.1, seed: r() });
  }
  const mist = new Billboards(mistItems, { texture: puffTexture(9), lit: 0x6a8a9a, shade: 0x2a4048, near: 3, drift: 3, heightFade: 1 });

  function update(atmos, dawn) {
    // 云被月光照亮，黎明时染上粉橙色
    clouds.uniforms.uLit.value.setRGB(0.45, 0.48, 0.72).lerp(new THREE.Color(1.6, 0.95, 0.75), dawn);
    clouds.uniforms.uShade.value.setRGB(0.07, 0.08, 0.17).lerp(new THREE.Color(0.45, 0.32, 0.45), dawn);
    mist.uniforms.uLit.value.setRGB(0.22, 0.34, 0.36).lerp(new THREE.Color(0.9, 0.75, 0.7), dawn);
    mist.uniforms.uShade.value.setRGB(0.07, 0.12, 0.14).lerp(new THREE.Color(0.55, 0.45, 0.45), dawn);
  }
  return { clouds: clouds.mesh, mist: mist.mesh, update };
}

// ------------------------------------------------------------
// 点精灵：梦之光尘（环绕镜头）和萤火虫
// ------------------------------------------------------------
function pointsMaterial(vertex, uniforms) {
  return new THREE.ShaderMaterial({
    uniforms: { uTime: shared.uTime, uPR: { value: Math.min(devicePixelRatio, 2) }, ...uniforms },
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    vertexShader: vertex,
    fragmentShader: /* glsl */`
      varying float vA; varying vec3 vCol;
      void main() {
        float r = length(gl_PointCoord - 0.5);
        float a = smoothstep(0.5, 0.0, r);
        a = a * a;
        gl_FragColor = vec4(vCol, a * vA);
      }`,
  });
}

export function createMotes() {
  const N = 1400, BOX = 90;
  const r = mulberry32(2718);
  const pos = new Float32Array(N * 3), seed = new Float32Array(N);
  for (let i = 0; i < N; i++) { pos.set([(r() - 0.5) * BOX, (r() - 0.5) * BOX, (r() - 0.5) * BOX], i * 3); seed[i] = r(); }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('aSeed', new THREE.BufferAttribute(seed, 1));
  const mat = pointsMaterial(/* glsl */`
    attribute float aSeed;
    uniform float uTime, uPR, uBox, uAmount;
    uniform vec3 uCam;
    varying float vA; varying vec3 vCol;
    void main() {
      vec3 p = position + vec3(sin(uTime * 0.3 + aSeed * 10.0) * 2.0, sin(uTime * 0.2 + aSeed * 7.0) * 1.5, cos(uTime * 0.25 + aSeed * 5.0) * 2.0);
      p = mod(p - uCam + uBox * 0.5, uBox) - uBox * 0.5 + uCam;
      vec4 mv = viewMatrix * vec4(p, 1.0);
      gl_Position = projectionMatrix * mv;
      float d = -mv.z;
      gl_PointSize = min(48.0 * uPR, (0.25 + fract(aSeed * 31.0) * 0.35) * uPR * 420.0 / max(d, 0.5));
      vA = uAmount * smoothstep(uBox * 0.5, uBox * 0.25, length(p - uCam)) * (0.45 + 0.55 * sin(uTime * 1.7 + aSeed * 40.0)) * smoothstep(1.0, 4.0, d);
      vCol = mix(vec3(0.5, 0.7, 1.4), vec3(1.3, 0.9, 1.5), fract(aSeed * 13.0)) * 0.9;
    }`, { uBox: { value: BOX }, uCam: { value: new THREE.Vector3() }, uAmount: { value: 0.6 } });
  const pts = new THREE.Points(geo, mat);
  pts.frustumCulled = false;
  return { points: pts, uniforms: mat.uniforms };
}

export function createFireflies() {
  const r = mulberry32(1618);
  const list = [];
  for (let i = 0; i < 260; i++) { const a = r() * Math.PI * 2, d = LAKE.r + r() * 40; list.push([LAKE.x + Math.cos(a) * d, LAKE.z + Math.sin(a) * d, 0]); }
  for (let i = 0; i < 160; i++) list.push([GRAVE.x + (r() - 0.5) * 180, GRAVE.z + (r() - 0.5) * 150, 1]);
  for (let i = 0; i < 380; i++) list.push([FOREST.minX + r() * (FOREST.maxX - FOREST.minX), FOREST.minZ + r() * (FOREST.maxZ - FOREST.minZ), 2]);
  const N = list.length;
  const pos = new Float32Array(N * 3), seed = new Float32Array(N), kind = new Float32Array(N);
  list.forEach(([x, z, k], i) => {
    const y = Math.max(heightAt(x, z), 0) + (k === 2 ? 2 + r() * 30 : 0.5 + r() * 2.5);
    pos.set([x, y, z], i * 3); seed[i] = r(); kind[i] = k;
  });
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('aSeed', new THREE.BufferAttribute(seed, 1));
  geo.setAttribute('aKind', new THREE.BufferAttribute(kind, 1));
  const mat = pointsMaterial(/* glsl */`
    attribute float aSeed, aKind;
    uniform float uTime, uPR, uNight;
    varying float vA; varying vec3 vCol;
    void main() {
      float t = uTime * (0.3 + aSeed * 0.4) + aSeed * 50.0;
      vec3 p = position + vec3(sin(t) * 1.8 + sin(t * 2.3) * 0.6, sin(t * 1.3) * 0.7, cos(t * 0.9) * 1.8);
      vec4 mv = viewMatrix * vec4(p, 1.0);
      gl_Position = projectionMatrix * mv;
      float d = -mv.z;
      gl_PointSize = min(48.0 * uPR, 0.35 * uPR * 420.0 / max(d, 0.5));
      float blink = smoothstep(0.2, 1.0, sin(uTime * (1.5 + aSeed * 2.0) + aSeed * 30.0));
      vA = blink * uNight * smoothstep(250.0, 80.0, d);
      vCol = aKind < 0.5 ? vec3(0.5, 1.6, 1.2) : aKind < 1.5 ? vec3(0.6, 1.6, 0.6) : vec3(1.5, 1.4, 0.5);
    }`, { uNight: { value: 1 } });
  const pts = new THREE.Points(geo, mat);
  pts.frustumCulled = false;
  return { points: pts, uniforms: mat.uniforms };
}

// ------------------------------------------------------------
// CPU 粒子池：星尘拖尾、水花、幽灵的残影
// ------------------------------------------------------------
export class ParticlePool {
  constructor(N = 2400) {
    this.N = N;
    this.p = Array.from({ length: N }, () => ({ life: 0, max: 1, x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, g: 0, drag: 0, size: 1, r: 1, gg: 1, b: 1 }));
    this.next = 0;
    this.pos = new Float32Array(N * 3); this.col = new Float32Array(N * 3); this.data = new Float32Array(N * 2);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute('color', new THREE.BufferAttribute(this.col, 3).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute('aData', new THREE.BufferAttribute(this.data, 2).setUsage(THREE.DynamicDrawUsage));
    this.geo = geo;
    const mat = new THREE.ShaderMaterial({
      uniforms: { uPR: { value: Math.min(devicePixelRatio, 2) } },
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, vertexColors: true,
      vertexShader: /* glsl */`
        attribute vec2 aData; uniform float uPR;
        varying float vA; varying vec3 vCol;
        void main() {
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          gl_Position = projectionMatrix * mv;
          gl_PointSize = min(48.0 * uPR, aData.x * uPR * 420.0 / max(-mv.z, 0.3));
          vA = aData.y; vCol = color;
        }`,
      fragmentShader: /* glsl */`
        varying float vA; varying vec3 vCol;
        void main() { float r = length(gl_PointCoord - 0.5); float a = smoothstep(0.5, 0.05, r); gl_FragColor = vec4(vCol, a * a * vA); }`,
    });
    this.points = new THREE.Points(geo, mat);
    this.points.frustumCulled = false;
  }
  emit(o) {
    const q = this.p[this.next]; this.next = (this.next + 1) % this.N;
    q.life = q.max = o.life ?? 1;
    q.x = o.x; q.y = o.y; q.z = o.z;
    q.vx = o.vx ?? 0; q.vy = o.vy ?? 0; q.vz = o.vz ?? 0;
    q.g = o.g ?? 0; q.drag = o.drag ?? 0; q.size = o.size ?? 0.3;
    q.r = o.r ?? 1; q.gg = o.gg ?? 1; q.b = o.b ?? 1;
  }
  update(dt) {
    for (let i = 0; i < this.N; i++) {
      const q = this.p[i];
      if (q.life <= 0) { this.data[i * 2 + 1] = 0; continue; }
      q.life -= dt;
      const dr = Math.exp(-q.drag * dt);
      q.vx *= dr; q.vy = q.vy * dr - q.g * dt; q.vz *= dr;
      q.x += q.vx * dt; q.y += q.vy * dt; q.z += q.vz * dt;
      const k = Math.max(0, q.life / q.max);
      this.pos[i * 3] = q.x; this.pos[i * 3 + 1] = q.y; this.pos[i * 3 + 2] = q.z;
      this.col[i * 3] = q.r; this.col[i * 3 + 1] = q.gg; this.col[i * 3 + 2] = q.b;
      this.data[i * 2] = q.size * (0.4 + 0.6 * k);
      this.data[i * 2 + 1] = k * (1 - Math.pow(1 - k, 8));
    }
    this.geo.attributes.position.needsUpdate = true;
    this.geo.attributes.color.needsUpdate = true;
    this.geo.attributes.aData.needsUpdate = true;
  }
}

// ------------------------------------------------------------
// 空中涟漪：在空中划水时，身后的空气像水一样荡开一圈
// ------------------------------------------------------------
export function createAirRipples() {
  const group = new THREE.Group();
  const geo = new THREE.PlaneGeometry(1, 1);
  const pool = [];
  for (let i = 0; i < 8; i++) {
    const mat = new THREE.ShaderMaterial({
      uniforms: { uAge: { value: 1 } },
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
      vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
      fragmentShader: /* glsl */`
        uniform float uAge; varying vec2 vUv;
        void main() {
          float r = length(vUv - 0.5) * 2.0;
          float ring = exp(-pow((r - 0.82) * 14.0, 2.0)) + 0.35 * exp(-pow((r - 0.6) * 18.0, 2.0));
          float a = ring * (1.0 - uAge) * (1.0 - uAge) * step(r, 1.0);
          gl_FragColor = vec4(vec3(0.55, 0.8, 1.3) * a, a);
        }`,
    });
    const m = new THREE.Mesh(geo, mat);
    m.visible = false;
    group.add(m);
    pool.push({ mesh: m, age: 1 });
  }
  let next = 0;
  const tmp = new THREE.Vector3();
  function spawn(pos, dir) {
    const r = pool[next]; next = (next + 1) % pool.length;
    r.age = 0;
    r.mesh.visible = true;
    r.mesh.position.copy(pos);
    r.mesh.lookAt(tmp.copy(pos).add(dir));
  }
  function update(dt) {
    for (const r of pool) {
      if (r.age >= 1) { r.mesh.visible = false; continue; }
      r.age = Math.min(1, r.age + dt * 1.3);
      r.mesh.scale.setScalar(1 + r.age * 7);
      r.mesh.material.uniforms.uAge.value = r.age;
    }
  }
  return { group, spawn, update };
}

// ------------------------------------------------------------
// 指引光柱
// ------------------------------------------------------------
export function createBeacon() {
  const geo = new THREE.CylinderGeometry(3, 3, 360, 24, 1, true);
  geo.translate(0, 180, 0);
  const mat = new THREE.ShaderMaterial({
    uniforms: { uTime: shared.uTime, uOpacity: { value: 0 }, uColor: { value: new THREE.Color(0.55, 0.75, 1.4) } },
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
    vertexShader: 'varying vec2 vUv; varying vec3 vN; varying vec3 vV; void main(){ vUv = uv; vec4 wp = modelMatrix * vec4(position,1.0); vN = normalize(mat3(modelMatrix)*normal); vV = normalize(cameraPosition - wp.xyz); gl_Position = projectionMatrix * viewMatrix * wp; }',
    fragmentShader: /* glsl */`
      uniform float uTime, uOpacity; uniform vec3 uColor;
      varying vec2 vUv; varying vec3 vN; varying vec3 vV;
      void main() {
        float edge = pow(abs(dot(normalize(vN), vV)), 1.5);
        float fade = smoothstep(1.0, 0.25, vUv.y) * smoothstep(0.0, 0.02, vUv.y);
        float streak = 0.6 + 0.4 * sin(vUv.y * 120.0 - uTime * 3.0 + vUv.x * 30.0);
        float a = edge * fade * streak * uOpacity;
        gl_FragColor = vec4(uColor * a, a);
      }`,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.frustumCulled = false;
  return { mesh, uniforms: mat.uniforms };
}
