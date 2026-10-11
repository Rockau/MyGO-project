import { MEMBERS, OUTFITS, SONGS, ALBUM, STORY, SCENES, RELATED, GALLERY, BLURAY, bookPage, bdPage, outfitSrc, avatarSrc, signSrc } from './data.js';
import { initPlayer, playSong, startShow, beatBus } from './player.js';
import { initStage } from './stage.js';
import { initMemberBg } from './memberBg.js';
import { initCursor } from './cursor.js';

const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

/* ---------- 灯箱 ---------- */

const lightbox = (() => {
  const root = $('#lightbox');
  const img = $('.lb-stage img', root);
  const caption = $('.lb-caption', root);
  let list = [];
  let index = 0;
  let lastFocus = null;

  function show(i) {
    index = (i + list.length) % list.length;
    root.classList.remove('zoomed');
    img.src = list[index].src;
    img.alt = list[index].caption;
    caption.textContent = `${list[index].caption}　${index + 1} / ${list.length}`;
    root.classList.toggle('single', list.length < 2);
  }
  function open(items, i = 0) {
    list = items;
    lastFocus = document.activeElement;
    root.hidden = false;
    document.body.classList.add('lb-open');
    show(i);
    $('.lb-close', root).focus();
  }
  function close() {
    root.hidden = true;
    document.body.classList.remove('lb-open');
    lastFocus?.focus();
  }
  $('.lb-close', root).addEventListener('click', close);
  $('.lb-prev', root).addEventListener('click', () => show(index - 1));
  $('.lb-next', root).addEventListener('click', () => show(index + 1));
  root.addEventListener('click', (e) => {
    if (e.target === root || e.target.classList.contains('lb-stage')) close();
  });
  img.addEventListener('click', (e) => {
    root.classList.toggle('zoomed');
    pan(e);
  });
  img.addEventListener('mousemove', pan);
  function pan(e) {
    const r = img.getBoundingClientRect();
    img.style.transformOrigin = `${((e.clientX - r.left) / r.width) * 100}% ${((e.clientY - r.top) / r.height) * 100}%`;
  }
  addEventListener('keydown', (e) => {
    if (root.hidden) return;
    if (e.key === 'Escape') close();
    else if (e.key === 'ArrowLeft') show(index - 1);
    else if (e.key === 'ArrowRight') show(index + 1);
  });
  return { open, isOpen: () => !root.hidden };
})();

const pageItem = (n, label) => ({ src: bookPage(n), caption: label ?? `设定集 P.${String(n).padStart(3, '0')}` });

/* ---------- 通用：设定集图片、滚动渐入、导航 ---------- */

function hydratePageImages() {
  $$('img[data-page]').forEach((img) => (img.src = bookPage(img.dataset.page)));
  $('.hero-bg').style.backgroundImage = `url("${bookPage(1)}")`;
  $$('[data-lightbox-single]').forEach((el) =>
    el.addEventListener('click', () => lightbox.open([pageItem(Number(el.dataset.lightboxSingle))])),
  );
}

const revealer = new IntersectionObserver(
  (entries) => entries.forEach((e) => {
    if (e.isIntersecting) {
      e.target.classList.add('in');
      revealer.unobserve(e.target);
    }
  }),
  { threshold: 0.12 },
);
const observeReveals = (root = document) => $$('.reveal:not(.in)', root).forEach((el) => revealer.observe(el));

function initNav() {
  const links = $$('.nav a[href^="#"]');
  const nav = $('.nav');
  const bar = $('.progress');
  const sections = links.map((a) => $(a.getAttribute('href'))).filter(Boolean);
  const onScroll = () => {
    const max = document.documentElement.scrollHeight - innerHeight;
    bar.style.transform = `scaleX(${max > 0 ? scrollY / max : 0})`;
    nav.classList.toggle('solid', scrollY > 40);
    const mid = scrollY + innerHeight * 0.35;
    let current = null;
    for (const s of sections) if (s.offsetTop <= mid) current = s.id;
    links.forEach((a) => a.classList.toggle('active', a.getAttribute('href') === `#${current}`));
  };
  addEventListener('scroll', onScroll, { passive: true });
  onScroll();
}

/* ---------- 成员 ---------- */

