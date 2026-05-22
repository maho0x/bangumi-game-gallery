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
    expect(columnInHomeB.nextSibling).toBe(gallery);
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
  test('shows loading placeholder immediately after insertion', () => {
    document.documentElement.innerHTML = DOM_WITH_VNDB;
    mockFetch([]);
    loadComponent();
    expect(document.querySelector('.vndb-status').textContent).toContain('正在加载');
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
      'https://img.dlsite.jp/modpub/images2/work/doujin/RJ306000/RJ305720_img_smpa1.webp'
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
