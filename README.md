# Heat Journey · 热量之旅

| 文件 File | 内容 What |
|---|---|
| `FLOW.md` | 完整交互流程（中文 → English），25 个屏幕 / full flow, 25 screens |
| `figma-plugin/` | 在 Figma 里自动生成全部 25 帧 + Flow Map + Smart Animate 原型连线 / builds all frames in Figma |
| `threejs-prototype/index.html` | 可交互 3D 原型（单文件）/ interactive 3D prototype (one file) |

屏幕编号（`S0.1` … `S7.1`）在三者中完全一致。/ Screen IDs match across all three.

---

## 1. Figma 插件 / Figma plugin

**中文**
1. 下载 `figma-plugin/` 文件夹（`manifest.json` + `code.js`）。
2. 打开 **Figma 桌面版**（网页版不能导入本地插件）→ 打开任意设计文件。
3. 菜单 **Plugins → Development → Import plugin from manifest…** → 选择 `manifest.json`。
4. **Plugins → Development → Heat Journey Flow Builder** 运行。
5. 会新建页面 **"Heat Journey · Flow"**：每个 Step 一行，最上面是 Flow Map 总览。
6. 点右上角 ▶ **Present** 播放。S3.2、S3.3 会自动播放；进度条、Flow Map 卡片都可以点击跳转。

字体会按顺序尝试 Noto Sans SC → PingFang SC → Microsoft YaHei → Inter。所有图形都是可编辑的原生图层，图层名在所有帧里保持一致，所以 Smart Animate 会自动做出镜头推进的效果。

**English**
1. Download the `figma-plugin/` folder.
2. Open **Figma Desktop** (the browser version can't import local plugins) and open any file.
3. **Plugins → Development → Import plugin from manifest…** → choose `manifest.json`.
4. Run **Plugins → Development → Heat Journey Flow Builder**.
5. A new page, **"Heat Journey · Flow"**, is created with one row per step and a Flow Map at the top.
6. Click ▶ **Present**. S3.2 and S3.3 auto-advance; the progress chips and Flow Map cards are clickable.

Every shape is a native, editable layer. Layer names are the same in every frame, so Smart Animate produces the camera-move transitions automatically.

## 2. Three.js 原型 / Three.js prototype

**中文**：下载 `threejs-prototype/index.html`，双击用 Chrome / Edge / Safari 打开即可。需要联网（three.js 从 jsDelivr CDN 加载）。
- 方向键 ← → 翻页；鼠标拖动旋转、滚轮缩放
- 网址后面加 `#S4.3` 可以直接跳到某一屏（方便评审）
- Step 06 里的数字来自一个简化的热力模型（`simulate()` 函数），只用于教学示意

**English**: download `threejs-prototype/index.html` and open it in Chrome / Edge / Safari. It needs internet access (three.js loads from the jsDelivr CDN).
- ← → keys change screens; drag to orbit, scroll to zoom
- Add `#S4.3` to the URL to jump straight to a screen
- Step 06 numbers come from a simplified, illustrative model (`simulate()`)

To deploy it, put `index.html` in any static host (e.g. Vercel, like your example site).

## 3. 之后接 Blender / Adding Blender later

**中文**：现在的 3D 场景是代码里用基础几何体搭的。用 Blender 建好模型后导出 `.glb`，**把 Blender 里的对象命名成和代码一样的名字**（`Rack3`、`HeatExchanger`、`Greenhouse`、`PrimaryHot`……）。然后用 `GLTFLoader` 替换掉第 4 节里对应的 `mesh(...)` 调用 —— 高亮、镜头、管道颜色、流程逻辑都不用改。

**English**: the 3D scene is currently built from primitives in code. Model it in Blender, export `.glb`, and **name the Blender objects the same as the code units** (`Rack3`, `HeatExchanger`, `Greenhouse`, `PrimaryHot`…). Then swap the `mesh(...)` calls in section 4 for a `GLTFLoader` load. Focus/dimming, cameras, pipe colors and the flow logic don't need to change.
