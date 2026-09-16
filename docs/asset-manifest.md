# 图片素材清单（Asset Manifest）

供手动替换 / 自制效果使用。所有路径相对于 `public/`，在页面里以 `/...` 引用。

- `assets/support-qr.png`：用户提供的支持 / 收款二维码，在顶部栏“支持作者”弹窗中显示。保留原始正方形画面，不裁切、不重压缩。
- `assets/favicon.ico`、`assets/favicon-180.png`：用户提供的黑色无线连接图标，分别用于浏览器标签页和 Apple 触屏图标。

## 一、屏幕图层（运行时显示，可直接替换）

| 文件 | 尺寸 | 用途 | 代码挂载点 |
| --- | --- | --- | --- |
| `wallpapers/star-white-default.jpg` | 1922 × 1082 | Star White 配色默认浅色沙漠壁纸（内外屏共用） | `App.jsx → FINISH_WALLPAPERS["star-white"]` |
| `wallpapers/night-sky-default.jpg` | 1922 × 1082 | Night Sky 配色默认深色沙漠壁纸（内外屏共用） | `App.jsx → FINISH_WALLPAPERS["night-sky"]` |
| `wallpapers/apple-desert.avif` | 2048 × 1024 | 默认内屏壁纸（Apple Desert，横幅） | `App.jsx → REFERENCE_WALLPAPERS[0].screen` |
| `wallpapers/apple-desert-cover.avif` | 1024 × 2048 | 默认外屏壁纸（Apple Desert，竖幅） | `App.jsx → REFERENCE_WALLPAPERS[0].cover` |
| `screen-content/inner-layout.json` | 1600 × 1120 | 内屏独立内容布局，与外屏共享同一组 20 个图标 | `App.jsx → DEFAULT_SCREEN_CONTENT.screenOverlay` |
| `screen-content/cover-layout.json` | 800 × 1120 | 外屏独立内容布局：组件、20 个命名 App、Dock、分页点、搜索、状态控件 | `App.jsx → DEFAULT_SCREEN_CONTENT.coverOverlay` |
| `screen-content/ui/status-bar.svg` | 44 × 70 | 摄像头下方的 9:41 与无线状态控件（用户提供） | `cover-layout.json → status` |
| `wallpapers/api-cover.svg` | 800 × 1120 | 旧版外屏整张图标层，仅保留作历史参考 | 当前不挂载 |
| `wallpapers/api-apps.svg` | 1600 × 1120 | 旧版内屏整张图标层，仅保留作历史参考 | 当前不挂载 |
| `wallpapers/monochrome-angels.png` | 2048 × 1152 | 黑白雕塑天使预设壁纸（内外屏共用） | `App.jsx → REFERENCE_WALLPAPERS[2]` |
| `wallpapers/grain-coast.png` | 2048 × 1152 | 颗粒版画海岸预设壁纸（内外屏共用） | `App.jsx → REFERENCE_WALLPAPERS[3]` |
| `wallpapers/video-1789033274452.mp4` | 1440 × 2560, H.264, 5.17 秒 | 古琴动态壁纸预设（内外屏静音循环） | `App.jsx → REFERENCE_WALLPAPERS[4].video` |
| `wallpapers/video-1789033274452-poster.jpg` | 720 × 1280 | 古琴动态壁纸预设封面，截取自视频 1.2 秒 | `App.jsx → REFERENCE_WALLPAPERS[4].screen / cover` |
| `wallpapers/star-white-depth.png` | 512 × 288 | Star White 预生成景深图 | `App.jsx → STAR_WHITE_WALLPAPER.depth` |
| `wallpapers/night-sky-depth.png` | 512 × 288 | Night Sky 预生成景深图 | `App.jsx → NIGHT_SKY_WALLPAPER.depth` |
| `wallpapers/monochrome-angels-depth.png` | 512 × 288 | 黑白雕塑天使预生成景深图 | `App.jsx → REFERENCE_WALLPAPERS[2].depth` |
| `wallpapers/grain-coast-depth.png` | 512 × 288 | 颗粒版画海岸预生成景深图 | `App.jsx → REFERENCE_WALLPAPERS[3].depth` |
| `wallpapers/guqin-video-depth.png` | 288 × 512 | 古琴视频海报帧预生成景深图 | `App.jsx → GUQIN_VIDEO_WALLPAPER.depth` |

