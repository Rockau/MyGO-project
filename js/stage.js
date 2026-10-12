// Hero 区的 Three.js 舞台：五人立绘 + 代表色聚光灯 + 体积光锥 + 浮尘粒子。
// 播放音乐时切换成 Live 摇头灯：灯光按节拍来回扫动、交叉，后排背光淡入；节拍闪动只保留很小的幅度。

import * as THREE from 'three';
import { MEMBERS, outfitSrc } from './data.js';
import { beatBus, beatPosition, isPlaying } from './player.js';

const ORDER = ['rana', 'anon', 'tomori', 'soyo', 'taki'];
const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;

export function initStage({ onSelect }) {
  const host = document.getElementById('stage');
  const label = document.getElementById('stage-label');
  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  } catch {
    host.closest('.hero').classList.add('no-webgl');
    return;
  }
  const mobile = innerWidth < 760;
  renderer.setPixelRatio(Math.min(devicePixelRatio, mobile ? 1.5 : 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  host.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  scene.fog = new THREE.Fog(0x070811, 10, 22);
  const camera = new THREE.PerspectiveCamera(34, 1, 0.1, 100);
  const camBase = new THREE.Vector3(0, 1.7, 10.5);
  const lookAt = new THREE.Vector3(0, 1.45, 0);

  scene.add(new THREE.AmbientLight(0x404870, 0.6));

  // 地面：夜晚的十字路口（参考设定集主视觉），五人站在路口中央，四周是斑马线；边缘渐隐融入背景
  const floorTex = makeCrossroadTexture(mobile ? 1024 : 2048);
  floorTex.anisotropy = renderer.capabilities.getMaxAnisotropy();
  const floor = new THREE.Mesh(
    new THREE.PlaneGeometry(FLOOR_SIZE, FLOOR_SIZE),
    new THREE.MeshStandardMaterial({
      map: floorTex, color: 0xa4aabb, roughness: 0.6, metalness: 0.25, transparent: true,
      // 自发光让斑马线在暗处也隐约可见，不完全依赖聚光灯
      emissive: 0xffffff, emissiveMap: floorTex, emissiveIntensity: 0.14,
    }),
  );
  floor.rotation.x = -Math.PI / 2;
  floor.position.z = -CROSS_CENTER; // 路口中心在五人身后，五人站在靠镜头一侧的斑马线上
  floor.renderOrder = -1;
  scene.add(floor);

  const loader = new THREE.TextureLoader();
  const glowTex = makeGlowTexture();
  const coneGeo = new THREE.ConeGeometry(1.15, 7.2, 48, 1, true);
  coneGeo.translate(0, -3.6, 0); // 锥尖在原点（灯的位置）

  const spacing = mobile ? 1.25 : 1.45;
  const actors = ORDER.map((id, i) => {
    const m = MEMBERS.find((x) => x.id === id);
    const color = new THREE.Color(m.color);
    const x = (i - 2) * spacing;
    const z = -Math.abs(i - 2) * 0.55;

    // 立绘：原图 1800x2160，人物脚底约在底部往上 9% 处
    const h = 3.7;
    const tex = loader.load(outfitSrc(m, 'live'));
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 4;
    const mat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, alphaTest: 0.04, color: 0xc0c0c0, fog: false });
    const sprite = new THREE.Mesh(new THREE.PlaneGeometry(h * (1800 / 2160), h), mat);
    sprite.position.set(x, h / 2 - h * 0.09, z);
    sprite.renderOrder = 2; // 画在光锥之后，光锥不会把立绘洗白
    scene.add(sprite);

    // 只覆盖人物本身的透明点击区域
    const hit = new THREE.Mesh(
      new THREE.PlaneGeometry(0.95, 3.1),
      new THREE.MeshBasicMaterial({ visible: false }),
    );
    hit.position.set(x, 1.55, z + 0.05);
    hit.userData.id = id;
    scene.add(hit);

    // 地面光斑
    const pool = new THREE.Mesh(
      new THREE.PlaneGeometry(2.6, 2.6),
      new THREE.MeshBasicMaterial({ map: glowTex, color, transparent: true, opacity: 0.45, blending: THREE.AdditiveBlending, depthWrite: false }),
    );
    pool.rotation.x = -Math.PI / 2;
    pool.position.set(x, 0.02, z);
    scene.add(pool);

    // 聚光灯
    const spot = new THREE.SpotLight(color, 60, 18, 0.34, 0.65, 1.2);
    spot.position.set(x, 7.2, z + 0.4);
    spot.target.position.set(x, 0, z);
    scene.add(spot, spot.target);

    // 体积光锥
    const coneMat = new THREE.ShaderMaterial({
      uniforms: { uColor: { value: color }, uOpacity: { value: 0.22 } },
      vertexShader: CONE_VS,
      fragmentShader: CONE_FS,
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending,
    });
    const cone = new THREE.Mesh(coneGeo, coneMat);
    cone.position.copy(spot.position);
    scene.add(cone);

    return { id, i, m, x, z, sprite, mat, hit, pool, spot, cone, coneMat, hover: 0, phase: Math.random() * 6 };
  });

  // 后排背光：人物身后的一排摇头灯，只在演出时出现，朝观众方向扇形扫动
  const backColors = [0xbfd0ff, ...actors.map((a) => a.m.color), 0xbfd0ff];
  const backBeams = backColors.map((c, k) => {
    const mat = new THREE.ShaderMaterial({
      uniforms: { uColor: { value: new THREE.Color(c) }, uOpacity: { value: 0 } },
      vertexShader: CONE_VS,
      fragmentShader: CONE_FS,
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending,
    });
    const beam = new THREE.Mesh(coneGeo, mat);
    beam.scale.set(0.55, 1.15, 0.55);
    beam.position.set((k - (backColors.length - 1) / 2) * 1.5, 7.8, -3.4);
    scene.add(beam);
    return { beam, mat, k };
  });

  // 浮尘粒子
  const COUNT = mobile ? 260 : 700;
  const pos = new Float32Array(COUNT * 3);
  const speed = new Float32Array(COUNT);
  for (let i = 0; i < COUNT; i++) {
    pos[i * 3] = (Math.random() - 0.5) * 16;
    pos[i * 3 + 1] = Math.random() * 8;
    pos[i * 3 + 2] = (Math.random() - 0.5) * 8;
    speed[i] = 0.05 + Math.random() * 0.15;
  }
  const dustGeo = new THREE.BufferGeometry();
  dustGeo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const dustMat = new THREE.PointsMaterial({
    size: 0.06, map: glowTex, color: 0xc8d4ff, transparent: true, opacity: 0.7,
    blending: THREE.AdditiveBlending, depthWrite: false,
  });
  scene.add(new THREE.Points(dustGeo, dustMat));

  // 交互
  const pointer = new THREE.Vector2(0, 0);
  const ndc = new THREE.Vector2(9, 9);
  const ray = new THREE.Raycaster();
  let hovered = null;
  host.addEventListener('pointermove', (e) => {
    const r = host.getBoundingClientRect();
    ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    pointer.copy(ndc);
  });
  host.addEventListener('pointerleave', () => ndc.set(9, 9));
  host.addEventListener('click', () => {
    if (hovered) onSelect(hovered.id);
  });

  let pulse = 0;
  beatBus.addEventListener('beat', (e) => {
    pulse = e.detail.bar ? 1.4 : 1;
  });
  let live = 0; // 0 = 待机灯光，1 = 演出灯光，平滑过渡

  // 宽屏时舞台偏右，给左侧标题留出空间
  let shiftX = 0;
  function resize() {
    const w = host.clientWidth;
    const h = host.clientHeight;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    shiftX = camera.aspect > 1.25 ? -Math.min(2.8, (camera.aspect - 1.1) * 3.4) : 0;
    lookAt.x = shiftX;
    // 窄屏拉远镜头，保证五人都在画面内
    camera.position.z = camBase.z * Math.max(1, 1.25 / camera.aspect);
    camera.updateProjectionMatrix();
  }
  new ResizeObserver(resize).observe(host);
  resize();

  let visible = true;
  new IntersectionObserver(([e]) => (visible = e.isIntersecting)).observe(host);

  const clock = new THREE.Clock();
  const tmp = new THREE.Vector3();
  const dir = new THREE.Vector3();
  const TAU = Math.PI * 2;
  function frame() {
    requestAnimationFrame(frame);
    if (!visible) return;
    const dt = Math.min(clock.getDelta(), 0.05);
    const t = clock.elapsedTime;
    const motion = reduceMotion ? 0 : 1;

    camera.position.x += (shiftX + (ndc.x < 2 ? pointer.x : 0) * 0.9 * motion - camera.position.x) * 0.04;
    camera.position.y += (camBase.y + (ndc.x < 2 ? pointer.y : 0) * 0.35 * motion - camera.position.y) * 0.04;
    camera.lookAt(lookAt);

    ray.setFromCamera(ndc, camera);
    const hit = ray.intersectObjects(actors.map((a) => a.hit))[0];
    const next = hit ? actors.find((a) => a.id === hit.object.userData.id) : null;
    if (next !== hovered) {
      hovered = next;
      host.style.cursor = hovered ? 'pointer' : '';
      label.classList.toggle('show', !!hovered);
      if (hovered) {
        label.innerHTML = `<b>${hovered.m.nameZh}</b><span>${hovered.m.part}</span>`;
        label.style.setProperty('--c', hovered.m.color);
      }
      // 通知指南针光标换成该角色的代表色（compass-cursor.js）
      dispatchEvent(new CustomEvent('stage-hover', { detail: hovered ? hovered.m.color : null }));
    }
    if (hovered) {
      tmp.set(hovered.x, 3.55, hovered.z).project(camera);
      label.style.transform = `translate(${(tmp.x * 0.5 + 0.5) * host.clientWidth}px, ${(-tmp.y * 0.5 + 0.5) * host.clientHeight}px) translate(-50%, -100%)`;
    }

    pulse = Math.max(0, pulse - dt * 4);
    live += ((isPlaying() ? 1 : 0) - live) * Math.min(1, dt * 1.2);
    // 演出时的「拍」位置：灯光扫动周期锁定在 8 拍 / 16 拍上
    const beats = beatPosition() ?? t * 2;

    for (const a of actors) {
      a.hover += ((a === hovered ? 1 : 0) - a.hover) * 0.12;
      // 待机：缓慢小幅摆动；演出：相邻的灯反向扫动，形成交叉
      const idlePan = Math.sin(t * 0.5 + a.phase) * 0.12;
      const side = a.i % 2 ? -1 : 1;
      const livePan = Math.sin((TAU * beats) / 8 + a.i * 0.7) * 0.42 * side;
      const liveTilt = Math.cos((TAU * beats) / 16 + a.i * 1.3) * 0.2;
      a.cone.rotation.set(liveTilt * live * motion, 0, (idlePan + (livePan - idlePan) * live) * motion);

      // 聚光灯和地面光斑跟着光锥指向的落点移动
      dir.set(0, -1, 0).applyEuler(a.cone.rotation);
      const reach = a.cone.position.y / -dir.y;
      a.spot.target.position.set(a.cone.position.x + dir.x * reach, 0, a.cone.position.z + dir.z * reach);
      a.pool.position.x = a.x + (a.spot.target.position.x - a.x) * live;
      a.pool.position.z = a.z + (a.spot.target.position.z - a.z) * live;

      // 节拍只带来很小的明暗变化
      const lit = 0.75 + a.hover * 0.3 + pulse * 0.03;
      a.mat.color.setScalar(Math.min(lit, 1.1));
      a.coneMat.uniforms.uOpacity.value = 0.16 + live * 0.06 + a.hover * 0.22 + pulse * 0.04;
      a.spot.intensity = 50 + live * 20 + a.hover * 90 + pulse * 12;
      a.pool.material.opacity = 0.35 + live * 0.1 + a.hover * 0.4 + pulse * 0.06;
    }
    for (const b of backBeams) {
      const fan = Math.sin((TAU * beats) / 8 + b.k * 0.9) * 0.5;
      b.beam.rotation.set((-0.42 + Math.sin((TAU * beats) / 16 + b.k) * 0.18) * motion, 0, fan * motion);
      b.mat.uniforms.uOpacity.value = live * (0.12 + pulse * 0.02);
      b.beam.visible = live > 0.01;
    }

    const p = dustGeo.attributes.position.array;
    for (let i = 0; i < COUNT; i++) {
      p[i * 3 + 1] += speed[i] * dt * motion;
      if (p[i * 3 + 1] > 8) p[i * 3 + 1] = 0;
    }
    dustGeo.attributes.position.needsUpdate = true;
    dustMat.size = 0.06 + pulse * 0.006;

    renderer.render(scene, camera);
  }
  frame();
}

