'use strict';

/* =============================================================================
 *  DREINN MUSIC
 *  Telegram bot + Mini App: многофакторная система оценки треков и альбомов.
 *
 *  Каталог и 30-секундные превью  ->  Deezer public API
 *  Плейлисты пользователя         ->  Spotify OAuth (только метаданные)
 *  Хранилище                      ->  SQLite (docker volume)
 *
 *  Вся серверная логика намеренно собрана в этом файле.
 *  Клиент Mini App лежит в ./public
 * ========================================================================== */

require('dotenv').config();

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const express = require('express');
const Database = require('better-sqlite3');

/* =============================================================================
 * 1. КОНФИГУРАЦИЯ
 * ========================================================================== */

const toBool = (value, fallback = false) => {
  if (value === undefined || value === null || value === '') return fallback;
  return ['1', 'true', 'yes', 'on', 'y'].includes(String(value).trim().toLowerCase());
};

const toInt = (value, fallback) => {
  const n = parseInt(value, 10);
  return Number.isFinite(n) ? n : fallback;
};

function buildPublicUrl() {
  const explicit = (process.env.PUBLIC_URL || '').trim();
  if (explicit) return explicit.replace(/\/+$/, '');

  const scheme = (process.env.APP_SCHEME || 'https').trim();
  const domain = (process.env.APP_DOMAIN || 'localhost').trim();
  const port = toInt(process.env.PORT, 3000);
  const isDefaultPort = (scheme === 'https' && port === 443) || (scheme === 'http' && port === 80);
  return `${scheme}://${domain}${isDefaultPort ? '' : ':' + port}`.replace(/\/+$/, '');
}

const CFG = {
  port: toInt(process.env.PORT, 3000),
  host: process.env.HOST || '0.0.0.0',
  publicUrl: buildPublicUrl(),

  botToken: (process.env.BOT_TOKEN || '').trim(),
  botUsername: (process.env.BOT_USERNAME || '').replace(/^@/, '').trim(),
  botMode: (process.env.BOT_MODE || 'polling').trim().toLowerCase(),
  webhookPath: process.env.WEBHOOK_PATH || '/telegram/webhook',
  webhookSecret: (process.env.WEBHOOK_SECRET || '').trim(),

  spotifyClientId: (process.env.SPOTIFY_CLIENT_ID || '').trim(),
  spotifyClientSecret: (process.env.SPOTIFY_CLIENT_SECRET || '').trim(),

  dbPath: process.env.DB_PATH || path.join(__dirname, 'data', 'dreinn.db'),
  deezerApi: (process.env.DEEZER_API || 'https://api.deezer.com').replace(/\/+$/, ''),
  cacheTtl: toInt(process.env.CACHE_TTL, 600),

  useCustomEmoji: toBool(process.env.USE_CUSTOM_EMOJI, true),
  devMode: toBool(process.env.DEV_MODE, false),
  adminIds: (process.env.ADMIN_IDS || '')
    .split(',')
    .map((s) => parseInt(s.trim(), 10))
    .filter(Boolean)
};

CFG.spotifyRedirectUri =
  (process.env.SPOTIFY_REDIRECT_URI || '').trim() || `${CFG.publicUrl}/spotify/callback`;
CFG.spotifyEnabled = Boolean(CFG.spotifyClientId && CFG.spotifyClientSecret);
CFG.botEnabled = Boolean(CFG.botToken);

const LOG_LEVELS = { error: 0, warn: 1, info: 2, debug: 3 };
const LOG_LEVEL = LOG_LEVELS[(process.env.LOG_LEVEL || 'info').toLowerCase()] ?? 2;

const log = {
  write(level, tag, args) {
    if (LOG_LEVELS[level] > LOG_LEVEL) return;
    const ts = new Date().toISOString().replace('T', ' ').slice(0, 19);
    console[level === 'debug' ? 'log' : level](`${ts} ${tag}`, ...args);
  },
  error: (...a) => log.write('error', '[x]', a),
  warn: (...a) => log.write('warn', '[!]', a),
  info: (...a) => log.write('info', '[·]', a),
  debug: (...a) => log.write('debug', '[~]', a)
};

/* =============================================================================
 * 2. PREMIUM (CUSTOM) EMOJI
 *    id взяты из набора «Telegram Ducks».
 *    Если у бота нет прав на custom emoji, отправка автоматически
 *    деградирует до обычных эмодзи (см. tg.api / tg.sendMessage).
 * ========================================================================== */

const CUSTOM_EMOJI = {
  wave: ['5472235990955334730', '👋'],
  duck: ['5472094411653389375', '🦆'],
  duckAlt: ['5417851427131239037', '🦆'],
  duckCool: ['5472406578466397222', '🦆'],
  music: ['5222175680652917218', '🎵'],
  note: ['5471953781539215423', '🎵'],
  headphones: ['5474288573005964288', '🎧'],
  headphones2: ['5472068882367781682', '🎧'],
  mic: ['5471919885657316480', '🎤'],
  fire: ['5273731647735348062', '🔥'],
  fire2: ['5472423702501006989', '🔥'],
  star: ['5472221053059078763', '⭐'],
  star2: ['5418017294473251153', '⭐'],
  starGold: ['5471901288448924312', '⭐️'],
  trophy: ['5424767999515040992', '🏆'],
  chart: ['5422360266618707867', '📊'],
  search: ['5472252840112037845', '🔍'],
  heart: ['5253478042256308885', '❤️'],
  heart2: ['5318895689869048747', '❤️'],
  robot: ['5255883984151276991', '🤖'],
  palette: ['5274090977584234781', '🎨'],
  check: ['5472180551517477902', '✅'],
  cross: ['5382355635553739365', '❌'],
  stop: ['5472267631979405211', '🚫'],
  party: ['5388674524583572460', '🎉'],
  partyFace: ['5472069780015946935', '🥳'],
  pin: ['5472145951260941641', '📌'],
  speech: ['5471930335312747865', '💬'],
  books: ['5388953246486269495', '📚'],
  book: ['5388968656828928370', '📖'],
  map: ['5472064286752775254', '🗺'],
  moon: ['5415765090932641459', '🌙'],
  repeat: ['5472012979073456920', '🔁'],
  eyes: ['5418303730137179564', '👀'],
  think: ['5472248119942979457', '🤔'],
  muscle: ['5422609593765241366', '💪'],
  top: ['5388824676640264285', '🔝'],
  abacus: ['5472355270787079946', '🧮'],
  rainbow: ['5472185383355685814', '🌈'],
  globe: ['5388674524583572460', '🌐'],
  calendar: ['5472100751025118421', '📆'],
  gift: ['5472096095280569232', '🎁'],
  sleep: ['5472247900899646367', '💤'],
  wand: ['5456289640673719977', '🪄'],
  clock: ['5319272710688226013', '⏰'],
  thumbUp: ['5318771518069551523', '👍'],
  thumbDown: ['5471961770178387649', '👎'],
  cool: ['5474667187258006816', '😎'],
  love: ['5319097733720584735', '😘'],
  wow: ['5472005106398404158', '😲'],
  sad: ['5474602251647458566', '😢'],
  angry: ['5319264979747092300', '😡'],
  shield: ['5472193350520021357', '🛡'],
  phone: ['5472200252532464654', '📱'],
  handshake: ['5422819664910656053', '🤝'],
  people: ['5472304422669262481', '👨‍👩‍👧‍👦']
};

/** Собрать custom-emoji тег (или обычный эмодзи, если премиум-эмодзи выключены). */
function em(key, forcePlain = false) {
  const entry = CUSTOM_EMOJI[key];
  if (!entry) return '';
  const [id, fallback] = entry;
  if (forcePlain || !CFG.useCustomEmoji) return fallback;
  return `<tg-emoji emoji-id="${id}">${fallback}</tg-emoji>`;
}

/** Убрать обёртки <tg-emoji>, оставив обычные эмодзи. */
function stripCustomEmoji(html) {
  return String(html).replace(/<tg-emoji[^>]*>([\s\S]*?)<\/tg-emoji>/g, '$1');
}

