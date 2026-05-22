# VNDB Screenshot Gallery Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a single-file Bangumi 超合金 component that detects VNDB links on game subject pages and injects a screenshot gallery with NSFW filtering and Lightbox navigation.

**Architecture:** A self-contained IIFE (`vndb-screenshots.js`) that runs after the Bangumi page DOM loads. All logic is internal; CSS is injected via a `<style>` tag. Tests use Jest + jsdom — each test eval's the component into a controlled DOM to assert observable behavior.

**Tech Stack:** Vanilla JS (ES5-compatible IIFE), Jest 29 + jest-environment-jsdom for tests, VNDB Kana API (`POST /vn`), no external dependencies at runtime.

---

## File Structure

```
vndb-screenshots.js          ← Submit to Bangumi dev platform (all /* */ comments)
package.json                 ← Jest config
__tests__/
  integration.test.js        ← All tests
sample/                      ← Already exists (reference HTML)
docs/                        ← Already exists (specs & plans)
```

---

## Shared Test Fixtures

The following constants are defined **once at the top** of `__tests__/integration.test.js` and reused across all tasks. They are shown here so later tasks don't repeat them.

```js
const fs   = require('fs');
const path = require('path');

const COMPONENT = path.resolve(__dirname, '..', 'vndb-screenshots.js');

const DOM_WITH_VNDB = `<head></head><body>
  <ul id="infobox">
    <li class="sub_group">
      <span class="tip">链接: </span>
      <a href="https://vndb.org/v26307">VNDB</a>
    </li>
  </ul>
  <div id="columnSubjectHomeB">
    <div id="subject_detail"></div>
  </div>
</body>`;

const DOM_NO_VNDB = `<head></head><body>
  <ul id="infobox">
    <li><span class="tip">开发: </span>SomeStudio</li>
  </ul>
  <div id="columnSubjectHomeB">
    <div id="subject_detail"></div>
  </div>
</body>`;

const SFW_SHOT  = { id: 'sf1', url: 'https://s.vndb.org/sf/01/full.jpg', dims: [1280,720], sexual: 0, violence: 0, thumbnail: 'https://s.vndb.org/sf/01/th.jpg', thumbnail_dims: [320,180] };
const NSFW_SHOT = { id: 'sf2', url: 'https://s.vndb.org/sf/02/full.jpg', dims: [1280,720], sexual: 2, violence: 0, thumbnail: 'https://s.vndb.org/sf/02/th.jpg', thumbnail_dims: [320,180] };

function mockFetch(screenshots) {
  global.fetch = jest.fn().mockResolvedValue({
    ok: true,
    json: () => Promise.resolve({ results: [{ id: 'v26307', screenshots }] })
  });
}

function mockFetchError() {
  global.fetch = jest.fn().mockResolvedValue({ ok: false, status: 500 });
}

function flushPromises() {
  return new Promise(resolve => setTimeout(resolve, 0));
}

function loadComponent() {
  eval(fs.readFileSync(COMPONENT, 'utf8'));
}

beforeEach(() => {
  delete window.location;
  window.location = { pathname: '/subject/295350', href: 'https://bgm.tv/subject/295350' };
  localStorage.clear();
  jest.clearAllMocks();
});

afterEach(() => {
  document.documentElement.innerHTML = '';
});
```

---

## Task 1: Project Setup

**Files:**
- Create: `package.json`
- Create: `vndb-screenshots.js` (skeleton)
- Create: `__tests__/integration.test.js` (shared fixtures only)

- [ ] **Step 1: Write `package.json`**

```json
{
  "name": "vndb-screenshot-gallery",
  "version": "1.0.0",
  "scripts": { "test": "jest" },
  "devDependencies": {
    "jest": "^29.0.0",
    "jest-environment-jsdom": "^29.0.0"
  },
  "jest": { "testEnvironment": "jsdom" }
}
```

- [ ] **Step 2: Install dependencies**

```bash
npm install
```

Expected: `node_modules/` created, no errors.

- [ ] **Step 3: Write the component skeleton**

`vndb-screenshots.js`:
```js
/* @match https://bgm.tv/subject/* */
/* @match https://bangumi.tv/subject/* */
/* @match https://chii.in/subject/* */

(function () {
  function init() {
  }
  init();
})();
```

- [ ] **Step 4: Write `__tests__/integration.test.js` with shared fixtures**

