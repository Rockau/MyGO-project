// 生成用于发布的静态站点：只复制网页实际引用到的图片（设定集、蓝光扫描只取用到的页）。
// 用法：node build-site.mjs [输出目录]，默认输出到项目旁边的 MyGO-site 文件夹。

import { cpSync, mkdirSync, rmSync, writeFileSync, existsSync, readdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = dirname(fileURLToPath(import.meta.url));
const out = resolve(process.argv[2] ?? join(root, '..', 'MyGO-site'));
const { MEMBERS, OUTFITS, AVATAR_DIR } = await import(pathToFileURL(join(root, 'js', 'data.js')).href);
const { book, bd, bookFile, bdFile, bookThumbFile, bdThumbFile } = await import(pathToFileURL(join(root, 'pages.mjs')).href);

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
for (const m of MEMBERS) copy(`${AVATAR_DIR}/${m.file}/${m.avatar}`);
copy('熊猫/熊猫.png'); // 立希背景点击弹出的熊猫（memberBg.js）
copy('MYGO五人视频'); // 入场动画随机两位成员的视频（index.html，由 make-media.mjs 生成）
for (const m of MEMBERS) copy(`MYGO角色签名/${m.file}.png`); // 成员签名（main.js）
// copy('网页入场动画素材/MYGO的logo蓝色的.jpeg');  // 后续动画启用
// copy('网页入场动画素材/收尾动作.jpg');             // 后续动画启用
for (const n of book) copy(bookFile(n)), copy(bookThumbFile(n));
for (const n of bd) copy(bdFile(n)), copy(bdThumbFile(n)); // 缩略图缺失时先运行 node make-media.mjs

// GitHub Pages 默认会用 Jekyll 处理文件，关掉它，原样发布
writeFileSync(join(out, '.nojekyll'), '');
writeFileSync(
  join(out, 'README.md'),
  `# MyGO!!!!! 介绍页\n\n《BanG Dream! It's MyGO!!!!!》粉丝制作的非商业介绍页。\n\n` +
    `角色立绘、设定集与蓝光扫描图片、音乐与视频版权均归 ©BanG Dream! Project / ©Bushiroad 所有。\n`,
);

console.log(`输出目录：${out}`);
console.log(`设定集 ${book.size} 页，蓝光扫描 ${bd.size} 张，立绘 ${MEMBERS.length * OUTFITS.length} 张`);