// 十字路口地面贴图：沥青底 + 四个方向的斑马线 + 停止线，最后用径向渐变把边缘淡出到透明。
// 贴图覆盖 FLOOR_SIZE × FLOOR_SIZE 的世界尺寸，中心是五人站立的路口中央。
const FLOOR_SIZE = 26;
const INNER = 3.8; // 斑马线内沿离路口中心的距离（米），也是马路半宽
const DEPTH = 3.6; // 斑马线宽度（沿过街方向）
const CROSS_CENTER = INNER + DEPTH / 2 + 0.3;

function makeCrossroadTexture(px) {
  const c = document.createElement('canvas');
  c.width = c.height = px;
  const g = c.getContext('2d');
  const u = px / FLOOR_SIZE; // 每米对应的像素
  const mid = px / 2;
  const w2p = (m) => mid + m * u; // 世界坐标（米）→ 像素

  // 沥青：深蓝灰底色 + 细颗粒噪点
  g.fillStyle = '#1b1e29';
  g.fillRect(0, 0, px, px);
  const img = g.getImageData(0, 0, px, px);
  const d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    const n = (Math.random() - 0.5) * 14;
    d[i] += n;
    d[i + 1] += n;
    d[i + 2] += n;
  }
  g.putImageData(img, 0, 0);

  // 路口中央（五人所在）略亮，像被路灯照着的路面
  const glow = g.createRadialGradient(mid, mid + CROSS_CENTER * u, 0, mid, mid + CROSS_CENTER * u, 5 * u);
  glow.addColorStop(0, 'rgba(255,250,235,0.10)');
  glow.addColorStop(1, 'rgba(255,250,235,0)');
  g.fillStyle = glow;
  g.fillRect(0, 0, px, px);

  // 斑马线：路口四边各一组，条纹垂直于行人过街方向
  const SPAN = INNER * 2 - 0.4; // 斑马线横跨整条马路

  // 四个转角是人行道：比路面略亮，带路缘线和方砖缝
  const corner = (sx, sz) => {
    const x0 = sx > 0 ? w2p(INNER) : 0;
    const z0 = sz > 0 ? w2p(INNER) : 0;
    const w = mid - INNER * u;
    g.fillStyle = '#262a37';
    g.fillRect(x0, z0, w, w);
    g.strokeStyle = 'rgba(255,255,255,0.05)';
    g.lineWidth = Math.max(1, u * 0.03);
    for (let t = 0; t < w; t += u * 0.8) {
      g.beginPath(); g.moveTo(x0 + t, z0); g.lineTo(x0 + t, z0 + w); g.stroke();
      g.beginPath(); g.moveTo(x0, z0 + t); g.lineTo(x0 + w, z0 + t); g.stroke();
    }
    // 路缘
    g.fillStyle = 'rgba(200,205,215,0.35)';
    const cx = sx > 0 ? w2p(INNER) : w2p(-INNER) - 0.15 * u;
    const cz = sz > 0 ? w2p(INNER) : w2p(-INNER) - 0.15 * u;
    g.fillRect(cx, z0, 0.15 * u, w);
    g.fillRect(x0, cz, w, 0.15 * u);
  };
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) corner(sx, sz);
  const BAR = 0.45; // 单条白线宽
  const GAP = 0.45;
  g.fillStyle = 'rgba(226,229,236,0.78)';
  const bars = Math.floor(SPAN / (BAR + GAP));
  for (let k = 0; k < bars; k++) {
    const a = -SPAN / 2 + k * (BAR + GAP) + GAP / 2;
    // 前、后两组（x 方向排列的竖条）
    for (const s of [-1, 1]) {
      const z0 = s > 0 ? INNER : -INNER - DEPTH;
      g.fillRect(w2p(a), w2p(z0), BAR * u, DEPTH * u);
      // 左、右两组（z 方向排列的横条）
      const x0 = s > 0 ? INNER : -INNER - DEPTH;
      g.fillRect(w2p(x0), w2p(a), DEPTH * u, BAR * u);
    }
  }

  // 停止线和车道线（斑马线外侧）
  g.fillStyle = 'rgba(232,234,240,0.55)';
  const STOP = INNER + DEPTH + 0.9;
  for (const s of [-1, 1]) {
    g.fillRect(w2p(-SPAN / 2), w2p(s * STOP) - 0.09 * u, (SPAN / 2) * u, 0.18 * u);
    g.fillRect(w2p(s * STOP) - 0.09 * u, w2p(0), 0.18 * u, (SPAN / 2) * u);
  }
  g.fillStyle = 'rgba(240,200,90,0.5)'; // 中央黄线
  for (const s of [-1, 1]) {
    g.fillRect(w2p(-0.12), w2p(s > 0 ? STOP : -FLOOR_SIZE / 2), 0.24 * u, (FLOOR_SIZE / 2 - STOP) * u);
    g.fillRect(w2p(s > 0 ? STOP : -FLOOR_SIZE / 2), w2p(-0.12), (FLOOR_SIZE / 2 - STOP) * u, 0.24 * u);
  }

  // 边缘淡出：径向渐变作为透明度遮罩，没有生硬的边界
  g.globalCompositeOperation = 'destination-in';
  const fade = g.createRadialGradient(mid, mid + CROSS_CENTER * u, 2 * u, mid, mid + CROSS_CENTER * u, mid * 0.95);
  fade.addColorStop(0, 'rgba(0,0,0,1)');
  fade.addColorStop(0.4, 'rgba(0,0,0,0.9)');
  fade.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = fade;
  g.fillRect(0, 0, px, px);

  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function makeGlowTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d');
  const grad = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  grad.addColorStop(0, 'rgba(255,255,255,1)');
  grad.addColorStop(0.35, 'rgba(255,255,255,0.45)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 128, 128);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

const CONE_VS = /* glsl */ `
  varying float vY;
  varying vec3 vN;
  varying vec3 vView;
  void main() {
    vY = -position.y / 7.2;
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    vN = normalize(normalMatrix * normal);
    vView = normalize(-mv.xyz);
    gl_Position = projectionMatrix * mv;
  }
`;

const CONE_FS = /* glsl */ `
  uniform vec3 uColor;
  uniform float uOpacity;
  varying float vY;
  varying vec3 vN;
  varying vec3 vView;
  void main() {
    float edge = pow(abs(dot(vN, vView)), 1.6);
    float fall = smoothstep(1.0, 0.05, vY) * smoothstep(0.0, 0.08, vY);
    gl_FragColor = vec4(uColor, edge * fall * uOpacity);
  }
`;
