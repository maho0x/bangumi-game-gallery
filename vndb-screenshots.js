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
