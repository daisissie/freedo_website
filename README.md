# Freedo Website

## 本地运行

```bash
npm install
npm run dev
```

默认地址：`http://localhost:5173`

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
