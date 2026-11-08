/**
 * KGEU Schedule Bot — Cloudflare Worker
 * Расписание + выбор группы + уведомления (напоминания / замены)
 *
 * Bindings:
 *   KGEU_SCHEDULE  — KV namespace
 * Secrets:
 *   BOT_TOKEN      — Telegram Bot token
 *
 * Cron Trigger: каждую минуту
 */

const API_RASP = 'https://kabinet.kgeu.ru/api/Rasp';
const API_GROUPS = 'https://kabinet.kgeu.ru/api/raspGrouplist?year=2026-2027';
const MINI_APP_URL = 'https://mitrofanovdaniil53-max.github.io/kgeu-telegram-miniapp/';
const YEAR = '2026-2027';
const REMINDER_MINUTES = 15;
const TZ = 'Europe/Moscow';

// ──────────────────── Moscow time helpers ────────────────────

function moscowParts(date = new Date()) {
  const fmt = new Intl.DateTimeFormat('en-GB', {
    timeZone: TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
    weekday: 'short',
  });

  const parts = {};

  for (const p of fmt.formatToParts(date)) {
    if (p.type !== 'literal') {
      parts[p.type] = p.value;
    }
  }

  return {
    year: Number(parts.year),
    month: Number(parts.month),
    day: Number(parts.day),
    hour: Number(parts.hour === '24' ? '0' : parts.hour),
    minute: Number(parts.minute),
    second: Number(parts.second),
    weekday: parts.weekday,
  };
}

function moscowDateStr(date = new Date()) {
  const p = moscowParts(date);

  return `${p.year}-${String(p.month).padStart(2, '0')}-${String(p.day).padStart(2, '0')}`;
}

function moscowMinutes(date = new Date()) {
  const p = moscowParts(date);
  return p.hour * 60 + p.minute;
}

function addDaysMoscow(dateStr, days) {
  const [y, m, d] = dateStr.split('-').map(Number);

  const utc = Date.UTC(y, m - 1, d + days);
  const dt = new Date(utc);

  const yy = dt.getUTCFullYear();
  const mm = String(dt.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(dt.getUTCDate()).padStart(2, '0');

  return `${yy}-${mm}-${dd}`;
}

function parseTimeMinutes(t) {
  if (!t) return null;

  const [h, m] = t.split(':').map(Number);

  if (Number.isNaN(h) || Number.isNaN(m)) {
    return null;
  }

  return h * 60 + m;
}

function formatRuDate(dateStr) {
  const [y, m, d] = dateStr.split('-');

  const months = [
    'января',
    'февраля',
    'марта',
    'апреля',
    'мая',
    'июня',
    'июля',
    'августа',
    'сентября',
    'октября',
    'ноября',
    'декабря'
  ];

  return `${d} ${months[Number(m) - 1]}`;
}

// ──────────────────── Telegram API ────────────────────

async function tg(env, method, body) {
  const res = await fetch(
    `https://api.telegram.org/bot${env.BOT_TOKEN}/${method}`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(body),
    }
  );

  const data = await res.json().catch(() => ({}));

  if (!data.ok) {
    console.error('Telegram error', method, data);
  }

  return data;
}

async function sendMessage(env, chatId, text, extra = {}) {
  return tg(env, 'sendMessage', {
    chat_id: chatId,
    text,
    parse_mode: 'HTML',
    disable_web_page_preview: true,
    ...extra,
  });
}

async function editMessage(env, chatId, messageId, text, extra = {}) {
  return tg(env, 'editMessageText', {
    chat_id: chatId,
    message_id: messageId,
    text,
    parse_mode: 'HTML',
    disable_web_page_preview: true,
    ...extra,
  });
}

async function answerCallback(env, id, text) {
  return tg(env, 'answerCallbackQuery', {
    callback_query_id: id,
    text: text || '',
    show_alert: false,
  });
}

// ──────────────────── KV helpers ────────────────────

function userKey(telegramId) {
  return `user:${telegramId}`;
}

function notifKey(telegramId, lessonCode, type) {
  return `notification:${telegramId}:${lessonCode}:${type}`;
}

function replacementKey(telegramId, lessonCode) {
  return `replacement:${telegramId}:${lessonCode}`;
}

async function getUser(env, telegramId) {
  const key = userKey(telegramId);

  try {
    const raw = await env.KGEU_SCHEDULE.get(key);

    if (!raw) {
      // Пробуем миграцию из старой структуры
      return await migrateLegacyUser(env, telegramId);
    }

    const user = JSON.parse(raw);

    if (!user || !user.telegramId) {
      console.error('Invalid user data in KV:', key, raw);
      return null;
    }

    return user;

  } catch (e) {
    console.error('getUser error:', key, e);
    return null;
  }
}

async function saveUser(env, user) {
  const key = userKey(user.telegramId);

  const data = {
    telegramId: user.telegramId,

    username: user.username || null,
    firstName: user.firstName || null,
    groupId: user.groupId != null ? Number(user.groupId) : null,
    groupName: user.groupName || null,
    course: user.course != null ? user.course : null,
    faculty: user.faculty || null,
    facultyId: user.facultyId != null ? user.facultyId : null,
    notifications: user.notifications !== false,
    dailyNotifications: user.dailyNotifications !== false,
    reminderNotifications: user.reminderNotifications !== false,
    changeNotifications: user.changeNotifications !== false,
    createdAt: user.createdAt || Date.now()
  };

  const json = JSON.stringify(data);

  // Сохраняем
  await env.KGEU_SCHEDULE.put(key, json);

  // Проверка записи
  const savedRaw = await env.KGEU_SCHEDULE.get(key);
  if (!savedRaw) {
    throw new Error(`KV save verification failed: ${key}`);
  }

  const savedUser = JSON.parse(savedRaw);

  if (
    data.groupId != null &&
    Number(savedUser.groupId) !== Number(data.groupId)
  ) {
    throw new Error(`KV group verification failed: expected ${data.groupId}, got ${savedUser.groupId}`);
  }

  return savedUser;
}

