# VNDB Screenshot Gallery — Bangumi 超合金组件 设计文档

**日期：** 2026-05-22  
**状态：** 已审批，待实现

---

## 概述

为 Bangumi 番组计划网站开发一个超合金组件（站内用户脚本），在含有 VNDB 关联链接的游戏/VN 条目页面上，自动从 VNDB API 拉取截图并以画廊形式展示，提供 Lightbox 浏览和 NSFW 内容过滤功能。

---

## 技术环境

- **平台**：Bangumi 超合金（Chobits）组件系统
- **执行机制**：页面 DOM 加载完毕后，由 Bangumi 通过 `eval()` 执行组件 JS
- **可用 API**：原生浏览器 API、jQuery（全局可用）
- **不可用**：GM.* API、外部模块 `require()`
- **注释格式**：必须使用 `/* */`，不能用 `//`（超合金 eval 兼容性问题）
- **全局变量**：`CHOBITS_UID`、`SITE_URL`、`chiiLib`、`jQuery`

---

## 文件结构

```
vndb-screenshots.js    ← 提交到超合金平台的单一文件（含内联 CSS）
```

组件提交方式：在 Bangumi 开发者平台新建"组件"类型应用，将 JS 代码填入版本字段（CSS 可单独填写或内联注入 `<style>`）。

---

## 页面匹配指令

```js
/* @match https://bgm.tv/subject/* */
/* @match https://bangumi.tv/subject/* */
/* @match https://chii.in/subject/* */
```

---

## 执行流程

```
页面加载完毕（DOM ready）
  ↓
1. 校验 URL：pathname 匹配 /subject/\d+$
   失败 → 退出
  ↓
2. 查找 VNDB 链接：document.querySelector('#infobox a[href*="vndb.org/v"]')
   未找到 → 退出（非 VN 条目或未关联 VNDB）
  ↓
3. 提取 VNDB ID：从 href 正则匹配 /vndb\.org\/(v\d+)/
  ↓
4. 在 #columnSubjectHomeB 内 #subject_detail 之后插入画廊占位 DOM（含加载提示）
  ↓
5. POST https://api.vndb.org/kana/vn 获取截图数据
  ↓
6. 渲染截图网格，绑定 NSFW 切换和 Lightbox 交互
```

---

## VNDB API

**Endpoint：** `POST https://api.vndb.org/kana/vn`  
**认证：** 无需（公开只读）  
**限流：** 200 次请求 / 5 分钟

**请求体：**
```json
{
  "filters": ["id", "=", "v26307"],
  "fields": "id,screenshots{id,url,dims,sexual,violence,thumbnail,thumbnail_dims}"
}
```

**截图字段说明：**

| 字段 | 类型 | 用途 |
|---|---|---|
| `thumbnail` | string URL | 画廊网格缩略图 |
| `thumbnail_dims` | [w, h] | 缩略图宽高比 |
| `url` | string URL | Lightbox 全尺寸原图 |
| `dims` | [w, h] | 原图尺寸参考 |
| `sexual` | 0–2 | 性内容程度（≥2 视为 R18）|
| `violence` | 0–2 | 暴力内容程度（≥2 视为 R18）|

**NSFW 判定：** `sexual >= 2 || violence >= 2`

---

## DOM 结构

### 插入位置

`#columnSubjectHomeB` 内，`#subject_detail` 之后（作为兄弟节点插入，不依赖 `#panelInterestWrapper` 存在与否）。

### 画廊 HTML

```html
<div id="vndb-screenshot-gallery">
  <h2 class="subtitle">
    游戏截图
    <small class="grey">via VNDB</small>
    <button id="vndb-nsfw-toggle" class="btnGray">显示 R18</button>
  </h2>
  <div id="vndb-grid">
    <!-- 普通截图 -->
    <div class="vndb-thumb" data-idx="0">
      <img src="{thumbnail_url}" loading="lazy">
    </div>
    <!-- NSFW 截图 -->
    <div class="vndb-thumb vndb-nsfw" data-idx="1">
      <img src="{thumbnail_url}" loading="lazy">
      <div class="vndb-mask">R18</div>
    </div>
  </div>
</div>
```

### Lightbox HTML（动态挂到 `<body>`）

```html
<div id="vndb-lightbox">
  <div id="vndb-lb-backdrop"></div>
  <button id="vndb-lb-close">✕</button>
  <button id="vndb-lb-prev">❮</button>
  <button id="vndb-lb-next">❯</button>
  <div id="vndb-lb-content">
    <img id="vndb-lb-img" src="">
    <div id="vndb-lb-loading">加载中…</div>
  </div>
  <div id="vndb-lb-counter">1 / 24</div>
</div>
```

---

## CSS 设计

**画廊网格：**
- `display: grid; grid-template-columns: repeat(4, 1fr); gap: 6px`
- 缩略图：固定高度 120px，`object-fit: cover`，`cursor: pointer`
- NSFW 遮罩：`position: absolute; inset: 0; backdrop-filter: blur(12px)` + 居中"R18"文字

**NSFW 切换：**
- `#vndb-grid.show-nsfw .vndb-mask { display: none; }`

**Lightbox：**
- 全屏半透明黑色遮罩（`position: fixed; inset: 0; background: rgba(0,0,0,0.85)`）
- 图片最大尺寸：`max-width: 90vw; max-height: 85vh; object-fit: contain`
- 导航按钮和关闭按钮定位于覆盖层边缘

---

## 交互行为

### NSFW 切换

| 状态 | 按钮文字 | 效果 |
|---|---|---|
| 关闭（默认） | 显示 R18 | NSFW 截图缩略图被遮罩 |
| 开启 | 隐藏 R18 | 遮罩移除，NSFW 缩略图可见 |

切换状态通过 `localStorage`（key: `vndb_show_nsfw`）持久化。

### Lightbox

| 操作 | 效果 |
|---|---|
| 点击缩略图 | 打开 Lightbox，跳到对应图片 |
| 点击背景 / ✕ / ESC | 关闭 Lightbox |
| ← / → 键 / ❮ ❯ 按钮 | 切换上一张 / 下一张 |

**可见图片列表：** NSFW 切换关闭时，Lightbox 导航列表排除 NSFW 图片，避免意外显示 R18 内容。

**加载过渡：** 切换图片时先显示"加载中…"，`img.onload` 后显示图片。

---

## 错误处理

| 情形 | 处理方式 |
|---|---|
| 无 VNDB 链接 | 静默退出，不插入任何 DOM |
| API 请求失败 | 显示"截图加载失败，[在 VNDB 查看]({vndb_url})" |
| 返回截图为空 | 显示"VNDB 暂无截图" |
| 请求进行中 | 显示"正在加载截图…" |
