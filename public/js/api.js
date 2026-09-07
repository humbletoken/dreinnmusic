/* =============================================================================
 *  Dreinn Music — мост к Telegram и клиент API
 * ========================================================================== */

(function (global) {
  'use strict';

  var webApp = global.Telegram && global.Telegram.WebApp ? global.Telegram.WebApp : null;

  var TG = {
    app: webApp,
    available: Boolean(webApp && webApp.initData !== undefined),
    initData: webApp ? webApp.initData || '' : '',
    user: webApp && webApp.initDataUnsafe ? webApp.initDataUnsafe.user || null : null,
    startParam: webApp && webApp.initDataUnsafe ? webApp.initDataUnsafe.start_param || null : null,

    ready: function () {
      if (!webApp) return;
      try {
        webApp.ready();
        webApp.expand();
        if (typeof webApp.disableVerticalSwipes === 'function') webApp.disableVerticalSwipes();
        if (typeof webApp.setHeaderColor === 'function') {
          webApp.setHeaderColor(webApp.colorScheme === 'light' ? '#F4F3F0' : '#0B0B0E');
        }
        if (typeof webApp.setBackgroundColor === 'function') {
          webApp.setBackgroundColor(webApp.colorScheme === 'light' ? '#F4F3F0' : '#0B0B0E');
        }
      } catch (err) {
        console.warn('TG ready failed', err);
      }
    },

    applyTheme: function () {
      var light = webApp ? webApp.colorScheme === 'light' : false;
      document.body.classList.toggle('theme-light', light);
      var meta = document.querySelector('meta[name="theme-color"]');
      if (meta) meta.setAttribute('content', light ? '#F4F3F0' : '#0B0B0E');
    },

    haptic: function (kind) {
      if (!webApp || !webApp.HapticFeedback) return;
      try {
        if (kind === 'success' || kind === 'error' || kind === 'warning') {
          webApp.HapticFeedback.notificationOccurred(kind);
        } else if (kind === 'select') {
          webApp.HapticFeedback.selectionChanged();
        } else {
          webApp.HapticFeedback.impactOccurred(kind || 'light');
        }
      } catch (err) {
        /* noop */
      }
    },

    backButton: function (visible, handler) {
      if (!webApp || !webApp.BackButton) return;
      try {
        if (TG._backHandler) webApp.BackButton.offClick(TG._backHandler);
        TG._backHandler = handler || null;
        if (visible && handler) {
          webApp.BackButton.onClick(handler);
          webApp.BackButton.show();
        } else {
          webApp.BackButton.hide();
        }
      } catch (err) {
        /* noop */
      }
    },

    openLink: function (url, external) {
      if (webApp && typeof webApp.openLink === 'function') {
        webApp.openLink(url, { try_instant_view: false });
      } else {
        global.open(url, external === false ? '_self' : '_blank');
      }
    },

    openTelegramLink: function (url) {
      if (webApp && typeof webApp.openTelegramLink === 'function') webApp.openTelegramLink(url);
      else global.open(url, '_blank');
    },

    share: function (text, url) {
      var link = 'https://t.me/share/url?url=' + encodeURIComponent(url || '') + '&text=' + encodeURIComponent(text || '');
      TG.openTelegramLink(link);
    },

    alert: function (message) {
      if (webApp && typeof webApp.showAlert === 'function') webApp.showAlert(message);
      else global.alert(message);
    },

    confirm: function (message) {
      return new Promise(function (resolve) {
        if (webApp && typeof webApp.showConfirm === 'function') {
          webApp.showConfirm(message, function (ok) { resolve(Boolean(ok)); });
        } else {
          resolve(global.confirm(message));
        }
      });
    },

    close: function () {
      if (webApp && typeof webApp.close === 'function') webApp.close();
    }
  };

  /* ---------- HTTP ---------- */

  function buildQuery(params) {
    if (!params) return '';
    var parts = [];
    Object.keys(params).forEach(function (key) {
      var value = params[key];
      if (value === undefined || value === null || value === '') return;
      parts.push(encodeURIComponent(key) + '=' + encodeURIComponent(value));
    });
    return parts.length ? '?' + parts.join('&') : '';
  }

  function request(method, path, body, params) {
    var headers = { 'Content-Type': 'application/json' };
    if (TG.initData) headers['X-Init-Data'] = TG.initData;

    return fetch('/api' + path + buildQuery(params), {
      method: method,
      headers: headers,
      body: body ? JSON.stringify(body) : undefined
    }).then(function (res) {
      return res.text().then(function (text) {
        var data = null;
        try {
          data = text ? JSON.parse(text) : null;
        } catch (err) {
          data = { error: 'bad_response', raw: text };
        }
        if (!res.ok) {
          var error = new Error((data && data.error) || 'request_failed');
          error.status = res.status;
          error.payload = data;
          throw error;
        }
        return data;
      });
    });
  }

  var API = {
    get: function (path, params) { return request('GET', path, null, params); },
    post: function (path, body) { return request('POST', path, body); },
    patch: function (path, body) { return request('PATCH', path, body); },
    del: function (path) { return request('DELETE', path); },

    bootstrap: function () { return API.get('/bootstrap'); },
    home: function () { return API.get('/home'); },
    search: function (q, type, limit) { return API.get('/search', { q: q, type: type, limit: limit }); },
    track: function (id) { return API.get('/track/' + id); },
    album: function (id) { return API.get('/album/' + id); },
    artist: function (id) { return API.get('/artist/' + id); },
    discover: function (limit) { return API.get('/discover', { limit: limit }); },
    recommendations: function () { return API.get('/recommendations'); },
    rate: function (payload) { return API.post('/rate', payload); },
    previewScore: function (payload) { return API.post('/preview-score', payload); },
    unrate: function (type, id) { return API.del('/rate/' + type + '/' + id); },
    ratings: function (params) { return API.get('/ratings', params); },
    ratingOf: function (type, id) { return API.get('/ratings/' + type + '/' + id); },
    favorites: function (type) { return API.get('/favorites', { type: type }); },
    toggleFavorite: function (payload) { return API.post('/favorites', payload); },
    profile: function (userId) { return API.get('/profile', { userId: userId }); },
    leaderboard: function (period) { return API.get('/leaderboard', { period: period }); },
    users: function (q) { return API.get('/users', { q: q }); },
    compare: function (userId) { return API.get('/compare/' + userId); },
    collections: function () { return API.get('/collections'); },
    collection: function (id) { return API.get('/collections/' + id); },
    createCollection: function (payload) { return API.post('/collections', payload); },
    updateCollection: function (id, payload) { return API.patch('/collections/' + id, payload); },
    deleteCollection: function (id) { return API.del('/collections/' + id); },
    addToCollection: function (id, payload) { return API.post('/collections/' + id + '/items', payload); },
    removeFromCollection: function (id, itemId) { return API.del('/collections/' + id + '/items/' + itemId); },

    spotifyStatus: function () { return API.get('/spotify/status'); },
    spotifyAuthUrl: function () { return API.post('/spotify/auth-url', {}); },
    spotifyDisconnect: function () { return API.post('/spotify/disconnect', {}); },
    spotifyPlaylists: function () { return API.get('/spotify/playlists'); },
    spotifyPlaylistTracks: function (id, offset) { return API.get('/spotify/playlists/' + id + '/tracks', { offset: offset }); },
    spotifyImport: function (playlistId) { return API.post('/spotify/import', { playlistId: playlistId }); },
    spotifyExport: function (payload) { return API.post('/spotify/export', payload); }
  };

  global.TG = TG;
  global.API = API;
  global.STATE = { config: null, user: null, spotify: null, stats: null };
})(window);
