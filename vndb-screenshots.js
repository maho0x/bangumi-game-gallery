/* @match https://bgm.tv/subject/* */
/* @match https://bangumi.tv/subject/* */
/* @match https://chii.in/subject/* */

(function () {

  function extractVndbId(href) {
    var m = (href || '').match(/vndb\.org\/(v\d+)/);
    return m ? m[1] : null;
  }

  function extractDlsiteId(href) {
    var m = (href || '').match(/product_id\/((?:RJ|VJ)\d+)/);
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

  function buildDlsiteImageUrl(id, suffix) {
    var prefix = id.slice(0, 2);
    var numId = parseInt(id.slice(2), 10);
    var folderNum = Math.ceil(numId / 1000) * 1000;
    var folder = prefix + ('000000' + folderNum).slice(-6);
    var category = prefix === 'RJ' ? 'doujin' : 'professional';
    return 'https://img.dlsite.jp/modpub/images2/work/' + category + '/' + folder + '/' + id + suffix;
  }

  function probeDlsiteImages(id, onImage, onDone) {
    var images = [];

    function makeImg(suffix, onSuccess, onFail) {
      var img = new Image();
      img.onload = onSuccess;
      img.onerror = onFail;
      img.src = buildDlsiteImageUrl(id, suffix);
    }

    function probeNext(n) {
      if (n > 20) { onDone(images); return; }
      var suffix = '_img_smpa' + n + '.webp';
      makeImg(suffix, function () {
        var image = { url: buildDlsiteImageUrl(id, suffix) };
        var idx = images.length;
        images.push(image);
        onImage(image, idx);
        probeNext(n + 1);
      }, function () {
        onDone(images);
      });
    }

    makeImg('_img_main.webp', function () {
      var image = { url: buildDlsiteImageUrl(id, '_img_main.webp') };
      images.push(image);
      onImage(image, 0);
      probeNext(1);
    }, function () {
      onDone([]);
    });
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
    heading.appendChild(document.createTextNode('游戏画廊 '));

    var dlsiteTag = document.createElement('small');
    dlsiteTag.id = 'dlsite-source-tag';
    dlsiteTag.className = 'grey';
    dlsiteTag.style.display = 'none';
    dlsiteTag.textContent = 'DLsite';
    heading.appendChild(dlsiteTag);

    var vndbTag = document.createElement('small');
    vndbTag.id = 'vndb-source-tag';
    vndbTag.className = 'grey';
    vndbTag.textContent = 'VNDB';
    heading.appendChild(vndbTag);

    var switchEl = document.createElement('label');
    switchEl.className = 'vndb-switch';
    switchEl.innerHTML =
      '<input type="checkbox" id="vndb-nsfw-toggle">' +
      '<span class="vndb-switch-label">R18</span>' +
      '<div class="vndb-slider">' +
        '<div class="vndb-circle">' +
          '<svg class="vndb-checkmark" viewBox="0 0 10 7" fill="none"><path d="M1 3.5L3.5 6L9 1" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>' +
          '<svg class="vndb-cross" viewBox="0 0 6 6" fill="none"><path d="M1 1L5 5M5 1L1 5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>' +
        '</div>' +
      '</div>';
    heading.appendChild(switchEl);

    var grid = document.createElement('div');
    grid.id = 'vndb-grid';

    var dlsiteGrid = document.createElement('div');
    dlsiteGrid.id = 'dlsite-grid';

    gallery.appendChild(heading);
    gallery.appendChild(grid);
    gallery.appendChild(dlsiteGrid);
    return gallery;
  }

  function showLoading(grid) {
    grid.innerHTML = '<p class="vndb-status">正在加载截图…</p>';
  }

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
      '#vndb-grid { display: flex; flex-wrap: nowrap; overflow-x: auto; gap: 6px; }',
      '.vndb-thumb { position: relative; flex-shrink: 0; width: 150px; height: 95px; overflow: hidden; cursor: pointer; border-radius: 3px; background: #f0f0f0; }',
      '.vndb-thumb img { width: 100%; height: 100%; object-fit: cover; display: block; }',
      '.vndb-mask { position: absolute; inset: 0; backdrop-filter: blur(12px); -webkit-backdrop-filter: blur(12px); background: rgba(0,0,0,0.3); display: flex; align-items: center; justify-content: center; color: #fff; font-size: 13px; font-weight: bold; letter-spacing: 1px; }',
      '#vndb-grid.show-nsfw .vndb-mask { display: none; }',
      '#dlsite-grid.show-nsfw .vndb-mask { display: none; }',
      '.vndb-status { color: #999; font-size: 13px; padding: 8px 0; }',
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
      '#dlsite-grid { display: none; flex-wrap: nowrap; overflow-x: auto; gap: 6px; }',
      '.vndb-tab { cursor: pointer; border: 1px solid #eee; border-radius: 20px; padding: 2px 6px; }',
      '.vndb-tab:not(.vndb-tab-active):hover { text-decoration: none; color: #aaa; }',
      '#vndb-screenshot-gallery .vndb-tab-active { cursor: default; color: var(--primary-color); border-color: var(--primary-color); }',
      '#vndb-screenshot-gallery.dlsite-active #vndb-grid { display: none; }',
      '#vndb-screenshot-gallery.dlsite-active #dlsite-grid { display: flex; }',
      '#vndb-screenshot-gallery.dlsite-active:not(.dlsite-r18) .vndb-switch { display: none; }',
      '@keyframes vndb-thumb-in { from { opacity: 0; transform: translateY(6px) scale(0.97); } to { opacity: 1; transform: none; } }',
      '#dlsite-grid .vndb-thumb { animation: vndb-thumb-in 0.4s cubic-bezier(0.22, 1, 0.36, 1) both; }'
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

  function renderDlsiteThumb(image, idx, hasDlsiteR18) {
    var thumb = document.createElement('div');
    thumb.className = 'vndb-thumb';
    thumb.dataset.idx = String(idx);
    var img = document.createElement('img');
    img.src = image.url;
    img.loading = 'lazy';
    thumb.appendChild(img);
    if (hasDlsiteR18) {
      var mask = document.createElement('div');
      mask.className = 'vndb-mask';
      mask.textContent = 'R18';
      thumb.appendChild(mask);
    }
    return thumb;
  }

  function initNsfwToggle() {
    var grid       = document.getElementById('vndb-grid');
    var dlsiteGrid = document.getElementById('dlsite-grid');
    var input      = document.getElementById('vndb-nsfw-toggle');
    var hasDlsiteR18 = cloudGet('dlsiteR18') === '1';
    var cloudVal = cloudGet('showNsfw');
    var showNsfw = cloudVal !== null ? cloudVal === '1' : localStorage.getItem('vndb_show_nsfw') === '1';

    function applyState() {
      input.checked = showNsfw;
      if (showNsfw) {
        grid.classList.add('show-nsfw');
        if (hasDlsiteR18) { dlsiteGrid.classList.add('show-nsfw'); }
      } else {
        grid.classList.remove('show-nsfw');
        if (hasDlsiteR18) { dlsiteGrid.classList.remove('show-nsfw'); }
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

  function getVisibleScreenshots(screenshots) {
    var cloudVal = cloudGet('showNsfw');
    var showNsfw = cloudVal !== null ? cloudVal === '1' : localStorage.getItem('vndb_show_nsfw') === '1';
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

  function initTabs(initialSource) {
    var gallery = document.getElementById('vndb-screenshot-gallery');
    var vndbTag = document.getElementById('vndb-source-tag');
    var dlsiteTag = document.getElementById('dlsite-source-tag');

    dlsiteTag.style.display = '';
    if (initialSource === 'dlsite') {
      gallery.classList.add('dlsite-active');
      vndbTag.className = 'grey vndb-tab';
      dlsiteTag.className = 'grey vndb-tab vndb-tab-active';
    } else {
      vndbTag.className = 'grey vndb-tab vndb-tab-active';
      dlsiteTag.className = 'grey vndb-tab';
    }

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
    if ((cloudGet('defaultSource') || 'dlsite') === 'dlsite') {
      gallery.classList.add('dlsite-active');
    }
    if (cloudGet('dlsiteR18') === '1') {
      gallery.classList.add('dlsite-r18');
    }

    if (vndbId && dlsiteId) {
      var dlsiteTagEl = document.getElementById('dlsite-source-tag');
      var vndbTagEl   = document.getElementById('vndb-source-tag');
      dlsiteTagEl.style.display = '';
      var earlyDefault = cloudGet('defaultSource') || 'dlsite';
      if (earlyDefault === 'dlsite') {
        dlsiteTagEl.className = 'grey vndb-tab vndb-tab-active';
        vndbTagEl.className   = 'grey vndb-tab';
      } else {
        vndbTagEl.className   = 'grey vndb-tab vndb-tab-active';
        dlsiteTagEl.className = 'grey vndb-tab';
      }
    }

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
        initTabs(cloudGet('defaultSource') || 'dlsite');
        document.getElementById('dlsite-grid').addEventListener('click', function (e) {
          var thumb = e.target.closest('.vndb-thumb');
          if (!thumb) return;
          lbInstance.openWith(dlsiteImages, parseInt(thumb.dataset.idx, 10));
        });
      } else if (hasDlsite) {
        configureSingleSource('dlsite');
        if (cloudGet('dlsiteR18') === '1') { initNsfwToggle(); }
        lbInstance = initLightbox([]);
        document.getElementById('dlsite-grid').addEventListener('click', function (e) {
          var thumb = e.target.closest('.vndb-thumb');
          if (!thumb) return;
          lbInstance.openWith(dlsiteImages, parseInt(thumb.dataset.idx, 10));
        });
      } else {
        /* hasVndb && !hasDlsite */
        gallery.classList.remove('dlsite-active');
        if (dlsiteId) {
          document.getElementById('dlsite-source-tag').style.display = 'none';
          document.getElementById('dlsite-grid').innerHTML = '';
        }
      }
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
      showLoading(document.getElementById('dlsite-grid'));
      var hasDlsiteR18 = cloudGet('dlsiteR18') === '1';
      probeDlsiteImages(dlsiteId, function (image, idx) {
        var dlsiteGrid = document.getElementById('dlsite-grid');
        if (idx === 0) { dlsiteGrid.innerHTML = ''; }
        dlsiteGrid.appendChild(renderDlsiteThumb(image, idx, hasDlsiteR18));
      }, function (images) {
        dlsiteImages = images;
        onBothDone();
      });
    } else {
      dlsiteImages = [];
      onBothDone();
    }
  }

  function registerSettings() {
    try {
      chiiLib.ukagaka.addGeneralConfig({
        title: '游戏画廊默认来源',
        name: 'galleryDefaultSource',
        type: 'radio',
        defaultValue: 'dlsite',
        getCurrentValue: function() { return cloudGet('defaultSource') || 'dlsite'; },
        onChange: function(value) { cloudSet('defaultSource', value); },
        options: [
          { value: 'vndb', label: 'VNDB' },
          { value: 'dlsite', label: 'DLsite' }
        ]
      });
      chiiLib.ukagaka.addGeneralConfig({
        title: 'DLsite默认R18',
        name: 'dlsiteR18',
        type: 'radio',
        defaultValue: '0',
        getCurrentValue: function() { return cloudGet('dlsiteR18') || '0'; },
        onChange: function(value) { cloudSet('dlsiteR18', value); },
        options: [
          { value: '0', label: '关闭' },
          { value: '1', label: '开启' }
        ]
      });
    } catch(e) {}
  }

  registerSettings();
  init();
})();
