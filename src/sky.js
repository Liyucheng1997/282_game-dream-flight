import * as THREE from 'three';
import { GLSL_NOISE, smooth } from './noise.js';
import { MOON_DIR, SUN_DIR_LOW, SUN_DIR_HIGH } from './config.js';

// ============================================================
// 天空与大气：一个 dawn 参数（0 = 深夜，1 = 日出）驱动天色、雾、光照
// ============================================================

export const shared = {
  uTime: { value: 0 },
  uDawn: { value: 0 },
};

const C = (h) => new THREE.Color(h);
// 线性空间颜色关键帧：[dawn, zenith, horizon, fog, glow]
const KEYS = [
  [0.00, C(0x01020c), C(0x10143a), C(0x0b0e26), C(0x000000)],
  [0.35, C(0x030618), C(0x1c1d4e), C(0x141638), C(0x2a1238)],
  [0.65, C(0x0c1640), C(0x6a3e6e), C(0x3a2c52), C(0xa04a3a)],
  [1.00, C(0x2a5ab0), C(0xffb487), C(0xd9a08c), C(0xffa050)],
];

export const atmos = {
  zenith: new THREE.Color(), horizon: new THREE.Color(), fog: new THREE.Color(), glow: new THREE.Color(),
  sunDir: new THREE.Vector3(), lightDir: new THREE.Vector3(),
  lightColor: new THREE.Color(), lightIntensity: 1,
  hemiSky: new THREE.Color(), hemiGround: new THREE.Color(), hemiIntensity: 1,
};

export function computeAtmos(dawn) {
  let i = 0;
  while (i < KEYS.length - 2 && dawn > KEYS[i + 1][0]) i++;
  const a = KEYS[i], b = KEYS[i + 1];
  const t = smooth(a[0], b[0], dawn);
  atmos.zenith.copy(a[1]).lerp(b[1], t);
  atmos.horizon.copy(a[2]).lerp(b[2], t);
  atmos.fog.copy(a[3]).lerp(b[3], t);
  atmos.glow.copy(a[4]).lerp(b[4], t);
  atmos.sunDir.copy(SUN_DIR_LOW).lerp(SUN_DIR_HIGH, smooth(0.75, 1, dawn)).normalize();

  // 主光：月光 → 晨光
  const sunW = smooth(0.55, 0.95, dawn);
  atmos.lightDir.copy(MOON_DIR).lerp(atmos.sunDir.clone().setY(Math.max(atmos.sunDir.y, 0.12)), sunW).normalize();
  atmos.lightColor.copy(C(0x9db4ff)).lerp(C(0xffb27a), sunW);
  atmos.lightIntensity = THREE.MathUtils.lerp(1.5, 2.6, sunW) * (1 - 0.35 * Math.sin(Math.PI * smooth(0.4, 0.8, dawn)));
  atmos.hemiSky.copy(C(0x2b3a7a)).lerp(C(0x8da4d8), smooth(0.3, 1, dawn));
  atmos.hemiGround.copy(C(0x0c0d18)).lerp(C(0x3a2a2a), smooth(0.3, 1, dawn));
  atmos.hemiIntensity = THREE.MathUtils.lerp(1.35, 1.6, dawn);
  return atmos;
}

const skyVert = /* glsl */`
varying vec3 vDir;
void main() {
  vDir = position;
  vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  gl_Position = p.xyww;
}`;

