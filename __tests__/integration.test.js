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
