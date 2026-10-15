// 生成网页用的压缩素材（需要 ffmpeg，可用环境变量 FFMPEG 指定路径），结果提交进仓库：
//   MYGO五人视频/  入场动画的成员视频（由 MYGO五人gif 转成 H.264 MP4，<名字>.mp4 为 720×1280，<名字>-s.mp4 为竖屏用的 360×640）
//   缩略图/        设定集、蓝光扫描页的 800px 宽 WebP 缩略图（只生成网页用到的页）
//   fonts/         标题用的思源宋体子集（只含网页用到的字）
// 用法：node make-media.mjs [--force]，默认跳过已存在的文件

import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { book, bd, bookFile, bdFile, bookThumbFile, bdThumbFile } from './pages.mjs';

const root = dirname(fileURLToPath(import.meta.url));
const ffmpeg = process.env.FFMPEG || 'ffmpeg';
const force = process.argv.includes('--force');
let made = 0;

const run = (src, dst, args) => {
  if (!force && existsSync(join(root, dst))) return;
  mkdirSync(dirname(join(root, dst)), { recursive: true });
  execFileSync(ffmpeg, ['-v', 'error', '-y', '-i', join(root, src), ...args, join(root, dst)], { stdio: 'inherit' });
  made++;
};

// 入场视频：动图背景是纯色，不需要透明通道；按 BT.709 编码并用 setparams 把色彩标记写进码流（只写 -color_primaries 等输出参数不生效），
// 标记不全时浏览器不同渲染路径的颜色转换不一致，视频底色会和 #intro 背景对不上
for (const gif of readdirSync(join(root, 'MYGO五人gif')).filter((f) => f.endsWith('.gif'))) {
  const name = gif.slice(0, -4);
  for (const [width, suffix] of [[720, ''], [360, '-s']]) {
    run(`MYGO五人gif/${gif}`, `MYGO五人视频/${name}${suffix}.mp4`, [
      '-vf', `scale=${width}:-2:flags=lanczos:out_color_matrix=bt709:out_range=tv,format=yuv420p,setparams=colorspace=bt709:color_primaries=bt709:color_trc=bt709:range=tv`,
      '-c:v', 'libx264', '-preset', 'veryslow', '-crf', '22', '-tune', 'animation', '-fps_mode', 'vfr',
      '-movflags', '+faststart', '-an',
    ]);
  }
}

// 缩略图：比 800px 窄的图不放大
const thumb = ['-vf', "scale='min(800,iw)':-2:flags=lanczos", '-c:v', 'libwebp', '-quality', '80', '-compression_level', '6'];
for (const n of book) run(bookFile(n), bookThumbFile(n), thumb);
for (const n of bd) run(bdFile(n), bdThumbFile(n), thumb);

// 标题字体：思源宋体 SC 只取网页源码里出现过的字，随站点发布（大陆访客连不上 Google Fonts 也能显示同一款字体）。
// 需要能访问 Google Fonts，走代理时运行：NODE_USE_ENV_PROXY=1 HTTPS_PROXY=http://127.0.0.1:7892 node make-media.mjs
// 网页文字有改动、出现新字时，会按 fonts/chars.txt 的记录自动重新生成
const text = ['index.html', 'style.css', ...readdirSync(join(root, 'js')).filter((f) => f.endsWith('.js')).map((f) => `js/${f}`)]
  .map((f) => readFileSync(join(root, f), 'utf8'))
  .join('');
const chars = [...new Set(text)].filter((c) => c >= ' ' && c !== '\uFEFF').sort();
const charsFile = join(root, 'fonts', 'chars.txt');
if (force || !existsSync(charsFile) || readFileSync(charsFile, 'utf8') !== chars.join('')) {
  // Google Fonts 的 text= 参数字数一多就改回返回整套切片，所以每 250 个字一组分别取，再用 unicode-range 拼成一款字体
  const headers = { 'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36' };
  const hex = (c) => 'U+' + c.codePointAt(0).toString(16);
  rmSync(join(root, 'fonts'), { recursive: true, force: true });
  mkdirSync(join(root, 'fonts'));
  let css = '/* 由 make-media.mjs 生成，不要手改。标题字体：思源宋体 SC（Noto Serif SC）子集，只含网页用到的字 */\n';
  for (const weight of [500, 700, 900]) {
    for (let i = 0; i * 250 < chars.length; i++) {
      const group = chars.slice(i * 250, (i + 1) * 250);
      const res = await (await fetch(`https://fonts.googleapis.com/css2?family=Noto+Serif+SC:wght@${weight}&text=${encodeURIComponent(group.join(''))}`, { headers })).text();
      const urls = [...res.matchAll(/url\((.+?)\)/g)].map((m) => m[1]);
      if (urls.length !== 1) throw new Error(`Google Fonts 返回了 ${urls.length} 个字体文件（应为 1 个）`);
      const file = `NotoSerifSC-${weight}-${i}.woff2`;
      writeFileSync(join(root, 'fonts', file), Buffer.from(await (await fetch(urls[0])).arrayBuffer()));
      css += `@font-face { font-family: 'MyGO Serif'; font-weight: ${weight}; font-display: swap; src: url('${file}') format('woff2'); unicode-range: ${group.map(hex).join(', ')}; }\n`;
      made++;
    }
  }
  writeFileSync(join(root, 'fonts', 'fonts.css'), css);
  writeFileSync(charsFile, chars.join(''));
}

console.log(`生成 ${made} 个文件`);
