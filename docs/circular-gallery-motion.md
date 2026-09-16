# Circular Gallery 空间迁移 · 实现记录

2026-09-16 输入修复：照片浏览不再被 coverPhoto.busy 或 3D 场景加载状态禁用，避免滑入中段自行关闭 GSAP Observer。回归记录见 `F:/Duo/docs/performance/2026-09-16-photo-input.md`。

2026-09-16 持续性能补充：60fps 绘制预算、200 万 WebGL 像素预算、轻量场景玻璃与延迟生成备用场景，见 `F:/Duo/docs/performance/2026-09-16-runtime.md`。本轮 Chrome 自动化连接不可用，未完成视觉与实际帧率复测。

2026-09-15 展开性能补充：`PhoneDevice.tsx` 在 Open memory 启用前等待场景资产并预热实际展开所需的 shader、反射和阴影，照片动效参数保持本记录设置。实测与代价见 `F:/Duo/docs/performance/2026-09-15-opening/verification.md`。

2026-09-15。本记录取代上一版 `photo-reception-motion.md` 对当前实现的描述。

## 实际接入位置

| 工具 | 实际调用入口 | 在画面中的职责 |
| --- | --- | --- |
| React Bits Circular Gallery（Three.js 源码适配版） | `src/iphone-duo/react-bits/CircularGallery.js`，由 `createCoverMorph()` 实例化 | Media 卡片、细分网格、正弦波动、圆角图片采样、圆弧半径；扩展为圆柱路径的前后深度与朝向 |
| GSAP Observer 3.15.0 | `MemoryExperience.jsx` 的 `memory-gallery-wheel`；`MemoryPhotoRibbon.jsx` 的 `memory-gallery-drag` | 滚轮 / 指针 / 触摸输入、轴锁定和拖动门槛，实际替换原生监听 |
| GSAP Timeline 3.15.0 | `photo-journey.js` | approach → receive-and-melt → settle 三段；新输入中断旧动画；拖动可反向采样 |
| Three.js 0.185.1 | CircularGallery 的 Mesh / Group / ShaderMaterial，与设备共用 PerspectiveCamera | 真实三维位置、yaw、远近透视、轻微远景虚化、柔和方向光和远景空气感 |
| React Bits Morph Slider | `screen-material.ts` 直接调用 `morph-shader.js` 的 `sampleMorph()` | 完整 Melt 分支应用在外屏照片切换；已删除上一版局部扫描显影 |

Observer 与 Timeline 是输入和编排工具，并非预设视觉特效。官方介绍和示例：[Observer](https://gsap.com/docs/v3/Plugins/Observer/#demo)、[Timeline](https://gsap.com/docs/v3/GSAP/Timeline/)。具体的三段镜头节奏由本项目编排。

## 官方源码与适配边界

Circular Gallery 原始文件保存于 `F:/工具/react-bits-duo/CircularGallery.original.jsx`。

来源：https://raw.githubusercontent.com/DavidHDev/react-bits/main/src/content/Components/CircularGallery/CircularGallery.jsx

下载时 SHA256：`A605312F944DAAF95878A1946E48D129ED61619537F08CD86C57277BCED864D2`。

SOURCE：原件使用 OGL，包含 Media / App、圆弧半径公式、100×50 细分网格、基于速度的正弦顶点波动与 roundedBoxSDF。移植版保留对应核心逻辑，改用 Three.js 资源和矩阵。圆柱路径、接收侧拉伸、留白遮罩和景深是本项目增加的部分；不是官网原件原样嵌入。

Morph Slider 原件是用户提供的 `E:/download/示例.md`；项目既有 `morph-shader.js` 已移植其全部四种切换分支。本次恢复调用完整 `sampleMorph()`，使用 Melt（uMode=0）。为倒带与停帧，uTime 由旅程进度驱动，而非持续递增的墙钟时间。这项差异明确保留，不宣称逐帧复现官网自动播放。

官网 Circular Gallery 页面本轮加载超时；采用公开源码核对，不声称完成官网动态视觉基准对照。

## 参数与画面约束

- 卡片基准宽度：外屏宽度 0.68，此前为 0.34；宽高均扩大 2 倍。实际画面受透视缩短影响。
- 卡片之间的轨道净间距：0.12 → 0.24，扩大 1 倍；透视投影后的像素间距随圆弧位置变化。同步修正中段轨迹，使进出照片仍在迁移一半时抵达设备边缘。
- 环形：半弦宽 1.8、弧高 0.85，半径由 Circular Gallery 公式求得；绕 Y 轴变化，远侧升高以显示空间弧线。单位为外屏世界宽度。
- 接收侧局部拉伸：沿用 Three.js ShaderMaterial，增加三层 FBM 噪声、不规则波浪轮廓、Z 轴卷曲、域扭曲纹理采样和局部红蓝色散，接近 Melt 的液化语言。属于项目自定义卡片 shader；外屏继续使用 React Bits Morph Slider 的完整 Melt。噪声尺度 4.9、漂移 0.4，使用进度时钟，因此反向拖动能回到同一形态。
- 变形约束：Y 放大最多 32%，额外 Y 位移 ±0.035；几何高度上界为基准的 1.39 倍，0.68 × 1.39 = 0.9452 个外屏高度（投影前）。横向牵引 0.10 ±0.055；纹理位移系数 X 0.27、Y 0.22，色散偏移 X 0.016、Y 0.008，仅作用接收区域。
- 空白区域：每侧约 20 CSS px，加上外屏宽度 2% 的边框估计。使用实际渲染分辨率换算，避免高 DPI 下间距翻倍。空白区不绘制连接光束。
- 远景虚化：仅作用远侧卡片，最大纹理偏移 0.004；远景基色混合最高 17%。不是整页模糊或后期 LUT。
- Morph：intensity 0.95、scale 4.9、aberration 0.35、drift 0.4，恢复原版位移系数 0.5 与色散系数 0.03，overlay #05060a。
- 手感：点击过渡 1.1 秒；24% 靠近、64% 接收和 Melt、12% 收尾；中段线性。滚轮追踪 0.28 秒 power3.out；拖动由 Observer 实时采样。
- 开场保留单设备；首次浏览缩至原宽高 75%；之后滚轮仅推进照片。
- 减少动态效果沿用用户系统设置：停止波动、拉伸，并在选择时直接定位。关闭 / 离开浏览会销毁或停用相应 Observer。

本轮未安装依赖。下载源码放在用户指定的 F:/工具；实现代码放在现有项目。

## 验证

行为测试涵盖 2 倍尺寸、2 倍轨道净间距、队列连续性、前后深度与朝向、20 CSS px 留白、反向采样与后台暂停。最新浏览器关键帧记录另存 `F:/Duo/docs/shader-audit/2026-09-15-melt-card/`；此前版本保留在 `2026-09-15-circular/`。不将单元测试通过等同于电影感已经达到最终审美目标。

最新构建 `index-CVWwL2E8.js` 已在浏览器确认；完整测试 56 项通过，构建成功（仍有既有的大包提示）。1440×960 与默认窗口已检查，拖动到 1.5 → 1.75 → 1.5，接收与输出形态能反向恢复；浏览器错误日志为空。接收侧拉伸通过 `uContact` 跟随消失边界，避免最强变形提前被遮住。本次未下载或安装新工具。
