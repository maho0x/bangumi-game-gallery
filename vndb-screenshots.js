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
        initNsfwToggle();
        return;
      }
      renderScreenshots(screenshots);
      initNsfwToggle();
    }).catch(function () {
      showError(grid, vndbAnchor.href);
    });
  }

  init();
})();
