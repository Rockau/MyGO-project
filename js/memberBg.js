// 成员区的 Three.js 专属背景板：每位成员一套粒子 / 几何主题，切换成员时销毁旧场景、重建新场景。
// 正交相机，可视范围 x ∈ [-aspect, aspect]，y ∈ [-1, 1]。

import * as THREE from 'three';
import { beatBus } from './player.js';
import { asset } from './data.js';

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
    if (e.target.closest('button, a, .card, .profile, details')) return;
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
  // userData.textures：只给点击特效用、平时不挂在任何精灵上的贴图
  const textures = new Set(obj.userData.textures);
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
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];

// 寿命曲线（k 为 0→1 的寿命进度）
const easeOutBack = (k) => 1 + 2.70158 * (k - 1) ** 3 + 1.70158 * (k - 1) ** 2;
const easeOutCubic = (k) => 1 - (1 - k) ** 3;
const fadeInOut = (a, b) => (k) => (k < a ? k / a : k > b ? (1 - k) / (1 - b) : 1);
const popIn = (a) => (k) => (k < a ? Math.max(0, easeOutBack(k / a)) : 1);

// 点击特效：一次性的精灵粒子。按速度 / 阻力 / 重力运动，透明度与缩放随寿命变化，结束后自动销毁。
// 选项：x, y, vx, vy, g（向下的重力）, drag, vr（旋转速度）, rot, delay, life, size, aspect,
//       color, opacity, additive, alpha(k), scale(k), step(sprite, u, dt, k)（每帧的额外行为）
function clickFx(group) {
  const list = [];
  function spawn(tex, o) {
    const s = sprite(tex, o.color ?? 0xffffff, 0, o.additive ?? false);
    s.material.rotation = o.rot ?? 0;
    s.position.set(o.x, o.y, o.z ?? 0.3);
    s.visible = false;
    s.userData = {
      vx: 0, vy: 0, g: 0, drag: 0, vr: 0, delay: 0, age: 0, life: 1, size: 0.1, aspect: 1, opacity: 1,
      alpha: (k) => 1 - k, scale: () => 1, ...o,
    };
    group.add(s);
    list.push(s);
    return s;
  }
  function update(dt) {
    for (let i = list.length - 1; i >= 0; i--) {
      const s = list[i];
      const u = s.userData;
      if (u.delay > 0) {
        u.delay -= dt;
        continue;
      }
      s.visible = true;
      u.age += dt;
      const k = Math.min(1, u.age / u.life);
      u.step?.(s, u, dt, k);
      const damp = Math.exp(-u.drag * dt);
      u.vx *= damp;
      u.vy = u.vy * damp - u.g * dt;
      s.position.x += u.vx * dt;
      s.position.y += u.vy * dt;
      s.material.rotation += u.vr * dt;
      s.material.opacity = u.opacity * Math.max(0, u.alpha(k));
      const sc = u.size * u.scale(k);
      s.scale.set(sc * u.aspect, sc, 1);
      if (k >= 1) {
        group.remove(s);
        s.material.dispose();
        list.splice(i, 1);
      }
    }
  }
  return { spawn, update };
}

// 文字贴图：按文字宽度生成画布，返回贴图和宽高比（精灵按 aspect 横向拉伸）
function textTexture(text, { font, size = 64, fill, stroke, strokeWidth = 0, shadow }) {
  const c = document.createElement('canvas');
  const g = c.getContext('2d');
  g.font = font;
  const pad = size * 0.3 + strokeWidth;
  c.width = Math.ceil(g.measureText(text).width + pad * 2);
  c.height = Math.ceil(size * 1.4 + pad);
  g.font = font;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.lineJoin = 'round';
  if (shadow) {
    g.shadowColor = shadow;
    g.shadowBlur = size * 0.3;
  }
  if (stroke) {
    g.lineWidth = strokeWidth;
    g.strokeStyle = stroke;
    g.strokeText(text, c.width / 2, c.height / 2);
  }
  g.fillStyle = fill;
  g.fillText(text, c.width / 2, c.height / 2);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return { tex, aspect: c.width / c.height };
}

