const fs   = require('fs');
const path = require('path');

const COMPONENT = path.resolve(__dirname, '..', 'bangumi-game-gallery.js');

const DOM_WITH_VNDB = `<head></head><body>
  <ul id="infobox">
    <li class="sub_group">
      <span class="tip">链接: </span>
      <a href="https://vndb.org/v26307">VNDB</a>
    </li>
  </ul>
  <div id="columnSubjectHomeB">
    <div id="columnSubjectInHomeB">
      <div id="subject_detail"></div>
    </div>
  </div>
</body>`;

const DOM_NO_VNDB = `<head></head><body>
  <ul id="infobox">
    <li><span class="tip">开发: </span>SomeStudio</li>
  </ul>
  <div id="columnSubjectHomeB">
    <div id="columnSubjectInHomeB">
      <div id="subject_detail"></div>
    </div>
  </div>
</body>`;

const SFW_SHOT  = { id: 'sf1', url: 'https://s.vndb.org/sf/01/full.jpg', dims: [1280,720], sexual: 0, violence: 0, thumbnail: 'https://s.vndb.org/sf/01/th.jpg', thumbnail_dims: [320,180] };
const NSFW_SHOT = { id: 'sf2', url: 'https://s.vndb.org/sf/02/full.jpg', dims: [1280,720], sexual: 2, violence: 0, thumbnail: 'https://s.vndb.org/sf/02/th.jpg', thumbnail_dims: [320,180] };

const DLSITE_RJ_URL = 'https://www.dlsite.com/maniax/work/=/product_id/RJ305720.html';
const DLSITE_VJ_URL = 'https://www.dlsite.com/maniax/work/=/product_id/VJ010793.html';
const STEAM_URL = 'https://store.steampowered.com/app/620/Portal_2/';
const STEAM_SHOT = {
  thumbnail: 'https://shared.akamai.steamstatic.com/store_item_assets/steam/apps/620/ss_test.600x338.jpg',
  full: 'https://shared.akamai.steamstatic.com/store_item_assets/steam/apps/620/ss_test.1920x1080.jpg'
};

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

const DOM_WITH_STEAM_ONLY = `<head></head><body>
  <ul id="infobox">
    <li class="sub_group">
      <span class="tip">链接: </span>
      <a href="${STEAM_URL}">Steam</a>
    </li>
  </ul>
  <div id="columnSubjectHomeB">
    <div id="columnSubjectInHomeB">
      <div id="subject_detail"></div>
    </div>
  </div>
</body>`;

const DOM_WITH_ALL = `<head></head><body>
  <ul id="infobox">
    <li><a href="https://vndb.org/v26307">VNDB</a></li>
    <li><a href="${DLSITE_RJ_URL}">DLsite</a></li>
    <li><a href="${STEAM_URL}">Steam</a></li>
  </ul>
  <div id="columnSubjectHomeB">
    <div id="columnSubjectInHomeB">
      <div id="subject_detail"></div>
    </div>
  </div>
</body>`;

