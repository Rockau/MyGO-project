// 成员区的 Three.js 专属背景板：每位成员一套粒子 / 几何主题，切换成员时销毁旧场景、重建新场景。
// 正交相机，可视范围 x ∈ [-aspect, aspect]，y ∈ [-1, 1]。

import * as THREE from 'three';
import { beatBus } from './player.js';

const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
const MOTION = reduceMotion ? 0.15 : 1;

export function initMemberBg(section) {
  const host = section.querySelector('.member-bg');
  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  } catch {
    section.classList.add('no-webgl');
    return { setTheme() {} };
  }
  const mobile = innerWidth < 760;
  renderer.setPixelRatio(Math.min(devicePixelRatio, mobile ? 1.5 : 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  host.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, -10, 10);
  const view = { aspect: 1, mobile };

  const mouse = new THREE.Vector2(0, 0);
  const mouseTarget = new THREE.Vector2(0, 0);
  let mouseActive = false;
  const toWorld = (e) => {
    const r = host.getBoundingClientRect();
    return new THREE.Vector2(
      (((e.clientX - r.left) / r.width) * 2 - 1) * view.aspect,
      -(((e.clientY - r.top) / r.height) * 2 - 1),
    );
  };
  section.addEventListener('pointermove', (e) => {
    mouseTarget.copy(toWorld(e));
    mouseActive = true;
  });
  section.addEventListener('pointerleave', () => (mouseActive = false));
  section.addEventListener('click', (e) => {
    if (e.target.closest('button, a, img, .card, .profile, details')) return;
    theme?.click?.(toWorld(e));
  });

  let pulse = 0;
  beatBus.addEventListener('beat', (e) => {
    pulse = e.detail.bar ? 1.3 : 1;
    theme?.beat?.(e.detail);
  });

  function resize() {
    const w = host.clientWidth;
    const h = host.clientHeight;
    renderer.setSize(w, h, false);
    view.aspect = w / h;
    camera.left = -view.aspect;
    camera.right = view.aspect;
    camera.updateProjectionMatrix();
    theme?.resize?.();
  }
  new ResizeObserver(resize).observe(host);

  let visible = false;
  new IntersectionObserver(([e]) => (visible = e.isIntersecting)).observe(section);

  let theme = null;
  let themeId = null;
  let swapTimer = 0;

  function setTheme(id, hex) {
    if (id === themeId) return;
    themeId = id;
    clearTimeout(swapTimer);
    host.classList.add('fading');
    swapTimer = setTimeout(() => {
      if (theme) {
        scene.remove(theme.group);
        disposeTree(theme.group);
      }
      const factory = THEMES[id];
      theme = factory({ view, color: new THREE.Color(hex), mouse, pointer: mouseTarget });
      scene.add(theme.group);
      host.classList.remove('fading');
    }, theme ? 380 : 0);
  }

  resize();
  const clock = new THREE.Clock();
  function frame() {
    requestAnimationFrame(frame);
    const dt = Math.min(clock.getDelta(), 0.05) * MOTION;
    if (!visible || !theme) return;
    const t = clock.elapsedTime * MOTION;
    if (!mouseActive) mouseTarget.set(Math.sin(t * 0.3) * view.aspect * 0.5, Math.sin(t * 0.21) * 0.4);
    mouse.lerp(mouseTarget, 0.1);
    pulse = Math.max(0, pulse - dt * 3.5);
    theme.update(dt, t, pulse, mouseActive);
    renderer.render(scene, camera);
  }
  frame();

  return { setTheme };
}

/* ---------- 通用工具 ---------- */

function canvasTexture(size, draw) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  draw(c.getContext('2d'), size);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

const softDot = () =>
  canvasTexture(128, (g, s) => {
    const grad = g.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
    grad.addColorStop(0, 'rgba(255,255,255,1)');
    grad.addColorStop(0.3, 'rgba(255,255,255,0.5)');
    grad.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = grad;
    g.fillRect(0, 0, s, s);
  });

function sprite(tex, color, opacity = 1, additive = true) {
  const m = new THREE.SpriteMaterial({
    map: tex, color, transparent: true, opacity, depthWrite: false,
    blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
  });
  return new THREE.Sprite(m);
}

function points(count, tex, color, size, fill) {
  const pos = new Float32Array(count * 3);
  const col = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) fill(i, pos, col);
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  const mat = new THREE.PointsMaterial({
    map: tex, size, sizeAttenuation: false, vertexColors: true, color,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
  });
  return new THREE.Points(geo, mat);
}