const INSTRUMENT_SVG = {
  mic: `<svg viewBox="0 0 200 400"><circle cx="100" cy="70" r="46"/><path d="M62 70h76M66 50h68M66 90h68"/><path d="M80 116l8 40h24l8-40"/><path d="M100 156v200M60 360h80"/></svg>`,
  guitar: `<svg viewBox="0 0 200 400"><path d="M92 20h16v170h-16z"/><path d="M88 20h24M88 34h24M88 48h24"/><path d="M100 180c-30-6-62 10-60 52 2 30 22 38 20 62-2 26-28 34-20 66 8 30 42 36 60 36s52-6 60-36c8-32-18-40-20-66-2-24 18-32 20-62 2-42-30-58-60-52z"/><circle cx="100" cy="290" r="16"/><path d="M76 340h48"/></svg>`,
  bass: `<svg viewBox="0 0 200 400"><path d="M94 6h12v200H94z"/><path d="M88 6h24M88 22h24"/><path d="M100 196c-24-8-60 4-58 44 1 22 18 34 14 58-4 22-24 36-14 62 10 26 40 32 58 32s48-6 58-32c10-26-10-40-14-62-4-24 13-36 14-58 2-40-34-52-58-44z"/><path d="M80 270h40M80 300h40"/></svg>`,
  drums: `<svg viewBox="0 0 400 400"><ellipse cx="200" cy="250" rx="90" ry="90"/><ellipse cx="200" cy="250" rx="60" ry="60"/><ellipse cx="80" cy="200" rx="50" ry="20"/><path d="M30 200v60c0 12 22 20 50 20s50-8 50-20v-60"/><ellipse cx="320" cy="200" rx="50" ry="20"/><path d="M270 200v60c0 12 22 20 50 20s50-8 50-20v-60"/><path d="M60 110h100M110 110v40M240 90h110M295 90v60"/><path d="M200 340v40M150 380h100"/></svg>`,
};