// ──────────────────── Legacy migration (добавлено) ────────────────────
async function migrateLegacyUser(env, telegramId) {
  const legacyGroupKey = `user:${telegramId}:group`;
  const legacyNotifyKey = `user:${telegramId}:notify`;

  const legacyGroupRaw = await env.KGEU_SCHEDULE.get(legacyGroupKey);
  const legacyNotifyRaw = await env.KGEU_SCHEDULE.get(legacyNotifyKey);

  if (!legacyGroupRaw) {
    return null;
  }

  try {
    const group = JSON.parse(legacyGroupRaw);

    const user = {
      telegramId,
      username: null,
      firstName: null,
      groupId: group && group.id ? Number(group.id) : null,
      groupName: group && group.name ? group.name : null,
      course: group && group.kurs != null ? group.kurs : null,
      faculty: group && group.facul ? group.facul : null,
      facultyId: group && group.facultyID != null ? group.facultyID : null,
      notifications: legacyNotifyRaw === null ? true : legacyNotifyRaw === '1',
      dailyNotifications: true,
      reminderNotifications: true,
      changeNotifications: true,
      createdAt: Date.now()
    };

    await saveUser(env, user);

    // Удаляем старые ключи
    await env.KGEU_SCHEDULE.delete(legacyGroupKey);
    await env.KGEU_SCHEDULE.delete(legacyNotifyKey);

    return user;
  } catch (e) {
    console.error('Legacy migration error:', e);
    return null;
  }
}

async function listUsers(env) {
  const users = [];
  let cursor;

  do {
    const page = await env.KGEU_SCHEDULE.list({
      prefix: 'user:',
      cursor,
      limit: 1000
    });

    for (const key of page.keys) {
      const raw = await env.KGEU_SCHEDULE.get(key.name);

      if (!raw) {
        continue;
      }

      try {
        const u = JSON.parse(raw);

        if (u && u.telegramId) {
          users.push(u);
        }
      } catch {
        // skip invalid records
      }
    }

    cursor = page.list_complete
      ? undefined
      : page.cursor;

  } while (cursor);

  return users;
}

async function wasSent(env, key) {
  return !!(await env.KGEU_SCHEDULE.get(key));
}

async function markSent(
  env,
  key,
  ttlSeconds = 60 * 60 * 36
) {
  await env.KGEU_SCHEDULE.put(
    key,
    '1',
    {
      expirationTtl: ttlSeconds
    }
  );
}

// ──────────────────── Groups API ────────────────────

let groupsCache = null;
let groupsCacheAt = 0;

async function loadGroups() {
  const now = Date.now();

  if (
    groupsCache &&
    now - groupsCacheAt < 6 * 60 * 60 * 1000
  ) {
    return groupsCache;
  }

  const res = await fetch(API_GROUPS);

  if (!res.ok) {
    throw new Error('groups API ' + res.status);
  }

  const data = await res.json();

  const list = (data && data.data) || [];

  groupsCache = list;
  groupsCacheAt = now;

  return list;
}

function uniqueFaculties(groups) {
  const set = new Set();

  for (const g of groups) {
    if (g.facul) {
      set.add(g.facul);
    }
  }

  return Array.from(set).sort();
}

function coursesForFaculty(groups, faculty) {
  const set = new Set();

  for (const g of groups) {
    if (
      g.facul === faculty &&
      g.kurs != null
    ) {
      set.add(g.kurs);
    }
  }

  return Array.from(set).sort(
    (a, b) => a - b
  );
}

function groupsFor(groups, faculty, course) {
  return groups
    .filter(
      (g) =>
        g.facul === faculty &&
        g.kurs === course
    );
}

// ──────────────────── Schedule API ────────────────────

async function fetchSchedule(groupId, sdate) {
  const url =
    `${API_RASP}` +
    `?idGroup=${encodeURIComponent(groupId)}` +
    `&sdate=${encodeURIComponent(sdate)}`;

  const res = await fetch(url);

  if (!res.ok) {
    throw new Error(
      'rasp API ' + res.status
    );
  }

  const data = await res.json();

  return (
    data &&
    data.data &&
    data.data.rasp
  ) || [];
}

function cleanSubject(disc) {
  return String(disc || '')
    .replace(
      /^(лек|пр|лаб|практ)\s+/i,
      ''
    )
    .trim();
}

function typeLabel(disc) {
  const m = String(disc || '')
    .match(
      /^(лек|пр|лаб|практ)/i
    );

  if (!m) {
    return '';
  }

  const t = m[1].toLowerCase();

  if (t === 'лек') {
    return 'Лекция';
  }

  if (
    t === 'пр' ||
    t === 'практ'
  ) {
    return 'Практика';
  }

  if (t === 'лаб') {
    return 'Лаба';
  }

  return '';
}

function lessonCode(lesson) {
  return lesson['код'] != null
    ? String(lesson['код'])
    : `${lesson['дата']}|${lesson['начало']}|${lesson['дисциплина']}`;
}

// ──────────────────── Keyboards ────────────────────

function mainKeyboard(user) {
  const rows = [
    [
      {
        text: '📅 Расписание',
        callback_data: 'menu:schedule'
      }
    ],
    [
      {
        text: '🌐 Открыть Mini App',
        web_app: {
          url: miniAppUrl(user)
        }
      }
    ],
    [
      {
        text: '🔔 Уведомления',
        callback_data: 'menu:notify'
      }
    ],
    [
      {
        text: '👥 Сменить группу',
        callback_data: 'menu:group'
      }
    ],
  ];

  return {
    inline_keyboard: rows
  };
}

function miniAppUrl(user) {
  if (
    user &&
    user.groupId
  ) {
    return `${MINI_APP_URL}?groupId=${user.groupId}`;
  }

  return MINI_APP_URL;
}

