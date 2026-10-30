# 麦浪点唱 · KTV 转盘点歌

一个为手机设计的 KTV 选歌转盘。选一个曲风，转动转盘，让今晚的第一首歌交给运气。

<img src="./preview.jpg" width="340" alt="麦浪点唱手机界面">

纯前端、零依赖、无需构建，打开网页就能用。

## 功能

- **11 个曲风 + 全部 / 我的**：流行、粤语、对唱、摇滚、老歌、热歌、欧美、电子、说唱、亚洲、二次元
- **655 首内置曲目**：72 首原始曲库 + 从 `playlist.txt` 导入并去重后的 583 首
- **每轮随机抽 20 首上盘**，“换一批”可重新抽
- **顺滑转盘动画**：带音效、震动反馈和结果揭晓动效
- **结果操作**：加入今晚歌单、再转一次、复制歌名
- **自选歌曲**：曲库里没有的歌可以自己加，会进入「我的」曲风
- **今晚歌单**：保存在手机本地，可复制整份歌单，去点歌台照着点
- **离线 PWA**：在 HTTPS 环境可添加到主屏幕，断网也能打开
- 数据只保存在本机 `localStorage`，不上传服务器

## 在电脑上打开

直接双击 `index.html` 即可使用。

如果想让手机也能打开，推荐用本地服务器：

1. 双击 `start-server.bat`
2. 电脑会自动打开 `http://localhost:5173`
3. 手机和电脑连同一个 Wi-Fi
4. 在手机浏览器输入终端显示的「手机访问」地址，例如 `http://192.168.1.8:5173`

如果手机打不开，请确认 Windows 防火墙允许 Python 访问专用网络，或放行 5173 端口。

没有 Python 的话，也可以在本目录运行：

```bash
npx serve -l 5173
```

或者安装 Python 3 后运行：

```bash
python serve.py
```

## 手机上体验更好

- 把页面添加到主屏幕（iOS：分享 → 添加到主屏幕；Android：菜单 → 安装应用 / 添加到主屏幕）
- **注意**：Service Worker 和正式 PWA 安装需要 HTTPS（或本机 localhost）。局域网 HTTP 地址下页面照常可用，但没有离线缓存。
- 想真正随时打开，可以把整个文件夹部署到 GitHub Pages、Netlify、Vercel 等支持 HTTPS 的静态托管服务，不需要后端。

## 换一套自己的曲库

打开 `data.js`，修改 `songs` 数组即可：

```js
{ title: '晴天', artist: '周杰伦', cat: 'pop' }
```

如果歌名太长，可以加一个用于转盘显示的短标题：

```js
{ title: '这世界那么多人', artist: '莫文蔚', cat: 'pop', short: '这世界' }
```

`cat` 可选值：

| 值 | 曲风 |
| --- | --- |
| `pop` | 华语流行 |
| `canto` | 粤语经典 |
| `duet` | 情歌对唱 |
| `rock` | 摇滚热血 |
| `oldies` | 年代金曲 |
| `hits` | 网络热歌 |
| `western` | 欧美流行 |
| `edm` | 电子节奏 |
| `hiphop` | 说唱节拍 |
| `asia` | 亚洲音乐 |
| `acg` | 动漫二次元 |

`playlist.txt` 已按歌名去重，并与原有 72 首曲库做了比对；重复的《因为爱情》《富士山下》《素颜》《起风了》《梁山伯与茱丽叶》没有重复写入。

也可以直接在页面的「点歌台 → 自选歌曲」里添加，不需要改代码。自选歌曲只保存在当前浏览器里。

## 换转盘音效

转盘转动音效是独立文件：`audio/spin-wheel.mp3`。

- 直接覆盖同名文件即可，建议保留约 5 秒、128kbps 的 MP3
- 如果换文件名，需要同步修改 `app.js` 里的 `SPIN_AUDIO_SRC`，以及 `sw.js` 的缓存文件列表
- `app.js` 的 `SPIN_AUDIO_VOLUME` 最大就是 `1.0`；如果仍觉得小，需要把 MP3 文件本身做响，当前音效已做过约 +5dB 的软限幅增益
- 替换音效后，如果手机还播旧声音：把 `app.js` 里的 `?v=2` 改成 `?v=3`，并同步修改 `sw.js` 的 `CACHE_NAME`
- 转盘停止时会自动淡出，随后播放中奖提示音

## 文件说明

| 文件 | 说明 |
| --- | --- |
| `index.html` | 页面结构 |
| `styles.css` | 全部样式与动画 |
| `app.js` | 转盘、动效、歌单、音效与本地存储 |
| `data.js` | 曲库与曲风配置 |
| `audio/spin-wheel.mp3` | 转盘转动的机械滴答音效 |
| `playlist.txt` | 导入歌曲原始清单 |
| `manifest.webmanifest` | PWA 应用信息 |
| `sw.js` | 离线缓存 |
| `icons/icon.svg` | 矢量应用图标 |
| `icons/icon-192.png` / `icons/icon-512.png` | 安装用图标 |
| `icons/icon-maskable-*.png` | Android 自适应图标 |
| `icons/apple-touch-icon.png` | iOS 主屏幕图标 |
| `preview.jpg` / `preview-result.jpg` | 界面预览 |
| `serve.py` / `start-server.bat` | 本地预览服务器 |