> 配色默认壁纸、黑白雕塑天使和颗粒版画海岸为内外屏共用的单文件预设；Apple Desert 的内屏与外屏使用两个独立文件。
> 「显示屏幕图标」开关联动隐藏内外屏动态内容层，壁纸不动。两个布局在运行时最高以 3× 分辨率合成。

## 二、保留在包内、当前不显示（上游源素材）

| 文件 | 尺寸 | 说明 |
| --- | --- | --- |
| `wallpapers/home-apps.svg` | 1600 × 1120 | home 版内屏图标层（上游 demo 原版） |
| `wallpapers/home-cover.svg` | 800 × 1120 | home 版外屏图标层 |
| `wallpapers/home-photo.svg` | 1600 × 1120 | Mastra Factory 卡片（reveal 层），按约定禁用，仅留档 |

## 三、App 图标源素材

- `app-icons/`：22 张 `512 × 512` API 源图（safari、messages、photos、camera、spotify、twitter 等）。
- `screen-content/icons/`：外屏实际使用的 20 个独立命名 SVG；高分辨率 Apple 图标以原图嵌入 SVG，参考图中缺少公开矢量源的 5 个图标从用户提供的效果图逐个提取。
- `screen-content/widgets/`：天气、地图与 On This Day 照片卡片。
- `screen-content/widgets/on-this-day.jpg`：用户提供的 `Frame 1.jpg`，608 × 1056 px，含照片、文字与播放按钮。横屏卡片保持 469.24 × 815、圆角 44；竖屏与桌面姿态沿用既有布局和圆角 40/36。旧 `on-this-day.png` 仅留档。
- 来源与原始 URL 记录在 `app-icons/sources.json`（iTunes Search API 抓取）。
- 内外屏分别读取 `inner-layout.json` 和 `cover-layout.json`，运行时由 `cover-content.ts` 合成透明 GPU 贴图；两者引用同一组 SVG 图标。修改单个图标无需重做整张屏幕图。
- `scripts/create-cover-assets.mjs` 可从源图重新生成 20 个独立 SVG 容器。

## 四、3D 模型贴图（不建议手动改）

- `assets/iphone-duo/`：`iphone-duo.gltf` + 33 张 `.avif` 贴图（随机文件名），是 Apple 官方模型的机身材质（框架、玻璃、镜头、铰链、传感器）。
- 设计约束（AGENTS.md 已固化）：只允许重着色**外观框架/机身五金**；屏幕、玻璃、镜头、传感器、黑色铰链细节不可改。
- 想换机身配色请走页面里的 Night Sky / Star White 开关（`PhoneDevice` 的 `finish` prop），不要改贴图。

## 五、自制效果替换规范

| 层 | 建议规格 |
| --- | --- |
| 内屏壁纸 | 任意尺寸，按屏幕比例 **15.78 : 11.04 ≈ 1.43 : 1（横）** 居中裁切显示 |
| 外屏壁纸 | 按比例 **7.73 : 11.18 ≈ 0.69 : 1（竖）** 居中裁切 |
| 内屏图标层 | 透明 PNG / SVG，画布 **1600 × 1120** |
| 外屏图标层 | 透明 PNG / SVG，画布 **800 × 1120** |
| 上传图片 | JPG / PNG / WebP / AVIF ≤ 20MB，上传后可点击“开始生成”创建深度图（视差 + 景深） |
| 上传视频 | MP4(H.264) / WebM ≤ 100MB，静音循环播放；图标层仍叠加在视频上 |

### 两种替换方式

1. **同名覆盖**：直接替换 `public/wallpapers/` 下的同名文件，零代码改动。
2. **改代码挂载**：编辑 `src/App.jsx` 顶部的 `REFERENCE_WALLPAPERS` / `DEFAULT_SCREEN_CONTENT` 常量；`PhoneDevice` 对应的 props 是 `screenSrc`（内屏壁纸）、`coverSrc`（外屏壁纸）、`screenOverlaySrc`（内屏图标层）、`coverOverlaySrc`（外屏图标层）、`revealSrc`（折叠时滑入的卡片层，当前未用）、`videoSrc`（视频壁纸）。

### 注意

- 五个预设随页面启动预加载对应的景深图，默认强度为 30%；自定义图片仍可通过“开始生成”进入深度管线，视频预设使用海报帧的预生成景深图。
- 替换 `apple-desert*.avif` 前建议备份，这两个文件与 Apple 原始资产做了哈希对齐（见 THIRD_PARTY.md）。
