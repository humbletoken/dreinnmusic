/* =============================================================================
 *  Dreinn Music — админ-панель (доступна только id из ADMIN_IDS)
 *  Вкладки: Обзор · Spotify · Настройки · Люди · Рассылка · Бот
 * ========================================================================== */

(function (global) {
  'use strict';

  var UI = global.UI;
  var API = global.API;
  var Views = global.Views || {};

  function fmtBytes(n) {
    var value = Number(n) || 0;
    if (value > 1024 * 1024) return (value / 1024 / 1024).toFixed(1) + ' МБ';
    if (value > 1024) return Math.round(value / 1024) + ' КБ';
    return value + ' Б';
  }

  function fmtUptime(sec) {
    var s = Number(sec) || 0;
    var d = Math.floor(s / 86400);
    var h = Math.floor((s % 86400) / 3600);
    var m = Math.floor((s % 3600) / 60);
    return (d ? d + ' д ' : '') + h + ' ч ' + m + ' мин';
  }

  function fmtDateTime(unix) {
    if (!unix) return '—';
    return new Date(unix * 1000).toLocaleString('ru-RU', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
  }

  function statCard(value, label, sub) {
    return (
      '<div class="stat"><div class="val">' + value + '</div><div class="lbl">' + UI.esc(label) + '</div>' +
      (sub ? '<div class="sub">' + UI.esc(sub) + '</div>' : '') + '</div>'
    );
  }

  function kv(rows) {
    return '<div class="kv">' + rows.map(function (r) {
      return '<div class="kv-row"><span class="k">' + UI.esc(r[0]) + '</span><span class="v">' + r[1] + '</span></div>';
    }).join('') + '</div>';
  }

  function statusPill(kind, text) {
    return '<span class="status ' + kind + '">' + UI.esc(text) + '</span>';
  }

  function busy(btn, label) {
    btn.disabled = true;
    btn.innerHTML = UI.icon('loader-circle', 17) + (label || 'Секунду…');
    global.Icons.hydrate(btn);
  }

  function restore(btn, iconName, label) {
    btn.disabled = false;
    btn.innerHTML = UI.icon(iconName, 17) + label;
    global.Icons.hydrate(btn);
  }

  function errorMessage(err, fallback) {
    return (err && err.payload && err.payload.message) || fallback || 'Не получилось';
  }

  /* ---------------------------------------------------------------------- */

  Views.admin = {
    skeleton: function () {
      return (
        '<div class="screen">' +
          '<div class="screen-head"><button class="icon-btn" data-back>' + UI.icon('arrow-left', 19) + '</button>' +
          '<div class="title-block"><h1>Админ-панель</h1><div class="sub">загружаем сводку</div></div></div>' +
          '<div class="admin-grid">' + UI.skeletonBlock(80, 18) + UI.skeletonBlock(80, 18) + UI.skeletonBlock(80, 18) + UI.skeletonBlock(80, 18) + '</div>' +
          UI.skeletonBlock(160, 24) +
        '</div>'
      );
    },

    render: function () {
      if (!global.STATE.user || !global.STATE.user.isAdmin) {
        return Promise.resolve(
          '<div class="screen">' + UI.emptyState({ icon: 'shield', title: 'Только для администраторов', text: 'Добавь свой Telegram id в ADMIN_IDS на сервере.' }) + '</div>'
        );
      }

      var html = '<div class="screen">';
      html +=
        '<div class="screen-head">' +
          '<button class="icon-btn" data-back>' + UI.icon('arrow-left', 19) + '</button>' +
          '<div class="title-block"><h1>Админ-панель</h1><div class="sub">всё, что происходит в сервисе</div></div>' +
        '</div>';
      html +=
        '<div class="tabs" id="adm-tabs">' +
          '<button class="tab on" data-tab="overview">Обзор</button>' +
          '<button class="tab" data-tab="spotify">Spotify</button>' +
          '<button class="tab" data-tab="settings">Настройки</button>' +
          '<button class="tab" data-tab="users">Люди</button>' +
          '<button class="tab" data-tab="broadcast">Рассылка</button>' +
          '<button class="tab" data-tab="bot">Бот</button>' +
        '</div>';
      html += '<div id="adm-body">' + UI.skeletonBlock(120, 24) + UI.skeletonBlock(200, 24) + '</div>';
      return Promise.resolve(html + '</div>');
    },

    mount: function (root) {
      var body = root.querySelector('#adm-body');
      var tabs = root.querySelector('#adm-tabs');
      if (!body || !tabs) return;

      var panels = {
        overview: renderOverview,
        spotify: renderSpotify,
        settings: renderSettings,
        users: renderUsers,
        broadcast: renderBroadcast,
        bot: renderBot
      };

      function show(tab) {
        body.innerHTML = UI.skeletonBlock(120, 24) + UI.skeletonBlock(200, 24);
        panels[tab](body).catch(function (err) {
          body.innerHTML = UI.emptyState({ icon: 'triangle-alert', title: 'Не загрузилось', text: errorMessage(err, 'Проверь логи сервера.') });
          global.Icons.hydrate(body);
        });
      }

      tabs.addEventListener('click', function (event) {
        var tab = event.target.closest('.tab');
        if (!tab) return;
        tabs.querySelectorAll('.tab').forEach(function (t) { t.classList.remove('on'); });
        tab.classList.add('on');
        global.TG.haptic('select');
        show(tab.getAttribute('data-tab'));
      });

      show('overview');
    }
  };

  /* ------------------------------ ОБЗОР ---------------------------------- */

  function renderOverview(body) {
    return API.admin.overview().then(function (o) {
      var html = '';
      html +=
        '<div class="admin-grid stagger">' +
          statCard(o.users.total, 'пользователей', '+' + o.users.today + ' сегодня · +' + o.users.week + ' за неделю') +
          statCard(o.users.activeToday, 'активны сегодня', o.users.activeWeek + ' за неделю') +
          statCard(o.ratings.total, 'оценок', '+' + o.ratings.today + ' сегодня · средняя ' + UI.fmtScore(o.ratings.avg)) +
          statCard(o.ratings.reviews, 'отзывов', o.ratings.tracks + ' треков · ' + o.ratings.albums + ' альбомов') +
          statCard(o.spotify.accounts, 'Spotify-аккаунтов', o.spotify.enabled ? 'интеграция: ' + o.spotify.source : 'интеграция не настроена') +
          statCard(o.library.collections, 'коллекций', o.library.spotifyImports + ' из Spotify · ' + o.library.favorites + ' в любимом') +
        '</div>';

      html += '<div class="section">' + UI.sectionHead('Состояние', 'activity');
      html += '<div class="card">' + kv([
        ['Сервер', 'v' + UI.esc(o.server.version) + ' · Node ' + UI.esc(o.server.node)],
        ['Аптайм', UI.esc(fmtUptime(o.server.uptimeSec))],
        ['Публичный адрес', '<code>' + UI.esc(o.server.publicUrl) + '</code>'],
        ['База данных', UI.esc(fmtBytes(o.server.dbBytes))],
        ['Кэш', o.server.memCacheEntries + ' в памяти · ' + o.server.dbCacheEntries + ' в БД'],
        ['Бот', o.bot.enabled ? statusPill('ok', o.bot.mode + (o.bot.username ? ' · @' + o.bot.username : '')) : statusPill('bad', 'выключен')],
        ['Custom emoji', o.bot.customEmojiBlocked ? statusPill('warn', 'Telegram отклонил') : statusPill(o.bot.customEmoji ? 'ok' : 'bad', o.bot.customEmoji ? 'включены' : 'выключены')],
        ['Spotify', o.spotify.enabled ? statusPill('ok', 'настроен (' + o.spotify.source + ')') : statusPill('bad', 'не настроен')],
        ['Часовой пояс', UI.esc(o.daily.timezone) + ' · сейчас ' + UI.esc(o.daily.localTime)],
        ['Подборки', 'в 00:00 · через ' + Math.round(o.daily.nextRefreshInSec / 60) + ' мин'],
        ['Режим DEV', o.server.devMode ? statusPill('warn', 'включён — выключи в проде') : statusPill('ok', 'выключен')],
        ['Обслуживание', o.maintenance.enabled ? statusPill('warn', 'включено') : statusPill('ok', 'выключено')]
      ]) + '</div></div>';

      if (o.recentRatings && o.recentRatings.length) {
        html += '<div class="section">' + UI.sectionHead('Последние оценки', 'history');
        html += '<div class="stagger">' + o.recentRatings.map(function (r) {
          return (
            '<div class="row" data-go="' + (r.type === 'album' ? 'album:' : 'track:') + r.itemId + '">' +
              '<img class="cover" src="' + UI.esc(UI.cover(r.cover)) + '" alt="">' +
              '<div class="body"><div class="name">' + UI.esc(r.title) + '</div>' +
              '<div class="meta">' + UI.esc(r.user.name) + ' · ' + UI.esc(fmtDateTime(r.at)) + '</div></div>' +
              '<div class="tail">' + UI.scorePill(r.score) + '</div>' +
            '</div>'
          );
        }).join('') + '</div></div>';
      }

      if (o.topUsers && o.topUsers.length) {
        html += '<div class="section">' + UI.sectionHead('Самые активные', 'users');
        html += '<div class="stagger">' + o.topUsers.map(function (u) {
          return (
            '<div class="row" data-go="profile:' + u.id + '">' +
              '<div class="rank ' + (u.rank <= 3 ? 'top' + u.rank : '') + '">' + u.rank + '</div>' +
              (u.photo ? '<img class="cover" style="border-radius:50%" src="' + UI.esc(u.photo) + '" alt="">' : '<div class="avatar sm">' + UI.esc(UI.initials(u.name)) + '</div>') +
              '<div class="body"><div class="name">' + UI.esc(u.name) + '</div>' +
              '<div class="meta">' + u.ratings + ' ' + UI.plural(u.ratings, 'оценка', 'оценки', 'оценок') + ' · средняя ' + UI.fmtScore(u.avg) + '</div></div>' +
            '</div>'
          );
        }).join('') + '</div></div>';
      }

      html +=
        '<div class="section">' + UI.sectionHead('Быстрые действия', 'zap') +
          '<div class="grid-2">' +
            '<button class="btn" id="adm-refresh-daily">' + UI.icon('refresh-cw', 17) + 'Обновить подборки</button>' +
            '<button class="btn" id="adm-clear-cache">' + UI.icon('trash-2', 17) + 'Очистить кэш</button>' +
          '</div>' +
        '</div>';

      body.innerHTML = html;
      global.Icons.hydrate(body);

      body.querySelector('#adm-refresh-daily').addEventListener('click', function () {
        var btn = this;
        busy(btn, 'Обновляем…');
        API.admin.refreshDaily().then(function () {
          UI.toast('Чарт и новинки обновлены', 'ok');
          restore(btn, 'refresh-cw', 'Обновить подборки');
        }).catch(function (err) {
          UI.toast(errorMessage(err), 'err');
          restore(btn, 'refresh-cw', 'Обновить подборки');
        });
      });

      body.querySelector('#adm-clear-cache').addEventListener('click', function () {
        var btn = this;
        busy(btn);
        API.admin.clearCache().then(function (res) {
          UI.toast('Кэш очищен: ' + res.removed + ' записей', 'ok');
          restore(btn, 'trash-2', 'Очистить кэш');
        }).catch(function (err) {
          UI.toast(errorMessage(err), 'err');
          restore(btn, 'trash-2', 'Очистить кэш');
        });
      });
    });
  }

  /* ------------------------------ SPOTIFY -------------------------------- */

  function renderSpotify(body) {
    return API.admin.settings().then(function (s) {
      var sp = s.spotify;
      var html = '';

      html +=
        '<div class="spotify-head">' +
          '<span class="glyph" style="width:46px;height:46px;border-radius:16px;display:grid;place-items:center;background:var(--surface-3);border:var(--bw) solid var(--line);box-shadow:2px 2px 0 var(--shadow-hard)">' + UI.icon('brand-spotify', 22) + '</span>' +
          '<div style="flex:1;min-width:0"><div style="font-weight:900">Интеграция Spotify</div>' +
          '<div style="color:var(--text-dim);font-size:12.5px">' +
            (sp.enabled ? 'работает · ключи из ' + (sp.source === 'admin' ? 'админ-панели' : '.env') : 'не настроена') +
          '</div></div>' +
          (sp.enabled ? statusPill('ok', 'активна') : statusPill('bad', 'выкл')) +
        '</div>';

      html +=
        '<div class="card" style="margin-bottom:16px">' +
          '<div style="font-weight:900;margin-bottom:6px">Как привязать</div>' +
          '<div style="font-size:13px;color:var(--text-dim);line-height:1.5">' +
            '1. Открой <b>developer.spotify.com/dashboard</b> → Create app.<br>' +
            '2. В Redirect URIs вставь адрес ниже — символ в символ.<br>' +
            '3. Скопируй Client ID и Client Secret в форму и нажми «Проверить и сохранить».' +
          '</div>' +
          '<div class="field-label">Redirect URI для панели Spotify</div>' +
          '<div class="copy-box"><span id="adm-redirect-preview">' + UI.esc(sp.redirectUri || sp.defaultRedirectUri) + '</span>' +
            '<button class="icon-btn plain" id="adm-copy-redirect" style="width:34px;height:34px">' + UI.icon('copy', 16) + '</button></div>' +
        '</div>';

      html +=
        '<div class="card">' +
          '<div class="field-label">Client ID</div>' +
          '<input class="field" id="sp-client-id" placeholder="32 символа из панели Spotify" value="' + UI.esc(sp.clientId || '') + '" autocomplete="off" spellcheck="false">' +
          '<div class="field-label">Client Secret' + (sp.secretMask ? ' <span style="color:var(--text-mute)">· сейчас ' + UI.esc(sp.secretMask) + '</span>' : '') + '</div>' +
          '<input class="field" id="sp-client-secret" type="password" placeholder="' + (sp.secretMask ? 'оставь пустым, чтобы не менять' : 'секрет приложения') + '" autocomplete="new-password">' +
          '<div class="field-label">Redirect URI</div>' +
          '<input class="field" id="sp-redirect" placeholder="' + UI.esc(sp.defaultRedirectUri) + '" value="' + UI.esc(sp.redirectUri || '') + '" autocomplete="off" spellcheck="false">' +
          '<div style="font-size:11.5px;color:var(--text-mute);margin-top:6px">По умолчанию — PUBLIC_URL + /spotify/callback. Менять нужно только если Mini App доступен по другому адресу.</div>' +
          '<div style="display:flex;gap:10px;margin-top:16px">' +
            '<button class="btn btn-primary btn-block" id="sp-save">' + UI.icon('check', 17) + 'Проверить и сохранить</button>' +
          '</div>' +
          (sp.storedInDb
            ? '<button class="btn btn-block" id="sp-reset" style="margin-top:10px">' + UI.icon('rotate-ccw', 17) + (sp.envConfigured ? 'Вернуться к ключам из .env' : 'Удалить ключи') + '</button>'
            : '') +
        '</div>';

      html += '<div class="pill-note" style="margin-top:14px">' + UI.icon('shield', 15) + 'Секрет хранится только на сервере и никогда не отдаётся в приложение целиком</div>';

      body.innerHTML = html;
      global.Icons.hydrate(body);

      var redirectInput = body.querySelector('#sp-redirect');
      var preview = body.querySelector('#adm-redirect-preview');
      redirectInput.addEventListener('input', function () {
        preview.textContent = redirectInput.value.trim() || sp.defaultRedirectUri;
      });

      body.querySelector('#adm-copy-redirect').addEventListener('click', function () {
        var text = preview.textContent;
        if (navigator.clipboard && navigator.clipboard.writeText) {
          navigator.clipboard.writeText(text).then(function () { UI.toast('Скопировано', 'ok'); }).catch(function () { UI.toast(text); });
        } else {
          UI.toast(text);
        }
      });

      body.querySelector('#sp-save').addEventListener('click', function () {
        var btn = this;
        var payload = {
          clientId: body.querySelector('#sp-client-id').value.trim(),
          clientSecret: body.querySelector('#sp-client-secret').value.trim(),
          redirectUri: redirectInput.value.trim()
        };
        if (!payload.clientId) {
          UI.toast('Введи Client ID', 'err');
          return;
        }
        busy(btn, 'Проверяем у Spotify…');
        API.admin.saveSpotify(payload).then(function (res) {
          global.TG.haptic('success');
          UI.toast('Spotify подключён · redirect ' + res.redirectUri, 'ok');
          global.STATE.config.spotifyEnabled = res.enabled;
          renderSpotify(body);
        }).catch(function (err) {
          global.TG.haptic('error');
          UI.toast(errorMessage(err, 'Spotify отклонил ключи'), 'err');
          restore(btn, 'check', 'Проверить и сохранить');
        });
      });

      var reset = body.querySelector('#sp-reset');
      if (reset) {
        reset.addEventListener('click', function () {
          var btn = this;
          global.TG.confirm('Убрать ключи, сохранённые в админ-панели?').then(function (ok) {
            if (!ok) return;
            busy(btn);
            API.admin.resetSpotify().then(function (res) {
              UI.toast(res.enabled ? 'Используются ключи из .env' : 'Spotify отключён', 'ok');
              global.STATE.config.spotifyEnabled = res.enabled;
              renderSpotify(body);
            }).catch(function (err) {
              UI.toast(errorMessage(err), 'err');
              restore(btn, 'rotate-ccw', 'Вернуться к .env');
            });
          });
        });
      }
    });
  }

  /* ----------------------------- НАСТРОЙКИ ------------------------------- */

  var TIMEZONES = [
    'Europe/Moscow', 'Europe/Kaliningrad', 'Europe/Samara', 'Asia/Yekaterinburg', 'Asia/Omsk', 'Asia/Novosibirsk',
    'Asia/Krasnoyarsk', 'Asia/Irkutsk', 'Asia/Yakutsk', 'Asia/Vladivostok', 'Europe/Minsk', 'Europe/Kyiv',
    'Asia/Almaty', 'Asia/Tashkent', 'Asia/Tbilisi', 'Asia/Yerevan', 'Europe/Berlin', 'Europe/London', 'UTC'
  ];

  function renderSettings(body) {
    return API.admin.settings().then(function (s) {
      var html = '';

      html +=
        '<div class="card" style="margin-bottom:14px">' +
          '<div style="display:flex;align-items:center;gap:12px">' +
            '<div style="flex:1"><div style="font-weight:900">Premium-эмодзи в боте</div>' +
            '<div style="font-size:12.5px;color:var(--text-dim)">' +
              (s.customEmojiBlocked ? 'Telegram отклонил custom emoji — бот шлёт обычные. Включи заново после покупки username на Fragment.' : 'Custom emoji из набора Telegram Ducks в сообщениях бота') +
            '</div></div>' +
            '<button class="switch' + (s.useCustomEmoji ? ' on' : '') + '" id="sw-emoji" aria-label="Переключить"></button>' +
          '</div>' +
        '</div>';

      html +=
        '<div class="card" style="margin-bottom:14px">' +
          '<div style="font-weight:900">Часовой пояс сервиса</div>' +
          '<div style="font-size:12.5px;color:var(--text-dim);margin-bottom:8px">Чарт и новые релизы обновляются в 00:00 этого пояса. Сейчас там ' + UI.esc(s.daily.localTime) + '.</div>' +
          '<div class="chips" id="tz-chips">' + TIMEZONES.map(function (tz) {
            return '<button class="chip' + (tz === s.timezone ? ' on' : '') + '" data-tz="' + tz + '">' + tz + '</button>';
          }).join('') + '</div>' +
          '<div class="field-label">Или свой (IANA, напр. America/New_York)</div>' +
          '<div style="display:flex;gap:8px">' +
            '<input class="field" id="tz-input" value="' + UI.esc(s.timezone) + '" autocomplete="off" spellcheck="false">' +
            '<button class="btn" id="tz-save">' + UI.icon('check', 17) + '</button>' +
          '</div>' +
        '</div>';

      html +=
        '<div class="card" style="margin-bottom:14px">' +
          '<div style="display:flex;align-items:center;gap:12px;margin-bottom:10px">' +
            '<div style="flex:1"><div style="font-weight:900">Режим обслуживания</div>' +
            '<div style="font-size:12.5px;color:var(--text-dim)">Всем, кроме администраторов, показывается сообщение</div></div>' +
            '<button class="switch' + (s.maintenance.enabled ? ' on' : '') + '" id="sw-maint" aria-label="Переключить"></button>' +
          '</div>' +
          '<textarea class="review" id="maint-text" style="min-height:70px" maxlength="300" placeholder="Сервис на техническом обслуживании, скоро вернёмся.">' + UI.esc(s.maintenance.message || '') + '</textarea>' +
          '<button class="btn btn-block" id="maint-save" style="margin-top:10px">' + UI.icon('check', 17) + 'Сохранить текст</button>' +
        '</div>';

      html += '<div class="pill-note">' + UI.icon('info', 15) + 'DEV_MODE, ADMIN_IDS и BOT_TOKEN меняются только через .env — это вопрос безопасности</div>';

      body.innerHTML = html;
      global.Icons.hydrate(body);

      body.querySelector('#sw-emoji').addEventListener('click', function () {
        var sw = this;
        var next = !sw.classList.contains('on');
        API.admin.saveSettings({ useCustomEmoji: next }).then(function () {
          sw.classList.toggle('on', next);
          global.TG.haptic('success');
          UI.toast(next ? 'Premium-эмодзи включены' : 'Premium-эмодзи выключены', 'ok');
        }).catch(function (err) { UI.toast(errorMessage(err), 'err'); });
      });

      function saveTz(tz) {
        API.admin.saveSettings({ timezone: tz }).then(function (res) {
          global.TG.haptic('success');
          UI.toast('Часовой пояс: ' + res.timezone + ' · сейчас ' + res.daily.localTime, 'ok');
          renderSettings(body);
        }).catch(function (err) { UI.toast(errorMessage(err, 'Пояс не распознан'), 'err'); });
      }

      body.querySelector('#tz-chips').addEventListener('click', function (event) {
        var chip = event.target.closest('[data-tz]');
        if (chip) saveTz(chip.getAttribute('data-tz'));
      });
      body.querySelector('#tz-save').addEventListener('click', function () {
        saveTz(body.querySelector('#tz-input').value.trim());
      });

      body.querySelector('#sw-maint').addEventListener('click', function () {
        var sw = this;
        var next = !sw.classList.contains('on');
        API.admin.saveSettings({ maintenance: { enabled: next, message: body.querySelector('#maint-text').value.trim() } }).then(function () {
          sw.classList.toggle('on', next);
          global.TG.haptic(next ? 'warning' : 'success');
          UI.toast(next ? 'Режим обслуживания включён' : 'Режим обслуживания выключен', 'ok');
        }).catch(function (err) { UI.toast(errorMessage(err), 'err'); });
      });

      body.querySelector('#maint-save').addEventListener('click', function () {
        var enabled = body.querySelector('#sw-maint').classList.contains('on');
        API.admin.saveSettings({ maintenance: { enabled: enabled, message: body.querySelector('#maint-text').value.trim() } })
          .then(function () { UI.toast('Текст сохранён', 'ok'); })
          .catch(function (err) { UI.toast(errorMessage(err), 'err'); });
      });
    });
  }

  /* -------------------------------- ЛЮДИ --------------------------------- */

  function renderUsers(body) {
    body.innerHTML =
      '<div class="search-bar">' + UI.icon('search', 18) + '<input id="adm-user-q" placeholder="Имя, @username или id"></div>' +
      '<div id="adm-users">' + UI.skeletonRows(4) + '</div>';
    global.Icons.hydrate(body);

    var list = body.querySelector('#adm-users');
    var input = body.querySelector('#adm-user-q');
    var timer = null;

    function load(q) {
      return API.admin.users(q).then(function (data) {
        var items = data.items || [];
        if (!items.length) {
          list.innerHTML = UI.emptyState({ icon: 'users', title: 'Никого не нашли', text: 'Попробуй другой запрос.' });
          global.Icons.hydrate(list);
          return;
        }
        list.innerHTML = '<div class="stagger">' + items.map(function (u) {
          return (
            '<div class="row" style="flex-wrap:wrap" data-uid="' + u.id + '">' +
              (u.photo ? '<img class="cover" style="border-radius:50%" src="' + UI.esc(u.photo) + '" alt="">' : '<div class="avatar sm">' + UI.esc(UI.initials(u.name)) + '</div>') +
              '<div class="body">' +
                '<div class="name">' + UI.esc(u.name) + (u.isAdmin ? ' ' + UI.icon('shield', 13) : '') + '</div>' +
                '<div class="meta">' + (u.username ? '@' + UI.esc(u.username) + ' · ' : '') + 'id ' + u.id + ' · ' + u.ratings + ' оц. · был ' + UI.esc(fmtDateTime(u.lastSeen)) + '</div>' +
              '</div>' +
              '<div class="tail">' +
                (u.spotify ? '<span class="status ok">Spotify</span>' : '') +
                (u.isBanned ? '<span class="status bad">бан</span>' : '') +
                '<button class="icon-btn plain" data-act="menu" style="width:36px;height:36px">' + UI.icon('ellipsis', 18) + '</button>' +
              '</div>' +
            '</div>'
          );
        }).join('') + '</div>';
        global.Icons.hydrate(list);
        list._items = items;
      });
    }

    input.addEventListener('input', function () {
      clearTimeout(timer);
      timer = setTimeout(function () { load(input.value.trim()); }, 320);
    });

    list.addEventListener('click', function (event) {
      var btn = event.target.closest('[data-act="menu"]');
      if (!btn) return;
      var row = btn.closest('[data-uid]');
      var id = Number(row.getAttribute('data-uid'));
      var user = (list._items || []).find(function (u) { return u.id === id; });
      if (!user) return;

      var sheet = UI.sheet(
        '<h2 style="font-size:19px;margin-bottom:4px">' + UI.esc(user.name) + '</h2>' +
        '<div style="color:var(--text-dim);font-size:13px;margin-bottom:14px">id ' + user.id + ' · ' + user.ratings + ' оценок · средняя ' + UI.fmtScore(user.avg) + '</div>' +
        '<div class="menu-list">' +
          '<button class="menu-item" data-go="profile:' + user.id + '"><span class="glyph">' + UI.icon('circle-user', 18) + '</span><span class="txt"><b>Открыть профиль</b><span>Статистика и оценки</span></span></button>' +
          '<button class="menu-item" data-go="compare:' + user.id + '"><span class="glyph">' + UI.icon('swords', 18) + '</span><span class="txt"><b>Сравнить вкусы</b><span>С твоим профилем</span></span></button>' +
          (user.isAdmin ? '' :
            '<button class="menu-item" data-act="ban"><span class="glyph">' + UI.icon(user.isBanned ? 'circle-check' : 'circle-x', 18) + '</span><span class="txt"><b>' + (user.isBanned ? 'Снять бан' : 'Забанить') + '</b><span>' + (user.isBanned ? 'Вернуть доступ к сервису' : 'Закрыть доступ к Mini App и боту') + '</span></span></button>' +
            '<button class="menu-item" data-act="wipe"><span class="glyph">' + UI.icon('trash-2', 18) + '</span><span class="txt"><b>Удалить все оценки</b><span>Необратимо</span></span></button>') +
        '</div>'
      );

      sheet.addEventListener('click', function (e) {
        var act = e.target.closest('[data-act]');
        if (!act) return;
        var kind = act.getAttribute('data-act');
        if (kind === 'ban') {
          var next = !user.isBanned;
          global.TG.confirm(next ? 'Забанить ' + user.name + '?' : 'Снять бан с ' + user.name + '?').then(function (ok) {
            if (!ok) return;
            API.admin.ban(user.id, next, next ? 'Нарушение правил' : '').then(function () {
              UI.closeSheet();
              UI.toast(next ? 'Пользователь забанен' : 'Бан снят', 'ok');
              load(input.value.trim());
            }).catch(function (err) { UI.toast(errorMessage(err), 'err'); });
          });
        }
        if (kind === 'wipe') {
          global.TG.confirm('Удалить все оценки пользователя ' + user.name + '? Это необратимо.').then(function (ok) {
            if (!ok) return;
            API.admin.deleteRatings(user.id).then(function (res) {
              UI.closeSheet();
              UI.toast('Удалено оценок: ' + res.removed, 'ok');
              load(input.value.trim());
            }).catch(function (err) { UI.toast(errorMessage(err), 'err'); });
          });
        }
      });
    });

    return load('');
  }

  /* ------------------------------ РАССЫЛКА ------------------------------- */

  function renderBroadcast(body) {
    return API.admin.broadcastState().then(function (state) {
      var html = '';
      html +=
        '<div class="card" style="margin-bottom:14px">' +
          '<div style="font-weight:900;margin-bottom:4px">Сообщение всем пользователям</div>' +
          '<div style="font-size:12.5px;color:var(--text-dim);margin-bottom:10px">Поддерживается HTML Telegram: &lt;b&gt;, &lt;i&gt;, &lt;a href&gt;. Отправка идёт в фоне, ~14 сообщений в секунду.</div>' +
          '<textarea class="review" id="bc-text" maxlength="3500" placeholder="Например: в Dreinn Music появились новые подборки — загляни!"></textarea>' +
          '<div style="display:flex;gap:10px;margin-top:12px">' +
            '<button class="btn btn-block" id="bc-test">' + UI.icon('send', 17) + 'Тест себе</button>' +
            '<button class="btn btn-primary btn-block" id="bc-send">' + UI.icon('users', 17) + 'Всем</button>' +
          '</div>' +
        '</div>';
      html += '<div id="bc-state">' + broadcastStateHtml(state) + '</div>';

      body.innerHTML = html;
      global.Icons.hydrate(body);

      var text = body.querySelector('#bc-text');
      var stateHost = body.querySelector('#bc-state');
      var poll = null;

      function pollState() {
        API.admin.broadcastState().then(function (st) {
          stateHost.innerHTML = broadcastStateHtml(st);
          global.Icons.hydrate(stateHost);
          if (st.running) poll = setTimeout(pollState, 1500);
        });
      }

      body.querySelector('#bc-test').addEventListener('click', function () {
        var btn = this;
        if (!text.value.trim()) return UI.toast('Введи текст', 'err');
        busy(btn);
        API.admin.broadcast(text.value.trim(), true).then(function () {
          UI.toast('Тестовое сообщение отправлено тебе в бота', 'ok');
          restore(btn, 'send', 'Тест себе');
        }).catch(function (err) {
          UI.toast(errorMessage(err), 'err');
          restore(btn, 'send', 'Тест себе');
        });
      });

      body.querySelector('#bc-send').addEventListener('click', function () {
        var btn = this;
        if (!text.value.trim()) return UI.toast('Введи текст', 'err');
        global.TG.confirm('Отправить сообщение всем пользователям бота?').then(function (ok) {
          if (!ok) return;
          busy(btn, 'Запускаем…');
          API.admin.broadcast(text.value.trim(), false).then(function () {
            global.TG.haptic('success');
            UI.toast('Рассылка запущена', 'ok');
            restore(btn, 'users', 'Всем');
            clearTimeout(poll);
            pollState();
          }).catch(function (err) {
            UI.toast(errorMessage(err), 'err');
            restore(btn, 'users', 'Всем');
          });
        });
      });

      if (state.running) pollState();
    });
  }

  function broadcastStateHtml(st) {
    if (!st || (!st.running && !st.finishedAt)) {
      return '<div class="pill-note">' + UI.icon('info', 15) + 'Рассылок ещё не было</div>';
    }
    var pct = st.total ? Math.round(((st.sent + st.failed) / st.total) * 100) : 0;
    return (
      '<div class="card">' +
        '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px">' +
          '<div style="font-weight:900">' + (st.running ? 'Идёт рассылка' : 'Последняя рассылка') + '</div>' +
          (st.running ? statusPill('warn', pct + '%') : statusPill('ok', 'готово')) +
        '</div>' +
        '<div class="bd-row" style="grid-template-columns:1fr auto"><div><div class="bar"><i style="width:' + pct + '%"></i></div></div>' +
        '<div class="pts">' + st.sent + '/' + st.total + '</div></div>' +
        '<div style="font-size:12.5px;color:var(--text-dim);margin-top:8px">доставлено ' + st.sent + ' · не доставлено ' + st.failed +
        (st.preview ? ' · «' + UI.esc(st.preview) + '»' : '') + '</div>' +
      '</div>'
    );
  }

  /* --------------------------------- БОТ --------------------------------- */

  function renderBot(body) {
    return API.admin.bot().then(function (b) {
      if (!b.enabled) {
        body.innerHTML = UI.emptyState({ icon: 'unplug', title: 'Бот выключен', text: 'BOT_TOKEN не задан в .env на сервере.' });
        global.Icons.hydrate(body);
        return;
      }
      var me = b.me || {};
      var wh = b.webhook || {};
      var html = '';

      html += '<div class="card" style="margin-bottom:14px">' + kv([
        ['Бот', me.username ? '@' + UI.esc(me.username) : '—'],
        ['Имя', UI.esc(me.first_name || '—')],
        ['ID', String(me.id || '—')],
        ['Режим', UI.esc(b.mode)],
        ['Mini App URL', '<code>' + UI.esc(b.miniAppUrl) + '</code>'],
        ['Inline-режим', me.supports_inline_queries ? statusPill('ok', 'включён') : statusPill('warn', 'выключен в BotFather')],
        ['Custom emoji', b.customEmojiBlocked ? statusPill('warn', 'отклонены Telegram') : statusPill(b.customEmoji ? 'ok' : 'bad', b.customEmoji ? 'вкл' : 'выкл')]
      ]) + '</div>';

      if (b.mode === 'webhook') {
        html += '<div class="card" style="margin-bottom:14px">' + kv([
          ['Webhook', wh.url ? '<code>' + UI.esc(wh.url) + '</code>' : statusPill('bad', 'не установлен')],
          ['В очереди', String(wh.pending_update_count || 0)],
          ['Последняя ошибка', wh.last_error_message ? statusPill('bad', wh.last_error_message) : statusPill('ok', 'нет')]
        ]) + '</div>';
      } else {
        html += '<div class="pill-note" style="width:100%;margin-bottom:14px">' + UI.icon('info', 15) + 'Long polling: вебхук не нужен. Для перехода на webhook задай BOT_MODE=webhook и WEBHOOK_SECRET в .env</div>';
      }

      html += '<button class="btn btn-block" id="bot-setup">' + UI.icon('refresh-cw', 17) + 'Переустановить команды и кнопку меню</button>';
      html += '<div class="pill-note" style="margin-top:12px">' + UI.icon('info', 15) + 'Нужно после смены PUBLIC_URL — чтобы кнопка «Dreinn» в чате вела на новый адрес</div>';

      body.innerHTML = html;
      global.Icons.hydrate(body);

      body.querySelector('#bot-setup').addEventListener('click', function () {
        var btn = this;
        busy(btn);
        API.admin.botSetup().then(function () {
          UI.toast('Команды и меню обновлены', 'ok');
          restore(btn, 'refresh-cw', 'Переустановить команды и кнопку меню');
        }).catch(function (err) {
          UI.toast(errorMessage(err), 'err');
          restore(btn, 'refresh-cw', 'Переустановить команды и кнопку меню');
        });
      });
    });
  }

  global.Views = Views;
})(window);
