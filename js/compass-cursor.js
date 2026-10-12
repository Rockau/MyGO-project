/**
 * MyGO 指南针光标系统
 *
 * 效果：
 * - 双层跟随（光标快跟、光晕慢跟）
 * - 指针惯性物理（弹簧 + 阻尼，1~2 次摆动归位）
 * - 指针拖尾（12 根渐隐短线）
 * - 悬停交互（放大 + 变色 + 光晕膨胀）
 * - 单击涟漪（方位圆环）
 * - 快速移动拖影（星点）
 */

const SVG_NS = 'http://www.w3.org/2000/svg';

/**
 * @param {string} excludeSelector - 排除的区域选择器（这些区域保持原有光标）
 */
export function initCompassCursor(excludeSelector = '') {
  // 只在精确指针设备上启用
  const finePointer = matchMedia('(pointer: fine)').matches;
  if (!finePointer) return;
  document.documentElement.classList.add('compass-on');

  /* ==================== 创建 DOM 元素 ==================== */

  // 光晕层（大圆，混合模式 soft-light）
  const orb = document.createElement('div');
  orb.className = 'compass-orb';
  orb.setAttribute('aria-hidden', 'true');
  document.body.appendChild(orb);

  // 光标层（指南针 SVG）
  const cursor = document.createElement('div');
  cursor.className = 'compass-cursor';
  cursor.setAttribute('aria-hidden', 'true');

  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('viewBox', '0 0 40 40');
  svg.setAttribute('fill', 'none');
  svg.setAttribute('stroke', 'currentColor');
  svg.setAttribute('stroke-linecap', 'round');

  // 外圈
  const outerCircle = document.createElementNS(SVG_NS, 'circle');
  outerCircle.setAttribute('cx', '20');
  outerCircle.setAttribute('cy', '20');
  outerCircle.setAttribute('r', '15');
  outerCircle.setAttribute('stroke-width', '0.6');
  outerCircle.setAttribute('opacity', '0.45');
  svg.appendChild(outerCircle);

  // 两段弧（装饰）
  const arc1 = document.createElementNS(SVG_NS, 'path');
  arc1.setAttribute('d', 'M 20 6 A 14 14 0 0 1 34 20');
  arc1.setAttribute('stroke-width', '0.6');
  arc1.setAttribute('opacity', '0.2');
  svg.appendChild(arc1);

  const arc2 = document.createElementNS(SVG_NS, 'path');
  arc2.setAttribute('d', 'M 20 34 A 14 14 0 0 1 6 20');
  arc2.setAttribute('stroke-width', '0.6');
  arc2.setAttribute('opacity', '0.2');
  svg.appendChild(arc2);

  // 四向刻度
  const tickN = document.createElementNS(SVG_NS, 'line');
  tickN.setAttribute('x1', '20'); tickN.setAttribute('y1', '1.5');
  tickN.setAttribute('x2', '20'); tickN.setAttribute('y2', '5');
  tickN.setAttribute('stroke-width', '0.8');
  tickN.setAttribute('opacity', '0.7');
  svg.appendChild(tickN);

  const tickS = document.createElementNS(SVG_NS, 'line');
  tickS.setAttribute('x1', '20'); tickS.setAttribute('y1', '35');
  tickS.setAttribute('x2', '20'); tickS.setAttribute('y2', '38.5');
  tickS.setAttribute('stroke-width', '0.8');
  tickS.setAttribute('opacity', '0.35');
  svg.appendChild(tickS);

  const tickW = document.createElementNS(SVG_NS, 'line');
  tickW.setAttribute('x1', '1.5'); tickW.setAttribute('y1', '20');
  tickW.setAttribute('x2', '5');   tickW.setAttribute('y2', '20');
  tickW.setAttribute('stroke-width', '0.8');
  tickW.setAttribute('opacity', '0.35');
  svg.appendChild(tickW);

  const tickE = document.createElementNS(SVG_NS, 'line');
  tickE.setAttribute('x1', '35');   tickE.setAttribute('y1', '20');
  tickE.setAttribute('x2', '38.5'); tickE.setAttribute('y2', '20');
  tickE.setAttribute('stroke-width', '0.8');
  tickE.setAttribute('opacity', '0.35');
  svg.appendChild(tickE);

  // 指针拖尾组
  const needleTrailGroup = document.createElementNS(SVG_NS, 'g');
  needleTrailGroup.classList.add('needle-trail');
  svg.appendChild(needleTrailGroup);

  // 指针组（N/S 指针 + 中心点）
  const needleGroup = document.createElementNS(SVG_NS, 'g');
  needleGroup.classList.add('needle');

  const needleN = document.createElementNS(SVG_NS, 'polygon');
  needleN.setAttribute('points', '20,7 22.4,20 20,18.4 17.6,20');
  needleN.setAttribute('fill', 'currentColor');
  needleN.setAttribute('opacity', '0.95');
  needleGroup.appendChild(needleN);

  const needleS = document.createElementNS(SVG_NS, 'polygon');
  needleS.setAttribute('points', '20,33 17.6,20 20,21.6 22.4,20');
  needleS.setAttribute('fill', 'currentColor');
  needleS.setAttribute('opacity', '0.28');
  needleGroup.appendChild(needleS);

  const center = document.createElementNS(SVG_NS, 'circle');
  center.setAttribute('cx', '20');
  center.setAttribute('cy', '20');
  center.setAttribute('r', '0.9');
  center.setAttribute('fill', 'currentColor');
  center.setAttribute('opacity', '0.9');
  needleGroup.appendChild(center);

  svg.appendChild(needleGroup);

  cursor.appendChild(svg);
  document.body.appendChild(cursor);

  // 创建 12 根拖尾线
  const TRAIL_COUNT = 12;
  const trailLines = [];
  for (let i = 0; i < TRAIL_COUNT; i++) {
    const line = document.createElementNS(SVG_NS, 'line');
    line.setAttribute('x1', '20');
    line.setAttribute('y1', '20');
    line.setAttribute('x2', '20');
    line.setAttribute('y2', '9');
    line.setAttribute('stroke', 'currentColor');
    line.setAttribute('stroke-width', '0.7');
    line.setAttribute('stroke-linecap', 'round');
    line.style.transformOrigin = '20px 20px';
    line.style.opacity = '0';
    needleTrailGroup.appendChild(line);
    trailLines.push(line);
  }

  /* ==================== 状态变量 ==================== */

  let mx = innerWidth / 2, my = innerHeight / 2;
  let orbX = mx, orbY = my;
  let curX = mx, curY = my;

  let lastTrailX = mx, lastTrailY = my;
  let lastMouseX = mx, lastMouseY = my;
  let lastMouseTime = performance.now();

  // 指针物理
  let needleAngle = 0;
  let needleVel = 0;

  const IMPULSE = 0.14;
  const SPRING = 0.055;
  const DAMPING = 0.86;
  const MAX_VEL = 30;
  const DEAD_ANGLE = 0.15;
  const DEAD_VEL = 0.15;

  const angleHistory = [];

  let isHovering = false;
  let isDown = false;
  let isHidden = false;
  let currentHoverColor = '#7aa2ff';

  let insideExcludeZone = false;

  // 舞台角色悬停：光标换成角色代表色并微微发光（颜色由 stage.js 广播）
  let stageColor = null;
  let hoverColor = null;
  // 长按旋转：按住 0.3 秒后指针开始转（1 秒一圈），周围冒出闪烁的星星；松开时弹出 MyGO!!!!!
  const HOLD_MS = 300;
  const SPIN_SPEED = 360; // 度 / 秒
  let holdTimer = 0;
  let spinning = false;
  let spinAngle = 0;
  let spinSpeed = 0; // 度 / 秒
  let lastFrame = performance.now();
  let nextSparkle = 0;
  const sparkles = [];

  /* ==================== 事件监听 ==================== */

  // 颜色优先级：悬停元素自带的颜色 > 舞台角色的代表色 > 默认冷蓝
  function applyColor() {
    const c = isHovering && hoverColor ? hoverColor : stageColor;
    currentHoverColor = c || '#7aa2ff';
    cursor.style.color = c || '';
    cursor.classList.toggle('compass-cursor-glow', !!stageColor && !isHovering);
    orb.style.setProperty('--orb-color', c || '');
  }

  addEventListener('stage-hover', (e) => {
    stageColor = e.detail;
    applyColor();
  });

  addEventListener('mousemove', e => {
    const now = performance.now();
    mx = e.clientX;
    my = e.clientY;

    // 检查是否在排除区域
    if (excludeSelector) {
      const target = document.elementFromPoint(mx, my);
      const inExclude = target && target.closest(excludeSelector);
      if (inExclude !== insideExcludeZone) {
        insideExcludeZone = inExclude;
        if (inExclude) {
          // 进入排除区，隐藏指南针光标
          cursor.style.opacity = '0';
          orb.style.opacity = '0';
        } else {
          // 离开排除区，恢复
          cursor.style.opacity = '';
          orb.style.opacity = '';
        }
      }
    }

    // 指针冲量
    const dx = mx - lastMouseX;
    const dt = Math.max(now - lastMouseTime, 1);
    const speed = dx / dt * 16;

    needleVel += -speed * IMPULSE;
    needleVel = Math.max(-MAX_VEL, Math.min(MAX_VEL, needleVel));

    lastMouseX = mx;
    lastMouseY = my;
    lastMouseTime = now;

    // 光标拖影（星点）
    const tdx = mx - lastTrailX;
    const tdy = my - lastTrailY;
    if (!insideExcludeZone && tdx * tdx + tdy * tdy > 900) {
      spawnTrail(mx, my, currentHoverColor);
      lastTrailX = mx;
      lastTrailY = my;
    }
  });

  document.documentElement.addEventListener('mouseleave', () => {
    isHidden = true;
    cursor.style.opacity = '0';
    orb.style.opacity = '0';
  });

  document.documentElement.addEventListener('mouseenter', () => {
    isHidden = false;
    if (!insideExcludeZone) {
      cursor.style.opacity = '';
      orb.style.opacity = '';
    }
  });

  // 悬停交互
  const hoverTargets = 'a, button, summary, label, input, .card, .btn';

  document.addEventListener('mouseover', e => {
    if (e.target.closest(hoverTargets) && !e.target.closest(excludeSelector)) {
      isHovering = true;
      cursor.classList.add('compass-cursor-hover');

      // 检查是否有自定义颜色
      const target = e.target.closest('[style*="--cursor-color"]');
      hoverColor = target ? getComputedStyle(target).getPropertyValue('--cursor-color').trim() || null : null;
      orb.classList.toggle('compass-orb-active', !!hoverColor);
      applyColor();
    }
  });

  document.addEventListener('mouseout', e => {
    if (e.target.closest(hoverTargets)) {
      isHovering = false;
      cursor.classList.remove('compass-cursor-hover');
      hoverColor = null;
      orb.classList.remove('compass-orb-active');
      applyColor();
    }
  });

  addEventListener('mousedown', e => {
    isDown = true;
    cursor.classList.add('compass-cursor-down');
    if (!insideExcludeZone) {
      spawnRipple(e.clientX, e.clientY, currentHoverColor);
      if (e.button === 0) {
        clearTimeout(holdTimer);
        holdTimer = setTimeout(() => {
          spinning = true;
          spinAngle = needleAngle;
          spinSpeed = 0;
        }, HOLD_MS);
      }
    }
  });

  addEventListener('mouseup', () => {
    isDown = false;
    cursor.classList.remove('compass-cursor-down');
    clearTimeout(holdTimer);
    if (spinning) {
      spinning = false;
      // 从当前转到的角度弹回原位（交给弹簧物理），并弹出 MyGO!!!!!
      needleAngle = (((spinAngle % 360) + 540) % 360) - 180;
      needleVel = 0;
      fadeSparkles();
      spawnMyGO(mx, my);
    }
  });
  // 切走窗口时也要停下
  addEventListener('blur', () => {
    clearTimeout(holdTimer);
    spinning = false;
    fadeSparkles();
  });

  /* ==================== 主循环 ==================== */

  (function loop() {
    // 双层跟随
    orbX += (mx - orbX) * 0.12;
    orbY += (my - orbY) * 0.12;
    curX += (mx - curX) * 0.38;
    curY += (my - curY) * 0.38;

    orb.style.transform = `translate3d(${orbX}px, ${orbY}px, 0) translate(-50%, -50%)`;
    cursor.style.transform = `translate3d(${curX}px, ${curY}px, 0) translate(-50%, -50%)`;

    // 长按旋转：按真实时间计算（不受屏幕刷新率影响），0.25 秒内加速到 1 秒一圈，期间不受弹簧和惯性影响
    const now = performance.now();
    const frameSec = Math.min((now - lastFrame) / 1000, 0.1);
    lastFrame = now;
    if (spinning) {
      spinSpeed = Math.min(SPIN_SPEED, spinSpeed + (SPIN_SPEED / 0.25) * frameSec);
      spinAngle += spinSpeed * frameSec;
      // 按住期间每隔一小段时间在指针周围冒一颗星星
      if (now >= nextSparkle && sparkles.length < 14) {
        spawnSparkle();
        nextSparkle = now + 70 + Math.random() * 90;
      }
    }
    // 星星跟着指针走
    for (const s of sparkles) s.el.style.transform = `translate3d(${curX + s.dx}px, ${curY + s.dy}px, 0)`;

    // 指针物理
    needleVel += -needleAngle * SPRING;
    needleVel *= DAMPING;
    needleAngle += needleVel;

    // 死区
    if (Math.abs(needleAngle) < DEAD_ANGLE && Math.abs(needleVel) < DEAD_VEL) {
      needleAngle = 0;
      needleVel = 0;
    }

    // 角度规范化
    if (needleAngle > 180) needleAngle -= 360;
    if (needleAngle < -180) needleAngle += 360;

    // 静止呼吸
    const time = performance.now() * 0.001;
    const idle = Math.sin(time * 0.9) * 1.5;

    const displayAngle = spinning ? spinAngle : needleAngle + idle;
    needleGroup.style.transform = `rotate(${displayAngle}deg)`;

    // 更新指针拖尾
    angleHistory.unshift(displayAngle);
    if (angleHistory.length > TRAIL_COUNT) angleHistory.pop();

    trailLines.forEach((line, i) => {
      const a = angleHistory[i];
      if (a === undefined) {
        line.style.opacity = '0';
        return;
      }
      line.style.transform = `rotate(${a}deg)`;
      const op = (1 - i / TRAIL_COUNT) * 0.42;
      line.style.opacity = op.toFixed(3);
    });

    requestAnimationFrame(loop);
  })();

  /* ==================== 工具函数 ==================== */

  function spawnTrail(x, y, color) {
    const t = document.createElement('div');
    t.className = 'compass-trail';
    t.style.setProperty('--trail-color', color);
    t.style.left = x + 'px';
    t.style.top = y + 'px';
    document.body.appendChild(t);
    setTimeout(() => t.remove(), 900);
  }

  // 长按时指针周围的星星：大小、位置、闪烁节奏都随机，每颗闪一阵后自己消失；松开时全部淡出
  function spawnSparkle() {
    const angle = Math.random() * Math.PI * 2;
    const dist = 22 + Math.random() * 26;
    const size = 7 + Math.random() * 13;
    const life = 900 + Math.random() * 900;
    const el = document.createElement('div');
    el.className = 'compass-sparkle';
    el.style.setProperty('--size', size.toFixed(1) + 'px');
    el.style.setProperty('--twinkle', (0.35 + Math.random() * 0.45).toFixed(2) + 's');
    el.style.setProperty('--life', life + 'ms');
    el.style.color = currentHoverColor;
    el.innerHTML = `<svg viewBox="0 0 20 20" aria-hidden="true"><path d="M10 0C10.8 6.5 13.5 9.2 20 10C13.5 10.8 10.8 13.5 10 20C9.2 13.5 6.5 10.8 0 10C6.5 9.2 9.2 6.5 10 0Z"/></svg>`;
    const s = { el, dx: Math.cos(angle) * dist, dy: Math.sin(angle) * dist };
    el.style.transform = `translate3d(${curX + s.dx}px, ${curY + s.dy}px, 0)`;
    document.body.appendChild(el);
    sparkles.push(s);
    s.timer = setTimeout(() => removeSparkle(s), life);
  }
  function removeSparkle(s) {
    const i = sparkles.indexOf(s);
    if (i >= 0) sparkles.splice(i, 1);
    s.el.remove();
  }
  function fadeSparkles() {
    for (const s of [...sparkles]) {
      clearTimeout(s.timer);
      s.el.classList.add('out');
      setTimeout(() => removeSparkle(s), 400);
    }
  }

  // 松开长按时弹出的 MyGO!!!!!：一道斜光从左扫到右，扫到末尾变成一颗小星星闪一下，然后一起淡出
  function spawnMyGO(x, y) {
    const el = document.createElement('div');
    el.className = 'compass-mygo';
    el.style.left = x + 'px';
    el.style.top = y + 'px';
    el.innerHTML = `<span class="compass-mygo-text">MyGO!!!!!</span>
      <svg class="compass-mygo-star" viewBox="0 0 20 20" aria-hidden="true">
        <path d="M10 0C10.8 6.5 13.5 9.2 20 10C13.5 10.8 10.8 13.5 10 20C9.2 13.5 6.5 10.8 0 10C6.5 9.2 9.2 6.5 10 0Z" fill="#fff"/>
      </svg>`;
    document.body.appendChild(el);
    setTimeout(() => el.remove(), 2000);
  }

  function spawnRipple(x, y, color) {
    const RIPPLE_SIZE = 200;
    const el = document.createElement('div');
    el.className = 'compass-ripple';
    el.style.setProperty('--ripple-color', color);
    el.style.width = RIPPLE_SIZE + 'px';
    el.style.height = RIPPLE_SIZE + 'px';
    el.style.transform = `translate3d(${x - RIPPLE_SIZE / 2}px, ${y - RIPPLE_SIZE / 2}px, 0)`;

    el.innerHTML = `
      <svg viewBox="0 0 200 200" fill="none" stroke="currentColor">
        <circle class="ring-main" cx="100" cy="100" r="80"
                stroke-width="1.2" stroke-linecap="round" opacity="0.9"/>
        <circle class="ring-sub" cx="100" cy="100" r="64"
                stroke-width="0.7" stroke-linecap="round"
                stroke-dasharray="3 7" opacity="0.6"/>
        <g class="ticks" stroke-linecap="round">
          <line x1="100" y1="4"  x2="100" y2="20" stroke-width="1.2" opacity="0.9"/>
          <line x1="100" y1="180" x2="100" y2="196" stroke-width="0.8" opacity="0.5"/>
          <line x1="4"   y1="100" x2="20" y2="100" stroke-width="0.8" opacity="0.5"/>
          <line x1="180" y1="100" x2="196" y2="100" stroke-width="0.8" opacity="0.5"/>
        </g>
        <circle class="spark" cx="100" cy="100" r="3"
                fill="currentColor" stroke="none" opacity="0.9"/>
      </svg>
    `;
    document.body.appendChild(el);
    setTimeout(() => el.remove(), 1200);
  }
}