function escapeHtml(value) {
  return String(value === undefined || value === null ? '' : value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

/* =============================================================================
 * 3. СИСТЕМА ОЦЕНОК — «Dreinn Score», максимум 90 баллов
 *
 *  ТРЕК
 *    4 базовых критерия (0..10 с шагом 0.5) -> база 0..75
 *       база = (сумма 4 критериев / 40) * 75      (каждый балл критерия = 1.875)
 *    5-й критерий «Атмосфера / вайб» -> коэффициент
 *       k = 0.80 + 0.04 * vibe                    (0.80 .. 1.20)
 *    Итог = база * k                              (0 .. 90.0)
 *
 *  АЛЬБОМ
 *    4 альбомных критерия -> собственная база 0..75
 *    + учёт оценок отдельных треков альбома (вес зависит от покрытия,
 *      максимум 40% при полностью оценённом альбоме)
 *    + тот же коэффициент вайба -> итог 0..90
 * ========================================================================== */

const SCORE = {
  MAX: 90,
  BASE_MAX: 75,
  CRIT_MAX: 10,
  CRIT_STEP: 0.5,
  CRIT_COUNT: 4,
  VIBE_BASE_K: 0.8,
  VIBE_STEP_K: 0.04,
  TRACK_WEIGHT_IN_ALBUM: 0.4
};

SCORE.POINTS_PER_UNIT = SCORE.BASE_MAX / (SCORE.CRIT_MAX * SCORE.CRIT_COUNT); // 1.875

const TRACK_CRITERIA = [
  {
    key: 'lyrics',
    icon: 'lyrics',
    title: 'Тексты / образы',
    short: 'Тексты',
    hint: 'Смысл, метафоры, подача, цепляющие строчки',
    low: 'Пустые строки',
    high: 'Поэзия'
  },
  {
    key: 'structure',
    icon: 'structure',
    title: 'Структура / ритмика',
    short: 'Структура',
    hint: 'Аранжировка, флоу, динамика, как собран трек',
    low: 'Разваливается',
    high: 'Идеальная сборка'
  },
  {
    key: 'style',
    icon: 'style',
    title: 'Реализация стиля',
    short: 'Стиль',
    hint: 'Насколько убедительно выдержан жанр и звук',
    low: 'Мимо жанра',
    high: 'Эталон жанра'
  },
  {
    key: 'individuality',
    icon: 'charisma',
    title: 'Индивидуальность / харизма',
    short: 'Харизма',
    hint: 'Узнаваемость, характер, личность артиста',
    low: 'Безлико',
    high: 'Ни с кем не спутать'
  }
];

const ALBUM_CRITERIA = [
  {
    key: 'cohesion',
    icon: 'cohesion',
    title: 'Целостность',
    short: 'Целостность',
    hint: 'Треки складываются в единое полотно, а не в сборник',
    low: 'Набор синглов',
    high: 'Единое полотно'
  },
  {
    key: 'concept',
    icon: 'concept',
    title: 'Концепция',
    short: 'Концепция',
    hint: 'Есть идея, история, драматургия альбома',
    low: 'Идеи нет',
    high: 'Продуманный концепт'
  },
  {
    key: 'diversity',
    icon: 'diversity',
    title: 'Разнообразие',
    short: 'Разнообразие',
    hint: 'Треки не повторяют друг друга, есть развитие',
    low: 'Один трек 12 раз',
    high: 'Каждый трек свой'
  },
  {
    key: 'memorability',
    icon: 'memorability',
    title: 'Запоминаемость',
    short: 'Запоминаемость',
    hint: 'Что останется в голове через неделю',
    low: 'Забыл сразу',
    high: 'Не выкинуть из головы'
  }
];

const VIBE_CRITERION = {
  key: 'vibe',
  icon: 'vibe',
  title: 'Атмосфера / вайб',
  short: 'Вайб',
  hint: 'Множитель итогового балла: ×0.80 … ×1.20',
  low: 'Не цепляет',
  high: 'Полное погружение'
};

const TIERS = [
  { min: 81, key: 'legend', label: 'Легенда', emoji: 'trophy', color: '#F5D67B' },
  { min: 72, key: 'great', label: 'Великолепно', emoji: 'fire', color: '#FF9A62' },
  { min: 63, key: 'strong', label: 'Отлично', emoji: 'star', color: '#8FD9C0' },
  { min: 54, key: 'good', label: 'Сильно', emoji: 'thumbUp', color: '#9BC8FF' },
  { min: 45, key: 'solid', label: 'Хорошо', emoji: 'headphones', color: '#C0B7FF' },
  { min: 36, key: 'mid', label: 'Средне', emoji: 'think', color: '#B9B9C4' },
  { min: 27, key: 'weak', label: 'Спорно', emoji: 'eyes', color: '#9A9AA6' },
  { min: 18, key: 'bad', label: 'Слабо', emoji: 'sad', color: '#8A8A95' },
  { min: 0, key: 'skip', label: 'Мимо', emoji: 'stop', color: '#77777F' }
];

function tierFor(score) {
  const value = Number(score) || 0;
  return TIERS.find((t) => value >= t.min) || TIERS[TIERS.length - 1];
}

function clampCrit(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return 0;
  const stepped = Math.round(n / SCORE.CRIT_STEP) * SCORE.CRIT_STEP;
  return Math.min(SCORE.CRIT_MAX, Math.max(0, stepped));
}

const round1 = (n) => Math.round(Number(n) * 10) / 10;
const round2 = (n) => Math.round(Number(n) * 100) / 100;

function vibeCoefficient(vibe) {
  return round2(SCORE.VIBE_BASE_K + SCORE.VIBE_STEP_K * clampCrit(vibe));
}

/**
 * Рассчитать оценку трека.
 * @param {object} input {lyrics, structure, style, individuality, vibe}
 */
function computeTrackScore(input = {}) {
  const values = {};
  for (const c of TRACK_CRITERIA) values[c.key] = clampCrit(input[c.key]);
  const vibe = clampCrit(input.vibe);

  const rawSum = TRACK_CRITERIA.reduce((acc, c) => acc + values[c.key], 0);
  const base = round1((rawSum / (SCORE.CRIT_MAX * SCORE.CRIT_COUNT)) * SCORE.BASE_MAX);
  const coefficient = vibeCoefficient(vibe);
  const final = Math.min(SCORE.MAX, round1(base * coefficient));

  const breakdown = TRACK_CRITERIA.map((c) => ({
    key: c.key,
    title: c.title,
    short: c.short,
    icon: c.icon,
    value: values[c.key],
    max: SCORE.CRIT_MAX,
    points: round2(values[c.key] * SCORE.POINTS_PER_UNIT),
    maxPoints: round2(SCORE.CRIT_MAX * SCORE.POINTS_PER_UNIT)
  }));

  return {
    type: 'track',
    values: { ...values, vibe },
    vibe,
    base,
    baseMax: SCORE.BASE_MAX,
    coefficient,
    final,
    max: SCORE.MAX,
    bonus: round1(final - base),
    percent: Math.round((final / SCORE.MAX) * 100),
    breakdown,
    tier: tierFor(final)
  };
}

/**
 * Рассчитать оценку альбома с учётом оценок отдельных треков.
 * @param {object} input {cohesion, concept, diversity, memorability, vibe}
 * @param {object} tracksCtx {avgFinal, rated, total}
 */
function computeAlbumScore(input = {}, tracksCtx = {}) {
  const values = {};
  for (const c of ALBUM_CRITERIA) values[c.key] = clampCrit(input[c.key]);
  const vibe = clampCrit(input.vibe);

  const rawSum = ALBUM_CRITERIA.reduce((acc, c) => acc + values[c.key], 0);
  const ownBase = (rawSum / (SCORE.CRIT_MAX * SCORE.CRIT_COUNT)) * SCORE.BASE_MAX;

  const rated = Math.max(0, toInt(tracksCtx.rated, 0));
  const total = Math.max(0, toInt(tracksCtx.total, 0));
  const avgFinal = Number(tracksCtx.avgFinal) || 0;

  const coverage = total > 0 ? Math.min(1, rated / total) : 0;
  const weight = rated > 0 ? round2(SCORE.TRACK_WEIGHT_IN_ALBUM * coverage) : 0;
  const tracksBase = (avgFinal / SCORE.MAX) * SCORE.BASE_MAX;

  const base = round1(ownBase * (1 - weight) + tracksBase * weight);
  const coefficient = vibeCoefficient(vibe);
  const final = Math.min(SCORE.MAX, round1(base * coefficient));

  const breakdown = ALBUM_CRITERIA.map((c) => ({
    key: c.key,
    title: c.title,
    short: c.short,
    icon: c.icon,
    value: values[c.key],
    max: SCORE.CRIT_MAX,
    points: round2(values[c.key] * SCORE.POINTS_PER_UNIT * (1 - weight)),
    maxPoints: round2(SCORE.CRIT_MAX * SCORE.POINTS_PER_UNIT)
  }));

  return {
    type: 'album',
    values: { ...values, vibe },
    vibe,
    base,
    baseMax: SCORE.BASE_MAX,
    ownBase: round1(ownBase),
    coefficient,
    final,
    max: SCORE.MAX,
    bonus: round1(final - base),
    percent: Math.round((final / SCORE.MAX) * 100),
    breakdown,
    tracksInfluence: {
      weight,
      percent: Math.round(weight * 100),
      rated,
      total,
      coverage: Math.round(coverage * 100),
      avgFinal: round1(avgFinal),
      contribution: round1(tracksBase * weight)
    },
    tier: tierFor(final)
  };
}

function computeScore(type, input, tracksCtx) {
  return type === 'album' ? computeAlbumScore(input, tracksCtx) : computeTrackScore(input);
}

/* =============================================================================
 * 4. БАЗА ДАННЫХ (SQLite)
 *    Файл БД живёт на docker volume (DB_PATH=/data/dreinn.db).
 * ========================================================================== */

const DB_FILE = path.resolve(CFG.dbPath);
const DB_DIR = path.dirname(DB_FILE);

/**
 * Открыть SQLite и объяснить человеку, что делать, если каталог недоступен
 * (типичный случай — docker volume, созданный от root, при запуске под node).
 */
function openDatabase() {
  try {
    fs.mkdirSync(DB_DIR, { recursive: true });
    fs.accessSync(DB_DIR, fs.constants.W_OK);
    return new Database(DB_FILE);
  } catch (err) {
    const permissionIssue = ['SQLITE_CANTOPEN', 'EACCES', 'EPERM', 'EROFS', 'ENOENT'].includes(err.code);
    if (!permissionIssue) throw err;

    let owner = 'неизвестно';
    try {
      const stat = fs.statSync(DB_DIR);
      owner = `uid=${stat.uid} gid=${stat.gid}`;
    } catch {
      owner = 'каталог не существует';
    }
    const uid = typeof process.getuid === 'function' ? process.getuid() : 'n/a';
    const gid = typeof process.getgid === 'function' ? process.getgid() : 'n/a';

    console.error([
      '',
      '  ✗ Не удалось открыть базу данных SQLite.',
      '',
      `    файл          : ${DB_FILE}`,
      `    каталог       : ${DB_DIR} (${owner})`,
      `    процесс       : uid=${uid} gid=${gid}`,
      `    причина       : ${err.code || err.message}`,
      '',
      '  Чаще всего каталог с базой принадлежит root, а приложение работает',
      '  под пользователем node. Как починить:',
      '',
      '    # 1. выдать права на существующий docker-том',
      '    docker run --rm -v dreinn-data:/data alpine chown -R 1000:1000 /data',
      '',
      '    # 2. или пересоздать пустой том и запустить заново',
      '    docker compose down && docker volume rm dreinn-data && docker compose up -d --build',
      '',
      '  Если база лежит не в Docker, проверьте DB_PATH и права на каталог.',
      ''
    ].join('\n'));
    process.exit(1);
  }
}

const db = openDatabase();
db.pragma('journal_mode = WAL');
db.pragma('synchronous = NORMAL');
db.pragma('foreign_keys = ON');

db.exec(`
CREATE TABLE IF NOT EXISTS users (
  id             INTEGER PRIMARY KEY,
  username       TEXT,
  first_name     TEXT,
  last_name      TEXT,
  photo_url      TEXT,
  language_code  TEXT,
  is_premium     INTEGER DEFAULT 0,
  bio            TEXT DEFAULT '',
  is_public      INTEGER DEFAULT 1,
  created_at     INTEGER NOT NULL,
  last_seen      INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS ratings (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id        INTEGER NOT NULL,
  item_type      TEXT NOT NULL,               -- track | album
  item_id        TEXT NOT NULL,               -- deezer id
  title          TEXT NOT NULL,
  artist         TEXT,
  artist_id      TEXT,
  album_title    TEXT,
  album_id       TEXT,
  cover          TEXT,
  preview        TEXT,
  link           TEXT,
  genre          TEXT,
  release_date   TEXT,
  duration       INTEGER,
  lyrics         REAL,
  structure      REAL,
  style          REAL,
  individuality  REAL,
  cohesion       REAL,
  concept        REAL,
  diversity      REAL,
  memorability   REAL,
  vibe           REAL NOT NULL DEFAULT 0,
  base_score     REAL NOT NULL DEFAULT 0,
  coefficient    REAL NOT NULL DEFAULT 1,
  final_score    REAL NOT NULL DEFAULT 0,
  review         TEXT DEFAULT '',
  source         TEXT DEFAULT 'app',
  created_at     INTEGER NOT NULL,
  updated_at     INTEGER NOT NULL,
  UNIQUE(user_id, item_type, item_id),
  FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_ratings_user     ON ratings(user_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_ratings_item     ON ratings(item_type, item_id);
CREATE INDEX IF NOT EXISTS idx_ratings_artist   ON ratings(user_id, artist_id);
CREATE INDEX IF NOT EXISTS idx_ratings_album    ON ratings(user_id, album_id);
CREATE INDEX IF NOT EXISTS idx_ratings_score    ON ratings(item_type, final_score DESC);

CREATE TABLE IF NOT EXISTS favorites (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id     INTEGER NOT NULL,
  item_type   TEXT NOT NULL,
  item_id     TEXT NOT NULL,
  title       TEXT NOT NULL,
  artist      TEXT,
  artist_id   TEXT,
  cover       TEXT,
  preview     TEXT,
  link        TEXT,
  created_at  INTEGER NOT NULL,
  UNIQUE(user_id, item_type, item_id),
  FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_fav_user ON favorites(user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS collections (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id     INTEGER NOT NULL,
  name        TEXT NOT NULL,
  description TEXT DEFAULT '',
  icon        TEXT DEFAULT 'library',
  is_public   INTEGER DEFAULT 1,
  source      TEXT DEFAULT 'manual',          -- manual | spotify
  source_id   TEXT,
  created_at  INTEGER NOT NULL,
  updated_at  INTEGER NOT NULL,
  FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_collections_user ON collections(user_id, updated_at DESC);

CREATE TABLE IF NOT EXISTS collection_items (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  collection_id INTEGER NOT NULL,
  item_type     TEXT NOT NULL,
  item_id       TEXT NOT NULL,
  title         TEXT NOT NULL,
  artist        TEXT,
  artist_id     TEXT,
  cover         TEXT,
  preview       TEXT,
  link          TEXT,
  position      INTEGER DEFAULT 0,
  added_at      INTEGER NOT NULL,
  UNIQUE(collection_id, item_type, item_id),
  FOREIGN KEY(collection_id) REFERENCES collections(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_col_items ON collection_items(collection_id, position);

CREATE TABLE IF NOT EXISTS spotify_accounts (
  user_id       INTEGER PRIMARY KEY,
  spotify_id    TEXT,
  display_name  TEXT,
  email         TEXT,
  product       TEXT,
  country       TEXT,
  avatar        TEXT,
  access_token  TEXT NOT NULL,
  refresh_token TEXT,
  scope         TEXT,
  expires_at    INTEGER NOT NULL,
  connected_at  INTEGER NOT NULL,
  FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS oauth_states (
  state      TEXT PRIMARY KEY,
  user_id    INTEGER NOT NULL,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS spotify_map (
  spotify_id TEXT PRIMARY KEY,
  deezer_id  TEXT,
  payload    TEXT,
  updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS api_cache (
  key        TEXT PRIMARY KEY,
  payload    TEXT NOT NULL,
  expires_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS bot_state (
  user_id    INTEGER PRIMARY KEY,
  state      TEXT,
  payload    TEXT,
  updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS events (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id    INTEGER,
  kind       TEXT NOT NULL,
  payload    TEXT,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_events_created ON events(created_at DESC);
`);

const now = () => Math.floor(Date.now() / 1000);

/* --- пользователи ---------------------------------------------------------- */

const stmtInsertUser = db.prepare(`
  INSERT INTO users (id, username, first_name, last_name, photo_url, language_code, is_premium, created_at, last_seen)
  VALUES (@id, @username, @first_name, @last_name, @photo_url, @language_code, @is_premium, @ts, @ts)
  ON CONFLICT(id) DO UPDATE SET
    username      = COALESCE(excluded.username, users.username),
    first_name    = COALESCE(excluded.first_name, users.first_name),
    last_name     = COALESCE(excluded.last_name, users.last_name),
    photo_url     = COALESCE(excluded.photo_url, users.photo_url),
    language_code = COALESCE(excluded.language_code, users.language_code),
    is_premium    = excluded.is_premium,
    last_seen     = excluded.last_seen
`);

function upsertUser(tgUser = {}) {
  const id = toInt(tgUser.id, 0);
  if (!id) return null;
  stmtInsertUser.run({
    id,
    username: tgUser.username || null,
    first_name: tgUser.first_name || null,
    last_name: tgUser.last_name || null,
    photo_url: tgUser.photo_url || null,
    language_code: tgUser.language_code || null,
    is_premium: tgUser.is_premium ? 1 : 0,
    ts: now()
  });
  return db.prepare('SELECT * FROM users WHERE id = ?').get(id);
}

const getUser = (id) => db.prepare('SELECT * FROM users WHERE id = ?').get(toInt(id, 0));

function displayName(user) {
  if (!user) return 'Гость';
  const name = [user.first_name, user.last_name].filter(Boolean).join(' ').trim();
  return name || (user.username ? '@' + user.username : 'Слушатель #' + user.id);
}

function logEvent(userId, kind, payload) {
  try {
    db.prepare('INSERT INTO events (user_id, kind, payload, created_at) VALUES (?,?,?,?)').run(
      userId || null,
      kind,
      payload ? JSON.stringify(payload) : null,
      now()
    );
  } catch (err) {
    log.debug('event log failed', err.message);
  }
}

/* --- кэш внешних API ------------------------------------------------------- */

const memCache = new Map();

function cacheGet(key) {
  const hit = memCache.get(key);
  if (hit && hit.expires > Date.now()) return hit.value;
  if (hit) memCache.delete(key);

  const row = db.prepare('SELECT payload, expires_at FROM api_cache WHERE key = ?').get(key);
  if (!row) return null;
  if (row.expires_at < now()) {
    db.prepare('DELETE FROM api_cache WHERE key = ?').run(key);
    return null;
  }
  try {
    const value = JSON.parse(row.payload);
    memCache.set(key, { value, expires: row.expires_at * 1000 });
    return value;
  } catch {
    return null;
  }
}

function cacheSet(key, value, ttl = CFG.cacheTtl) {
  const expires = now() + ttl;
  memCache.set(key, { value, expires: expires * 1000 });
  try {
    db.prepare('INSERT INTO api_cache (key, payload, expires_at) VALUES (?,?,?) ON CONFLICT(key) DO UPDATE SET payload=excluded.payload, expires_at=excluded.expires_at')
      .run(key, JSON.stringify(value), expires);
  } catch (err) {
    log.debug('cache write failed', err.message);
  }
  return value;
}

setInterval(() => {
  try {
    db.prepare('DELETE FROM api_cache WHERE expires_at < ?').run(now());
    db.prepare('DELETE FROM oauth_states WHERE created_at < ?').run(now() - 1800);
    for (const [key, hit] of memCache) if (hit.expires < Date.now()) memCache.delete(key);
  } catch (err) {
    log.debug('cache cleanup failed', err.message);
  }
}, 10 * 60 * 1000).unref();

/* =============================================================================
 * 5. HTTP-ХЕЛПЕРЫ
 * ========================================================================== */

async function fetchJson(url, options = {}, { timeout = 12000, retries = 1 } = {}) {
  let lastError;
  for (let attempt = 0; attempt <= retries; attempt += 1) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeout);
    try {
      const res = await fetch(url, { ...options, signal: controller.signal });
      const text = await res.text();
      let data = null;
      if (text) {
        try {
          data = JSON.parse(text);
        } catch {
          data = { raw: text };
        }
      }
      if (!res.ok) {
        const err = new Error(`HTTP ${res.status} ${url}`);
        err.status = res.status;
        err.body = data;
        throw err;
      }
      return data;
    } catch (err) {
      lastError = err;
      if (err.status && err.status >= 400 && err.status < 500 && err.status !== 429) throw err;
      if (attempt < retries) await new Promise((r) => setTimeout(r, 350 * (attempt + 1)));
    } finally {
      clearTimeout(timer);
    }
  }
  throw lastError;
}

/* =============================================================================
 * 6. DEEZER — каталог и превью
 * ========================================================================== */

const dz = {
  async call(endpoint, params = {}, ttl = CFG.cacheTtl) {
    const query = new URLSearchParams();
    for (const [k, v] of Object.entries(params)) {
      if (v !== undefined && v !== null && v !== '') query.set(k, String(v));
    }
    const qs = query.toString();
    const key = `dz:${endpoint}?${qs}`;
    const cached = cacheGet(key);
    if (cached) return cached;

    const url = `${CFG.deezerApi}${endpoint}${qs ? '?' + qs : ''}`;
    const data = await fetchJson(url, { headers: { 'User-Agent': 'DreinnMusic/1.0' } });
    if (data && data.error && Object.keys(data.error).length) {
      const err = new Error(data.error.message || 'Deezer error');
      err.code = data.error.code;
      throw err;
    }
    return cacheSet(key, data, ttl);
  },

  search(query, type = 'track', limit = 25, index = 0) {
    const endpoint = type === 'track' ? '/search' : `/search/${type}`;
    return dz.call(endpoint, { q: query, limit, index });
  },

  track: (id) => dz.call(`/track/${id}`, {}, 86400),
  album: (id) => dz.call(`/album/${id}`, {}, 86400),
  artist: (id) => dz.call(`/artist/${id}`, {}, 86400),
  artistTop: (id, limit = 15) => dz.call(`/artist/${id}/top`, { limit }, 3600),
  artistAlbums: (id, limit = 25) => dz.call(`/artist/${id}/albums`, { limit }, 3600),
  artistRelated: (id, limit = 12) => dz.call(`/artist/${id}/related`, { limit }, 86400),
  chartTracks: (limit = 30) => dz.call('/chart/0/tracks', { limit }, 3600),
  chartAlbums: (limit = 30) => dz.call('/chart/0/albums', { limit }, 3600),
  chartArtists: (limit = 30) => dz.call('/chart/0/artists', { limit }, 3600),
  editorialReleases: (limit = 30) => dz.call('/editorial/0/releases', { limit }, 3600),
  editorialSelection: (limit = 30) => dz.call('/editorial/0/selection', { limit }, 3600),
  genres: () => dz.call('/genre', {}, 86400),
  genreArtists: (id, limit = 25) => dz.call(`/genre/${id}/artists`, { limit }, 86400)
};

const DEFAULT_COVER = '/img/cover-fallback.svg';

function pickCover(obj = {}, prefix = 'cover') {
  return (
    obj[`${prefix}_xl`] ||
    obj[`${prefix}_big`] ||
    obj[`${prefix}_medium`] ||
    obj[prefix] ||
    obj.picture_xl ||
    obj.picture_big ||
    obj.picture_medium ||
    obj.picture ||
    DEFAULT_COVER
  );
}

function normTrack(raw = {}) {
  if (!raw || !raw.id) return null;
  const album = raw.album || {};
  const artist = raw.artist || {};
  return {
    type: 'track',
    id: String(raw.id),
    title: raw.title_short || raw.title || 'Без названия',
    fullTitle: raw.title || raw.title_short || '',
    artist: artist.name || raw.artist_name || 'Неизвестный артист',
    artistId: artist.id ? String(artist.id) : null,
    artistPicture: artist.picture_medium || artist.picture || null,
    album: album.title || null,
    albumId: album.id ? String(album.id) : null,
    cover: pickCover(album, 'cover'),
    coverSmall: album.cover_medium || album.cover || pickCover(album, 'cover'),
    preview: raw.preview || null,
    duration: toInt(raw.duration, 0),
    link: raw.link || (raw.id ? `https://www.deezer.com/track/${raw.id}` : null),
    rank: toInt(raw.rank, 0),
    explicit: Boolean(raw.explicit_lyrics),
    releaseDate: raw.release_date || album.release_date || null,
    position: raw.track_position || null,
    diskNumber: raw.disk_number || null,
    bpm: raw.bpm || null
  };
}

function normAlbum(raw = {}) {
  if (!raw || !raw.id) return null;
  const artist = raw.artist || {};
  return {
    type: 'album',
    id: String(raw.id),
    title: raw.title || 'Без названия',
    artist: artist.name || 'Неизвестный артист',
    artistId: artist.id ? String(artist.id) : null,
    cover: pickCover(raw, 'cover'),
    coverSmall: raw.cover_medium || raw.cover || pickCover(raw, 'cover'),
    link: raw.link || `https://www.deezer.com/album/${raw.id}`,
    releaseDate: raw.release_date || null,
    trackCount: toInt(raw.nb_tracks, 0),
    duration: toInt(raw.duration, 0),
    fans: toInt(raw.fans, 0),
    genre: raw.genres && raw.genres.data && raw.genres.data.length ? raw.genres.data[0].name : raw.genre_name || null,
    genres: raw.genres && raw.genres.data ? raw.genres.data.map((g) => g.name) : [],
    recordType: raw.record_type || null,
    explicit: Boolean(raw.explicit_lyrics),
    label: raw.label || null
  };
}

function normArtist(raw = {}) {
  if (!raw || !raw.id) return null;
  return {
    type: 'artist',
    id: String(raw.id),
    name: raw.name || 'Неизвестный артист',
    picture: pickCover(raw, 'picture'),
    link: raw.link || `https://www.deezer.com/artist/${raw.id}`,
    fans: toInt(raw.nb_fan, 0),
    albumCount: toInt(raw.nb_album, 0)
  };
}

function normList(list, normalizer) {
  if (!list) return [];
  const arr = Array.isArray(list) ? list : list.data || [];
  return arr.map(normalizer).filter(Boolean);
}

/** Жанр трека (через альбом), с кэшем. */
async function trackGenre(albumId) {
  if (!albumId) return null;
  try {
    const album = await dz.album(albumId);
    const normalized = normAlbum(album);
    return normalized ? normalized.genre : null;
  } catch {
    return null;
  }
}