const DOM_WITH_VNDB_AND_STEAM = `<head></head><body>
  <ul id="infobox">
    <li><a href="https://vndb.org/v26307">VNDB</a></li>
    <li><a href="${STEAM_URL}">Steam</a></li>
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

function mockFetch(screenshots) {
  global.fetch = jest.fn().mockResolvedValue({
    ok: true,
    json: () => Promise.resolve({ results: [{ id: 'v26307', screenshots }] })
  });
}

function mockFetchError() {
  global.fetch = jest.fn().mockResolvedValue({ ok: false, status: 500 });
}

function mockFetchSources(vndbScreenshots, steamScreenshots, steamOk = true) {
  global.fetch = jest.fn().mockImplementation((url) => {
    if (typeof url === 'string' && url.includes('bangumi-steam-gallery.ry.mk')) {
      return Promise.resolve({
        ok: steamOk,
        status: steamOk ? 200 : 502,
        json: () => Promise.resolve({ appId: 620, screenshots: steamScreenshots || [] })
      });
    }
    return Promise.resolve({
      ok: true,
      json: () => Promise.resolve({ results: [{ id: 'v26307', screenshots: vndbScreenshots || [] }] })
    });
  });
}

function flushPromises() {
  return new Promise(resolve => setTimeout(resolve, 0));
}

async function flushMicrotasks() {
  for (let i = 0; i < 8; i++) await Promise.resolve();
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
  global.Image = OriginalImage;
  document.documentElement.innerHTML = '';
});

test('smoke: component file loads without throwing', () => {
  document.documentElement.innerHTML = DOM_NO_VNDB;
  expect(() => loadComponent()).not.toThrow();
});

describe('page guard', () => {
  test('does nothing on non-subject URL', () => {
    document.documentElement.innerHTML = DOM_WITH_VNDB;
    window.location.pathname = '/game/browser';
    loadComponent();
    expect(document.getElementById('vndb-screenshot-gallery')).toBeNull();
  });

  test('does nothing when no VNDB or DLsite link in #infobox', () => {
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

  test('gallery is inserted after #columnSubjectInHomeB', async () => {
    document.documentElement.innerHTML = DOM_WITH_VNDB;
    mockFetch([]);
    loadComponent();
    const columnInHomeB = document.getElementById('columnSubjectInHomeB');
    const gallery = document.getElementById('vndb-screenshot-gallery');
    expect(columnInHomeB.nextSibling).toBe(gallery.parentNode);
    expect(gallery.parentNode.className).toBe('subject_section clearit');
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

describe('status states', () => {
  test('shows skeleton placeholders immediately after insertion', () => {
    document.documentElement.innerHTML = DOM_WITH_VNDB;
    mockFetch([]);
    loadComponent();
    const grid = document.getElementById('vndb-grid');
    expect(grid.querySelectorAll('.vndb-skeleton').length).toBeGreaterThan(0);
    expect(grid.getAttribute('aria-busy')).toBe('true');
  });

  test('replaces skeletons with thumbs once screenshots load', async () => {
    document.documentElement.innerHTML = DOM_WITH_VNDB;
    mockFetch([SFW_SHOT]);
    loadComponent();
    await flushPromises();
    const grid = document.getElementById('vndb-grid');
    expect(grid.querySelectorAll('.vndb-skeleton').length).toBe(0);
    expect(grid.querySelectorAll('.vndb-thumb').length).toBe(1);
    expect(grid.hasAttribute('aria-busy')).toBe(false);
    expect(document.querySelector('.vndb-tag-skeleton')).toBeNull();
  });

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
});

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

describe('NSFW toggle', () => {
  async function setupWithScreenshots() {
    document.documentElement.innerHTML = DOM_WITH_VNDB;
    mockFetch([SFW_SHOT, NSFW_SHOT]);
    loadComponent();
    await flushPromises();
  }

  test('toggle is unchecked by default', async () => {
    await setupWithScreenshots();
    expect(document.getElementById('vndb-nsfw-toggle').checked).toBe(false);
  });

  test('grid does not have show-nsfw class by default', async () => {
    await setupWithScreenshots();
    expect(document.getElementById('vndb-grid').classList.contains('show-nsfw')).toBe(false);
  });

  test('clicking toggle adds show-nsfw to grid and checks the input', async () => {
    await setupWithScreenshots();
    document.getElementById('vndb-nsfw-toggle').click();
    expect(document.getElementById('vndb-grid').classList.contains('show-nsfw')).toBe(true);
    expect(document.getElementById('vndb-nsfw-toggle').checked).toBe(true);
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
    expect(document.getElementById('vndb-nsfw-toggle').checked).toBe(true);
  });
});

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

describe('Steam source', () => {
  afterEach(() => {
    delete global.chiiApp;
    delete global.chiiLib;
  });

  async function setupSteamOnly(screenshots = [STEAM_SHOT], ok = true) {
    document.documentElement.innerHTML = DOM_WITH_STEAM_ONLY;
    mockFetchSources([], screenshots, ok);
    loadComponent();
    await flushPromises();
  }

  test('recognizes a Steam store link and inserts the gallery', () => {
    document.documentElement.innerHTML = DOM_WITH_STEAM_ONLY;
    mockFetchSources([], []);
    loadComponent();
    expect(document.getElementById('vndb-screenshot-gallery')).not.toBeNull();
  });

  test('recognizes Steam agecheck links', () => {
    document.documentElement.innerHTML = DOM_WITH_STEAM_ONLY.replace(
      STEAM_URL,
      'https://store.steampowered.com/agecheck/app/620/'
    );
    mockFetchSources([], [STEAM_SHOT]);
    loadComponent();
    expect(document.getElementById('vndb-screenshot-gallery')).not.toBeNull();
  });

  test('requests the configured Worker endpoint with the Steam App ID', async () => {
    await setupSteamOnly();
    expect(fetch).toHaveBeenCalledWith(
      'https://bangumi-steam-gallery.ry.mk/v1/steam/apps/620/screenshots'
    );
  });

  test('renders Worker thumbnails in the Steam grid', async () => {
    await setupSteamOnly();
    const img = document.querySelector('#steam-grid .vndb-thumb img');
    expect(img.src).toBe(STEAM_SHOT.thumbnail);
    expect(document.querySelector('#steam-grid .vndb-mask')).toBeNull();
  });

  test('Steam-only gallery activates Steam and hides unavailable source tags', async () => {
    await setupSteamOnly();
    const gallery = document.getElementById('vndb-screenshot-gallery');
    expect(gallery.classList.contains('steam-active')).toBe(true);
    expect(document.getElementById('steam-source-tag').style.display).not.toBe('none');
    expect(document.getElementById('vndb-source-tag').style.display).toBe('none');
    expect(document.getElementById('dlsite-source-tag').style.display).toBe('none');
  });

  test('clicking a Steam thumbnail opens the full image in the lightbox', async () => {
    await setupSteamOnly();
    document.querySelector('#steam-grid .vndb-thumb').click();
    expect(document.getElementById('vndb-lightbox').style.display).not.toBe('none');
    expect(document.getElementById('vndb-lb-img').src).toBe(STEAM_SHOT.full);
  });

  test('removes the gallery when Steam is the only source and returns no screenshots', async () => {
    await setupSteamOnly([]);
    expect(document.getElementById('vndb-screenshot-gallery')).toBeNull();
  });

  test('keeps other sources when the Steam Worker fails', async () => {
    document.documentElement.innerHTML = DOM_WITH_ALL;
    mockFetchSources([SFW_SHOT], [], false);
    mockImageProbe(['error']);
    loadComponent();
    await flushPromises();
    expect(document.querySelectorAll('#vndb-grid .vndb-thumb').length).toBe(1);
    expect(document.getElementById('steam-source-tag').style.display).toBe('none');
  });

  test('switches among VNDB, DLsite and Steam tabs', async () => {
    document.documentElement.innerHTML = DOM_WITH_ALL;
    mockFetchSources([SFW_SHOT], [STEAM_SHOT]);
    mockImageProbe(['load', 'error']);
    loadComponent();
    await flushPromises();

    const gallery = document.getElementById('vndb-screenshot-gallery');
    expect(document.getElementById('steam-source-tag').classList.contains('vndb-tab')).toBe(true);
    document.getElementById('steam-source-tag').click();
    expect(gallery.classList.contains('steam-active')).toBe(true);
    expect(gallery.classList.contains('dlsite-active')).toBe(false);
    document.getElementById('vndb-source-tag').click();
    expect(gallery.classList.contains('steam-active')).toBe(false);
    expect(gallery.classList.contains('dlsite-active')).toBe(false);
  });

  test('honors Steam as the configured default source', async () => {
    global.chiiApp = {
      cloud_settings: {
        get: (key) => key === 'defaultSource' ? 'steam' : null,
        update: jest.fn(),
        save: jest.fn()
      }
    };
    document.documentElement.innerHTML = DOM_WITH_ALL;
    mockFetchSources([SFW_SHOT], [STEAM_SHOT]);
    mockImageProbe(['load', 'error']);
    loadComponent();
    await flushPromises();
    expect(document.getElementById('vndb-screenshot-gallery').classList.contains('steam-active')).toBe(true);
  });

});

describe('Getchu source', () => {
  const GETCHU_URL = 'http://www.getchu.com/soft.phtml?id=1076201';
  const GETCHU_BASE = 'https://bangumi-steam-gallery.ry.mk/v1/getchu/items/1076201/samples';
  const GETCHU_SHOT = { thumbnail: GETCHU_BASE + '/1_s.jpg', full: GETCHU_BASE + '/1.jpg' };
  const domWith = (links) => `<head></head><body>
    <ul id="infobox">${links.map((href) => `<li><a href="${href}">link</a></li>`).join('')}</ul>
    <div id="columnSubjectHomeB">
      <div id="columnSubjectInHomeB">
        <div id="subject_detail"></div>
      </div>
    </div>
  </body>`;

  function mockGetchuFetch(samples, ok = true, vndbScreenshots = []) {
    global.fetch = jest.fn().mockImplementation((url) => {
      if (url.includes('/v1/getchu/')) {
        return Promise.resolve({
          ok,
          status: ok ? 200 : 502,
          json: () => Promise.resolve({ id: 1076201, samples })
        });
      }
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ results: [{ id: 'v26307', screenshots: vndbScreenshots }] })
      });
    });
  }

  async function setupGetchuOnly(samples = [GETCHU_SHOT], ok = true, href = GETCHU_URL) {
    document.documentElement.innerHTML = domWith([href]);
    mockGetchuFetch(samples, ok);
    loadComponent();
    await flushPromises();
  }

  afterEach(() => {
    delete global.chiiApp;
  });

  test('requests the Worker samples endpoint for soft.phtml links', async () => {
    await setupGetchuOnly();
    expect(fetch).toHaveBeenCalledWith(GETCHU_BASE);
  });

  test('recognizes /item/{id}/ links', async () => {
    await setupGetchuOnly([GETCHU_SHOT], true, 'https://www.getchu.com/item/1076201/?gc=gc');
    expect(fetch).toHaveBeenCalledWith(GETCHU_BASE);
  });

  test('renders proxied thumbnails and activates the Getchu tab', async () => {
    await setupGetchuOnly();
    const gallery = document.getElementById('vndb-screenshot-gallery');
    expect(gallery.classList.contains('getchu-active')).toBe(true);
    expect(document.querySelector('#getchu-grid .vndb-thumb img').src).toBe(GETCHU_SHOT.thumbnail);
    expect(document.querySelector('#getchu-grid .vndb-mask')).toBeNull();
    expect(document.getElementById('getchu-source-tag').style.display).not.toBe('none');
  });

  test('clicking a Getchu thumbnail opens the full image in the lightbox', async () => {
    await setupGetchuOnly();
    document.querySelector('#getchu-grid .vndb-thumb').click();
    expect(document.getElementById('vndb-lb-img').src).toBe(GETCHU_SHOT.full);
  });

  test('removes the gallery when Getchu is the only source and has no samples', async () => {
    await setupGetchuOnly([]);
    expect(document.getElementById('vndb-screenshot-gallery')).toBeNull();
  });

  test('keeps VNDB when the Getchu Worker fails', async () => {
    document.documentElement.innerHTML = domWith(['https://vndb.org/v26307', GETCHU_URL]);
    mockGetchuFetch([], false, [SFW_SHOT]);
    loadComponent();
    await flushPromises();
    expect(document.querySelectorAll('#vndb-grid .vndb-thumb').length).toBe(1);
    expect(document.getElementById('getchu-source-tag').style.display).toBe('none');
  });

  test('getchu as default source is active when both VNDB and Getchu have images', async () => {
    global.chiiApp = { cloud_settings: { get: (k) => (k === 'defaultSource' ? 'getchu' : null), update() {}, save() {} } };
    document.documentElement.innerHTML = domWith(['https://vndb.org/v26307', GETCHU_URL]);
    mockGetchuFetch([GETCHU_SHOT], true, [SFW_SHOT]);
    loadComponent();
    await flushPromises();
    const gallery = document.getElementById('vndb-screenshot-gallery');
    expect(gallery.classList.contains('getchu-active')).toBe(true);
    expect(document.getElementById('getchu-source-tag').classList.contains('vndb-tab-active')).toBe(true);
  });

  test('blurs Getchu thumbs when the R18 blur setting is on and the toggle reveals them', async () => {
    global.chiiApp = { cloud_settings: { get: (k) => (k === 'dlsiteR18' ? '1' : null), update() {}, save() {} } };
    await setupGetchuOnly();
    expect(document.querySelector('#getchu-grid .vndb-mask')).not.toBeNull();
    document.getElementById('vndb-nsfw-toggle').click();
    expect(document.getElementById('getchu-grid').classList.contains('show-nsfw')).toBe(true);
  });
});

describe('source priority', () => {
  test('falls back in DLsite → Getchu → Steam → VNDB order and orders tags the same way', async () => {
    document.documentElement.innerHTML = DOM_WITH_VNDB_AND_STEAM;
    mockFetchSources([SFW_SHOT], [STEAM_SHOT]);
    loadComponent();
    await flushPromises();
    const gallery = document.getElementById('vndb-screenshot-gallery');
    expect(gallery.classList.contains('steam-active')).toBe(true);
    const tagOrder = Array.from(gallery.querySelectorAll('.subtitle small')).map((el) => el.id);
    expect(tagOrder).toEqual(['dlsite-source-tag', 'getchu-source-tag', 'steam-source-tag', 'vndb-source-tag']);
  });
});

describe('source order setting', () => {
  let store;

  function mockCloud(initial) {
    store = Object.assign({}, initial);
    global.chiiApp = {
      cloud_settings: {
        get: (key) => (store[key] !== undefined ? store[key] : null),
        update: (obj) => Object.assign(store, obj),
        save: jest.fn()
      }
    };
  }

  function openSettingsTab() {
    const addPanelTab = jest.fn();
    global.chiiLib = { ukagaka: { addPanelTab } };
    loadComponent();
    const panel = addPanelTab.mock.calls[0][0];
    const tab = document.createElement('div');
    tab.id = panel.tab + '-tab';
    tab.innerHTML = panel.customContent();
    document.body.appendChild(tab);
    panel.onInit('#' + tab.id);
    return tab;
  }

  const orderIn = (tab) =>
    Array.from(tab.querySelectorAll('.bgg-order-item')).map((li) => li.dataset.source);

  afterEach(() => {
    delete global.chiiApp;
    delete global.chiiLib;
  });

  test('settings tab lists sources in the default order with ends disabled', () => {
    mockCloud({});
    document.documentElement.innerHTML = DOM_NO_VNDB;
    const tab = openSettingsTab();
    expect(orderIn(tab)).toEqual(['dlsite', 'getchu', 'steam', 'vndb']);
    const items = tab.querySelectorAll('.bgg-order-item');
    expect(items[0].querySelector('[data-move="-1"]').disabled).toBe(true);
    expect(items[3].querySelector('[data-move="1"]').disabled).toBe(true);
  });

  test('moving a source saves the new order and re-renders the list', () => {
    mockCloud({});
    document.documentElement.innerHTML = DOM_NO_VNDB;
    const tab = openSettingsTab();
    tab.querySelector('[data-source="vndb"] [data-move="-1"]').click();
    expect(store.sourceOrder).toBe('dlsite,getchu,vndb,steam');
    expect(orderIn(tab)).toEqual(['dlsite', 'getchu', 'vndb', 'steam']);
    tab.querySelector('[data-source="dlsite"] [data-move="1"]').click();
    expect(store.sourceOrder).toBe('getchu,dlsite,vndb,steam');
  });

  test('R18 blur radio reflects and saves dlsiteR18', () => {
    mockCloud({ dlsiteR18: '1' });
    document.documentElement.innerHTML = DOM_NO_VNDB;
    const tab = openSettingsTab();
    expect(tab.querySelector('#dlsiteR18_1').checked).toBe(true);
    const off = tab.querySelector('#dlsiteR18_0');
    off.checked = true;
    off.dispatchEvent(new Event('change', { bubbles: true }));
    expect(store.dlsiteR18).toBe('0');
  });

  test('legacy defaultSource moves that source to the front', () => {
    mockCloud({ defaultSource: 'vndb' });
    document.documentElement.innerHTML = DOM_NO_VNDB;
    expect(orderIn(openSettingsTab())).toEqual(['vndb', 'dlsite', 'getchu', 'steam']);
  });

  test('saved order picks the active source and orders the tags', async () => {
    mockCloud({ sourceOrder: 'vndb,steam,getchu,dlsite' });
    document.documentElement.innerHTML = DOM_WITH_ALL;
    mockFetchSources([SFW_SHOT], [STEAM_SHOT]);
    mockImageProbe(['load', 'error']);
    loadComponent();
    await flushPromises();
    const gallery = document.getElementById('vndb-screenshot-gallery');
    expect(gallery.classList.contains('dlsite-active')).toBe(false);
    expect(gallery.classList.contains('steam-active')).toBe(false);
    expect(document.getElementById('vndb-source-tag').classList.contains('vndb-tab-active')).toBe(true);
    const tagOrder = Array.from(gallery.querySelectorAll('.subtitle small')).map((el) => el.id);
    expect(tagOrder).toEqual(['vndb-source-tag', 'steam-source-tag', 'getchu-source-tag', 'dlsite-source-tag']);
  });

  test('ignores unknown names in a saved order and appends missing sources', () => {
    mockCloud({ sourceOrder: 'steam,bogus,steam' });
    document.documentElement.innerHTML = DOM_NO_VNDB;
    expect(orderIn(openSettingsTab())).toEqual(['steam', 'dlsite', 'getchu', 'vndb']);
  });
});

describe('source timeouts', () => {
  test('a hanging Steam request does not permanently block VNDB', async () => {
    jest.useFakeTimers();
    try {
      document.documentElement.innerHTML = DOM_WITH_VNDB_AND_STEAM;
      global.fetch = jest.fn().mockImplementation((url) => {
        if (typeof url === 'string' && url.includes('bangumi-steam-gallery.ry.mk')) {
          return new Promise(() => {});
        }
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ results: [{ id: 'v26307', screenshots: [SFW_SHOT] }] })
        });
      });

      loadComponent();
      await flushMicrotasks();
      jest.advanceTimersByTime(10000);
      await flushMicrotasks();

      expect(document.querySelectorAll('#vndb-grid .vndb-thumb').length).toBe(1);
      expect(document.getElementById('steam-source-tag').style.display).toBe('none');
      expect(document.getElementById('vndb-lightbox')).not.toBeNull();
    } finally {
      jest.useRealTimers();
    }
  });

  test('a hanging DLsite image probe does not permanently block VNDB', async () => {
    jest.useFakeTimers();
    try {
      document.documentElement.innerHTML = DOM_WITH_BOTH;
      mockFetch([SFW_SHOT]);
      global.Image = function () {
        Object.defineProperty(this, 'src', { set() {} });
      };

      loadComponent();
      await flushMicrotasks();
      jest.advanceTimersByTime(4000);
      await flushMicrotasks();

      expect(document.querySelectorAll('#vndb-grid .vndb-thumb').length).toBe(1);
      expect(document.getElementById('dlsite-source-tag').style.display).toBe('none');
      expect(document.getElementById('vndb-lightbox')).not.toBeNull();
    } finally {
      jest.useRealTimers();
    }
  });
});

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

  test('probes correct main URL for 8-digit RJ id', () => {
    const rj8Url = 'https://www.dlsite.com/maniax/work/=/product_id/RJ01027690.html';
    document.documentElement.innerHTML = DOM_WITH_DLSITE_ONLY.replace(DLSITE_RJ_URL, rj8Url);
    mockFetch([]);
    mockImageProbe(['error']);
    loadComponent();
    expect(mockImageProbe.urls[0]).toBe(
      'https://img.dlsite.jp/modpub/images2/work/doujin/RJ01028000/RJ01027690_img_main.webp'
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
      'https://img.dlsite.jp/modpub/images2/work/doujin/RJ306000/RJ305720_img_smpa1.webp'
    );
  });

  test('stops after first failed smp', () => {
    document.documentElement.innerHTML = DOM_WITH_DLSITE_ONLY;
    mockFetch([]);
    mockImageProbe(['load', 'load', 'error', 'error']);
    loadComponent();
    expect(mockImageProbe.urls.length).toBe(4);
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

  test('source tags stay hidden and DLsite skeletons show while sources load', async () => {
    document.documentElement.innerHTML = DOM_WITH_BOTH;
    mockFetch([SFW_SHOT]);
    let probeResolve;
    global.Image = function () {
      const self = this;
      Object.defineProperty(self, 'src', {
        set() { probeResolve = function() { self.onerror && self.onerror(); }; }
      });
    };
    loadComponent();
    /* Before probe completes: tags hidden (avoids header reflow), skeletons in dlsite-grid */
    expect(document.getElementById('dlsite-source-tag').style.display).toBe('none');
    expect(document.querySelectorAll('.subtitle .vndb-tag-skeleton').length).toBe(2);
    expect(document.querySelector('#dlsite-grid .vndb-skeleton')).not.toBeNull();
    global.Image = OriginalImage;
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
    const gallery = document.getElementById('vndb-screenshot-gallery');
    expect(col.nextSibling).toBe(gallery.parentNode);
    expect(gallery.parentNode.className).toBe('subject_section clearit');
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

  test('DLsite tab active by default', async () => {
    await setupBoth();
    expect(document.getElementById('dlsite-source-tag').classList.contains('vndb-tab-active')).toBe(true);
    expect(document.getElementById('vndb-source-tag').classList.contains('vndb-tab-active')).toBe(false);
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
      'https://img.dlsite.jp/modpub/images2/work/doujin/RJ306000/RJ305720_img_smpa1.webp'
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

describe('DLsite R18 setting', () => {
  function mockCloudSettings(settings) {
    global.chiiApp = {
      cloud_settings: {
        get: function(key) { return settings[key] !== undefined ? settings[key] : null; },
        update: jest.fn(),
        save: jest.fn()
      }
    };
  }

  afterEach(() => {
    delete global.chiiApp;
  });

  test('DLsite thumbs have R18 mask when dlsiteR18 enabled', async () => {
    document.documentElement.innerHTML = DOM_WITH_DLSITE_ONLY;
    mockCloudSettings({ dlsiteR18: '1', defaultSource: 'dlsite' });
    mockFetch([]);
    mockImageProbe(['load', 'load', 'error']);
    loadComponent();
    await flushPromises();
    const masks = document.querySelectorAll('#dlsite-grid .vndb-mask');
    expect(masks.length).toBe(2);
    expect(masks[0].textContent).toBe('R18');
  });

  test('DLsite thumbs have no mask when dlsiteR18 disabled', async () => {
    document.documentElement.innerHTML = DOM_WITH_DLSITE_ONLY;
    mockCloudSettings({ dlsiteR18: '0', defaultSource: 'dlsite' });
    mockFetch([]);
    mockImageProbe(['load', 'load', 'error']);
    loadComponent();
    await flushPromises();
    expect(document.querySelectorAll('#dlsite-grid .vndb-mask').length).toBe(0);
  });

  test('gallery has dlsite-r18 class when setting enabled', async () => {
    document.documentElement.innerHTML = DOM_WITH_DLSITE_ONLY;
    mockCloudSettings({ dlsiteR18: '1', defaultSource: 'dlsite' });
    mockFetch([]);
    mockImageProbe(['load', 'load', 'error']);
    loadComponent();
    await flushPromises();
    expect(document.getElementById('vndb-screenshot-gallery').classList.contains('dlsite-r18')).toBe(true);
  });

  test('toggle adds show-nsfw to dlsite-grid when dlsiteR18 enabled', async () => {
    document.documentElement.innerHTML = DOM_WITH_DLSITE_ONLY;
    mockCloudSettings({ dlsiteR18: '1', defaultSource: 'dlsite', showNsfw: '0' });
    mockFetch([]);
    mockImageProbe(['load', 'load', 'error']);
    loadComponent();
    await flushPromises();
    const dlsiteGrid = document.getElementById('dlsite-grid');
    expect(dlsiteGrid.classList.contains('show-nsfw')).toBe(false);
    document.getElementById('vndb-nsfw-toggle').click();
    expect(dlsiteGrid.classList.contains('show-nsfw')).toBe(true);
  });

  test('toggle does not affect dlsite-grid when dlsiteR18 disabled', async () => {
    document.documentElement.innerHTML = DOM_WITH_BOTH;
    mockCloudSettings({ dlsiteR18: '0', defaultSource: 'vndb' });
    mockFetch([SFW_SHOT]);
    mockImageProbe(['load', 'load', 'error']);
    loadComponent();
    await flushPromises();
    const dlsiteGrid = document.getElementById('dlsite-grid');
    document.getElementById('vndb-nsfw-toggle').click();
    expect(dlsiteGrid.classList.contains('show-nsfw')).toBe(false);
  });
});
