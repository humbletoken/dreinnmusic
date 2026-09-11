/* =============================================================================
 *  Dreinn Music — роутер, навигация и запуск Mini App
 * ========================================================================== */

(function (global) {
  'use strict';

  var UI = global.UI;
  var ROOT_VIEWS = ['home', 'search', 'discover', 'charts', 'profile'];

  var appRoot = document.getElementById('app');
  var nav = document.getElementById('bottom-nav');

  var stack = [];
  var busy = false;

  function currentEntry() { return stack[stack.length - 1] || null; }

  function parseTarget(target) {
    if (!target) return null;
    var parts = String(target).split(':');
    var view = parts[0];

    if (view === 'rate') return { view: 'rate', params: { type: parts[1] || 'track', id: parts[2] } };
    if (view === 'track' || view === 'album' || view === 'artist') return { view: view, params: { id: parts[1] } };
    if (view === 'collection') return { view: 'collection', params: { id: parts[1] } };
    if (view === 'compare') return { view: 'compare', params: parts[1] ? { userId: parts[1] } : {} };
    if (view === 'profile') return { view: 'profile', params: parts[1] ? { userId: parts[1] } : {} };
    if (view === 'spotifyPlaylist') return { view: 'spotifyPlaylist', params: { id: parts.slice(1).join(':') } };
    if (view === 'search') return { view: 'search', params: { type: parts[1] || 'track', q: parts.slice(2).join(':') || '' } };
    return { view: view, params: {} };
  }

  function updateNav(view) {
    nav.querySelectorAll('.nav-item').forEach(function (item) {
      item.classList.toggle('on', item.getAttribute('data-nav') === view);
    });
  }

  function syncBackButton() {
    var visible = stack.length > 1;
    global.TG.backButton(visible, visible ? App.back : null);
  }

  function errorScreen(message) {
    return (
      '<div class="screen">' +
        UI.emptyState({
          icon: 'triangle-alert',
          title: 'Что-то пошло не так',
          text: message || 'Не удалось загрузить данные. Попробуй ещё раз.'
        }) +
        '<div style="text-align:center"><button class="btn btn-primary" data-retry>' + UI.icon('refresh-cw', 17) + 'Повторить</button></div>' +
      '</div>'
    );
  }

  function paint(html, view, params, definition) {
    appRoot.innerHTML = html;
    global.Icons.hydrate(appRoot);
    global.Player.refreshButtons();

    if (global.Player.current) {
      appRoot.querySelectorAll('.screen').forEach(function (screen) { screen.classList.add('has-player'); });
    }

    var root = appRoot.querySelector('.screen') || appRoot;
    if (definition && typeof definition.mount === 'function') {
      try {
        definition.mount(root, params);
      } catch (err) {
        console.error('mount failed', view, err);
      }
    }
  }

  function render(entry, options) {
    var opts = options || {};
    var definition = global.Views[entry.view];

    if (!definition) {
      paint(errorScreen('Экран «' + entry.view + '» не найден'), entry.view, entry.params, null);
      return Promise.resolve();
    }

    updateNav(ROOT_VIEWS.indexOf(entry.view) >= 0 ? entry.view : '');
    syncBackButton();

    if (typeof definition.skeleton === 'function') {
      appRoot.innerHTML = definition.skeleton(entry.params);
      global.Icons.hydrate(appRoot);
    }

    busy = true;
    return Promise.resolve()
      .then(function () { return definition.render(entry.params || {}); })
      .then(function (html) {
        paint(html, entry.view, entry.params, definition);
        if (opts.scroll) global.scrollTo(0, opts.scroll);
        else global.scrollTo(0, 0);
      })
      .catch(function (err) {
        console.error('render failed', entry.view, err);
        var message = err && err.status === 401
          ? 'Открой приложение через Telegram — нужна авторизация.'
          : 'Не удалось загрузить данные. Проверь соединение.';
        paint(errorScreen(message), entry.view, entry.params, null);
      })
      .then(function () { busy = false; });
  }

  var App = {
    get stack() { return stack; },

    go: function (view, params) {
      if (busy) return;
      UI.closeSheet();
      var entry = currentEntry();
      if (entry) entry.scroll = global.scrollY;
      stack.push({ view: view, params: params || {} });
      global.TG.haptic('light');
      render(stack[stack.length - 1]);
    },

    replace: function (view, params) {
      stack[stack.length - 1] = { view: view, params: params || {} };
      render(stack[stack.length - 1]);
    },

    back: function () {
      if (document.getElementById('sheet-host').classList.contains('on')) {
        UI.closeSheet();
        return;
      }
      if (stack.length <= 1) {
        syncBackButton();
        return;
      }
      stack.pop();
      global.TG.haptic('light');
      var entry = currentEntry();
      render(entry, { scroll: entry.scroll || 0 });
    },

    root: function (view, params) {
      UI.closeSheet();
      stack = [{ view: view, params: params || {} }];
      render(stack[0]);
    },

    navigate: function (target) {
      var parsed = parseTarget(target);
      if (!parsed) return;
      if (ROOT_VIEWS.indexOf(parsed.view) >= 0 && !Object.keys(parsed.params).length) App.root(parsed.view, parsed.params);
      else App.go(parsed.view, parsed.params);
    },

    refresh: function () {
      var entry = currentEntry();
      if (entry) render(entry);
    }
  };

  /* ---------- делегирование кликов ---------- */

  document.addEventListener('click', function (event) {
    var sheetClose = event.target.closest('[data-sheet-close]');
    if (sheetClose) {
      UI.closeSheet();
      return;
    }

    var back = event.target.closest('[data-back]');
    if (back) {
      App.back();
      return;
    }

    var retry = event.target.closest('[data-retry]');
    if (retry) {
      App.refresh();
      return;
    }

    var navItem = event.target.closest('[data-nav]');
    if (navItem) {
      var view = navItem.getAttribute('data-nav');
      global.TG.haptic('select');
      if (currentEntry() && currentEntry().view === view) global.scrollTo({ top: 0, behavior: 'smooth' });
      else App.root(view, {});
      return;
    }

    var goNode = event.target.closest('[data-go]');
    if (goNode) {
      var target = goNode.getAttribute('data-go');
      if (!target) return;
      UI.closeSheet();
      App.navigate(target);
    }
  });

  document.addEventListener('keydown', function (event) {
    if (event.key === 'Escape') {
      UI.closeSheet();
      App.back();
    }
  });

  /* ---------- запуск ---------- */

  function initialTarget() {
    var params = new URLSearchParams(global.location.search);
    var route = params.get('r') || params.get('startapp') || global.TG.startParam || '';
    if (!route) return null;
    return String(route).replace(/_/g, ':');
  }

  function boot() {
    global.TG.ready();
    global.TG.applyTheme();

    // статическая разметка: нижняя навигация и мини-плеер
    global.Icons.hydrate(document);

    if (global.Telegram && global.Telegram.WebApp) {
      global.Telegram.WebApp.onEvent('themeChanged', function () { global.TG.applyTheme(); });
    }

    global.API.bootstrap()
      .then(function (data) {
        global.STATE.config = data.config;
        global.STATE.user = data.user;
        global.STATE.spotify = data.spotify;
        global.STATE.stats = data.stats;

        var target = initialTarget();
        if (target) {
          var parsed = parseTarget(target);
          if (parsed && global.Views[parsed.view]) {
            stack = [{ view: 'home', params: {} }, { view: parsed.view, params: parsed.params }];
            render(stack[1]);
            return;
          }
        }
        App.root('home', {});
      })
      .catch(function (err) {
        console.error('bootstrap failed', err);
        var reason = err && err.payload && err.payload.message;
        var status = err && err.status;
        appRoot.innerHTML = errorScreen(
          status === 401
            ? (reason || 'Приложение открывается только внутри Telegram. Запусти его через бота.')
            : status === 403 || status === 503
              ? (reason || 'Доступ временно закрыт.')
              : 'Сервер недоступен. Попробуй ещё раз через минуту.'
        );
        global.Icons.hydrate(appRoot);
      });
  }

  global.App = App;

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})(window);
