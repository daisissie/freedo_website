# Freedo Website

Freedo 官网和 `demo.html` 双模型 2D 转 3D 页面。

## 在开始前先知道

这个仓库可以 fork、clone、运行，但不是“零配置即用”。

要让 demo 真正生成 3D，需要额外准备：

- 一个有效的 `FAL_KEY`
- 一个可访问的 Zhengrong 后端
  默认地址是 `http://36.170.54.6:24681`

功能依赖关系：

- 首页和静态页面：只需要正常构建运行
- demo 上传和 UI：只需要正常构建运行
- `峥嵘 Local`：需要可访问的 `ZHENGRONG_BASE`
- `Model 2`：需要有效的 `FAL_KEY`

## 本地开发步骤

### Step 1. 获取代码

如果是你自己仓库：

```bash
git clone <your-repo-url>
cd freedo_website
```

如果是 fork 后再拉到本地，也一样进入项目根目录。

### Step 2. 安装依赖

```bash
npm install
```

### Step 3. 创建本地环境变量

```bash
cp .env.example .env.local
```

### Step 4. 编辑 `.env.local`

至少确认这两个变量：

```env
FAL_KEY=your_fal_key_here
ZHENGRONG_BASE=http://36.170.54.6:24681
```

说明：

- `FAL_KEY`：给 `Model 2` 用
- `ZHENGRONG_BASE`：给 `峥嵘 Local` 用
- 如果你有自己的 Zhengrong 服务，把 `ZHENGRONG_BASE` 改成你自己的地址

### Step 5. 启动开发服务器

```bash
npm run dev
```

打开终端里输出的地址，例如：

```text
http://127.0.0.1:5173/demo.html
```

### Step 6. 本地验证

先检查页面能不能打开，再测试上传。

如果你要快速检查本地 API 是否挂载：

```bash
npm run smoke:demo
```

### Step 7. 开始使用 demo

`demo.html` 是双模型页面：

- `峥嵘 Local`：走 `/api/zhengrong/*`
- `Model 2`：走 `/api/fal/*`

浏览器不会直接访问 `36.170.54.6`、`rest.fal.ai`、`queue.fal.run` 或 Fal 的 GLB 下载地址。上传、轮询、下载统一走项目内 API 路由。

## Fork 后交给别人时的步骤

如果别人 fork 你的 repo，可以直接按下面做：

### Step 1. Fork 仓库

在 GitHub 点 `Fork`。

### Step 2. Clone 自己的 fork

```bash
git clone <fork-repo-url>
cd freedo_website
```

### Step 3. 按“本地开发步骤”配置 `.env.local`

最少需要：

- `FAL_KEY`
- `ZHENGRONG_BASE` 或可用的默认 Zhengrong 服务

### Step 4. 验证 demo

验证顺序建议是：

1. 先打开 `index.html` 对应页面，确认静态站点正常
2. 再打开 `demo.html`
3. 先测试上传是否正常
4. 再分别测试 `峥嵘 Local` 和 `Model 2`

## 常见失败原因

### 1. 点击上传没有反应

通常是因为你不是通过 `npm run dev` 或部署后的真实域名访问页面，而是直接打开了本地文件。

不要这样打开：

- Finder 双击
- `file://.../demo.html`
- 纯静态 Live Server

### 2. 页面能打开，但 `/api/*` 返回 404

通常是因为 API 路由没有正确挂载。

排查顺序：

1. 检查配置文件是否在根目录
2. 检查 `api/` 或 `node-functions/` 是否存在
3. 检查是不是用了错误的运行方式
4. 检查环境变量是否已配置

### 3. `Model 2` 失败

通常是下面几种原因：

- `FAL_KEY` 没配置
- `FAL_KEY` 无效
- Fal 额度或任务失败
- 当前服务端配置拒绝了上传

### 4. `峥嵘 Local` 失败

通常是下面几种原因：

- `ZHENGRONG_BASE` 地址不可达
- Zhengrong 服务没启动
- 服务端超时
- 返回格式与当前前端代理不兼容

### 5. Generate 报错，但首页正常

通常说明静态页面没问题，问题在服务端依赖：

- `FAL_KEY`
- `ZHENGRONG_BASE`
- API 路由
- 上传文件大小

## Smoke Test

快速检查本地路由挂载：

```bash
npm run dev
npm run smoke:demo
```

对本地或线上做完整生成检查：

```bash
npm run smoke:demo -- --base https://your-domain.com --mode full --image /absolute/path/to/object.png
```

参数说明：

- `--base`：默认 `http://127.0.0.1:5173`
- `--mode`：`quick` 或 `full`
- `--provider`：`both`、`zhengrong`、`fal`
- `--image`：`full` 模式必填
- `--timeout`：总超时秒数，默认 `180`

## 编辑入口

- 文案（中英文）：`src/i18n/zh.js`、`src/i18n/en.js`
- 首页结构：`index.html`
- 共享样式：`src/styles/site.css`
- demo 页面结构：`demo.html`
- demo 页面样式：`src/styles/demo.css`
- demo 页面逻辑：`src/pages/demo.js`
- 首页交互：`src/features/home/interactions.js`
- 首页地球效果：`src/features/home/earth-scene.js`

## 结构说明

- `public/tailwind-config.js`：Tailwind CDN 配置
- `vite.config.js`：Vite 多页面入口和本地 `/api/*` 挂载
- `src/pages/home.js`：首页入口
- `src/pages/about.js`：关于页入口
- `src/pages/demo.js`：demo 页入口
- `scripts/smoke-demo.mjs`：demo 路由和生成流程 smoke test
- `node-functions/api/zhengrong/*`：峥嵘后端代理
- `node-functions/api/fal/*`：Model 2 / Fal API 代理
- `api/*`：另一套服务端 API 入口实现

## 文案规则

- `index.html` 只保留结构和 `data-i18n` / `data-i18n-html` / `data-i18n-attr` 标记
- 文案内容统一在 `src/i18n/*.js` 中维护
- 新增文案时：
  1. 在 `index.html` 增加对应 `data-i18n` key
  2. 在 `zh.js` 和 `en.js` 添加同名 key
