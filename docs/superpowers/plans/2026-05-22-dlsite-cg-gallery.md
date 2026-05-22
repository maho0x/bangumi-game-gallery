# DLsite CG Gallery Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extend `vndb-screenshots.js` to fetch and display DLsite CG images alongside VNDB screenshots, with Tab switching when both are available and full gallery removal when neither has data.

**Architecture:** All changes stay in `vndb-screenshots.js` (single IIFE, ES5). New DLsite helper functions sit beside existing VNDB ones. `init()` is rewritten last to run VNDB fetch and DLsite image probing in parallel, then decide layout (single-source or tab) once both finish. `initLightbox` gains an `openWith(images, idx)` method so DLsite grid can reuse the same lightbox without NSFW filtering.

**Why tests land in Task 7:** The test harness uses `eval(loadComponent())` — all functions live inside an IIFE and can only be exercised through `init()`. Tasks 1–5 implement helper functions and DOM changes; since old `init()` exits early on DLsite-only pages, those helpers cannot be end-to-end tested until `init()` is rewritten in Task 7. Tasks 1–5 verify no regressions in the existing VNDB suite. All new DLsite tests land in Task 7.

**Tech Stack:** Vanilla ES5 JS (`var`, `function`, `/* */` comments only, no `padStart`/arrow functions/template literals), Jest 29 + jsdom.

---

## File Map

| File | Change |
|---|---|
| `vndb-screenshots.js` | Add `extractDlsiteId`, `buildDlsiteImageUrl`, `probeDlsiteImages`, `renderDlsiteGrid`, `configureSingleSource`, `initTabs`; extend `createGalleryShell`, `injectStyles`, `initLightbox`; rewrite `init()` |
| `__tests__/integration.test.js` | Add DOM fixtures + `mockImageProbe` helper (Task 1); all new DLsite tests + two updated status-state tests (Task 7) |

---

### Task 1: DOM fixtures and mockImageProbe helper

**Files:**
- Modify: `__tests__/integration.test.js` (add fixtures + helper)

No component changes. Prepares the test infrastructure that Tasks 7's tests will need.

- [ ] **Step 1: Add fixtures and helper**

Insert after line 32 (after `const NSFW_SHOT = ...`) in `__tests__/integration.test.js`:

```js
const DLSITE_RJ_URL = 'https://www.dlsite.com/maniax/work/=/product_id/RJ305720.html';
const DLSITE_VJ_URL = 'https://www.dlsite.com/maniax/work/=/product_id/VJ010793.html';

const DOM_WITH_DLSITE_ONLY = `<head></head><body>
  <ul id="infobox">
    <li class="sub_group">
      <span class="tip">链接: </span>
      <a href="${DLSITE_RJ_URL}">DLsite</a>
    </li>
  </ul>
  <div id="columnSubjectHomeB">
    <div id="columnSubjectInHomeB">
      <div id="subject_detail"></div>
    </div>
  </div>
</body>`;

const DOM_WITH_BOTH = `<head></head><body>
  <ul id="infobox">
    <li class="sub_group">
      <span class="tip">链接: </span>
      <a href="https://vndb.org/v26307">VNDB</a>
    </li>
    <li class="sub_group">
      <span class="tip">链接: </span>
      <a href="${DLSITE_RJ_URL}">DLsite</a>
    </li>
  </ul>
  <div id="columnSubjectHomeB">
    <div id="columnSubjectInHomeB">
      <div id="subject_detail"></div>
    </div>
  </div>
</body>`;

/* mockImageProbe — synchronously fires onload/onerror when img.src is set.
   outcomes: array of 'load'|'error' strings, one per Image() call in order.
   Read probed URLs after loadComponent() via mockImageProbe.urls. */
const OriginalImage = global.Image;
function mockImageProbe(outcomes) {
  const probedUrls = [];
  let callIdx = 0;
  global.Image = function () {
    const self = this;
    const myIdx = callIdx++;
    Object.defineProperty(self, 'src', {
      set(url) {
        probedUrls.push(url);
        const result = myIdx < outcomes.length ? outcomes[myIdx] : 'error';
        if (result === 'load') { self.onload && self.onload(); }
        else { self.onerror && self.onerror(); }
      }
    });
  };
  mockImageProbe.urls = probedUrls;
}
```