/* =============================================================================
 * 7. SPOTIFY — OAuth, плейлисты, сопоставление с Deezer
 *    Музыка Spotify не скачивается и не стримится: используются только
 *    метаданные, а превью берётся из Deezer.
 * ========================================================================== */

const SPOTIFY_SCOPES = [
  'user-read-email',
  'user-read-private',
  'playlist-read-private',
  'playlist-read-collaborative',
  'playlist-modify-private',
  'playlist-modify-public',
  'user-top-read',
  'user-library-read'
].join(' ');

const spotify = {
  authUrl(userId) {
    const state = crypto.randomBytes(16).toString('hex');
    db.prepare('INSERT OR REPLACE INTO oauth_states (state, user_id, created_at) VALUES (?,?,?)')
      .run(state, userId, now());
    const params = new URLSearchParams({
      client_id: CFG.spotifyClientId,
      response_type: 'code',
      redirect_uri: CFG.spotifyRedirectUri,
      scope: SPOTIFY_SCOPES,
      state,
      show_dialog: 'false'
    });
    return `https://accounts.spotify.com/authorize?${params.toString()}`;
  },

  basicAuth() {
    return 'Basic ' + Buffer.from(`${CFG.spotifyClientId}:${CFG.spotifyClientSecret}`).toString('base64');
  },

  async exchangeCode(code) {
    return fetchJson('https://accounts.spotify.com/api/token', {
      method: 'POST',
      headers: {
        Authorization: spotify.basicAuth(),
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        code,
        redirect_uri: CFG.spotifyRedirectUri
      }).toString()
    });
  },

  async refresh(userId) {
    const account = db.prepare('SELECT * FROM spotify_accounts WHERE user_id = ?').get(userId);
    if (!account || !account.refresh_token) throw new Error('spotify_not_connected');

    const data = await fetchJson('https://accounts.spotify.com/api/token', {
      method: 'POST',
      headers: {
        Authorization: spotify.basicAuth(),
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body: new URLSearchParams({
        grant_type: 'refresh_token',
        refresh_token: account.refresh_token
      }).toString()
    });

    db.prepare('UPDATE spotify_accounts SET access_token = ?, expires_at = ?, refresh_token = COALESCE(?, refresh_token) WHERE user_id = ?')
      .run(data.access_token, now() + toInt(data.expires_in, 3600) - 60, data.refresh_token || null, userId);

    return data.access_token;
  },

  async token(userId) {
    const account = db.prepare('SELECT * FROM spotify_accounts WHERE user_id = ?').get(userId);
    if (!account) throw new Error('spotify_not_connected');
    if (account.expires_at > now() + 30) return account.access_token;
    return spotify.refresh(userId);
  },

  async api(userId, endpoint, options = {}) {
    const token = await spotify.token(userId);
    const url = endpoint.startsWith('http') ? endpoint : `https://api.spotify.com/v1${endpoint}`;
    try {
      return await fetchJson(url, {
        ...options,
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', ...(options.headers || {}) }
      });
    } catch (err) {
      if (err.status === 401) {
        const fresh = await spotify.refresh(userId);
        return fetchJson(url, {
          ...options,
          headers: { Authorization: `Bearer ${fresh}`, 'Content-Type': 'application/json', ...(options.headers || {}) }
        });
      }
      throw err;
    }
  },

  async saveAccount(userId, tokenData) {
    const accessToken = tokenData.access_token;
    const profile = await fetchJson('https://api.spotify.com/v1/me', {
      headers: { Authorization: `Bearer ${accessToken}` }
    });
    db.prepare(`
      INSERT INTO spotify_accounts
        (user_id, spotify_id, display_name, email, product, country, avatar, access_token, refresh_token, scope, expires_at, connected_at)
      VALUES (@user_id, @spotify_id, @display_name, @email, @product, @country, @avatar, @access_token, @refresh_token, @scope, @expires_at, @connected_at)
      ON CONFLICT(user_id) DO UPDATE SET
        spotify_id    = excluded.spotify_id,
        display_name  = excluded.display_name,
        email         = excluded.email,
        product       = excluded.product,
        country       = excluded.country,
        avatar        = excluded.avatar,
        access_token  = excluded.access_token,
        refresh_token = COALESCE(excluded.refresh_token, spotify_accounts.refresh_token),
        scope         = excluded.scope,
        expires_at    = excluded.expires_at
    `).run({
      user_id: userId,
      spotify_id: profile.id || null,
      display_name: profile.display_name || profile.id || null,
      email: profile.email || null,
      product: profile.product || null,
      country: profile.country || null,
      avatar: profile.images && profile.images.length ? profile.images[0].url : null,
      access_token: accessToken,
      refresh_token: tokenData.refresh_token || null,
      scope: tokenData.scope || SPOTIFY_SCOPES,
      expires_at: now() + toInt(tokenData.expires_in, 3600) - 60,
      connected_at: now()
    });
    return profile;
  },

  status(userId) {
    if (!CFG.spotifyEnabled) return { enabled: false, connected: false };
    const account = db.prepare('SELECT spotify_id, display_name, avatar, product, country, connected_at FROM spotify_accounts WHERE user_id = ?').get(userId);
    return {
      enabled: true,
      connected: Boolean(account),
      account: account || null
    };
  },

  disconnect(userId) {
    db.prepare('DELETE FROM spotify_accounts WHERE user_id = ?').run(userId);
  },

  normPlaylist(raw = {}) {
    return {
      id: raw.id,
      name: raw.name || 'Плейлист',
      description: (raw.description || '').replace(/<[^>]*>/g, ''),
      cover: raw.images && raw.images.length ? raw.images[0].url : null,
      trackCount: raw.tracks ? toInt(raw.tracks.total, 0) : 0,
      owner: raw.owner ? raw.owner.display_name || raw.owner.id : null,
      public: Boolean(raw.public),
      url: raw.external_urls ? raw.external_urls.spotify : null
    };
  },

  normTrack(raw = {}) {
    if (!raw || !raw.id) return null;
    const artists = (raw.artists || []).map((a) => a.name).filter(Boolean);
    const album = raw.album || {};
    return {
      spotifyId: raw.id,
      title: raw.name || 'Без названия',
      artist: artists.join(', ') || 'Неизвестный артист',
      artistPrimary: artists[0] || '',
      album: album.name || null,
      cover: album.images && album.images.length ? album.images[0].url : null,
      duration: Math.round(toInt(raw.duration_ms, 0) / 1000),
      explicit: Boolean(raw.explicit),
      url: raw.external_urls ? raw.external_urls.spotify : null,
      isrc: raw.external_ids ? raw.external_ids.isrc : null
    };
  }
};

/** Сопоставить трек Spotify с треком Deezer (для превью и оценки). */
async function matchSpotifyToDeezer(spotifyTrack) {
  if (!spotifyTrack) return null;

  const cached = db.prepare('SELECT deezer_id, payload FROM spotify_map WHERE spotify_id = ?').get(spotifyTrack.spotifyId);
  if (cached && cached.payload) {
    try {
      return JSON.parse(cached.payload);
    } catch {
      /* ignore broken cache row */
    }
  }

  const attempts = [];
  if (spotifyTrack.isrc) attempts.push(`isrc:"${spotifyTrack.isrc}"`);
  attempts.push(`artist:"${spotifyTrack.artistPrimary}" track:"${spotifyTrack.title}"`);
  attempts.push(`${spotifyTrack.artistPrimary} ${spotifyTrack.title}`);

  for (const query of attempts) {
    try {
      const res = await dz.search(query, 'track', 5);
      const found = normList(res, normTrack);
      if (found.length) {
        const best = pickBestMatch(found, spotifyTrack);
        db.prepare('INSERT OR REPLACE INTO spotify_map (spotify_id, deezer_id, payload, updated_at) VALUES (?,?,?,?)')
          .run(spotifyTrack.spotifyId, best.id, JSON.stringify(best), now());
        return best;
      }
    } catch (err) {
      log.debug('spotify->deezer match failed', err.message);
    }
  }

  db.prepare('INSERT OR REPLACE INTO spotify_map (spotify_id, deezer_id, payload, updated_at) VALUES (?,?,?,?)')
    .run(spotifyTrack.spotifyId, null, null, now());
  return null;
}

