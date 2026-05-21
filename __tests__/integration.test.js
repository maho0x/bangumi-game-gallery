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