Also update the existing `afterEach` block to restore `global.Image`:

```js
afterEach(() => {
  global.Image = OriginalImage;
  document.documentElement.innerHTML = '';
});
```

- [ ] **Step 2: Run full suite — no regressions**

```bash
npm test
```

Expected: all 33 tests pass.

- [ ] **Step 3: Commit**

```bash
git add __tests__/integration.test.js
git commit -m "test: add DLsite DOM fixtures and mockImageProbe helper"
```

---

### Task 2: DLsite URL utilities

**Files:**
- Modify: `vndb-screenshots.js` (insert after line 10, before `fetchScreenshots`)

- [ ] **Step 1: Add extractDlsiteId and buildDlsiteImageUrl**

Insert after `extractVndbId` (after line 10) in `vndb-screenshots.js`:

```js
  function extractDlsiteId(href) {
    var m = (href || '').match(/product_id\/((?:RJ|VJ)\d+)/);
    return m ? m[1] : null;
  }

  function buildDlsiteImageUrl(id, suffix) {
    var prefix = id.slice(0, 2);
    var numId = parseInt(id.slice(2), 10);
    var folderNum = Math.ceil(numId / 1000) * 1000;
    var folder = prefix + ('000000' + folderNum).slice(-6);
    var category = prefix === 'RJ' ? 'doujin' : 'professional';
    return 'https://img.dlsite.jp/modpub/images2/work/' + category + '/' + folder + '/' + id + suffix;
  }
```

- [ ] **Step 2: Run full suite — no regressions**

```bash
npm test
```

Expected: all 33 tests pass.

- [ ] **Step 3: Commit**

```bash
git add vndb-screenshots.js
git commit -m "feat: add DLsite ID extraction and image URL builder"
```

---

### Task 3: probeDlsiteImages

**Files:**
- Modify: `vndb-screenshots.js` (insert after `buildDlsiteImageUrl`)

- [ ] **Step 1: Add probeDlsiteImages**

Insert after `buildDlsiteImageUrl` in `vndb-screenshots.js`:

```js
  function probeDlsiteImages(id, onDone) {
    var images = [];

    function makeImg(suffix, onSuccess, onFail) {
      var img = new Image();
      img.onload = onSuccess;
      img.onerror = onFail;
      img.src = buildDlsiteImageUrl(id, suffix);
    }

    function probeNext(n) {
      if (n > 20) { onDone(images); return; }
      var suffix = '_img_smp' + n + '.webp';
      makeImg(suffix, function () {
        images.push({ url: buildDlsiteImageUrl(id, suffix) });
        probeNext(n + 1);
      }, function () {
        onDone(images);
      });
    }

    makeImg('_img_main.webp', function () {
      images.push({ url: buildDlsiteImageUrl(id, '_img_main.webp') });
      probeNext(1);
    }, function () {
      onDone([]);
    });
  }
```

- [ ] **Step 2: Run full suite — no regressions**

```bash
npm test
```

Expected: all 33 tests pass.

- [ ] **Step 3: Commit**

```bash
git add vndb-screenshots.js
git commit -m "feat: sequential DLsite image probe with 20-sample limit"
```

---

### Task 4: Gallery shell and CSS updates

**Files:**
- Modify: `vndb-screenshots.js` — `createGalleryShell()` and `injectStyles()`

- [ ] **Step 1: Rewrite createGalleryShell**

Replace the entire `createGalleryShell` function in `vndb-screenshots.js`:

```js
  function createGalleryShell() {
    var gallery = document.createElement('div');
    gallery.id = 'vndb-screenshot-gallery';

    var heading = document.createElement('h2');
    heading.className = 'subtitle';
    heading.appendChild(document.createTextNode('游戏画廊 '));

    var vndbTag = document.createElement('small');
    vndbTag.id = 'vndb-source-tag';
    vndbTag.className = 'grey';
    vndbTag.textContent = 'via VNDB';
    heading.appendChild(vndbTag);

    var dlsiteTag = document.createElement('small');
    dlsiteTag.id = 'dlsite-source-tag';
    dlsiteTag.className = 'grey';
    dlsiteTag.style.display = 'none';
    dlsiteTag.textContent = 'via DLsite';
    heading.appendChild(dlsiteTag);

    var toggle = document.createElement('button');
    toggle.id = 'vndb-nsfw-toggle';
    toggle.className = 'btnGray';
    toggle.textContent = '显示 R18';
    heading.appendChild(toggle);

    var grid = document.createElement('div');
    grid.id = 'vndb-grid';

    var dlsiteGrid = document.createElement('div');
    dlsiteGrid.id = 'dlsite-grid';

    gallery.appendChild(heading);
    gallery.appendChild(grid);
    gallery.appendChild(dlsiteGrid);
    return gallery;
  }
```

- [ ] **Step 2: Add new CSS rules to injectStyles**

In `injectStyles()`, append these six lines to the array (before `.join('\n')`):

```js
      '#dlsite-grid { display: none; grid-template-columns: repeat(4, 1fr); gap: 6px; }',
      '.vndb-tab { cursor: pointer; text-decoration: underline; }',
      '.vndb-tab-active { font-weight: bold; text-decoration: none; cursor: default; }',
      '#vndb-screenshot-gallery.dlsite-active #vndb-grid { display: none; }',
      '#vndb-screenshot-gallery.dlsite-active #dlsite-grid { display: grid; }',
      '#vndb-screenshot-gallery.dlsite-active #vndb-nsfw-toggle { display: none; }'
```

- [ ] **Step 3: Run full suite — no regressions**

```bash
npm test
```

Expected: all 33 tests pass. (No existing test checks heading text or gallery child count.)

- [ ] **Step 4: Commit**

```bash
git add vndb-screenshots.js
git commit -m "feat: gallery shell adds DLsite elements, title renamed to 游戏画廊"
```

---

### Task 5: renderDlsiteGrid, configureSingleSource, initTabs

**Files:**
- Modify: `vndb-screenshots.js` (insert three new functions before `init`)

- [ ] **Step 1: Add renderDlsiteGrid**

Insert after `renderScreenshots` in `vndb-screenshots.js`:

```js
  function renderDlsiteGrid(images) {
    var grid = document.getElementById('dlsite-grid');
    grid.innerHTML = '';
    images.forEach(function (image, i) {
      var thumb = document.createElement('div');
      thumb.className = 'vndb-thumb';
      thumb.dataset.idx = String(i);

      var img = document.createElement('img');
      img.src = image.url;
      img.loading = 'lazy';
      thumb.appendChild(img);

      grid.appendChild(thumb);
    });
  }
```

- [ ] **Step 2: Add configureSingleSource and initTabs**

Insert before `init()` in `vndb-screenshots.js`:

```js
  function configureSingleSource(source) {
    var gallery = document.getElementById('vndb-screenshot-gallery');
    var vndbTag = document.getElementById('vndb-source-tag');
    var dlsiteTag = document.getElementById('dlsite-source-tag');
    if (source === 'dlsite') {
      gallery.classList.add('dlsite-active');
      vndbTag.style.display = 'none';
      dlsiteTag.style.display = '';
    }
  }

  function initTabs() {
    var gallery = document.getElementById('vndb-screenshot-gallery');
    var vndbTag = document.getElementById('vndb-source-tag');
    var dlsiteTag = document.getElementById('dlsite-source-tag');

    dlsiteTag.style.display = '';
    vndbTag.className = 'vndb-tab vndb-tab-active';
    dlsiteTag.className = 'vndb-tab';

    vndbTag.addEventListener('click', function () {
      gallery.classList.remove('dlsite-active');
      vndbTag.classList.add('vndb-tab-active');
      dlsiteTag.classList.remove('vndb-tab-active');
    });

    dlsiteTag.addEventListener('click', function () {
      gallery.classList.add('dlsite-active');
      dlsiteTag.classList.add('vndb-tab-active');
      vndbTag.classList.remove('vndb-tab-active');
    });
  }
```

- [ ] **Step 3: Run full suite — no regressions**

```bash
npm test
```

Expected: all 33 tests pass.

- [ ] **Step 4: Commit**