Paste exactly the "Shared Test Fixtures" block above (all `const`, `function`, `beforeEach`, `afterEach` declarations). Add one smoke test at the bottom:

```js
test('smoke: component file loads without throwing', () => {
  document.documentElement.innerHTML = DOM_NO_VNDB;
  expect(() => loadComponent()).not.toThrow();
});
```

- [ ] **Step 5: Run tests**

```bash
npm test
```

Expected output:
```
PASS __tests__/integration.test.js
  ✓ smoke: component file loads without throwing
Tests: 1 passed, 1 total
```

- [ ] **Step 6: Commit**

```bash
git init
git add package.json vndb-screenshots.js __tests__/integration.test.js
git commit -m "chore: project setup with Jest + component skeleton"
```

---

## Task 2: Page Guard & VNDB Link Detection

**Files:**
- Modify: `vndb-screenshots.js`
- Modify: `__tests__/integration.test.js`

- [ ] **Step 1: Write the failing tests**

Append to `__tests__/integration.test.js`:

```js
describe('page guard', () => {
  test('does nothing on non-subject URL', () => {
    document.documentElement.innerHTML = DOM_WITH_VNDB;
    window.location.pathname = '/game/browser';
    loadComponent();
    expect(document.getElementById('vndb-screenshot-gallery')).toBeNull();
  });

  test('does nothing when no VNDB link in #infobox', () => {
    document.documentElement.innerHTML = DOM_NO_VNDB;
    loadComponent();
    expect(document.getElementById('vndb-screenshot-gallery')).toBeNull();
  });

  test('inserts gallery shell immediately when subject has VNDB link', async () => {
    document.documentElement.innerHTML = DOM_WITH_VNDB;
    mockFetch([]);
    loadComponent();
    expect(document.getElementById('vndb-screenshot-gallery')).not.toBeNull();
  });

  test('gallery is inserted after #subject_detail', async () => {
    document.documentElement.innerHTML = DOM_WITH_VNDB;
    mockFetch([]);
    loadComponent();
    const detail = document.getElementById('subject_detail');
    const gallery = document.getElementById('vndb-screenshot-gallery');
    expect(detail.nextSibling).toBe(gallery);
  });

  test('fetch is called with correct VNDB ID and fields', async () => {
    document.documentElement.innerHTML = DOM_WITH_VNDB;
    mockFetch([]);
    loadComponent();
    await flushPromises();
    expect(fetch).toHaveBeenCalledWith(
      'https://api.vndb.org/kana/vn',
      expect.objectContaining({ method: 'POST' })
    );
    const body = JSON.parse(fetch.mock.calls[0][1].body);
    expect(body.filters).toEqual(['id', '=', 'v26307']);
    expect(body.fields).toContain('screenshots');
  });
});
```

- [ ] **Step 2: Run tests — confirm they fail**

```bash
npm test
```

Expected: `page guard` tests fail with `null` not matching, fetch not called, etc.

- [ ] **Step 3: Implement `extractVndbId`, `createGalleryShell`, `showLoading`, `fetchScreenshots`, and the full `init` guard**

Replace `vndb-screenshots.js` with:

```js
/* @match https://bgm.tv/subject/* */
/* @match https://bangumi.tv/subject/* */
/* @match https://chii.in/subject/* */

(function () {

  function extractVndbId(href) {
    var m = (href || '').match(/vndb\.org\/(v\d+)/);
    return m ? m[1] : null;
  }

  function fetchScreenshots(vndbId) {
    return fetch('https://api.vndb.org/kana/vn', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        filters: ['id', '=', vndbId],
        fields: 'id,screenshots{id,url,dims,sexual,violence,thumbnail,thumbnail_dims}'
      })
    }).then(function (r) {
      if (!r.ok) throw new Error('HTTP ' + r.status);
      return r.json();
    }).then(function (data) {
      var vn = data.results && data.results[0];
      return (vn && vn.screenshots) ? vn.screenshots : [];
    });
  }

  function createGalleryShell() {
    var gallery = document.createElement('div');
    gallery.id = 'vndb-screenshot-gallery';

    var heading = document.createElement('h2');
    heading.className = 'subtitle';
    heading.innerHTML = '游戏截图 <small class="grey">via VNDB</small>';

    var toggle = document.createElement('button');
    toggle.id = 'vndb-nsfw-toggle';
    toggle.className = 'btnGray';
    toggle.textContent = '显示 R18';
    heading.appendChild(toggle);

    var grid = document.createElement('div');
    grid.id = 'vndb-grid';

    gallery.appendChild(heading);
    gallery.appendChild(grid);
    return gallery;
  }

  function showLoading(grid) {
    grid.innerHTML = '<p class="vndb-status">正在加载截图…</p>';
  }

  function showError(grid, vndbUrl) {
    grid.innerHTML = '<p class="vndb-status vndb-error">截图加载失败，<a href="' + vndbUrl + '" target="_blank" rel="noopener noreferrer">在 VNDB 查看</a></p>';
  }

  function showEmpty(grid) {
    grid.innerHTML = '<p class="vndb-status">VNDB 暂无截图</p>';
  }

  function init() {
    if (!/^\/subject\/\d+$/.test(location.pathname)) return;

    var vndbAnchor = document.querySelector('#infobox a[href*="vndb.org/v"]');
    if (!vndbAnchor) return;

    var vndbId = extractVndbId(vndbAnchor.href);
    if (!vndbId) return;

    var subjectDetail = document.getElementById('subject_detail');
    if (!subjectDetail) return;

    var gallery = createGalleryShell();
    subjectDetail.parentNode.insertBefore(gallery, subjectDetail.nextSibling);

    var grid = document.getElementById('vndb-grid');
    showLoading(grid);

    fetchScreenshots(vndbId).then(function (screenshots) {
      if (!screenshots.length) {
        showEmpty(grid);
        return;
      }
    }).catch(function () {
      showError(grid, vndbAnchor.href);
    });
  }

  init();
})();
```

- [ ] **Step 4: Run tests — confirm they pass**

```bash
npm test
```

Expected:
```
PASS __tests__/integration.test.js
  ✓ smoke: component file loads without throwing
  page guard
    ✓ does nothing on non-subject URL
    ✓ does nothing when no VNDB link in #infobox
    ✓ inserts gallery shell immediately when subject has VNDB link
    ✓ gallery is inserted after #subject_detail
    ✓ fetch is called with correct VNDB ID and fields
Tests: 6 passed, 6 total
```

- [ ] **Step 5: Commit**

```bash
git add vndb-screenshots.js __tests__/integration.test.js
git commit -m "feat: page guard, VNDB link detection, API call skeleton"
```

---

## Task 3: Loading, Error & Empty States

**Files:**
- Modify: `__tests__/integration.test.js`

(No new implementation needed — `showLoading`, `showError`, `showEmpty` already exist from Task 2.)

- [ ] **Step 1: Write the failing tests**

Append to `__tests__/integration.test.js`:

```js
describe('status states', () => {
  test('shows loading placeholder immediately after insertion', () => {
    document.documentElement.innerHTML = DOM_WITH_VNDB;
    mockFetch([]);
    loadComponent();
    expect(document.querySelector('.vndb-status').textContent).toContain('正在加载');
  });

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
});
```

- [ ] **Step 2: Run tests — confirm they pass immediately (no new code needed)**

```bash
npm test
```

Expected:
```
Tests: 9 passed, 9 total
```

- [ ] **Step 3: Commit**

```bash
git add __tests__/integration.test.js
git commit -m "test: loading, error, empty state coverage"
```

---

## Task 4: Screenshot Rendering

**Files:**
- Modify: `vndb-screenshots.js`
- Modify: `__tests__/integration.test.js`

- [ ] **Step 1: Write the failing tests**

Append to `__tests__/integration.test.js`:

```js
describe('screenshot rendering', () => {
  test('renders one thumbnail per screenshot', async () => {
    document.documentElement.innerHTML = DOM_WITH_VNDB;
    mockFetch([SFW_SHOT, NSFW_SHOT]);
    loadComponent();
    await flushPromises();
    expect(document.querySelectorAll('.vndb-thumb').length).toBe(2);
  });

  test('SFW thumbnail has correct src and no nsfw class', async () => {
    document.documentElement.innerHTML = DOM_WITH_VNDB;
    mockFetch([SFW_SHOT]);
    loadComponent();
    await flushPromises();
    const thumb = document.querySelector('.vndb-thumb');
    expect(thumb.classList.contains('vndb-nsfw')).toBe(false);
    expect(thumb.querySelector('img').src).toBe(SFW_SHOT.thumbnail);
  });

  test('NSFW thumbnail gets vndb-nsfw class and mask element', async () => {
    document.documentElement.innerHTML = DOM_WITH_VNDB;
    mockFetch([NSFW_SHOT]);
    loadComponent();
    await flushPromises();
    const thumb = document.querySelector('.vndb-thumb');
    expect(thumb.classList.contains('vndb-nsfw')).toBe(true);
    expect(thumb.querySelector('.vndb-mask')).not.toBeNull();
    expect(thumb.querySelector('.vndb-mask').textContent).toBe('R18');
  });

  test('violence >= 2 is also treated as NSFW', async () => {
    document.documentElement.innerHTML = DOM_WITH_VNDB;
    const violentShot = { ...SFW_SHOT, id: 'sf3', sexual: 0, violence: 2 };
    mockFetch([violentShot]);
    loadComponent();
    await flushPromises();
    expect(document.querySelector('.vndb-thumb').classList.contains('vndb-nsfw')).toBe(true);
  });

  test('style element is injected into <head>', async () => {
    document.documentElement.innerHTML = DOM_WITH_VNDB;
    mockFetch([]);
    loadComponent();
    expect(document.getElementById('vndb-styles')).not.toBeNull();
  });
});
```

- [ ] **Step 2: Run tests — confirm they fail**

```bash
npm test
```

Expected: `screenshot rendering` tests fail — `.vndb-thumb` elements not found.

- [ ] **Step 3: Implement `isNsfw`, `renderScreenshots`, and `injectStyles`; wire into `init`**

In `vndb-screenshots.js`, add these functions after `showEmpty` and before `init`:

```js
  function isNsfw(screenshot) {
    return screenshot.sexual >= 2 || screenshot.violence >= 2;
  }

  function injectStyles() {
    if (document.getElementById('vndb-styles')) return;
    var style = document.createElement('style');
    style.id = 'vndb-styles';
    style.textContent = [
      '#vndb-screenshot-gallery { margin-top: 16px; }',
      '#vndb-screenshot-gallery .subtitle { display: flex; align-items: center; gap: 8px; margin-bottom: 8px; }',
      '#vndb-nsfw-toggle { margin-left: auto; font-size: 12px; padding: 2px 8px; cursor: pointer; border-radius: 3px; }',
      '#vndb-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 6px; }',
      '.vndb-thumb { position: relative; height: 120px; overflow: hidden; cursor: pointer; border-radius: 3px; background: #f0f0f0; }',
      '.vndb-thumb img { width: 100%; height: 100%; object-fit: cover; display: block; }',
      '.vndb-mask { position: absolute; inset: 0; backdrop-filter: blur(12px); -webkit-backdrop-filter: blur(12px); background: rgba(0,0,0,0.3); display: flex; align-items: center; justify-content: center; color: #fff; font-size: 13px; font-weight: bold; letter-spacing: 1px; }',
      '#vndb-grid.show-nsfw .vndb-mask { display: none; }',
      '.vndb-status { color: #999; font-size: 13px; padding: 8px 0; }',
      '.vndb-error { color: #c00; }',
      '#vndb-lightbox { position: fixed; inset: 0; z-index: 9999; display: flex; align-items: center; justify-content: center; }',
      '#vndb-lb-backdrop { position: absolute; inset: 0; background: rgba(0,0,0,0.88); }',
      '#vndb-lb-content { position: relative; z-index: 1; display: flex; align-items: center; justify-content: center; min-width: 100px; min-height: 60px; }',
      '#vndb-lb-img { max-width: 90vw; max-height: 85vh; object-fit: contain; display: none; }',
      '#vndb-lb-loading { color: #ccc; font-size: 14px; }',
      '#vndb-lb-close, #vndb-lb-prev, #vndb-lb-next { position: fixed; z-index: 2; background: rgba(255,255,255,0.15); border: none; color: #fff; cursor: pointer; border-radius: 50%; width: 40px; height: 40px; font-size: 18px; display: flex; align-items: center; justify-content: center; line-height: 1; transition: background 0.15s; }',
      '#vndb-lb-close:hover, #vndb-lb-prev:hover, #vndb-lb-next:hover { background: rgba(255,255,255,0.3); }',
      '#vndb-lb-close { top: 16px; right: 16px; }',
      '#vndb-lb-prev { top: 50%; left: 16px; transform: translateY(-50%); }',
      '#vndb-lb-next { top: 50%; right: 16px; transform: translateY(-50%); }',
      '#vndb-lb-counter { position: fixed; bottom: 16px; left: 50%; transform: translateX(-50%); color: #ccc; font-size: 13px; z-index: 2; white-space: nowrap; }'
    ].join('\n');
    document.head.appendChild(style);
  }

  function renderScreenshots(screenshots) {
    var grid = document.getElementById('vndb-grid');
    grid.innerHTML = '';
    screenshots.forEach(function (s, i) {
      var thumb = document.createElement('div');
      thumb.className = 'vndb-thumb' + (isNsfw(s) ? ' vndb-nsfw' : '');
      thumb.dataset.idx = String(i);

      var img = document.createElement('img');
      img.src = s.thumbnail;
      img.loading = 'lazy';
      thumb.appendChild(img);

      if (isNsfw(s)) {
        var mask = document.createElement('div');
        mask.className = 'vndb-mask';
        mask.textContent = 'R18';
        thumb.appendChild(mask);
      }
      grid.appendChild(thumb);
    });
  }
```

