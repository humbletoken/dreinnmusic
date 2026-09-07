/* =============================================================================
 *  Dreinn Music — мини-плеер 30-секундных превью (Deezer)
 * ========================================================================== */

(function (global) {
  'use strict';

  var audio = document.getElementById('audio');
  var bar = document.getElementById('mini-player');
  var elCover = document.getElementById('mp-cover');
  var elTitle = document.getElementById('mp-title');
  var elArtist = document.getElementById('mp-artist');
  var elToggle = document.getElementById('mp-toggle');
  var elClose = document.getElementById('mp-close');
  var elOpen = document.getElementById('mp-open');
  var elProgress = document.getElementById('mp-progress');

  var current = null;
  var listeners = [];

  function emit() {
    listeners.forEach(function (fn) {
      try {
        fn(current, !audio.paused);
      } catch (err) {
        /* noop */
      }
    });
    syncButtons();
  }

  function syncButtons() {
    var playing = current && !audio.paused;
    elToggle.innerHTML = global.UI.icon(playing ? 'pause' : 'play', 18);

    document.querySelectorAll('[data-play]').forEach(function (btn) {
      var payload = safeParse(btn.getAttribute('data-play'));
      var isThis = payload && current && String(payload.id) === String(current.id);
      btn.classList.toggle('active', Boolean(isThis));
      btn.innerHTML = global.UI.icon(isThis && playing ? 'pause' : 'play', btn.classList.contains('play-dot') ? 15 : 16);
    });
  }

  function safeParse(value) {
    try {
      return JSON.parse(value);
    } catch (err) {
      return null;
    }
  }

  function show() {
    bar.classList.add('on');
    document.querySelectorAll('.screen').forEach(function (screen) { screen.classList.add('has-player'); });
  }

  function hide() {
    bar.classList.remove('on');
    document.querySelectorAll('.screen').forEach(function (screen) { screen.classList.remove('has-player'); });
  }

  var Player = {
    get current() { return current; },
    get playing() { return Boolean(current) && !audio.paused; },

    onChange: function (fn) { listeners.push(fn); },

    play: function (track) {
      if (!track || !track.preview) {
        global.UI.toast('У этого трека нет превью', 'err');
        return;
      }

      if (current && String(current.id) === String(track.id)) {
        Player.toggle();
        return;
      }

      current = track;
      audio.src = track.preview;
      audio.currentTime = 0;

      elCover.src = global.UI.cover(track.cover);
      elTitle.textContent = track.title || '';
      elArtist.textContent = track.artist || '';
      elProgress.style.width = '0%';

      show();
      audio.play().then(function () {
        global.TG.haptic('light');
        emit();
      }).catch(function () {
        global.UI.toast('Не удалось запустить превью', 'err');
      });
    },

    toggle: function () {
      if (!current) return;
      if (audio.paused) audio.play().catch(function () {});
      else audio.pause();
      global.TG.haptic('select');
      emit();
    },

    stop: function () {
      audio.pause();
      audio.removeAttribute('src');
      audio.load();
      current = null;
      hide();
      emit();
    },

    refreshButtons: syncButtons
  };

  audio.addEventListener('timeupdate', function () {
    if (!audio.duration) return;
    elProgress.style.width = Math.min(100, (audio.currentTime / audio.duration) * 100) + '%';
  });

  audio.addEventListener('ended', function () {
    elProgress.style.width = '100%';
    emit();
  });

  audio.addEventListener('play', emit);
  audio.addEventListener('pause', emit);

  elToggle.addEventListener('click', function () { Player.toggle(); });
  elClose.addEventListener('click', function () { Player.stop(); });
  elOpen.addEventListener('click', function () {
    if (current && global.App) global.App.go('track', { id: current.id });
  });

  document.addEventListener('click', function (event) {
    var btn = event.target.closest('[data-play]');
    if (!btn) return;
    event.preventDefault();
    event.stopPropagation();
    var payload = safeParse(btn.getAttribute('data-play'));
    if (payload) Player.play(payload);
  });

  global.Player = Player;
})(window);