const skyFrag = /* glsl */`
uniform float uTime, uDawn;
uniform vec3 uZenith, uHorizon, uGlow, uMoonDir, uSunDir;
varying vec3 vDir;
${GLSL_NOISE}

vec3 stars(vec3 d, float scale, float thresh, float bright) {
  vec3 sp = d * scale;
  vec3 cell = floor(sp);
  vec3 f = fract(sp) - 0.5;
  float h = hash13(cell);
  if (h < thresh) return vec3(0.0);
  vec3 off = (vec3(hash13(cell + 1.3), hash13(cell + 2.7), hash13(cell + 5.1)) - 0.5) * 0.55;
  float dd = length(f - off);
  float k = (h - thresh) / (1.0 - thresh);
  float tw = 0.55 + 0.45 * sin(uTime * (1.5 + k * 5.0) + h * 80.0);
  vec3 tint = mix(vec3(0.75, 0.82, 1.0), vec3(1.0, 0.85, 0.7), hash13(cell + 9.1));
  return tint * smoothstep(0.26, 0.0, dd) * tw * bright * (0.3 + k);
}

void main() {
  vec3 d = normalize(vDir);
  float y = d.y;
  float hor = pow(1.0 - clamp(y, 0.0, 1.0), 4.0);
  vec3 col = mix(uZenith, uHorizon, hor);
  if (y < 0.0) col = mix(uHorizon, uHorizon * 0.35, clamp(-y * 3.0, 0.0, 1.0));

  float night = 1.0 - smoothstep(0.45, 0.95, uDawn);

  // 黎明的霞光
  float sd = max(dot(d, uSunDir), 0.0);
  col += uGlow * (pow(sd, 6.0) * 0.5 + pow(sd, 48.0) * 1.2) * (0.3 + 0.7 * pow(1.0 - abs(y), 6.0));
  col += uGlow * pow(1.0 - abs(y), 10.0) * 0.25;

  // 银河
  vec3 axis = normalize(vec3(0.85, 0.3, -0.35));
  float band = exp(-pow(dot(d, axis), 2.0) * 14.0);
  float neb = fbm3(d * 5.0 + vec3(3.0, 1.0, 7.0));
  float dust = smoothstep(0.35, 0.75, fbm3(d * 11.0));
  col += mix(vec3(0.16, 0.12, 0.34), vec3(0.28, 0.2, 0.36), neb) * band * neb * 0.5 * night * (1.0 - dust * 0.6) * smoothstep(-0.05, 0.25, y);

  // 星星
  vec3 st = stars(d, 220.0, 0.975, 2.2) + stars(d, 90.0, 0.992, 5.0) + stars(d, 420.0, 0.95, 0.8) * band;
  col += st * night * smoothstep(-0.02, 0.15, y);

  // 月亮：大而亮，带月海和光晕
  float md = dot(d, uMoonDir);
  float moonVis = 1.0 - smoothstep(0.7, 1.0, uDawn) * 0.8;
  float moonR = 0.9973;
  if (md > moonR) {
    vec3 up = vec3(0.0, 1.0, 0.0);
    vec3 right = normalize(cross(up, uMoonDir));
    vec3 u2 = cross(uMoonDir, right);
    vec2 mp = vec2(dot(d, right), dot(d, u2)) / sqrt(1.0 - moonR * moonR);
    float limb = sqrt(max(0.0, 1.0 - dot(mp, mp)));
    float maria = fbm2(mp * 2.3 + 4.0);
    vec3 mc = vec3(1.0, 0.97, 0.88) * (0.72 + 0.28 * limb) * (1.0 - 0.32 * smoothstep(0.45, 0.7, maria));
    col = mix(col, mc * 3.0 * moonVis, smoothstep(moonR, moonR + 0.00006, md));
  }
  float mg = max(md, 0.0);
  col += vec3(0.62, 0.66, 0.95) * (pow(mg, 600.0) * 0.9 + pow(mg, 80.0) * 0.1 + pow(mg, 10.0) * 0.03) * moonVis;

  // 高空薄云（被月光镶上银边）
  if (y > 0.0) {
    vec2 cp = d.xz / (y + 0.12) * 1.6 + vec2(uTime * 0.004, uTime * 0.002);
    float c = fbm2(cp * 1.3);
    float cov = smoothstep(0.52, 0.8, c) * smoothstep(0.0, 0.25, y);
    vec3 lit = mix(vec3(0.05, 0.06, 0.14), uGlow * 1.2 + vec3(0.25, 0.2, 0.25), smoothstep(0.3, 1.0, uDawn));
    float rim = pow(mg, 12.0) * 2.0 + pow(sd, 4.0) * uDawn * 1.5;
    col = mix(col, lit + rim * vec3(0.8, 0.85, 1.0) * 0.4, cov * 0.75);
  }

  gl_FragColor = vec4(col, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

export function createSky() {
  const uniforms = {
    uTime: shared.uTime, uDawn: shared.uDawn,
    uZenith: { value: atmos.zenith }, uHorizon: { value: atmos.horizon }, uGlow: { value: atmos.glow },
    uMoonDir: { value: MOON_DIR.clone() }, uSunDir: { value: atmos.sunDir },
  };
  const mat = new THREE.ShaderMaterial({
    uniforms, vertexShader: skyVert, fragmentShader: skyFrag,
    side: THREE.BackSide, depthWrite: false, fog: false,
  });
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(1, 48, 24), mat);
  mesh.scale.setScalar(1500);
  mesh.frustumCulled = false;
  mesh.renderOrder = -1000;

  // 给 PBR 材质用的环境贴图（PMREM 要求场景在 100 米以内）
  const envScene = new THREE.Scene();
  const envSky = new THREE.Mesh(new THREE.SphereGeometry(40, 32, 16), mat);
  envScene.add(envSky);

  return { mesh, envScene };
}
