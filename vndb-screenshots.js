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

  function buildDlsiteImageUrl(id, suffix) {
    var prefix = id.slice(0, 2);
    var numId = parseInt(id.slice(2), 10);
    var folderNum = Math.ceil(numId / 1000) * 1000;
    var folder = prefix + ('000000' + folderNum).slice(-6);
    var category = prefix === 'RJ' ? 'doujin' : 'professional';
    return 'https://img.dlsite.jp/modpub/images2/work/' + category + '/' + folder + '/' + id + suffix;
  }

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
      var suffix = '_img_smpa' + n + '.webp';
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
      '#vndb-nsfw-toggle { margin-left: auto; font-size: 12px; padding: 2px 8px; cursor: pointer; border-radius: 3px; }',
      '#vndb-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 6px; }',
      '.vndb-thumb { position: relative; height: 120px; overflow: hidden; cursor: pointer; border-radius: 3px; background: #f0f0f0; }',
      '.vndb-thumb img { width: 100%; height: 100%; object-fit: cover; display: block; }',
      '.vndb-mask { position: absolute; inset: 0; backdrop-filter: blur(12px); -webkit-backdrop-filter: blur(12px); background: rgba(0,0,0,0.3); display: flex; align-items: center; justify-content: center; color: #fff; font-size: 13px; font-weight: bold; letter-spacing: 1px; }',
      '#vndb-grid.show-nsfw .vndb-mask { display: none; }',
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
      '#dlsite-grid { display: none; grid-template-columns: repeat(4, 1fr); gap: 6px; }',
      '.vndb-tab { cursor: pointer; }',
      '.vndb-tab:not(.vndb-tab-active):hover { text-decoration: underline; color: #aaa; }',
      '.vndb-tab-active { cursor: default; color: #666; }',
      '#vndb-screenshot-gallery.dlsite-active #vndb-grid { display: none; }',
      '#vndb-screenshot-gallery.dlsite-active #dlsite-grid { display: grid; }',
      '#vndb-screenshot-gallery.dlsite-active #vndb-nsfw-toggle { display: none; }'
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

  function initTabs() {
    var gallery = document.getElementById('vndb-screenshot-gallery');
    var vndbTag = document.getElementById('vndb-source-tag');
    var dlsiteTag = document.getElementById('dlsite-source-tag');

    dlsiteTag.style.display = '';
    vndbTag.className = 'grey vndb-tab vndb-tab-active';
    dlsiteTag.className = 'grey vndb-tab';

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

  init();
})();