function normalizeForCompare(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/\(.*?\)|\[.*?\]/g, '')
    .replace(/[^a-zа-я0-9\s]/gi, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function pickBestMatch(candidates, source) {
  const title = normalizeForCompare(source.title);
  const artist = normalizeForCompare(source.artistPrimary);
  let best = candidates[0];
  let bestScore = -Infinity;

  for (const candidate of candidates) {
    let score = 0;
    const cTitle = normalizeForCompare(candidate.title);
    const cArtist = normalizeForCompare(candidate.artist);
    if (cTitle === title) score += 6;
    else if (cTitle.includes(title) || title.includes(cTitle)) score += 3;
    if (cArtist === artist) score += 5;
    else if (cArtist.includes(artist) || artist.includes(cArtist)) score += 2;
    if (candidate.preview) score += 2;
    if (source.duration && candidate.duration) {
      const diff = Math.abs(source.duration - candidate.duration);
      if (diff <= 2) score += 3;
      else if (diff <= 6) score += 1;
      else if (diff > 25) score -= 2;
    }
    if (score > bestScore) {
      bestScore = score;
      best = candidate;
    }
  }
  return best;
}

/* =============================================================================
 * 8. ДОМЕННЫЙ СЛОЙ: ОЦЕНКИ, ПРОФИЛЬ, СТАТИСТИКА, РЕКОМЕНДАЦИИ
 * ========================================================================== */

function ratingRow(row) {
  if (!row) return null;
  const isAlbum = row.item_type === 'album';
  const values = isAlbum
    ? {
        cohesion: row.cohesion,
        concept: row.concept,
        diversity: row.diversity,
        memorability: row.memorability,
        vibe: row.vibe
      }
    : {
        lyrics: row.lyrics,
        structure: row.structure,
        style: row.style,
        individuality: row.individuality,
        vibe: row.vibe
      };

  const criteria = isAlbum ? ALBUM_CRITERIA : TRACK_CRITERIA;
  return {
    id: row.id,
    userId: row.user_id,
    type: row.item_type,
    itemId: row.item_id,
    title: row.title,
    artist: row.artist,
    artistId: row.artist_id,
    album: row.album_title,
    albumId: row.album_id,
    cover: row.cover || DEFAULT_COVER,
    preview: row.preview,
    link: row.link,
    genre: row.genre,
    releaseDate: row.release_date,
    duration: row.duration,
    values,
    breakdown: criteria.map((c) => ({
      key: c.key,
      title: c.title,
      short: c.short,
      icon: c.icon,
      value: values[c.key] || 0,
      max: SCORE.CRIT_MAX,
      points: round2((values[c.key] || 0) * SCORE.POINTS_PER_UNIT),
      maxPoints: round2(SCORE.CRIT_MAX * SCORE.POINTS_PER_UNIT)
    })),
    base: round1(row.base_score),
    coefficient: row.coefficient,
    final: round1(row.final_score),
    max: SCORE.MAX,
    percent: Math.round((row.final_score / SCORE.MAX) * 100),
    tier: tierFor(row.final_score),
    review: row.review || '',
    source: row.source,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

const getRatingRow = (userId, type, itemId) =>
  db.prepare('SELECT * FROM ratings WHERE user_id = ? AND item_type = ? AND item_id = ?')
    .get(userId, type, String(itemId));

const getRating = (userId, type, itemId) => ratingRow(getRatingRow(userId, type, itemId));

/** Средняя оценка треков альбома у конкретного пользователя. */
function albumTrackContext(userId, albumId, totalTracks) {
  const row = db.prepare(`
    SELECT COUNT(*) AS rated, AVG(final_score) AS avg_final
    FROM ratings
    WHERE user_id = ? AND item_type = 'track' AND album_id = ?
  `).get(userId, String(albumId));

  return {
    rated: toInt(row && row.rated, 0),
    total: toInt(totalTracks, 0),
    avgFinal: Number((row && row.avg_final) || 0)
  };
}

const stmtSaveRating = db.prepare(`
  INSERT INTO ratings (
    user_id, item_type, item_id, title, artist, artist_id, album_title, album_id,
    cover, preview, link, genre, release_date, duration,
    lyrics, structure, style, individuality,
    cohesion, concept, diversity, memorability,
    vibe, base_score, coefficient, final_score, review, source, created_at, updated_at
  ) VALUES (
    @user_id, @item_type, @item_id, @title, @artist, @artist_id, @album_title, @album_id,
    @cover, @preview, @link, @genre, @release_date, @duration,
    @lyrics, @structure, @style, @individuality,
    @cohesion, @concept, @diversity, @memorability,
    @vibe, @base_score, @coefficient, @final_score, @review, @source, @created_at, @updated_at
  )
  ON CONFLICT(user_id, item_type, item_id) DO UPDATE SET
    title=excluded.title, artist=excluded.artist, artist_id=excluded.artist_id,
    album_title=excluded.album_title, album_id=excluded.album_id,
    cover=excluded.cover, preview=excluded.preview, link=excluded.link,
    genre=COALESCE(excluded.genre, ratings.genre), release_date=excluded.release_date, duration=excluded.duration,
    lyrics=excluded.lyrics, structure=excluded.structure, style=excluded.style, individuality=excluded.individuality,
    cohesion=excluded.cohesion, concept=excluded.concept, diversity=excluded.diversity, memorability=excluded.memorability,
    vibe=excluded.vibe, base_score=excluded.base_score, coefficient=excluded.coefficient,
    final_score=excluded.final_score, review=excluded.review, source=excluded.source,
    updated_at=excluded.updated_at
`);

/**
 * Сохранить оценку. Метаданные подтягиваются из Deezer, чтобы в БД
 * всегда лежали корректные обложка / артист / жанр.
 */
async function saveRating(userId, payload = {}) {
  const type = payload.type === 'album' ? 'album' : 'track';
  const itemId = String(payload.itemId || payload.id || '').trim();
  if (!itemId) throw Object.assign(new Error('item_id_required'), { status: 400 });

  let meta = payload.item && payload.item.id ? payload.item : null;
  let albumTracksTotal = 0;

  try {
    if (type === 'track') {
      const raw = await dz.track(itemId);
      const normalized = normTrack(raw);
      if (normalized) meta = { ...meta, ...normalized };
    } else {
      const raw = await dz.album(itemId);
      const normalized = normAlbum(raw);
      if (normalized) meta = { ...meta, ...normalized };
      albumTracksTotal = normalized ? normalized.trackCount : 0;
    }
  } catch (err) {
    log.debug('deezer meta fetch failed', err.message);
  }

  if (!meta) throw Object.assign(new Error('item_not_found'), { status: 404 });

  let genre = meta.genre || null;
  if (type === 'track' && !genre && meta.albumId) genre = await trackGenre(meta.albumId);

  let scored;
  if (type === 'album') {
    const ctx = albumTrackContext(userId, itemId, albumTracksTotal || meta.trackCount || 0);
    scored = computeAlbumScore(payload.values || payload.scores || {}, ctx);
  } else {
    scored = computeTrackScore(payload.values || payload.scores || {});
  }

  const existing = getRatingRow(userId, type, itemId);
  const ts = now();

  stmtSaveRating.run({
    user_id: userId,
    item_type: type,
    item_id: itemId,
    title: meta.title || 'Без названия',
    artist: meta.artist || null,
    artist_id: meta.artistId || null,
    album_title: type === 'album' ? meta.title : meta.album || null,
    album_id: type === 'album' ? itemId : meta.albumId || null,
    cover: meta.cover || null,
    preview: meta.preview || null,
    link: meta.link || null,
    genre,
    release_date: meta.releaseDate || null,
    duration: toInt(meta.duration, 0),
    lyrics: type === 'track' ? scored.values.lyrics : null,
    structure: type === 'track' ? scored.values.structure : null,
    style: type === 'track' ? scored.values.style : null,
    individuality: type === 'track' ? scored.values.individuality : null,
    cohesion: type === 'album' ? scored.values.cohesion : null,
    concept: type === 'album' ? scored.values.concept : null,
    diversity: type === 'album' ? scored.values.diversity : null,
    memorability: type === 'album' ? scored.values.memorability : null,
    vibe: scored.values.vibe,
    base_score: scored.base,
    coefficient: scored.coefficient,
    final_score: scored.final,
    review: String(payload.review || '').slice(0, 600),
    source: payload.source || 'app',
    created_at: existing ? existing.created_at : ts,
    updated_at: ts
  });

  logEvent(userId, existing ? 'rating_updated' : 'rating_created', {
    type,
    itemId,
    final: scored.final,
    title: meta.title
  });

  return {
    rating: getRating(userId, type, itemId),
    score: scored,
    isNew: !existing,
    item: meta
  };
}

function deleteRating(userId, type, itemId) {
  const res = db.prepare('DELETE FROM ratings WHERE user_id = ? AND item_type = ? AND item_id = ?')
    .run(userId, type, String(itemId));
  return res.changes > 0;
}

function listRatings(userId, { type, sort = 'recent', limit = 30, offset = 0, search = '' } = {}) {
  const where = ['user_id = ?'];
  const params = [userId];
  if (type === 'track' || type === 'album') {
    where.push('item_type = ?');
    params.push(type);
  }
  if (search) {
    where.push('(LOWER(title) LIKE ? OR LOWER(artist) LIKE ?)');
    const like = `%${search.toLowerCase()}%`;
    params.push(like, like);
  }
  const order =
    sort === 'best' ? 'final_score DESC, updated_at DESC'
    : sort === 'worst' ? 'final_score ASC, updated_at DESC'
    : sort === 'title' ? 'LOWER(title) ASC'
    : 'updated_at DESC';

  const rows = db.prepare(`SELECT * FROM ratings WHERE ${where.join(' AND ')} ORDER BY ${order} LIMIT ? OFFSET ?`)
    .all(...params, Math.min(100, toInt(limit, 30)), toInt(offset, 0));
  const total = db.prepare(`SELECT COUNT(*) AS c FROM ratings WHERE ${where.join(' AND ')}`).get(...params).c;

  return { items: rows.map(ratingRow), total };
}

/** Полная статистика музыкального профиля. */
function userStats(userId) {
  const totals = db.prepare(`
    SELECT
      COUNT(*)                                        AS total,
      SUM(CASE WHEN item_type='track' THEN 1 ELSE 0 END) AS tracks,
      SUM(CASE WHEN item_type='album' THEN 1 ELSE 0 END) AS albums,
      AVG(final_score)                                AS avg_final,
      MAX(final_score)                                AS max_final,
      MIN(final_score)                                AS min_final,
      AVG(vibe)                                       AS avg_vibe,
      SUM(LENGTH(COALESCE(review,'')) > 0)            AS reviews
    FROM ratings WHERE user_id = ?
  `).get(userId) || {};

  const criteriaAvg = db.prepare(`
    SELECT
      AVG(lyrics) AS lyrics, AVG(structure) AS structure, AVG(style) AS style,
      AVG(individuality) AS individuality, AVG(vibe) AS vibe
    FROM ratings WHERE user_id = ? AND item_type = 'track'
  `).get(userId) || {};

  const albumCriteriaAvg = db.prepare(`
    SELECT AVG(cohesion) AS cohesion, AVG(concept) AS concept,
           AVG(diversity) AS diversity, AVG(memorability) AS memorability
    FROM ratings WHERE user_id = ? AND item_type = 'album'
  `).get(userId) || {};

  const distribution = TIERS.slice().reverse().map((tier, index, arr) => {
    const nextTier = arr[index + 1];
    const upper = nextTier ? nextTier.min : SCORE.MAX + 0.01;
    const row = db.prepare('SELECT COUNT(*) AS c FROM ratings WHERE user_id = ? AND final_score >= ? AND final_score < ?')
      .get(userId, tier.min, upper);
    return { key: tier.key, label: tier.label, from: tier.min, to: Math.round(upper), count: row.c, color: tier.color };
  });

  const buckets = [];
  for (let start = 0; start < SCORE.MAX; start += 10) {
    const end = start + 10;
    const row = db.prepare('SELECT COUNT(*) AS c FROM ratings WHERE user_id = ? AND final_score >= ? AND final_score < ?')
      .get(userId, start, end === SCORE.MAX ? SCORE.MAX + 0.01 : end);
    buckets.push({ label: `${start}–${end}`, from: start, to: end, count: row.c });
  }

  const topArtists = db.prepare(`
    SELECT artist, artist_id, COUNT(*) AS count, AVG(final_score) AS avg_final, MAX(cover) AS cover
    FROM ratings WHERE user_id = ? AND artist IS NOT NULL
    GROUP BY LOWER(artist) ORDER BY count DESC, avg_final DESC LIMIT 8
  `).all(userId).map((r) => ({
    artist: r.artist,
    artistId: r.artist_id,
    count: r.count,
    avg: round1(r.avg_final),
    cover: r.cover
  }));

  const topGenres = db.prepare(`
    SELECT genre, COUNT(*) AS count, AVG(final_score) AS avg_final
    FROM ratings WHERE user_id = ? AND genre IS NOT NULL AND genre != ''
    GROUP BY LOWER(genre) ORDER BY count DESC LIMIT 8
  `).all(userId).map((r) => ({ genre: r.genre, count: r.count, avg: round1(r.avg_final) }));

  const best = db.prepare('SELECT * FROM ratings WHERE user_id = ? ORDER BY final_score DESC LIMIT 5').all(userId).map(ratingRow);
  const recent = db.prepare('SELECT * FROM ratings WHERE user_id = ? ORDER BY updated_at DESC LIMIT 5').all(userId).map(ratingRow);

  const streak = db.prepare(`
    SELECT COUNT(DISTINCT DATE(updated_at, 'unixepoch')) AS days
    FROM ratings WHERE user_id = ? AND updated_at > ?
  `).get(userId, now() - 30 * 86400).days;

  const favorites = db.prepare('SELECT COUNT(*) AS c FROM favorites WHERE user_id = ?').get(userId).c;
  const collections = db.prepare('SELECT COUNT(*) AS c FROM collections WHERE user_id = ?').get(userId).c;

  const totalCount = toInt(totals.total, 0);

  return {
    totals: {
      total: totalCount,
      tracks: toInt(totals.tracks, 0),
      albums: toInt(totals.albums, 0),
      reviews: toInt(totals.reviews, 0),
      favorites,
      collections,
      activeDays30: toInt(streak, 0)
    },
    scores: {
      avg: round1(totals.avg_final || 0),
      max: round1(totals.max_final || 0),
      min: totalCount ? round1(totals.min_final || 0) : 0,
      avgVibe: round1(totals.avg_vibe || 0),
      avgTier: tierFor(totals.avg_final || 0)
    },
    criteria: {
      track: TRACK_CRITERIA.map((c) => ({
        key: c.key, title: c.title, short: c.short, icon: c.icon,
        avg: round1(criteriaAvg[c.key] || 0), max: SCORE.CRIT_MAX
      })),
      album: ALBUM_CRITERIA.map((c) => ({
        key: c.key, title: c.title, short: c.short, icon: c.icon,
        avg: round1(albumCriteriaAvg[c.key] || 0), max: SCORE.CRIT_MAX
      })),
      vibe: { key: 'vibe', title: VIBE_CRITERION.title, short: VIBE_CRITERION.short, icon: 'vibe', avg: round1(criteriaAvg.vibe || 0), max: SCORE.CRIT_MAX }
    },
    distribution,
    buckets,
    topArtists,
    topGenres,
    best,
    recent,
    taste: tasteProfile(userId, criteriaAvg, topGenres, totals)
  };
}

/** Короткая текстовая характеристика вкуса — используется в профиле и в боте. */
function tasteProfile(userId, criteriaAvg, topGenres, totals) {
  const entries = TRACK_CRITERIA
    .map((c) => ({ key: c.key, short: c.short, title: c.title, value: Number(criteriaAvg[c.key] || 0) }))
    .sort((a, b) => b.value - a.value);

  const strongest = entries[0] || null;
  const weakest = entries[entries.length - 1] || null;
  const avg = Number(totals.avg_final || 0);

  let archetype = 'Исследователь';
  if (!toInt(totals.total, 0)) archetype = 'Новичок';
  else if (avg >= 70) archetype = 'Влюблённый в музыку';
  else if (avg <= 35) archetype = 'Строгий критик';
  else if (strongest && strongest.key === 'lyrics') archetype = 'Слушатель текстов';
  else if (strongest && strongest.key === 'structure') archetype = 'Технарь звука';
  else if (strongest && strongest.key === 'style') archetype = 'Жанровый пурист';
  else if (strongest && strongest.key === 'individuality') archetype = 'Охотник за харизмой';

  return {
    archetype,
    strongest: strongest ? { key: strongest.key, title: strongest.title, short: strongest.short, avg: round1(strongest.value) } : null,
    weakest: weakest ? { key: weakest.key, title: weakest.title, short: weakest.short, avg: round1(weakest.value) } : null,
    favoriteGenre: topGenres && topGenres.length ? topGenres[0].genre : null,
    generosity: avg >= 63 ? 'щедрый' : avg >= 45 ? 'сбалансированный' : 'требовательный'
  };
}

/* --- сообщество: агрегаты по одному объекту -------------------------------- */

function communityStats(type, itemId) {
  const row = db.prepare(`
    SELECT COUNT(*) AS count, AVG(final_score) AS avg_final, AVG(base_score) AS avg_base, AVG(vibe) AS avg_vibe
    FROM ratings WHERE item_type = ? AND item_id = ?
  `).get(type, String(itemId));

  const criteria = type === 'album' ? ALBUM_CRITERIA : TRACK_CRITERIA;
  const avgSql = criteria.map((c) => `AVG(${c.key}) AS ${c.key}`).join(', ');
  const avgRow = db.prepare(`SELECT ${avgSql} FROM ratings WHERE item_type = ? AND item_id = ?`).get(type, String(itemId)) || {};

  const reviews = db.prepare(`
    SELECT r.review, r.final_score, r.updated_at, u.id AS user_id, u.first_name, u.last_name, u.username, u.photo_url
    FROM ratings r JOIN users u ON u.id = r.user_id
    WHERE r.item_type = ? AND r.item_id = ? AND LENGTH(COALESCE(r.review,'')) > 0
    ORDER BY r.updated_at DESC LIMIT 12
  `).all(type, String(itemId)).map((r) => ({
    text: r.review,
    score: round1(r.final_score),
    tier: tierFor(r.final_score),
    at: r.updated_at,
    user: {
      id: r.user_id,
      name: displayName(r),
      username: r.username,
      photo: r.photo_url
    }
  }));

  return {
    count: toInt(row && row.count, 0),
    avg: round1((row && row.avg_final) || 0),
    avgBase: round1((row && row.avg_base) || 0),
    avgVibe: round1((row && row.avg_vibe) || 0),
    tier: tierFor((row && row.avg_final) || 0),
    criteria: criteria.map((c) => ({
      key: c.key, title: c.title, short: c.short, icon: c.icon,
      avg: round1(avgRow[c.key] || 0), max: SCORE.CRIT_MAX
    })),
    reviews
  };
}

/* --- рейтинги (лидерборды) ------------------------------------------------- */

function leaderboard({ type = 'track', limit = 30, minVotes = 1, period = 'all' } = {}) {
  const params = [type];
  let periodSql = '';
  if (period === 'month') {
    periodSql = 'AND updated_at > ?';
    params.push(now() - 30 * 86400);
  } else if (period === 'week') {
    periodSql = 'AND updated_at > ?';
    params.push(now() - 7 * 86400);
  }

  const rows = db.prepare(`
    SELECT item_id, item_type,
           MAX(title) AS title, MAX(artist) AS artist, MAX(artist_id) AS artist_id,
           MAX(cover) AS cover, MAX(preview) AS preview, MAX(link) AS link, MAX(genre) AS genre,
           COUNT(*) AS votes, AVG(final_score) AS avg_final, MAX(final_score) AS best_final
    FROM ratings
    WHERE item_type = ? ${periodSql}
    GROUP BY item_type, item_id
    HAVING votes >= ${Math.max(1, toInt(minVotes, 1))}
    ORDER BY avg_final DESC, votes DESC
    LIMIT ?
  `).all(...params, Math.min(100, toInt(limit, 30)));

  return rows.map((r, index) => ({
    rank: index + 1,
    type: r.item_type,
    id: r.item_id,
    title: r.title,
    artist: r.artist,
    artistId: r.artist_id,
    cover: r.cover || DEFAULT_COVER,
    preview: r.preview,
    link: r.link,
    genre: r.genre,
    votes: r.votes,
    avg: round1(r.avg_final),
    best: round1(r.best_final),
    tier: tierFor(r.avg_final)
  }));
}

function userLeaderboard(limit = 20) {
  return db.prepare(`
    SELECT u.id, u.first_name, u.last_name, u.username, u.photo_url,
           COUNT(r.id) AS ratings, AVG(r.final_score) AS avg_final
    FROM users u JOIN ratings r ON r.user_id = u.id
    GROUP BY u.id
    ORDER BY ratings DESC, avg_final DESC
    LIMIT ?
  `).all(Math.min(100, toInt(limit, 20))).map((r, index) => ({
    rank: index + 1,
    id: r.id,
    name: displayName(r),
    username: r.username,
    photo: r.photo_url,
    ratings: r.ratings,
    avg: round1(r.avg_final)
  }));
}

/* --- сравнение вкусов ------------------------------------------------------ */

function compareUsers(userA, userB) {
  const a = getUser(userA);
  const b = getUser(userB);
  if (!a || !b) throw Object.assign(new Error('user_not_found'), { status: 404 });

  const shared = db.prepare(`
    SELECT ra.item_type, ra.item_id, ra.title, ra.artist, ra.cover, ra.preview,
           ra.final_score AS a_score, rb.final_score AS b_score
    FROM ratings ra
    JOIN ratings rb ON rb.item_type = ra.item_type AND rb.item_id = ra.item_id AND rb.user_id = ?
    WHERE ra.user_id = ?
    ORDER BY ABS(ra.final_score - rb.final_score) ASC
  `).all(userB, userA);

  const statsA = userStats(userA);
  const statsB = userStats(userB);

  let match = 0;
  if (shared.length) {
    const diffs = shared.map((s) => Math.abs(s.a_score - s.b_score));
    const avgDiff = diffs.reduce((x, y) => x + y, 0) / diffs.length;
    match = Math.max(0, Math.round(100 - (avgDiff / SCORE.MAX) * 160));
  } else {
    const genresA = new Set(statsA.topGenres.map((g) => (g.genre || '').toLowerCase()));
    const genresB = new Set(statsB.topGenres.map((g) => (g.genre || '').toLowerCase()));
    const inter = [...genresA].filter((g) => genresB.has(g)).length;
    const union = new Set([...genresA, ...genresB]).size || 1;
    match = Math.round((inter / union) * 60);
  }

  const criteriaDelta = TRACK_CRITERIA.map((c) => {
    const av = statsA.criteria.track.find((x) => x.key === c.key);
    const bv = statsB.criteria.track.find((x) => x.key === c.key);
    return {
      key: c.key, title: c.title, short: c.short, icon: c.icon,
      a: av ? av.avg : 0, b: bv ? bv.avg : 0,
      delta: round1((av ? av.avg : 0) - (bv ? bv.avg : 0))
    };
  });

  const shape = (row) => ({
    type: row.item_type,
    id: row.item_id,
    title: row.title,
    artist: row.artist,
    cover: row.cover || DEFAULT_COVER,
    preview: row.preview,
    a: round1(row.a_score),
    b: round1(row.b_score),
    delta: round1(Math.abs(row.a_score - row.b_score))
  });

  const genresA = new Map(statsA.topGenres.map((g) => [(g.genre || '').toLowerCase(), g]));
  const commonGenres = statsB.topGenres
    .filter((g) => genresA.has((g.genre || '').toLowerCase()))
    .map((g) => g.genre);

  return {
    users: [
      { id: a.id, name: displayName(a), username: a.username, photo: a.photo_url, stats: { total: statsA.totals.total, avg: statsA.scores.avg, archetype: statsA.taste.archetype } },
      { id: b.id, name: displayName(b), username: b.username, photo: b.photo_url, stats: { total: statsB.totals.total, avg: statsB.scores.avg, archetype: statsB.taste.archetype } }
    ],
    match,
    sharedCount: shared.length,
    agree: shared.slice(0, 6).map(shape),
    disagree: shared.slice(-6).reverse().map(shape),
    criteriaDelta,
    commonGenres,
    verdict:
      match >= 80 ? 'Музыкальные близнецы'
      : match >= 60 ? 'Много общего'
      : match >= 40 ? 'Есть точки пересечения'
      : match >= 20 ? 'Разные вселенные'
      : 'Полная противоположность'
  };
}

function searchUsers(query, excludeId) {
  const like = `%${String(query || '').toLowerCase()}%`;
  return db.prepare(`
    SELECT u.id, u.first_name, u.last_name, u.username, u.photo_url,
           (SELECT COUNT(*) FROM ratings r WHERE r.user_id = u.id) AS ratings
    FROM users u
    WHERE u.id != ? AND u.is_public = 1
      AND (LOWER(COALESCE(u.username,'')) LIKE ? OR LOWER(COALESCE(u.first_name,'')) LIKE ?
           OR LOWER(COALESCE(u.last_name,'')) LIKE ? OR CAST(u.id AS TEXT) = ?)
    ORDER BY ratings DESC LIMIT 20
  `).all(excludeId, like, like, like, String(query || '')).map((u) => ({
    id: u.id,
    name: displayName(u),
    username: u.username,
    photo: u.photo_url,
    ratings: u.ratings
  }));
}

/* --- избранное ------------------------------------------------------------- */

function listFavorites(userId, type) {
  const rows = type
    ? db.prepare('SELECT * FROM favorites WHERE user_id = ? AND item_type = ? ORDER BY created_at DESC').all(userId, type)
    : db.prepare('SELECT * FROM favorites WHERE user_id = ? ORDER BY created_at DESC').all(userId);

  return rows.map((r) => ({
    id: r.id,
    type: r.item_type,
    itemId: r.item_id,
    title: r.title,
    artist: r.artist,
    artistId: r.artist_id,
    cover: r.cover || DEFAULT_COVER,
    preview: r.preview,
    link: r.link,
    createdAt: r.created_at,
    rating: getRating(userId, r.item_type, r.item_id)
  }));
}

function toggleFavorite(userId, payload = {}) {
  const type = payload.type === 'album' ? 'album' : 'track';
  const itemId = String(payload.itemId || payload.id || '');
  if (!itemId) throw Object.assign(new Error('item_id_required'), { status: 400 });

  const existing = db.prepare('SELECT id FROM favorites WHERE user_id = ? AND item_type = ? AND item_id = ?')
    .get(userId, type, itemId);

  if (existing) {
    db.prepare('DELETE FROM favorites WHERE id = ?').run(existing.id);
    return { favorite: false };
  }

  db.prepare(`
    INSERT INTO favorites (user_id, item_type, item_id, title, artist, artist_id, cover, preview, link, created_at)
    VALUES (?,?,?,?,?,?,?,?,?,?)
  `).run(
    userId, type, itemId,
    payload.title || 'Без названия', payload.artist || null, payload.artistId || null,
    payload.cover || null, payload.preview || null, payload.link || null, now()
  );
  logEvent(userId, 'favorite_added', { type, itemId, title: payload.title });
  return { favorite: true };
}

const isFavorite = (userId, type, itemId) =>
  Boolean(db.prepare('SELECT 1 FROM favorites WHERE user_id = ? AND item_type = ? AND item_id = ?').get(userId, type, String(itemId)));

/* --- коллекции ------------------------------------------------------------- */

function listCollections(userId) {
  return db.prepare(`
    SELECT c.*, (SELECT COUNT(*) FROM collection_items ci WHERE ci.collection_id = c.id) AS items_count,
           (SELECT ci.cover FROM collection_items ci WHERE ci.collection_id = c.id ORDER BY ci.position, ci.id LIMIT 1) AS cover
    FROM collections c WHERE c.user_id = ? ORDER BY c.updated_at DESC
  `).all(userId).map((c) => ({
    id: c.id,
    name: c.name,
    description: c.description,
    icon: c.icon || 'library',
    isPublic: Boolean(c.is_public),
    source: c.source,
    sourceId: c.source_id,
    count: c.items_count,
    cover: c.cover || DEFAULT_COVER,
    createdAt: c.created_at,
    updatedAt: c.updated_at
  }));
}

function getCollection(userId, id) {
  const collection = db.prepare('SELECT * FROM collections WHERE id = ?').get(toInt(id, 0));
  if (!collection) throw Object.assign(new Error('collection_not_found'), { status: 404 });
  if (collection.user_id !== userId && !collection.is_public) {
    throw Object.assign(new Error('forbidden'), { status: 403 });
  }

  const items = db.prepare('SELECT * FROM collection_items WHERE collection_id = ? ORDER BY position, id').all(collection.id)
    .map((i) => ({
      id: i.id,
      type: i.item_type,
      itemId: i.item_id,
      title: i.title,
      artist: i.artist,
      artistId: i.artist_id,
      cover: i.cover || DEFAULT_COVER,
      preview: i.preview,
      link: i.link,
      rating: getRating(userId, i.item_type, i.item_id)
    }));

  const rated = items.filter((i) => i.rating);
  const avg = rated.length ? rated.reduce((acc, i) => acc + i.rating.final, 0) / rated.length : 0;

  return {
    id: collection.id,
    userId: collection.user_id,
    owner: displayName(getUser(collection.user_id)),
    name: collection.name,
    description: collection.description,
    icon: collection.icon || 'library',
    isPublic: Boolean(collection.is_public),
    source: collection.source,
    sourceId: collection.source_id,
    count: items.length,
    ratedCount: rated.length,
    avg: round1(avg),
    tier: tierFor(avg),
    items
  };
}

function createCollection(userId, payload = {}) {
  const name = String(payload.name || '').trim().slice(0, 60);
  if (!name) throw Object.assign(new Error('name_required'), { status: 400 });
  const ts = now();
  const res = db.prepare(`
    INSERT INTO collections (user_id, name, description, icon, is_public, source, source_id, created_at, updated_at)
    VALUES (?,?,?,?,?,?,?,?,?)
  `).run(
    userId, name, String(payload.description || '').slice(0, 300),
    payload.icon || 'library', payload.isPublic === false ? 0 : 1,
    payload.source || 'manual', payload.sourceId || null, ts, ts
  );
  logEvent(userId, 'collection_created', { id: res.lastInsertRowid, name });
  return getCollection(userId, res.lastInsertRowid);
}

function assertCollectionOwner(userId, id) {
  const collection = db.prepare('SELECT * FROM collections WHERE id = ?').get(toInt(id, 0));
  if (!collection) throw Object.assign(new Error('collection_not_found'), { status: 404 });
  if (collection.user_id !== userId) throw Object.assign(new Error('forbidden'), { status: 403 });
  return collection;
}

function updateCollection(userId, id, payload = {}) {
  assertCollectionOwner(userId, id);
  db.prepare(`
    UPDATE collections SET
      name = COALESCE(?, name), description = COALESCE(?, description),
      icon = COALESCE(?, icon), is_public = COALESCE(?, is_public), updated_at = ?
    WHERE id = ?
  `).run(
    payload.name ? String(payload.name).slice(0, 60) : null,
    payload.description !== undefined ? String(payload.description).slice(0, 300) : null,
    payload.icon || null,
    payload.isPublic === undefined ? null : payload.isPublic ? 1 : 0,
    now(), toInt(id, 0)
  );
  return getCollection(userId, id);
}

function deleteCollection(userId, id) {
  assertCollectionOwner(userId, id);
  db.prepare('DELETE FROM collections WHERE id = ?').run(toInt(id, 0));
  return true;
}

function addCollectionItem(userId, id, payload = {}) {
  assertCollectionOwner(userId, id);
  const type = payload.type === 'album' ? 'album' : 'track';
  const itemId = String(payload.itemId || payload.id || '');
  if (!itemId) throw Object.assign(new Error('item_id_required'), { status: 400 });

  const position = db.prepare('SELECT COALESCE(MAX(position), 0) + 1 AS p FROM collection_items WHERE collection_id = ?')
    .get(toInt(id, 0)).p;

  db.prepare(`
    INSERT OR IGNORE INTO collection_items
      (collection_id, item_type, item_id, title, artist, artist_id, cover, preview, link, position, added_at)
    VALUES (?,?,?,?,?,?,?,?,?,?,?)
  `).run(
    toInt(id, 0), type, itemId, payload.title || 'Без названия', payload.artist || null,
    payload.artistId || null, payload.cover || null, payload.preview || null, payload.link || null,
    position, now()
  );
  db.prepare('UPDATE collections SET updated_at = ? WHERE id = ?').run(now(), toInt(id, 0));
  return getCollection(userId, id);
}

function removeCollectionItem(userId, id, itemRowId) {
  assertCollectionOwner(userId, id);
  db.prepare('DELETE FROM collection_items WHERE collection_id = ? AND id = ?').run(toInt(id, 0), toInt(itemRowId, 0));
  db.prepare('UPDATE collections SET updated_at = ? WHERE id = ?').run(now(), toInt(id, 0));
  return getCollection(userId, id);
}

/* --- рекомендации и discover ---------------------------------------------- */

function ratedIdSet(userId, type = 'track') {
  const rows = db.prepare('SELECT item_id FROM ratings WHERE user_id = ? AND item_type = ?').all(userId, type);
  return new Set(rows.map((r) => r.item_id));
}

/**
 * Рекомендации: берём артистов, которых пользователь оценил высоко,
 * тянем «похожих» из Deezer и их топ-треки, исключая уже оценённое.
 */
async function recommendations(userId, limit = 18) {
  const seeds = db.prepare(`
    SELECT artist_id, artist, AVG(final_score) AS avg_final, COUNT(*) AS count
    FROM ratings
    WHERE user_id = ? AND artist_id IS NOT NULL
    GROUP BY artist_id
    HAVING avg_final >= 50
    ORDER BY avg_final DESC, count DESC
    LIMIT 6
  `).all(userId);

  const rated = ratedIdSet(userId, 'track');
  const results = [];
  const seen = new Set();

  for (const seed of seeds) {
    try {
      const related = await dz.artistRelated(seed.artist_id, 6);
      const artists = normList(related, normArtist);
      for (const artist of artists.slice(0, 3)) {
        const top = await dz.artistTop(artist.id, 6);
        for (const track of normList(top, normTrack)) {
          if (rated.has(track.id) || seen.has(track.id)) continue;
          seen.add(track.id);
          results.push({
            ...track,
            reason: `Похоже на ${seed.artist}`,
            reasonArtist: seed.artist,
            seedScore: round1(seed.avg_final)
          });
        }
      }
    } catch (err) {
      log.debug('recommendation seed failed', err.message);
    }
    if (results.length >= limit * 1.5) break;
  }

  if (results.length < limit) {
    try {
      const chart = await dz.chartTracks(40);
      for (const track of normList(chart, normTrack)) {
        if (rated.has(track.id) || seen.has(track.id)) continue;
        seen.add(track.id);
        results.push({ ...track, reason: 'Сейчас в чарте', reasonArtist: null });
        if (results.length >= limit) break;
      }
    } catch (err) {
      log.debug('chart fallback failed', err.message);
    }
  }

  return shuffle(results).slice(0, limit);
}

function shuffle(array) {
  const arr = array.slice();
  for (let i = arr.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

const DISCOVER_GENRES = [132, 116, 152, 113, 165, 85, 106, 129, 464, 153];

/** Discover: подборка «новых находок», которых у пользователя ещё нет. */
async function discover(userId, limit = 12) {
  const rated = ratedIdSet(userId, 'track');
  const pool = [];
  const seen = new Set();

  const push = (tracks, reason) => {
    for (const track of tracks) {
      if (!track || rated.has(track.id) || seen.has(track.id)) continue;
      seen.add(track.id);
      pool.push({ ...track, reason });
    }
  };

  const tasks = [
    dz.editorialSelection(30).then((r) => push(normList(r, normTrack), 'Выбор редакции')).catch(() => {}),
    dz.chartTracks(40).then((r) => push(normList(r, normTrack), 'Мировой чарт')).catch(() => {})
  ];

  const genreId = DISCOVER_GENRES[Math.floor(Math.random() * DISCOVER_GENRES.length)];
  tasks.push(
    dz.genreArtists(genreId, 12)
      .then(async (res) => {
        const artists = shuffle(normList(res, normArtist)).slice(0, 3);
        for (const artist of artists) {
          try {
            const top = await dz.artistTop(artist.id, 5);
            push(normList(top, normTrack), 'Из жанровой волны');
          } catch {
            /* ignore */
          }
        }
      })
      .catch(() => {})
  );

  await Promise.all(tasks);

  const favouriteArtists = db.prepare(`
    SELECT artist_id FROM ratings WHERE user_id = ? AND artist_id IS NOT NULL
    GROUP BY artist_id ORDER BY AVG(final_score) DESC LIMIT 2
  `).all(userId);

  for (const row of favouriteArtists) {
    try {
      const related = await dz.artistRelated(row.artist_id, 4);
      const artists = normList(related, normArtist);
      for (const artist of artists.slice(0, 2)) {
        const top = await dz.artistTop(artist.id, 4);
        push(normList(top, normTrack), 'В твоём вкусе');
      }
    } catch {
      /* ignore */
    }
  }

  return shuffle(pool.filter((t) => t.preview)).slice(0, limit);
}

/** Новые релизы (альбомы). */
async function newReleases(limit = 20) {
  try {
    const res = await dz.editorialReleases(limit);
    return normList(res, normAlbum);
  } catch (err) {
    log.debug('new releases failed', err.message);
    return [];
  }
}

/* =============================================================================
 * 9. TELEGRAM BOT API — минимальный клиент
 *    Отдельный слой, чтобы не тянуть зависимости: fetch + long polling.
 * ========================================================================== */

const tg = {
  base: `https://api.telegram.org/bot${CFG.botToken}`,
  me: null,
  customEmojiBlocked: false,

  async api(method, payload = {}, { retryPlain = true } = {}) {
    if (!CFG.botEnabled) throw new Error('bot_disabled');
    try {
      return await fetchJson(`${tg.base}/${method}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      }, { timeout: 35000, retries: 0 });
    } catch (err) {
      const description = String((err.body && err.body.description) || err.message || '');
      const isCustomEmojiIssue = /custom emoji|CUSTOM_EMOJI|EMOJI_INVALID|not enough rights|premium/i.test(description);

      if (isCustomEmojiIssue && retryPlain && payload && (payload.text || payload.caption)) {
        if (!tg.customEmojiBlocked) {
          tg.customEmojiBlocked = true;
          CFG.useCustomEmoji = false;
          log.warn('Telegram отклонил custom emoji, переключаюсь на обычные:', description);
        }
        const plain = { ...payload };
        if (plain.text) plain.text = stripCustomEmoji(plain.text);
        if (plain.caption) plain.caption = stripCustomEmoji(plain.caption);
        return tg.api(method, plain, { retryPlain: false });
      }

      log.debug(`tg.${method} failed:`, description);
      throw err;
    }
  },

  sendMessage(chatId, text, extra = {}) {
    return tg.api('sendMessage', {
      chat_id: chatId,
      text,
      parse_mode: 'HTML',
      link_preview_options: { is_disabled: true },
      ...extra
    });
  },

  editMessageText(chatId, messageId, text, extra = {}) {
    return tg.api('editMessageText', {
      chat_id: chatId,
      message_id: messageId,
      text,
      parse_mode: 'HTML',
      link_preview_options: { is_disabled: true },
      ...extra
    });
  },

  sendPhoto(chatId, photo, caption, extra = {}) {
    return tg.api('sendPhoto', { chat_id: chatId, photo, caption, parse_mode: 'HTML', ...extra });
  },

  answerCallbackQuery(id, extra = {}) {
    return tg.api('answerCallbackQuery', { callback_query_id: id, ...extra }).catch(() => null);
  },

  answerInlineQuery(id, results, extra = {}) {
    return tg.api('answerInlineQuery', { inline_query_id: id, results, cache_time: 60, ...extra }).catch(() => null);
  },

  sendChatAction(chatId, action = 'typing') {
    return tg.api('sendChatAction', { chat_id: chatId, action }).catch(() => null);
  }
};

/* --- ссылки на Mini App ---------------------------------------------------- */

function miniAppUrl(route = '') {
  const base = CFG.publicUrl;
  if (!route) return base + '/';
  return `${base}/?r=${encodeURIComponent(route)}`;
}

const webAppButton = (text, route = '') => ({ text, web_app: { url: miniAppUrl(route) } });

const mainKeyboard = () => ({
  inline_keyboard: [
    [webAppButton('Открыть Dreinn Music', '')],
    [
      webAppButton('Оценить трек', 'search:track'),
      webAppButton('Рейтинги', 'charts')
    ],
    [
      webAppButton('Discover', 'discover'),
      webAppButton('Профиль', 'profile')
    ]
  ]
});

/* --- тексты бота ----------------------------------------------------------- */

function scoreBarText(value, max = SCORE.CRIT_MAX, size = 10) {
  const filled = Math.round((Math.max(0, Math.min(max, value)) / max) * size);
  return '▰'.repeat(filled) + '▱'.repeat(size - filled);
}

function ratingCardText(rating) {
  const tier = rating.tier;
  const lines = [
    `${em('music')} <b>${escapeHtml(rating.title)}</b>`,
    `<i>${escapeHtml(rating.artist || '')}</i>`,
    '',
    `${em('trophy')} <b>${rating.final.toFixed(1)}</b> / ${SCORE.MAX} — ${em(tier.emoji)} <b>${tier.label}</b>`,
    `${em('abacus')} База: <b>${rating.base.toFixed(1)}</b>/${SCORE.BASE_MAX} · Вайб-коэффициент: <b>×${rating.coefficient.toFixed(2)}</b>`,
    ''
  ];
  for (const part of rating.breakdown) {
    lines.push(`${scoreBarText(part.value)}  ${escapeHtml(part.short)} — <b>${part.value}</b>/10 <i>(+${part.points.toFixed(1)})</i>`);
  }
  lines.push(`${scoreBarText(rating.values.vibe)}  Вайб — <b>${rating.values.vibe}</b>/10 <i>(×${rating.coefficient.toFixed(2)})</i>`);
  if (rating.review) lines.push('', `${em('speech')} <i>${escapeHtml(rating.review)}</i>`);
  return lines.join('\n');
}

function welcomeText(user) {
  return [
    `${em('wave')} <b>Привет, ${escapeHtml(user.first_name || 'слушатель')}!</b>`,
    '',
    `Это <b>Dreinn Music</b> ${em('headphones')} — сервис, где музыку оценивают не одной цифрой, а по пяти факторам.`,
    '',
    `${em('star')} <b>Как считается Dreinn Score</b>`,
    `• Тексты / образы, Структура / ритмика, Реализация стиля, Индивидуальность — дают базу до <b>${SCORE.BASE_MAX}</b> баллов`,
    `• Атмосфера / вайб превращается в коэффициент <b>×0.80 … ×1.20</b>`,
    `• Итог — до <b>${SCORE.MAX}</b> баллов с подробной разбивкой`,
    '',
    `${em('duck')} <b>Что внутри</b>`,
    `• поиск треков, альбомов и артистов + 30-секундные превью`,
    `• история оценок, любимое, коллекции`,
    `• музыкальный профиль и распределение баллов`,
    `• рекомендации, Discover и рейтинги`,
    `• сравнение вкусов с друзьями`,
    `• подключение Spotify и оценка треков из плейлистов`,
    '',
    `${em('phone')} Жми кнопку ниже — приложение откроется прямо в Telegram.`
  ].join('\n');
}

function helpText() {
  return [
    `${em('book')} <b>Команды Dreinn Music</b>`,
    '',
    '/start — открыть приложение',
    '/app — быстрая кнопка Mini App',
    '/search <i>запрос</i> — поиск по каталогу',
    '/rate <i>запрос</i> — найти и сразу оценить',
    '/top — лучшие треки и альбомы сообщества',
    '/discover — случайная находка с превью',
    '/profile — твой музыкальный профиль',
    '/stats — статистика оценок',
    '/spotify — подключить Spotify',
    '/compare — сравнить вкусы с другом',
    '/scoring — как устроена система оценок',
    '/help — эта справка',
    '',
    `${em('think')} Можно просто прислать боту название трека — он найдёт его в каталоге.`
  ].join('\n');
}

function scoringText() {
  const trackLines = TRACK_CRITERIA.map((c) => `• <b>${escapeHtml(c.title)}</b> — ${escapeHtml(c.hint)}`);
  const albumLines = ALBUM_CRITERIA.map((c) => `• <b>${escapeHtml(c.title)}</b> — ${escapeHtml(c.hint)}`);
  return [
    `${em('abacus')} <b>Как считается Dreinn Score</b>`,
    '',
    `${em('note')} <b>Трек</b> — четыре базовых критерия по 0–10:`,
    ...trackLines,
    `Сумма (0–40) масштабируется в базу <b>0–${SCORE.BASE_MAX}</b>: каждый балл критерия = <b>1.875</b> итоговых.`,
    '',
    `${em('rainbow')} <b>Атмосфера / вайб</b> — не складывается, а умножает:`,
    `коэффициент = 0.80 + 0.04 × вайб → <b>×0.80 … ×1.20</b>`,
    `Итог = база × коэффициент → максимум <b>${SCORE.MAX}</b> баллов.`,
    '',
    `${em('books')} <b>Альбом</b> — свои четыре критерия:`,
    ...albumLines,
    `Плюс учитываются твои оценки отдельных треков альбома: их вклад растёт с покрытием и достигает <b>40%</b>, когда оценён весь альбом.`,
    '',
    `${em('trophy')} <b>Шкала</b>`,
    ...TIERS.map((t) => `${em(t.emoji)} <b>${t.min}+</b> — ${t.label}`)
  ].join('\n');
}

function profileText(user, stats) {
  const t = stats.totals;
  const s = stats.scores;
  const lines = [
    `${em('cool')} <b>${escapeHtml(displayName(user))}</b>`,
    `<i>${escapeHtml(stats.taste.archetype)} · ${escapeHtml(stats.taste.generosity)} критик</i>`,
    '',
    `${em('chart')} Оценок: <b>${t.total}</b> (${t.tracks} треков · ${t.albums} альбомов)`,
    `${em('trophy')} Средний балл: <b>${s.avg.toFixed(1)}</b>/${SCORE.MAX} — ${em(s.avgTier.emoji)} ${s.avgTier.label}`,
    `${em('fire')} Лучшая оценка: <b>${s.max.toFixed(1)}</b>`,
    `${em('heart')} В любимом: <b>${t.favorites}</b> · коллекций: <b>${t.collections}</b>`,
    `${em('speech')} Отзывов: <b>${t.reviews}</b>`
  ];

  if (stats.taste.favoriteGenre) lines.push(`${em('palette')} Любимый жанр: <b>${escapeHtml(stats.taste.favoriteGenre)}</b>`);
  if (stats.taste.strongest) {
    lines.push('', `${em('star')} Чаще всего высоко ценишь: <b>${escapeHtml(stats.taste.strongest.title)}</b> (${stats.taste.strongest.avg}/10)`);
  }
  if (stats.taste.weakest) {
    lines.push(`${em('eyes')} Строже всего к: <b>${escapeHtml(stats.taste.weakest.title)}</b> (${stats.taste.weakest.avg}/10)`);
  }
  if (stats.topArtists.length) {
    lines.push('', `${em('mic')} <b>Топ артистов</b>`);
    stats.topArtists.slice(0, 5).forEach((a, i) => {
      lines.push(`${i + 1}. ${escapeHtml(a.artist)} — ${a.count} оц. · ср. ${a.avg.toFixed(1)}`);
    });
  }
  if (stats.best.length) {
    lines.push('', `${em('top')} <b>Личный топ</b>`);
    stats.best.slice(0, 5).forEach((r, i) => {
      lines.push(`${i + 1}. ${escapeHtml(r.title)} — <b>${r.final.toFixed(1)}</b>`);
    });
  }
  if (!t.total) lines.push('', `${em('duck')} Пока пусто. Открой приложение и оцени первый трек!`);
  return lines.join('\n');
}

function statsText(stats) {
  const lines = [
    `${em('chart')} <b>Распределение твоих оценок</b>`,
    ''
  ];
  const maxCount = Math.max(1, ...stats.buckets.map((b) => b.count));
  for (const bucket of stats.buckets) {
    const width = Math.round((bucket.count / maxCount) * 12);
    lines.push(`<code>${bucket.label.padStart(6)}</code> ${'█'.repeat(width) || '·'} ${bucket.count}`);
  }
  lines.push('', `${em('abacus')} <b>Средние по критериям (треки)</b>`);
  for (const c of stats.criteria.track) {
    lines.push(`${scoreBarText(c.avg)}  ${escapeHtml(c.short)} — <b>${c.avg}</b>/10`);
  }
  lines.push(`${scoreBarText(stats.criteria.vibe.avg)}  Вайб — <b>${stats.criteria.vibe.avg}</b>/10`);
  if (stats.criteria.album.some((c) => c.avg > 0)) {
    lines.push('', `${em('books')} <b>Средние по критериям (альбомы)</b>`);
    for (const c of stats.criteria.album) {
      lines.push(`${scoreBarText(c.avg)}  ${escapeHtml(c.short)} — <b>${c.avg}</b>/10`);
    }
  }
  return lines.join('\n');
}

function topText(items, type) {
  const title = type === 'album' ? 'Лучшие альбомы' : 'Лучшие треки';
  const lines = [`${em('trophy')} <b>${title} по версии Dreinn</b>`, ''];
  if (!items.length) {
    lines.push(`${em('sleep')} Пока никто ничего не оценил. Будь первым!`);
    return lines.join('\n');
  }
  const medals = ['🥇', '🥈', '🥉'];
  items.slice(0, 10).forEach((item, index) => {
    const prefix = medals[index] || `${index + 1}.`;
    lines.push(
      `${prefix} <b>${escapeHtml(item.title)}</b> — ${escapeHtml(item.artist || '')}`,
      `     ${em(item.tier.emoji)} <b>${item.avg.toFixed(1)}</b>/${SCORE.MAX} · голосов: ${item.votes}`
    );
  });
  return lines.join('\n');
}

/* =============================================================================
 * 10. ЛОГИКА БОТА
 * ========================================================================== */

function setBotState(userId, state, payload) {
  db.prepare('INSERT OR REPLACE INTO bot_state (user_id, state, payload, updated_at) VALUES (?,?,?,?)')
    .run(userId, state, payload ? JSON.stringify(payload) : null, now());
}

function getBotState(userId) {
  const row = db.prepare('SELECT * FROM bot_state WHERE user_id = ?').get(userId);
  if (!row) return null;
  let payload = null;
  try {
    payload = row.payload ? JSON.parse(row.payload) : null;
  } catch {
    payload = null;
  }
  return { state: row.state, payload, updatedAt: row.updated_at };
}

const clearBotState = (userId) => db.prepare('DELETE FROM bot_state WHERE user_id = ?').run(userId);

async function sendSearchResults(chatId, query, type = 'track') {
  await tg.sendChatAction(chatId);
  let items = [];
  try {
    const res = await dz.search(query, type, 6);
    items = type === 'album' ? normList(res, normAlbum) : type === 'artist' ? normList(res, normArtist) : normList(res, normTrack);
  } catch (err) {
    log.warn('deezer search failed', err.message);
    return tg.sendMessage(chatId, `${em('cross')} Каталог сейчас недоступен, попробуй ещё раз через минуту.`);
  }

  if (!items.length) {
    return tg.sendMessage(chatId, `${em('think')} По запросу «${escapeHtml(query)}» ничего не нашлось.`, {
      reply_markup: { inline_keyboard: [[webAppButton('Искать в приложении', 'search:track')]] }
    });
  }

  const lines = [`${em('search')} <b>Результаты по «${escapeHtml(query)}»</b>`, ''];
  const keyboard = [];

  items.forEach((item, index) => {
    if (type === 'artist') {
      lines.push(`${index + 1}. <b>${escapeHtml(item.name)}</b> — ${item.fans.toLocaleString('ru-RU')} фанатов`);
      keyboard.push([webAppButton(`${index + 1}. ${item.name}`.slice(0, 60), `artist:${item.id}`)]);
      return;
    }
    const subtitle = type === 'album' ? `${item.trackCount} треков` : formatDuration(item.duration);
    lines.push(`${index + 1}. <b>${escapeHtml(item.title)}</b> — ${escapeHtml(item.artist)} <i>(${subtitle})</i>`);
    keyboard.push([webAppButton(`${index + 1}. Оценить «${item.title}»`.slice(0, 60), `rate:${type}:${item.id}`)]);
  });

  keyboard.push([webAppButton('Открыть поиск в приложении', `search:${type}:${query}`)]);
  return tg.sendMessage(chatId, lines.join('\n'), { reply_markup: { inline_keyboard: keyboard } });
}

function formatDuration(seconds) {
  const total = toInt(seconds, 0);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

async function sendDiscover(chatId, userId) {
  await tg.sendChatAction(chatId, 'upload_photo');
  let picks = [];
  try {
    picks = await discover(userId, 4);
  } catch (err) {
    log.debug('discover failed', err.message);
  }
  if (!picks.length) {
    return tg.sendMessage(chatId, `${em('sleep')} Discover сейчас отдыхает, попробуй чуть позже.`);
  }

  const pick = picks[0];
  const caption = [
    `${em('wand')} <b>Находка дня</b>`,
    '',
    `${em('music')} <b>${escapeHtml(pick.title)}</b>`,
    `<i>${escapeHtml(pick.artist)}</i>${pick.album ? ` · ${escapeHtml(pick.album)}` : ''}`,
    `${em('clock')} ${formatDuration(pick.duration)} · ${escapeHtml(pick.reason || 'Свежий выбор')}`,
    '',
    `${em('headphones')} 30-секундное превью и оценка — в приложении.`
  ].join('\n');

  const keyboard = {
    inline_keyboard: [
      [webAppButton('Слушать и оценить', `rate:track:${pick.id}`)],
      [webAppButton('Ещё находки', 'discover')]
    ]
  };

  try {
    if (pick.cover && /^https?:/.test(pick.cover)) {
      return await tg.sendPhoto(chatId, pick.cover, caption, { reply_markup: keyboard });
    }
  } catch (err) {
    log.debug('discover photo failed', err.message);
  }
  return tg.sendMessage(chatId, caption, { reply_markup: keyboard });
}

async function handleCommand(message, command, args) {
  const chatId = message.chat.id;
  const user = upsertUser(message.from);
  const userId = user.id;

  switch (command) {
    case 'start': {
      clearBotState(userId);
      const startParam = (args || '').trim();
      if (startParam && /^(track|album|artist)[_-]\d+$/.test(startParam)) {
        const [type, id] = startParam.split(/[_-]/);
        return tg.sendMessage(chatId, `${em('music')} Открываю карточку и экран оценки.`, {
          reply_markup: { inline_keyboard: [[webAppButton('Открыть', `rate:${type}:${id}`)]] }
        });
      }
      logEvent(userId, 'bot_start');
      return tg.sendMessage(chatId, welcomeText(message.from), { reply_markup: mainKeyboard() });
    }

    case 'app':
      return tg.sendMessage(chatId, `${em('phone')} Dreinn Music готов к запуску.`, { reply_markup: mainKeyboard() });

    case 'help':
      return tg.sendMessage(chatId, helpText(), { reply_markup: { inline_keyboard: [[webAppButton('Открыть приложение')]] } });

    case 'scoring':
      return tg.sendMessage(chatId, scoringText(), {
        reply_markup: { inline_keyboard: [[webAppButton('Попробовать оценку', 'search:track')]] }
      });

    case 'search':
    case 'rate': {
      const query = (args || '').trim();
      if (!query) {
        setBotState(userId, 'awaiting_search', { type: 'track' });
        return tg.sendMessage(chatId, `${em('search')} Что ищем? Пришли название трека, альбома или артиста.`);
      }
      return sendSearchResults(chatId, query, 'track');
    }

    case 'top': {
      const type = (args || '').trim().startsWith('alb') ? 'album' : 'track';
      const items = leaderboard({ type, limit: 10 });
      return tg.sendMessage(chatId, topText(items, type), {
        reply_markup: {
          inline_keyboard: [
            [
              { text: type === 'track' ? '· Треки ·' : 'Треки', callback_data: 'top:track' },
              { text: type === 'album' ? '· Альбомы ·' : 'Альбомы', callback_data: 'top:album' }
            ],
            [webAppButton('Полные рейтинги', 'charts')]
          ]
        }
      });
    }

    case 'discover':
      return sendDiscover(chatId, userId);

    case 'profile': {
      const stats = userStats(userId);
      return tg.sendMessage(chatId, profileText(user, stats), {
        reply_markup: { inline_keyboard: [[webAppButton('Открыть профиль', 'profile')], [{ text: 'Статистика', callback_data: 'stats' }]] }
      });
    }

    case 'stats': {
      const stats = userStats(userId);
      if (!stats.totals.total) {
        return tg.sendMessage(chatId, `${em('sleep')} Статистика появится после первой оценки.`, {
          reply_markup: { inline_keyboard: [[webAppButton('Оценить трек', 'search:track')]] }
        });
      }
      return tg.sendMessage(chatId, statsText(stats), {
        reply_markup: { inline_keyboard: [[webAppButton('Подробнее в приложении', 'profile')]] }
      });
    }

    case 'spotify': {
      if (!CFG.spotifyEnabled) {
        return tg.sendMessage(chatId, `${em('stop')} Интеграция со Spotify не настроена на этом сервере.`);
      }
      const status = spotify.status(userId);
      if (status.connected) {
        return tg.sendMessage(chatId, [
          `${em('check')} Spotify подключён: <b>${escapeHtml(status.account.display_name || status.account.spotify_id)}</b>`,
          '',
          `${em('headphones')} Плейлисты, оценка треков из них и синхронизация — в приложении.`,
          `${em('shield')} Мы читаем только метаданные: музыка не скачивается и не стримится.`
        ].join('\n'), { reply_markup: { inline_keyboard: [[webAppButton('Мои плейлисты', 'spotify')]] } });
      }
      return tg.sendMessage(chatId, [
        `${em('link')} <b>Подключение Spotify</b>`,
        '',
        'После подключения ты сможешь:',
        '• смотреть свои плейлисты прямо в Dreinn Music;',
        '• оценивать треки из них по системе 90 баллов;',
        '• синхронизировать плейлист в коллекцию.',
        '',
        `${em('shield')} Только метаданные — без скачивания и стриминга.`
      ].join('\n'), { reply_markup: { inline_keyboard: [[webAppButton('Подключить Spotify', 'spotify')]] } });
    }

    case 'compare': {
      const target = (args || '').trim().replace(/^@/, '');
      if (!target) {
        return tg.sendMessage(chatId, [
          `${em('handshake')} <b>Сравнение вкусов</b>`,
          '',
          'Напиши <code>/compare username</code> — покажу процент совпадения, общие любимые треки и главные разногласия.',
          'Пользователь должен быть зарегистрирован в Dreinn Music.'
        ].join('\n'), { reply_markup: { inline_keyboard: [[webAppButton('Выбрать в приложении', 'compare')]] } });
      }
      const found = searchUsers(target, userId);
      if (!found.length) {
        return tg.sendMessage(chatId, `${em('think')} Не нашёл пользователя «${escapeHtml(target)}» среди тех, кто уже в Dreinn Music.`);
      }
      const other = found[0];
      const result = compareUsers(userId, other.id);
      const lines = [
        `${em('handshake')} <b>${escapeHtml(result.users[0].name)}</b> × <b>${escapeHtml(result.users[1].name)}</b>`,
        '',
        `${em('heart')} Совпадение вкусов: <b>${result.match}%</b> — ${escapeHtml(result.verdict)}`,
        `${em('music')} Общих оценённых: <b>${result.sharedCount}</b>`
      ];
      if (result.agree.length) {
        lines.push('', `${em('check')} <b>Сходитесь</b>`);
        result.agree.slice(0, 3).forEach((i) => lines.push(`• ${escapeHtml(i.title)} — ${i.a} / ${i.b}`));
      }
      if (result.disagree.length) {
        lines.push('', `${em('angry')} <b>Спорите</b>`);
        result.disagree.slice(0, 3).forEach((i) => lines.push(`• ${escapeHtml(i.title)} — ${i.a} / ${i.b}`));
      }
      return tg.sendMessage(chatId, lines.join('\n'), {
        reply_markup: { inline_keyboard: [[webAppButton('Подробное сравнение', `compare:${other.id}`)]] }
      });
    }

    case 'about':
      return tg.sendMessage(chatId, [
        `${em('duckCool')} <b>Dreinn Music</b>`,
        '',
        'Многофакторная оценка музыки до 90 баллов.',
        `${em('note')} Каталог и превью — Deezer.`,
        `${em('link')} Плейлисты — Spotify (только метаданные).`,
        `${em('shield')} Данные хранятся локально в SQLite.`
      ].join('\n'), { reply_markup: mainKeyboard() });

    default:
      return tg.sendMessage(chatId, `${em('think')} Не знаю такой команды. Посмотри /help`);
  }
}

async function handleMessage(message) {
  if (!message || !message.chat) return;
  const chatId = message.chat.id;
  const text = (message.text || '').trim();
  if (!text) return;

  const user = upsertUser(message.from);

  if (text.startsWith('/')) {
    const match = text.match(/^\/([a-zA-Z_]+)(?:@\w+)?\s*([\s\S]*)$/);
    if (!match) return;
    return handleCommand(message, match[1].toLowerCase(), match[2]);
  }

  const state = getBotState(user.id);
  if (state && state.state === 'awaiting_search') {
    clearBotState(user.id);
    return sendSearchResults(chatId, text, (state.payload && state.payload.type) || 'track');
  }

  return sendSearchResults(chatId, text, 'track');
}

async function handleCallback(query) {
  const data = query.data || '';
  const chatId = query.message ? query.message.chat.id : null;
  const messageId = query.message ? query.message.message_id : null;
  const user = upsertUser(query.from);

  try {
    if (data.startsWith('top:')) {
      const type = data.split(':')[1] === 'album' ? 'album' : 'track';
      const items = leaderboard({ type, limit: 10 });
      await tg.editMessageText(chatId, messageId, topText(items, type), {
        reply_markup: {
          inline_keyboard: [
            [
              { text: type === 'track' ? '· Треки ·' : 'Треки', callback_data: 'top:track' },
              { text: type === 'album' ? '· Альбомы ·' : 'Альбомы', callback_data: 'top:album' }
            ],
            [webAppButton('Полные рейтинги', 'charts')]
          ]
        }
      });
    } else if (data === 'stats') {
      const stats = userStats(user.id);
      await tg.sendMessage(chatId, stats.totals.total ? statsText(stats) : `${em('sleep')} Пока нет оценок.`);
    } else if (data === 'discover') {
      await sendDiscover(chatId, user.id);
    }
  } catch (err) {
    log.debug('callback failed', err.message);
  }

  return tg.answerCallbackQuery(query.id);
}

async function handleInlineQuery(query) {
  const text = (query.query || '').trim();
  if (!text) {
    return tg.answerInlineQuery(query.id, [], {
      button: { text: 'Открыть Dreinn Music', web_app: { url: miniAppUrl() } }
    });
  }

  let tracks = [];
  try {
    const res = await dz.search(text, 'track', 10);
    tracks = normList(res, normTrack);
  } catch (err) {
    log.debug('inline search failed', err.message);
  }

  const results = tracks.map((track) => ({
    type: 'article',
    id: `t${track.id}`,
    title: track.title,
    description: `${track.artist} · ${formatDuration(track.duration)}`,
    thumbnail_url: track.coverSmall && /^https?:/.test(track.coverSmall) ? track.coverSmall : undefined,
    input_message_content: {
      message_text: [
        `${em('music')} <b>${escapeHtml(track.title)}</b>`,
        `<i>${escapeHtml(track.artist)}</i>`,
        '',
        `${em('star')} Оценить по системе Dreinn (до ${SCORE.MAX} баллов):`
      ].join('\n'),
      parse_mode: 'HTML'
    },
    reply_markup: { inline_keyboard: [[webAppButton('Оценить трек', `rate:track:${track.id}`)]] }
  }));

  return tg.answerInlineQuery(query.id, results, {
    button: { text: 'Открыть приложение', web_app: { url: miniAppUrl() } }
  });
}

async function handleUpdate(update) {
  try {
    if (update.message) return await handleMessage(update.message);
    if (update.callback_query) return await handleCallback(update.callback_query);
    if (update.inline_query) return await handleInlineQuery(update.inline_query);
  } catch (err) {
    log.error('update handling failed:', err.message);
  }
}

/* --- запуск бота ----------------------------------------------------------- */

async function setupBotProfile() {
  await tg.api('setMyCommands', {
    commands: [
      { command: 'start', description: 'Открыть Dreinn Music' },
      { command: 'search', description: 'Поиск по каталогу' },
      { command: 'discover', description: 'Случайная находка' },
      { command: 'top', description: 'Рейтинги сообщества' },
      { command: 'profile', description: 'Музыкальный профиль' },
      { command: 'stats', description: 'Статистика оценок' },
      { command: 'spotify', description: 'Подключить Spotify' },
      { command: 'compare', description: 'Сравнить вкусы' },
      { command: 'scoring', description: 'Как считается оценка' },
      { command: 'help', description: 'Справка' }
    ]
  }).catch((err) => log.debug('setMyCommands failed', err.message));

  await tg.api('setChatMenuButton', {
    menu_button: { type: 'web_app', text: 'Dreinn', web_app: { url: miniAppUrl() } }
  }).catch((err) => log.debug('setChatMenuButton failed', err.message));
}

let pollingAbort = false;

async function startPolling() {
  await tg.api('deleteWebhook', { drop_pending_updates: false }).catch(() => null);
  let offset = 0;
  log.info('Бот запущен в режиме long polling');

  while (!pollingAbort) {
    try {
      const updates = await tg.api('getUpdates', {
        offset,
        timeout: 30,
        allowed_updates: ['message', 'callback_query', 'inline_query']
      });
      if (updates && updates.ok && Array.isArray(updates.result)) {
        for (const update of updates.result) {
          offset = update.update_id + 1;
          handleUpdate(update);
        }
      }
    } catch (err) {
      if (!pollingAbort) {
        log.warn('polling error:', err.message);
        await new Promise((r) => setTimeout(r, 3000));
      }
    }
  }
}

async function startWebhook() {
  const url = `${CFG.publicUrl}${CFG.webhookPath}`;
  await tg.api('setWebhook', {
    url,
    secret_token: CFG.webhookSecret || undefined,
    allowed_updates: ['message', 'callback_query', 'inline_query'],
    drop_pending_updates: false
  });
  log.info('Бот запущен в режиме webhook:', url);
}

/* =============================================================================
 * 11. HTTP-СЕРВЕР: Mini App + API
 * ========================================================================== */

const app = express();
app.disable('x-powered-by');
app.set('trust proxy', true);
app.use(express.json({ limit: '256kb' }));
app.use(express.urlencoded({ extended: true, limit: '256kb' }));

app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  if (req.path.startsWith('/api/')) {
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Init-Data, X-Dev-User');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PATCH, DELETE, OPTIONS');
    if (req.method === 'OPTIONS') return res.sendStatus(204);
  }
  return next();
});

/* --- авторизация через Telegram initData ----------------------------------- */

function validateInitData(initData) {
  if (!initData || !CFG.botToken) return null;
  let params;
  try {
    params = new URLSearchParams(initData);
  } catch {
    return null;
  }

  const hash = params.get('hash');
  if (!hash) return null;
  params.delete('hash');
  params.delete('signature');

  const dataCheckString = [...params.entries()]
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([key, value]) => `${key}=${value}`)
    .join('\n');

  const secretKey = crypto.createHmac('sha256', 'WebAppData').update(CFG.botToken).digest();
  const signature = crypto.createHmac('sha256', secretKey).update(dataCheckString).digest('hex');

  if (signature.length !== hash.length) return null;
  if (!crypto.timingSafeEqual(Buffer.from(signature, 'hex'), Buffer.from(hash, 'hex'))) return null;

  const authDate = toInt(params.get('auth_date'), 0);
  if (!authDate || now() - authDate > 86400) return null;

  try {
    const user = JSON.parse(params.get('user') || 'null');
    if (!user || !user.id) return null;
    return { user, startParam: params.get('start_param') || null, authDate };
  } catch {
    return null;
  }
}

function authMiddleware(req, res, next) {
  const initData = req.get('X-Init-Data') || req.query.initData || '';
  const parsed = validateInitData(initData);

  if (parsed) {
    req.tgUser = parsed.user;
    req.startParam = parsed.startParam;
    req.user = upsertUser(parsed.user);
    return next();
  }

  if (CFG.devMode) {
    const devId = toInt(req.get('X-Dev-User') || req.query.devUser, 777000001);
    req.user = upsertUser({
      id: devId,
      first_name: 'Dev',
      last_name: 'Listener',
      username: 'dev_listener',
      language_code: 'ru'
    });
    req.devMode = true;
    return next();
  }

  return res.status(401).json({ error: 'unauthorized', message: 'Открой приложение через Telegram' });
}

const wrap = (handler) => (req, res, next) => Promise.resolve(handler(req, res, next)).catch(next);

const api = express.Router();
api.use(authMiddleware);

/* --- базовая информация ---------------------------------------------------- */

api.get('/bootstrap', wrap(async (req, res) => {
  const user = req.user;
  const stats = userStats(user.id);
  res.json({
    user: {
      id: user.id,
      name: displayName(user),
      firstName: user.first_name,
      username: user.username,
      photo: user.photo_url,
      isPremium: Boolean(user.is_premium),
      bio: user.bio,
      createdAt: user.created_at
    },
    config: {
      appName: 'Dreinn Music',
      maxScore: SCORE.MAX,
      baseMax: SCORE.BASE_MAX,
      critMax: SCORE.CRIT_MAX,
      critStep: SCORE.CRIT_STEP,
      pointsPerUnit: SCORE.POINTS_PER_UNIT,
      vibeBaseK: SCORE.VIBE_BASE_K,
      vibeStepK: SCORE.VIBE_STEP_K,
      trackWeightInAlbum: SCORE.TRACK_WEIGHT_IN_ALBUM,
      trackCriteria: TRACK_CRITERIA,
      albumCriteria: ALBUM_CRITERIA,
      vibeCriterion: VIBE_CRITERION,
      tiers: TIERS,
      spotifyEnabled: CFG.spotifyEnabled,
      botUsername: CFG.botUsername,
      devMode: Boolean(req.devMode)
    },
    spotify: spotify.status(user.id),
    stats: {
      total: stats.totals.total,
      tracks: stats.totals.tracks,
      albums: stats.totals.albums,
      avg: stats.scores.avg,
      favorites: stats.totals.favorites,
      collections: stats.totals.collections
    }
  });
}));

/* --- каталог --------------------------------------------------------------- */

api.get('/search', wrap(async (req, res) => {
  const query = String(req.query.q || '').trim();
  const type = ['track', 'album', 'artist'].includes(req.query.type) ? req.query.type : 'track';
  const limit = Math.min(50, toInt(req.query.limit, 25));
  const index = Math.max(0, toInt(req.query.index, 0));

  if (query.length < 2) return res.json({ items: [], total: 0, type });

  const raw = await dz.search(query, type, limit, index);
  const items =
    type === 'album' ? normList(raw, normAlbum)
    : type === 'artist' ? normList(raw, normArtist)
    : normList(raw, normTrack);

  const enriched = items.map((item) => {
    if (item.type === 'artist') return item;
    const rating = getRating(req.user.id, item.type, item.id);
    return { ...item, myScore: rating ? rating.final : null, favorite: isFavorite(req.user.id, item.type, item.id) };
  });

  res.json({ items: enriched, total: toInt(raw && raw.total, enriched.length), type, query });
}));

api.get('/track/:id', wrap(async (req, res) => {
  const raw = await dz.track(req.params.id);
  const track = normTrack(raw);
  if (!track) return res.status(404).json({ error: 'not_found' });

  let album = null;
  if (track.albumId) {
    try {
      album = normAlbum(await dz.album(track.albumId));
    } catch {
      album = null;
    }
  }
  if (album && !track.genre) track.genre = album.genre;

  res.json({
    item: track,
    album,
    myRating: getRating(req.user.id, 'track', track.id),
    favorite: isFavorite(req.user.id, 'track', track.id),
    community: communityStats('track', track.id)
  });
}));

api.get('/album/:id', wrap(async (req, res) => {
  const raw = await dz.album(req.params.id);
  const album = normAlbum(raw);
  if (!album) return res.status(404).json({ error: 'not_found' });

  const tracks = normList(raw.tracks, normTrack).map((t) => {
    const rating = getRating(req.user.id, 'track', t.id);
    return {
      ...t,
      cover: t.cover === DEFAULT_COVER ? album.cover : t.cover,
      album: album.title,
      albumId: album.id,
      myScore: rating ? rating.final : null,
      myTier: rating ? rating.tier : null
    };
  });

  const ctx = albumTrackContext(req.user.id, album.id, album.trackCount || tracks.length);

  res.json({
    item: album,
    tracks,
    myRating: getRating(req.user.id, 'album', album.id),
    favorite: isFavorite(req.user.id, 'album', album.id),
    community: communityStats('album', album.id),
    trackContext: {
      ...ctx,
      avgFinal: round1(ctx.avgFinal),
      weight: ctx.rated > 0 ? round2(SCORE.TRACK_WEIGHT_IN_ALBUM * Math.min(1, ctx.rated / (ctx.total || 1))) : 0
    }
  });
}));

api.get('/artist/:id', wrap(async (req, res) => {
  const [rawArtist, rawTop, rawAlbums] = await Promise.all([
    dz.artist(req.params.id),
    dz.artistTop(req.params.id, 15).catch(() => null),
    dz.artistAlbums(req.params.id, 25).catch(() => null)
  ]);

  const artist = normArtist(rawArtist);
  if (!artist) return res.status(404).json({ error: 'not_found' });

  const topTracks = normList(rawTop, normTrack).map((t) => {
    const rating = getRating(req.user.id, 'track', t.id);
    return { ...t, myScore: rating ? rating.final : null };
  });

  const albums = normList(rawAlbums, normAlbum).map((a) => {
    const rating = getRating(req.user.id, 'album', a.id);
    return { ...a, myScore: rating ? rating.final : null };
  });

  const mine = db.prepare(`
    SELECT COUNT(*) AS count, AVG(final_score) AS avg_final
    FROM ratings WHERE user_id = ? AND artist_id = ?
  `).get(req.user.id, artist.id);

  res.json({
    item: artist,
    topTracks,
    albums,
    myStats: {
      count: toInt(mine && mine.count, 0),
      avg: round1((mine && mine.avg_final) || 0),
      tier: tierFor((mine && mine.avg_final) || 0)
    }
  });
}));

api.get('/home', wrap(async (req, res) => {
  const userId = req.user.id;
  const [chart, releases] = await Promise.all([
    dz.chartTracks(20).then((r) => normList(r, normTrack)).catch(() => []),
    newReleases(15)
  ]);

  const ratedTracks = ratedIdSet(userId, 'track');
  const stats = userStats(userId);

  res.json({
    greeting: greetingFor(req.user),
    chart: chart.map((t) => ({ ...t, rated: ratedTracks.has(t.id) })),
    releases,
    recent: stats.recent,
    best: stats.best,
    stats: {
      total: stats.totals.total,
      tracks: stats.totals.tracks,
      albums: stats.totals.albums,
      avg: stats.scores.avg,
      avgTier: stats.scores.avgTier,
      archetype: stats.taste.archetype,
      favoriteGenre: stats.taste.favoriteGenre
    },
    community: {
      topTracks: leaderboard({ type: 'track', limit: 5 }),
      totalRatings: db.prepare('SELECT COUNT(*) AS c FROM ratings').get().c,
      totalUsers: db.prepare('SELECT COUNT(*) AS c FROM users').get().c
    }
  });
}));

function greetingFor(user) {
  const hour = new Date().getHours();
  const part = hour < 5 ? 'Доброй ночи' : hour < 12 ? 'Доброе утро' : hour < 18 ? 'Добрый день' : 'Добрый вечер';
  return `${part}, ${user.first_name || 'слушатель'}`;
}

api.get('/discover', wrap(async (req, res) => {
  const items = await discover(req.user.id, Math.min(20, toInt(req.query.limit, 12)));
  res.json({ items });
}));

api.get('/recommendations', wrap(async (req, res) => {
  const items = await recommendations(req.user.id, Math.min(30, toInt(req.query.limit, 18)));
  res.json({ items, hasSeeds: db.prepare('SELECT COUNT(*) AS c FROM ratings WHERE user_id = ?').get(req.user.id).c > 0 });
}));

/* --- оценки ---------------------------------------------------------------- */

api.post('/rate', wrap(async (req, res) => {
  const result = await saveRating(req.user.id, req.body || {});
  res.json(result);
}));

api.post('/preview-score', wrap(async (req, res) => {
  const body = req.body || {};
  const type = body.type === 'album' ? 'album' : 'track';
  let ctx = {};
  if (type === 'album' && body.itemId) {
    ctx = albumTrackContext(req.user.id, body.itemId, toInt(body.totalTracks, 0));
  }
  res.json({ score: computeScore(type, body.values || {}, ctx) });
}));

api.delete('/rate/:type/:id', wrap(async (req, res) => {
  const ok = deleteRating(req.user.id, req.params.type === 'album' ? 'album' : 'track', req.params.id);
  res.json({ deleted: ok });
}));

api.get('/ratings', wrap(async (req, res) => {
  res.json(listRatings(req.user.id, {
    type: req.query.type,
    sort: req.query.sort,
    search: String(req.query.q || '').trim(),
    limit: toInt(req.query.limit, 30),
    offset: toInt(req.query.offset, 0)
  }));
}));

api.get('/ratings/:type/:id', wrap(async (req, res) => {
  const type = req.params.type === 'album' ? 'album' : 'track';
  res.json({
    rating: getRating(req.user.id, type, req.params.id),
    community: communityStats(type, req.params.id)
  });
}));

/* --- избранное ------------------------------------------------------------- */

api.get('/favorites', wrap(async (req, res) => {
  res.json({ items: listFavorites(req.user.id, req.query.type) });
}));

api.post('/favorites', wrap(async (req, res) => {
  res.json(toggleFavorite(req.user.id, req.body || {}));
}));

api.delete('/favorites/:type/:id', wrap(async (req, res) => {
  db.prepare('DELETE FROM favorites WHERE user_id = ? AND item_type = ? AND item_id = ?')
    .run(req.user.id, req.params.type, String(req.params.id));
  res.json({ favorite: false });
}));

/* --- профиль, статистика, рейтинги ---------------------------------------- */

api.get('/profile', wrap(async (req, res) => {
  const targetId = req.query.userId ? toInt(req.query.userId, req.user.id) : req.user.id;
  const target = getUser(targetId);
  if (!target) return res.status(404).json({ error: 'user_not_found' });

  res.json({
    user: {
      id: target.id,
      name: displayName(target),
      username: target.username,
      photo: target.photo_url,
      bio: target.bio,
      createdAt: target.created_at,
      isSelf: target.id === req.user.id
    },
    stats: userStats(target.id),
    collections: listCollections(target.id).filter((c) => target.id === req.user.id || c.isPublic)
  });
}));

api.get('/leaderboard', wrap(async (req, res) => {
  res.json({
    tracks: leaderboard({ type: 'track', limit: toInt(req.query.limit, 30), period: req.query.period || 'all' }),
    albums: leaderboard({ type: 'album', limit: toInt(req.query.limit, 30), period: req.query.period || 'all' }),
    users: userLeaderboard(15)
  });
}));

api.get('/users', wrap(async (req, res) => {
  const query = String(req.query.q || '').trim();
  if (!query) {
    return res.json({ items: userLeaderboard(15).map((u) => ({ id: u.id, name: u.name, username: u.username, photo: u.photo, ratings: u.ratings })) });
  }
  res.json({ items: searchUsers(query, req.user.id) });
}));

api.get('/compare/:userId', wrap(async (req, res) => {
  res.json(compareUsers(req.user.id, toInt(req.params.userId, 0)));
}));

/* --- коллекции ------------------------------------------------------------- */

api.get('/collections', wrap(async (req, res) => {
  res.json({ items: listCollections(req.user.id) });
}));

api.post('/collections', wrap(async (req, res) => {
  res.json({ collection: createCollection(req.user.id, req.body || {}) });
}));

api.get('/collections/:id', wrap(async (req, res) => {
  res.json({ collection: getCollection(req.user.id, req.params.id) });
}));

api.patch('/collections/:id', wrap(async (req, res) => {
  res.json({ collection: updateCollection(req.user.id, req.params.id, req.body || {}) });
}));

api.delete('/collections/:id', wrap(async (req, res) => {
  res.json({ deleted: deleteCollection(req.user.id, req.params.id) });
}));

api.post('/collections/:id/items', wrap(async (req, res) => {
  res.json({ collection: addCollectionItem(req.user.id, req.params.id, req.body || {}) });
}));

api.delete('/collections/:id/items/:itemId', wrap(async (req, res) => {
  res.json({ collection: removeCollectionItem(req.user.id, req.params.id, req.params.itemId) });
}));

/* --- Spotify --------------------------------------------------------------- */

api.get('/spotify/status', wrap(async (req, res) => {
  res.json(spotify.status(req.user.id));
}));

api.post('/spotify/auth-url', wrap(async (req, res) => {
  if (!CFG.spotifyEnabled) return res.status(400).json({ error: 'spotify_disabled' });
  res.json({ url: spotify.authUrl(req.user.id) });
}));

api.post('/spotify/disconnect', wrap(async (req, res) => {
  spotify.disconnect(req.user.id);
  res.json({ connected: false });
}));

api.get('/spotify/playlists', wrap(async (req, res) => {
  const data = await spotify.api(req.user.id, '/me/playlists?limit=50');
  res.json({
    items: (data.items || []).map(spotify.normPlaylist),
    total: toInt(data.total, 0)
  });
}));

api.get('/spotify/playlists/:id/tracks', wrap(async (req, res) => {
  const limit = Math.min(50, toInt(req.query.limit, 30));
  const offset = Math.max(0, toInt(req.query.offset, 0));
  const data = await spotify.api(
    req.user.id,
    `/playlists/${req.params.id}/tracks?limit=${limit}&offset=${offset}&fields=total,items(track(id,name,artists(name),album(name,images),duration_ms,explicit,external_urls,external_ids))`
  );

  const items = [];
  for (const entry of data.items || []) {
    const spTrack = spotify.normTrack(entry.track);
    if (!spTrack) continue;
    const deezer = await matchSpotifyToDeezer(spTrack);
    const rating = deezer ? getRating(req.user.id, 'track', deezer.id) : null;
    items.push({
      spotify: spTrack,
      deezer,
      matched: Boolean(deezer),
      preview: deezer ? deezer.preview : null,
      myScore: rating ? rating.final : null,
      myTier: rating ? rating.tier : null
    });
  }

  res.json({ items, total: toInt(data.total, items.length), offset, limit });
}));

api.get('/spotify/top-tracks', wrap(async (req, res) => {
  const data = await spotify.api(req.user.id, '/me/top/tracks?limit=25&time_range=medium_term');
  const items = [];
  for (const raw of data.items || []) {
    const spTrack = spotify.normTrack(raw);
    if (!spTrack) continue;
    const deezer = await matchSpotifyToDeezer(spTrack);
    items.push({ spotify: spTrack, deezer, matched: Boolean(deezer) });
  }
  res.json({ items });
}));

/** Импорт плейлиста Spotify в коллекцию Dreinn (синхронизация). */
api.post('/spotify/import', wrap(async (req, res) => {
  const playlistId = String((req.body && req.body.playlistId) || '').trim();
  if (!playlistId) return res.status(400).json({ error: 'playlist_id_required' });

  const playlist = spotify.normPlaylist(await spotify.api(req.user.id, `/playlists/${playlistId}?fields=id,name,description,images,owner,public,tracks(total)`));

  let collection = db.prepare("SELECT * FROM collections WHERE user_id = ? AND source = 'spotify' AND source_id = ?")
    .get(req.user.id, playlistId);

  if (!collection) {
    const created = createCollection(req.user.id, {
      name: playlist.name,
      description: playlist.description || 'Импортировано из Spotify',
      icon: 'spotify',
      source: 'spotify',
      sourceId: playlistId
    });
    collection = { id: created.id };
  }

  let matched = 0;
  let skipped = 0;
  let offset = 0;

  while (offset < Math.min(playlist.trackCount || 0, 200)) {
    const data = await spotify.api(
      req.user.id,
      `/playlists/${playlistId}/tracks?limit=50&offset=${offset}&fields=items(track(id,name,artists(name),album(name,images),duration_ms,external_ids,external_urls))`
    );
    const entries = data.items || [];
    if (!entries.length) break;

    for (const entry of entries) {
      const spTrack = spotify.normTrack(entry.track);
      if (!spTrack) continue;
      const deezer = await matchSpotifyToDeezer(spTrack);
      if (!deezer) {
        skipped += 1;
        continue;
      }
      addCollectionItem(req.user.id, collection.id, {
        type: 'track',
        itemId: deezer.id,
        title: deezer.title,
        artist: deezer.artist,
        artistId: deezer.artistId,
        cover: deezer.cover,
        preview: deezer.preview,
        link: deezer.link
      });
      matched += 1;
    }
    offset += entries.length;
  }

  logEvent(req.user.id, 'spotify_import', { playlistId, matched, skipped });
  res.json({ collection: getCollection(req.user.id, collection.id), matched, skipped, playlist });
}));

/** Экспорт коллекции / любимого в новый плейлист Spotify. */
api.post('/spotify/export', wrap(async (req, res) => {
  const body = req.body || {};
  const account = db.prepare('SELECT spotify_id FROM spotify_accounts WHERE user_id = ?').get(req.user.id);
  if (!account) return res.status(400).json({ error: 'spotify_not_connected' });

  let tracks = [];
  let name = String(body.name || '').trim();

  if (body.collectionId) {
    const collection = getCollection(req.user.id, body.collectionId);
    tracks = collection.items.filter((i) => i.type === 'track');
    name = name || `${collection.name} · Dreinn`;
  } else if (body.source === 'favorites') {
    tracks = listFavorites(req.user.id, 'track');
    name = name || 'Любимое · Dreinn Music';
  } else {
    const min = toInt(body.minScore, 63);
    tracks = listRatings(req.user.id, { type: 'track', sort: 'best', limit: 100 }).items
      .filter((r) => r.final >= min)
      .map((r) => ({ title: r.title, artist: r.artist, itemId: r.itemId }));
    name = name || `Dreinn ${min}+ баллов`;
  }

  if (!tracks.length) return res.status(400).json({ error: 'nothing_to_export' });

  const uris = [];
  for (const track of tracks.slice(0, 100)) {
    try {
      const query = encodeURIComponent(`track:${track.title} artist:${track.artist || ''}`);
      const found = await spotify.api(req.user.id, `/search?q=${query}&type=track&limit=1`);
      const item = found.tracks && found.tracks.items && found.tracks.items[0];
      if (item && item.uri) uris.push(item.uri);
    } catch (err) {
      log.debug('spotify export search failed', err.message);
    }
  }

  if (!uris.length) return res.status(400).json({ error: 'no_matches' });

  const playlist = await spotify.api(req.user.id, `/users/${account.spotify_id}/playlists`, {
    method: 'POST',
    body: JSON.stringify({
      name: name.slice(0, 100),
      description: 'Синхронизировано из Dreinn Music',
      public: false
    })
  });

  for (let i = 0; i < uris.length; i += 100) {
    await spotify.api(req.user.id, `/playlists/${playlist.id}/tracks`, {
      method: 'POST',
      body: JSON.stringify({ uris: uris.slice(i, i + 100) })
    });
  }

  logEvent(req.user.id, 'spotify_export', { playlistId: playlist.id, count: uris.length });
  res.json({ playlist: spotify.normPlaylist(playlist), exported: uris.length, requested: tracks.length });
}));

app.use('/api', api);

/* --- webhook Telegram (регистрируется до статики и catch-all) ------------- */

app.post(CFG.webhookPath, (req, res) => {
  if (CFG.botMode !== 'webhook' || !CFG.botEnabled) return res.sendStatus(404);
  if (CFG.webhookSecret && req.get('X-Telegram-Bot-Api-Secret-Token') !== CFG.webhookSecret) {
    return res.sendStatus(403);
  }
  res.sendStatus(200);
  return handleUpdate(req.body || {});
});

/* --- OAuth callback (открывается в браузере) ------------------------------- */

function oauthPage({ title, message, ok }) {
  return `<!doctype html>
<html lang="ru"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${title}</title>
<script src="https://telegram.org/js/telegram-web-app.js"></script>
<style>
  :root { color-scheme: dark; }
  body { margin:0; min-height:100vh; display:grid; place-items:center; background:#0B0B0E; color:#F4F4F6;
         font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif; padding:24px; }
  .card { max-width:360px; text-align:center; background:#141419; border:1px solid #24242C; border-radius:28px; padding:32px 24px;
          box-shadow:0 18px 40px rgba(0,0,0,.45); }
  .dot { width:64px; height:64px; margin:0 auto 18px; border-radius:22px; display:grid; place-items:center;
         background:${ok ? '#1E2A22' : '#2A1E1E'}; border:1px solid ${ok ? '#2F4A3A' : '#4A2F2F'}; font-size:30px; }
  h1 { font-size:20px; margin:0 0 10px; letter-spacing:-0.02em; }
  p { margin:0 0 22px; color:#A0A0AC; font-size:14px; line-height:1.5; }
  button { width:100%; padding:14px 18px; border-radius:16px; border:0; cursor:pointer;
           background:#F4F4F6; color:#0B0B0E; font-size:15px; font-weight:600; }
</style></head>
<body><div class="card">
  <div class="dot">${ok ? '✓' : '!'}</div>
  <h1>${title}</h1>
  <p>${message}</p>
  <button onclick="if(window.Telegram&&Telegram.WebApp){Telegram.WebApp.close()}else{window.close()}">Вернуться в Dreinn Music</button>
</div>
<script>setTimeout(function(){ if (window.Telegram && Telegram.WebApp) { Telegram.WebApp.close(); } }, 2500);</script>
</body></html>`;
}

app.get('/spotify/callback', wrap(async (req, res) => {
  const { code, state, error } = req.query;

  if (error) {
    return res.status(400).send(oauthPage({ ok: false, title: 'Доступ не выдан', message: 'Spotify не выдал разрешение. Можно попробовать ещё раз из приложения.' }));
  }
  if (!code || !state) {
    return res.status(400).send(oauthPage({ ok: false, title: 'Некорректный запрос', message: 'Не хватает параметров авторизации.' }));
  }

  const row = db.prepare('SELECT * FROM oauth_states WHERE state = ?').get(String(state));
  if (!row || now() - row.created_at > 1800) {
    return res.status(400).send(oauthPage({ ok: false, title: 'Сессия истекла', message: 'Ссылка авторизации устарела — начни подключение заново.' }));
  }
  db.prepare('DELETE FROM oauth_states WHERE state = ?').run(String(state));

  try {
    const tokenData = await spotify.exchangeCode(String(code));
    const profile = await spotify.saveAccount(row.user_id, tokenData);
    logEvent(row.user_id, 'spotify_connected', { spotifyId: profile.id });

    if (CFG.botEnabled) {
      tg.sendMessage(row.user_id, [
        `${em('check')} <b>Spotify подключён</b>`,
        `Аккаунт: <b>${escapeHtml(profile.display_name || profile.id)}</b>`,
        '',
        `${em('headphones')} Плейлисты уже доступны в приложении.`
      ].join('\n'), { reply_markup: { inline_keyboard: [[webAppButton('Открыть плейлисты', 'spotify')]] } }).catch(() => null);
    }

    return res.send(oauthPage({
      ok: true,
      title: 'Spotify подключён',
      message: `Аккаунт ${profile.display_name || profile.id} привязан. Возвращайся в приложение — плейлисты уже там.`
    }));
  } catch (err) {
    log.error('spotify callback failed:', err.message);
    return res.status(500).send(oauthPage({ ok: false, title: 'Не получилось', message: 'Spotify отклонил обмен кода. Проверь настройки приложения и попробуй снова.' }));
  }
}));

/* --- служебное ------------------------------------------------------------- */

app.get('/healthz', (req, res) => {
  res.json({
    ok: true,
    app: 'dreinn-music',
    version: '1.0.0',
    uptime: Math.round(process.uptime()),
    bot: CFG.botEnabled ? CFG.botMode : 'disabled',
    spotify: CFG.spotifyEnabled,
    users: db.prepare('SELECT COUNT(*) AS c FROM users').get().c,
    ratings: db.prepare('SELECT COUNT(*) AS c FROM ratings').get().c
  });
});

app.use(express.static(path.join(__dirname, 'public'), {
  maxAge: '7d',
  setHeaders(res, filePath) {
    if (filePath.endsWith('.html')) res.setHeader('Cache-Control', 'no-cache');
  }
}));

app.get('*', (req, res, next) => {
  if (req.path.startsWith('/api/')) return next();
  return res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.use((req, res) => res.status(404).json({ error: 'not_found' }));

app.use((err, req, res, next) => { // eslint-disable-line no-unused-vars
  const status = err.status || (err.message === 'spotify_not_connected' ? 400 : 500);
  if (status >= 500) log.error('API error:', err.message);
  else log.debug('API warn:', err.message);
  res.status(status).json({ error: err.message || 'internal_error' });
});

/* =============================================================================
 * 12. СТАРТ
 * ========================================================================== */

async function bootstrap() {
  const banner = [
    '',
    '  ╭───────────────────────────────────────────╮',
    '  │            D R E I N N   M U S I C        │',
    '  │   многофакторная оценка музыки · 90 баллов│',
    '  ╰───────────────────────────────────────────╯',
    ''
  ].join('\n');
  console.log(banner);

  const server = app.listen(CFG.port, CFG.host, () => {
    log.info(`HTTP слушает ${CFG.host}:${CFG.port}`);
    log.info(`Публичный адрес: ${CFG.publicUrl}`);
    log.info(`База данных: ${path.resolve(CFG.dbPath)}`);
    log.info(`Spotify: ${CFG.spotifyEnabled ? 'включён (' + CFG.spotifyRedirectUri + ')' : 'выключен'}`);
    if (CFG.devMode) log.warn('DEV_MODE=true — Mini App доступен без Telegram initData');
  });

  if (!CFG.botEnabled) {
    log.warn('BOT_TOKEN не задан — бот выключен, работает только Mini App/API');
  } else {
    try {
      const me = await tg.api('getMe');
      tg.me = me.result;
      if (!CFG.botUsername && me.result) CFG.botUsername = me.result.username;
      log.info(`Бот: @${(me.result && me.result.username) || 'unknown'}`);
      await setupBotProfile();

      if (CFG.botMode === 'webhook') await startWebhook();
      else startPolling();
    } catch (err) {
      log.error('Не удалось запустить бота:', err.message);
    }
  }

  const shutdown = (signal) => {
    log.info(`${signal} — завершаю работу`);
    pollingAbort = true;
    server.close(() => {
      try {
        db.close();
      } catch {
        /* ignore */
      }
      process.exit(0);
    });
    setTimeout(() => process.exit(0), 5000).unref();
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('unhandledRejection', (reason) => log.error('unhandledRejection:', reason && reason.message ? reason.message : reason));
  process.on('uncaughtException', (err) => log.error('uncaughtException:', err.message));
}

bootstrap();

module.exports = {
  app,
  db,
  CFG,
  computeTrackScore,
  computeAlbumScore,
  tierFor,
  validateInitData,
  em,
  stripCustomEmoji,
  botText: { welcomeText, helpText, scoringText, profileText, statsText, topText, ratingCardText }
};
