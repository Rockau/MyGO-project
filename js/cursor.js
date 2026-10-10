// 成员区的自定义鼠标：一层全屏透明画布，只在鼠标位于成员区时绘制，并隐藏系统鼠标。
// 灯：星星 + 拖影；爱音：粉色爱心 + 音符尾巴；乐奈：吉他拨片；爽世：红茶杯 + 杯口热气；立希：一对惯性跟随的鼓棒。
// 触屏设备不启用。

const finePointer = matchMedia('(pointer: fine)').matches;
const INTERACTIVE = 'button, a, summary, label, input, .strip-item';

export function initCursor(section) {
  if (!finePointer) return { setMember() {} };

  const canvas = document.createElement('canvas');
  canvas.className = 'cursor-layer';
  canvas.setAttribute('aria-hidden', 'true');
  document.body.appendChild(canvas);
  const g = canvas.getContext('2d');

  let dpr = 1;
  function resize() {
    dpr = Math.min(devicePixelRatio, 2);
    canvas.width = innerWidth * dpr;
    canvas.height = innerHeight * dpr;
  }
  addEventListener('resize', resize);
  resize();

  const mouse = { x: -100, y: -100, px: -100, py: -100 };
  let inside = false;
  let overInteractive = false;
  let style = null;
  let fx = []; // 拖影粒子（音符、热气、火花）
  let running = false;

  addEventListener('pointermove', (e) => {
    if (e.pointerType !== 'mouse') return;
    mouse.x = e.clientX;
    mouse.y = e.clientY;
    const inSection = !!e.target.closest?.('#members') && !document.body.classList.contains('lb-open');
    overInteractive = !!e.target.closest?.(INTERACTIVE);
    setInside(inSection);
  });
  document.addEventListener('pointerleave', () => setInside(false));
  section.addEventListener('pointerdown', () => style?.down?.());

  function setInside(v) {
    inside = v && !!style;
    section.classList.toggle('custom-cursor', inside);
    if (inside) start();
  }

  function setMember(id) {
    style = STYLES[id] ? STYLES[id]() : null;
    fx = [];
    setInside(inside || (style && section.matches(':hover')));
    if (!style) section.classList.remove('custom-cursor');
  }

  function start() {
    if (running) return;
    running = true;
    last = performance.now();
    requestAnimationFrame(frame);
  }

  let last = 0;
  function frame(now) {
    const dt = Math.min((now - last) / 1000, 0.05);
    last = now;
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.clearRect(0, 0, innerWidth, innerHeight);

    const dx = mouse.x - mouse.px;
    const dy = mouse.y - mouse.py;
    const ctx = { g, dt, t: now / 1000, mouse, dx, dy, speed: Math.hypot(dx, dy), fx, inside, hover: overInteractive };
    if (style) {
      if (inside) style.emit?.(ctx);
      fx = fx.filter((p) => (p.life -= dt) > 0);
      ctx.fx = fx;
      style.drawFx?.(ctx);
      if (inside) style.draw(ctx);
    }
    mouse.px = mouse.x;
    mouse.py = mouse.y;

    // 鼠标离开且拖影消失后停止绘制
    if (inside || fx.length) requestAnimationFrame(frame);
    else {
      g.clearRect(0, 0, innerWidth, innerHeight);
      running = false;
    }
  }

  return { setMember };
}

/* ---------- 各成员的鼠标样式 ---------- */