function notifyKeyboard(user) {
  const mark = (value) => value === false ? '⬜' : '✅';
  return {
    inline_keyboard: [
      [
        { text: '✅ Включить всё', callback_data: 'notify:on' },
        { text: '⏸ Выключить всё', callback_data: 'notify:off' }
      ],
      [{ text: mark(user.dailyNotifications) + ' 07:00 — расписание', callback_data: 'notify:daily' }],
      [{ text: mark(user.reminderNotifications) + ' За 15 минут до пары', callback_data: 'notify:reminder' }],
      [{ text: mark(user.changeNotifications) + ' Изменения / замены', callback_data: 'notify:change' }],
      [{ text: '📊 Статус', callback_data: 'notify:status' }],
      [{ text: '« Назад', callback_data: 'menu:home' }]
    ]
  };
}
function facultiesKeyboard(faculties) {
  const rows =
    faculties.map(
      (f) => [
        {
          text: f,
          callback_data: `fac:${f}`
        }
      ]
    );

  rows.push([
    {
      text: '« Отмена',
      callback_data: 'menu:home'
    }
  ]);

  return {
    inline_keyboard: rows
  };
}

function coursesKeyboard(
  faculty,
  courses
) {
  const rows =
    courses.map(
      (c) => [
        {
          text: `${c} курс`,
          callback_data:
            `course:${faculty}:${c}`
        }
      ]
    );

  rows.push([
    {
      text: '« Назад',
      callback_data:
        'menu:group'
    }
  ]);

  return {
    inline_keyboard: rows
  };
}

function groupsKeyboard(
  faculty,
  course,
  groups
) {
  const rows = [];

  const slice =
    groups.slice(0, 80);

  for (
    let i = 0;
    i < slice.length;
    i += 2
  ) {
    const row = [
      {
        text: slice[i].name,
        callback_data:
          `grp:${slice[i].id}`
      }
    ];

    if (slice[i + 1]) {
      row.push({
        text:
          slice[i + 1].name,
          callback_data:
            `grp:${slice[i + 1].id}`
      });
    }

    rows.push(row);
  }

  rows.push([
    {
      text: '« Назад',
      callback_data:
        `fac:${faculty}`
    }
  ]);

  return {
    inline_keyboard: rows
  };
}

// ──────────────────── Text builders ────────────────────

function welcomeText(user) {
  if (
    user &&
    user.groupId
  ) {
    return (
      `Привет! 👋\n\n` +
      `Твоя группа: <b>${esc(user.groupName)}</b>\n` +
      `Уведомления: <b>${
        user.notifications !== false
          ? 'включены'
          : 'выключены'
      }</b>\n\n` +
      `Открой Mini App или посмотри расписание кнопками ниже.`
    );
  }

  return (
    `Привет! 👋\n\n` +
    `Это бот расписания КГЭУ.\n` +
    `Сначала выбери свою группу — после этого откроется расписание и уведомления.`
  );
}

function notifyStatusText(user) {
  const master = user && user.notifications !== false;
  const state = (value) => master && value !== false ? 'включено' : 'выключено';
  return (
    '🔔 <b>Уведомления</b>\\n\\n' +
    '07:00 — расписание: <b>' + state(user.dailyNotifications) + '</b>\\n' +
    'За 15 минут до пары: <b>' + state(user.reminderNotifications) + '</b>\\n' +
    'Изменения / замены: <b>' + state(user.changeNotifications) + '</b>\\n\\n' +
    'Часовой пояс: ' + TZ
  );
}
function formatDaySchedule(
  lessons,
  dateStr
) {
  if (!lessons.length) {
    return `На ${formatRuDate(dateStr)} пар нет.`;
  }

  const lines =
    lessons.map(
      (l, i) => {
        const subj =
          cleanSubject(
            l['дисциплина']
          );

        const room =
          (l['аудитория'] || '')
            .trim();

        const teacher =
          (
            l['фиоПреподавателя'] ||
            l['преподаватель'] ||
            ''
          ).trim();

        const repl =
          l['замена']
            ? ' ⚠️замена'
            : '';

        return (
          `${i + 1}. ` +
          `<b>${esc(l['начало'])}–${esc(l['конец'])}</b> ` +
          `${esc(subj)}${repl}` +
          (
            room
              ? `\n   📍 ${esc(room)}`
              : ''
          ) +
          (
            teacher
              ? `\n   👨‍🏫 ${esc(teacher)}`
              : ''
          )
        );
      }
    );

  return (
    `📅 <b>${formatRuDate(dateStr)}</b>\n\n` +
    lines.join('\n\n')
  );
}

function esc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

// ──────────────────── Mini App user authentication ────────────────────

function bytesToHex(bytes) {
  return Array.from(
    new Uint8Array(bytes)
  )
    .map(
      (b) =>
        b.toString(16)
          .padStart(2, '0')
    )
    .join('');
}

async function hmacSha256(
  keyBytes,
  message
) {
  const key =
    await crypto.subtle.importKey(
      'raw',
      keyBytes,
      {
        name: 'HMAC',
        hash: 'SHA-256'
      },
      false,
      ['sign']
    );

  return crypto.subtle.sign(
    'HMAC',
    key,
    new TextEncoder().encode(
      message
    )
  );
}