In `init()`, update the `.then` handler to call `renderScreenshots` and `injectStyles`:

```js
    injectStyles();

    /* ... (existing: gallery insertion + showLoading) ... */

    fetchScreenshots(vndbId).then(function (screenshots) {
      if (!screenshots.length) {
        showEmpty(grid);
        return;
      }
      renderScreenshots(screenshots);
    }).catch(function () {
      showError(grid, vndbAnchor.href);
    });
```

Move `injectStyles()` call to just before the gallery insertion (before `createGalleryShell()`).

The full updated `init` function:

```js
  function init() {
    if (!/^\/subject\/\d+$/.test(location.pathname)) return;

    var vndbAnchor = document.querySelector('#infobox a[href*="vndb.org/v"]');
    if (!vndbAnchor) return;

    var vndbId = extractVndbId(vndbAnchor.href);
    if (!vndbId) return;

    var subjectDetail = document.getElementById('subject_detail');
    if (!subjectDetail) return;

    injectStyles();

    var gallery = createGalleryShell();
    subjectDetail.parentNode.insertBefore(gallery, subjectDetail.nextSibling);

    var grid = document.getElementById('vndb-grid');
    showLoading(grid);

    fetchScreenshots(vndbId).then(function (screenshots) {
      if (!screenshots.length) {
        showEmpty(grid);
        return;
      }
      renderScreenshots(screenshots);
    }).catch(function () {
      showError(grid, vndbAnchor.href);
    });
  }
```

- [ ] **Step 4: Run tests — confirm they pass**

```bash
npm test
```

Expected:
```
Tests: 14 passed, 14 total
```

- [ ] **Step 5: Commit**

```bash
git add vndb-screenshots.js __tests__/integration.test.js
git commit -m "feat: screenshot rendering with NSFW detection and CSS injection"
```

---

## Task 5: NSFW Toggle

**Files:**
- Modify: `vndb-screenshots.js`
- Modify: `__tests__/integration.test.js`

- [ ] **Step 1: Write the failing tests**

Append to `__tests__/integration.test.js`:

```js
describe('NSFW toggle', () => {
  async function setupWithScreenshots() {
    document.documentElement.innerHTML = DOM_WITH_VNDB;
    mockFetch([SFW_SHOT, NSFW_SHOT]);
    loadComponent();
    await flushPromises();
  }

  test('button initially reads "显示 R18"', async () => {
    await setupWithScreenshots();
    expect(document.getElementById('vndb-nsfw-toggle').textContent).toBe('显示 R18');
  });

  test('grid does not have show-nsfw class by default', async () => {
    await setupWithScreenshots();
    expect(document.getElementById('vndb-grid').classList.contains('show-nsfw')).toBe(false);
  });

  test('clicking toggle adds show-nsfw to grid and changes button text', async () => {
    await setupWithScreenshots();
    document.getElementById('vndb-nsfw-toggle').click();
    expect(document.getElementById('vndb-grid').classList.contains('show-nsfw')).toBe(true);
    expect(document.getElementById('vndb-nsfw-toggle').textContent).toBe('隐藏 R18');
  });

  test('clicking toggle again removes show-nsfw', async () => {
    await setupWithScreenshots();
    const btn = document.getElementById('vndb-nsfw-toggle');
    btn.click();
    btn.click();
    expect(document.getElementById('vndb-grid').classList.contains('show-nsfw')).toBe(false);
  });

  test('toggle state is persisted to localStorage', async () => {
    await setupWithScreenshots();
    document.getElementById('vndb-nsfw-toggle').click();
    expect(localStorage.getItem('vndb_show_nsfw')).toBe('1');
    document.getElementById('vndb-nsfw-toggle').click();
    expect(localStorage.getItem('vndb_show_nsfw')).toBe('0');
  });

  test('component reads localStorage on load and applies saved state', async () => {
    localStorage.setItem('vndb_show_nsfw', '1');
    await setupWithScreenshots();
    expect(document.getElementById('vndb-grid').classList.contains('show-nsfw')).toBe(true);
    expect(document.getElementById('vndb-nsfw-toggle').textContent).toBe('隐藏 R18');
  });
});
```

- [ ] **Step 2: Run tests — confirm they fail**

```bash
npm test
```

Expected: `NSFW toggle` tests fail — toggle does nothing yet.

- [ ] **Step 3: Implement `initNsfwToggle` and wire into `init`**

Add after `renderScreenshots` in `vndb-screenshots.js`:

```js
  function initNsfwToggle() {
    var grid = document.getElementById('vndb-grid');
    var btn  = document.getElementById('vndb-nsfw-toggle');
    var showNsfw = localStorage.getItem('vndb_show_nsfw') === '1';

    function applyState() {
      if (showNsfw) {
        grid.classList.add('show-nsfw');
        btn.textContent = '隐藏 R18';
      } else {
        grid.classList.remove('show-nsfw');
        btn.textContent = '显示 R18';
      }
    }

    applyState();
    btn.addEventListener('click', function () {
      showNsfw = !showNsfw;
      localStorage.setItem('vndb_show_nsfw', showNsfw ? '1' : '0');
      applyState();
    });
  }
```

In `init()`, call `initNsfwToggle()` after `renderScreenshots(screenshots)`:

```js
      renderScreenshots(screenshots);
      initNsfwToggle();
```

- [ ] **Step 4: Run tests**

```bash
npm test
```

Expected:
```
Tests: 20 passed, 20 total
```

- [ ] **Step 5: Commit**

```bash
git add vndb-screenshots.js __tests__/integration.test.js
git commit -m "feat: NSFW toggle with localStorage persistence"
```

---

## Task 6: Lightbox

**Files:**
- Modify: `vndb-screenshots.js`
- Modify: `__tests__/integration.test.js`

- [ ] **Step 1: Write the failing tests**

Append to `__tests__/integration.test.js`:

```js
describe('lightbox', () => {
  async function setupWithScreenshots(screenshots) {
    document.documentElement.innerHTML = DOM_WITH_VNDB;
    mockFetch(screenshots || [SFW_SHOT, NSFW_SHOT]);
    loadComponent();
    await flushPromises();
  }

  function clickThumb(idx) {
    document.querySelectorAll('.vndb-thumb')[idx].click();
  }

  test('lightbox element is appended to body', async () => {
    await setupWithScreenshots();
    expect(document.getElementById('vndb-lightbox')).not.toBeNull();
  });

  test('lightbox is hidden by default', async () => {
    await setupWithScreenshots();
    expect(document.getElementById('vndb-lightbox').style.display).toBe('none');
  });

  test('clicking SFW thumbnail opens lightbox with full-size URL', async () => {
    await setupWithScreenshots([SFW_SHOT]);
    clickThumb(0);
    const lb = document.getElementById('vndb-lightbox');
    expect(lb.style.display).not.toBe('none');
    expect(document.getElementById('vndb-lb-img').src).toBe(SFW_SHOT.url);
  });

  test('clicking NSFW thumbnail when toggle is off does not open lightbox', async () => {
    await setupWithScreenshots([NSFW_SHOT]);
    clickThumb(0);
    expect(document.getElementById('vndb-lightbox').style.display).toBe('none');
  });

  test('clicking NSFW thumbnail when toggle is on opens lightbox', async () => {
    await setupWithScreenshots([NSFW_SHOT]);
    document.getElementById('vndb-nsfw-toggle').click();
    clickThumb(0);
    expect(document.getElementById('vndb-lightbox').style.display).not.toBe('none');
  });

  test('clicking backdrop closes lightbox', async () => {
    await setupWithScreenshots([SFW_SHOT]);
    clickThumb(0);
    document.getElementById('vndb-lb-backdrop').click();
    expect(document.getElementById('vndb-lightbox').style.display).toBe('none');
  });

  test('clicking close button closes lightbox', async () => {
    await setupWithScreenshots([SFW_SHOT]);
    clickThumb(0);
    document.getElementById('vndb-lb-close').click();
    expect(document.getElementById('vndb-lightbox').style.display).toBe('none');
  });

  test('ESC key closes lightbox', async () => {
    await setupWithScreenshots([SFW_SHOT]);
    clickThumb(0);
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    expect(document.getElementById('vndb-lightbox').style.display).toBe('none');
  });

  test('counter shows correct position', async () => {
    await setupWithScreenshots([SFW_SHOT, { ...SFW_SHOT, id: 'sf3' }]);
    clickThumb(0);
    expect(document.getElementById('vndb-lb-counter').textContent).toBe('1 / 2');
  });

  test('ArrowRight navigates to next screenshot', async () => {
    const shot2 = { ...SFW_SHOT, id: 'sf3', url: 'https://s.vndb.org/sf/03/full.jpg', thumbnail: 'https://s.vndb.org/sf/03/th.jpg' };
    await setupWithScreenshots([SFW_SHOT, shot2]);
    clickThumb(0);
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
    expect(document.getElementById('vndb-lb-img').src).toBe(shot2.url);
    expect(document.getElementById('vndb-lb-counter').textContent).toBe('2 / 2');
  });

  test('ArrowLeft navigates to previous screenshot', async () => {
    const shot2 = { ...SFW_SHOT, id: 'sf3', url: 'https://s.vndb.org/sf/03/full.jpg', thumbnail: 'https://s.vndb.org/sf/03/th.jpg' };
    await setupWithScreenshots([SFW_SHOT, shot2]);
    clickThumb(1);
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true }));
    expect(document.getElementById('vndb-lb-img').src).toBe(SFW_SHOT.url);
  });

  test('navigation wraps from last to first', async () => {
    const shot2 = { ...SFW_SHOT, id: 'sf3', url: 'https://s.vndb.org/sf/03/full.jpg', thumbnail: 'https://s.vndb.org/sf/03/th.jpg' };
    await setupWithScreenshots([SFW_SHOT, shot2]);
    clickThumb(1);
    document.getElementById('vndb-lb-next').click();
    expect(document.getElementById('vndb-lb-img').src).toBe(SFW_SHOT.url);
  });

  test('NSFW images excluded from navigation when toggle is off', async () => {
    await setupWithScreenshots([SFW_SHOT, NSFW_SHOT]);
    clickThumb(0);
    document.getElementById('vndb-lb-next').click();
    expect(document.getElementById('vndb-lb-counter').textContent).toBe('1 / 1');
  });
});
```

- [ ] **Step 2: Run tests — confirm they fail**

```bash
npm test
```

Expected: all `lightbox` tests fail — no lightbox element yet.

- [ ] **Step 3: Implement `getVisibleScreenshots` and `initLightbox`**

Add after `initNsfwToggle` in `vndb-screenshots.js`:

```js
  function getVisibleScreenshots(screenshots) {
    var showNsfw = localStorage.getItem('vndb_show_nsfw') === '1';
    if (showNsfw) return screenshots.slice();
    return screenshots.filter(function (s) { return !isNsfw(s); });
  }

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
    var visibleList = [];
    var lbOpen = false;

    function showImage(screenshot) {
      var img      = document.getElementById('vndb-lb-img');
      var loading  = document.getElementById('vndb-lb-loading');
      var counter  = document.getElementById('vndb-lb-counter');
      img.style.display = 'none';
      loading.style.display = 'block';
      counter.textContent = (currentIdx + 1) + ' / ' + visibleList.length;
      img.onload = function () {
        loading.style.display = 'none';
        img.style.display = 'block';
      };
      img.src = screenshot.url;
    }

    function open(visibleIdx) {
      visibleList = getVisibleScreenshots(screenshots);
      currentIdx  = visibleIdx;
      lbOpen      = true;
      lb.style.display = 'flex';
      showImage(visibleList[currentIdx]);
    }

    function close() {
      lbOpen = false;
      lb.style.display = 'none';
    }

    function navigate(delta) {
      visibleList = getVisibleScreenshots(screenshots);
      if (!visibleList.length) return;
      currentIdx = (currentIdx + delta + visibleList.length) % visibleList.length;
      showImage(visibleList[currentIdx]);
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
      visibleList = getVisibleScreenshots(screenshots);

      var visibleIdx = 0;
      var count = 0;
      for (var i = 0; i < screenshots.length; i++) {
        if (isNsfw(screenshots[i]) && !showNsfw) continue;
        if (i === rawIdx) { visibleIdx = count; break; }
        count++;
      }
      open(visibleIdx);
    });
  }
```