function disposeTree(obj) {
  const textures = new Set();
  obj.traverse((o) => {
    o.geometry?.dispose();
    const mats = Array.isArray(o.material) ? o.material : o.material ? [o.material] : [];
    for (const m of mats) {
      if (m.map) textures.add(m.map);
      m.dispose();
    }
  });
  textures.forEach((t) => t.dispose());
}

const rand = (a, b) => a + Math.random() * (b - a);
const wrap = (v, min, max) => (v < min ? max - (min - v) : v > max ? min + (v - max) : v);

/* ---------- 主题 ---------- */

const THEMES = {
  // 高松灯：夜空星点 + 飘落的金平糖、小石头、创可贴（鼠标星星与拖影见 cursor.js）
  tomori({ view, color }) {
    const group = new THREE.Group();
    const dot = softDot();
    const W = () => view.aspect * 1.1;

    const STAR = view.mobile ? 180 : 420;
    const twinkle = new Float32Array(STAR).map(() => Math.random() * 6.28);
    const base = new Float32Array(STAR).map(() => rand(0.3, 1));
    const stars = points(STAR, dot, 0xffffff, view.mobile ? 4 : 5, (i, p, c) => {
      p.set([rand(-2.4, 2.4), rand(-1, 1), 0], i * 3);
      const tint = Math.random() < 0.3 ? color : new THREE.Color(0xdde8ff);
      c.set([tint.r, tint.g, tint.b], i * 3);
    });
    stars.material.color.copy(color).lerp(new THREE.Color(0xffffff), 0.6);
    group.add(stars);

    const kinds = [
      canvasTexture(128, (g) => drawKonpeito(g, '#ffd6e8')),
      canvasTexture(128, (g) => drawKonpeito(g, '#d6f0ff')),
      canvasTexture(128, (g) => drawKonpeito(g, '#fff4c2')),
      canvasTexture(128, drawPebble),
      canvasTexture(128, drawBandage),
    ];
    const fallers = Array.from({ length: view.mobile ? 14 : 28 }, (_, i) => {
      const s = sprite(kinds[i % kinds.length], 0xffffff, 0.85, false);
      const size = i % kinds.length < 3 ? rand(0.05, 0.09) : rand(0.08, 0.13);
      s.scale.set(size, size, 1);
      s.position.set(rand(-W(), W()), rand(-1.2, 1.2), 0);
      s.userData = { vy: rand(0.04, 0.1), spin: rand(-0.8, 0.8), sway: rand(0, 6.28) };
      group.add(s);
      return s;
    });

    return {
      group,
      update(dt, t, pulse) {
        const col = stars.geometry.attributes.color;
        const c = col.array;
        for (let i = 0; i < STAR; i++) {
          const v = base[i] * (0.55 + 0.45 * Math.sin(t * 1.6 + twinkle[i])) + pulse * 0.3;
          c[i * 3] = c[i * 3 + 1] = c[i * 3 + 2] = Math.min(v, 1.2);
        }
        col.needsUpdate = true;
        for (const s of fallers) {
          const u = s.userData;
          s.position.y -= u.vy * dt;
          s.position.x += Math.sin(t * 0.8 + u.sway) * 0.02 * dt;
          s.material.rotation += u.spin * dt;
          if (s.position.y < -1.15) {
            s.position.y = 1.15;
            s.position.x = rand(-W(), W());
          }
        }
      },
    };
  },

  // 千早爱音：粉色光斑 bokeh + 上升的爱心与星形亮片 + 偶尔扫过的英国国旗色条纹
  anon({ view, color, mouse }) {
    const group = new THREE.Group();
    const dot = softDot();
    const ring = canvasTexture(128, (g, s) => {
      const grad = g.createRadialGradient(s / 2, s / 2, s * 0.3, s / 2, s / 2, s / 2);
      grad.addColorStop(0, 'rgba(255,255,255,0.35)');
      grad.addColorStop(0.85, 'rgba(255,255,255,0.8)');
      grad.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = grad;
      g.beginPath();
      g.arc(s / 2, s / 2, s / 2, 0, Math.PI * 2);
      g.fill();
    });
    const tints = [color, new THREE.Color(0xffc4d0), new THREE.Color(0xffe4ea), new THREE.Color(0xff6f91)];

    const bokeh = Array.from({ length: view.mobile ? 18 : 36 }, (_, i) => {
      const s = sprite(i % 3 ? dot : ring, tints[i % tints.length], 0.3);
      const size = rand(0.08, 0.38);
      s.scale.set(size, size, 1);
      s.position.set(rand(-2, 2), rand(-1, 1), 0);
      s.userData = { depth: size, phase: rand(0, 6.28), vx: rand(-0.03, 0.03), vy: rand(-0.02, 0.03), base: rand(0.08, 0.26) };
      group.add(s);
      return s;
    });

    const heart = canvasTexture(128, (g) => drawHeart(g, '#ff8fa8'));
    const star = canvasTexture(128, (g) => drawStar(g, '#fff0f4', 5));
    const floaters = Array.from({ length: view.mobile ? 12 : 24 }, (_, i) => {
      const s = sprite(i % 2 ? heart : star, 0xffffff, 0.9, false);
      const size = rand(0.04, 0.08);
      s.scale.set(size, size, 1);
      s.position.set(rand(-2, 2), rand(-1.2, 1.2), 0.1);
      s.userData = { vy: rand(0.05, 0.12), phase: rand(0, 6.28), spin: rand(-1, 1) };
      group.add(s);
      return s;
    });

    // 英国国旗色斜条纹（红 / 白 / 蓝）
    const stripes = [0xc8102e, 0xffffff, 0x012169].map((c, i) => {
      const m = new THREE.Mesh(
        new THREE.PlaneGeometry(0.07 - i * 0.015, 5),
        new THREE.MeshBasicMaterial({ color: c, transparent: true, opacity: 0, depthWrite: false }),
      );
      m.rotation.z = -0.6;
      m.userData.offset = i * 0.12;
      group.add(m);
      return m;
    });
    let sweepAt = 2;

    return {
      group,
      update(dt, t, pulse) {
        for (const s of bokeh) {
          const u = s.userData;
          s.position.x = wrap(s.position.x + u.vx * dt, -view.aspect - 0.4, view.aspect + 0.4);
          s.position.y = wrap(s.position.y + u.vy * dt, -1.4, 1.4);
          s.center.set(0.5 - mouse.x * u.depth * 0.25, 0.5 - mouse.y * u.depth * 0.25);
          s.material.opacity = u.base * (0.7 + 0.3 * Math.sin(t * 1.3 + u.phase)) + pulse * 0.2;
        }
        for (const s of floaters) {
          const u = s.userData;
          s.position.y += u.vy * dt;
          s.position.x += Math.sin(t + u.phase) * 0.04 * dt;
          s.material.rotation = Math.sin(t * 1.5 + u.phase) * 0.4 * u.spin;
          const k = 1 + pulse * 0.35;
          s.scale.setScalar(s.userData.size ?? (s.userData.size = s.scale.x)).multiplyScalar(k);
          if (s.position.y > 1.15) {
            s.position.y = -1.15;
            s.position.x = rand(-view.aspect, view.aspect);
          }
        }
        // 每 7 秒左右扫过一次
        const p = (t - sweepAt) / 1.6;
        if (p > 1) sweepAt = t + rand(5, 8);
        stripes.forEach((m) => {
          const q = p - m.userData.offset;
          const on = q > 0 && q < 1;
          m.position.x = (q * 2 - 1) * (view.aspect + 1.2);
          m.material.opacity = on ? Math.sin(q * Math.PI) * 0.22 : 0;
        });
      },
    };
  },

  // 要乐奈：六根吉他弦（只有鼠标拨片划过时才会被拨动，拨片见 cursor.js）+ 飘过的猫爪印 + 抹茶色光点
  rana({ view, color, pointer }) {
    const group = new THREE.Group();
    const dot = softDot();
    const SEG = 180;
    const strings = Array.from({ length: 6 }, (_, i) => {
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(SEG * 3), 3));
      const line = new THREE.Line(
        geo,
        new THREE.LineBasicMaterial({ color: i % 2 ? color : new THREE.Color(0xd8ffd0), transparent: true, opacity: 0.55, blending: THREE.AdditiveBlending }),
      );
      line.userData = { y: -0.55 + i * 0.22, amp: 0, freq: 5 + i * 1.3, last: 0 };
      group.add(line);
      return line;
    });

    const glow = points(view.mobile ? 60 : 140, dot, 0xffffff, 9, (i, p, c) => {
      p.set([rand(-2.2, 2.2), rand(-1, 1), 0], i * 3);
      const tint = new THREE.Color(Math.random() < 0.5 ? 0x8fcf6f : 0xc9e8a0);
      c.set([tint.r, tint.g, tint.b], i * 3);
    });
    glow.material.opacity = 0.5;
    group.add(glow);

    const paw = canvasTexture(128, drawPaw);
    const paws = Array.from({ length: view.mobile ? 8 : 14 }, () => {
      const s = sprite(paw, color, 0, false);
      s.scale.setScalar(rand(0.07, 0.11));
      s.userData = { life: rand(0, 1), speed: rand(0.12, 0.2) };
      placePaw(s);
      group.add(s);
      return s;
    });
    function placePaw(s) {
      s.position.set(rand(-view.aspect, view.aspect), rand(-0.95, 0.95), 0.1);
      s.material.rotation = rand(-0.6, 0.6);
    }

    let prevY = pointer.y;
    return {
      group,
      update(dt, t, pulse, active) {
        const W = view.aspect + 0.05;
        for (const line of strings) {
          const u = line.userData;
          // 拨片纵向划过某根弦时「拨弦」
          if (active && (prevY - u.y) * (pointer.y - u.y) < 0) u.amp = Math.min(0.12, u.amp + 0.08);
          u.amp *= Math.pow(0.25, dt);
          const p = line.geometry.attributes.position.array;
          for (let k = 0; k < SEG; k++) {
            const x = -W + (2 * W * k) / (SEG - 1);
            const env = Math.sin((Math.PI * k) / (SEG - 1));
            const y = u.y + env * (u.amp * Math.sin(t * 38) * Math.sin((u.freq * Math.PI * k) / SEG)
              + 0.006 * Math.sin(k * 0.12 + t * 2));
            p[k * 3] = x;
            p[k * 3 + 1] = y;
          }
          line.geometry.attributes.position.needsUpdate = true;
          line.material.opacity = 0.35 + u.amp * 4 + pulse * 0.05;
        }
        prevY = pointer.y;
        glow.material.opacity = 0.45 + pulse * 0.3;
        glow.rotation.z = Math.sin(t * 0.05) * 0.05;
        for (const s of paws) {
          const u = s.userData;
          u.life += dt * u.speed;
          if (u.life > 1) {
            u.life = 0;
            placePaw(s);
          }
          s.material.opacity = Math.sin(u.life * Math.PI) * 0.5;
        }
      },
    };
  },

  // 长崎爽世：暖金色香薰烟雾 + 上升的气泡 + 跟随鼠标的红茶色光晕
  soyo({ view, color, mouse }) {
    const group = new THREE.Group();
    const smokeTex = canvasTexture(256, drawSmoke);
    const dot = softDot();
    const smokeTints = [color, new THREE.Color(0xe8b27a), new THREE.Color(0xfff1d0)];
    const smoke = Array.from({ length: view.mobile ? 10 : 18 }, (_, i) => {
      const s = sprite(smokeTex, smokeTints[i % 3], 0.12);
      s.scale.setScalar(rand(0.7, 1.4));
      s.position.set(rand(-2, 2), rand(-1.2, 1.2), 0);
      s.userData = { vx: rand(-0.03, 0.03), vy: rand(0.015, 0.05), spin: rand(-0.12, 0.12), base: rand(0.07, 0.16) };
      group.add(s);
      return s;
    });

    const teaGlow = sprite(dot, new THREE.Color(0xc0713a), 0.35);
    teaGlow.scale.setScalar(1.6);
    group.add(teaGlow);

    const bubbleTex = canvasTexture(128, (g, s) => {
      g.strokeStyle = 'rgba(255,255,255,0.9)';
      g.lineWidth = 6;
      g.beginPath();
      g.arc(s / 2, s / 2, s / 2 - 8, 0, Math.PI * 2);
      g.stroke();
      g.fillStyle = 'rgba(255,255,255,0.8)';
      g.beginPath();
      g.ellipse(s * 0.36, s * 0.34, 10, 6, -0.6, 0, Math.PI * 2);
      g.fill();
    });
    const bubbles = Array.from({ length: view.mobile ? 16 : 32 }, () => {
      const s = sprite(bubbleTex, 0xfff3d6, 0.5);
      s.scale.setScalar(rand(0.025, 0.07));
      s.position.set(rand(-2, 2), rand(-1.2, 1.2), 0.1);
      s.userData = { vy: rand(0.06, 0.14), phase: rand(0, 6.28) };
      group.add(s);
      return s;
    });

    return {
      group,
      update(dt, t, pulse) {
        for (const s of smoke) {
          const u = s.userData;
          // 鼠标轻轻推开烟雾
          const dx = s.position.x - mouse.x;
          const dy = s.position.y - mouse.y;
          const d2 = dx * dx + dy * dy + 0.05;
          s.position.x = wrap(s.position.x + (u.vx + (dx / d2) * 0.01) * dt, -view.aspect - 0.8, view.aspect + 0.8);
          s.position.y = wrap(s.position.y + (u.vy + (dy / d2) * 0.01) * dt, -1.6, 1.6);
          s.material.rotation += u.spin * dt;
          s.material.opacity = u.base + pulse * 0.06;
        }
        teaGlow.position.lerp(new THREE.Vector3(mouse.x * 0.6, mouse.y * 0.6, 0), 0.02);
        teaGlow.material.opacity = 0.28 + Math.sin(t * 0.8) * 0.05 + pulse * 0.12;
        for (const s of bubbles) {
          const u = s.userData;
          s.position.y += u.vy * dt;
          s.position.x += Math.sin(t * 1.4 + u.phase) * 0.05 * dt;
          if (s.position.y > 1.15) {
            s.position.y = -1.15;
            s.position.x = rand(-view.aspect, view.aspect);
          }
        }
      },
    };
  },

  // 椎名立希：安静的点阵；只有点击背景时才「打鼓」，冲击波推开点阵（鼠标鼓棒见 cursor.js）
  taki({ view, color }) {
    const group = new THREE.Group();
    const dot = softDot();
    const COLS = view.mobile ? 22 : 40;
    const ROWS = view.mobile ? 26 : 22;
    const N = COLS * ROWS;
    const home = new Float32Array(N * 2);
    const grid = points(N, dot, 0xffffff, view.mobile ? 4 : 5, (i, p, c) => {
      c.set([0.6, 0.6, 0.85], i * 3);
    });
    group.add(grid);
    function layout() {
      for (let i = 0; i < N; i++) {
        const cx = i % COLS;
        const cy = Math.floor(i / COLS);
        home[i * 2] = (-1 + (2 * cx + 1) / COLS) * view.aspect;
        home[i * 2 + 1] = -1 + (2 * cy + 1) / ROWS;
      }
    }
    layout();

    const rings = Array.from({ length: 14 }, () => {
      const m = new THREE.Mesh(
        new THREE.RingGeometry(0.96, 1, 96),
        new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending }),
      );
      m.userData = { alive: false, r: 0, speed: 1, power: 1, cx: 0, cy: 0 };
      group.add(m);
      return m;
    });
    let ringIdx = 0;
    function emit(cx, cy, power) {
      const m = rings[ringIdx++ % rings.length];
      Object.assign(m.userData, { alive: true, r: 0.02, speed: 0.9 + power * 0.6, power, cx, cy });
      m.position.set(cx, cy, 0);
    }

    return {
      group,
      resize: layout,
      click(p) {
        emit(p.x, p.y, 2);
        emit(p.x, p.y, 1.3);
      },
      update(dt, t, pulse) {
        const alive = [];
        for (const m of rings) {
          const u = m.userData;
          if (!u.alive) continue;
          u.r += u.speed * dt;
          m.scale.setScalar(u.r);
          const fade = Math.max(0, 1 - u.r / (1.6 + u.power));
          m.material.opacity = fade * 0.55 * Math.min(1, u.power);
          if (fade <= 0) u.alive = false;
          else alive.push(u);
        }
        const p = grid.geometry.attributes.position.array;
        const c = grid.geometry.attributes.color.array;
        for (let i = 0; i < N; i++) {
          let x = home[i * 2];
          let y = home[i * 2 + 1];
          let glow = 0;
          for (const u of alive) {
            const dx = x - u.cx;
            const dy = y - u.cy;
            const d = Math.hypot(dx, dy) + 1e-4;
            const band = Math.exp(-(((d - u.r) / 0.06) ** 2)) * u.power;
            x += (dx / d) * band * 0.03;
            y += (dy / d) * band * 0.03;
            glow += band;
          }
          p[i * 3] = x;
          p[i * 3 + 1] = y;
          const v = 0.35 + glow * 0.9 + pulse * 0.04;
          c[i * 3] = v * (color.r + 0.3);
          c[i * 3 + 1] = v * (color.g + 0.3);
          c[i * 3 + 2] = v * (color.b + 0.3);
        }
        grid.geometry.attributes.position.needsUpdate = true;
        grid.geometry.attributes.color.needsUpdate = true;
      },
    };
  },
};