```bash
git add vndb-screenshots.js
git commit -m "feat: renderDlsiteGrid, tab switching, and single-source configuration"
```

---

### Task 6: Extend initLightbox with openWith

**Files:**
- Modify: `vndb-screenshots.js` — `initLightbox`

The refactor replaces the `visibleList` closure variable with a `getImages` function, enabling the same navigation code to serve both VNDB (NSFW-aware) and DLsite (all images). The function gains a `return { openWith }` so `init()` can wire DLsite click handlers.

- [ ] **Step 1: Replace initLightbox**

Replace the entire `initLightbox` function in `vndb-screenshots.js`:

```js
  function initLightbox(screenshots) {
    var lb = document.createElement('div');
    lb.id = 'vndb-lightbox';
    lb.style.display = 'none';
    lb.innerHTML = [
      '<div id="vndb-lb-backdrop"></div>',
      '<button id="vndb-lb-close">✕</button>',
      '<button id="vndb-lb-prev">❮</button>',
      '<button id="vndb-lb-next">❯</button>',
      '<div id="vndb-lb-content">',
        '<div id="vndb-lb-loading">加载中…</div>',
        '<img id="vndb-lb-img" src="" alt="">',
      '</div>',
      '<div id="vndb-lb-counter"></div>'
    ].join('');
    document.body.appendChild(lb);

    var currentIdx = 0;
    var lbOpen = false;
    var getImages = function () { return getVisibleScreenshots(screenshots); };

    function showImage(image) {
      var img     = document.getElementById('vndb-lb-img');
      var loading = document.getElementById('vndb-lb-loading');
      var counter = document.getElementById('vndb-lb-counter');
      img.style.display = 'none';
      loading.style.display = 'block';
      counter.textContent = (currentIdx + 1) + ' / ' + getImages().length;
      img.onload = function () {
        loading.style.display = 'none';
        img.style.display = 'block';
      };
      img.src = image.url;
    }

    function openWith(images, idx) {
      getImages = function () { return images; };
      currentIdx = idx;
      lbOpen = true;
      lb.style.display = 'flex';
      showImage(images[idx]);
    }

    function open(visibleIdx) {
      getImages = function () { return getVisibleScreenshots(screenshots); };
      currentIdx = visibleIdx;
      lbOpen = true;
      lb.style.display = 'flex';
      showImage(getImages()[currentIdx]);
    }

    function close() {
      lbOpen = false;
      lb.style.display = 'none';
    }

    function navigate(delta) {
      var imgs = getImages();
      if (!imgs.length) return;
      currentIdx = (currentIdx + delta + imgs.length) % imgs.length;
      showImage(imgs[currentIdx]);
    }

    document.getElementById('vndb-lb-backdrop').addEventListener('click', close);
    document.getElementById('vndb-lb-close').addEventListener('click', close);
    document.getElementById('vndb-lb-prev').addEventListener('click', function () { navigate(-1); });
    document.getElementById('vndb-lb-next').addEventListener('click', function () { navigate(1); });

    document.addEventListener('keydown', function (e) {
      if (!lbOpen) return;
      if (e.key === 'Escape')     close();
      if (e.key === 'ArrowLeft')  navigate(-1);
      if (e.key === 'ArrowRight') navigate(1);
    });

    document.getElementById('vndb-grid').addEventListener('click', function (e) {
      var thumb = e.target.closest('.vndb-thumb');
      if (!thumb) return;
      var isNsfwThumb = thumb.classList.contains('vndb-nsfw');
      var showNsfw    = localStorage.getItem('vndb_show_nsfw') === '1';
      if (isNsfwThumb && !showNsfw) return;
      var rawIdx = parseInt(thumb.dataset.idx, 10);
      var visibleIdx = 0;
      var count = 0;
      for (var i = 0; i < screenshots.length; i++) {
        if (isNsfw(screenshots[i]) && !showNsfw) continue;
        if (i === rawIdx) { visibleIdx = count; break; }
        count++;
      }
      open(visibleIdx);
    });

    return { openWith: openWith };
  }
```

- [ ] **Step 2: Run full suite — all 33 existing tests must pass**

```bash
npm test
```

Expected: all 33 tests pass. The `visibleList → getImages()` refactor is transparent to existing tests because navigation behaviour is identical for the VNDB path.

