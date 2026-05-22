/* @match https://bgm.tv/subject/* */
/* @match https://bangumi.tv/subject/* */
/* @match https://chii.in/subject/* */

(function () {

  var $ = function (id) { return document.getElementById(id); };

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
    function tryLoad(url, onSuccess, onFail) {
      var img = new Image();
      img.onload = function () { onSuccess(url); };
      img.onerror = onFail;
      img.src = url;
    }
    function found(url, n) {
      images.push({ url: url });
      onImage({ url: url }, images.length - 1);
      if (n >= 20) { onDone(images); return; }
      probe(n + 1);
    }
    function probe(n) {
      if (n === 0) {
        var mainUrl = buildDlsiteImageUrl(id, '_img_main.webp');
        tryLoad(mainUrl, function (url) { found(url, 0); }, function () { onDone(images); });
        return;
      }
      var smpaUrl = buildDlsiteImageUrl(id, '_img_smpa' + n + '.webp');
      tryLoad(smpaUrl, function (url) { found(url, n); }, function () {
        var smpUrl = buildDlsiteImageUrl(id, '_img_smp' + n + '.webp');
        tryLoad(smpUrl, function (url) { found(url, n); }, function () { onDone(images); });
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

  function createThumb(src, idx, addNsfwClass, addMask) {
    var thumb = document.createElement('div');
    thumb.className = 'vndb-thumb' + (addNsfwClass ? ' vndb-nsfw' : '');
    thumb.dataset.idx = String(idx);
    var img = document.createElement('img');
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

  function injectStyles() {
    if ($('vndb-styles')) return;
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
      '#vndb-grid.show-nsfw .vndb-mask, #dlsite-grid.show-nsfw .vndb-mask { display: none; }',
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
      '@keyframes vndb-thumb-in { from { opacity: 0; transform: scale(0.94); } to { opacity: 1; transform: none; } }',
      '#vndb-screenshot-gallery .vndb-thumb { animation: vndb-thumb-in 0.4s cubic-bezier(0.22, 1, 0.36, 1) both; }'
    ].join('\n');
    document.head.appendChild(style);
  }

  function createGalleryShell(vndbId, dlsiteId) {
    var gallery = document.createElement('div');
    gallery.id = 'vndb-screenshot-gallery';
    var dlsiteStyle = (!vndbId && dlsiteId) ? '' : ' style="display:none"';
    var vndbStyle   = (!vndbId && dlsiteId) ? ' style="display:none"' : '';
    gallery.innerHTML =
      '<h2 class="subtitle">游戏画廊 ' +
        '<small id="dlsite-source-tag" class="grey"' + dlsiteStyle + '>DLsite</small>' +
        '<small id="vndb-source-tag" class="grey"' + vndbStyle + '>VNDB</small>' +
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
      '<div id="dlsite-grid"></div>';
    return gallery;
  }

  function initNsfwToggle() {
    var grid       = $('vndb-grid');
    var dlsiteGrid = $('dlsite-grid');
    var input      = $('vndb-nsfw-toggle');
    var hasDlsiteR18 = cloudGet('dlsiteR18') === '1';
    var showNsfw = getShowNsfw();

    function applyState() {
      input.checked = showNsfw;
      grid.classList.toggle('show-nsfw', showNsfw);
      if (hasDlsiteR18) dlsiteGrid.classList.toggle('show-nsfw', showNsfw);
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

  function initTabs(initialSource) {
    var gallery   = $('vndb-screenshot-gallery');
    var vndbTag   = $('vndb-source-tag');
    var dlsiteTag = $('dlsite-source-tag');

    dlsiteTag.style.display = '';
    if (initialSource === 'dlsite') {
      gallery.classList.add('dlsite-active');
      vndbTag.className   = 'grey vndb-tab';
      dlsiteTag.className = 'grey vndb-tab vndb-tab-active';
    } else {
      vndbTag.className   = 'grey vndb-tab vndb-tab-active';
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

    var subjectDetail = $('subject_detail');
    if (!subjectDetail) return;

    var vndbAnchor   = document.querySelector('#infobox a[href*="vndb.org/v"]');
    var dlsiteAnchor = document.querySelector('#infobox a[href*="dlsite.com"]');

    var vndbId   = vndbAnchor   ? extractVndbId(vndbAnchor.href)     : null;
    var dlsiteId = dlsiteAnchor ? extractDlsiteId(dlsiteAnchor.href) : null;

    if (!vndbId && !dlsiteId) return;

    var columnInHomeB = $('columnSubjectInHomeB') || subjectDetail.parentNode;
    var defaultSource = cloudGet('defaultSource') || 'dlsite';
    var hasDlsiteR18  = cloudGet('dlsiteR18') === '1';

    injectStyles();
    var gallery = createGalleryShell(vndbId, dlsiteId);
    columnInHomeB.parentNode.insertBefore(gallery, columnInHomeB.nextSibling);

    if (defaultSource === 'dlsite') gallery.classList.add('dlsite-active');
    if (hasDlsiteR18) gallery.classList.add('dlsite-r18');

    if (vndbId && dlsiteId) {
      var dlsiteTagEl = $('dlsite-source-tag');
      var vndbTagEl   = $('vndb-source-tag');
      dlsiteTagEl.style.display = '';
      if (defaultSource === 'dlsite') {
        dlsiteTagEl.className = 'grey vndb-tab vndb-tab-active';
        vndbTagEl.className   = 'grey vndb-tab';
      } else {
        vndbTagEl.className   = 'grey vndb-tab vndb-tab-active';
        dlsiteTagEl.className = 'grey vndb-tab';
      }
    }

    var screenshots  = [];
    var vndbResult   = null;
    var dlsiteImages = null;
    var lbInstance   = null;

    function visibleScreenshots() {
      var show = getShowNsfw();
      return show ? screenshots.slice() : screenshots.filter(function (s) { return !isNsfw(s); });
    }

    function onBothDone() {
      if (vndbResult === null || dlsiteImages === null) return;

      var hasVndb   = Array.isArray(vndbResult) && vndbResult.length > 0;
      var hasDlsite = dlsiteImages.length > 0;

      if (!hasVndb && !hasDlsite) {
        gallery.parentNode.removeChild(gallery);
        return;
      }

      if (hasVndb && hasDlsite) {
        initTabs(defaultSource);
      } else if (hasDlsite) {
        gallery.classList.add('dlsite-active');
        $('vndb-source-tag').style.display = 'none';
        $('dlsite-source-tag').style.display = '';
        if (hasDlsiteR18) initNsfwToggle();
        if (!lbInstance) lbInstance = initLightbox();
      } else {
        gallery.classList.remove('dlsite-active');
        if (dlsiteId) {
          $('dlsite-source-tag').style.display = 'none';
          $('dlsite-grid').innerHTML = '';
        }
      }

      if (hasDlsite) {
        if (!lbInstance) lbInstance = initLightbox();
        $('dlsite-grid').addEventListener('click', function (e) {
          var thumb = e.target.closest('.vndb-thumb');
          if (!thumb) return;
          lbInstance.show(function () { return dlsiteImages; }, parseInt(thumb.dataset.idx, 10));
        });
      }
    }

    if (vndbId) {
      $('vndb-grid').innerHTML = '<p class="vndb-status">正在加载截图…</p>';
      fetchScreenshots(vndbId).then(function (ss) {
        vndbResult = ss;
        screenshots = ss;
        if (ss.length) {
          var grid = $('vndb-grid');
          grid.innerHTML = '';
          ss.forEach(function (s, i) {
            var n = isNsfw(s);
            grid.appendChild(createThumb(s.thumbnail, i, n, n));
          });
          initNsfwToggle();
          lbInstance = initLightbox();
          $('vndb-grid').addEventListener('click', function (e) {
            var thumb = e.target.closest('.vndb-thumb');
            if (!thumb) return;
            var show = getShowNsfw();
            if (thumb.classList.contains('vndb-nsfw') && !show) return;
            var rawIdx = parseInt(thumb.dataset.idx, 10);
            var visibleIdx = 0;
            for (var i = 0; i < rawIdx; i++) {
              if (!isNsfw(ss[i]) || show) visibleIdx++;
            }
            lbInstance.show(visibleScreenshots, visibleIdx);
          });
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
      $('dlsite-grid').innerHTML = '<p class="vndb-status">正在加载截图…</p>';
      probeDlsiteImages(dlsiteId, function (image, idx) {
        var dlsiteGrid = $('dlsite-grid');
        if (idx === 0) dlsiteGrid.innerHTML = '';
        dlsiteGrid.appendChild(createThumb(image.url, idx, false, hasDlsiteR18));
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
      chiiLib.ukagaka.addPanelTab({
        tab: 'game_gallery',
        label: '游戏画廊',
        type: 'options',
        config: [
          {
            title: '优先显示',
            name: 'galleryDefaultSource',
            type: 'radio',
            defaultValue: 'dlsite',
            getCurrentValue: function() { return cloudGet('defaultSource') || 'dlsite'; },
            onChange: function(value) { cloudSet('defaultSource', value); },
            options: [
              { value: 'vndb', label: 'VNDB' },
              { value: 'dlsite', label: 'DLsite' }
            ]
          },
          {
            title: 'DLsite默认显示R18',
            name: 'dlsiteR18',
            type: 'radio',
            defaultValue: '0',
            getCurrentValue: function() { return cloudGet('dlsiteR18') || '0'; },
            onChange: function(value) { cloudSet('dlsiteR18', value); },
            options: [
              { value: '0', label: '关闭' },
              { value: '1', label: '开启' }
            ]
          }
        ]
      });
    } catch(e) {}
  }

  registerSettings();
  init();
})();