In `init()`, call `initLightbox(screenshots)` after `initNsfwToggle()`:

```js
      renderScreenshots(screenshots);
      initNsfwToggle();
      initLightbox(screenshots);
```

- [ ] **Step 4: Run tests**

```bash
npm test
```

Expected:
```
Tests: 34 passed, 34 total
```

- [ ] **Step 5: Commit**

```bash
git add vndb-screenshots.js __tests__/integration.test.js
git commit -m "feat: lightbox with keyboard navigation and NSFW-aware image list"
```

---

## Task 7: Final Assembly & Submission Preparation

**Files:**
- Modify: `vndb-screenshots.js` (comment syntax cleanup)

The component is already functionally complete. This task converts the file for Bangumi submission (replace `//` comments with `/* */`) and does a final manual smoke test against the sample page.

- [ ] **Step 1: Audit the file for `//` comments**

```bash
grep -n '//' vndb-screenshots.js
```

Replace any found `//` comment with `/* ... */` style. Example:
```js
/* Before: */ // this is a comment
/* After:  */ /* this is a comment */
```

- [ ] **Step 2: Verify the full test suite still passes after cleanup**

```bash
npm test
```

Expected:
```
Tests: 34 passed, 34 total
```

- [ ] **Step 3: Open the sample page in a browser and verify**

Open `/mnt1/projects/bangumi_screenshot/sample/アマカノ2 _ Bangumi 番组計画.html` in a browser. Paste the entire contents of `vndb-screenshots.js` into the browser DevTools console and press Enter.

Verify:
- [ ] Gallery section appears below the description/tags area
- [ ] "正在加载截图…" text shows briefly (or fetch may fail cross-origin from file:// — that's normal)
- [ ] Gallery heading reads "游戏截图 via VNDB"
- [ ] "显示 R18" button is present

For full end-to-end API verification, the component must be installed on the actual Bangumi site via the dev platform.

- [ ] **Step 4: Final commit**

```bash
git add vndb-screenshots.js
git commit -m "chore: convert comments to /* */ for Bangumi eval compatibility"
```

---

## Self-Review

**Spec coverage check:**

| Spec requirement | Covered by task |
|---|---|
| @match directives for bgm.tv / bangumi.tv / chii.in | Task 2 (skeleton) |
| Extract VNDB ID from `#infobox a[href*="vndb.org/v"]` | Task 2 |
| POST VNDB API with correct fields | Task 2 |
| Show loading / error / empty states | Task 3 |
| Render SFW thumbnails | Task 4 |
| Render NSFW thumbnails with blur mask | Task 4 |
| `violence >= 2` also counts as NSFW | Task 4 |
| Inject CSS via `<style id="vndb-styles">` | Task 4 |
| NSFW toggle button (show/hide R18) | Task 5 |
| localStorage persistence of toggle state | Task 5 |
| Read localStorage on component load | Task 5 |
| Lightbox opens on thumbnail click | Task 6 |
| NSFW thumbnail blocked when toggle off | Task 6 |
| ESC / backdrop / ✕ close lightbox | Task 6 |
| Arrow key + button navigation | Task 6 |
| Navigation wraps around | Task 6 |
| Counter shows `N / total` | Task 6 |
| NSFW images excluded from navigation when toggle off | Task 6 |
| `/* */` only comments for Bangumi eval | Task 7 |
| Gallery inserted after `#subject_detail` | Task 2 |

All spec requirements covered. No placeholders.