- [ ] **Step 3: Commit**

```bash
git add vndb-screenshots.js
git commit -m "feat: extend initLightbox with openWith for source-agnostic navigation"
```

---

### Task 7: Rewrite init() — parallel loading, coordination, and all DLsite tests

**Files:**
- Modify: `vndb-screenshots.js` — `init()` (full replacement)
- Modify: `__tests__/integration.test.js` — update 2 existing tests, add all new DLsite tests

**Behaviour change:** When VNDB returns empty/error AND no DLsite source is present, the gallery is removed entirely instead of showing "暂无截图". Two existing tests must be updated.

- [ ] **Step 1: Update two existing status-state tests**

In `__tests__/integration.test.js`, inside `describe('status states', ...)`, replace:

```js
  test('shows empty message when API returns zero screenshots', async () => {
    document.documentElement.innerHTML = DOM_WITH_VNDB;
    mockFetch([]);
    loadComponent();
    await flushPromises();
    expect(document.querySelector('.vndb-status').textContent).toContain('暂无截图');
  });

  test('shows error message when API returns non-ok status', async () => {
    document.documentElement.innerHTML = DOM_WITH_VNDB;
    mockFetchError();
    loadComponent();
    await flushPromises();
    expect(document.querySelector('.vndb-error')).not.toBeNull();
    expect(document.querySelector('.vndb-error a').href).toContain('vndb.org/v26307');
  });
```

With:

```js
  test('removes gallery when VNDB returns empty and no DLsite', async () => {
    document.documentElement.innerHTML = DOM_WITH_VNDB;
    mockFetch([]);
    loadComponent();
    await flushPromises();
    expect(document.getElementById('vndb-screenshot-gallery')).toBeNull();
  });

  test('removes gallery when VNDB errors and no DLsite', async () => {
    document.documentElement.innerHTML = DOM_WITH_VNDB;
    mockFetchError();
    loadComponent();
    await flushPromises();
    expect(document.getElementById('vndb-screenshot-gallery')).toBeNull();
  });
```

- [ ] **Step 2: Write all new DLsite tests**

Add at the end of `__tests__/integration.test.js`:

```js
describe('DLsite URL construction', () => {
  test('probes correct main URL for RJ id', () => {
    document.documentElement.innerHTML = DOM_WITH_DLSITE_ONLY;
    mockFetch([]);
    mockImageProbe(['error']);
    loadComponent();
    expect(mockImageProbe.urls[0]).toBe(
      'https://img.dlsite.jp/modpub/images2/work/doujin/RJ306000/RJ305720_img_main.webp'
    );
  });

  test('probes correct main URL for VJ id', () => {
    document.documentElement.innerHTML = DOM_WITH_DLSITE_ONLY.replace(DLSITE_RJ_URL, DLSITE_VJ_URL);
    mockFetch([]);
    mockImageProbe(['error']);
    loadComponent();
    expect(mockImageProbe.urls[0]).toBe(
      'https://img.dlsite.jp/modpub/images2/work/professional/VJ011000/VJ010793_img_main.webp'
    );
  });

  test('does not probe when DLsite prefix is unsupported', () => {
    const bjUrl = 'https://www.dlsite.com/books/work/=/product_id/BJ123456.html';
    document.documentElement.innerHTML = DOM_WITH_DLSITE_ONLY.replace(DLSITE_RJ_URL, bjUrl);
    mockFetch([]);
    mockImageProbe(['load']);
    loadComponent();
    expect(mockImageProbe.urls.length).toBe(0);
  });
});

describe('DLsite probing behaviour', () => {
  test('stops after main image fails', () => {
    document.documentElement.innerHTML = DOM_WITH_DLSITE_ONLY;
    mockFetch([]);
    mockImageProbe(['error']);
    loadComponent();
    expect(mockImageProbe.urls.length).toBe(1);
  });

  test('probes smp1 URL after main succeeds', () => {
    document.documentElement.innerHTML = DOM_WITH_DLSITE_ONLY;
    mockFetch([]);
    mockImageProbe(['load', 'error']);
    loadComponent();
    expect(mockImageProbe.urls[1]).toBe(
      'https://img.dlsite.jp/modpub/images2/work/doujin/RJ306000/RJ305720_img_smp1.webp'
    );
  });

  test('stops after first failed smp', () => {
    document.documentElement.innerHTML = DOM_WITH_DLSITE_ONLY;
    mockFetch([]);
    mockImageProbe(['load', 'load', 'error']);
    loadComponent();
    expect(mockImageProbe.urls.length).toBe(3);
  });

  test('stops at smp20 even if all succeed', () => {
    document.documentElement.innerHTML = DOM_WITH_DLSITE_ONLY;
    mockFetch([]);
    mockImageProbe(Array(22).fill('load'));
    loadComponent();
    expect(mockImageProbe.urls.length).toBe(21); /* main + smp1..smp20 */
  });
});

describe('DLsite grid rendering', () => {
  async function setupDlsiteOnly(outcomes) {
    document.documentElement.innerHTML = DOM_WITH_DLSITE_ONLY;
    mockFetch([]);
    mockImageProbe(outcomes || ['load', 'load', 'error']);
    loadComponent();
    await flushPromises();
  }

  test('renders one thumb per probed image', async () => {
    await setupDlsiteOnly(['load', 'load', 'error']);
    expect(document.querySelectorAll('#dlsite-grid .vndb-thumb').length).toBe(2);
  });

  test('thumb src matches probed URL', async () => {
    await setupDlsiteOnly(['load', 'error']);
    const img = document.querySelector('#dlsite-grid .vndb-thumb img');
    expect(img.src).toBe(
      'https://img.dlsite.jp/modpub/images2/work/doujin/RJ306000/RJ305720_img_main.webp'
    );
  });

  test('DLsite thumbs have no vndb-mask', async () => {
    await setupDlsiteOnly(['load', 'error']);
    expect(document.querySelector('#dlsite-grid .vndb-mask')).toBeNull();
  });

  test('thumbs have correct data-idx', async () => {
    await setupDlsiteOnly(['load', 'load', 'error']);
    const thumbs = document.querySelectorAll('#dlsite-grid .vndb-thumb');
    expect(thumbs[0].dataset.idx).toBe('0');
    expect(thumbs[1].dataset.idx).toBe('1');
  });
});

describe('loading coordination', () => {
  test('gallery removed when both VNDB and DLsite have no data', async () => {
    document.documentElement.innerHTML = DOM_WITH_BOTH;
    mockFetch([]);
    mockImageProbe(['error']);
    loadComponent();
    await flushPromises();
    expect(document.getElementById('vndb-screenshot-gallery')).toBeNull();
  });

  test('DLsite shown when VNDB empty but DLsite has images', async () => {
    document.documentElement.innerHTML = DOM_WITH_BOTH;
    mockFetch([]);
    mockImageProbe(['load', 'error']);
    loadComponent();
    await flushPromises();
    expect(document.getElementById('vndb-screenshot-gallery')).not.toBeNull();
    expect(document.querySelectorAll('#dlsite-grid .vndb-thumb').length).toBe(1);
    expect(document.getElementById('vndb-screenshot-gallery').classList.contains('dlsite-active')).toBe(true);
  });

  test('VNDB shown when DLsite probe fails, no tab', async () => {
    document.documentElement.innerHTML = DOM_WITH_BOTH;
    mockFetch([SFW_SHOT]);
    mockImageProbe(['error']);
    loadComponent();
    await flushPromises();
    expect(document.querySelectorAll('#vndb-grid .vndb-thumb').length).toBe(1);
    expect(document.getElementById('dlsite-source-tag').style.display).toBe('none');
  });

  test('both sources: tabs appear when both have data', async () => {
    document.documentElement.innerHTML = DOM_WITH_BOTH;
    mockFetch([SFW_SHOT]);
    mockImageProbe(['load', 'error']);
    loadComponent();
    await flushPromises();
    expect(document.getElementById('vndb-source-tag').classList.contains('vndb-tab')).toBe(true);
    expect(document.getElementById('dlsite-source-tag').classList.contains('vndb-tab')).toBe(true);
  });

  test('gallery inserted when only DLsite present', () => {
    document.documentElement.innerHTML = DOM_WITH_DLSITE_ONLY;
    mockFetch([]);
    mockImageProbe(['load', 'error']);
    loadComponent();
    expect(document.getElementById('vndb-screenshot-gallery')).not.toBeNull();
  });

  test('gallery position after #columnSubjectInHomeB for DLsite-only', () => {
    document.documentElement.innerHTML = DOM_WITH_DLSITE_ONLY;
    mockFetch([]);
    mockImageProbe(['load', 'error']);
    loadComponent();
    const col = document.getElementById('columnSubjectInHomeB');
    expect(col.nextSibling).toBe(document.getElementById('vndb-screenshot-gallery'));
  });
});

describe('tab switching', () => {
  async function setupBoth() {
    document.documentElement.innerHTML = DOM_WITH_BOTH;
    mockFetch([SFW_SHOT]);
    mockImageProbe(['load', 'load', 'error']);
    loadComponent();
    await flushPromises();
  }

  test('VNDB tab active by default', async () => {
    await setupBoth();
    expect(document.getElementById('vndb-source-tag').classList.contains('vndb-tab-active')).toBe(true);
    expect(document.getElementById('dlsite-source-tag').classList.contains('vndb-tab-active')).toBe(false);
  });

  test('clicking DLsite tab adds dlsite-active to gallery', async () => {
    await setupBoth();
    document.getElementById('dlsite-source-tag').click();
    expect(document.getElementById('vndb-screenshot-gallery').classList.contains('dlsite-active')).toBe(true);
  });

  test('clicking VNDB tab removes dlsite-active', async () => {
    await setupBoth();
    document.getElementById('dlsite-source-tag').click();
    document.getElementById('vndb-source-tag').click();
    expect(document.getElementById('vndb-screenshot-gallery').classList.contains('dlsite-active')).toBe(false);
  });

  test('DLsite-only: gallery has dlsite-active, vndb-source-tag hidden', async () => {
    document.documentElement.innerHTML = DOM_WITH_DLSITE_ONLY;
    mockFetch([]);
    mockImageProbe(['load', 'error']);
    loadComponent();
    await flushPromises();
    expect(document.getElementById('vndb-screenshot-gallery').classList.contains('dlsite-active')).toBe(true);
    expect(document.getElementById('vndb-source-tag').style.display).toBe('none');
  });
});

describe('DLsite lightbox', () => {
  async function setupDlsiteOnly() {
    document.documentElement.innerHTML = DOM_WITH_DLSITE_ONLY;
    mockFetch([]);
    mockImageProbe(['load', 'load', 'error']);
    loadComponent();
    await flushPromises();
  }

  test('clicking DLsite thumb opens lightbox', async () => {
    await setupDlsiteOnly();
    document.querySelector('#dlsite-grid .vndb-thumb').click();
    expect(document.getElementById('vndb-lightbox').style.display).not.toBe('none');
  });

  test('lightbox shows correct DLsite image URL', async () => {
    await setupDlsiteOnly();
    document.querySelector('#dlsite-grid .vndb-thumb').click();
    expect(document.getElementById('vndb-lb-img').src).toBe(
      'https://img.dlsite.jp/modpub/images2/work/doujin/RJ306000/RJ305720_img_main.webp'
    );
  });

  test('counter shows correct total', async () => {
    await setupDlsiteOnly();
    document.querySelector('#dlsite-grid .vndb-thumb').click();
    expect(document.getElementById('vndb-lb-counter').textContent).toBe('1 / 2');
  });

  test('ArrowRight navigates to next DLsite image', async () => {
    await setupDlsiteOnly();
    document.querySelector('#dlsite-grid .vndb-thumb').click();
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
    expect(document.getElementById('vndb-lb-img').src).toBe(
      'https://img.dlsite.jp/modpub/images2/work/doujin/RJ306000/RJ305720_img_smp1.webp'
    );
    expect(document.getElementById('vndb-lb-counter').textContent).toBe('2 / 2');
  });

  test('VNDB lightbox still works when both sources present', async () => {
    document.documentElement.innerHTML = DOM_WITH_BOTH;
    mockFetch([SFW_SHOT]);
    mockImageProbe(['load', 'error']);
    loadComponent();
    await flushPromises();
    document.querySelector('#vndb-grid .vndb-thumb').click();
    expect(document.getElementById('vndb-lb-img').src).toBe(SFW_SHOT.url);
  });
});
```

