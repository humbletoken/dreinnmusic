/* =============================================================================
 *  Dreinn Music — UI-примитивы и переиспользуемые карточки
 * ========================================================================== */

(function (global) {
  'use strict';

  var FALLBACK_COVER = '/img/cover-fallback.svg';

  function esc(value) {
    return String(value === undefined || value === null ? '' : value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function icon(name, size, stroke) {
    return global.Icons.svg(name, { size: size || 20, stroke: stroke || 1.9 });
  }

  function el(html) {
    var wrap = document.createElement('div');
    wrap.innerHTML = String(html).trim();
    return wrap.firstElementChild;
  }

  function fmtDuration(seconds) {
    var total = parseInt(seconds, 10) || 0;
    var m = Math.floor(total / 60);
    var s = total % 60;
    return m + ':' + (s < 10 ? '0' : '') + s;
  }

  function fmtNumber(value) {
    var n = Number(value) || 0;
    if (n >= 1000000) return (n / 1000000).toFixed(1).replace('.0', '') + ' млн';
    if (n >= 1000) return (n / 1000).toFixed(1).replace('.0', '') + 'K';
    return String(n);
  }

  function fmtScore(value) {
    var n = Number(value) || 0;
    return n % 1 === 0 ? String(n) : n.toFixed(1);
  }

  function fmtDate(unix) {
    if (!unix) return '';
    var d = new Date(Number(unix) * 1000);
    return d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' });
  }

  function fmtYear(dateString) {
    if (!dateString) return '';
    return String(dateString).slice(0, 4);
  }

  function plural(n, one, few, many) {
    var count = Math.abs(Number(n) || 0) % 100;
    var last = count % 10;
    if (count > 10 && count < 20) return many;
    if (last > 1 && last < 5) return few;
    if (last === 1) return one;
    return many;
  }

  function cover(url) {
    return url && String(url).indexOf('http') === 0 ? url : FALLBACK_COVER;
  }

  function initials(name) {
    return String(name || '?').trim().slice(0, 1).toUpperCase();
  }

  /* ---------- score ---------- */

  function tierOf(score) {
    var tiers = (global.STATE.config && global.STATE.config.tiers) || [];
    for (var i = 0; i < tiers.length; i += 1) if (score >= tiers[i].min) return tiers[i];
    return { label: '—', color: 'var(--text-mute)', key: 'none' };
  }

  function scoreRing(options) {
    var opts = options || {};
    var max = opts.max || (global.STATE.config ? global.STATE.config.maxScore : 90);
    var value = Math.max(0, Math.min(max, Number(opts.value) || 0));
    var size = opts.size || 148;
    var radius = 62;
    var circumference = 2 * Math.PI * radius;
    var offset = circumference * (1 - value / max);
    var tier = opts.tier || tierOf(value);

    return (
      '<div class="score-ring" style="width:' + size + 'px;height:' + size + 'px">' +
        '<svg viewBox="0 0 148 148">' +
          '<circle class="track-arc" cx="74" cy="74" r="' + radius + '"></circle>' +
          '<circle class="value-arc" cx="74" cy="74" r="' + radius + '" ' +
            'style="stroke:' + (tier.color || 'var(--accent)') + ';stroke-dasharray:' + circumference + ';stroke-dashoffset:' + offset + '"></circle>' +
        '</svg>' +
        '<div class="center">' +
          '<div class="num">' + fmtScore(value) + '<small>/' + max + '</small></div>' +
          '<div class="tier-name">' + esc(tier.label || '') + '</div>' +
        '</div>' +
      '</div>'
    );
  }

  function scorePill(value, options) {
    var opts = options || {};
    if (value === null || value === undefined) {
      return '<span class="score-pill empty">' + (opts.emptyText || '—') + '</span>';
    }
    var tier = tierOf(value);
    return '<span class="score-pill" style="color:' + tier.color + '">' + fmtScore(value) + '<small>/90</small></span>';
  }

  /* ---------- карточки ---------- */

  function trackRow(track, options) {
    var opts = options || {};
    var score = opts.score !== undefined ? opts.score : track.myScore;
    var target = opts.go || 'track:' + track.id;

    return (
      '<div class="row" data-go="' + esc(target) + '">' +
        (opts.rank ? '<div class="rank ' + (opts.rank <= 3 ? 'top' + opts.rank : '') + '">' + opts.rank + '</div>' : '') +
        '<img class="cover" loading="lazy" src="' + esc(cover(track.coverSmall || track.cover)) + '" alt="">' +
        '<div class="body">' +
          '<div class="name">' + esc(track.title) + '</div>' +
          '<div class="meta">' + esc(track.artist || '') + (opts.metaExtra ? ' · ' + esc(opts.metaExtra) : '') + '</div>' +
        '</div>' +
        '<div class="tail">' +
          (score !== null && score !== undefined ? scorePill(score) : '') +
          (track.preview
            ? '<button class="play-btn" data-play=\'' + esc(JSON.stringify({ id: track.id, title: track.title, artist: track.artist, cover: cover(track.cover || track.coverSmall), preview: track.preview })) + '\'>' + icon('play', 16) + '</button>'
            : '') +
        '</div>' +
      '</div>'
    );
  }

  function tile(item, options) {
    var opts = options || {};
    var isArtist = item.type === 'artist';
    var target = opts.go || (isArtist ? 'artist:' + item.id : (item.type === 'album' ? 'album:' + item.id : 'track:' + item.id));
    var title = isArtist ? item.name : item.title;
    var meta = opts.meta !== undefined ? opts.meta : (isArtist ? fmtNumber(item.fans) + ' фанатов' : item.artist);
    var art = cover(isArtist ? item.picture : (item.coverSmall || item.cover));

    return (
      '<div class="tile' + (isArtist ? ' round' : '') + '" data-go="' + esc(target) + '">' +
        '<div class="art">' +
          '<img loading="lazy" src="' + esc(art) + '" alt="">' +
          (item.myScore !== null && item.myScore !== undefined ? '<span class="corner-score">' + fmtScore(item.myScore) + '</span>' : '') +
          (item.preview
            ? '<button class="play-dot" data-play=\'' + esc(JSON.stringify({ id: item.id, title: item.title, artist: item.artist, cover: cover(item.cover), preview: item.preview })) + '\'>' + icon('play', 15) + '</button>'
            : '') +
        '</div>' +
        '<div class="name">' + esc(title) + '</div>' +
        '<div class="meta">' + esc(meta || '') + '</div>' +
      '</div>'
    );
  }

  function sectionHead(title, iconName, linkText, linkTarget) {
    return (
      '<div class="section-head">' +
        '<h2>' + (iconName ? icon(iconName, 18) : '') + esc(title) + '</h2>' +
        (linkText ? '<button class="link" data-go="' + esc(linkTarget || '') + '">' + esc(linkText) + icon('chevron-right', 15) + '</button>' : '') +
      '</div>'
    );
  }

  function emptyState(options) {
    var opts = options || {};
    return (
      '<div class="empty fade-in">' +
        '<div class="badge">' + icon(opts.icon || 'inbox', 30, 1.7) + '</div>' +
        '<h3>' + esc(opts.title || 'Пусто') + '</h3>' +
        '<p>' + esc(opts.text || '') + '</p>' +
        (opts.action ? '<div style="margin-top:18px"><button class="btn btn-primary" data-go="' + esc(opts.actionTarget || '') + '">' + esc(opts.action) + '</button></div>' : '') +
      '</div>'
    );
  }

  /* ---------- skeletons ---------- */

  function skeletonRows(count) {
    var out = '';
    for (var i = 0; i < (count || 4); i += 1) {
      out +=
        '<div class="sk-row">' +
          '<div class="sk sk-cover"></div>' +
          '<div class="sk-lines">' +
            '<div class="sk sk-line" style="width:' + (55 + (i % 3) * 12) + '%"></div>' +
            '<div class="sk sk-line" style="width:' + (32 + (i % 2) * 10) + '%"></div>' +
          '</div>' +
        '</div>';
    }
    return out;
  }

  function skeletonTiles(count) {
    var out = '<div class="hscroll">';
    for (var i = 0; i < (count || 4); i += 1) {
      out += '<div class="sk-tile"><div class="sk sk-art"></div><div class="sk sk-line" style="height:11px;width:75%;border-radius:6px"></div></div>';
    }
    return out + '</div>';
  }

  function skeletonBlock(height, radius) {
    return '<div class="sk" style="height:' + (height || 120) + 'px;border-radius:' + (radius || 26) + 'px;margin-bottom:12px"></div>';
  }

  /* ---------- тосты и шторки ---------- */

  function toast(text, kind) {
    var host = document.getElementById('toast-host');
    if (!host) return;
    var node = el(
      '<div class="toast ' + (kind || '') + '">' +
        icon(kind === 'err' ? 'circle-x' : kind === 'ok' ? 'circle-check' : 'info', 18) +
        '<span>' + esc(text) + '</span>' +
      '</div>'
    );
    host.appendChild(node);
    setTimeout(function () {
      node.classList.add('out');
      setTimeout(function () { node.remove(); }, 280);
    }, 2600);
  }

  function sheet(html) {
    var host = document.getElementById('sheet-host');
    var body = document.getElementById('sheet-body');
    body.innerHTML = html;
    global.Icons.hydrate(body);
    host.classList.add('on');
    return body;
  }

  function closeSheet() {
    document.getElementById('sheet-host').classList.remove('on');
  }

  /* ---------- разбивка оценки ---------- */

  function breakdownList(breakdown, options) {
    var opts = options || {};
    var rows = (breakdown || []).map(function (part) {
      var pct = Math.round((part.value / (part.max || 10)) * 100);
      return (
        '<div class="bd-row">' +
          '<div>' + icon(part.icon || 'star', 17) + '</div>' +
          '<div>' +
            '<div class="lbl">' + esc(part.short || part.title) +
              (opts.showValue === false ? '' : '<span>' + fmtScore(part.value) + ' / ' + part.max + '</span>') +
            '</div>' +
            '<div class="bar"><i style="width:' + pct + '%"></i></div>' +
          '</div>' +
          '<div class="pts">+' + Number(part.points).toFixed(1) + '</div>' +
        '</div>'
      );
    }).join('');
    return '<div class="breakdown">' + rows + '</div>';
  }

  function formulaBlock(score) {
    return (
      '<div class="formula">' +
        '<span>База <b>' + fmtScore(score.base) + '</b>/' + score.baseMax + '</span>' +
        icon('x', 14) +
        '<span>Вайб <b>×' + Number(score.coefficient).toFixed(2) + '</b></span>' +
        icon('equal', 14) +
        '<span>Итог <b>' + fmtScore(score.final) + '</b>/' + score.max + '</span>' +
      '</div>'
    );
  }

  global.UI = {
    esc: esc,
    el: el,
    icon: icon,
    cover: cover,
    initials: initials,
    fmtDuration: fmtDuration,
    fmtNumber: fmtNumber,
    fmtScore: fmtScore,
    fmtDate: fmtDate,
    fmtYear: fmtYear,
    plural: plural,
    tierOf: tierOf,
    scoreRing: scoreRing,
    scorePill: scorePill,
    trackRow: trackRow,
    tile: tile,
    sectionHead: sectionHead,
    emptyState: emptyState,
    skeletonRows: skeletonRows,
    skeletonTiles: skeletonTiles,
    skeletonBlock: skeletonBlock,
    toast: toast,
    sheet: sheet,
    closeSheet: closeSheet,
    breakdownList: breakdownList,
    formulaBlock: formulaBlock,
    FALLBACK_COVER: FALLBACK_COVER
  };
})(window);
