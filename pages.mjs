// 网页实际用到的设定集页码和蓝光扫描页（build-site.mjs 复制原图、make-media.mjs 生成缩略图共用）

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = dirname(fileURLToPath(import.meta.url));
const { MEMBERS, SCENES, RELATED, GALLERY, BLURAY, BOOK_DIR, BD_DIR } = await import(pathToFileURL(join(root, 'js', 'data.js')).href);

export { BOOK_DIR, BD_DIR };

// 设定集页码：成员原稿、画廊、舞台、相关乐队，以及 index.html 里写死的 data-page
const html = readFileSync(join(root, 'index.html'), 'utf8');
export const book = new Set([
  1, // 首屏背景（main.js 里设置）
  ...[...html.matchAll(/data-page="(\d+)"/g)].map((m) => Number(m[1])),
  ...MEMBERS.flatMap((m) => m.pages),
  ...GALLERY.flatMap((g) => g.pages),
  ...SCENES.map((s) => s.page),
  RELATED.mujica.page,
  ...RELATED.mujica.members.map((m) => m.page),
]);
// 蓝光扫描页：特典区、成员原稿条、Ave Mujica 人物卡
export const bd = new Set([
  ...BLURAY.flatMap((v) => [v.cover, ...v.pages.map(([n]) => n)]),
  ...MEMBERS.map((m) => m.bd),
  ...RELATED.mujica.members.map((m) => m.bd),
]);

export const bookFile = (n) => `${BOOK_DIR}/${String(n).padStart(3, '0')}.jpg`;
export const bdFile = (n) => `${BD_DIR}/${String(n).padStart(2, '0')}.jpg`;
export const bookThumbFile = (n) => `缩略图/设定集/${String(n).padStart(3, '0')}.webp`;
export const bdThumbFile = (n) => `缩略图/蓝光/${String(n).padStart(2, '0')}.webp`;
