import * as THREE from 'three';

// 梦境的地理：从南（+z）往北（-z）依次是 墓地 → 湖 → 城市 → 森林
export const GRAVE = { x: 0, z: 290, minX: -82, maxX: 82, minZ: 228, maxZ: 350 };
export const START = { x: 0, z: 268, heading: Math.PI };
export const LAKE = { x: 0, z: 110, r: 55 };
export const CITY = { minX: -150, maxX: 150, minZ: -205, maxZ: -45 };
export const FOREST = { minX: -150, maxX: 150, minZ: -470, maxZ: -228 };
export const WORLD_R = 640; // 梦的边界

// 月亮在前方偏左；黎明时太阳从森林尽头右侧升起
export const MOON_DIR = new THREE.Vector3(-0.42, 0.45, -0.79).normalize();
export const SUN_DIR_LOW = new THREE.Vector3(0.5, -0.02, -0.86).normalize();
export const SUN_DIR_HIGH = new THREE.Vector3(0.48, 0.14, -0.86).normalize();

// 人物尺寸（米）
export const PLAYER_H = 1.8;