function initMembers() {
  const section = $('#members');
  const tabs = $('.member-tabs', section);
  const article = $('.member', section);
  const watermark = $('.member-watermark', section);
  const instrument = $('.member-instrument', section);
  const bg = initMemberBg(section);
  const cursor = initCursor(section);

  tabs.innerHTML = MEMBERS.map(
    (m, i) => `
    <button class="member-tab" role="tab" type="button" data-i="${i}" style="--c:${m.color};--c-rgb:${m.rgb}" aria-label="${m.nameZh}">
      <span class="avatar"><img src="${avatarSrc(m)}" alt="" loading="lazy" /></span>
      <span>${m.nameZh}</span>
    </button>`,
  ).join('');

  let current = -1;
  let outfit = 'live';
  let swapTimer = 0;

  function select(i, { instant = false } = {}) {
    i = (i + MEMBERS.length) % MEMBERS.length;
    if (i === current) return;
    current = i;
    const m = MEMBERS[i];
    outfit = 'live';
    section.style.setProperty('--c', m.color);
    section.style.setProperty('--c-rgb', m.rgb);
    section.dataset.member = m.id;
    $$('.member-tab', tabs).forEach((t, k) => {
      t.classList.toggle('active', k === i);
      t.setAttribute('aria-selected', k === i);
    });
    bg.setTheme(m.id, m.color);
    cursor.setMember(m.id);
    // 预加载其他服装
    OUTFITS.forEach((o) => (new Image().src = outfitSrc(m, o.key)));

    clearTimeout(swapTimer);
    article.classList.add('leaving');
    swapTimer = setTimeout(() => {
      watermark.textContent = m.nameJa.replace(' ', '');
      instrument.innerHTML = INSTRUMENT_SVG[m.instrument];
      article.innerHTML = renderMember(m);
      bindMember(m);
      article.classList.remove('leaving');
      article.classList.add('entering');
      requestAnimationFrame(() => requestAnimationFrame(() => article.classList.remove('entering')));
    }, instant ? 0 : 260);
  }

  function renderMember(m) {
    const stat = (k, v) => `<div><dt>${k}</dt><dd>${v}</dd></div>`;
    const chips = (label, arr, cls) =>
      arr.length ? `<div class="chip-row"><span class="chip-label">${label}</span>${arr.map((x) => `<span class="chip ${cls}">${esc(x)}</span>`).join('')}</div>` : '';
    return `
      <div class="member-grid">
        <div class="portrait-col">
          <p class="portrait-romaji" aria-hidden="true">${m.romaji}</p>
          <div class="portrait" data-outfit="live">
            <div class="portrait-glow"></div>
            <div class="portrait-floor"></div>
            <img class="portrait-img" src="${outfitSrc(m, 'live')}" alt="${m.nameZh}（演出服）" />
          </div>
          <button type="button" class="portrait-view" aria-label="查看${m.nameZh}的大图">
            <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="10.5" cy="10.5" r="6.5"/><path d="M15.5 15.5 21 21M10.5 7.5v6M7.5 10.5h6"/></svg>
            <span>查看大图</span>
          </button>
          <div class="outfit-tabs" role="tablist" aria-label="服装">
            ${OUTFITS.map((o) => `<button type="button" data-outfit="${o.key}" class="${o.key === 'live' ? 'active' : ''}">${o.label}</button>`).join('')}
          </div>
        </div>
        <div class="profile">
          <span class="profile-sign" style="--sign:url('${signSrc(m)}');--sign-ar:${m.signRatio};--sign-scale:${Math.sqrt(m.signRatio / 2).toFixed(3)}" role="img" aria-label="${m.nameZh}的签名"></span>
          <p class="profile-part">${m.part}<span>${m.partZh}</span></p>
          <h3 class="profile-name"><span class="ja">${m.nameJa}</span><span class="zh">${m.nameZh}</span></h3>
          <p class="profile-romaji">${m.romaji}</p>
          <p class="profile-tagline">${m.tagline}</p>
          <dl class="stats">
            ${stat('担当', m.partZh)}
            ${stat('CV', m.cv)}
            ${stat('生日', `${m.birthday} · ${m.sign}`)}
            ${stat('学校', m.school)}
          </dl>
          <div class="profile-intro">${m.intro.map((p) => `<p>${p}</p>`).join('')}</div>
          <div class="chips">
            ${chips('喜欢', m.likes, 'like')}
            ${chips('讨厌', m.dislikes, 'dislike')}
            ${chips('兴趣', m.hobbies, 'hobby')}
          </div>
          <div class="arc">
            <span class="arc-label">成长线</span>
            <p>${m.arc}</p>
            ${m.spoiler ? `<details class="spoiler"><summary>剧透内容（点击展开）</summary><p>${m.spoiler}</p></details>` : ''}
          </div>
          <div class="member-songs">
            <span class="chip-label">推荐听</span>
            ${m.songs.map((s) => `<button type="button" class="song-chip" data-song="${s}">♪ ${s}</button>`).join('')}
          </div>
        </div>
      </div>
      <div class="book-strip">
        <p class="strip-label">设定集原稿 <span>FOOTPRINTS P.${String(m.pages[0]).padStart(3, '0')}–${String(m.pages.at(-1)).padStart(3, '0')} · 蓝光上巻特典小册子</span></p>
        <div class="strip">
          ${m.pages.map((p, k) => `<button type="button" class="strip-item" data-k="${k}"><img loading="lazy" src="${bookPage(p)}" alt="${m.nameZh} 设定稿 P.${p}" /></button>`).join('')}
          <button type="button" class="strip-item wide" data-k="${m.pages.length}"><img loading="lazy" src="${bdPage(m.bd)}" alt="${m.nameZh} 蓝光特典小册子" /><span>蓝光特典</span></button>
        </div>
      </div>
      <div class="trivia">
        ${m.trivia
          .map(
            (t, k) => `
          <button type="button" class="card" style="--d:${k * 70}ms" aria-label="${t.q}，点击翻转">
            <span class="card-inner">
              <span class="card-front"><i>Q${k + 1}</i>${t.q}</span>
              <span class="card-back">${esc(t.a)}</span>
            </span>
          </button>`,
          )
          .join('')}
      </div>`;
  }

  function bindMember(m) {
    const portrait = $('.portrait', article);
    const img = $('.portrait-img', article);
    $$('.outfit-tabs button', article).forEach((b) =>
      b.addEventListener('click', () => {
        if (b.dataset.outfit === outfit) return;
        outfit = b.dataset.outfit;
        $$('.outfit-tabs button', article).forEach((x) => x.classList.toggle('active', x === b));
        portrait.classList.add('swap');
        setTimeout(() => {
          img.src = outfitSrc(m, outfit);
          img.alt = `${m.nameZh}（${OUTFITS.find((o) => o.key === outfit).label}）`;
          portrait.dataset.outfit = outfit;
          img.decode?.().catch(() => {}).finally(() => portrait.classList.remove('swap'));
        }, 200);
      }),
    );

    // 立绘 3D 倾斜
    portrait.addEventListener('pointermove', (e) => {
      const r = portrait.getBoundingClientRect();
      const x = (e.clientX - r.left) / r.width - 0.5;
      const y = (e.clientY - r.top) / r.height - 0.5;
      portrait.style.setProperty('--rx', `${-y * 10}deg`);
      portrait.style.setProperty('--ry', `${x * 14}deg`);
      portrait.style.setProperty('--gx', `${(x + 0.5) * 100}%`);
    });
    portrait.addEventListener('pointerleave', () => {
      portrait.style.setProperty('--rx', '0deg');
      portrait.style.setProperty('--ry', '0deg');
    });
    // 立绘本身不再响应点击，只通过旁边的按钮查看大图
    $('.portrait-view', article).addEventListener('click', () =>
      lightbox.open(OUTFITS.map((o) => ({ src: outfitSrc(m, o.key), caption: `${m.nameZh} · ${o.label}` })), OUTFITS.findIndex((o) => o.key === outfit)),
    );

    const pages = [
      ...m.pages.map((p) => pageItem(p, `${m.nameZh} · 设定集 P.${String(p).padStart(3, '0')}`)),
      { src: bdPage(m.bd), caption: `${m.nameZh} · 蓝光上巻特典小册子` },
    ];
    $$('.strip-item', article).forEach((b) => b.addEventListener('click', () => lightbox.open(pages, Number(b.dataset.k))));
    $$('.card', article).forEach((c) => c.addEventListener('click', () => c.classList.toggle('flipped')));
    $$('.song-chip', article).forEach((b) => b.addEventListener('click', () => playSong(b.dataset.song)));
  }

  tabs.addEventListener('click', (e) => {
    const t = e.target.closest('.member-tab');
    if (t) select(Number(t.dataset.i));
  });

  // 成员区在视野中时，←/→ 切换成员
  let inView = false;
  new IntersectionObserver(([e]) => (inView = e.isIntersecting), { threshold: 0.4 }).observe(section);
  addEventListener('keydown', (e) => {
    if (!inView || lightbox.isOpen() || e.target.closest('input, textarea')) return;
    if (e.key === 'ArrowLeft') select(current - 1);
    if (e.key === 'ArrowRight') select(current + 1);
  });

  select(0, { instant: true });
  return {
    focus(id) {
      select(MEMBERS.findIndex((m) => m.id === id));
      section.scrollIntoView({ behavior: 'smooth' });
    },
  };
}

