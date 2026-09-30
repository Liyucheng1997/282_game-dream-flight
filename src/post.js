import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';

// ============================================================
// 后期：辉光 → 色调映射 → 梦境滤镜（暗角、色差、速度模糊、胶片颗粒、危险时的红色脉动）
// ============================================================

const DreamShader = {
  uniforms: {
    tDiffuse: { value: null },
    uTime: { value: 0 },
    uSpeed: { value: 0 },
    uDanger: { value: 0 },
    uFade: { value: 0 },
    uAspect: { value: 1 },
  },
  vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
  fragmentShader: /* glsl */`
    uniform sampler2D tDiffuse;
    uniform float uTime, uSpeed, uDanger, uFade, uAspect;
    varying vec2 vUv;
    float hash(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
    void main() {
      vec2 c = vUv - 0.5;
      float r = length(c * vec2(uAspect, 1.0)) / length(vec2(uAspect, 1.0) * 0.5);
      float ca = 0.0012 + uSpeed * 0.006 * r;
      vec3 col;
      col.r = texture2D(tDiffuse, vUv - c * ca).r;
      col.g = texture2D(tDiffuse, vUv).g;
      col.b = texture2D(tDiffuse, vUv + c * ca).b;
      // 高速飞行时的径向模糊
      if (uSpeed > 0.02) {
        vec3 acc = vec3(0.0);
        for (int i = 1; i <= 6; i++) acc += texture2D(tDiffuse, vUv - c * float(i) * 0.006 * uSpeed).rgb;
        col = mix(col, acc / 6.0, smoothstep(0.45, 1.1, r) * min(uSpeed, 1.0) * 0.8);
      }
      // 梦的边缘：柔和发亮、带一点紫
      float vig = smoothstep(1.15, 0.35, r);
      col *= mix(0.45, 1.0, vig);
      col += vec3(0.03, 0.02, 0.06) * (1.0 - vig);
      // 危险：边缘泛红，随心跳脉动
      float beat = pow(0.5 + 0.5 * sin(uTime * 7.0), 6.0);
      col = mix(col, col * vec3(1.35, 0.45, 0.45) + vec3(0.08, 0.0, 0.0), uDanger * smoothstep(0.35, 1.0, r) * (0.6 + 0.4 * beat));
      // 胶片颗粒
      col += (hash(vUv * 1000.0 + fract(uTime) * 100.0) - 0.5) * 0.028;
      col *= 1.0 - uFade;
      gl_FragColor = vec4(col, 1.0);
    }`,
};

export function createPost(renderer, scene, camera) {
  const size = renderer.getSize(new THREE.Vector2());
  const rt = new THREE.WebGLRenderTarget(size.x, size.y, { type: THREE.HalfFloatType, samples: 4 });
  const composer = new EffectComposer(renderer, rt);
  composer.addPass(new RenderPass(scene, camera));
  const bloom = new UnrealBloomPass(new THREE.Vector2(size.x, size.y), 0.75, 0.55, 0.85);
  composer.addPass(bloom);
  composer.addPass(new OutputPass());
  const dream = new ShaderPass(DreamShader);
  composer.addPass(dream);

  function setSize(w, h) {
    composer.setSize(w, h);
    dream.uniforms.uAspect.value = w / h;
  }
  setSize(size.x, size.y);
  return { composer, bloom, dream: dream.uniforms, setSize };
}
