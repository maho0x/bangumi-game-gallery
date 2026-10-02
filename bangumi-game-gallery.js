// ==UserScript==
// @name         游戏画廊
// @version      1.0.4
// @match        https://bgm.tv/*
// @match        https://bangumi.tv/*
// @match        https://chii.in/*
// @grant        none
// ==/UserScript==

(function () {

  var $ = function (id) { return document.getElementById(id); };
  var WORKER_BASE = 'https://bangumi-steam-gallery.ry.mk';
  var SOURCE_TIMEOUT_MS = 10000;
  var DLSITE_IMAGE_TIMEOUT_MS = 4000;

  function withTimeout(promise, timeoutMs) {
    return new Promise(function (resolve, reject) {
      var settled = false;
      var timer = setTimeout(function () {
        if (settled) return;
        settled = true;
        reject(new Error('timeout'));
      }, timeoutMs);

      promise.then(function (value) {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        resolve(value);
      }, function (error) {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        reject(error);
      });
    });
  }

  function extractVndbId(href) {
    var m = (href || '').match(/vndb\.org\/(v\d+)/);
    return m ? m[1] : null;
  }

  function extractDlsiteId(href) {
    var m = (href || '').match(/product_id\/((?:RJ|VJ)\d+)/);
    return m ? m[1] : null;
  }

  function extractSteamAppId(href) {
    var m = (href || '').match(/store\.steampowered\.com\/(?:agecheck\/)?app\/(\d+)/i);
    return m ? m[1] : null;
  }

  function extractGetchuId(href) {
    var m = (href || '').match(/getchu\.com\/(?:soft\.phtml\?(?:[^#]*&)?id=|item\/)(\d+)/i);
    return m ? m[1] : null;
  }

  function cloudGet(key) {
    try { return chiiApp.cloud_settings.get(key); } catch(e) { return null; }
  }

  function cloudSet(key, value) {
    try {
      var obj = {};
      obj[key] = value;
      chiiApp.cloud_settings.update(obj);
      chiiApp.cloud_settings.save();
    } catch(e) {}
  }

  var SOURCE_NAMES = ['dlsite', 'getchu', 'steam', 'vndb'];
  var SOURCE_LABELS = { dlsite: 'DLsite', getchu: 'Getchu', steam: 'Steam', vndb: 'VNDB' };

  // Keeps known names once each, in the given order, then appends any missing
  // ones in default order, so a stale or partial saved value still works.
  function normalizeSourceOrder(list) {
    var order = [];
    (list || []).concat(SOURCE_NAMES).forEach(function (name) {
      if (SOURCE_NAMES.indexOf(name) >= 0 && order.indexOf(name) < 0) order.push(name);
    });
    return order;
  }

  function getSourceOrder() {
    var saved = cloudGet('sourceOrder');
    if (typeof saved === 'string' && saved) return normalizeSourceOrder(saved.split(','));
    // Earlier versions stored only a single preferred source.
    var legacy = cloudGet('defaultSource');
    return normalizeSourceOrder(legacy ? [legacy] : []);
  }

  function getShowNsfw() {
    var v = cloudGet('showNsfw');
    return v !== null ? v === '1' : localStorage.getItem('vndb_show_nsfw') === '1';
  }

  function isNsfw(s) { return s.sexual >= 2 || s.violence >= 2; }

  function buildDlsiteImageUrl(id, suffix) {
    var prefix = id.slice(0, 2);
    var digits = id.slice(2);
    var folderNum = Math.ceil(parseInt(digits, 10) / 1000) * 1000;
    var padded = String(folderNum);
    while (padded.length < digits.length) padded = '0' + padded;
    return 'https://img.dlsite.jp/modpub/images2/work/' +
      (prefix === 'RJ' ? 'doujin' : 'professional') + '/' +
      prefix + padded + '/' + id + suffix;
  }

  function probeDlsiteImages(id, onImage, onDone) {
    var images = [];
    var finished = false;
    var overallTimer = setTimeout(finish, SOURCE_TIMEOUT_MS);

    function finish() {
      if (finished) return;
      finished = true;
      clearTimeout(overallTimer);
      onDone(images);
    }

    function tryLoad(url, onSuccess, onFail) {
      var img = new Image();
      var settled = false;
      var timer = setTimeout(function () { settle(onFail); }, DLSITE_IMAGE_TIMEOUT_MS);
      function settle(callback, value) {
        if (settled || finished) return;
        settled = true;
        clearTimeout(timer);
        img.onload = null;
        img.onerror = null;
        callback(value);
      }
      img.onload = function () { settle(onSuccess, url); };
      img.onerror = function () { settle(onFail); };
      img.src = url;
    }
    function found(url, n) {
      if (finished) return;
      images.push({ url: url });
      onImage({ url: url }, images.length - 1);
      if (n >= 20) { finish(); return; }
      probe(n + 1);
    }
    function probe(n) {
      if (finished) return;
      if (n === 0) {
        var mainUrl = buildDlsiteImageUrl(id, '_img_main.webp');
        tryLoad(mainUrl, function (url) { found(url, 0); }, finish);
        return;
      }
      var smpaUrl = buildDlsiteImageUrl(id, '_img_smpa' + n + '.webp');
      tryLoad(smpaUrl, function (url) { found(url, n); }, function () {
        var smpUrl = buildDlsiteImageUrl(id, '_img_smp' + n + '.webp');
        tryLoad(smpUrl, function (url) { found(url, n); }, finish);
      });
    }
    probe(0);
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

  function fetchSteamScreenshots(appId) {
    return fetch(WORKER_BASE + '/v1/steam/apps/' + encodeURIComponent(appId) + '/screenshots')
      .then(function (r) {
        if (!r.ok) throw new Error('HTTP ' + r.status);
        return r.json();
      }).then(function (data) {
        if (!data || !Array.isArray(data.screenshots)) return [];
        return data.screenshots.map(function (s) {
          return { thumbnail: s.thumbnail, url: s.full };
        }).filter(function (s) {
          return typeof s.thumbnail === 'string' && typeof s.url === 'string';
        });
      });
  }

  function fetchGetchuSamples(id) {
    return fetch(WORKER_BASE + '/v1/getchu/items/' + encodeURIComponent(id) + '/samples')
      .then(function (r) {
        if (!r.ok) throw new Error('HTTP ' + r.status);
        return r.json();
      }).then(function (data) {
        if (!data || !Array.isArray(data.samples)) return [];
        return data.samples.map(function (s) {
          return { thumbnail: s.thumbnail, url: s.full };
        }).filter(function (s) {
          return typeof s.thumbnail === 'string' && typeof s.url === 'string';
        });
      });
  }

  function createThumb(src, idx, addNsfwClass, addMask) {
    var thumb = document.createElement('div');
    thumb.className = 'vndb-thumb' + (addNsfwClass ? ' vndb-nsfw' : '');
    thumb.dataset.idx = String(idx);
    var img = document.createElement('img');
    img.onload = function () { img.classList.add('vndb-loaded'); };
    img.src = src;
    img.loading = 'lazy';
    thumb.appendChild(img);
    if (addMask) {
      var mask = document.createElement('div');
      mask.className = 'vndb-mask';
      mask.textContent = 'R18';
      thumb.appendChild(mask);
    }
    return thumb;
  }

  var SKELETON_COUNT = 5;

  function showSkeletons(grid) {
    var html = '';
    for (var i = 0; i < SKELETON_COUNT; i++) html += '<div class="vndb-skeleton"></div>';
    grid.innerHTML = html;
    grid.classList.add('vndb-loading');
    grid.setAttribute('aria-busy', 'true');
  }

  function clearSkeletons(grid) {
    var skeletons = grid.querySelectorAll('.vndb-skeleton');
    for (var i = 0; i < skeletons.length; i++) grid.removeChild(skeletons[i]);
    grid.classList.remove('vndb-loading');
    grid.removeAttribute('aria-busy');
  }

  // Insert a thumb in place of the next skeleton so the row never reflows.
  function placeThumb(grid, thumb) {
    var skeleton = grid.querySelector('.vndb-skeleton');
    if (skeleton) grid.replaceChild(thumb, skeleton);
    else grid.appendChild(thumb);
  }

  // Smoothly collapse a section instead of yanking it out of the layout.
  function collapseAndRemove(section) {
    var height = section.offsetHeight;
    section.style.overflow = 'hidden';
    section.style.height = height + 'px';
    section.innerHTML = '';
    void section.offsetHeight;
    section.style.transition = 'height .25s ease, margin .25s ease, padding .25s ease, opacity .2s ease';
    section.style.height = '0';
    section.style.marginTop = '0';
    section.style.marginBottom = '0';
    section.style.paddingTop = '0';
    section.style.paddingBottom = '0';
    section.style.opacity = '0';
    var done = false;
    function remove() {
      if (done) return;
      done = true;
      if (section.parentNode) section.parentNode.removeChild(section);
    }
    section.addEventListener('transitionend', remove);
    setTimeout(remove, 400);
  }

  function injectStyles() {
    if ($('vndb-styles')) return;
    var style = document.createElement('style');
    style.id = 'vndb-styles';
    style.textContent = [
      '#vndb-screenshot-gallery { }',
      '#vndb-screenshot-gallery .subtitle { display: flex; align-items: center; gap: 8px; margin-bottom: 8px; min-height: 22px; }',
      '#vndb-screenshot-gallery .subtitle small { animation: vndb-fade-in .25s ease both; }',
      '.vndb-tag-skeleton { display: inline-block; width: 48px; height: 18px; border-radius: 20px; }',
      '.vndb-switch { --sw-w:36px; --sw-h:20px; --sw-bg:rgb(131,131,131); --sw-on:var(--primary-color); --sw-d:14px; --sw-off:calc((var(--sw-h) - var(--sw-d)) / 2); --sw-t:all .2s cubic-bezier(0.27,.2,.25,1.51); --sw-sh:1px 1px 2px rgba(146,146,146,.45); --sw-sh2:-1px 1px 2px rgba(163,163,163,.45); --sw-ew:calc(var(--sw-d) / 2); --sw-eh:calc(var(--sw-ew) / 2 - 1px); display:inline-flex; align-items:center; gap:6px; margin-left:auto; cursor:pointer; user-select:none; -webkit-user-select:none; }',
      '.vndb-switch-label { font-size:12px; color:#999; }',
      '.vndb-switch input { display:none; }',
      '.vndb-switch svg { transition:var(--sw-t); position:absolute; height:auto; }',
      '.vndb-switch .vndb-checkmark { width:8px; color:var(--primary-color); transform:scale(0); }',
      '.vndb-switch .vndb-cross { width:5px; color:var(--sw-bg); }',
      '.vndb-switch .vndb-slider { box-sizing:border-box; width:var(--sw-w); height:var(--sw-h); background:var(--sw-bg); border-radius:999px; display:flex; align-items:center; position:relative; transition:var(--sw-t); cursor:pointer; }',
      '.vndb-switch .vndb-circle { width:var(--sw-d); height:var(--sw-d); background:#fff; border-radius:inherit; box-shadow:var(--sw-sh); display:flex; align-items:center; justify-content:center; transition:var(--sw-t); z-index:1; position:absolute; left:var(--sw-off); }',
      '.vndb-switch .vndb-slider::before { content:""; position:absolute; width:var(--sw-ew); height:var(--sw-eh); left:calc(var(--sw-off) + var(--sw-ew) / 2); background:#fff; border-radius:1px; transition:all .2s ease-in-out; }',
      '.vndb-switch input:checked ~ .vndb-slider { background:var(--sw-on); }',
      '.vndb-switch input:checked ~ .vndb-slider .vndb-checkmark { transform:scale(1); }',
      '.vndb-switch input:checked ~ .vndb-slider .vndb-cross { transform:scale(0); }',
      '.vndb-switch input:checked ~ .vndb-slider::before { left:calc(100% - var(--sw-ew) - var(--sw-ew) / 2 - var(--sw-off)); }',
      '.vndb-switch input:checked ~ .vndb-slider .vndb-circle { left:calc(100% - var(--sw-d) - var(--sw-off)); box-shadow:var(--sw-sh2); }',
      '#vndb-grid, #dlsite-grid, #steam-grid, #getchu-grid { box-sizing: border-box; height: 112px; flex-wrap: nowrap; overflow-x: auto; overflow-y: hidden; gap: 6px; padding: 5px 5px 0 5px; }',
      '#vndb-grid { display: flex; }',
      '#vndb-grid::-webkit-scrollbar, #dlsite-grid::-webkit-scrollbar, #steam-grid::-webkit-scrollbar, #getchu-grid::-webkit-scrollbar { height: 8px; }',
      '#vndb-grid::-webkit-scrollbar-thumb, #dlsite-grid::-webkit-scrollbar-thumb, #steam-grid::-webkit-scrollbar-thumb, #getchu-grid::-webkit-scrollbar-thumb { background: rgba(128,128,128,.35); border-radius: 4px; }',
      '@supports (-moz-appearance: none) { #vndb-grid, #dlsite-grid, #steam-grid, #getchu-grid { scrollbar-width: thin; } }',
      '#vndb-screenshot-gallery .vndb-loading { overflow-x: hidden; }',
      '.vndb-thumb, .vndb-skeleton { position: relative; flex-shrink: 0; width: 150px; height: 95px; overflow: hidden; border-radius: 3px; background: rgba(128,128,128,.12); }',
      '.vndb-thumb { cursor: pointer; }',
      '.vndb-skeleton, .vndb-tag-skeleton { background: linear-gradient(90deg, rgba(128,128,128,.12) 25%, rgba(128,128,128,.22) 50%, rgba(128,128,128,.12) 75%); background-size: 300% 100%; animation: vndb-shimmer 1.4s ease-in-out infinite; }',
      '@keyframes vndb-shimmer { from { background-position: 100% 0; } to { background-position: 0 0; } }',
      '@keyframes vndb-fade-in { from { opacity: 0; } to { opacity: 1; } }',
      '.vndb-thumb img { width: 100%; height: 100%; object-fit: cover; display: block; opacity: 0; transition: opacity .3s ease; }',
      '.vndb-thumb img.vndb-loaded { opacity: 1; }',
      '.vndb-mask { position: absolute; inset: 0; backdrop-filter: blur(12px); -webkit-backdrop-filter: blur(12px); background: rgba(0,0,0,0.3); display: flex; align-items: center; justify-content: center; color: #fff; font-size: 13px; font-weight: bold; letter-spacing: 1px; }',
      '#vndb-grid.show-nsfw .vndb-mask, #dlsite-grid.show-nsfw .vndb-mask, #getchu-grid.show-nsfw .vndb-mask { display: none; }',
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
      '#vndb-lb-counter { position: fixed; bottom: 16px; left: 50%; transform: translateX(-50%); color: #ccc; font-size: 13px; z-index: 2; white-space: nowrap; }',
      '#dlsite-grid, #steam-grid, #getchu-grid { display: none; }',
      '.vndb-tab { cursor: pointer; border: 1px solid #eee; border-radius: 20px; padding: 2px 6px; }',
      '.vndb-tab:not(.vndb-tab-active):hover { text-decoration: none; color: #aaa; }',
      '#vndb-screenshot-gallery .vndb-tab-active { cursor: default; color: var(--primary-color); border-color: var(--primary-color); }',
      '#vndb-screenshot-gallery.dlsite-active #vndb-grid { display: none; }',
      '#vndb-screenshot-gallery.dlsite-active #dlsite-grid { display: flex; }',
      '#vndb-screenshot-gallery.steam-active #vndb-grid, #vndb-screenshot-gallery.steam-active #dlsite-grid { display: none; }',
      '#vndb-screenshot-gallery.steam-active #steam-grid { display: flex; }',
      '#vndb-screenshot-gallery.getchu-active #vndb-grid { display: none; }',
      '#vndb-screenshot-gallery.getchu-active #getchu-grid { display: flex; }',
      '#vndb-screenshot-gallery.dlsite-active:not(.dlsite-r18) .vndb-switch, #vndb-screenshot-gallery.getchu-active:not(.dlsite-r18) .vndb-switch, #vndb-screenshot-gallery.steam-active .vndb-switch { visibility: hidden; pointer-events: none; }',
      '@keyframes vndb-thumb-in { from { opacity: 0; transform: scale(0.94); } to { opacity: 1; transform: none; } }',
      '#vndb-screenshot-gallery .vndb-thumb { animation: vndb-thumb-in 0.4s cubic-bezier(0.22, 1, 0.36, 1) both; }'
    ].join('\n');
    document.head.appendChild(style);
  }

  function createGalleryShell(sourceCount, order) {
    var gallery = document.createElement('div');
    gallery.id = 'vndb-screenshot-gallery';
    // Real source tags stay hidden until every source settles; skeleton pills
    // stand in for them meanwhile, one per linked source.
    var hidden = ' style="display:none"';
    var tagSkeletons = '';
    for (var i = 0; i < sourceCount; i++) tagSkeletons += '<span class="vndb-tag-skeleton"></span>';
    gallery.innerHTML =
      '<h2 class="subtitle">游戏画廊 ' +
        tagSkeletons +
        order.map(function (name) {
          return '<small id="' + name + '-source-tag" class="grey"' + hidden + '>' + SOURCE_LABELS[name] + '</small>';
        }).join('') +
        '<label class="vndb-switch">' +
          '<input type="checkbox" id="vndb-nsfw-toggle">' +
          '<span class="vndb-switch-label">R18</span>' +
          '<div class="vndb-slider">' +
            '<div class="vndb-circle">' +
              '<svg class="vndb-checkmark" viewBox="0 0 10 7" fill="none"><path d="M1 3.5L3.5 6L9 1" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>' +
              '<svg class="vndb-cross" viewBox="0 0 6 6" fill="none"><path d="M1 1L5 5M5 1L1 5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>' +
            '</div>' +
          '</div>' +
        '</label>' +
      '</h2>' +
      '<div id="vndb-grid"></div>' +
      '<div id="dlsite-grid"></div>' +
      '<div id="steam-grid"></div>' +
      '<div id="getchu-grid"></div>';
    return gallery;
  }

  function initNsfwToggle() {
    var grid       = $('vndb-grid');
    var dlsiteGrid = $('dlsite-grid');
    var getchuGrid = $('getchu-grid');
    var input      = $('vndb-nsfw-toggle');
    var hasDlsiteR18 = cloudGet('dlsiteR18') === '1';
    var showNsfw = getShowNsfw();

    function applyState() {
      input.checked = showNsfw;
      grid.classList.toggle('show-nsfw', showNsfw);
      if (hasDlsiteR18) {
        dlsiteGrid.classList.toggle('show-nsfw', showNsfw);
        getchuGrid.classList.toggle('show-nsfw', showNsfw);
      }
    }

    applyState();
    input.addEventListener('change', function () {
      showNsfw = input.checked;
      cloudSet('showNsfw', showNsfw ? '1' : '0');
      localStorage.setItem('vndb_show_nsfw', showNsfw ? '1' : '0');
      applyState();
    });
  }

  function initLightbox() {
    var lb = document.createElement('div');
    lb.id = 'vndb-lightbox';
    lb.style.display = 'none';
    lb.innerHTML =
      '<div id="vndb-lb-backdrop"></div>' +
      '<button id="vndb-lb-close">✕</button>' +
      '<button id="vndb-lb-prev">❮</button>' +
      '<button id="vndb-lb-next">❯</button>' +
      '<div id="vndb-lb-content">' +
        '<div id="vndb-lb-loading">加载中…</div>' +
        '<img id="vndb-lb-img" src="" alt="">' +
      '</div>' +
      '<div id="vndb-lb-counter"></div>';
    document.body.appendChild(lb);

    var currentIdx = 0;
    var lbOpen = false;
    var getImages = function () { return []; };

    function showImage(image) {
      var img     = $('vndb-lb-img');
      var loading = $('vndb-lb-loading');
      img.style.display = 'none';
      loading.style.display = 'block';
      $('vndb-lb-counter').textContent = (currentIdx + 1) + ' / ' + getImages().length;
      img.onload = function () {
        loading.style.display = 'none';
        img.style.display = 'block';
      };
      img.src = image.url;
    }

    function show(imagesFn, idx) {
      getImages = imagesFn;
      currentIdx = idx;
      lbOpen = true;
      lb.style.display = 'flex';
      showImage(imagesFn()[idx]);
    }

    function close() { lbOpen = false; lb.style.display = 'none'; }

    function navigate(delta) {
      var imgs = getImages();
      if (!imgs.length) return;
      currentIdx = (currentIdx + delta + imgs.length) % imgs.length;
      showImage(imgs[currentIdx]);
    }

    $('vndb-lb-backdrop').addEventListener('click', close);
    $('vndb-lb-close').addEventListener('click', close);
    $('vndb-lb-prev').addEventListener('click', function () { navigate(-1); });
    $('vndb-lb-next').addEventListener('click', function () { navigate(1); });

    document.addEventListener('keydown', function (e) {
      if (!lbOpen) return;
      if (e.key === 'Escape')     close();
      if (e.key === 'ArrowLeft')  navigate(-1);
      if (e.key === 'ArrowRight') navigate(1);
    });

    return { show: show };
  }

  function setGallerySource(gallery, source) {
    gallery.classList.toggle('dlsite-active', source === 'dlsite');
    gallery.classList.toggle('steam-active', source === 'steam');
    gallery.classList.toggle('getchu-active', source === 'getchu');
  }

  // `sources` lists the sources that have images, in the user's order.
  function initTabs(sources) {
    var gallery = $('vndb-screenshot-gallery');
    var sourceNames = SOURCE_NAMES;
    var activeSource = sources[0];

    var tagSkeletons = gallery.querySelectorAll('.vndb-tag-skeleton');
    for (var i = 0; i < tagSkeletons.length; i++) tagSkeletons[i].parentNode.removeChild(tagSkeletons[i]);

    function activate(source) {
      setGallerySource(gallery, source);
      sourceNames.forEach(function (name) {
        var tag = $(name + '-source-tag');
        tag.classList.toggle('vndb-tab-active', sources.length > 1 && name === source);
      });
    }

    sourceNames.forEach(function (name) {
      var tag = $(name + '-source-tag');
      var available = sources.indexOf(name) >= 0;
      tag.style.display = available ? '' : 'none';
      tag.className = 'grey' + (sources.length > 1 && available ? ' vndb-tab' : '');
      if (sources.length > 1 && available) {
        tag.addEventListener('click', function () { activate(name); });
      }
    });

    activate(activeSource);
  }

  function init() {
    if (!/^\/subject\/\d+$/.test(location.pathname)) return;

    var subjectDetail = $('subject_detail');
    if (!subjectDetail) return;

    var vndbAnchor = document.querySelector('#infobox a[href*="vndb.org/v"]');
    var dlsiteAnchor = document.querySelector('#infobox a[href*="dlsite.com"]');
    var steamAnchor = document.querySelector(
      '#infobox a[href*="store.steampowered.com/app/"], ' +
      '#infobox a[href*="store.steampowered.com/agecheck/app/"]'
    );

    var vndbId = vndbAnchor ? extractVndbId(vndbAnchor.href) : null;
    var dlsiteId = dlsiteAnchor ? extractDlsiteId(dlsiteAnchor.href) : null;
    var steamAppId = steamAnchor ? extractSteamAppId(steamAnchor.href) : null;
    var getchuAnchor = document.querySelector('#infobox a[href*="getchu.com/"]');
    var getchuId = getchuAnchor ? extractGetchuId(getchuAnchor.href) : null;

    if (!vndbId && !dlsiteId && !steamAppId && !getchuId) return;

    var columnInHomeB = $('columnSubjectInHomeB') || subjectDetail.parentNode;
    var sourceOrder  = getSourceOrder();
    var hasDlsiteR18 = cloudGet('dlsiteR18') === '1';
    var linkedIds    = { dlsite: dlsiteId, getchu: getchuId, steam: steamAppId, vndb: vndbId };
    var linkedSources = sourceOrder.filter(function (name) { return linkedIds[name]; });

    injectStyles();
    var gallery = createGalleryShell(linkedSources.length, sourceOrder);
    var gallerySection = document.createElement('div');
    gallerySection.className = 'subject_section clearit';
    gallerySection.appendChild(gallery);
    columnInHomeB.parentNode.insertBefore(gallerySection, columnInHomeB.nextSibling);

    setGallerySource(gallery, linkedSources[0]);
    if (hasDlsiteR18) gallery.classList.add('dlsite-r18');
    // Apply the saved R18 state before any thumb renders, so masks never flash.
    initNsfwToggle();

    var screenshots  = [];
    var vndbResult   = vndbId ? null : [];
    var dlsiteImages = dlsiteId ? null : [];
    var steamImages  = steamAppId ? null : [];
    var getchuImages = getchuId ? null : [];
    var lbInstance   = null;
    var finalized    = false;

    function visibleScreenshots() {
      var show = getShowNsfw();
      return show ? screenshots.slice() : screenshots.filter(function (s) { return !isNsfw(s); });
    }

    function bindSimpleGrid(gridId, images) {
      $(gridId).addEventListener('click', function (e) {
        var thumb = e.target.closest('.vndb-thumb');
        if (!thumb) return;
        lbInstance.show(function () { return images; }, parseInt(thumb.dataset.idx, 10));
      });
    }

    function onAllDone() {
      if (finalized || vndbResult === null || dlsiteImages === null || steamImages === null || getchuImages === null) return;
      finalized = true;

      var hasVndb   = Array.isArray(vndbResult) && vndbResult.length > 0;
      var hasDlsite = dlsiteImages.length > 0;
      var hasSteam  = steamImages.length > 0;
      var hasGetchu = getchuImages.length > 0;
      var hasImages = { dlsite: hasDlsite, getchu: hasGetchu, steam: hasSteam, vndb: hasVndb };
      var sources = sourceOrder.filter(function (name) { return hasImages[name]; });

      if (!sources.length) {
        collapseAndRemove(gallerySection);
        return;
      }

      if (!hasVndb) clearSkeletons($('vndb-grid'));
      if (!hasDlsite) clearSkeletons($('dlsite-grid'));
      if (!hasSteam) clearSkeletons($('steam-grid'));
      if (!hasGetchu) clearSkeletons($('getchu-grid'));

      initTabs(sources);
      lbInstance = initLightbox();

      if (hasDlsite) {
        bindSimpleGrid('dlsite-grid', dlsiteImages);
      }
      if (hasSteam) {
        bindSimpleGrid('steam-grid', steamImages);
      }
      if (hasGetchu) {
        bindSimpleGrid('getchu-grid', getchuImages);
      }
      if (hasVndb) {
        $('vndb-grid').addEventListener('click', function (e) {
          var thumb = e.target.closest('.vndb-thumb');
          if (!thumb) return;
          var show = getShowNsfw();
          if (thumb.classList.contains('vndb-nsfw') && !show) return;
          var rawIdx = parseInt(thumb.dataset.idx, 10);
          var visibleIdx = 0;
          for (var i = 0; i < rawIdx; i++) {
            if (!isNsfw(screenshots[i]) || show) visibleIdx++;
          }
          lbInstance.show(visibleScreenshots, visibleIdx);
        });
      }
    }

    if (vndbId) {
      showSkeletons($('vndb-grid'));
      withTimeout(fetchScreenshots(vndbId), SOURCE_TIMEOUT_MS).then(function (ss) {
        vndbResult = ss;
        screenshots = ss;
        if (ss.length) {
          var grid = $('vndb-grid');
          ss.forEach(function (s, i) {
            var n = isNsfw(s);
            placeThumb(grid, createThumb(s.thumbnail, i, n, n));
          });
          clearSkeletons(grid);
        }
      }).catch(function () {
        vndbResult = [];
      }).then(function () {
        onAllDone();
      });
    }

    if (dlsiteId) {
      showSkeletons($('dlsite-grid'));
      probeDlsiteImages(dlsiteId, function (image, idx) {
        placeThumb($('dlsite-grid'), createThumb(image.url, idx, false, hasDlsiteR18));
      }, function (images) {
        dlsiteImages = images;
        if (images.length) clearSkeletons($('dlsite-grid'));
        onAllDone();
      });
    }

    if (steamAppId) {
      showSkeletons($('steam-grid'));
      withTimeout(fetchSteamScreenshots(steamAppId), SOURCE_TIMEOUT_MS).then(function (images) {
        steamImages = images;
        if (images.length) {
          var steamGrid = $('steam-grid');
          images.forEach(function (image, idx) {
            placeThumb(steamGrid, createThumb(image.thumbnail, idx, false, false));
          });
          clearSkeletons(steamGrid);
        }
      }).catch(function () {
        steamImages = [];
      }).then(function () {
        onAllDone();
      });
    }

    if (getchuId) {
      showSkeletons($('getchu-grid'));
      withTimeout(fetchGetchuSamples(getchuId), SOURCE_TIMEOUT_MS).then(function (images) {
        getchuImages = images;
        if (images.length) {
          var getchuGrid = $('getchu-grid');
          images.forEach(function (image, idx) {
            placeThumb(getchuGrid, createThumb(image.thumbnail, idx, false, hasDlsiteR18));
          });
          clearSkeletons(getchuGrid);
        }
      }).catch(function () {
        getchuImages = [];
      }).then(function () {
        onAllDone();
      });
    }

    onAllDone();
  }

  function injectSettingsStyles() {
    if ($('bgg-settings-styles')) return;
    var style = document.createElement('style');
    style.id = 'bgg-settings-styles';
    style.textContent = [
      '.bgg-order-list { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 6px; max-width: 320px; }',
      '.bgg-order-item { display: flex; align-items: center; gap: 10px; padding: 6px 6px 6px 12px; border-radius: 20px; background: #fefefe; border: 1px solid #eee; }',
      'html[data-theme=dark] .bgg-order-item { background: #6e6e6e; border-color: #7c7c7c; }',
      '.bgg-order-item:first-child { border-color: var(--primary-color, #f09199); }',
      '.bgg-order-rank { width: 16px; font-size: 12px; color: #999; text-align: center; }',
      'html[data-theme=dark] .bgg-order-rank { color: #ccc; }',
      '.bgg-order-item:first-child .bgg-order-rank { color: var(--primary-color, #f09199); font-weight: bold; }',
      '.bgg-order-name { flex: 1; font-size: 13px; color: #000; }',
      'html[data-theme=dark] .bgg-order-name { color: #fff; }',
      '.bgg-order-btn { width: 26px; height: 26px; border-radius: 50%; border: 1px solid #eee; background: transparent; color: #666; cursor: pointer; font-size: 12px; line-height: 1; display: inline-flex; align-items: center; justify-content: center; transition: all .2s ease; }',
      'html[data-theme=dark] .bgg-order-btn { border-color: #7c7c7c; color: #ddd; }',
      '.bgg-order-btn:hover:not(:disabled) { border-color: var(--primary-color, #f09199); color: var(--primary-color, #f09199); }',
      '.bgg-order-btn:disabled { opacity: .3; cursor: default; }',
      '.bgg-order-hint { margin: 8px 0 0; font-size: 12px; color: #999; }'
    ].join('\n');
    document.head.appendChild(style);
  }

  function renderSourceOrderItems(order) {
    return order.map(function (name, i) {
      var label = SOURCE_LABELS[name];
      return '<li class="bgg-order-item" data-source="' + name + '">' +
        '<span class="bgg-order-rank">' + (i + 1) + '</span>' +
        '<span class="bgg-order-name">' + label + '</span>' +
        '<button type="button" class="bgg-order-btn" data-move="-1" aria-label="上移 ' + label + '"' +
          (i === 0 ? ' disabled' : '') + '>▲</button>' +
        '<button type="button" class="bgg-order-btn" data-move="1" aria-label="下移 ' + label + '"' +
          (i === order.length - 1 ? ' disabled' : '') + '>▼</button>' +
      '</li>';
    }).join('');
  }

  // Same markup the panel generates for its own radio options, so it inherits the native look.
  function renderRadioSection(section, current) {
    return '<div class="section" id="section-' + section.name + '">' +
      '<div class="title">' + section.title + '</div>' +
      '<div class="options-container">' +
      section.options.map(function (option) {
        var id = section.name + '_' + option.value;
        return '<div class="option-item">' +
          '<input type="radio" id="' + id + '" name="' + section.name + '" value="' + option.value + '"' +
            (option.value === current ? ' checked' : '') + ' />' +
          '<label for="' + id + '"><span class="radio-custom"></span>' +
          '<span class="label-text">' + option.label + '</span></label>' +
        '</div>';
      }).join('') +
      '</div></div>';
  }

  var R18_SECTION = {
    title: 'DLsite/Getchu默认模糊R18',
    name: 'dlsiteR18',
    options: [
      { value: '0', label: '关闭' },
      { value: '1', label: '开启' }
    ]
  };

  function renderSettingsContent() {
    return '<div class="section" id="section-gallerySourceOrder">' +
        '<div class="title">来源顺序</div>' +
        '<ol class="bgg-order-list">' + renderSourceOrderItems(getSourceOrder()) + '</ol>' +
        '<p class="bgg-order-hint">优先显示排在前面且有图片的来源，刷新页面后生效</p>' +
      '</div>' +
      renderRadioSection(R18_SECTION, cloudGet('dlsiteR18') || '0');
  }

  function bindSettingsContent(tabContent) {
    tabContent.addEventListener('click', function (e) {
      var btn = e.target.closest('.bgg-order-btn');
      if (!btn || btn.disabled) return;
      var order = getSourceOrder();
      var from = order.indexOf(btn.closest('.bgg-order-item').dataset.source);
      var to = from + parseInt(btn.dataset.move, 10);
      if (from < 0 || to < 0 || to >= order.length) return;
      order.splice(to, 0, order.splice(from, 1)[0]);
      cloudSet('sourceOrder', order.join(','));
      var list = tabContent.querySelector('.bgg-order-list');
      list.innerHTML = renderSourceOrderItems(order);
      // Keep keyboard focus on the moved item's same button where possible.
      var moved = list.querySelector('[data-source="' + order[to] + '"] [data-move="' + btn.dataset.move + '"]');
      if (moved && !moved.disabled) moved.focus();
    });
    tabContent.addEventListener('change', function (e) {
      if (e.target.name === R18_SECTION.name) cloudSet('dlsiteR18', e.target.value);
    });
  }

  function registerSettings() {
    try {
      chiiLib.ukagaka.addPanelTab({
        tab: 'game_gallery',
        label: '游戏画廊',
        type: 'custom',
        customContent: renderSettingsContent,
        onInit: function (tabSelector) {
          var tabContent = document.querySelector(tabSelector);
          if (tabContent) bindSettingsContent(tabContent);
        }
      });
      injectSettingsStyles();
    } catch(e) {}
  }

  registerSettings();
  init();
})();
