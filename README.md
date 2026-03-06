# Freedo Website

## 本地运行

```bash
npm install
npm run dev
```

默认地址：`http://localhost:5173`

## Demo API 路由

`demo.html` 现在只调用同域 API：

- 峥嵘 Local：`/api/zhengrong/*`
- Model 2 / FAL：`/api/fal/*`

浏览器不会再直接访问 `36.170.54.6`、`rest.fal.ai`、`queue.fal.run` 或 fal 的 GLB 下载地址。上传、轮询、下载全部走 EdgeOne Node Functions。

## EdgeOne 配置（demo 页面）

仓库已提供 `node-functions/api/zhengrong/*` 和 `node-functions/api/fal/*`，可直接在 EdgeOne Pages Node Functions 运行。

操作步骤（EdgeOne）：

1. 在 EdgeOne Pages 项目环境变量中添加 `FAL_KEY`
2. 如需覆盖默认峥嵘后端地址，添加 `ZHENGRONG_BASE`
3. 构建命令使用 `npm ci` + `npm run build:edgeone`，输出目录 `dist`
4. 部署后访问 `demo.html`，前端会调用同域 `/api/zhengrong/*` 和 `/api/fal/*`

默认 `ZHENGRONG_BASE`：

```text
http://36.170.54.6:24681
```

## 本地开发注意

- `npm run dev` 会在本地挂载 `/api/zhengrong/*` 和 `/api/fal/*`
- 不要再用 `Live Server` 直接打开 `demo.html`；那样不会运行 Node Functions
- 真实 `FAL_KEY` 只应该放在服务端环境变量（EdgeOne 或你自建 API）
- `npm run build:edgeone` 会把 `node-functions/` 和 `package.json` 一并放入 `dist/`

## Smoke Test

快速检查路由挂载：

```bash
npm run dev
npm run smoke:demo
```

对本地或 EdgeOne 做完整生成/下载检查：

```bash
npm run smoke:demo -- --base https://your-domain.com --mode full --image /absolute/path/to/object.png
```

可选参数：

- `--base`：默认 `http://127.0.0.1:5173`
- `--mode`：`quick` 或 `full`
- `--provider`：`both`、`zhengrong`、`fal`
- `--image`：`full` 模式必填，建议使用单物体、背景干净的图片
- `--timeout`：总超时秒数，默认 `180`

### 中国大陆访问注意

- 若使用腾讯云中国大陆加速/服务节点，域名通常需要先完成 ICP 备案
- demo 页已移除 Google Fonts、`jsdelivr` model-viewer、`picsum` 示例图这类浏览器侧外链依赖
- 未备案时，建议先用海外加速或仅 DNS 接入，避免业务中断

## 编辑入口（最重要）

- 改文案（中英文）：`src/i18n/zh.js`、`src/i18n/en.js`
- 改页面结构/区块：`index.html`
- 改共享样式：`src/styles/site.css`
- 改 demo 页面结构：`demo.html`
- 改 demo 页面样式：`src/styles/demo.css`
- 改 demo 页面逻辑：`src/pages/demo.js`
- 改地球 3D 效果：`src/features/home/earth-scene.js`
- 改首页交互逻辑（滚动动画、磁吸按钮等）：`src/features/home/interactions.js`

## 结构说明

- `public/tailwind-config.js`：共享 Tailwind CDN 配置
- `vite.config.js`：Vite 多页面构建入口（`index.html` / `about.html` / `demo.html`）
- `src/pages/home.js`：首页初始化入口
- `src/pages/about.js`：关于页初始化入口
- `src/pages/demo.js`：demo 页初始化入口
- `src/i18n/runtime.js`：多语言应用逻辑（读取 key、切换语言、应用到 DOM）
- `src/features/home/earth-init.js`：首页地球场景加载与降级处理
- `src/features/home/interactions.js`：首页通用 UI 交互

## 文案规则

- `index.html` 只保留结构和 `data-i18n` / `data-i18n-html` / `data-i18n-attr` 标记
- 文案内容统一在 `src/i18n/*.js` 中维护
- 新增文案时：
  1. 在 `index.html` 增加对应 `data-i18n` key
  2. 同步在 `zh.js` 和 `en.js` 添加同名 key