async function validateTelegramInitData(
  initData,
  botToken
) {
  if (
    !initData ||
    !botToken
  ) {
    return null;
  }

  const params =
    new URLSearchParams(
      initData
    );

  const receivedHash =
    params.get('hash');

  if (!receivedHash) {
    return null;
  }

  const pairs = [];

  for (
    const [key, value]
    of params.entries()
  ) {
    if (key !== 'hash') {
      pairs.push(
        `${key}=${value}`
      );
    }
  }

  pairs.sort();

  const dataCheckString =
    pairs.join('\n');

  const secretKey =
    await hmacSha256(
      new TextEncoder().encode(
        'WebAppData'
      ),
      botToken
    );

  const calculated =
    bytesToHex(
      await hmacSha256(
        secretKey,
        dataCheckString
      )
    );

  if (
    calculated.length !==
    receivedHash.length
  ) {
    return null;
  }

  let diff = 0;

  for (
    let i = 0;
    i < calculated.length;
    i++
  ) {
    diff |=
      calculated.charCodeAt(i) ^
      receivedHash.charCodeAt(i);
  }

  if (diff !== 0) {
    return null;
  }

  const authDate =
    Number(
      params.get('auth_date') || 0
    );

  if (
    !authDate ||
    Math.abs(
      Date.now() / 1000 -
      authDate
    ) > 24 * 60 * 60
  ) {
    return null;
  }

  let tgUser = null;

  try {
    tgUser =
      JSON.parse(
        params.get('user') ||
        'null'
      );
  } catch {}

  if (
    !tgUser ||
    !tgUser.id
  ) {
    return null;
  }

  return tgUser;
}