/* ---------- 故事 ---------- */

function initStory() {
  const list = $('.timeline');
  list.innerHTML = STORY.map(
    (s) => `
    <li class="tl-item reveal ${s.spoiler ? 'is-spoiler' : ''}">
      <span class="tl-dot"></span>
      <p class="tl-ep">${s.ep}</p>
      <h3 class="tl-title">${s.title}</h3>
      <div class="tl-body">
        <p>${s.text}</p>
        ${s.spoiler ? '<button type="button" class="tl-reveal">⚠ 含剧透，点击显示</button>' : ''}
      </div>
    </li>`,
  ).join('');
  list.addEventListener('click', (e) => {
    const b = e.target.closest('.tl-reveal');
    if (b) b.closest('.tl-item').classList.add('revealed');
  });
  $('#spoiler-all').addEventListener('change', (e) =>
    $$('.tl-item.is-spoiler', list).forEach((li) => li.classList.toggle('revealed', e.target.checked)),
  );
  // 滚动时逐条点亮
  const lit = new IntersectionObserver(
    (entries) => entries.forEach((e) => e.target.classList.toggle('lit', e.isIntersecting)),
    { rootMargin: '-40% 0px -40% 0px' },
  );
  $$('.tl-item', list).forEach((li) => lit.observe(li));
}

/* ---------- 音乐 ---------- */

