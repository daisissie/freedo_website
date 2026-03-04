# Freedo Website

## 本地运行

```bash
npm install
npm run dev
```

默认地址：`http://localhost:5173`

## EdgeOne / FAL 配置（demo 页面）

`demo.html` 默认调用同域 `/api/fal/*`。仓库已提供 `node-functions/api/fal/*`，可直接在 EdgeOne Pages Node Functions 运行，不依赖 Vercel。

操作步骤（EdgeOne）：

1. 在 EdgeOne Pages 项目环境变量中添加 `FAL_KEY`
2. 构建命令使用 `npm ci` + `npm run build:edgeone`，输出目录 `dist`
3. 部署后访问 `demo.html`，前端会直接调用同域 `/api/fal/*`

注意：

- `npm run dev` 只启动 Vite 静态开发服务器，不会提供 `/api` 路由
- 如果你在 `localhost` 下只跑 `vite`，demo 生成功能会返回 404（预期行为）
- `config.js` 不再用于浏览器侧 fal 认证
- 真实 `FAL_KEY` 只应该放在服务端环境变量（EdgeOne 或你自建 API）
- `npm run build:edgeone` 会把 `node-functions/` 和 `package.json` 一并放入 `dist/`，避免部署产物缺少函数导致 `/api/fal/*` 返回 404

## EdgeOne 与 Vercel 分开部署（互不依赖）

当前仓库支持两条独立部署路径：

1. EdgeOne 独立部署（推荐）
   - 前端：EdgeOne Pages
   - API：同项目 `node-functions/api/fal/*`
   - 密钥：EdgeOne 环境变量 `FAL_KEY`
2. Vercel 独立部署（可选）
   - API：仓库内 `api/fal/*`
   - 密钥：Vercel 环境变量 `FAL_KEY`
   - 与 EdgeOne 站点不做默认互相转发

### 中国大陆访问注意

- 若使用腾讯云中国大陆加速/服务节点，域名通常需要先完成 ICP 备案
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
