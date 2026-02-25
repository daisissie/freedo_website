# Freedo 官网原型

## 快速预览

项目为纯静态网页，无需打包器。启动本地静态服务即可：

```bash
python3 -m http.server 4173 --bind 127.0.0.1
```

浏览器访问：`http://127.0.0.1:4173/`

## 已实现（对应落地要求）

- Hero 全屏布局：左侧标题/价值主张/CTA，右侧 Three.js 粒子地球
- 页面结构：Hero 后为服务、案例、优势、客户、联系 section
- 3D 只在 Hero 运行，滚出视口后暂停渲染
- Three.js 四层：
  - Layer 1：点云地球（桌面 110k / 移动端 54k）
  - Layer 2：线框 + 纬线网格（加法混合）
  - Layer 3：沿纬度移动扫描环，并联动点云局部提亮
  - Layer 4：鼠标命中扰动（局部位移 + 提亮 + 点尺寸增强）
- 后期：Bloom（移动端降低强度和采样）
- 稳定性与降级：
  - `prefers-reduced-motion`：关闭扫描与鼠标扰动，仅保留轻呼吸
  - 移动端：降低粒子数、DPR 与 Bloom 负载
  - WebGL 不支持：自动显示静态 fallback hero 图

## 主要文件

- `index.html`
- `src/style.css`
- `src/main.js`
- `src/earthScene.js`
- `assets/hero-fallback.svg`