function initMusic() {
  $('.album-title').textContent = `「${ALBUM.title}」`;
  $('.album-note').textContent = ALBUM.note;
  const wrap = $('.songs');
  wrap.innerHTML = SONGS.map(
    (s, i) => `
    <button type="button" class="song-card reveal" data-title="${s.title}" style="--d:${(i % 3) * 80}ms" ${s.youtube ? '' : 'disabled'}>
      <span class="song-inner">
        <span class="song-front">
          <span class="song-no">${String(i + 1).padStart(2, '0')}</span>
          <span class="song-vinyl" aria-hidden="true"><span></span></span>
          <span class="song-title">${s.title}</span>
          ${s.reading ? `<span class="song-reading">${s.reading}</span>` : ''}
          <span class="song-bpm">${s.bpm} BPM</span>
        </span>
        <span class="song-back">
          <span class="song-title small">${s.title}</span>
          <span class="song-note">${s.note}</span>
          <span class="song-credit">${s.credit}</span>
          <span class="song-play">${s.youtube ? '▶ 点击播放 MV' : '暂无官方视频'}</span>
        </span>
      </span>
    </button>`,
  ).join('');
  wrap.addEventListener('click', (e) => {
    const c = e.target.closest('.song-card');
    if (c) playSong(c.dataset.title);
  });
}

/* ---------- 舞台与街景 ---------- */

function initScenes() {
  const grid = $('.scene-grid');
  grid.innerHTML = SCENES.map(
    (s, i) => `
    <figure class="scene reveal" style="--d:${i * 90}ms" data-i="${i}">
      <div class="scene-img"><img loading="lazy" src="${bookPage(s.page)}" alt="${s.title}" /></div>
      <figcaption><h3>${s.title}</h3><p>${s.text}</p></figcaption>
    </figure>`,
  ).join('');
  const items = SCENES.map((s) => pageItem(s.page, s.title));
  grid.addEventListener('click', (e) => {
    const f = e.target.closest('.scene');
    if (f) lightbox.open(items, Number(f.dataset.i));
  });
}

/* ---------- 设定集画廊 ---------- */

function initGallery() {
  const tabs = $('.gallery-tabs');
  const grid = $('.masonry');
  const all = { key: 'all', label: '全部', pages: GALLERY.flatMap((g) => g.pages) };
  const groups = [all, ...GALLERY];
  tabs.innerHTML = groups
    .map((g, i) => `<button type="button" role="tab" data-key="${g.key}" class="${i ? '' : 'active'}">${g.label}<span>${g.pages.length}</span></button>`)
    .join('');
  let items = [];
  function show(key) {
    const g = groups.find((x) => x.key === key);
    items = g.pages.map((p) => pageItem(p));
    grid.innerHTML = g.pages
      .map((p, i) => `<button type="button" class="tile" data-i="${i}" style="--d:${(i % 8) * 40}ms"><img loading="lazy" src="${bookPage(p)}" alt="设定集 P.${p}" /><span>P.${String(p).padStart(3, '0')}</span></button>`)
      .join('');
    $$('button', tabs).forEach((b) => b.classList.toggle('active', b.dataset.key === key));
  }
  tabs.addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (b) show(b.dataset.key);
  });
  grid.addEventListener('click', (e) => {
    const t = e.target.closest('.tile');
    if (t) lightbox.open(items, Number(t.dataset.i));
  });
  show('all');
}

/* ---------- 蓝光特典 ---------- */