/* ---------- 画布贴图 ---------- */

function drawKonpeito(g, fill) {
  // 金平糖：带小尖角的圆形糖果
  g.translate(64, 64);
  g.fillStyle = fill;
  g.strokeStyle = 'rgba(255,255,255,0.9)';
  g.lineWidth = 3;
  g.beginPath();
  const spikes = 10;
  for (let i = 0; i <= spikes * 2; i++) {
    const a = (i / (spikes * 2)) * Math.PI * 2;
    const r = i % 2 ? 40 : 52;
    g.lineTo(Math.cos(a) * r, Math.sin(a) * r);
  }
  g.closePath();
  g.fill();
  g.stroke();
  g.fillStyle = 'rgba(255,255,255,0.7)';
  g.beginPath();
  g.arc(-12, -14, 10, 0, Math.PI * 2);
  g.fill();
}

function drawPebble(g) {
  const grad = g.createLinearGradient(20, 20, 108, 108);
  grad.addColorStop(0, '#b9bfcc');
  grad.addColorStop(1, '#6d7486');
  g.fillStyle = grad;
  g.beginPath();
  g.ellipse(64, 66, 50, 36, 0.3, 0, Math.PI * 2);
  g.fill();
  g.fillStyle = 'rgba(255,255,255,0.35)';
  g.beginPath();
  g.ellipse(48, 52, 16, 8, 0.3, 0, Math.PI * 2);
  g.fill();
}

