// 背景音乐播放器：嵌入官方 YouTube 视频，按 BPM 模拟节拍。
// 跨域 iframe 读不到音频，所以律动来自「播放时间 × BPM」，不是真实波形。

import { SONGS } from './data.js';

export const beatBus = new EventTarget();

const playable = SONGS.filter((s) => s.youtube);
const DEFAULT_SONG = '迷星叫'; // 点「开始 Live」时播放的第一首
const state = {
  player: null,
  ready: false,
  failed: false,
  index: Math.max(0, playable.findIndex((s) => s.title === DEFAULT_SONG)),
  playing: false,
  // 用于在两次 getCurrentTime 轮询之间插值
  mediaTime: 0,
  sampledAt: 0,
  lastBeat: -1,
};

export function isPlaying() {
  return state.playing;
}

export function currentBpm() {
  return playable[state.index]?.bpm || 0;
}

// 从歌曲开头算起的连续拍数（可带小数），舞台灯光据此同步扫动；未播放时返回 null
export function beatPosition() {
  if (!state.playing || !currentBpm()) return null;
  const t = state.mediaTime + (performance.now() - state.sampledAt) / 1000;
  return (t * currentBpm()) / 60;
}

// 音量与「铺满舞台」模糊度：保存在浏览器里，下次打开沿用
const SETTINGS_KEY = 'mygo-player-settings-v2'; // v2：模糊度默认改为 0%，旧存档不再沿用
const MAX_BLUR_PX = 50; // 模糊度 100% 对应的像素值
const settings = { volume: 60, blur: 0, ...readSettings() };

function readSettings() {
  try {
    return JSON.parse(localStorage.getItem(SETTINGS_KEY)) || {};
  } catch {
    return {};
  }
}

function initSettings(root) {
  const vol = root.querySelector('#ps-volume');
  const blur = root.querySelector('#ps-blur');
  const host = document.getElementById('yt-host');
  const apply = () => {
    vol.nextElementSibling.textContent = settings.volume;
    blur.nextElementSibling.textContent = `${settings.blur}%`;
    // 用 CSS 变量画出滑块左侧的已填充部分
    vol.style.setProperty('--fill', `${settings.volume}%`);
    blur.style.setProperty('--fill', `${settings.blur}%`);
    host.style.setProperty('--video-blur', `${(settings.blur / 100) * MAX_BLUR_PX}px`);
    if (state.ready) state.player.setVolume(settings.volume);
  };
  // 只保存访客亲手调整过的值，避免把默认值写进存档
  const save = () => {
    try {
      localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
    } catch {}
  };
  vol.value = settings.volume;
  blur.value = settings.blur;
  vol.addEventListener('input', () => {
    settings.volume = Number(vol.value);
    apply();
    save();
  });
  blur.addEventListener('input', () => {
    settings.blur = Number(blur.value);
    apply();
    save();
  });
  apply();

  // 播放器高度随设置行变化，小窗和模式按钮按它定位
  new ResizeObserver(() => document.documentElement.style.setProperty('--player-h', `${root.offsetHeight}px`)).observe(root);
}

// 演出画面三种模式，按钮依次切换；文字是「下一次点击会做什么」
const VIDEO_MODES = ['hidden', 'mini', 'backdrop'];
const VIDEO_LABEL = { hidden: '展开画面', mini: '铺满舞台', backdrop: '折叠画面' };
let videoMode = 'hidden';
let modeTimer = 0;

function setVideoMode(mode) {
  videoMode = mode;
  const host = document.getElementById('yt-host');
  const btn = document.getElementById('video-mode');
  btn.dataset.mode = mode;
  btn.querySelector('.vm-text').textContent = VIDEO_LABEL[mode];
  btn.setAttribute('aria-label', `演出画面：${VIDEO_LABEL[mode]}`);
  // 先淡出再换位置，避免画面从右下角「跳」到首屏
  clearTimeout(modeTimer);
  host.classList.add('switching');
  modeTimer = setTimeout(() => {
    host.dataset.mode = mode;
    document.body.dataset.video = mode;
    if (mode === 'backdrop' && scrollY > innerHeight * 0.5) {
      document.getElementById('top').scrollIntoView({ behavior: 'smooth' });
    }
    requestAnimationFrame(() => host.classList.remove('switching'));
  }, 220);
}

export function initPlayer() {
  const root = document.getElementById('player');
  if (!playable.length) {
    root.hidden = true;
    return;
  }

  const ui = {
    root,
    disc: root.querySelector('.disc'),
    title: root.querySelector('.player-title'),
    status: root.querySelector('.player-status'),
    play: root.querySelector('[data-act="play"]'),
    prev: root.querySelector('[data-act="prev"]'),
    next: root.querySelector('[data-act="next"]'),
    list: root.querySelector('.player-list'),
    toggleList: root.querySelector('[data-act="list"]'),
  };

  ui.list.innerHTML = playable
    .map((s, i) => `<li><button type="button" data-i="${i}">${s.title}</button></li>`)
    .join('');
  ui.list.addEventListener('click', (e) => {
    const b = e.target.closest('button[data-i]');
    if (b) playIndex(Number(b.dataset.i));
  });
  ui.play.addEventListener('click', togglePlay);
  ui.prev.addEventListener('click', () => playIndex((state.index - 1 + playable.length) % playable.length));
  ui.next.addEventListener('click', () => playIndex((state.index + 1) % playable.length));
  ui.toggleList.addEventListener('click', () => root.classList.toggle('show-list'));
  document.getElementById('video-mode').addEventListener('click', () =>
    setVideoMode(VIDEO_MODES[(VIDEO_MODES.indexOf(videoMode) + 1) % VIDEO_MODES.length]),
  );
  document.body.dataset.video = videoMode;

  state.ui = ui;
  initSettings(root);
  renderMeta();
  loadApi();
  requestAnimationFrame(tick);
}

