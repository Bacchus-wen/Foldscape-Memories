# Nature Memories · Duo

将照片展开为三维回忆的交互展示网站，基于 React、Three.js、GSAP 和 Vite。

当前包含五个案例：岸外灯塔、冰山、海边小屋、圣托里尼和大阪城。支持照片环形浏览、外屏图片迁移、设备展开、模型查看与倒带，以及独立壁纸工作室。

## 本地运行

使用 Node.js 22.12 或更新版本。

```sh
npm ci
npm run dev
```

默认进入自然回忆主页。壁纸工作室入口为 `/?view=wallpaper`。

## 验证与构建

```sh
npm test
npm run build
npm run preview
```

静态网站输出目录为 **`dist/client`**。构建还会生成用于 Sites 的 `dist/server` 和配置；Vercel、Netlify 等静态托管只需部署 `dist/client`。

## 从 GitHub 部署

在 Vercel 中导入本仓库，使用仓库根目录，项目自带 `vercel.json`：

| 设置 | 值 |
| --- | --- |
| Framework | Vite |
| Install command | `npm ci` |
| Build command | `npm run build` |
| Output directory | `dist/client` |
| Node.js | 22.x 或更新的受支持版本 |

Netlify、Cloudflare Pages 等也可使用相同的构建命令和输出目录。网站使用根路径资源地址，应部署在域名根目录；不要直接将构建产物放到 GitHub Pages 的仓库子路径。

五个案例的照片和 GLB 模型随仓库保存于 `public/scenes/`，展示不需要 Tripo API 密钥。浏览器端的可选深度图生成功能会下载推理模型，需要网络连接。

私有 GitHub 仓库不代表部署后的网站有访问限制；内部展示时请在托管平台配置访问保护。

## 文件与来源

- `src/`：界面、交互、着色器与三维场景。
- `public/`：部署所需的照片、模型及壁纸资源。
- `tests/`：自动化测试。
- `docs/`：案例与动效实现记录。
- 本地生成会话、API 配置、依赖和构建产物不会上传。

设备展示基础来自 [SkentSun / iPhone Duo Depth Lab](https://github.com/SkentSun/iphone-duo-depth-lab)。保留原有 [LICENSE](LICENSE) 和 [THIRD_PARTY.md](THIRD_PARTY.md) 来源说明。