// 图片贴图：图片加载完后把 crop 区域画进画布；返回贴图和宽高比
function imageTexture(src, [sx, sy, sw, sh]) {
  const c = document.createElement('canvas');
  c.width = sw;
  c.height = sh;
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const img = new Image();
  img.onload = () => {
    c.getContext('2d').drawImage(img, sx, sy, sw, sh, 0, 0, sw, sh);
    tex.needsUpdate = true;
  };
  img.src = src;
  return { tex, aspect: sw / sh };
}

// 点击特效专用贴图的登记处：切换成员时随 group 一起释放
function fxTextures(group) {
  const owned = (group.userData.textures = []);
  const cache = new Map();
  return {
    add(tex) {
      owned.push(tex);
      return tex;
    },
    text(text, opts) {
      if (!cache.has(text)) {
        const t = textTexture(text, opts);
        owned.push(t.tex);
        cache.set(text, t);
      }
      return cache.get(text);
    },
  };
}

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
      canvasTexture(128, (g) => drawBandage(g, '#f2cfa4')), // 原版米色
      canvasTexture(128, (g) => drawBandage(g, '#77bbdd')), // 灯
      canvasTexture(128, (g) => drawBandage(g, '#ff8899')), // 爱音
      canvasTexture(128, (g) => drawBandage(g, '#77dd77')), // 乐奈
      canvasTexture(128, (g) => drawBandage(g, '#ffdd88')), // 爽世
      canvasTexture(128, (g) => drawBandage(g, '#7777aa')), // 立希
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

    // 点击：星星、小石头、创可贴向四周散开。石头和创可贴在空中停一下再随重力下落；
    // 星星闪一下后变成流星飞走，身后拖出光尾
    const fx = clickFx(group);
    const own = fxTextures(group);
    const sparkle = own.add(canvasTexture(128, drawSparkle));
    const starTint = color.clone().lerp(new THREE.Color(0xffffff), 0.45);
    const hangThenFall = (s, u, dt) => {
      if (!u.falling && u.age > u.hang) {
        u.falling = true;
        u.drag = 0.3;
        u.g = 2.4;
        u.vr = rand(-2.5, 2.5);
      } else if (!u.falling) u.vr *= Math.exp(-3 * dt);
    };
    function spawnItem(p, tex, a, sp) {
      const size = tex === kinds[4] ? rand(0.1, 0.14) : rand(0.07, 0.1);
      fx.spawn(tex, {
        x: p.x, y: p.y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, drag: 5,
        rot: rand(0, 6.28), vr: rand(-6, 6), size, life: 2.4, hang: rand(0.5, 0.7),
        alpha: fadeInOut(0.04, 0.75), scale: popIn(0.08), step: hangThenFall,
      });
    }
    function spawnStar(p, a, sp) {
      // 右侧点击向左飞，左侧点击向右飞
      const dir = p.x > 0 ? -1 : 1;
      fx.spawn(sparkle, {
        x: p.x, y: p.y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, drag: 5,
        size: rand(0.07, 0.1), color: starTint, additive: true, life: 1.7, trail: 0,
        alpha: fadeInOut(0.04, 0.8),
        // 停在空中时闪一下（k 在 0.26–0.44 之间放大再收回）
        scale: (k) => {
          if (k < 0.06) return easeOutBack(k / 0.06);
          const f = (k - 0.26) / 0.18;
          return f > 0 && f < 1 ? 1 + 0.9 * Math.sin(f * Math.PI) : 1;
        },
        step(s, u, dt) {
          if (!u.meteor && u.age > 0.75) {
            u.meteor = true;
            u.drag = 0;
            u.vx = dir * rand(2.2, 2.9);
            u.vy = rand(-1.3, -0.7);
            u.vr = dir * -4;
          }
          if (u.meteor && (u.trail -= dt) <= 0) {
            u.trail = 0.012;
            fx.spawn(dot, {
              x: s.position.x, y: s.position.y, z: 0.25, size: u.size * 0.55, color: starTint, additive: true,
              life: 0.35, alpha: (k) => (1 - k) * 0.7, scale: (k) => 1 - k * 0.8,
            });
          }
        },
      });
    }

    return {
      group,
      click(p) {
        const n = view.mobile ? 6 : 9;
        for (let i = 0; i < n; i++) {
          // 偏向上方的扇形里均匀散开
          const a = -0.35 + ((Math.PI + 0.7) * (i + rand(0.2, 0.8))) / n;
          const sp = rand(0.9, 1.7);
          const kind = Math.floor(Math.random() * 3);
          if (kind === 0) spawnStar(p, a, sp);
          else spawnItem(p, kinds[kind + 2], a, sp);
        }
      },
      update(dt, t, pulse) {
        fx.update(dt);
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

    // 点击：一圈圈爱心形的涟漪，中心冒出一句对队友的称呼（按 Tomorin~ → Soyorin~ → Rikki~ → Rana~ → Anon~ 轮流）
    const fx = clickFx(group);
    const own = fxTextures(group);
    const heartRing = own.add(canvasTexture(128, drawHeartOutline));
    const CALLS = ['Tomorin~', 'Soyorin~', 'Rikki~', 'Rana~', 'Anon~'];
    let callIdx = 0;
    const textStyle = {
      font: 'italic 800 64px "Segoe UI", "Noto Sans SC", sans-serif',
      fill: '#ff8fa8', stroke: '#ffffff', strokeWidth: 10, shadow: 'rgba(255,111,145,0.8)',
    };

    return {
      group,
      click(p) {
        for (let i = 0; i < 3; i++) {
          fx.spawn(heartRing, {
            x: p.x, y: p.y, delay: i * 0.13, size: 0.62 - i * 0.08, life: 1, color: i === 1 ? 0xffc4d0 : color, additive: true,
            alpha: (k) => (1 - k) ** 1.6, scale: (k) => 0.08 + 0.92 * easeOutCubic(k),
          });
        }
        fx.spawn(heart, {
          x: p.x, y: p.y, size: 0.09, life: 0.55, alpha: fadeInOut(0.1, 0.4), scale: (k) => popIn(0.3)(k) * (1 + k * 0.3),
        });
        const call = own.text(CALLS[callIdx++ % CALLS.length], textStyle);
        fx.spawn(call.tex, {
          x: p.x, y: p.y + 0.1, vy: 0.3, drag: 1.2, size: 0.11, aspect: call.aspect, life: 1.5,
          rot: rand(-0.1, 0.1), alpha: fadeInOut(0.08, 0.6), scale: popIn(0.22),
        });
      },
      update(dt, t, pulse) {
        fx.update(dt);
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

    // 点击：先按下一个发光的浅绿猫爪印，随后化成一团抹茶粉末像烟一样散开、缓缓飘落，
    // 最后飘起一句她的台词（按顺序轮流）
    const fx = clickFx(group);
    const own = fxTextures(group);
    const smokeTex = own.add(canvasTexture(256, drawSmoke));
    const MATCHA = [0x7fb24a, 0xa6cf6a, 0x5f8f3a, 0xc4e39a];
    const QUOTES = ['有趣的女人。', '抹茶芭菲。', '荞麦面。', 'RiNG 的野猫。', 'Rikki~'];
    let quoteIdx = 0;
    const quoteStyle = {
      font: '700 56px "Noto Sans SC", "Microsoft YaHei", system-ui, sans-serif',
      fill: '#e6ffd8', shadow: 'rgba(119,221,119,0.9)',
    };
    function clickRana(p) {
      const tilt = rand(-0.4, 0.4);
      fx.spawn(dot, {
        x: p.x, y: p.y, z: 0.25, size: 0.34, color: 0x9ddf7d, additive: true, opacity: 0.55, life: 0.7,
        alpha: fadeInOut(0.1, 0.45), scale: popIn(0.2),
      });
      fx.spawn(paw, {
        x: p.x, y: p.y, size: 0.13, color: 0xc8f7b0, additive: true, rot: tilt, life: 0.62,
        alpha: fadeInOut(0.06, 0.6), scale: (k) => popIn(0.18)(k) * (1 + Math.max(0, k - 0.6) * 0.6),
      });
      for (let i = 0; i < 4; i++) {
        fx.spawn(smokeTex, {
          x: p.x + rand(-0.03, 0.03), y: p.y + rand(-0.03, 0.03), delay: 0.38, vx: rand(-0.12, 0.12), vy: rand(-0.02, 0.08),
          drag: 1.5, g: 0.04, size: 0.2, color: pick(MATCHA), opacity: 0.4, rot: rand(0, 6.28), vr: rand(-0.4, 0.4), life: rand(1.5, 2),
          alpha: fadeInOut(0.12, 0.35), scale: (k) => 1 + easeOutCubic(k) * 1.6,
        });
      }
      const n = view.mobile ? 16 : 26;
      for (let i = 0; i < n; i++) {
        const a = rand(0, 6.28);
        const sp = rand(0.15, 0.7);
        fx.spawn(dot, {
          x: p.x, y: p.y, delay: rand(0.36, 0.44), vx: Math.cos(a) * sp, vy: Math.sin(a) * sp + 0.05,
          drag: 2.6, g: 0.12, size: rand(0.018, 0.04), color: pick(MATCHA), opacity: 0.9, life: rand(1.6, 2.4),
          alpha: fadeInOut(0.05, 0.5),
          step(s, u, dt) {
            s.position.x += Math.sin(u.age * 3 + a) * 0.02 * dt;
          },
        });
      }
      const q = own.text(QUOTES[quoteIdx++ % QUOTES.length], quoteStyle);
      fx.spawn(q.tex, {
        x: p.x, y: p.y + 0.12, delay: 0.5, vy: 0.12, size: 0.1, aspect: q.aspect, rot: rand(-0.08, 0.08), life: 2,
        alpha: fadeInOut(0.15, 0.6), scale: (k) => 0.92 + 0.08 * easeOutCubic(Math.min(1, k * 4)),
      });
    }

    let prevY = pointer.y;
    return {
      group,
      click: clickRana,
      update(dt, t, pulse, active) {
        fx.update(dt);
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

    // 点击：一滴红茶落进杯里——涟漪一圈圈扩散、溅起细小水花；低音谱号和音符从中心旋转着缓缓升起；
    // 随后几片深绿茶叶和浅金花瓣从上方飘落，落定后淡出
    const fx = clickFx(group);
    const own = fxTextures(group);
    const ripple = own.add(canvasTexture(128, drawRipple));
    const drop = own.add(canvasTexture(128, drawDrop));
    const clef = own.add(canvasTexture(128, drawBassClef));
    const noteStyle = { font: '64px "Segoe UI Symbol", "Noto Sans SC", serif', fill: '#fff1d0', shadow: 'rgba(224,160,96,0.9)' };
    const leaf = own.add(canvasTexture(128, drawTeaLeaf));
    const petal = own.add(canvasTexture(128, drawPetal));
    const TEA = 0xd28a4a;
    function clickSoyo(p) {
      const LAND = 0.14; // 茶滴落到点击处的时间
      fx.spawn(drop, {
        x: p.x, y: p.y + 0.3, vy: -0.3 / LAND, size: 0.05, color: 0xe0a060, life: LAND,
        alpha: (k) => Math.min(1, k * 4), scale: () => 1,
      });
      fx.spawn(dot, {
        x: p.x, y: p.y, delay: LAND, size: 0.3, color: 0xc0713a, additive: true, opacity: 0.6, life: 0.9,
        alpha: (k) => (1 - k) ** 2, scale: (k) => 0.6 + k * 0.6,
      });
      // 俯视的杯面：涟漪是略扁的椭圆
      for (let i = 0; i < 4; i++) {
        fx.spawn(ripple, {
          x: p.x, y: p.y, delay: LAND + i * 0.16, size: 0.42 - i * 0.05, aspect: 1.7, color: i % 2 ? 0xf0c890 : TEA,
          additive: true, life: 1.3, alpha: (k) => (1 - k) ** 1.4 * 0.95, scale: (k) => 0.06 + 0.94 * easeOutCubic(k),
        });
      }
      for (let i = 0; i < 7; i++) {
        const a = Math.PI / 2 + rand(-0.9, 0.9);
        const sp = rand(0.5, 0.9);
        fx.spawn(dot, {
          x: p.x, y: p.y, delay: LAND, vx: Math.cos(a) * sp * 0.5, vy: Math.sin(a) * sp, g: 3.2, size: rand(0.02, 0.035),
          color: 0xf0b070, additive: true, life: 0.5, alpha: (k) => 1 - k,
        });
      }
      const symbols = [{ tex: clef, aspect: 1, size: 0.12 }, ...['♩', '♪', '♫'].map((c) => ({ ...own.text(c, noteStyle), size: 0.09 }))];
      const n = view.mobile ? 3 : 4;
      for (let i = 0; i < n; i++) {
        const s = i === 0 ? symbols[0] : pick(symbols);
        fx.spawn(s.tex, {
          x: p.x + rand(-0.06, 0.06), y: p.y, delay: LAND + 0.15 + i * 0.14, vx: rand(-0.07, 0.07), vy: rand(0.16, 0.26),
          vr: rand(-0.8, 0.8), rot: rand(-0.3, 0.3), size: s.size * rand(0.85, 1.1), aspect: s.aspect, color: s.tex === clef ? 0xfff1d0 : 0xffffff,
          life: 2.3, alpha: fadeInOut(0.15, 0.55), scale: popIn(0.15),
          step(sp, u, dt) {
            sp.position.x += Math.sin(u.age * 2 + i) * 0.03 * dt;
          },
        });
      }
      const m = view.mobile ? 3 : 5;
      for (let i = 0; i < m; i++) {
        const isLeaf = Math.random() < 0.55;
        const phase = rand(0, 6.28);
        const base = rand(-0.6, 0.6);
        fx.spawn(isLeaf ? leaf : petal, {
          x: p.x + rand(-0.5, 0.5), y: Math.min(1.05, p.y + rand(0.45, 0.75)), delay: LAND + 0.35 + rand(0, 0.5),
          vy: -0.05, g: 0.38, drag: 1.3, size: isLeaf ? rand(0.07, 0.1) : rand(0.05, 0.07), life: rand(2.6, 3.2),
          alpha: fadeInOut(0.12, 0.75),
          step(sp, u, dt) {
            // 左右摇摆，像落叶一样翻转
            sp.position.x += Math.sin(u.age * 2.2 + phase) * 0.16 * dt;
            sp.material.rotation = base + Math.sin(u.age * 1.8 + phase) * 0.7;
          },
        });
      }
    }

    return {
      group,
      click: clickSoyo,
      update(dt, t, pulse) {
        fx.update(dt);
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

    // 点击时在波纹中心：30% 弹出极简熊猫头，30% 弹出一句「哈？」，其余只有原本的冲击波
    const fx = clickFx(group);
    const own = fxTextures(group);
    // 熊猫直接使用「熊猫/熊猫.png」原图（透明底），只裁掉四周空白，保证和原图一模一样
    const panda = imageTexture(asset('熊猫/熊猫.png'), [762, 486, 838, 745]);
    own.add(panda.tex);
    const haStyle = {
      font: '900 64px "Noto Sans SC", "Microsoft YaHei", sans-serif',
      fill: '#ffffff', stroke: '#7777aa', strokeWidth: 12, shadow: 'rgba(119,119,170,0.9)',
    };
    // 弹出后带一点摇晃，再轻轻上浮淡出
    const wobble = (s, u, dt, k) => {
      s.material.rotation = u.rot0 + Math.sin(u.age * 22) * 0.22 * Math.max(0, 1 - k * 3);
    };
    let popIdx = 0;
    function popAt(p) {
      const isPanda = popIdx++ % 2 === 0;
      if (isPanda) {
        fx.spawn(panda.tex, {
          x: p.x, y: p.y, vy: 0.08, size: 0.17, aspect: panda.aspect, opacity: 0.9, life: 1.2, rot0: rand(-0.12, 0.12),
          alpha: fadeInOut(0.05, 0.7), scale: popIn(0.2), step: wobble,
        });
      } else {
        const ha = own.text('哈？', haStyle);
        fx.spawn(ha.tex, {
          x: p.x, y: p.y, vy: 0.1, size: 0.13, aspect: ha.aspect, life: 1.1, rot0: rand(-0.15, 0.05),
          alpha: fadeInOut(0.05, 0.65), scale: popIn(0.18), step: wobble,
        });
      }
    }

    return {
      group,
      resize: layout,
      click(p) {
        emit(p.x, p.y, 2);
        emit(p.x, p.y, 1.3);
        popAt(p);
      },
      update(dt, t, pulse) {
        fx.update(dt);
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

function drawBandage(g, bodyColor = '#f2cfa4') {
  g.translate(64, 64);
  g.rotate(-0.5);
  g.fillStyle = bodyColor;
  roundRect(g, -58, -20, 116, 40, 20);
  g.fill();
  // 中间纱布：取主色的亮色版本
  g.fillStyle = 'rgba(255,255,255,0.32)';
  roundRect(g, -20, -16, 40, 32, 6);
  g.fill();
  g.fillStyle = 'rgba(0,0,0,0.18)';
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

// ── 点击特效专用贴图 ──

// 四角闪光星（灯的流星用）
function drawSparkle(g, s = 128) {
  g.translate(s / 2, s / 2);
  g.fillStyle = '#ffffff';
  for (let i = 0; i < 4; i++) {
    g.save();
    g.rotate((i * Math.PI) / 2);
    g.beginPath();
    g.moveTo(0, -s * 0.46);
    g.quadraticCurveTo(s * 0.04, -s * 0.04, 0, 0);
    g.quadraticCurveTo(-s * 0.04, -s * 0.04, 0, -s * 0.46);
    g.fill();
    g.restore();
  }
  g.beginPath();
  g.arc(0, 0, s * 0.06, 0, Math.PI * 2);
  g.fillStyle = '#ffe8ff';
  g.fill();
}

// 爱心形轮廓环（爱音涟漪用）
function drawHeartOutline(g, s = 128) {
  const hw = s / 2;
  const scale = s / 128;
  g.strokeStyle = '#ffffff';
  g.lineWidth = 7 * scale;
  g.beginPath();
  g.moveTo(hw, hw + 28 * scale);
  g.bezierCurveTo(hw - 50 * scale, hw + 8 * scale, hw - 54 * scale, hw - 38 * scale, hw, hw - 20 * scale);
  g.bezierCurveTo(hw + 54 * scale, hw - 38 * scale, hw + 50 * scale, hw + 8 * scale, hw, hw + 28 * scale);
  g.closePath();
  g.stroke();
}

// 圆形涟漪轮廓（爽世红茶用）
function drawRipple(g, s = 128) {
  g.strokeStyle = 'rgba(255,255,255,0.95)';
  g.lineWidth = 5;
  g.beginPath();
  g.arc(s / 2, s / 2, s / 2 - 4, 0, Math.PI * 2);
  g.stroke();
}

// 水滴（爽世茶滴入杯用）
function drawDrop(g, s = 128) {
  const hw = s / 2;
  g.fillStyle = '#ffffff';
  g.beginPath();
  g.moveTo(hw, s * 0.1);
  g.bezierCurveTo(hw + s * 0.24, s * 0.3, hw + s * 0.28, s * 0.56, hw, s * 0.88);
  g.bezierCurveTo(hw - s * 0.28, s * 0.56, hw - s * 0.24, s * 0.3, hw, s * 0.1);
  g.fill();
  g.fillStyle = 'rgba(255,255,255,0.35)';
  g.beginPath();
  g.ellipse(hw - s * 0.08, s * 0.38, s * 0.06, s * 0.1, -0.4, 0, Math.PI * 2);
  g.fill();
}

// 低音谱号（爽世点击用）：用路径画，不依赖系统里有没有音乐符号字体
function drawBassClef(g) {
  g.strokeStyle = g.fillStyle = '#ffffff';
  g.shadowColor = 'rgba(224,160,96,0.9)';
  g.shadowBlur = 14;
  g.lineWidth = 10;
  g.lineCap = 'round';
  g.beginPath();
  g.moveTo(34, 50);
  g.bezierCurveTo(30, 20, 94, 12, 92, 52);
  g.bezierCurveTo(90, 84, 62, 102, 28, 114);
  g.stroke();
  for (const [x, y, r] of [[38, 50, 13], [110, 38, 7], [110, 66, 7]]) {
    g.beginPath();
    g.arc(x, y, r, 0, Math.PI * 2);
    g.fill();
  }
}

// 茶叶（爽世点击用）
// 茶叶（爽世点击用）：细长自然形态，用贝塞尔曲线画，两端尖，中间稍宽
function drawTeaLeaf(g, s = 128) {
  g.translate(s / 2, s / 2);
  g.rotate(0.2);
  g.fillStyle = '#2d5a28';
  g.beginPath();
  // 左尖 → 上弧 → 右尖 → 下弧，形成一片细长茶叶
  g.moveTo(-s * 0.44, 0);
  g.bezierCurveTo(-s * 0.28, -s * 0.14, s * 0.28, -s * 0.14, s * 0.44, 0);
  g.bezierCurveTo(s * 0.28, s * 0.14, -s * 0.28, s * 0.14, -s * 0.44, 0);
  g.closePath();
  g.fill();
  // 中脉：浅绿色细线
  g.strokeStyle = 'rgba(100,200,80,0.55)';
  g.lineWidth = 2;
  g.beginPath();
  g.moveTo(-s * 0.4, 0);
  g.bezierCurveTo(-s * 0.1, -s * 0.04, s * 0.1, -s * 0.04, s * 0.4, 0);
  g.stroke();
  // 几条侧脉
  g.lineWidth = 1;
  g.globalAlpha = 0.4;
  for (const sx of [-0.22, 0, 0.22]) {
    g.beginPath();
    g.moveTo(sx * s, -s * 0.01);
    g.lineTo((sx + 0.08) * s, -s * 0.1);
    g.stroke();
    g.beginPath();
    g.moveTo(sx * s, s * 0.01);
    g.lineTo((sx + 0.08) * s, s * 0.1);
    g.stroke();
  }
  g.globalAlpha = 1;
}

// 花瓣（爽世点击用）
function drawPetal(g, s = 128) {
  g.translate(s / 2, s / 2);
  g.fillStyle = '#f8e8b0';
  g.beginPath();
  g.ellipse(0, 0, s * 0.38, s * 0.16, 0.15, 0, Math.PI * 2);
  g.fill();
  g.strokeStyle = 'rgba(240,200,100,0.5)';
  g.lineWidth = 2;
  g.beginPath();
  g.moveTo(-s * 0.3, 0);
  g.lineTo(s * 0.3, 0);
  g.stroke();
}
