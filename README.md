# ZhiBox · 智能拼箱集运

智能拼箱集运工具：多货主拼柜、3D 装箱模拟、装载率与重心优化。纯静态 Web 应用，无需后端，直接部署到任意静态托管即可。

## 功能

- **普通装柜**（`index.html`）：柜型/货物清单、3D 排柜、体积装载率、重心偏移、重量、Excel 导入导出、分享方案、装载动画
- **拖拽装柜**（`custom-loader.html`）：手动拖货物进柜、自动吸附堆叠、防重叠、一键铺满
- **铝材装柜**（`alu-loader.html`）：型材排柜、柜内凸出物避让、分层管理
- **特殊尺寸**（`special-size.html`）：异形件 / L形 / 缺口件装柜测算

## 本地运行

```bash
# 任意静态服务器即可，例如：
python3 -m http.server 8000
# 然后打开 http://localhost:8000/index.html
```

## 部署

解压/克隆后，把本目录所有文件上传到站点根目录即可，入口为 `index.html`。

支持任意静态托管：GitHub Pages / Vercel / Cloudflare Pages / Netlify / Nginx / Apache 等。

## 技术栈

- Three.js（3D 渲染引擎，本地 `vendor/` 目录，无 CDN 依赖）
- SheetJS/xlsx（Excel 导入导出）
- 自研极值点（Extreme Points）装箱算法（`packer.js`）

## 目录结构

```
├── index.html          普通装柜（主页）
├── custom-loader.html  拖拽装柜
├── custom-loader.js    → drag-loader.js
├── alu-loader.html     铝材装柜
├── special-size.html   特殊尺寸
├── app.js              主页应用逻辑
├── packer.js           装箱核心算法
├── vendor/             Three.js 引擎 + xlsx
└── icon.svg            Logo/图标
```