async function handleMiniAppReminders(request, env) {
  const initData = request.headers.get('X-Telegram-Init-Data') || '';
  const tgUser = await validateTelegramInitData(initData, env.BOT_TOKEN);
  const headers = { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' };
  if (!tgUser) return new Response(JSON.stringify({ ok: false, error: 'invalid_init_data' }), { status: 401, headers: headers });
  const prefix = 'personal-reminder:' + tgUser.id + ':';
  if (request.method === 'GET') {
    const page = await env.KGEU_SCHEDULE.list({ prefix: prefix, limit: 100 });
    const reminders = [];
    for (const key of page.keys) { const raw = await env.KGEU_SCHEDULE.get(key.name); if (!raw) continue; try { reminders.push(JSON.parse(raw)); } catch {} }
    reminders.sort((a, b) => a.eventAt - b.eventAt);
    return new Response(JSON.stringify({ ok: true, reminders: reminders }), { status: 200, headers: headers });
  }
  if (request.method !== 'POST') return new Response(JSON.stringify({ ok: false, error: 'method_not_allowed' }), { status: 405, headers: headers });
  let payload; try { payload = await request.json(); } catch { return new Response(JSON.stringify({ ok: false, error: 'invalid_json' }), { status: 400, headers: headers }); }
  if (payload.action === 'delete') {
    const id = String(payload.id || '');
    if (!/^[a-f0-9-]{36}$/i.test(id)) return new Response(JSON.stringify({ ok: false, error: 'invalid_id' }), { status: 400, headers: headers });
    await env.KGEU_SCHEDULE.delete(prefix + id);
    return new Response(JSON.stringify({ ok: true }), { status: 200, headers: headers });
  }
  const title = String(payload.title || '').trim().slice(0, 120);
  const eventAt = Number(payload.eventAt);
  const leadMinutes = Number(payload.leadMinutes);
  const now = Date.now();
  if (!title || !Number.isFinite(eventAt) || eventAt <= now || eventAt > now + 366 * 86400000 || ![0, 15, 60, 1440].includes(leadMinutes)) return new Response(JSON.stringify({ ok: false, error: 'invalid_reminder' }), { status: 400, headers: headers });
  const user = await getUser(env, tgUser.id);
  if (!user) return new Response(JSON.stringify({ ok: false, error: 'start_bot_first' }), { status: 409, headers: headers });
  const id = crypto.randomUUID();
  const item = { id: id, title: title, eventAt: eventAt, leadMinutes: leadMinutes, sendAt: eventAt - leadMinutes * 60000, createdAt: now };
  await env.KGEU_SCHEDULE.put(prefix + id, JSON.stringify(item), { expirationTtl: Math.max(3600, Math.ceil((eventAt - now) / 1000) + 86400) });
  return new Response(JSON.stringify({ ok: true, reminder: item }), { status: 201, headers: headers });
}

async function runPersonalRemindersJob(env, now = Date.now()) {
  let cursor;
  do {
    const page = await env.KGEU_SCHEDULE.list({ prefix: 'personal-reminder:', cursor: cursor, limit: 1000 });
    for (const key of page.keys) {
      const raw = await env.KGEU_SCHEDULE.get(key.name); if (!raw) continue;
      let item; try { item = JSON.parse(raw); } catch { await env.KGEU_SCHEDULE.delete(key.name); continue; }
      if (!item || !Number.isFinite(Number(item.sendAt)) || Number(item.sendAt) > now) continue;
      if (Number(item.eventAt) + 5 * 60000 < now) { await env.KGEU_SCHEDULE.delete(key.name); continue; }
      const userId = key.name.split(':')[1];
      const result = await sendMessage(env, userId, '⏰ <b>Напоминание</b>\\n\\n' + esc(item.title) + '\\n\\nСобытие: ' + new Date(item.eventAt).toLocaleString('ru-RU', { timeZone: TZ }));
      if (result && result.ok) await env.KGEU_SCHEDULE.delete(key.name);
    }
    cursor = page.list_complete ? undefined : page.cursor;
  } while (cursor);
}

async function runDailyScheduleNotifications(env, now = new Date()) {
  const parts = moscowParts(now);
  if (parts.hour !== 7 || parts.minute !== 0) return;
  const date = moscowDateStr(now);
  const users = await listUsers(env);
  const byGroup = new Map();
  for (const user of users) {
    if (!user.groupId || user.notifications === false || user.dailyNotifications === false) continue;
    const groupId = String(user.groupId);
    if (!byGroup.has(groupId)) byGroup.set(groupId, []);
    byGroup.get(groupId).push(user);
  }
  for (const [groupId, groupUsers] of byGroup) {
    let lessons;
    try { lessons = await fetchSchedule(Number(groupId), date); } catch (e) { console.error('daily schedule fetch failed', groupId, e); continue; }
    const scheduleText = formatDaySchedule(lessons.filter(l => String(l['дата'] || '').slice(0, 10) === date), date);
    for (const user of groupUsers) {
      const key = 'daily:' + user.telegramId + ':' + date;
      if (await wasSent(env, key)) continue;
      const result = await sendMessage(env, user.telegramId, '🌅 <b>Расписание на сегодня</b>\\n\\n' + scheduleText);
      if (result && result.ok) await markSent(env, key, 3 * 24 * 60 * 60);
    }
  }
}

async function handleMiniAppMe(
  request,
  env
) {
  const initData =
    request.headers.get(
      'X-Telegram-Init-Data'
    ) || '';

  const tgUser =
    await validateTelegramInitData(
      initData,
      env.BOT_TOKEN
    );

  if (!tgUser) {
    return new Response(
      JSON.stringify({
        ok: false,
        error:
          'invalid_init_data'
      }),
      {
        status: 401,
        headers: {
          'Content-Type':
            'application/json',
          'Cache-Control':
            'no-store'
        }
      }
    );
  }

  const user =
    await getUser(
      env,
      tgUser.id
    );

  return new Response(
    JSON.stringify({
      ok: true,
      telegramId: tgUser.id,
      groupId:
        user &&
        user.groupId
          ? user.groupId
          : null,
      groupName:
        user &&
        user.groupName
          ? user.groupName
          : null,
    }),
    {
      status: 200,
      headers: {
        'Content-Type':
          'application/json',
        'Cache-Control':
          'no-store'
      }
    }
  );
}

// ──────────────────── Command / callback handlers ────────────────────

async function ensureUser(
  env,
  from
) {
  let user =
    await getUser(
      env,
      from.id
    );

  if (!user) {
    user = {
      telegramId:
        from.id,

      username:
        from.username ||
        null,

      firstName:
        from.first_name ||
        null,

      groupId: null,
      groupName: null,
      course: null,
      faculty: null,
      facultyId: null,

      notifications: true,
      dailyNotifications: true,
      reminderNotifications: true,
      changeNotifications: true,

      createdAt:
        Date.now(),
    };

    await saveUser(
      env,
      user
    );
  }

  return user;
}

async function handleStart(
  env,
  msg
) {
  const user =
    await ensureUser(
      env,
      msg.from
    );

  if (!user.groupId) {
    await sendMessage(
      env,
      msg.chat.id,
      welcomeText(user),
      {
        reply_markup: {
          inline_keyboard: [
            [
              {
                text:
                  '👥 Выбрать группу',
                callback_data:
                  'menu:group'
              }
            ]
          ]
        }
      }
    );

    return;
  }

  await sendMessage(
    env,
    msg.chat.id,
    welcomeText(user),
    {
      reply_markup:
        mainKeyboard(user)
    }
  );
}

async function handleSchedule(
  env,
  chatId,
  user
) {
  if (!user.groupId) {
    await sendMessage(
      env,
      chatId,
      'Сначала выбери группу.',
      {
        reply_markup: {
          inline_keyboard: [
            [
              {
                text:
                  '👥 Выбрать группу',
                callback_data:
                  'menu:group'
              }
            ]
          ]
        }
      }
    );

    return;
  }

  try {
    const today =
      moscowDateStr();

    const lessons =
      await fetchSchedule(
        user.groupId,
        today
      );

    const todayLessons =
      lessons
        .filter(
          (l) =>
            (
              l['дата'] || ''
            ).slice(0, 10) ===
            today
        )
        .sort(
          (a, b) =>
            String(
              a['начало']
            ).localeCompare(
              String(
                b['начало']
              )
            )
        );

    const text =
      `Группа <b>${esc(user.groupName)}</b>\n\n` +
      formatDaySchedule(
        todayLessons,
        today
      ) +
      `\n\nПолное расписание — в Mini App.`;

    await sendMessage(
      env,
      chatId,
      text,
      {
        reply_markup: {
          inline_keyboard: [
            [
              {
                text:
                  '🌐 Mini App',
                web_app: {
                  url:
                    miniAppUrl(user)
                }
              }
            ],
            [
              {
                text:
                  '🔔 Уведомления',
                callback_data:
                  'menu:notify'
              }
            ],
            [
              {
                text:
                  '« Меню',
                callback_data:
                  'menu:home'
              }
            ]
          ]
        }
      }
    );

  } catch (e) {
    console.error(
      'schedule error',
      e
    );

    await sendMessage(
      env,
      chatId,
      'Не удалось загрузить расписание. Попробуй позже.'
    );
  }
}

async function handleNotifyOn(
  env,
  chatId,
  user
) {
  user.notifications = true;

  await saveUser(
    env,
    user
  );

  await sendMessage(
    env,
    chatId,
    '✅ Уведомления включены.\nНапоминание: за 15 минут до пары.',
    {
      reply_markup:
        notifyKeyboard(user)
    }
  );
}

async function handleNotifyOff(
  env,
  chatId,
  user
) {
  user.notifications = false;

  await saveUser(
    env,
    user
  );

  await sendMessage(
    env,
    chatId,
    '❌ Уведомления выключены.',
    {
      reply_markup:
        notifyKeyboard(user)
    }
  );
}

async function handleNotifyStatus(
  env,
  chatId,
  user
) {
  await sendMessage(
    env,
    chatId,
    notifyStatusText(user),
    {
      reply_markup:
        notifyKeyboard(user)
    }
  );
}

// ──────────────────── handleCallback (исправлено) ────────────────────

async function handleCallback(
  env,
  cq
) {
  const data =
    cq.data || '';

  const chatId =
    cq.message.chat.id;

  const messageId =
    cq.message.message_id;

  const user =
    await ensureUser(
      env,
      cq.from
    );

  await answerCallback(
    env,
    cq.id
  );

  if (
    data === 'menu:home'
  ) {
    await editMessage(
      env,
      chatId,
      messageId,
      welcomeText(user),
      {
        reply_markup:
          user.groupId
            ? mainKeyboard(user)
            : {
                inline_keyboard: [
                  [
                    {
                      text:
                        '👥 Выбрать группу',
                      callback_data:
                        'menu:group'
                    }
                  ]
                ]
              }
      }
    );

    return;
  }

  if (
    data === 'menu:schedule'
  ) {
    await handleSchedule(
      env,
      chatId,
      user
    );

    return;
  }

  if (
    data === 'menu:notify'
  ) {
    await editMessage(
      env,
      chatId,
      messageId,
      notifyStatusText(user),
      {
        reply_markup:
          notifyKeyboard(user)
    }
  );

  return;
}

if (['notify:daily', 'notify:reminder', 'notify:change'].includes(data)) {
    const field = data === 'notify:daily' ? 'dailyNotifications' : data === 'notify:reminder' ? 'reminderNotifications' : 'changeNotifications';
    user[field] = user[field] === false;
    user.notifications = user.dailyNotifications !== false || user.reminderNotifications !== false || user.changeNotifications !== false;
    await saveUser(env, user);
    await editMessage(env, chatId, messageId, notifyStatusText(user), { reply_markup: notifyKeyboard(user) });
    return;
  }

  if (
    data === 'notify:on'
  ) {
    user.notifications = true;
    user.dailyNotifications = true;
    user.reminderNotifications = true;
    user.changeNotifications = true;

    await saveUser(
      env,
      user
    );

    await editMessage(
      env,
      chatId,
      messageId,
      '✅ Уведомления включены.\n\n' +
        notifyStatusText(user),
      {
        reply_markup:
          notifyKeyboard(user)
      }
    );

    return;
  }

  if (
    data === 'notify:off'
  ) {
    user.notifications =
      false;

    await saveUser(
      env,
      user
    );

    await editMessage(
      env,
      chatId,
      messageId,
      '❌ Уведомления выключены.\n\n' +
        notifyStatusText(user),
      {
        reply_markup:
          notifyKeyboard(user)
    }
  );

  return;
}

if (
    data === 'notify:status'
  ) {
    await editMessage(
      env,
      chatId,
      messageId,
      notifyStatusText(user),
      {
        reply_markup:
          notifyKeyboard(user)
    }
  );

  return;
}

if (
    data === 'menu:group'
  ) {
    try {
      const groups =
        await loadGroups();

      const faculties =
        uniqueFaculties(
          groups
        );

      await editMessage(
        env,
        chatId,
        messageId,
        'Выбери институт / факультет:',
        {
          reply_markup:
            facultiesKeyboard(
              faculties
            )
        }
      );

    } catch (e) {
      console.error(
        e
      );

      await sendMessage(
        env,
        chatId,
        'Не удалось загрузить список групп.'
      );
    }

    return;
  }

  if (
    data.startsWith('fac:')
  ) {
    const faculty =
      data.slice(4);

    try {
      const groups =
        await loadGroups();

      const courses =
        coursesForFaculty(
          groups,
          faculty
        );

      await editMessage(
        env,
        chatId,
        messageId,
        `Факультет: <b>${esc(faculty)}</b>\nВыбери курс:`,
        {
          reply_markup:
            coursesKeyboard(
              faculty,
              courses
            )
        }
      );

    } catch (e) {
      console.error(
        e
      );

      await sendMessage(
        env,
        chatId,
        'Ошибка загрузки курсов.'
      );
    }

    return;
  }

  if (
    data.startsWith('course:')
  ) {
    const parts =
      data.split(':');

    const faculty =
      parts[1];

    const course =
      Number(
        parts[2]
      );

    try {
      const groups =
        await loadGroups();

      const list =
        groupsFor(
          groups,
          faculty,
          course
        );

      await editMessage(
        env,
        chatId,
        messageId,
        `Факультет: <b>${esc(faculty)}</b>\nКурс: <b>${course}</b>\nВыбери группу:`,
        {
          reply_markup:
            groupsKeyboard(
              faculty,
              course,
              list
            )
        }
      );

    } catch (e) {
      console.error(
        e
      );

      await sendMessage(
        env,
        chatId,
        'Ошибка загрузки групп.'
      );
    }

    return;
  }

  if (
    data.startsWith('grp:')
  ) {
    const groupId =
      Number(
        data.slice(4)
      );

    try {
      const groups =
        await loadGroups();

      const g =
        groups.find(
          (x) =>
            Number(x.id) === groupId
        );

      if (!g) {
        await sendMessage(
          env,
          chatId,
          'Группа не найдена.'
        );

        return;
      }

      user.groupId =
        Number(g.id);

      user.groupName =
        g.name;

      user.course =
        g.kurs;

      user.faculty =
        g.facul;

      user.facultyId =
        g.facultyID;

      if (
        user.notifications ==
        null
      ) {
        user.notifications =
          true;
      }

      await saveUser(
        env,
        user
      );

      await editMessage(
        env,
        chatId,
        messageId,
        `✅ Группа сохранена: <b>${esc(g.name)}</b>\n\n` +
          `Уведомления: <b>${
            user.notifications !== false
              ? 'включены'
              : 'выключены'
          }</b>\n` +
          `Можно открыть расписание.`,
        {
          reply_markup:
            mainKeyboard(user)
        }
      );

    } catch (e) {
      console.error(
        e
      );

      await sendMessage(
        env,
        chatId,
        'Не удалось сохранить группу.'
      );
    }

    return;
  }
}

// ──────────────────── Command / callback handlers ────────────────────

async function handleMessage(
  env,
  msg
) {
  if (
    !msg.from ||
    !msg.chat
  ) {
    return;
  }

  const text =
    (msg.text || '').trim();

  const user =
    await ensureUser(
      env,
      msg.from
    );

  if (
    text.startsWith('/start')
  ) {
    await handleStart(
      env,
      msg
    );

    return;
  }

  if (
    text.startsWith('/schedule') ||
    text === '📅 Расписание'
  ) {
    await handleSchedule(
      env,
      msg.chat.id,
      user
    );

    return;
  }

  if (
    text.startsWith('/group')
  ) {
    try {
      const groups =
        await loadGroups();

      const faculties =
        uniqueFaculties(
          groups
        );

      await sendMessage(
        env,
        msg.chat.id,
        'Выбери институт / факультет:',
        {
          reply_markup:
            facultiesKeyboard(
              faculties
            )
        }
      );

    } catch (e) {
      console.error(e);

      await sendMessage(
        env,
        msg.chat.id,
        'Не удалось загрузить список групп.'
      );
    }

    return;
  }

  if (
    text.startsWith('/notify_on')
  ) {
    await handleNotifyOn(
      env,
      msg.chat.id,
      user
    );

    return;
  }

  if (
    text.startsWith('/notify_off')
  ) {
    await handleNotifyOff(
      env,
      msg.chat.id,
      user
    );

    return;
  }

  if (
    text.startsWith('/notify_status') ||
    text.startsWith('/notify')
  ) {
    await handleNotifyStatus(
      env,
      msg.chat.id,
      user
    );

    return;
  }

  if (user.groupId) {
    await sendMessage(
      env,
      msg.chat.id,
      welcomeText(user),
      {
        reply_markup:
          mainKeyboard(user)
      }
    );
  } else {
    await handleStart(
      env,
      msg
    );
  }
}

// ──────────────────── Notifications (cron) ────────────────────

function buildReminderText(
  lesson
) {
  const subj =
    cleanSubject(
      lesson['дисциплина']
    );

  const room =
    (lesson['аудитория'] || '')
      .trim();

  const teacher =
    (
      lesson['фиоПреподавателя'] ||
      lesson['преподаватель'] ||
      ''
    ).trim();

  let text =
    `🔔 <b>Через ${REMINDER_MINUTES} минут пара</b>\n`;

  text +=
    `📚 ${esc(subj)}\n`;

  text +=
    `🕐 ${esc(lesson['начало'])}–${esc(lesson['конец'])}`;

  if (room) {
    text +=
      `\n📍 ${esc(room)}`;
  }

  if (teacher) {
    text +=
      `\n👨‍🏫 ${esc(teacher)}`;
  }

  if (lesson['замена']) {
    text +=
      `\n⚠️ Замена`;
  }

  return text;
}

function buildReplacementText(
  lesson,
  dateStr
) {
  const subj =
    cleanSubject(
      lesson['дисциплина']
    );

  const room =
    (lesson['аудитория'] || '')
      .trim();

  const teacher =
    (
      lesson['фиоПреподавателя'] ||
      lesson['преподаватель'] ||
      ''
    ).trim();

  const today =
    moscowDateStr();

  const tomorrow = addDaysMoscow(today, 1);

  const when =
    dateStr === today
      ? 'Сегодня'
      : dateStr === tomorrow
        ? 'Завтра'
        : formatRuDate(dateStr);

  let text =
    `⚠️ <b>Изменение расписания</b>\n`;

  text +=
    `📅 ${esc(when)}, ${esc(lesson['начало'])}\n`;

  text +=
    `📚 ${esc(subj)}`;

  if (room) {
    text +=
      `\n📍 ${esc(room)}`;
  }

  if (teacher) {
    text +=
      `\n👨‍🏫 ${esc(teacher)}`;
  }

  return text;
}

/**
 * Process one group's lessons
 * for all subscribed users
 * of that group.
 */

async function processGroupNotifications(
  env,
  groupId,
  users,
  todayStr,
  tomorrowStr,
  nowMin
) {
  let todayLessons = [];
  let tomorrowLessons = [];

  try {
    const a =
      await fetchSchedule(
        groupId,
        todayStr
      );

    todayLessons =
      a.filter(
        (l) =>
          (
            l['дата'] || ''
          ).slice(0, 10) ===
          todayStr
      );

  } catch (e) {
    console.error(
      'fetch today failed group',
      groupId,
      e
    );

    return;
  }

  try {
    const b =
      await fetchSchedule(
        groupId,
        tomorrowStr
      );

    tomorrowLessons =
      b.filter(
        (l) =>
          (
            l['дата'] || ''
          ).slice(0, 10) ===
          tomorrowStr
      );

  } catch (e) {
    console.error(
      'fetch tomorrow failed group',
      groupId,
      e
    );
  }

  // Reminders:
  // lessons starting in ~15 minutes

  const reminderLessons =
    todayLessons.filter(
      (l) => {
        const start =
          parseTimeMinutes(
            l['начало']
          );

        if (
          start == null
        ) {
          return false;
        }

        const diff =
          start - nowMin;

        return (
          diff >=
            REMINDER_MINUTES &&
          diff <
            REMINDER_MINUTES + 1
        );
      }
    );

  const replacementCandidates =
    [
      ...todayLessons,
      ...tomorrowLessons
    ].filter(
      (l) =>
        l['замена'] === true
    );

  for (
    const user of users
  ) {
    if (
      user.notifications === false
    ) {
      continue;
    }

    const chatId =
      user.telegramId;

    for (
      const lesson
      of (user.reminderNotifications === false ? [] : reminderLessons)
    ) {
      const code =
        lessonCode(
          lesson
        );

      const key =
        notifKey(
          chatId,
          code,
          'reminder'
        );

      try {
        if (
          await wasSent(
            env,
            key
          )
        ) {
          continue;
        }

        const res =
          await sendMessage(
            env,
            chatId,
            buildReminderText(
              lesson
            )
          );

        if (
          res &&
          res.ok
        ) {
          await markSent(
            env,
            key
          );
        }

      } catch (e) {
        console.error(
          'reminder send failed',
          chatId,
          e
        );
      }
    }

    for (
      const lesson
      of (user.changeNotifications === false ? [] : replacementCandidates)
    ) {
      const code =
        lessonCode(
          lesson
        );

      const key =
        replacementKey(
          chatId,
          code
        );

      try {
        if (
          await wasSent(
            env,
            key
          )
        ) {
          continue;
        }

        const dateStr =
          (
            lesson['дата'] ||
            ''
          ).slice(0, 10);

        const res =
          await sendMessage(
            env,
            chatId,
            buildReplacementText(
              lesson,
              dateStr
            )
          );

        if (
          res &&
          res.ok
        ) {
          await markSent(
            env,
            key,
            60 * 60 * 72
          );
        }

      } catch (e) {
        console.error(
          'replacement send failed',
          chatId,
          e
        );
      }
    }
  }
}

async function runNotificationsJob(
  env
) {
  const todayStr =
    moscowDateStr();

  const tomorrowStr =
    addDaysMoscow(
      todayStr,
      1
    );

  const nowMin =
    moscowMinutes();

  console.log(
    'cron start',
    todayStr,
    'min',
    nowMin
  );

  let users;

  try {
    users =
      await listUsers(
        env
      );
  } catch (e) {
    console.error(
      'listUsers failed',
      e
    );

    return;
  }

  // groupId → users

  const byGroup =
    new Map();

  for (
    const u of users
  ) {
    if (!u.groupId) {
      continue;
    }

    if (
      u.notifications === false
    ) {
      continue;
    }

    const gid =
      String(u.groupId);

    if (
      !byGroup.has(gid)
    ) {
      byGroup.set(
        gid,
        []
      );
    }

    byGroup.get(gid).push(u);
  }

  console.log(
    'groups to process',
    byGroup.size,
    'users',
    users.length
  );

  for (
    const [
      gid,
      groupUsers
    ]
    of byGroup.entries()
  ) {
    try {
      await processGroupNotifications(
        env,
        Number(gid),
        groupUsers,
        todayStr,
        tomorrowStr,
        nowMin
      );

    } catch (e) {
      console.error(
        'processGroup failed',
        gid,
        e
      );
    }
  }

  console.log(
    'cron done'
  );
}

// ──────────────────── HTTP / webhook ────────────────────

async function handleWebhook(
  request,
  env
) {
  if (
    request.method !== 'POST'
  ) {
    return new Response(
      'KGEU Schedule Bot',
      {
        status: 200
      }
    );
  }

  let update;

  try {
    update =
      await request.json();
  } catch {
    return new Response(
      'bad json',
      {
        status: 400
      }
    );
  }

  try {
    if (
      update.callback_query
    ) {
      await handleCallback(
        env,
        update.callback_query
      );

    } else if (
      update.message
    ) {
      await handleMessage(
        env,
        update.message
      );
    }

  } catch (e) {
    console.error(
      'update handler error',
      e
    );
  }

  return new Response(
    'ok',
    {
      status: 200
    }
  );
}

// ──────────────────── Export ────────────────────

export default {
  async fetch(
    request,
    env,
    ctx
  ) {
    const url =
      new URL(
        request.url
      );

    // Telegram webhook
    // ВАЖНО:
    // POST / должен обрабатываться как webhook
    // ДО health check для GET /

    if (
      url.pathname === '/webhook' ||
      (
        url.pathname === '/' &&
        request.method === 'POST'
      )
    ) {
      return handleWebhook(
        request,
        env
      );
    }

    // Health check

    if (
      url.pathname === '/' ||
      url.pathname === '/health'
    ) {
      return new Response(
        'ok',
        {
          status: 200
        }
      );
    }

    // Manual cron trigger

    if (
      url.pathname === '/cron'
    ) {
      ctx.waitUntil(
        runNotificationsJob(
          env
        )
      );

      return new Response(
        'cron started',
        {
          status: 200
        }
      );
    }

    if (url.pathname === '/api/reminders') {
      const corsHeaders = { 'Access-Control-Allow-Origin': 'https://mitrofanovdaniil53-max.github.io', 'Access-Control-Allow-Headers': 'Content-Type, X-Telegram-Init-Data', 'Access-Control-Allow-Methods': 'GET, POST, OPTIONS', 'Vary': 'Origin' };
      if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders });
      const response = await handleMiniAppReminders(request, env);
      const headers = new Headers(response.headers);
      for (const [key, value] of Object.entries(corsHeaders)) headers.set(key, value);
      return new Response(response.body, { status: response.status, statusText: response.statusText, headers: headers });
    }
    // Mini App:
    // resolve Telegram user
    // to saved group

    if (
      url.pathname === '/api/me'
    ) {

      // Browser preflight
      // for the Mini App

      if (
        request.method === 'OPTIONS'
      ) {
        return new Response(
          null,
          {
            status: 204,
            headers: {
              'Access-Control-Allow-Origin':
                'https://mitrofanovdaniil53-max.github.io/kgeu-telegram-miniapp/',

              'Access-Control-Allow-Headers':
                'Content-Type, X-Telegram-Init-Data',

              'Access-Control-Allow-Methods':
                'GET, OPTIONS',

              'Access-Control-Max-Age':
                '86400',

              'Vary':
                'Origin'
            }
          }
        );
      }

      const response =
        await handleMiniAppMe(
          request,
          env
        );

      const headers =
        new Headers(
          response.headers
        );

      headers.set(
        'Access-Control-Allow-Origin',
        'https://mitrofanovdaniil53-max.github.io/kgeu-telegram-miniapp/'
      );

      headers.set(
        'Access-Control-Allow-Headers',
        'Content-Type, X-Telegram-Init-Data'
      );

      headers.set(
        'Access-Control-Allow-Methods',
        'GET, OPTIONS'
      );

      headers.set(
        'Vary',
        'Origin'
      );

      return new Response(
        response.body,
        {
          status:
            response.status,

          statusText:
            response.statusText,

          headers
        }
      );
    }

    return new Response(
      'Not found',
      {
        status: 404
      }
    );
  },

  async scheduled(
    event,
    env,
    ctx
  ) {
    ctx.waitUntil(
      Promise.all([runNotificationsJob(env), runDailyScheduleNotifications(env), runPersonalRemindersJob(env)])
    );
  },
};