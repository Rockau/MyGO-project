// 生成用于发布的静态站点：只复制网页实际引用到的图片（设定集、蓝光扫描只取用到的页）。
// 用法：node build-site.mjs [输出目录]，默认输出到项目旁边的 MyGO-site 文件夹。

import { cpSync, mkdirSync, readFileSync, rmSync, writeFileSync, existsSync, readdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = dirname(fileURLToPath(import.meta.url));
const out = resolve(process.argv[2] ?? join(root, '..', 'MyGO-site'));
const data = await import(pathToFileURL(join(root, 'js', 'data.js')).href);
const { MEMBERS, OUTFITS, SCENES, RELATED, GALLERY, BLURAY } = data;

// 设定集页码：成员原稿、画廊、舞台、相关乐队，以及 index.html 里写死的 data-page
const html = readFileSync(join(root, 'index.html'), 'utf8');
const book = new Set([
  1, // 首屏背景（main.js 里设置）
  ...[...html.matchAll(/data-page="(\d+)"/g)].map((m) => Number(m[1])),
  ...MEMBERS.flatMap((m) => m.pages),
  ...GALLERY.flatMap((g) => g.pages),
  ...SCENES.map((s) => s.page),
  RELATED.mujica.page,
  ...RELATED.mujica.members.map((m) => m.page),
]);
// 蓝光扫描页：特典区、成员原稿条、Ave Mujica 人物卡
const bd = new Set([
  ...BLURAY.flatMap((v) => [v.cover, ...v.pages.map(([n]) => n)]),
  ...MEMBERS.map((m) => m.bd),
  ...RELATED.mujica.members.map((m) => m.bd),
]);

const BOOK_DIR = "「BanG Dream! It's MyGO!!!!!」设定集";
const BD_DIR = "BanG Dream! It's MyGO!!!!! 蓝光盘附赠扫描本/BanG Dream! It's MyGO!!!!! BD Scans + Booklet";

// 清空输出目录，但保留其中的 .git（用于反复发布）
mkdirSync(out, { recursive: true });
for (const name of readdirSync(out)) if (name !== '.git') rmSync(join(out, name), { recursive: true, force: true });

const copy = (rel) => {
  const src = join(root, rel);
  if (!existsSync(src)) throw new Error(`缺少文件：${rel}`);
  mkdirSync(dirname(join(out, rel)), { recursive: true });
  cpSync(src, join(out, rel), { recursive: true });
};

['index.html', 'style.css', 'js'].forEach(copy);
for (const m of MEMBERS) for (const o of OUTFITS) copy(o.path(m.file));
for (const n of book) copy(`${BOOK_DIR}/${String(n).padStart(3, '0')}.jpg`);
for (const n of bd) copy(`${BD_DIR}/${String(n).padStart(2, '0')}.jpg`);

// GitHub Pages 默认会用 Jekyll 处理文件，关掉它，原样发布
writeFileSync(join(out, '.nojekyll'), '');
writeFileSync(
  join(out, 'README.md'),
  `# MyGO!!!!! 介绍页\n\n《BanG Dream! It's MyGO!!!!!》粉丝制作的非商业介绍页。\n\n` +
    `角色立绘、设定集与蓝光扫描图片、音乐与视频版权均归 ©BanG Dream! Project / ©Bushiroad 所有。\n`,
);

console.log(`输出目录：${out}`);
console.log(`设定集 ${book.size} 页，蓝光扫描 ${bd.size} 张，立绘 ${MEMBERS.length * OUTFITS.length} 张`);
