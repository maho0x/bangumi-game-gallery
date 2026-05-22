# DLsite CG 画廊 — Bangumi 超合金组件扩展 设计文档

**日期：** 2026-05-22  
**状态：** 已审批，待实现

---

## 概述

在现有 VNDB 截图画廊组件的基础上，增加对 DLsite 游戏 CG 图片的支持。通过固定 CDN URL 规律直接构造图片地址并顺序探测，无需调用任何 API。与 VNDB 截图共用同一画廊容器，以 Tab 形式切换。

---

## 检测与 ID 提取

**选择器：** `#infobox a[href*="dlsite.com"]`

**ID 正则：** `/product_id\/((?:RJ|VJ)\d+)/`  
- 仅处理 `RJ`（同人游戏）和 `VJ`（商业软件/游戏）前缀
- 其他前缀（BJ、AJ 等）静默跳过，不影响 VNDB 画廊

---

## URL 构建规则

```
prefix   = id 前两个字母（"RJ" 或 "VJ"）
numId    = parseInt(id.slice(2))
folder   = prefix + String(Math.ceil(numId / 1000) * 1000).padStart(6, '0')
category = prefix === 'RJ' ? 'doujin' : 'professional'
base     = "https://img.dlsite.jp/modpub/images2/work/" + category + "/" + folder + "/" + id
主图      = base + "_img_main.webp"
样本图    = base + "_img_smpN.webp"  （N = 1, 2, …）
```

**示例：**

| ID | folder | category |
|---|---|---|
| RJ305720 | RJ306000 | doujin |
| VJ010793 | VJ011000 | professional |

---

## 图片探测策略

- 与 VNDB fetch **并行启动**，互不阻塞
- **第一步：** 加载主图（`_img_main.webp`）。若主图失败（`onerror`），整个 DLsite 画廊不显示
- **第二步：** 主图成功后，顺序探测 `_smp1`、`_smp2`…，遇到第一个 `onerror` 停止，最多探测到 `_smp20`
- **缩略图：** DLsite 无单独缩略图 URL，缩略图与全尺寸图使用同一地址
- 探测使用 `new Image()` + `onload`/`onerror` 回调，不发起额外 HTTP 请求

---

## 画廊 UI

### 标题

标题文字由"游戏截图"改为**"游戏画廊"**。

### 单来源模式（只有 VNDB 或只有 DLsite）

标题区保持现有结构，`<small class="grey">` 不可点击：

```html
<h2 class="subtitle">
  游戏画廊
  <small class="grey">via VNDB</small>
  <button id="vndb-nsfw-toggle" class="btnGray">显示 R18</button>
</h2>
```

### 双来源模式（VNDB + DLsite 均有数据）

`<small>` 变为可点击的 Tab 按钮：

```html
<h2 class="subtitle">
  游戏画廊
  <small class="vndb-tab vndb-tab-active">via VNDB</small>
  <small class="vndb-tab">via DLsite</small>
  <button id="vndb-nsfw-toggle" class="btnGray">显示 R18</button>
</h2>
<div id="vndb-grid">…</div>      <!-- VNDB tab 激活时可见 -->
<div id="dlsite-grid">…</div>    <!-- DLsite tab 激活时可见，默认 display:none -->
```

### Tab 切换行为

- 点击 Tab → 更新激活样式（`.vndb-tab-active`）
- 切换两个 grid 的 `display`（`none` / `grid`）
- R18 按钮：VNDB tab 激活时显示，DLsite tab 激活时隐藏

---

## DLsite Grid 渲染

- 缩略图结构与 VNDB 一致（`.vndb-thumb` + `<img>`）
- **无 NSFW 遮罩**（DLsite 图片不做模糊处理）
- 点击缩略图打开 Lightbox，导航列表为**全部 DLsite 图片**（无过滤）

```html
<div id="dlsite-grid">
  <div class="vndb-thumb" data-idx="0">
    <img src="{main_url}" loading="lazy">
  </div>
  <div class="vndb-thumb" data-idx="1">
    <img src="{smp1_url}" loading="lazy">
  </div>
  …
</div>
```

---

## Lightbox 集成

`initLightbox` 新增返回值：

```js
var lb = initLightbox(screenshots);
// lb.openWith(images, idx) — 以任意图片列表打开 Lightbox
```

- **VNDB grid 点击：** 走现有逻辑（NSFW 感知，`getVisibleScreenshots`）
- **DLsite grid 点击：** 调用 `lb.openWith(dlsiteImages, idx)`，全部图片可见，无 NSFW 过滤
- 两者共享同一套 Lightbox DOM

---

## 加载协调

```
页面加载
  ├── VNDB fetch（API 调用）
  │     └── 完成 → 立即渲染 vndb-grid（或显示错误/空提示）
  └── DLsite 探测（顺序 Image 探测）
        └── 完成 → 若有图片，渲染 dlsite-grid

两者均完成后：
  ┌── 两者均无数据   → removeChild 整个 #vndb-screenshot-gallery
  ├── 只有 VNDB     → 单来源模式（无 Tab）
  ├── 只有 DLsite   → 单来源模式（无 Tab，替换掉 VNDB 错误/空提示）
  └── 两者均有数据   → 初始化 Tab 切换
```

VNDB 的错误/空消息在 DLsite 探测期间保持显示；探测完成后，若 DLsite 有数据则替换为 DLsite 内容。

---

## 错误与空状态处理

| 情形 | 处理方式 |
|---|---|
| 无 DLsite 链接 | 静默跳过，VNDB 画廊照常 |
| 非 RJ/VJ 前缀 | 静默跳过 |
| 主图 404 | DLsite 不显示，退回单 VNDB 模式 |
| VNDB 失败 + DLsite 有数据 | 只显示 DLsite，无 Tab |
| VNDB 有数据 + DLsite 主图失败 | 只显示 VNDB，无 Tab |
| 两者均无数据/失败 | 移除整个 #vndb-screenshot-gallery |