const STYLES = {
  // 高松灯：会慢慢旋转的蓝色星星，身后拖着一串渐小的星星残影，移动快时洒出小火花
  tomori() {
    const history = [];
    return {
      emit({ mouse, speed, fx }) {
        history.unshift({ x: mouse.x, y: mouse.y });
        history.length = Math.min(history.length, 14);
        if (speed > 6 && Math.random() < 0.6) {
          fx.push({ x: mouse.x, y: mouse.y, vx: (Math.random() - 0.5) * 40, vy: Math.random() * 30 + 10, life: 0.7, max: 0.7, r: Math.random() * 1.6 + 0.8 });
        }
      },
      drawFx({ g, dt, fx }) {
        for (const p of fx) {
          p.x += p.vx * dt;
          p.y += p.vy * dt;
          g.globalAlpha = p.life / p.max;
          g.fillStyle = '#e6f6ff';
          g.beginPath();
          g.arc(p.x, p.y, p.r, 0, Math.PI * 2);
          g.fill();
        }
        g.globalAlpha = 1;
      },
      draw({ g, t, mouse, hover }) {
        const R = hover ? 13 : 11;
        // 拖影：越旧越小越透明
        for (let i = history.length - 1; i >= 1; i--) {
          const k = 1 - i / history.length;
          g.globalAlpha = k * 0.45;
          star(g, history[i].x, history[i].y, R * (0.35 + k * 0.5), t * 1.2 - i * 0.12, '#77bbdd');
        }
        g.globalAlpha = 1;
        g.save();
        g.shadowColor = '#77bbdd';
        g.shadowBlur = 14;
        const grad = g.createRadialGradient(mouse.x, mouse.y, 0, mouse.x, mouse.y, R);
        grad.addColorStop(0, '#ffffff');
        grad.addColorStop(1, '#77bbdd');
        star(g, mouse.x, mouse.y, R, t * 1.2, grad);
        g.restore();
        g.strokeStyle = 'rgba(255,255,255,0.9)';
        g.lineWidth = 1.2;
        starPath(g, mouse.x, mouse.y, R, t * 1.2);
        g.stroke();
      },
    };
  },

  // 千早爱音：单色粉色爱心，移动时身后飘出一小串音符（较短的拖影）
  anon() {
    let travel = 0;
    const NOTES = ['♪', '♫'];
    return {
      emit({ mouse, dx, dy, speed, fx }) {
        travel += speed;
        if (travel < 30) return;
        travel = 0;
        const len = speed || 1;
        fx.push({
          x: mouse.x - (dx / len) * 12,
          y: mouse.y - (dy / len) * 12,
          vy: -22,
          glyph: NOTES[(Math.random() * NOTES.length) | 0],
          life: 0.55,
          max: 0.55,
        });
      },
      drawFx({ g, dt, fx }) {
        g.textAlign = 'center';
        g.textBaseline = 'middle';
        g.fillStyle = '#ff8899';
        g.font = '700 15px "Segoe UI Symbol", sans-serif';
        for (const p of fx) {
          p.y += p.vy * dt;
          g.globalAlpha = p.life / p.max;
          g.fillText(p.glyph, p.x, p.y);
        }
        g.globalAlpha = 1;
      },
      draw({ g, mouse, hover }) {
        const s = hover ? 1.2 : 1;
        g.save();
        g.translate(mouse.x, mouse.y);
        g.scale(s, s);
        g.shadowColor = '#ff8899';
        g.shadowBlur = 12;
        heartPath(g, 11);
        g.fillStyle = '#ff8899';
        g.fill();
        g.restore();
      },
    };
  },

  // 长崎爽世：简化的红茶杯（白色杯身 + 红茶色液面，无托盘），杯口冒出短短的热气
  soyo() {
    let travel = 0;
    let idle = 0;
    return {
      emit({ dt, mouse, speed, fx }) {
        travel += speed;
        idle += dt;
        if (travel > 16 || idle > 0.25) {
          travel = 0;
          idle = 0;
          fx.push({ x: mouse.x + (Math.random() - 0.5) * 6, y: mouse.y - 10, life: 0.6, max: 0.6 });
        }
      },
      drawFx({ g, dt, fx }) {
        g.fillStyle = '#fff4e2';
        for (const p of fx) {
          p.y -= 22 * dt;
          const k = p.life / p.max;
          g.globalAlpha = k * 0.5;
          g.beginPath();
          g.arc(p.x, p.y, 2 + (1 - k) * 4, 0, Math.PI * 2);
          g.fill();
        }
        g.globalAlpha = 1;
      },
      draw({ g, mouse, hover }) {
        const s = hover ? 1.45 : 1.25;
        g.save();
        g.translate(mouse.x, mouse.y);
        g.scale(s, s);
        g.shadowColor = 'rgba(255,221,136,0.7)';
        g.shadowBlur = 10;
        g.fillStyle = '#fff4e2';
        g.strokeStyle = '#fff4e2';
        // 杯把
        g.lineWidth = 2.4;
        g.beginPath();
        g.arc(10.5, -1, 4, -Math.PI / 2, Math.PI / 2);
        g.stroke();
        // 杯身
        g.beginPath();
        g.moveTo(-11, -6);
        g.lineTo(11, -6);
        g.bezierCurveTo(11, 4, 6, 8, 0, 8);
        g.bezierCurveTo(-6, 8, -11, 4, -11, -6);
        g.fill();
        // 红茶液面
        g.shadowBlur = 0;
        g.fillStyle = '#c0713a';
        g.beginPath();
        g.ellipse(0, -6, 10, 2.4, 0, 0, Math.PI * 2);
        g.fill();
        g.restore();
      },
    };
  },

  // 要乐奈：单色的绿色吉他拨片，移动时随速度轻微倾斜；划过背景琴弦时会拨响它（见 memberBg.js）
  rana() {
    let tilt = 0;
    return {
      draw({ g, mouse, dx, hover }) {
        tilt += (Math.max(-0.5, Math.min(0.5, dx * 0.04)) - tilt) * 0.2;
        const s = hover ? 1.2 : 1;
        g.save();
        g.translate(mouse.x, mouse.y);
        g.rotate(tilt);
        g.scale(s, s);
        g.shadowColor = '#77dd77';
        g.shadowBlur = 12;
        g.fillStyle = '#77dd77';
        // 圆角三角形拨片，尖端朝下并正好落在鼠标位置
        g.beginPath();
        g.moveTo(0, 0);
        g.bezierCurveTo(-4, -5, -12, -14, -10, -19);
        g.bezierCurveTo(-8, -23, 8, -23, 10, -19);
        g.bezierCurveTo(12, -14, 4, -5, 0, 0);
        g.fill();
        g.restore();
      },
    };
  },

  // 椎名立希：一对单色鼓棒，棒头指向鼠标；两根鼓棒用不同的弹簧参数跟随，形成惯性错位；按下鼠标时做一次「击打」
  taki() {
    const COLOR = '#b4b4e8';
    const sticks = [
      { side: -1, k: 0.26, damp: 0.7, x: -100, y: -100, vx: 0, vy: 0 },
      { side: 1, k: 0.13, damp: 0.8, x: -100, y: -100, vx: 0, vy: 0 },
    ];
    let strike = 0;
    let init = false;
    return {
      down() {
        strike = 1;
      },
      drawFx({ g, fx }) {
        // 击打瞬间的小圆环
        g.strokeStyle = COLOR;
        g.lineWidth = 2;
        for (const p of fx) {
          const k = p.life / p.max;
          g.globalAlpha = k * 0.8;
          g.beginPath();
          g.arc(p.x, p.y, 6 + (1 - k) * 22, 0, Math.PI * 2);
          g.stroke();
        }
        g.globalAlpha = 1;
      },
      draw({ g, mouse, fx, dt, hover }) {
        if (!init) {
          sticks.forEach((s) => Object.assign(s, { x: mouse.x, y: mouse.y }));
          init = true;
        }
        const wasStriking = strike > 0.95;
        strike = Math.max(0, strike - dt * 5);
        if (wasStriking && strike <= 0.95) fx.push({ x: mouse.x, y: mouse.y, life: 0.35, max: 0.35 });
        for (const s of sticks) {
          const tx = mouse.x + s.side * 5;
          const ty = mouse.y + strike * 4;
          s.vx = (s.vx + (tx - s.x) * s.k) * s.damp;
          s.vy = (s.vy + (ty - s.y) * s.k) * s.damp;
          s.x += s.vx;
          s.y += s.vy;
          // 棒身向上张开成 V 字；速度越快倾斜越大；击打时棒身向下挥
          const lean = Math.max(-0.5, Math.min(0.5, s.vx * 0.035));
          const angle = -Math.PI / 2 + s.side * (0.42 - strike * 0.3) - lean;
          drawStick(g, s.x, s.y, angle, hover ? 56 : 50, COLOR);
        }
      },
    };
  },
};