function drawBandage(g) {
  g.translate(64, 64);
  g.rotate(-0.5);
  g.fillStyle = '#f2cfa4';
  roundRect(g, -58, -20, 116, 40, 20);
  g.fill();
  g.fillStyle = '#fbe6cb';
  roundRect(g, -20, -16, 40, 32, 6);
  g.fill();
  g.fillStyle = 'rgba(160,110,70,0.5)';
  for (const [x, y] of [[-42, -6], [-34, 6], [34, -6], [42, 6]]) {
    g.beginPath();
    g.arc(x, y, 2.5, 0, Math.PI * 2);
    g.fill();
  }
}

function drawHeart(g, fill) {
  g.fillStyle = fill;
  g.beginPath();
  g.moveTo(64, 108);
  g.bezierCurveTo(10, 72, 14, 22, 50, 26);
  g.bezierCurveTo(60, 28, 64, 38, 64, 42);
  g.bezierCurveTo(64, 38, 68, 28, 78, 26);
  g.bezierCurveTo(114, 22, 118, 72, 64, 108);
  g.fill();
}

function drawStar(g, fill, n) {
  g.translate(64, 64);
  g.fillStyle = fill;
  g.beginPath();
  for (let i = 0; i <= n * 2; i++) {
    const a = (i / (n * 2)) * Math.PI * 2 - Math.PI / 2;
    const r = i % 2 ? 22 : 56;
    g.lineTo(Math.cos(a) * r, Math.sin(a) * r);
  }
  g.fill();
}

