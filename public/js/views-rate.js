/* =============================================================================
 *  Dreinn Music — экран оценки (главный экран сервиса)
 * ========================================================================== */

(function (global) {
  'use strict';

  var UI = global.UI;
  var API = global.API;
  var Views = global.Views || {};

  function clamp(value) {
    var cfg = global.STATE.config;
    var n = Number(value);
    if (!isFinite(n)) return 0;
    return Math.min(cfg.critMax, Math.max(0, Math.round(n / cfg.critStep) * cfg.critStep));
  }

  var round1 = function (n) { return Math.round(n * 10) / 10; };

  /** Локальный расчёт — зеркало серверной формулы, чтобы всё пересчитывалось мгновенно. */
  function computeLocal(type, values, ctx) {
    var cfg = global.STATE.config;
    var criteria = type === 'album' ? cfg.albumCriteria : cfg.trackCriteria;

    var sum = criteria.reduce(function (acc, c) { return acc + clamp(values[c.key]); }, 0);
    var ownBase = (sum / (cfg.critMax * criteria.length)) * cfg.baseMax;

    var weight = 0;
    var base = ownBase;
    if (type === 'album' && ctx && ctx.rated > 0 && ctx.total > 0) {
      var coverage = Math.min(1, ctx.rated / ctx.total);
      weight = Math.round(cfg.trackWeightInAlbum * coverage * 100) / 100;
      base = ownBase * (1 - weight) + ((ctx.avgFinal || 0) / cfg.maxScore) * cfg.baseMax * weight;
    }

    var coefficient = Math.round((cfg.vibeBaseK + cfg.vibeStepK * clamp(values.vibe)) * 100) / 100;
    var final = Math.min(cfg.maxScore, round1(round1(base) * coefficient));

    return {
      base: round1(base),
      baseMax: cfg.baseMax,
      ownBase: round1(ownBase),
      coefficient: coefficient,
      final: final,
      max: cfg.maxScore,
      weight: weight,
      breakdown: criteria.map(function (c) {
        return {
          key: c.key,
          icon: c.icon,
          short: c.short,
          title: c.title,
          value: clamp(values[c.key]),
          max: cfg.critMax,
          points: clamp(values[c.key]) * cfg.pointsPerUnit * (1 - weight)
        };
      })
    };
  }

  function critCard(criterion, value, isVibe) {
    var cfg = global.STATE.config;
    var pct = (value / cfg.critMax) * 100;
    return (
      '<div class="crit' + (isVibe ? ' vibe' : '') + '" data-crit="' + criterion.key + '">' +
        '<div class="crit-head">' +
          '<span class="glyph">' + UI.icon(criterion.icon, 19) + '</span>' +
          '<span class="txt"><b>' + UI.esc(criterion.title) + '</b><span>' + UI.esc(criterion.hint) + '</span></span>' +
          '<span class="crit-value" data-value-for="' + criterion.key + '">' + UI.fmtScore(value) + '<small>/10</small></span>' +
        '</div>' +
        '<div class="slider">' +
          '<input type="range" min="0" max="' + cfg.critMax + '" step="' + cfg.critStep + '" value="' + value + '" ' +
            'data-input-for="' + criterion.key + '" style="--fill:' + pct + '%">' +
          '<div class="slider-legend"><span>' + UI.esc(criterion.low) + '</span><span>' + UI.esc(criterion.high) + '</span></div>' +
        '</div>' +
      '</div>'
    );
  }

  Views.rate = {
    skeleton: function () {
      return (
        '<div class="screen">' +
          '<div class="screen-head"><button class="icon-btn" data-back>' + UI.icon('arrow-left', 19) + '</button>' +
          '<div class="title-block"><h1>Оценка</h1></div></div>' +
          UI.skeletonBlock(86, 26) +
          '<div class="sk" style="width:148px;height:148px;border-radius:50%;margin:0 auto 20px"></div>' +
          UI.skeletonBlock(110, 26) + UI.skeletonBlock(110, 26) + UI.skeletonBlock(110, 26) +
        '</div>'
      );
    },

    render: function (params) {
      var type = params.type === 'album' ? 'album' : 'track';
      var loader = type === 'album' ? API.album(params.id) : API.track(params.id);

      return loader.then(function (data) {
        var cfg = global.STATE.config;
        var item = data.item;
        var existing = data.myRating;
        var criteria = type === 'album' ? cfg.albumCriteria : cfg.trackCriteria;

        var values = {};
        criteria.forEach(function (c) {
          values[c.key] = existing && existing.values[c.key] !== undefined && existing.values[c.key] !== null
            ? existing.values[c.key]
            : 5;
        });
        values.vibe = existing ? existing.values.vibe : 5;

        var ctx = type === 'album'
          ? {
              rated: data.trackContext ? data.trackContext.rated : 0,
              total: data.trackContext ? data.trackContext.total : item.trackCount,
              avgFinal: data.trackContext ? data.trackContext.avgFinal : 0
            }
          : null;

        Views.rate._state = {
          type: type,
          item: item,
          values: values,
          ctx: ctx,
          existing: existing,
          review: existing ? existing.review : ''
        };

        var score = computeLocal(type, values, ctx);

        var html = '<div class="screen">';
        html +=
          '<div class="screen-head">' +
            '<button class="icon-btn" data-back>' + UI.icon('arrow-left', 19) + '</button>' +
            '<div class="title-block"><h1>' + (existing ? 'Изменить оценку' : 'Оценка') + '</h1>' +
            '<div class="sub">' + (type === 'album' ? 'альбом' : 'трек') + ' · до ' + cfg.maxScore + ' баллов</div></div>' +
          '</div>';

        html +=
          '<div class="rate-item">' +
            '<img class="cover" src="' + UI.esc(UI.cover(item.cover)) + '" alt="">' +
            '<div style="flex:1;min-width:0">' +
              '<div style="font-weight:650;font-size:15px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">' + UI.esc(item.title) + '</div>' +
              '<div style="color:var(--text-dim);font-size:12.5px">' + UI.esc(item.artist) + '</div>' +
            '</div>' +
            (item.preview
              ? '<button class="play-btn" data-play=\'' + UI.esc(JSON.stringify({ id: item.id, title: item.title, artist: item.artist, cover: item.cover, preview: item.preview })) + '\'>' + UI.icon('play', 17) + '</button>'
              : '') +
          '</div>';

        html += '<div id="rate-ring" style="margin-bottom:6px">' + UI.scoreRing({ value: score.final }) + '</div>';
        html += '<div id="rate-formula">' + UI.formulaBlock(score) + '</div>';

        if (type === 'album' && ctx && ctx.rated > 0) {
          html +=
            '<div class="pill-note" style="width:100%;margin-bottom:16px">' + UI.icon('info', 16) +
              'Учтено ' + ctx.rated + ' из ' + ctx.total + ' оценённых треков (вес ' + Math.round(score.weight * 100) + '%, средняя ' + UI.fmtScore(ctx.avgFinal) + ')' +
            '</div>';
        }

        html += '<div id="crit-list">';
        html += criteria.map(function (c) { return critCard(c, values[c.key], false); }).join('');
        html += critCard(cfg.vibeCriterion, values.vibe, true);
        html += '</div>';

        html += '<div class="section" style="margin-top:20px">' + UI.sectionHead('Разбивка', 'chart-column');
        html += '<div class="card" id="rate-breakdown">' + UI.breakdownList(score.breakdown) + '</div></div>';

        html += '<div class="section">' + UI.sectionHead('Короткий отзыв', 'speech');
        html += '<textarea class="review" id="rate-review" maxlength="600" placeholder="Пара слов о впечатлении — по желанию">' +
          UI.esc(existing ? existing.review : '') + '</textarea>';
        html += '<div style="text-align:right;font-size:11px;color:var(--text-mute);margin-top:6px" id="review-count">0 / 600</div></div>';

        html +=
          '<div class="save-bar">' +
            (existing ? '<button class="icon-btn" id="rate-delete" style="width:52px;height:52px">' + UI.icon('trash-2', 19) + '</button>' : '') +
            '<button class="btn btn-primary btn-block" id="rate-save">' + UI.icon('check', 18) + (existing ? 'Сохранить изменения' : 'Поставить оценку') + '</button>' +
          '</div>';

        return html + '</div>';
      });
    },

    mount: function (root) {
      var state = Views.rate._state;
      var ringHost = root.querySelector('#rate-ring');
      var formulaHost = root.querySelector('#rate-formula');
      var breakdownHost = root.querySelector('#rate-breakdown');
      var review = root.querySelector('#rate-review');
      var counter = root.querySelector('#review-count');
      var lastFinal = null;

      function refresh() {
        var score = computeLocal(state.type, state.values, state.ctx);

        if (lastFinal === null || Math.abs(score.final - lastFinal) > 0.01) {
          ringHost.innerHTML = UI.scoreRing({ value: score.final });
          lastFinal = score.final;
        }
        formulaHost.innerHTML = UI.formulaBlock(score);
        breakdownHost.innerHTML = UI.breakdownList(score.breakdown);
        global.Icons.hydrate(formulaHost);
        global.Icons.hydrate(breakdownHost);
      }

      root.querySelectorAll('input[type=range]').forEach(function (input) {
        var key = input.getAttribute('data-input-for');
        var card = input.closest('.crit');
        var label = root.querySelector('[data-value-for="' + key + '"]');

        input.addEventListener('input', function () {
          var value = Number(input.value);
          state.values[key] = value;
          input.style.setProperty('--fill', (value / global.STATE.config.critMax) * 100 + '%');
          label.innerHTML = UI.fmtScore(value) + '<small>/10</small>';
          label.classList.add('bump');
          card.classList.add('touched');
          setTimeout(function () { label.classList.remove('bump'); }, 180);
          refresh();
        });

        input.addEventListener('change', function () { global.TG.haptic('select'); });
      });

      if (review) {
        var updateCount = function () {
          counter.textContent = review.value.length + ' / 600';
          state.review = review.value;
        };
        review.addEventListener('input', updateCount);
        updateCount();
      }

      var saveBtn = root.querySelector('#rate-save');
      saveBtn.addEventListener('click', function () {
        saveBtn.disabled = true;
        saveBtn.innerHTML = UI.icon('loader-circle', 18) + 'Сохраняем…';
        global.Icons.hydrate(saveBtn);

        API.rate({
          type: state.type,
          itemId: state.item.id,
          values: state.values,
          review: state.review,
          item: state.item
        }).then(function (res) {
          global.TG.haptic('success');
          UI.toast('Оценка ' + UI.fmtScore(res.rating.final) + ' — ' + res.rating.tier.label, 'ok');
          showResultSheet(res);
          global.App.replace(state.type, { id: state.item.id });
        }).catch(function () {
          global.TG.haptic('error');
          UI.toast('Не удалось сохранить оценку', 'err');
          saveBtn.disabled = false;
          saveBtn.innerHTML = UI.icon('check', 18) + 'Повторить';
          global.Icons.hydrate(saveBtn);
        });
      });

      var deleteBtn = root.querySelector('#rate-delete');
      if (deleteBtn) {
        deleteBtn.addEventListener('click', function () {
          global.TG.confirm('Удалить свою оценку?').then(function (ok) {
            if (!ok) return;
            API.unrate(state.type, state.item.id).then(function () {
              UI.toast('Оценка удалена', 'ok');
              global.TG.haptic('warning');
              global.App.replace(state.type, { id: state.item.id });
            });
          });
        });
      }

      refresh();
    }
  };

  function showResultSheet(res) {
    var rating = res.rating;
    var body = UI.sheet(
      '<div style="text-align:center">' +
        UI.scoreRing({ value: rating.final, tier: rating.tier }) +
        '<h2 style="font-size:20px;margin:14px 0 4px">' + UI.esc(rating.title) + '</h2>' +
        '<div style="color:var(--text-dim);font-size:13.5px;margin-bottom:16px">' + UI.esc(rating.artist || '') + '</div>' +
      '</div>' +
      UI.formulaBlock({ base: rating.base, baseMax: 75, coefficient: rating.coefficient, final: rating.final, max: rating.max }) +
      UI.breakdownList(rating.breakdown) +
      '<div style="display:flex;gap:10px;margin-top:18px">' +
        '<button class="btn btn-block" data-sheet-close>Закрыть</button>' +
        '<button class="btn btn-primary btn-block" data-act="share">' + UI.icon('share-2', 17) + 'Поделиться</button>' +
      '</div>'
    );

    body.addEventListener('click', function (event) {
      var btn = event.target.closest('[data-act="share"]');
      if (!btn) return;
      var botUsername = global.STATE.config && global.STATE.config.botUsername;
      var link = botUsername ? 'https://t.me/' + botUsername + '?start=' + rating.type + '_' + rating.itemId : global.location.origin;
      global.TG.share(
        'Оценил «' + rating.title + '» на ' + UI.fmtScore(rating.final) + '/90 — ' + rating.tier.label + ' в Dreinn Music',
        link
      );
      UI.closeSheet();
    });
  }

  Views.rate.computeLocal = computeLocal;
  global.Views = Views;
})(window);
