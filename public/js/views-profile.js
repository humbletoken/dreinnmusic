/* =============================================================================
 *  Dreinn Music — профиль, история, любимое, коллекции, сравнение, Spotify
 * ========================================================================== */

(function (global) {
  'use strict';

  var UI = global.UI;
  var API = global.API;
  var Views = global.Views || {};

  function head(title, subtitle, back) {
    return (
      '<div class="screen-head">' +
        (back ? '<button class="icon-btn" data-back>' + UI.icon('arrow-left', 19) + '</button>' : '') +
        '<div class="title-block"><h1>' + UI.esc(title) + '</h1>' +
        (subtitle ? '<div class="sub">' + UI.esc(subtitle) + '</div>' : '') + '</div>' +
      '</div>'
    );
  }

  function avatar(user, size) {
    if (user.photo) return '<img class="avatar' + (size === 'sm' ? ' sm' : '') + '" src="' + UI.esc(user.photo) + '" alt="">';
    return '<div class="avatar' + (size === 'sm' ? ' sm' : '') + '">' + UI.esc(UI.initials(user.name)) + '</div>';
  }

  /* ============================== ПРОФИЛЬ ================================== */

  Views.profile = {
    skeleton: function () {
      return (
        '<div class="screen">' +
          '<div class="profile-head"><div class="sk" style="width:72px;height:72px;border-radius:26px"></div>' +
          '<div style="flex:1"><div class="sk" style="height:20px;width:60%;border-radius:8px;margin-bottom:8px"></div>' +
          '<div class="sk" style="height:12px;width:40%;border-radius:6px"></div></div></div>' +
          '<div class="grid-3" style="margin-bottom:20px">' + UI.skeletonBlock(62, 20) + UI.skeletonBlock(62, 20) + UI.skeletonBlock(62, 20) + '</div>' +
          UI.skeletonBlock(160, 26) + UI.skeletonBlock(200, 26) +
        '</div>'
      );
    },

    render: function (params) {
      var userId = params && params.userId ? params.userId : null;
      return API.profile(userId).then(function (data) {
        var user = data.user;
        var stats = data.stats;
        var totals = stats.totals;
        var isSelf = user.isSelf;

        var html = '<div class="screen">';
        if (!isSelf) html += head('Профиль', '', true);

        html +=
          '<div class="profile-head fade-in">' +
            avatar(user) +
            '<div class="who">' +
              '<h1>' + UI.esc(user.name) + '</h1>' +
              '<div class="tagline">' + UI.esc(stats.taste.archetype) + ' · ' + UI.esc(stats.taste.generosity) + ' критик</div>' +
            '</div>' +
            (isSelf
              ? '<button class="icon-btn" data-go="scoring">' + UI.icon('circle-help', 19) + '</button>'
              : '<button class="icon-btn" data-go="compare:' + user.id + '">' + UI.icon('swords', 19) + '</button>') +
          '</div>';

        html +=
          '<div class="grid-3 stagger" style="margin-bottom:12px">' +
            '<div class="stat"><div class="val">' + totals.total + '</div><div class="lbl">оценок</div></div>' +
            '<div class="stat"><div class="val" style="color:' + stats.scores.avgTier.color + '">' + UI.fmtScore(stats.scores.avg) + '</div><div class="lbl">средняя</div></div>' +
            '<div class="stat"><div class="val">' + UI.fmtScore(stats.scores.max) + '</div><div class="lbl">максимум</div></div>' +
          '</div>';

        html +=
          '<div class="grid-3 stagger" style="margin-bottom:22px">' +
            '<div class="stat"><div class="val">' + totals.tracks + '</div><div class="lbl">треков</div></div>' +
            '<div class="stat"><div class="val">' + totals.albums + '</div><div class="lbl">альбомов</div></div>' +
            '<div class="stat"><div class="val">' + totals.reviews + '</div><div class="lbl">отзывов</div></div>' +
          '</div>';

        if (totals.total) {
          var maxCount = Math.max.apply(null, stats.buckets.map(function (b) { return b.count; })) || 1;
          html += '<div class="section">' + UI.sectionHead('Распределение оценок', 'chart-column');
          html += '<div class="card"><div class="bars">' + stats.buckets.map(function (b) {
            var pct = Math.max(4, Math.round((b.count / maxCount) * 100));
            return (
              '<div class="bar-col">' +
                '<div class="cnt">' + (b.count || '') + '</div>' +
                '<div class="stem" style="height:' + pct + '%">' + (b.count ? '<i></i>' : '') + '</div>' +
                '<div class="cap">' + b.from + '</div>' +
              '</div>'
            );
          }).join('') + '</div></div></div>';

          html += '<div class="section">' + UI.sectionHead('Средние по критериям', 'sliders-horizontal');
          html += '<div class="card">' + UI.breakdownList(stats.criteria.track.map(function (c) {
            return { icon: c.icon, short: c.short, value: c.avg, max: c.max, points: c.avg * 1.875 };
          }));
          html +=
            '<div class="bd-row" style="margin-top:10px">' +
              '<div>' + UI.icon('vibe', 17) + '</div>' +
              '<div><div class="lbl">Вайб<span>' + UI.fmtScore(stats.criteria.vibe.avg) + ' / 10</span></div>' +
              '<div class="bar"><i style="width:' + (stats.criteria.vibe.avg / 10) * 100 + '%"></i></div></div>' +
              '<div class="pts">×' + (0.8 + 0.04 * stats.criteria.vibe.avg).toFixed(2) + '</div>' +
            '</div></div></div>';

          if (stats.criteria.album.some(function (c) { return c.avg > 0; })) {
            html += '<div class="section">' + UI.sectionHead('Критерии альбомов', 'album');
            html += '<div class="card">' + UI.breakdownList(stats.criteria.album.map(function (c) {
              return { icon: c.icon, short: c.short, value: c.avg, max: c.max, points: c.avg * 1.875 };
            })) + '</div></div>';
          }
        }

        if (stats.topArtists.length) {
          html += '<div class="section">' + UI.sectionHead('Любимые артисты', 'mic-vocal');
          html += '<div class="stagger">' + stats.topArtists.slice(0, 5).map(function (a) {
            return (
              '<div class="row"' + (a.artistId ? ' data-go="artist:' + a.artistId + '"' : '') + '>' +
                '<img class="cover" src="' + UI.esc(UI.cover(a.cover)) + '" alt="">' +
                '<div class="body"><div class="name">' + UI.esc(a.artist) + '</div>' +
                '<div class="meta">' + a.count + ' ' + UI.plural(a.count, 'оценка', 'оценки', 'оценок') + '</div></div>' +
                '<div class="tail">' + UI.scorePill(a.avg) + '</div>' +
              '</div>'
            );
          }).join('') + '</div></div>';
        }

        if (stats.topGenres.length) {
          html += '<div class="section">' + UI.sectionHead('Жанры', 'palette');
          html += '<div class="chips">' + stats.topGenres.map(function (g) {
            return '<span class="chip">' + UI.esc(g.genre) + ' · ' + UI.fmtScore(g.avg) + '</span>';
          }).join('') + '</div></div>';
        }

        if (stats.best.length) {
          html += '<div class="section">' + UI.sectionHead('Личный топ', 'trophy', isSelf ? 'вся история' : '', 'history');
          html += stats.best.map(function (r, i) {
            return UI.trackRow(
              { id: r.itemId, title: r.title, artist: r.artist, cover: r.cover, coverSmall: r.cover, preview: r.preview },
              { rank: i + 1, score: r.final, go: (r.type === 'album' ? 'album:' : 'track:') + r.itemId }
            );
          }).join('') + '</div>';
        }

        if (isSelf) {
          html += '<div class="section">' + UI.sectionHead('Разделы', 'layers');
          html += '<div class="menu-list stagger">' +
            menuItem('history', 'rotate-ccw', 'История оценок', totals.total + ' ' + UI.plural(totals.total, 'запись', 'записи', 'записей')) +
            menuItem('favorites', 'heart', 'Любимое', totals.favorites + ' ' + UI.plural(totals.favorites, 'объект', 'объекта', 'объектов')) +
            menuItem('collections', 'library', 'Коллекции', totals.collections + ' ' + UI.plural(totals.collections, 'коллекция', 'коллекции', 'коллекций')) +
            menuItem('compare', 'swords', 'Сравнить вкусы', 'Найди музыкального двойника') +
            (global.STATE.config.spotifyEnabled
              ? menuItem('spotify', 'brand-spotify', 'Spotify', global.STATE.spotify && global.STATE.spotify.connected ? 'Подключён' : 'Подключить аккаунт')
              : '') +
            menuItem('scoring', 'gauge', 'Система оценок', 'Как считается Dreinn Score') +
            (global.STATE.user && global.STATE.user.isAdmin
              ? menuItem('admin', 'shield', 'Админ-панель', 'Spotify, настройки, пользователи, рассылка')
              : '') +
            '</div></div>';
        }

        if (data.collections && data.collections.length) {
          html += '<div class="section">' + UI.sectionHead('Коллекции', 'library', isSelf ? 'все' : '', 'collections');
          html += '<div class="hscroll">' + data.collections.slice(0, 8).map(function (c) {
            return (
              '<div class="tile" data-go="collection:' + c.id + '">' +
                '<div class="art"><img src="' + UI.esc(UI.cover(c.cover)) + '" alt=""></div>' +
                '<div class="name">' + UI.esc(c.name) + '</div>' +
                '<div class="meta">' + c.count + ' ' + UI.plural(c.count, 'трек', 'трека', 'треков') + '</div>' +
              '</div>'
            );
          }).join('') + '</div></div>';
        }

        if (!totals.total) {
          html += UI.emptyState({
            icon: 'star',
            title: 'Профиль пока пустой',
            text: 'Оцени первый трек — здесь появится статистика, распределение баллов и портрет вкуса.',
            action: 'Найти музыку',
            actionTarget: 'search'
          });
        }

        return html + '</div>';
      });
    }
  };

  function menuItem(target, iconName, title, subtitle) {
    return (
      '<button class="menu-item" data-go="' + target + '">' +
        '<span class="glyph">' + UI.icon(iconName, 18) + '</span>' +
        '<span class="txt"><b>' + UI.esc(title) + '</b><span>' + UI.esc(subtitle) + '</span></span>' +
        UI.icon('chevron-right', 17) +
      '</button>'
    );
  }

  /* ============================== ИСТОРИЯ ================================== */

  Views.history = {
    skeleton: function () { return '<div class="screen">' + head('История оценок', '', true) + UI.skeletonRows(6) + '</div>'; },

    render: function () {
      var html = '<div class="screen">';
      html += head('История оценок', 'всё, что ты оценил', true);
      html +=
        '<div class="tabs" id="hist-type">' +
          '<button class="tab on" data-type="">Всё</button>' +
          '<button class="tab" data-type="track">Треки</button>' +
          '<button class="tab" data-type="album">Альбомы</button>' +
        '</div>' +
        '<div class="chips" style="margin-bottom:14px" id="hist-sort">' +
          '<button class="chip on" data-sort="recent">' + UI.icon('clock', 14) + 'Свежие</button>' +
          '<button class="chip" data-sort="best">' + UI.icon('trending-up', 14) + 'Лучшие</button>' +
          '<button class="chip" data-sort="worst">' + UI.icon('chevrons-up-down', 14) + 'Слабые</button>' +
        '</div>' +
        '<div id="hist-body">' + UI.skeletonRows(5) + '</div>';
      return Promise.resolve(html + '</div>');
    },

    mount: function (root) {
      var body = root.querySelector('#hist-body');
      var type = '';
      var sort = 'recent';

      function load() {
        body.innerHTML = UI.skeletonRows(5);
        API.ratings({ type: type, sort: sort, limit: 60 }).then(function (data) {
          if (!data.items.length) {
            body.innerHTML = UI.emptyState({ icon: 'inbox', title: 'Пока пусто', text: 'Здесь появятся все твои оценки.', action: 'Оценить', actionTarget: 'search' });
            return;
          }
          body.innerHTML =
            '<div class="pill-note" style="margin-bottom:12px">' + UI.icon('hash', 15) + data.total + ' ' + UI.plural(data.total, 'оценка', 'оценки', 'оценок') + '</div>' +
            '<div class="stagger">' + data.items.map(function (r) {
              return UI.trackRow(
                { id: r.itemId, title: r.title, artist: r.artist, cover: r.cover, coverSmall: r.cover, preview: r.preview },
                {
                  score: r.final,
                  go: (r.type === 'album' ? 'album:' : 'track:') + r.itemId,
                  metaExtra: (r.type === 'album' ? 'альбом · ' : '') + UI.fmtDate(r.updatedAt)
                }
              );
            }).join('') + '</div>';
          global.Icons.hydrate(body);
          global.Player.refreshButtons();
        });
      }

      root.querySelector('#hist-type').addEventListener('click', function (event) {
        var tab = event.target.closest('.tab');
        if (!tab) return;
        root.querySelectorAll('#hist-type .tab').forEach(function (t) { t.classList.remove('on'); });
        tab.classList.add('on');
        type = tab.getAttribute('data-type');
        global.TG.haptic('select');
        load();
      });

      root.querySelector('#hist-sort').addEventListener('click', function (event) {
        var chip = event.target.closest('.chip');
        if (!chip) return;
        root.querySelectorAll('#hist-sort .chip').forEach(function (c) { c.classList.remove('on'); });
        chip.classList.add('on');
        sort = chip.getAttribute('data-sort');
        global.TG.haptic('select');
        load();
      });

      load();
    }
  };

  /* ============================== ЛЮБИМОЕ ================================= */

  Views.favorites = {
    skeleton: function () { return '<div class="screen">' + head('Любимое', '', true) + UI.skeletonRows(5) + '</div>'; },

    render: function () {
      return API.favorites().then(function (data) {
        var items = data.items || [];
        var html = '<div class="screen">';
        html += head('Любимое', items.length + ' ' + UI.plural(items.length, 'объект', 'объекта', 'объектов'), true);

        if (!items.length) {
          return html + UI.emptyState({
            icon: 'heart',
            title: 'Здесь пока пусто',
            text: 'Нажимай на сердечко в карточке трека или альбома — они соберутся тут.',
            action: 'К поиску',
            actionTarget: 'search'
          }) + '</div>';
        }

        html += '<div class="stagger">' + items.map(function (f) {
          return UI.trackRow(
            { id: f.itemId, title: f.title, artist: f.artist, cover: f.cover, coverSmall: f.cover, preview: f.preview },
            {
              score: f.rating ? f.rating.final : null,
              go: (f.type === 'album' ? 'album:' : 'track:') + f.itemId,
              metaExtra: f.type === 'album' ? 'альбом' : ''
            }
          );
        }).join('') + '</div>';

        return html + '</div>';
      });
    }
  };

  /* ============================= КОЛЛЕКЦИИ ================================ */

  Views.collections = {
    skeleton: function () { return '<div class="screen">' + head('Коллекции', '', true) + UI.skeletonRows(4) + '</div>'; },

    render: function () {
      return API.collections().then(function (data) {
        var items = data.items || [];
        var html = '<div class="screen">';
        html += head('Коллекции', 'свои подборки треков и альбомов', true);
        html += '<button class="btn btn-primary btn-block" id="new-collection" style="margin-bottom:16px">' + UI.icon('folder-plus', 18) + 'Новая коллекция</button>';

        if (!items.length) {
          return html + UI.emptyState({
            icon: 'library',
            title: 'Коллекций ещё нет',
            text: 'Собирай подборки: «Лучшее за год», «На вечер», импорт плейлистов Spotify.'
          }) + '</div>';
        }

        html += '<div class="stagger">' + items.map(function (c) {
          return (
            '<div class="row" data-go="collection:' + c.id + '">' +
              '<img class="cover" src="' + UI.esc(UI.cover(c.cover)) + '" alt="">' +
              '<div class="body"><div class="name">' + UI.esc(c.name) + '</div>' +
              '<div class="meta">' + c.count + ' ' + UI.plural(c.count, 'объект', 'объекта', 'объектов') +
              (c.source === 'spotify' ? ' · Spotify' : '') + '</div></div>' +
              '<div class="tail">' + UI.icon('chevron-right', 18) + '</div>' +
            '</div>'
          );
        }).join('') + '</div>';

        return html + '</div>';
      });
    },

    mount: function (root) {
      var btn = root.querySelector('#new-collection');
      if (btn) btn.addEventListener('click', function () { Views.collections.createDialog(); });
    },

    createDialog: function (onDone) {
      var body = UI.sheet(
        '<h2 style="font-size:19px;margin-bottom:14px">Новая коллекция</h2>' +
        '<div class="search-bar"><input id="col-name" placeholder="Название" maxlength="60"></div>' +
        '<textarea class="review" id="col-desc" style="min-height:70px" placeholder="Описание (по желанию)" maxlength="300"></textarea>' +
        '<button class="btn btn-primary btn-block" id="col-create" style="margin-top:14px">' + UI.icon('check', 18) + 'Создать</button>'
      );

      body.querySelector('#col-create').addEventListener('click', function () {
        var name = body.querySelector('#col-name').value.trim();
        if (!name) {
          UI.toast('Придумай название', 'err');
          return;
        }
        API.createCollection({ name: name, description: body.querySelector('#col-desc').value.trim() })
          .then(function (res) {
            UI.closeSheet();
            UI.toast('Коллекция создана', 'ok');
            global.TG.haptic('success');
            if (onDone) onDone(res.collection);
            else global.App.go('collection', { id: res.collection.id });
          })
          .catch(function () { UI.toast('Не получилось создать', 'err'); });
      });
    },

    /** Шторка «добавить объект в коллекцию» */
    pickFor: function (item, type) {
      API.collections().then(function (data) {
        var items = data.items || [];
        var body = UI.sheet(
          '<h2 style="font-size:19px;margin-bottom:6px">В коллекцию</h2>' +
          '<div style="color:var(--text-dim);font-size:13px;margin-bottom:14px">' + UI.esc(item.title) + '</div>' +
          (items.length
            ? '<div class="menu-list">' + items.map(function (c) {
                return (
                  '<button class="menu-item" data-col="' + c.id + '">' +
                    '<span class="glyph">' + UI.icon('library', 18) + '</span>' +
                    '<span class="txt"><b>' + UI.esc(c.name) + '</b><span>' + c.count + ' ' + UI.plural(c.count, 'объект', 'объекта', 'объектов') + '</span></span>' +
                    UI.icon('plus', 17) +
                  '</button>'
                );
              }).join('') + '</div>'
            : '<div class="pill-note" style="width:100%;margin-bottom:14px">' + UI.icon('info', 16) + 'Коллекций пока нет</div>') +
          '<button class="btn btn-block" id="col-new" style="margin-top:14px">' + UI.icon('folder-plus', 17) + 'Создать новую</button>'
        );

        function add(collectionId) {
          API.addToCollection(collectionId, {
            type: type, itemId: item.id, title: item.title, artist: item.artist,
            artistId: item.artistId, cover: item.cover, preview: item.preview, link: item.link
          }).then(function () {
            UI.closeSheet();
            UI.toast('Добавлено в коллекцию', 'ok');
            global.TG.haptic('success');
          }).catch(function () { UI.toast('Не удалось добавить', 'err'); });
        }

        body.addEventListener('click', function (event) {
          var btn = event.target.closest('[data-col]');
          if (btn) add(btn.getAttribute('data-col'));
          if (event.target.closest('#col-new')) {
            Views.collections.createDialog(function (collection) { add(collection.id); });
          }
        });
      });
    }
  };

  Views.collection = {
    skeleton: function () { return '<div class="screen">' + head('Коллекция', '', true) + UI.skeletonRows(5) + '</div>'; },

    render: function (params) {
      return API.collection(params.id).then(function (data) {
        var c = data.collection;
        Views.collection._data = c;

        var html = '<div class="screen">';
        html += head(c.name, c.count + ' ' + UI.plural(c.count, 'объект', 'объекта', 'объектов'), true);

        if (c.description) html += '<div class="pill-note" style="width:100%;margin-bottom:14px">' + UI.icon('quote', 15) + UI.esc(c.description) + '</div>';

        if (c.ratedCount) {
          html +=
            '<div class="card" style="display:flex;align-items:center;gap:14px;margin-bottom:16px">' +
              '<div style="font-family:var(--font-display);font-size:24px;font-weight:800;color:' + c.tier.color + '">' + UI.fmtScore(c.avg) + '</div>' +
              '<div><div style="font-weight:650">Средняя по коллекции</div>' +
              '<div style="color:var(--text-dim);font-size:12.5px">' + c.ratedCount + ' из ' + c.count + ' оценено · ' + UI.esc(c.tier.label) + '</div></div>' +
            '</div>';
        }

        if (global.STATE.config.spotifyEnabled && global.STATE.spotify && global.STATE.spotify.connected) {
          html += '<button class="btn btn-block" id="col-export" style="margin-bottom:14px">' + UI.icon('brand-spotify', 17) + 'Выгрузить в Spotify</button>';
        }

        if (!c.items.length) {
          html += UI.emptyState({ icon: 'inbox', title: 'Коллекция пуста', text: 'Добавляй треки из карточек — кнопка «…» → «В коллекцию».' });
          return html + '</div>';
        }

        html += '<div class="stagger">' + c.items.map(function (i) {
          return (
            '<div class="row" data-go="' + (i.type === 'album' ? 'album:' : 'track:') + i.itemId + '">' +
              '<img class="cover" src="' + UI.esc(UI.cover(i.cover)) + '" alt="">' +
              '<div class="body"><div class="name">' + UI.esc(i.title) + '</div>' +
              '<div class="meta">' + UI.esc(i.artist || '') + '</div></div>' +
              '<div class="tail">' +
                (i.rating ? UI.scorePill(i.rating.final) : '') +
                '<button class="icon-btn plain" data-remove="' + i.id + '">' + UI.icon('x', 17) + '</button>' +
              '</div>' +
            '</div>'
          );
        }).join('') + '</div>';

        html += '<button class="btn btn-block" id="col-delete" style="margin-top:18px">' + UI.icon('trash-2', 17) + 'Удалить коллекцию</button>';
        return html + '</div>';
      });
    },

    mount: function (root, params) {
      root.addEventListener('click', function (event) {
        var removeBtn = event.target.closest('[data-remove]');
        if (removeBtn) {
          event.stopPropagation();
          API.removeFromCollection(params.id, removeBtn.getAttribute('data-remove')).then(function () {
            removeBtn.closest('.row').remove();
            UI.toast('Убрано из коллекции', 'ok');
          });
        }
      });

      var del = root.querySelector('#col-delete');
      if (del) {
        del.addEventListener('click', function () {
          global.TG.confirm('Удалить коллекцию целиком?').then(function (ok) {
            if (!ok) return;
            API.deleteCollection(params.id).then(function () {
              UI.toast('Коллекция удалена', 'ok');
              global.App.back();
            });
          });
        });
      }

      var exportBtn = root.querySelector('#col-export');
      if (exportBtn) {
        exportBtn.addEventListener('click', function () {
          exportBtn.disabled = true;
          exportBtn.innerHTML = UI.icon('loader-circle', 17) + 'Выгружаем…';
          global.Icons.hydrate(exportBtn);
          API.spotifyExport({ collectionId: params.id }).then(function (res) {
            UI.toast('В Spotify создан плейлист: ' + res.exported + ' треков', 'ok');
            global.TG.haptic('success');
            exportBtn.disabled = false;
            exportBtn.innerHTML = UI.icon('circle-check', 17) + 'Готово';
            global.Icons.hydrate(exportBtn);
          }).catch(function () {
            UI.toast('Не удалось выгрузить', 'err');
            exportBtn.disabled = false;
            exportBtn.innerHTML = UI.icon('brand-spotify', 17) + 'Повторить';
            global.Icons.hydrate(exportBtn);
          });
        });
      }
    }
  };

  /* ============================== СРАВНЕНИЕ =============================== */

  Views.compare = {
    skeleton: function () { return '<div class="screen">' + head('Сравнение вкусов', '', true) + UI.skeletonRows(5) + '</div>'; },

    render: function (params) {
      if (params && params.userId) return Views.compare.renderResult(params.userId);

      return API.users('').then(function (data) {
        var html = '<div class="screen">';
        html += head('Сравнение вкусов', 'найди музыкального двойника', true);
        html += '<div class="search-bar">' + UI.icon('search', 18) + '<input id="cmp-search" placeholder="Имя или @username"></div>';
        html += '<div id="cmp-list">' + renderUsers(data.items || []) + '</div>';
        return html + '</div>';
      });
    },

    renderResult: function (userId) {
      return API.compare(userId).then(function (data) {
        var a = data.users[0];
        var b = data.users[1];

        var html = '<div class="screen">';
        html += head('Сравнение', '', true);
        html +=
          '<div class="vs-heads">' + avatar(a) + '<span class="vs">VS</span>' + avatar(b) + '</div>' +
          '<div class="match-ring">' +
            '<div class="pct">' + data.match + '%</div>' +
            '<div class="verdict">' + UI.esc(data.verdict) + '</div>' +
            '<div style="color:var(--text-mute);font-size:12px;margin-top:6px">' +
              UI.esc(a.name) + ' · ' + UI.esc(b.name) + ' — ' + data.sharedCount + ' ' + UI.plural(data.sharedCount, 'общая оценка', 'общие оценки', 'общих оценок') +
            '</div>' +
          '</div>';

        html += '<div class="section">' + UI.sectionHead('Критерии', 'sliders-horizontal');
        html += '<div class="card">' + data.criteriaDelta.map(function (c) {
          var aPct = (c.a / 10) * 50;
          var bPct = (c.b / 10) * 50;
          return (
            '<div class="delta-row">' +
              '<div class="num">' + UI.fmtScore(c.a) + '</div>' +
              '<div class="mid"><div class="cap">' + UI.esc(c.short) + '</div>' +
              '<div class="track"><i class="b" style="width:' + bPct + '%"></i><i class="a" style="width:' + aPct + '%"></i></div></div>' +
              '<div class="num">' + UI.fmtScore(c.b) + '</div>' +
            '</div>'
          );
        }).join('') + '</div></div>';

        if (data.commonGenres && data.commonGenres.length) {
          html += '<div class="section">' + UI.sectionHead('Общие жанры', 'palette');
          html += '<div class="chips">' + data.commonGenres.map(function (g) { return '<span class="chip on">' + UI.esc(g) + '</span>'; }).join('') + '</div></div>';
        }

        if (data.agree.length) {
          html += '<div class="section">' + UI.sectionHead('Тут вы согласны', 'handshake');
          html += data.agree.map(function (i) {
            return UI.trackRow(
              { id: i.id, title: i.title, artist: i.artist, cover: i.cover, coverSmall: i.cover, preview: i.preview },
              { go: (i.type === 'album' ? 'album:' : 'track:') + i.id, metaExtra: i.a + ' против ' + i.b }
            );
          }).join('') + '</div>';
        }

        if (data.disagree.length) {
          html += '<div class="section">' + UI.sectionHead('Главные разногласия', 'swords');
          html += data.disagree.map(function (i) {
            return UI.trackRow(
              { id: i.id, title: i.title, artist: i.artist, cover: i.cover, coverSmall: i.cover, preview: i.preview },
              { go: (i.type === 'album' ? 'album:' : 'track:') + i.id, metaExtra: 'разница ' + UI.fmtScore(i.delta) }
            );
          }).join('') + '</div>';
        }

        if (!data.sharedCount) {
          html += '<div class="pill-note" style="width:100%">' + UI.icon('info', 16) + 'Общих оценённых треков пока нет — совпадение посчитано по жанрам</div>';
        }

        return html + '</div>';
      });
    },

    mount: function (root, params) {
      if (params && params.userId) return;
      var input = root.querySelector('#cmp-search');
      var list = root.querySelector('#cmp-list');
      var timer = null;

      input.addEventListener('input', function () {
        clearTimeout(timer);
        timer = setTimeout(function () {
          list.innerHTML = UI.skeletonRows(3);
          API.users(input.value.trim()).then(function (data) {
            list.innerHTML = renderUsers(data.items || []);
            global.Icons.hydrate(list);
          });
        }, 350);
      });
    }
  };

  function renderUsers(users) {
    if (!users.length) {
      return UI.emptyState({ icon: 'users', title: 'Никого не нашли', text: 'Пригласи друзей в Dreinn Music — и сравнивайте вкусы.' });
    }
    return '<div class="stagger">' + users.map(function (u) {
      return (
        '<div class="row" data-go="compare:' + u.id + '">' +
          (u.photo ? '<img class="cover" style="border-radius:50%" src="' + UI.esc(u.photo) + '" alt="">' : '<div class="avatar sm">' + UI.esc(UI.initials(u.name)) + '</div>') +
          '<div class="body"><div class="name">' + UI.esc(u.name) + '</div>' +
          '<div class="meta">' + (u.username ? '@' + UI.esc(u.username) + ' · ' : '') + u.ratings + ' ' + UI.plural(u.ratings, 'оценка', 'оценки', 'оценок') + '</div></div>' +
          '<div class="tail">' + UI.icon('swords', 18) + '</div>' +
        '</div>'
      );
    }).join('') + '</div>';
  }

  /* ================================ SPOTIFY =============================== */

  Views.spotify = {
    skeleton: function () { return '<div class="screen">' + head('Spotify', '', true) + UI.skeletonRows(4) + '</div>'; },

    render: function () {
      return API.spotifyStatus().then(function (status) {
        global.STATE.spotify = status;

        var html = '<div class="screen">';
        html += head('Spotify', 'плейлисты и оценка треков', true);

        if (!status.enabled) {
          return html + UI.emptyState({
            icon: 'unplug',
            title: 'Интеграция выключена',
            text: 'Администратор не задал SPOTIFY_CLIENT_ID и SPOTIFY_CLIENT_SECRET на сервере.'
          }) + '</div>';
        }

        if (!status.connected) {
          html +=
            '<div class="spotify-head">' +
              '<span class="glyph" style="width:46px;height:46px;border-radius:16px;display:grid;place-items:center;background:var(--surface-3);border:1.5px solid var(--line)">' +
                UI.icon('brand-spotify', 22) + '</span>' +
              '<div><div style="font-weight:700">Подключить аккаунт</div>' +
              '<div style="color:var(--text-dim);font-size:12.5px">Плейлисты, оценки, синхронизация</div></div>' +
            '</div>';
          html +=
            '<div class="menu-list" style="margin-bottom:18px">' +
              '<div class="menu-item"><span class="glyph">' + UI.icon('list-music', 18) + '</span><span class="txt"><b>Твои плейлисты</b><span>Смотри их прямо здесь</span></span></div>' +
              '<div class="menu-item"><span class="glyph">' + UI.icon('star', 18) + '</span><span class="txt"><b>Оценка треков</b><span>Та же система на 90 баллов</span></span></div>' +
              '<div class="menu-item"><span class="glyph">' + UI.icon('refresh-cw', 18) + '</span><span class="txt"><b>Синхронизация</b><span>Импорт в коллекции и обратно</span></span></div>' +
              '<div class="menu-item"><span class="glyph">' + UI.icon('shield', 18) + '</span><span class="txt"><b>Только метаданные</b><span>Музыка не скачивается и не стримится</span></span></div>' +
            '</div>';
          html += '<button class="btn btn-primary btn-block" id="sp-connect">' + UI.icon('brand-spotify', 18) + 'Подключить Spotify</button>';
          return html + '</div>';
        }

        html +=
          '<div class="spotify-head">' +
            (status.account.avatar
              ? '<img class="avatar sm" src="' + UI.esc(status.account.avatar) + '" alt="">'
              : '<span class="avatar sm">' + UI.icon('brand-spotify', 20) + '</span>') +
            '<div style="flex:1;min-width:0"><div style="font-weight:700">' + UI.esc(status.account.display_name || status.account.spotify_id) + '</div>' +
            '<div style="color:var(--text-dim);font-size:12.5px">' + UI.esc(status.account.product || 'free') + ' · ' + UI.esc(status.account.country || '') + '</div></div>' +
            '<button class="icon-btn" id="sp-disconnect">' + UI.icon('unplug', 18) + '</button>' +
          '</div>';

        html += '<div id="sp-playlists">' + UI.skeletonRows(4) + '</div>';
        html += '<div class="pill-note" style="margin-top:14px">' + UI.icon('shield', 15) + 'Превью берутся из Deezer, музыка Spotify не скачивается</div>';
        return html + '</div>';
      });
    },

    mount: function (root) {
      var connect = root.querySelector('#sp-connect');
      if (connect) {
        connect.addEventListener('click', function () {
          connect.disabled = true;
          API.spotifyAuthUrl().then(function (res) {
            global.TG.openLink(res.url);
            UI.toast('Заверши вход в браузере и вернись', 'ok');
            connect.disabled = false;
          }).catch(function () {
            UI.toast('Не удалось получить ссылку', 'err');
            connect.disabled = false;
          });
        });
      }

      var disconnect = root.querySelector('#sp-disconnect');
      if (disconnect) {
        disconnect.addEventListener('click', function () {
          global.TG.confirm('Отключить Spotify?').then(function (ok) {
            if (!ok) return;
            API.spotifyDisconnect().then(function () {
              UI.toast('Spotify отключён', 'ok');
              global.App.replace('spotify', {});
            });
          });
        });
      }

      var host = root.querySelector('#sp-playlists');
      if (!host) return;

      API.spotifyPlaylists().then(function (data) {
        var items = data.items || [];
        if (!items.length) {
          host.innerHTML = UI.emptyState({ icon: 'list-music', title: 'Плейлистов нет', text: 'Создай плейлист в Spotify — он появится здесь.' });
          return;
        }
        host.innerHTML =
          '<div class="section-head"><h2>' + UI.icon('list-music', 18) + 'Твои плейлисты</h2></div>' +
          '<div class="stagger">' + items.map(function (p) {
            return (
              '<div class="row" data-go="spotifyPlaylist:' + p.id + '">' +
                '<img class="cover" src="' + UI.esc(UI.cover(p.cover)) + '" alt="">' +
                '<div class="body"><div class="name">' + UI.esc(p.name) + '</div>' +
                '<div class="meta">' + p.trackCount + ' ' + UI.plural(p.trackCount, 'трек', 'трека', 'треков') + '</div></div>' +
                '<div class="tail">' + UI.icon('chevron-right', 18) + '</div>' +
              '</div>'
            );
          }).join('') + '</div>';
        global.Icons.hydrate(host);
      }).catch(function () {
        host.innerHTML = UI.emptyState({ icon: 'triangle-alert', title: 'Не удалось загрузить', text: 'Попробуй переподключить аккаунт Spotify.' });
      });
    }
  };

  Views.spotifyPlaylist = {
    skeleton: function () { return '<div class="screen">' + head('Плейлист', '', true) + UI.skeletonRows(6) + '</div>'; },

    render: function (params) {
      return API.spotifyPlaylistTracks(params.id, 0).then(function (data) {
        var items = data.items || [];
        var matched = items.filter(function (i) { return i.matched; }).length;

        var html = '<div class="screen">';
        html += head('Плейлист Spotify', matched + ' из ' + items.length + ' с превью', true);
        html += '<button class="btn btn-primary btn-block" id="sp-import" style="margin-bottom:16px">' + UI.icon('refresh-cw', 18) + 'Синхронизировать в коллекцию</button>';

        if (!items.length) {
          return html + UI.emptyState({ icon: 'inbox', title: 'Пусто', text: 'В этом плейлисте нет треков.' }) + '</div>';
        }

        html += '<div class="stagger">' + items.map(function (entry, index) {
          var sp = entry.spotify;
          var dz = entry.deezer;
          return (
            '<div class="row"' + (dz ? ' data-go="track:' + dz.id + '"' : '') + '>' +
              '<div class="rank">' + (index + 1) + '</div>' +
              '<img class="cover" src="' + UI.esc(UI.cover(sp.cover || (dz && dz.cover))) + '" alt="">' +
              '<div class="body"><div class="name">' + UI.esc(sp.title) + '</div>' +
              '<div class="meta">' + UI.esc(sp.artist) + (entry.matched ? '' : ' · нет в Deezer') + '</div></div>' +
              '<div class="tail">' +
                (entry.myScore !== null && entry.myScore !== undefined ? UI.scorePill(entry.myScore) : '') +
                (entry.preview
                  ? '<button class="play-btn" data-play=\'' + UI.esc(JSON.stringify({ id: dz.id, title: dz.title, artist: dz.artist, cover: dz.cover, preview: entry.preview })) + '\'>' + UI.icon('play', 16) + '</button>'
                  : '') +
              '</div>' +
            '</div>'
          );
        }).join('') + '</div>';

        html += '<div class="pill-note" style="margin-top:14px">' + UI.icon('info', 15) + 'Треки сопоставлены с каталогом Deezer для превью и оценки</div>';
        return html + '</div>';
      });
    },

    mount: function (root, params) {
      var btn = root.querySelector('#sp-import');
      if (!btn) return;
      btn.addEventListener('click', function () {
        btn.disabled = true;
        btn.innerHTML = UI.icon('loader-circle', 18) + 'Синхронизируем…';
        global.Icons.hydrate(btn);

        API.spotifyImport(params.id).then(function (res) {
          UI.toast('Импортировано ' + res.matched + ' треков', 'ok');
          global.TG.haptic('success');
          global.App.go('collection', { id: res.collection.id });
        }).catch(function () {
          UI.toast('Не удалось синхронизировать', 'err');
          btn.disabled = false;
          btn.innerHTML = UI.icon('refresh-cw', 18) + 'Повторить';
          global.Icons.hydrate(btn);
        });
      });
    }
  };

  global.Views = Views;
})(window);