/* ---------- 绘制工具 ---------- */

function starPath(g, x, y, r, rot) {
  g.beginPath();
  for (let i = 0; i < 10; i++) {
    const a = rot + (i * Math.PI) / 5 - Math.PI / 2;
    const rr = i % 2 ? r * 0.45 : r;
    g.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
  }
  g.closePath();
}

function star(g, x, y, r, rot, fill) {
  starPath(g, x, y, r, rot);
  g.fillStyle = fill;
  g.fill();
}

function heartPath(g, r) {
  g.beginPath();
  g.moveTo(0, r * 0.95);
  g.bezierCurveTo(-r * 1.25, r * 0.15, -r * 0.95, -r * 0.95, 0, -r * 0.42);
  g.bezierCurveTo(r * 0.95, -r * 0.95, r * 1.25, r * 0.15, 0, r * 0.95);
  g.closePath();
}

// 单色鼓棒：从棒头 (x, y) 沿 angle 方向画到棒尾
function drawStick(g, x, y, angle, len, color) {
  g.save();
  g.translate(x, y);
  g.rotate(angle);
  g.shadowColor = color;
  g.shadowBlur = 8;
  g.fillStyle = color;
  g.beginPath();
  g.moveTo(4, -1.6);
  g.lineTo(len, -2.8);
  g.quadraticCurveTo(len + 3, 0, len, 2.8);
  g.lineTo(4, 1.6);
  g.closePath();
  g.fill();
  g.beginPath();
  g.ellipse(2.5, 0, 3.4, 2.4, 0, 0, Math.PI * 2);
  g.fill();
  g.restore();
}
