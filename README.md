# Freedo Website

## 本地运行

```bash
npm install
npm run dev
```

默认地址：`http://localhost:5173`

## 配置你自己的 API Key（demo 页面）

`demo.html` 的生成能力会读取项目根目录下的 `config.js`，其中需要提供你自己的 `FAL_KEY`。

操作步骤：

1. 复制 `config.example.js` 为 `config.js`
2. 打开 `config.js`
3. 把 `window.FAL_KEY` 改成你自己的 key

示例：

```js
window.FAL_KEY = 'your_real_fal_key';
```

注意：

- `config.js` 已在 `.gitignore` 中，不会被提交
- 不要把真实 key 写进 `config.example.js`
- 如果没有配置 key，`demo.html` 在发起生成请求时会报错
- 如果你想让每个访问者都使用他们自己的 key，需要额外做一个前端输入流程或后端代理，当前项目默认只读取本地 `config.js`

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
