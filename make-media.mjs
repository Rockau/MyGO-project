// 生成网页用的压缩素材（需要 ffmpeg，可用环境变量 FFMPEG 指定路径），结果提交进仓库：
//   MYGO五人视频/  入场动画的成员视频（由 MYGO五人gif 转成 H.264 MP4，<名字>.mp4 为 720×1280，<名字>-s.mp4 为竖屏用的 360×640）
//   缩略图/        设定集、蓝光扫描页的 800px 宽 WebP 缩略图（只生成网页用到的页）
// 用法：node make-media.mjs [--force]，默认跳过已存在的文件

import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync } from 'node:fs';
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

console.log(`生成 ${made} 个文件`);