function drawPaw(g) {
  g.fillStyle = '#ffffff';
  g.beginPath();
  g.ellipse(64, 80, 28, 22, 0, 0, Math.PI * 2);
  g.fill();
  for (const [x, y] of [[30, 48], [52, 32], [76, 32], [98, 48]]) {
    g.beginPath();
    g.ellipse(x, y, 11, 14, 0, 0, Math.PI * 2);
    g.fill();
  }
}

function drawSmoke(g, s) {
  // 用若干半透明径向渐变叠出一团柔软的烟
  for (let i = 0; i < 14; i++) {
    const x = s / 2 + rand(-50, 50);
    const y = s / 2 + rand(-50, 50);
    const r = rand(40, 90);
    const grad = g.createRadialGradient(x, y, 0, x, y, r);
    grad.addColorStop(0, 'rgba(255,255,255,0.22)');
    grad.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = grad;
    g.fillRect(0, 0, s, s);
  }
}

function roundRect(g, x, y, w, h, r) {
  g.beginPath();
  g.moveTo(x + r, y);
  g.arcTo(x + w, y, x + w, y + h, r);
  g.arcTo(x + w, y + h, x, y + h, r);
  g.arcTo(x, y + h, x, y, r);
  g.arcTo(x, y, x + w, y, r);
  g.closePath();
}