function initBluray() {
  const vols = $('.bd-volumes');
  const tabs = $('.bd-tabs');
  const grid = $('.bd-grid');
  vols.innerHTML = BLURAY.map(
    (v, i) => `
    <article class="bd-vol reveal" style="--d:${i * 100}ms" data-key="${v.key}">
      <button type="button" class="bd-cover" aria-label="查看${v.label}封面"><img loading="lazy" src="${bdPage(v.cover)}" alt="蓝光${v.label}封面" /></button>
      <div class="bd-vol-text">
        <p class="eyebrow">Blu-ray ${v.title}</p>
        <h3>${v.label}</h3>
        <p>${v.note}</p>
        <button type="button" class="btn btn-ghost bd-browse">浏览${v.label}特典</button>
      </div>
    </article>`,
  ).join('');
  tabs.innerHTML = BLURAY.map((v) => `<button type="button" role="tab" data-key="${v.key}">${v.label}<span>${v.pages.length}</span></button>`).join('');

  let items = [];
  function show(key) {
    const v = BLURAY.find((x) => x.key === key);
    items = v.pages.map(([n, cap]) => ({ src: bdPage(n), caption: `蓝光${v.label} · ${cap}` }));
    grid.innerHTML = v.pages
      .map(([n, cap], i) => `<button type="button" class="tile" data-i="${i}" style="--d:${(i % 8) * 40}ms"><img loading="lazy" src="${bdPage(n)}" alt="${cap}" /><span>${cap}</span></button>`)
      .join('');
    $$('button', tabs).forEach((b) => b.classList.toggle('active', b.dataset.key === key));
  }
  tabs.addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (b) show(b.dataset.key);
  });
  grid.addEventListener('click', (e) => {
    const t = e.target.closest('.tile');
    if (t) lightbox.open(items, Number(t.dataset.i));
  });
  vols.addEventListener('click', (e) => {
    const vol = e.target.closest('.bd-vol');
    if (!vol) return;
    const v = BLURAY.find((x) => x.key === vol.dataset.key);
    if (e.target.closest('.bd-cover')) {
      lightbox.open([{ src: bdPage(v.cover), caption: `蓝光${v.label} 封面` }]);
    } else if (e.target.closest('.bd-browse')) {
      show(v.key);
      tabs.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  });
  show(BLURAY[0].key);
}

/* ---------- 相关乐队 ---------- */

function initRelated() {
  const { crychic, mujica } = RELATED;
  $('.related-intro').innerHTML = `
    <article class="band-card crychic reveal">
      <p class="eyebrow">BEFORE</p>
      <h3>${crychic.name}</h3>
      <p>${crychic.text}</p>
    </article>
    <article class="band-card mujica reveal" data-page="${mujica.page}">
      <img loading="lazy" src="${bookPage(mujica.page)}" alt="Ave Mujica 舞台" />
      <div>
        <p class="eyebrow">AFTER</p>
        <h3>${mujica.name}</h3>
        <p>${mujica.text}</p>
      </div>
    </article>`;
  $('.band-card.mujica').addEventListener('click', () => lightbox.open([pageItem(mujica.page, 'Ave Mujica · 第 13 话舞台')]));
  const grid = $('.mujica-grid');
  grid.innerHTML = mujica.members
    .map(
      (m, i) => `
    <figure class="mujica-card reveal" style="--d:${i * 80}ms" data-i="${i}">
      <div class="mujica-img"><img loading="lazy" src="${bookPage(m.page)}" alt="${m.name}" /></div>
      <figcaption>
        <span class="mask">${m.mask}</span>
        <h4>${m.name}</h4>
        <p class="meta">${m.part} · CV ${m.cv}</p>
        <p>${m.note}</p>
      </figcaption>
    </figure>`,
    )
    .join('');
  // 每人两张：设定集页 + 蓝光下巻特典小册子页
  const items = mujica.members.flatMap((m) => [
    pageItem(m.page, `${m.name}（${m.mask}）· 设定集`),
    { src: bdPage(m.bd), caption: `${m.name}（${m.mask}）· 蓝光下巻特典小册子` },
  ]);
  grid.addEventListener('click', (e) => {
    const f = e.target.closest('.mujica-card');
    if (f) lightbox.open(items, Number(f.dataset.i) * 2);
  });
}

/* ---------- 启动 ---------- */

hydratePageImages();
initNav();
initPlayer();
const members = initMembers();
initStory();
initMusic();
initScenes();
initGallery();
initBluray();
initRelated();
observeReveals();
initStage({ onSelect: (id) => members.focus(id) });

$('#start-show').addEventListener('click', () => startShow({ backdrop: true }));
// 播放时让感叹号跟着节拍跳动
const beaters = $$('.bangs');
beatBus.addEventListener('beat', (e) => {
  const k = e.detail.bar ? 1.06 : 1.03;
  beaters.forEach((el) =>
    el.animate([{ transform: `scale(${k})`, filter: 'brightness(1.6)' }, { transform: 'scale(1)', filter: 'brightness(1)' }], { duration: 220, easing: 'ease-out' }),
  );
});
beatBus.addEventListener('playstate', (e) => document.body.classList.toggle('music-on', e.detail.playing));