- [ ] **Step 3: Run tests — confirm new tests fail and existing tests fail on updated status-state tests**

```bash
npm test 2>&1 | tail -20
```

Expected: multiple failures (new init() not written yet; two status-state tests updated).

- [ ] **Step 4: Rewrite init()**

Replace the entire `init()` function in `vndb-screenshots.js`:

```js
  function init() {
    if (!/^\/subject\/\d+$/.test(location.pathname)) return;

    var subjectDetail = document.getElementById('subject_detail');
    if (!subjectDetail) return;

    var vndbAnchor   = document.querySelector('#infobox a[href*="vndb.org/v"]');
    var dlsiteAnchor = document.querySelector('#infobox a[href*="dlsite.com"]');

    var vndbId   = vndbAnchor   ? extractVndbId(vndbAnchor.href)     : null;
    var dlsiteId = dlsiteAnchor ? extractDlsiteId(dlsiteAnchor.href) : null;

    if (!vndbId && !dlsiteId) return;

    var columnInHomeB = document.getElementById('columnSubjectInHomeB') || subjectDetail.parentNode;

    injectStyles();
    var gallery = createGalleryShell();
    columnInHomeB.parentNode.insertBefore(gallery, columnInHomeB.nextSibling);

    var vndbResult   = null;
    var dlsiteImages = null;
    var lbInstance   = null;

    function onBothDone() {
      if (vndbResult === null || dlsiteImages === null) return;

      var hasVndb   = Array.isArray(vndbResult) && vndbResult.length > 0;
      var hasDlsite = dlsiteImages.length > 0;

      if (!hasVndb && !hasDlsite) {
        gallery.parentNode.removeChild(gallery);
        return;
      }

      if (hasVndb && hasDlsite) {
        renderDlsiteGrid(dlsiteImages);
        initTabs();
        document.getElementById('dlsite-grid').addEventListener('click', function (e) {
          var thumb = e.target.closest('.vndb-thumb');
          if (!thumb) return;
          lbInstance.openWith(dlsiteImages, parseInt(thumb.dataset.idx, 10));
        });
      } else if (hasDlsite) {
        renderDlsiteGrid(dlsiteImages);
        configureSingleSource('dlsite');
        lbInstance = initLightbox([]);
        document.getElementById('dlsite-grid').addEventListener('click', function (e) {
          var thumb = e.target.closest('.vndb-thumb');
          if (!thumb) return;
          lbInstance.openWith(dlsiteImages, parseInt(thumb.dataset.idx, 10));
        });
      }
      /* hasVndb && !hasDlsite: already rendered during VNDB resolution, no change needed */
    }

    if (vndbId) {
      var grid = document.getElementById('vndb-grid');
      showLoading(grid);
      fetchScreenshots(vndbId).then(function (screenshots) {
        vndbResult = screenshots;
        if (screenshots.length) {
          renderScreenshots(screenshots);
          initNsfwToggle();
          lbInstance = initLightbox(screenshots);
        }
      }).catch(function () {
        vndbResult = [];
      }).then(function () {
        onBothDone();
      });
    } else {
      vndbResult = [];
    }

    if (dlsiteId) {
      probeDlsiteImages(dlsiteId, function (images) {
        dlsiteImages = images;
        onBothDone();
      });
    } else {
      dlsiteImages = [];
      onBothDone();
    }
  }
```

- [ ] **Step 5: Run full suite**

```bash
npm test
```

Expected: all tests pass. Count should be 33 (existing) − 2 (replaced status-state) + 2 (updated) + all new DLsite tests.

If the `smoke` test or `page guard` tests fail, check that `DOM_NO_VNDB` and non-subject URLs still exit early (no DLsite anchor in those fixtures → `!vndbId && !dlsiteId` → return). ✓

- [ ] **Step 6: Commit**

```bash
git add vndb-screenshots.js __tests__/integration.test.js
git commit -m "feat: parallel VNDB+DLsite loading with tab coordination and gallery removal"
```