// 按歌名播放（音乐区卡片调用）；没有官方视频的歌返回 false
export function playSong(title) {
  const i = playable.findIndex((s) => s.title === title);
  if (i < 0) return false;
  playIndex(i);
  return true;
}

// backdrop：首屏「开始 Live」按钮传入，直接把画面铺满舞台
export function startShow({ backdrop = false } = {}) {
  if (state.failed) {
    flashStatus();
    return;
  }
  if (backdrop && videoMode !== 'backdrop') setVideoMode('backdrop');
  playIndex(state.index);
}

function loadApi() {
  const timeout = setTimeout(fail, 10000);
  window.onYouTubeIframeAPIReady = () => {
    clearTimeout(timeout);
    state.player = new YT.Player('yt-frame', {
      width: '320',
      height: '180',
      videoId: playable[state.index].youtube,
      playerVars: { playsinline: 1, rel: 0, modestbranding: 1 },
      events: {
        onReady: () => {
          state.ready = true;
          state.player.setVolume(settings.volume);
          setStatus('点击播放');
          if (state.pending != null) playIndex(state.pending);
        },
        onStateChange: onStateChange,
        onError: () => {
          setStatus('该视频暂时无法播放，自动切到下一首');
          setTimeout(() => playIndex((state.index + 1) % playable.length), 1500);
        },
      },
    });
  };
  const s = document.createElement('script');
  s.src = 'https://www.youtube.com/iframe_api';
  s.onerror = () => {
    clearTimeout(timeout);
    fail();
  };
  document.head.appendChild(s);
  setStatus('正在连接 YouTube…');
}

function fail() {
  if (state.ready) return;
  state.failed = true;
  state.ui.root.classList.add('failed');
  setStatus('无法连接 YouTube（中国大陆需要代理），页面其他内容不受影响');
}

function playIndex(i) {
  state.index = i;
  renderMeta();
  if (state.failed) {
    flashStatus();
    return;
  }
  if (!state.ready) {
    state.pending = i;
    setStatus('播放器加载中…');
    return;
  }
  state.pending = null;
  state.lastBeat = -1;
  document.body.classList.add('video-ready');
  state.player.loadVideoById(playable[i].youtube);
  setStatus(LOADING_TEXT);
}

function togglePlay() {
  if (!state.ready) {
    startShow();
    return;
  }
  if (state.playing) state.player.pauseVideo();
  else if (state.player.getPlayerState?.() === YT.PlayerState.CUED || state.player.getCurrentTime() === 0) {
    playIndex(state.index);
  } else state.player.playVideo();
}

const LOADING_TEXT = '加载中…（YouTube 可能会先播放广告）';

function onStateChange(e) {
  const playing = e.data === YT.PlayerState.PLAYING;
  state.playing = playing;
  state.ui.root.classList.toggle('playing', playing);
  state.ui.play.setAttribute('aria-label', playing ? '暂停' : '播放');
  if (playing) {
    sample();
    setStatus(`♪ ${currentBpm() ? `${currentBpm()} BPM` : ''}`);
  } else if (e.data === YT.PlayerState.PAUSED) setStatus('已暂停');
  else if (e.data === YT.PlayerState.ENDED) playIndex((state.index + 1) % playable.length);
  // 广告播放时接口不会报告 PLAYING，只会停在「未开始 / 缓冲」，给访客一个提示
  else if (e.data === YT.PlayerState.BUFFERING || e.data === YT.PlayerState.UNSTARTED) setStatus(LOADING_TEXT);
  beatBus.dispatchEvent(new CustomEvent('playstate', { detail: { playing } }));
}

function sample() {
  if (!state.player?.getCurrentTime) return;
  state.mediaTime = state.player.getCurrentTime();
  state.sampledAt = performance.now();
}

let lastSample = 0;
function tick(now) {
  requestAnimationFrame(tick);
  if (!state.playing) return;
  if (now - lastSample > 250) {
    sample();
    lastSample = now;
  }
  const bpm = currentBpm();
  if (!bpm) return;
  const t = state.mediaTime + (now - state.sampledAt) / 1000;
  const beat = Math.floor((t * bpm) / 60);
  if (beat !== state.lastBeat) {
    state.lastBeat = beat;
    beatBus.dispatchEvent(new CustomEvent('beat', { detail: { beat, bar: beat % 4 === 0 } }));
  }
}

function renderMeta() {
  const song = playable[state.index];
  state.ui.title.textContent = song.title;
  state.ui.list.querySelectorAll('button').forEach((b, i) => b.classList.toggle('active', i === state.index));
  document.querySelectorAll('.song-card').forEach((c) => c.classList.toggle('now', c.dataset.title === song.title));
}

function setStatus(text) {
  state.ui.status.textContent = text;
}

function flashStatus() {
  state.ui.root.classList.remove('flash');
  void state.ui.root.offsetWidth;
  state.ui.root.classList.add('flash');
}
