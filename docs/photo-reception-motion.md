# 自然回忆 · 照片输入动效记录

此文为上一版历史记录。当前版本见 [Circular Gallery 空间迁移记录](./circular-gallery-motion.md)。

日期：2026-09-15。范围：本次外屏照片输入/输出改造，以及它复用的交互工具。已有灯塔建模、水面、音乐和展开演出的历史设计不在本次修改范围内。

## 动作与实现

外部照片始终保持小尺寸，向设备边缘移动并逐步被遮住。外屏使用完整独立 UV 显影。两者共享照片身份与进度，不再共享一块展开的大面片。

| 动效 | 实际实现 | 参数 / 调整入口 |
| --- | --- | --- |
| 开场收景 | 原有相机取景系数从 1.5 到 1.125；照片由右侧入场 | `photo-journey.js`：journey 0→1，宽高缩到 75%；reveal 从 intro 0.28 开始 |
| 小照片输入 / 输出 | 连续曲线插值；右侧进入，左侧输出；队列同步补位 | `photoPlacement()`：宽度固定为外屏宽度 0.34，间距 0.065；中段不暂停，不放大 |
| 轻微空间感 | GLSL 投影偏转、微小抬升与透视压缩 | `photographVertex`：最大偏转 0.2 rad（约 11.5°），余弦只收窄宽度 |
| 设备接收遮挡 | Three.js 深度测试 + 外屏投影边缘接收遮罩 | `cover-morph.js` 根据实际外屏顶点更新投影范围和深度；`photographFragment` 保留边框宽度约 0.012 |
| 纸片轮廓与阴影 | SDF 圆角、细边、轻阴影 | `photographFragment`：阴影上限 alpha 0.12，边缘亮度混合 0.22；不使用整屏模糊滤镜 |
| 接收高光 | 只在卡片穿过边缘时出现的局部窄高光 | `uHandoff` 来自卡片与边缘交叠；限定在外屏中部接收区域 |
| 屏内显影 | 基于已移植 React Bits Melt 的 FBM 位移和噪声混合，改为右→左局部显影前缘 | `samplePhotoTransfer()`；传输时间 30%→90% 驱动外屏进度，外部卡片无 Melt |
| 可中断与可逆 | GSAP Timeline 动画统一标量；新输入 kill 旧时间轴；拖动直接采样同一函数 | 点击切换 1.1 秒，power2.inOut；滚轮追踪 0.28 秒，power3.out；反向无需另写一套动画 |
| 减少动态效果 | 关闭偏转和位移；选择直接定位；屏内保留简单混合分支 | 沿用 `usePhotoJourney(reduced)` 与 `uReduce`；后台标签页暂停时间轴 |

## 实际使用的工具

| 工具 | 本地版本 / 来源 | 本次职责 |
| --- | --- | --- |
| GSAP | 3.15.0，已有依赖 | Timeline / tween 统一时间与中断管理 |
| Three.js / WebGL GLSL | 0.185.1，已有依赖 | 卡片网格、图像采样、深度测试、接收遮罩与显影 |
| React | 19.2.0，已有依赖 | 状态同步与已有按钮、键盘、拖动交互 |
| 原生 Wheel / Pointer Events | 浏览器内置 | 沿用滚轮增量、指针捕获、拖动和键盘入口 |
| React Bits Morph Slider | 用户提供的 `E:/download/示例.md`、定制截图与源码参考 | 复用已移植的噪声 / FBM / Melt 逻辑，本次对显影范围和强度做项目适配；未安装 React Bits 包 |
| Motion for React | 13.2.0，已有依赖 | 原有标题和 UI 进出场，未修改 |
| Vite | 6.4.2，已有依赖 | 构建当前预览版本；5218 当前服务构建产物，需要构建后刷新 |
| Node 内置测试 | `node --test` | 尺度、接收边界、进度连续、队列间距、反向与暂停回归 |
| CUA 浏览器 + 截图 | Codex 浏览器接口 | 操作当前页面，查看并保存关键帧；通过 DOM 确认实际构建版本 |

本次读取 / 采用的工作方法：brainstorming（承接已批准方案）、writing-plans（实施计划）、test-driven-development（先复现放大问题）、verification-before-completion（测试、构建与视觉证据）。设计与检索依据为上一轮 redesign-existing-projects、Product Design audit、agent-reach 的分析报告。

## React Bits 参数适配

`memory-photos.js` 保留用户原始定制参数：intensity 0.95、scale 4.9、aberration 0.35、drift 0.4、duration 1.1、ease none。

本次并非原版 Morph Slider 的逐参数原样回放：主交互时间轴使用上述 GSAP 缓动；Melt 位移系数由 0.5 改为 0.12，色散系数由 0.03 改为 0.004，并只在移动显影区域生效。scale 4.9 和两层 FBM 继续使用。overlay 未用于本次传输。全部修改集中在 `photo-transfer-shader.js`，原始 `morph-shader.js` 和用户参数文件未改。

## 参考过但没有加入的工具

- Circular Gallery：借鉴照片队列思路，未复制或安装组件。
- GSAP Observer：现有 Wheel / Pointer Events 已满足输入，因此未额外加入。
- MotionPathPlugin：当前简单短弧线可用插值和着色器完成，未引入。
- Flip：未用于 WebGL 卡片；它不是本次三维接收的实现。
- 粒子溶解：未实现，避免引入与本次目标无关的复杂性。

官方来源：[GSAP Timeline](https://gsap.com/docs/v3/GSAP/Timeline/)、[React Bits Morph Slider](https://reactbits.dev/components/morph-slider)、[Circular Gallery](https://reactbits.dev/components/circular-gallery)、[Three.js Material](https://threejs.org/docs/pages/Material.html)。资料已在上一轮核对，本次未下载新文件或安装依赖；后续下载仍遵守用户要求，放在 `F:/工具`。

## 验证与范围

- 改动前新增测试能复现放大问题：8 项中 2 项失败；改动后照片测试 8 项全部通过。
- 最终 `npm test`：51 项通过（6 focus + 4 sites + 41 demo），0 失败。
- 最终 `npm run build`：成功；仍有现有大体积 bundle 提示。此提示不等同于已完成性能优化。
- 当前构建入口：`index-DAPLCzuY.js`；DOM `data-photo-effect="edge-reception-melt"`。最终补充 `abs` 处理，避免 GLSL `pow` 接收负底数导致跨 GPU 不确定行为；不改变动效设计。
- 视觉截图记录在 `F:/Duo/docs/shader-audit/2026-09-15-reception/`。最终视觉复验结果另见该目录的 `verification.md`。

限制：本次卡片使用外屏投影坐标和接收遮罩，适配首页固定的正对外屏视角；有深度测试，但不是任意机位的全三维纸片装置。展开后仍由原有场景系统接管。未新增模型或替换用户照片，未切换分支。未做低端设备帧率基准或完整跨浏览器验证。
