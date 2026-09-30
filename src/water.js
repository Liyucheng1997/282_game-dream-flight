import * as THREE from 'three';
import { Reflector } from 'three/addons/objects/Reflector.js';
import { LAKE } from './config.js';
import { shared } from './sky.js';

// ============================================================
// 湖面：镜面倒影 + 程序化细浪 + 游泳激起的一圈圈涟漪（涟漪会发出微光）
// ============================================================

const MAX_RIPPLES = 16;

const WaterShader = {
  name: 'DreamWater',
  uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, {
    color: { value: null },
    tDiffuse: { value: null },
    textureMatrix: { value: null },
    uTime: { value: 0 },
    uDeep: { value: new THREE.Color(0x020812) },
    uGlowCol: { value: new THREE.Color(0.25, 0.7, 1.2) },
    uLightDir: { value: new THREE.Vector3() },
    uLightCol: { value: new THREE.Color() },
    uRipples: { value: Array.from({ length: MAX_RIPPLES }, () => new THREE.Vector4(0, 0, -100, 0)) },
    uCenter: { value: new THREE.Vector2(LAKE.x, LAKE.z) },
    uRadius: { value: LAKE.r },
  }]),
  vertexShader: /* glsl */`
    uniform mat4 textureMatrix;
    varying vec4 vUv;
    varying vec3 vWorld;
    #include <common>
    #include <fog_pars_vertex>
    void main() {
      vUv = textureMatrix * vec4(position, 1.0);
      vWorld = (modelMatrix * vec4(position, 1.0)).xyz;
      vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
      gl_Position = projectionMatrix * mvPosition;
      #include <fog_vertex>
    }`,
  fragmentShader: /* glsl */`
    uniform sampler2D tDiffuse;
    uniform float uTime, uRadius;
    uniform vec3 uDeep, uGlowCol, uLightDir, uLightCol;
    uniform vec2 uCenter;
    uniform vec4 uRipples[${MAX_RIPPLES}];
    varying vec4 vUv;
    varying vec3 vWorld;
    #include <common>
    #include <fog_pars_fragment>

    vec2 waveGrad(vec2 p, vec2 dir, float freq, float speed, float amp) {
      float ph = dot(p, dir) * freq + uTime * speed;
      return dir * cos(ph) * freq * amp;
    }

    void main() {
      vec2 p = vWorld.xz;
      vec2 g = vec2(0.0);
      g += waveGrad(p, normalize(vec2(1.0, 0.3)), 0.35, 0.9, 0.05);
      g += waveGrad(p, normalize(vec2(-0.4, 1.0)), 0.6, 1.3, 0.03);
      g += waveGrad(p, normalize(vec2(0.7, -0.8)), 1.3, 2.1, 0.012);
      g += waveGrad(p, normalize(vec2(-0.9, -0.2)), 2.7, 2.9, 0.006);
      g += waveGrad(p, normalize(vec2(0.2, 0.95)), 5.1, 4.0, 0.003);

      float glow = 0.0;
      for (int i = 0; i < ${MAX_RIPPLES}; i++) {
        vec4 r = uRipples[i];
        float age = uTime - r.z;
        if (age < 0.0 || age > 5.0) continue;
        vec2 dv = p - r.xy;
        float d = length(dv) + 1e-4;
        float rad = age * 2.6;
        float x = d - rad;
        float env = exp(-x * x * 1.2) * exp(-age * 0.8) * r.w;
        g += (dv / d) * cos(x * 7.0) * env * 0.5;
        glow += env * (0.5 + 0.5 * cos(x * 7.0));
      }

      vec3 n = normalize(vec3(-g.x, 1.0, -g.y));
      vec3 viewDir = normalize(cameraPosition - vWorld);
      float ndv = max(dot(n, viewDir), 0.0);
      float fres = 0.04 + 0.96 * pow(1.0 - ndv, 5.0);

      vec4 uv = vUv;
      uv.xy += n.xz * 1.6 * uv.w * 0.35;
      vec3 refl = texture2DProj(tDiffuse, uv).rgb;

      float edge = smoothstep(uRadius * 0.55, uRadius + 4.0, length(p - uCenter));
      vec3 deep = mix(uDeep, uDeep * 2.2 + vec3(0.0, 0.01, 0.01), edge);
      vec3 col = mix(deep, refl, clamp(0.55 + fres * 0.45, 0.0, 1.0));

      vec3 h = normalize(uLightDir + viewDir);
      float spec = pow(max(dot(n, h), 0.0), 350.0) * 5.0 + pow(max(dot(n, h), 0.0), 40.0) * 0.12;
      col += uLightCol * spec;

      // 梦里的水：涟漪处泛起蓝色的荧光，水面偶有闪烁
      float sparkle = step(0.996, fract(sin(dot(floor(p * 3.0), vec2(12.9898, 78.233))) * 43758.5453 + uTime * 0.05)) * 0.6;
      col += uGlowCol * (glow * 0.3 + sparkle * pow(1.0 - ndv, 2.0) * 0.3);

      gl_FragColor = vec4(col, 1.0);
      #include <tonemapping_fragment>
      #include <colorspace_fragment>
      #include <fog_fragment>
    }`,
};

export function createWater() {
  const geo = new THREE.CircleGeometry(LAKE.r + 16, 96);
  const mirror = new Reflector(geo, {
    shader: WaterShader,
    textureWidth: Math.min(1024, innerWidth * 0.6) | 0,
    textureHeight: Math.min(1024, innerHeight * 0.6) | 0,
    clipBias: 0.02,
    multisample: 2,
  });
  mirror.material.fog = true;
  mirror.rotation.x = -Math.PI / 2;
  mirror.position.set(LAKE.x, 0, LAKE.z);

  const u = mirror.material.uniforms;
  let next = 0;
  function ripple(x, z, strength = 1) {
    u.uRipples.value[next].set(x, z, shared.uTime.value, strength);
    next = (next + 1) % MAX_RIPPLES;
  }
  function update(atmos) {
    u.uTime.value = shared.uTime.value;
    u.uLightDir.value.copy(atmos.lightDir);
    u.uLightCol.value.copy(atmos.lightColor).multiplyScalar(atmos.lightIntensity * 0.8);
  }
  return { mesh: mirror, ripple, update };
}
