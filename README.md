# MyGO!!!!! 介绍页（工程源码）

《BanG Dream! It's MyGO!!!!!》的粉丝介绍网页，深色 Live 风格，使用 HTML + CSS + 原生 JS + Three.js，不需要构建工具。

在线浏览：https://rockau.github.io/MyGO/

## 功能

- **首屏 3D 舞台**：五人演出服立绘配代表色聚光灯。播放音乐后切换成 Live 摇头灯，按 BPM 扫动。
- **成员介绍**：每人一块专属的 Three.js 背景板和一个自定义鼠标（星星、爱心、拨片、红茶杯、鼓棒），四种服装切换，资料卡、设定集原稿、小知识翻转卡片。
- **背景音乐**：嵌入官方 YouTube MV。演出画面可以折叠、展开小窗、或模糊后铺满舞台；可调节音量和模糊度。
- **其他内容**：故事时间轴（剧透折叠）、歌曲卡片、舞台与街景、设定集画廊、蓝光特典、CRYCHIC 与 Ave Mujica。

## 本地运行

需要 Node.js。双击 `启动.bat`，或者在项目目录里执行：

```
node serve.mjs
```

然后打开 http://localhost:8000 。页面用到了 ES module，直接双击 `index.html` 无法运行。

## 目录结构

| 路径 | 内容 |
|---|---|
| `index.html` / `style.css` | 页面骨架与样式 |
| `js/data.js` | 成员资料、歌曲、故事、页码映射等所有文字数据 |
| `js/main.js` | 页面渲染、成员切换、灯箱、画廊 |
| `js/stage.js` | 首屏 Three.js 舞台 |
| `js/memberBg.js` | 成员专属背景板 |
| `js/cursor.js` | 成员区的自定义鼠标 |
| `js/player.js` | YouTube 播放器、节拍时钟、音量与模糊度设置 |
| `build-site.mjs` | 生成只含所需图片的发布目录：`node build-site.mjs [输出目录]` |

设定集和蓝光扫描只收录了网页用到的页。

## 版权

本项目为粉丝制作的非商业作品。角色立绘、设定集与蓝光扫描图片、音乐与视频的版权均归 ©BanG Dream! Project / ©Bushiroad 所有。
