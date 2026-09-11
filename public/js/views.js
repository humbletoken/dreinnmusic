/* =============================================================================
 *  Dreinn Music — экраны: главная, поиск, discover, рейтинги, карточки
 * ========================================================================== */

(function (global) {
  'use strict';

  var UI = global.UI;
  var API = global.API;
  var Views = global.Views || {};

  var TZ_LABELS = {
    'Europe/Moscow': 'Москве', 'Europe/Kiev': 'Киеву', 'Europe/Kyiv': 'Киеву', 'Europe/Minsk': 'Минску',
    'Asia/Almaty': 'Алматы', 'Asia/Tashkent': 'Ташкенту', 'Europe/London': 'Лондону', 'Europe/Berlin': 'Берлину',
    'Asia/Yekaterinburg': 'Екатеринбургу', 'Asia/Novosibirsk': 'Новосибирску', 'Asia/Vladivostok': 'Владивостоку', 'UTC': 'UTC'
  };

  function tzLabel(tz) { return TZ_LABELS[tz] || tz; }

  function head(title, subtitle, options) {
    var opts = options || {};
    return (
      '<div class="screen-head">' +
        (opts.back ? '<button class="icon-btn" data-back>' + UI.icon('arrow-left', 19) + '</button>' : '') +
        '<div class="title-block">' +
          '<h1>' + UI.esc(title) + '</h1>' +
          (subtitle ? '<div class="sub">' + UI.esc(subtitle) + '</div>' : '') +
        '</div>' +
        (opts.action || '') +
      '</div>'
    );
  }

  /* ============================ ГЛАВНАЯ ==================================== */

  Views.home = {
    skeleton: function () {
      return (
        '<div class="screen">' +
          head('Dreinn Music', 'загружаем твою волну') +
          UI.skeletonBlock(150, 34) +
          '<div class="stat-strip">' + UI.skeletonBlock(62, 20) + UI.skeletonBlock(62, 20) + UI.skeletonBlock(62, 20) + '</div>' +
          UI.skeletonTiles(4) +
          UI.skeletonRows(3) +
        '</div>'
      );
    },

    render: function () {
      return API.home()
        .then(function (data) {
          var recos = data.recommended || [];
          var artists = data.artistsForYou || [];
          var stats = data.stats;
          var seeds = data.seeds || { artists: [], genres: [] };

          var html = '<div class="screen">';
          html += head(data.greeting, 'вот что происходит в твоей музыке');

          html +=
            '<div class="hero fade-in">' +
              '<h1>' + (stats.total ? 'Твой счёт растёт' : 'Начни свою коллекцию оценок') + '</h1>' +
              '<div class="tagline">' + (stats.total
                ? 'средний балл ' + UI.fmtScore(stats.avg) + ' из 90 — ' + UI.esc(stats.avgTier.label.toLowerCase()) + '. Ты — ' + UI.esc(stats.archetype.toLowerCase()) + '.'
                : 'четыре критерия дают базу до 75 баллов, вайб — множитель ×0.80…×1.20. Максимум — 90.') + '</div>' +
              '<div style="display:flex;gap:10px">' +
                '<button class="btn btn-primary" data-go="search">' + UI.icon('search', 17) + 'Найти трек</button>' +
                '<button class="btn" data-go="scoring">' + UI.icon('circle-help', 17) + 'Как считаем</button>' +
              '</div>' +
            '</div>';

          html +=
            '<div class="stat-strip stagger">' +
              '<div class="stat"><div class="val">' + stats.total + '</div><div class="lbl">' + UI.plural(stats.total, 'оценка', 'оценки', 'оценок') + '</div></div>' +
              '<div class="stat"><div class="val">' + UI.fmtScore(stats.avg) + '</div><div class="lbl">средний балл</div></div>' +
              '<div class="stat"><div class="val">' + stats.albums + '</div><div class="lbl">' + UI.plural(stats.albums, 'альбом', 'альбома', 'альбомов') + '</div></div>' +
            '</div>';

          if (data.recent && data.recent.length) {
            html += '<div class="section">' + UI.sectionHead('Недавно оценил', 'history', 'вся история', 'history');
            html += data.recent.slice(0, 3).map(function (r) {
              return UI.trackRow(
                { id: r.itemId, title: r.title, artist: r.artist, cover: r.cover, coverSmall: r.cover, preview: r.preview },
                { score: r.final, go: (r.type === 'album' ? 'album:' : 'track:') + r.itemId, metaExtra: r.type === 'album' ? 'альбом' : '' }
              );
            }).join('') + '</div>';
          }

          if (recos.length) {
            var seedNames = (seeds.artists || []).slice(0, 3).map(function (a) { return a.name; });
            html += '<div class="section">' + UI.sectionHead(data.hasSeeds ? 'Подобрано под твой вкус' : 'Может понравиться', 'wand-sparkles');
            if (seedNames.length) {
              html += '<div class="script" style="margin:-6px 0 10px">на основе оценок: ' + UI.esc(seedNames.join(', ')) + '</div>';
            }
            html += '<div class="hscroll">' + recos.slice(0, 14).map(function (t) {
              return UI.tile(t, { meta: t.reason || t.artist });
            }).join('') + '</div></div>';
          }

          if (artists.length) {
            html += '<div class="section">' + UI.sectionHead('Артисты для тебя', 'mic-vocal');
            html += '<div class="hscroll">' + artists.slice(0, 10).map(function (a) {
              return UI.tile(a, { meta: a.reason || (UI.fmtNumber(a.fans) + ' фанатов') });
            }).join('') + '</div></div>';
          }

          html += '<div class="section">' + UI.sectionHead('Мировой чарт', 'flame', 'ещё', 'charts');
          html += '<div class="hscroll">' + (data.chart || []).slice(0, 14).map(function (t) { return UI.tile(t); }).join('') + '</div></div>';

          html += '<div class="section">' + UI.sectionHead('Новые релизы', 'calendar');
          html += '<div class="hscroll">' + (data.releases || []).slice(0, 14).map(function (a) {
            return UI.tile(a, { meta: a.artist });
          }).join('') + '</div>';
          if (data.daily) {
            html +=
              '<div class="pill-note" style="margin-top:6px">' + UI.icon('clock', 15) +
              'Чарт и новинки обновляются в ' + UI.esc(data.daily.refreshAt) + ' по ' + UI.esc(tzLabel(data.daily.timezone)) +
              ' · сейчас ' + UI.esc(data.daily.localTime) + '</div>';
          }
          html += '</div>';

          if (data.community && data.community.topTracks && data.community.topTracks.length) {
            html += '<div class="section">' + UI.sectionHead('Топ сообщества', 'trophy', 'рейтинги', 'charts');
            html += data.community.topTracks.map(function (item, index) {
              return UI.trackRow(item, { rank: index + 1, score: item.avg, go: 'track:' + item.id });
            }).join('');
            html +=
              '<div class="pill-note" style="margin-top:10px">' + UI.icon('users', 16) +
              data.community.totalRatings + ' ' + UI.plural(data.community.totalRatings, 'оценка', 'оценки', 'оценок') +
              ' от ' + data.community.totalUsers + ' ' + UI.plural(data.community.totalUsers, 'слушателя', 'слушателей', 'слушателей') + '</div>';
            html += '</div>';
          }

          return html + '</div>';
        });
    }
  };

  /* ============================== ПОИСК ==================================== */

  Views.search = {
    skeleton: function () {
      return '<div class="screen">' + head('Поиск', 'треки, альбомы, артисты') + UI.skeletonRows(5) + '</div>';
    },

    render: function (params) {
      var type = (params && params.type) || 'track';
      var query = (params && params.q) || '';

      var html = '<div class="screen">';
      html += head('Поиск', 'треки, альбомы, артисты');
      html +=
        '<div class="search-bar">' + UI.icon('search', 19) +
          '<input id="search-input" type="search" placeholder="Что послушаем?" value="' + UI.esc(query) + '" autocomplete="off">' +
          '<button class="icon-btn plain" id="search-clear" hidden>' + UI.icon('x', 17) + '</button>' +
        '</div>';
      html +=
        '<div class="tabs" id="search-tabs">' +
          '<button class="tab' + (type === 'track' ? ' on' : '') + '" data-type="track">Треки</button>' +
          '<button class="tab' + (type === 'album' ? ' on' : '') + '" data-type="album">Альбомы</button>' +
          '<button class="tab' + (type === 'artist' ? ' on' : '') + '" data-type="artist">Артисты</button>' +
        '</div>';
      html += '<div id="search-results">' + UI.emptyState({
        icon: 'search',
        title: 'Что ищем?',
        text: 'Введи название трека, альбома или имя артиста — покажем каталог с превью.'
      }) + '</div>';
      return Promise.resolve(html + '</div>');
    },

    mount: function (root, params) {
      var input = root.querySelector('#search-input');
      var clear = root.querySelector('#search-clear');
      var results = root.querySelector('#search-results');
      var tabs = root.querySelector('#search-tabs');
      var type = (params && params.type) || 'track';
      var timer = null;
      var lastQuery = '';

      function renderItems(data) {
        if (!data.items.length) {
          results.innerHTML = UI.emptyState({ icon: 'inbox', title: 'Ничего не нашлось', text: 'Попробуй другое написание или поищи артиста.' });
          return;
        }
        if (data.type === 'artist') {
          results.innerHTML = '<div class="stagger">' + data.items.map(function (a) {
            return (
              '<div class="row" data-go="artist:' + a.id + '">' +
                '<img class="cover" style="border-radius:50%" loading="lazy" src="' + UI.esc(UI.cover(a.picture)) + '" alt="">' +
                '<div class="body"><div class="name">' + UI.esc(a.name) + '</div>' +
                '<div class="meta">' + UI.fmtNumber(a.fans) + ' фанатов · ' + a.albumCount + ' ' + UI.plural(a.albumCount, 'альбом', 'альбома', 'альбомов') + '</div></div>' +
                '<div class="tail">' + UI.icon('chevron-right', 18) + '</div>' +
              '</div>'
            );
          }).join('') + '</div>';
        } else if (data.type === 'album') {
          results.innerHTML = '<div class="stagger">' + data.items.map(function (a) {
            return UI.trackRow(
              { id: a.id, title: a.title, artist: a.artist, cover: a.cover, coverSmall: a.coverSmall },
              { score: a.myScore, go: 'album:' + a.id, metaExtra: UI.fmtYear(a.releaseDate) }
            );
          }).join('') + '</div>';
        } else {
          results.innerHTML = '<div class="stagger">' + data.items.map(function (t) {
            return UI.trackRow(t, { metaExtra: UI.fmtDuration(t.duration) });
          }).join('') + '</div>';
        }
        global.Icons.hydrate(results);
        global.Player.refreshButtons();
      }

      function run(force) {
        var value = input.value.trim();
        clear.hidden = !value;
        if (value.length < 2) {
          if (!value) results.innerHTML = UI.emptyState({ icon: 'search', title: 'Что ищем?', text: 'Введи название трека, альбома или имя артиста.' });
          return;
        }
        if (!force && value === lastQuery) return;
        lastQuery = value;
        results.innerHTML = UI.skeletonRows(5);
        API.search(value, type, 30).then(renderItems).catch(function () {
          results.innerHTML = UI.emptyState({ icon: 'triangle-alert', title: 'Каталог недоступен', text: 'Попробуй повторить запрос через минуту.' });
        });
      }

      input.addEventListener('input', function () {
        clearTimeout(timer);
        timer = setTimeout(function () { run(false); }, 380);
      });

      clear.addEventListener('click', function () {
        input.value = '';
        lastQuery = '';
        clear.hidden = true;
        results.innerHTML = UI.emptyState({ icon: 'search', title: 'Что ищем?', text: 'Введи название трека, альбома или имя артиста.' });
        input.focus();
      });

      tabs.addEventListener('click', function (event) {
        var tab = event.target.closest('.tab');
        if (!tab) return;
        tabs.querySelectorAll('.tab').forEach(function (t) { t.classList.remove('on'); });
        tab.classList.add('on');
        type = tab.getAttribute('data-type');
        global.TG.haptic('select');
        run(true);
      });

      if (params && params.q) run(true);
      else setTimeout(function () { input.focus(); }, 260);
    }
  };

  /* ============================= DISCOVER ================================== */

  Views.discover = {
    skeleton: function () {
      return '<div class="screen">' + head('Discover', 'новые находки под твой вкус') +
        '<div class="sk" style="height:60vh;min-height:380px;border-radius:34px;margin-bottom:16px"></div></div>';
    },

    render: function () {
      return API.discover(14).then(function (data) {
        var items = data.items || [];
        var html = '<div class="screen">';
        html += head('Discover', 'новые находки под твой вкус');

        if (!items.length) {
          return html + UI.emptyState({
            icon: 'compass',
            title: 'Пока нечего показать',
            text: 'Оцени пару треков — и Discover подстроится под твой вкус.',
            action: 'К поиску',
            actionTarget: 'search'
          }) + '</div>';
        }

        html += '<div class="disc-stack" id="disc-stack"></div>';
        html +=
          '<div class="disc-actions">' +
            '<button class="icon-btn" id="disc-skip" style="width:52px;height:52px">' + UI.icon('x', 20) + '</button>' +
            '<button class="big" id="disc-play">' + UI.icon('play', 24) + '</button>' +
            '<button class="icon-btn" id="disc-fav" style="width:52px;height:52px">' + UI.icon('heart', 20) + '</button>' +
          '</div>';
        html += '<button class="btn btn-primary btn-block" id="disc-rate" style="margin-top:16px">' + UI.icon('star', 18) + 'Оценить этот трек</button>';
        html += '<div class="pill-note" style="margin-top:14px">' + UI.icon('info', 15) + '30-секундные превью предоставлены Deezer</div>';
        html += '</div>';

        Views.discover._items = items;
        return html;
      });
    },

    mount: function (root) {
      var items = Views.discover._items || [];
      var index = 0;
      var stack = root.querySelector('#disc-stack');
      if (!stack) return;

      function card(item, cls) {
        return (
          '<div class="disc-card ' + cls + '">' +
            '<div class="art"><img src="' + UI.esc(UI.cover(item.cover)) + '" alt=""></div>' +
            '<div class="info">' +
              '<h2>' + UI.esc(item.title) + '</h2>' +
              '<div class="artist">' + UI.esc(item.artist) + '</div>' +
              (item.reason ? '<div class="reason">' + UI.icon('sparkles', 14) + UI.esc(item.reason) + '</div>' : '') +
            '</div>' +
          '</div>'
        );
      }

      function draw() {
        var slice = items.slice(index, index + 3).reverse();
        stack.innerHTML = slice.map(function (item, i) {
          var depth = slice.length - 1 - i;
          return card(item, depth === 0 ? '' : depth === 1 ? 'behind' : 'behind2');
        }).join('');
        global.Icons.hydrate(stack);
      }

      function currentItem() { return items[index]; }

      function next() {
        var top = stack.querySelector('.disc-card:last-child');
        if (top) top.classList.add('gone');
        global.TG.haptic('light');
        setTimeout(function () {
          index += 1;
          if (index >= items.length) {
            stack.innerHTML = '';
            root.querySelector('.disc-actions').style.display = 'none';
            root.querySelector('#disc-rate').style.display = 'none';
            stack.appendChild(UI.el(UI.emptyState({
              icon: 'circle-check',
              title: 'Это все находки',
              text: 'Обнови экран, чтобы собрать новую подборку.',
              action: 'Обновить',
              actionTarget: 'discover'
            })));
            return;
          }
          draw();
        }, 320);
      }

      draw();

      root.querySelector('#disc-skip').addEventListener('click', next);

      root.querySelector('#disc-play').addEventListener('click', function () {
        var item = currentItem();
        if (item) global.Player.play({ id: item.id, title: item.title, artist: item.artist, cover: item.cover, preview: item.preview });
      });

      root.querySelector('#disc-fav').addEventListener('click', function () {
        var item = currentItem();
        if (!item) return;
        API.toggleFavorite({
          type: 'track', itemId: item.id, title: item.title, artist: item.artist,
          artistId: item.artistId, cover: item.cover, preview: item.preview, link: item.link
        }).then(function (res) {
          UI.toast(res.favorite ? 'Добавлено в любимое' : 'Убрано из любимого', 'ok');
          global.TG.haptic('success');
          next();
        });
      });

      root.querySelector('#disc-rate').addEventListener('click', function () {
        var item = currentItem();
        if (item) global.App.go('rate', { type: 'track', id: item.id });
      });
    }
  };

  /* ============================= РЕЙТИНГИ ================================== */

  Views.charts = {
    skeleton: function () {
      return '<div class="screen">' + head('Рейтинги', 'лучшее по версии сообщества') + UI.skeletonRows(7) + '</div>';
    },

    render: function () {
      return API.leaderboard().then(function (data) {
        Views.charts._data = data;
        var html = '<div class="screen">';
        html += head('Рейтинги', 'лучшее по версии сообщества');
        html +=
          '<div class="tabs" id="chart-tabs">' +
            '<button class="tab on" data-kind="tracks">Треки</button>' +
            '<button class="tab" data-kind="albums">Альбомы</button>' +
            '<button class="tab" data-kind="users">Слушатели</button>' +
          '</div>';
        html += '<div id="chart-body"></div>';
        return html + '</div>';
      });
    },

    mount: function (root) {
      var data = Views.charts._data || { tracks: [], albums: [], users: [] };
      var body = root.querySelector('#chart-body');
      var tabs = root.querySelector('#chart-tabs');

      function renderKind(kind) {
        var list = data[kind] || [];
        if (!list.length) {
          body.innerHTML = UI.emptyState({
            icon: 'trophy',
            title: 'Рейтинг пока пуст',
            text: 'Оцени что-нибудь — и попадёшь в него первым.',
            action: 'Оценить',
            actionTarget: 'search'
          });
          return;
        }

        if (kind === 'users') {
          body.innerHTML = '<div class="stagger">' + list.map(function (u) {
            return (
              '<div class="row" data-go="profile:' + u.id + '">' +
                '<div class="rank ' + (u.rank <= 3 ? 'top' + u.rank : '') + '">' + u.rank + '</div>' +
                (u.photo
                  ? '<img class="cover" style="border-radius:50%" src="' + UI.esc(u.photo) + '" alt="">'
                  : '<div class="avatar sm">' + UI.esc(UI.initials(u.name)) + '</div>') +
                '<div class="body"><div class="name">' + UI.esc(u.name) + '</div>' +
                '<div class="meta">' + u.ratings + ' ' + UI.plural(u.ratings, 'оценка', 'оценки', 'оценок') + ' · средняя ' + UI.fmtScore(u.avg) + '</div></div>' +
                '<div class="tail">' + UI.icon('chevron-right', 18) + '</div>' +
              '</div>'
            );
          }).join('') + '</div>';
        } else {
          body.innerHTML = '<div class="stagger">' + list.map(function (item) {
            return UI.trackRow(item, {
              rank: item.rank,
              score: item.avg,
              go: (kind === 'albums' ? 'album:' : 'track:') + item.id,
              metaExtra: item.votes + ' ' + UI.plural(item.votes, 'голос', 'голоса', 'голосов')
            });
          }).join('') + '</div>';
        }
        global.Icons.hydrate(body);
        global.Player.refreshButtons();
      }

      tabs.addEventListener('click', function (event) {
        var tab = event.target.closest('.tab');
        if (!tab) return;
        tabs.querySelectorAll('.tab').forEach(function (t) { t.classList.remove('on'); });
        tab.classList.add('on');
        global.TG.haptic('select');
        renderKind(tab.getAttribute('data-kind'));
      });

      renderKind('tracks');
    }
  };

  /* ============================ КАРТОЧКА ТРЕКА ============================= */

  function actionsBar(item, type, state) {
    return (
      '<div class="detail-actions">' +
        (item.preview
          ? '<button class="btn" data-play=\'' + UI.esc(JSON.stringify({ id: item.id, title: item.title, artist: item.artist, cover: item.cover, preview: item.preview })) + '\'>' + UI.icon('play', 18) + 'Превью</button>'
          : '') +
        '<button class="btn btn-primary" data-go="rate:' + type + ':' + item.id + '">' + UI.icon('star', 18) + (state.rated ? 'Изменить' : 'Оценить') + '</button>' +
        '<button class="icon-btn' + (state.favorite ? ' active' : '') + '" id="fav-toggle">' + UI.icon('heart', 19) + '</button>' +
        '<button class="icon-btn" id="more-btn">' + UI.icon('ellipsis', 19) + '</button>' +
      '</div>'
    );
  }

  function myRatingBlock(rating, type, id) {
    if (!rating) {
      return (
        '<div class="card" style="text-align:center">' +
          '<div style="color:var(--text-dim);font-size:13.5px;margin-bottom:12px">Ты ещё не оценил это</div>' +
          '<button class="btn btn-primary btn-block" data-go="rate:' + type + ':' + id + '">' + UI.icon('star', 18) + 'Поставить оценку</button>' +
        '</div>'
      );
    }
    return (
      '<div class="card">' +
        '<div style="display:flex;align-items:center;gap:16px">' +
          UI.scoreRing({ value: rating.final, size: 108, tier: rating.tier }) +
          '<div style="flex:1;min-width:0">' +
            '<div style="font-family:var(--font-display);font-size:15px;font-weight:700">' + UI.esc(rating.tier.label) + '</div>' +
            '<div style="color:var(--text-dim);font-size:12.5px;margin-top:3px">База ' + UI.fmtScore(rating.base) + '/' + 75 + ' × ' + Number(rating.coefficient).toFixed(2) + '</div>' +
            '<button class="btn btn-sm" data-go="rate:' + type + ':' + id + '" style="margin-top:11px">' + UI.icon('pencil', 15) + 'Изменить</button>' +
          '</div>' +
        '</div>' +
        '<div class="divider"></div>' +
        UI.breakdownList(rating.breakdown) +
        '<div class="bd-row" style="margin-top:10px">' +
          '<div>' + UI.icon('vibe', 17) + '</div>' +
          '<div><div class="lbl">Вайб<span>' + UI.fmtScore(rating.values.vibe) + ' / 10</span></div>' +
          '<div class="bar"><i style="width:' + (rating.values.vibe / 10) * 100 + '%"></i></div></div>' +
          '<div class="pts">×' + Number(rating.coefficient).toFixed(2) + '</div>' +
        '</div>' +
        (rating.review ? '<div class="divider"></div><div style="font-size:13.5px;color:var(--text-dim);line-height:1.5">' + UI.icon('quote', 15) + ' ' + UI.esc(rating.review) + '</div>' : '') +
      '</div>'
    );
  }

  function communityBlock(community) {
    if (!community || !community.count) {
      return '<div class="pill-note">' + UI.icon('users', 16) + 'Пока никто не оценил — будь первым</div>';
    }
    var html =
      '<div class="card">' +
        '<div style="display:flex;align-items:center;gap:12px;margin-bottom:14px">' +
          '<div style="font-family:var(--font-display);font-size:26px;font-weight:800;color:' + community.tier.color + '">' + UI.fmtScore(community.avg) + '</div>' +
          '<div><div style="font-weight:650;font-size:14px">' + UI.esc(community.tier.label) + '</div>' +
          '<div style="color:var(--text-dim);font-size:12px">' + community.count + ' ' + UI.plural(community.count, 'оценка', 'оценки', 'оценок') + ' сообщества</div></div>' +
        '</div>' +
        UI.breakdownList(community.criteria.map(function (c) {
          return { icon: c.icon, short: c.short, value: c.avg, max: c.max, points: c.avg * 1.875 };
        })) +
      '</div>';

    if (community.reviews && community.reviews.length) {
      html += '<div class="section" style="margin-top:16px">' + UI.sectionHead('Отзывы', 'speech');
      html += community.reviews.slice(0, 5).map(function (r) {
        return (
          '<div class="review-card">' +
            '<div class="head">' +
              (r.user.photo ? '<img class="avatar sm" src="' + UI.esc(r.user.photo) + '" alt="">' : '<div class="avatar sm">' + UI.esc(UI.initials(r.user.name)) + '</div>') +
              '<div class="who">' + UI.esc(r.user.name) + '</div>' +
              UI.scorePill(r.score) +
            '</div>' +
            '<p>' + UI.esc(r.text) + '</p>' +
          '</div>'
        );
      }).join('');
      html += '</div>';
    }
    return html;
  }

  function detailSkeleton(title) {
    return (
      '<div class="screen">' +
        head(title, '', { back: true }) +
        '<div class="detail-hero"><div class="sk" style="width:min(232px,62vw);aspect-ratio:1;margin:0 auto 18px;border-radius:30px"></div>' +
        '<div class="sk" style="height:20px;width:60%;margin:0 auto 10px;border-radius:8px"></div>' +
        '<div class="sk" style="height:13px;width:40%;margin:0 auto;border-radius:7px"></div></div>' +
        UI.skeletonBlock(120, 26) + UI.skeletonBlock(160, 26) +
      '</div>'
    );
  }

  Views.track = {
    skeleton: function () { return detailSkeleton('Трек'); },

    render: function (params) {
      return API.track(params.id).then(function (data) {
        var t = data.item;
        Views.track._data = data;

        var facts = [];
        if (t.album) facts.push(t.album);
        facts.push(UI.fmtDuration(t.duration));
        if (t.releaseDate) facts.push(UI.fmtYear(t.releaseDate));
        if (data.album && data.album.genre) facts.push(data.album.genre);
        if (t.explicit) facts.push('explicit');

        var html = '<div class="screen">';
        html += head('Трек', '', { back: true });
        html +=
          '<div class="detail-hero">' +
            '<div class="art"><img src="' + UI.esc(UI.cover(t.cover)) + '" alt=""></div>' +
            '<h1>' + UI.esc(t.title) + '</h1>' +
            '<div class="artist" data-go="artist:' + t.artistId + '">' + UI.esc(t.artist) + '</div>' +
            '<div class="facts">' + facts.map(function (f) { return '<span class="chip">' + UI.esc(f) + '</span>'; }).join('') + '</div>' +
          '</div>';
        html += actionsBar(t, 'track', { rated: Boolean(data.myRating), favorite: data.favorite });
        html += '<div class="section">' + UI.sectionHead('Твоя оценка', 'star') + myRatingBlock(data.myRating, 'track', t.id) + '</div>';
        html += '<div class="section">' + UI.sectionHead('Сообщество', 'users') + communityBlock(data.community) + '</div>';

        if (data.album) {
          html += '<div class="section">' + UI.sectionHead('Из альбома', 'album');
          html += UI.trackRow(
            { id: data.album.id, title: data.album.title, artist: data.album.artist, cover: data.album.cover, coverSmall: data.album.coverSmall },
            { go: 'album:' + data.album.id, metaExtra: data.album.trackCount + ' ' + UI.plural(data.album.trackCount, 'трек', 'трека', 'треков') }
          );
          html += '</div>';
        }

        return html + '</div>';
      });
    },

    mount: function (root, params) {
      var data = Views.track._data;
      bindDetailActions(root, data.item, 'track', data.favorite, params);
    }
  };

  function bindDetailActions(root, item, type, favorite, params) {
    var favBtn = root.querySelector('#fav-toggle');
    if (favBtn) {
      favBtn.addEventListener('click', function () {
        API.toggleFavorite({
          type: type, itemId: item.id, title: item.title, artist: item.artist,
          artistId: item.artistId, cover: item.cover, preview: item.preview, link: item.link
        }).then(function (res) {
          favBtn.classList.toggle('active', res.favorite);
          UI.toast(res.favorite ? 'В любимом' : 'Убрано из любимого', 'ok');
          global.TG.haptic('success');
        });
      });
    }

    var moreBtn = root.querySelector('#more-btn');
    if (moreBtn) {
      moreBtn.addEventListener('click', function () {
        var body = UI.sheet(
          '<h2 style="font-size:18px;margin-bottom:14px">' + UI.esc(item.title) + '</h2>' +
          '<div class="menu-list">' +
            '<button class="menu-item" data-act="collection"><span class="glyph">' + UI.icon('list-plus', 18) + '</span><span class="txt"><b>В коллекцию</b><span>Добавить в свою подборку</span></span></button>' +
            '<button class="menu-item" data-act="share"><span class="glyph">' + UI.icon('share-2', 18) + '</span><span class="txt"><b>Поделиться</b><span>Отправить в Telegram</span></span></button>' +
            (item.link ? '<button class="menu-item" data-act="deezer"><span class="glyph">' + UI.icon('external-link', 18) + '</span><span class="txt"><b>Открыть в Deezer</b><span>Полная версия трека</span></span></button>' : '') +
          '</div>'
        );

        body.addEventListener('click', function (event) {
          var btn = event.target.closest('[data-act]');
          if (!btn) return;
          var act = btn.getAttribute('data-act');
          UI.closeSheet();

          if (act === 'deezer' && item.link) global.TG.openLink(item.link);
          if (act === 'share') {
            var botUsername = global.STATE.config && global.STATE.config.botUsername;
            var link = botUsername ? 'https://t.me/' + botUsername + '?start=' + type + '_' + item.id : global.location.origin;
            global.TG.share('Оцени «' + (item.title || '') + '» в Dreinn Music', link);
          }
          if (act === 'collection') global.Views.collections.pickFor(item, type);
        });
      });
    }
    void params;
    void favorite;
  }

  /* ============================ КАРТОЧКА АЛЬБОМА =========================== */

  Views.album = {
    skeleton: function () { return detailSkeleton('Альбом'); },

    render: function (params) {
      return API.album(params.id).then(function (data) {
        var a = data.item;
        Views.album._data = data;

        var facts = [];
        if (a.releaseDate) facts.push(UI.fmtYear(a.releaseDate));
        facts.push(a.trackCount + ' ' + UI.plural(a.trackCount, 'трек', 'трека', 'треков'));
        if (a.genre) facts.push(a.genre);
        if (a.recordType) facts.push(a.recordType);

        var html = '<div class="screen">';
        html += head('Альбом', '', { back: true });
        html +=
          '<div class="detail-hero">' +
            '<div class="art"><img src="' + UI.esc(UI.cover(a.cover)) + '" alt=""></div>' +
            '<h1>' + UI.esc(a.title) + '</h1>' +
            '<div class="artist" data-go="artist:' + a.artistId + '">' + UI.esc(a.artist) + '</div>' +
            '<div class="facts">' + facts.map(function (f) { return '<span class="chip">' + UI.esc(f) + '</span>'; }).join('') + '</div>' +
          '</div>';
        html += actionsBar({ id: a.id, title: a.title, artist: a.artist, cover: a.cover, link: a.link }, 'album', {
          rated: Boolean(data.myRating), favorite: data.favorite
        });

        var ctx = data.trackContext || { rated: 0, total: a.trackCount, weight: 0 };
        html +=
          '<div class="pill-note" style="width:100%;margin-bottom:16px">' + UI.icon('info', 16) +
            'Оценено треков: ' + ctx.rated + ' из ' + (ctx.total || a.trackCount) +
            ' · вклад в оценку альбома ' + Math.round((ctx.weight || 0) * 100) + '%' +
          '</div>';

        html += '<div class="section">' + UI.sectionHead('Твоя оценка альбома', 'star') + myRatingBlock(data.myRating, 'album', a.id) + '</div>';

        html += '<div class="section">' + UI.sectionHead('Треки', 'list-music');
        html += '<div class="stagger">' + (data.tracks || []).map(function (t, index) {
          return UI.trackRow(t, { rank: index + 1, score: t.myScore, metaExtra: UI.fmtDuration(t.duration) });
        }).join('') + '</div></div>';

        html += '<div class="section">' + UI.sectionHead('Сообщество', 'users') + communityBlock(data.community) + '</div>';
        return html + '</div>';
      });
    },

    mount: function (root, params) {
      var data = Views.album._data;
      bindDetailActions(root, data.item, 'album', data.favorite, params);
    }
  };

  /* ============================ КАРТОЧКА АРТИСТА =========================== */

  Views.artist = {
    skeleton: function () { return detailSkeleton('Артист'); },

    render: function (params) {
      return API.artist(params.id).then(function (data) {
        var a = data.item;
        var html = '<div class="screen">';
        html += head('Артист', '', { back: true });
        html +=
          '<div class="detail-hero">' +
            '<div class="art round"><img src="' + UI.esc(UI.cover(a.picture)) + '" alt=""></div>' +
            '<h1>' + UI.esc(a.name) + '</h1>' +
            '<div class="artist">' + UI.fmtNumber(a.fans) + ' фанатов · ' + a.albumCount + ' ' + UI.plural(a.albumCount, 'релиз', 'релиза', 'релизов') + '</div>' +
          '</div>';

        if (data.myStats.count) {
          html +=
            '<div class="card" style="display:flex;align-items:center;gap:14px;margin-bottom:20px">' +
              '<div style="font-family:var(--font-display);font-size:24px;font-weight:800;color:' + data.myStats.tier.color + '">' + UI.fmtScore(data.myStats.avg) + '</div>' +
              '<div><div style="font-weight:650">Твоя средняя по артисту</div>' +
              '<div style="color:var(--text-dim);font-size:12.5px">' + data.myStats.count + ' ' + UI.plural(data.myStats.count, 'оценка', 'оценки', 'оценок') + ' · ' + UI.esc(data.myStats.tier.label) + '</div></div>' +
            '</div>';
        }

        html += '<div class="section">' + UI.sectionHead('Популярные треки', 'flame');
        html += '<div class="stagger">' + (data.topTracks || []).map(function (t, i) {
          return UI.trackRow(t, { rank: i + 1, score: t.myScore, metaExtra: UI.fmtDuration(t.duration) });
        }).join('') + '</div></div>';

        html += '<div class="section">' + UI.sectionHead('Альбомы', 'album');
        html += '<div class="hscroll">' + (data.albums || []).map(function (album) {
          return UI.tile(album, { meta: UI.fmtYear(album.releaseDate) + ' · ' + album.trackCount + ' тр.' });
        }).join('') + '</div></div>';

        return html + '</div>';
      });
    }
  };

  /* ========================= КАК СЧИТАЕТСЯ ОЦЕНКА ========================== */

  Views.scoring = {
    render: function () {
      var cfg = global.STATE.config;
      var html = '<div class="screen">';
      html += head('Система оценок', 'до ' + cfg.maxScore + ' баллов', { back: true });

      html +=
        '<div class="card fade-in" style="margin-bottom:16px">' +
          '<div style="display:flex;align-items:center;gap:14px">' +
            UI.scoreRing({ value: cfg.maxScore, size: 104, tier: cfg.tiers[0] }) +
            '<div><div style="font-family:var(--font-display);font-weight:700;font-size:15px">Dreinn Score</div>' +
            '<div style="color:var(--text-dim);font-size:13px;margin-top:4px">Четыре критерия дают базу до ' + cfg.baseMax +
            ' баллов, пятый — вайб — превращается в множитель.</div></div>' +
          '</div>' +
        '</div>';

      html += '<div class="section">' + UI.sectionHead('Критерии трека', 'music');
      html += '<div class="menu-list stagger">' + cfg.trackCriteria.map(function (c) {
        return (
          '<div class="menu-item"><span class="glyph">' + UI.icon(c.icon, 18) + '</span>' +
          '<span class="txt"><b>' + UI.esc(c.title) + '</b><span>' + UI.esc(c.hint) + '</span></span>' +
          '<span class="score-pill">' + (cfg.critMax * cfg.pointsPerUnit).toFixed(1) + '<small>макс</small></span></div>'
        );
      }).join('') + '</div></div>';

      html += '<div class="section">' + UI.sectionHead('Множитель вайба', 'sparkles');
      html +=
        '<div class="card">' +
          '<div style="font-size:13.5px;color:var(--text-dim);line-height:1.55">' +
            '«' + UI.esc(cfg.vibeCriterion.title) + '» не складывается с остальными: он умножает базу.<br>' +
            'Коэффициент = ' + cfg.vibeBaseK + ' + ' + cfg.vibeStepK + ' × вайб → <b style="color:var(--text)">×0.80 … ×1.20</b>.<br>' +
            'Итог = база × коэффициент, максимум <b style="color:var(--text)">' + cfg.maxScore + '</b>.' +
          '</div>' +
        '</div></div>';

      html += '<div class="section">' + UI.sectionHead('Критерии альбома', 'album');
      html += '<div class="menu-list stagger">' + cfg.albumCriteria.map(function (c) {
        return (
          '<div class="menu-item"><span class="glyph">' + UI.icon(c.icon, 18) + '</span>' +
          '<span class="txt"><b>' + UI.esc(c.title) + '</b><span>' + UI.esc(c.hint) + '</span></span></div>'
        );
      }).join('') + '</div>';
      html +=
        '<div class="pill-note" style="margin-top:12px">' + UI.icon('info', 16) +
        'Оценки отдельных треков влияют на альбом: до ' + Math.round(cfg.trackWeightInAlbum * 100) + '% при полном покрытии</div></div>';

      html += '<div class="section">' + UI.sectionHead('Шкала', 'gauge');
      html += '<div class="menu-list">' + cfg.tiers.map(function (t) {
        return (
          '<div class="menu-item"><span class="glyph" style="color:' + t.color + '">' + UI.icon('star', 18) + '</span>' +
          '<span class="txt"><b>' + UI.esc(t.label) + '</b><span>от ' + t.min + ' баллов</span></span></div>'
        );
      }).join('') + '</div></div>';

      return Promise.resolve(html + '</div>');
    }
  };

  global.Views = Views;
})(window);
