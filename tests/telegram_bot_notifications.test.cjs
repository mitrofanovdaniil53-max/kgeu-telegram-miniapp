const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

const worker = fs.readFileSync('workers/kgeu-schedule-bot/worker.js', 'utf8');
const frontend = fs.readFileSync('index.html', 'utf8');

test('personal reminder API validates signed Telegram Mini App data', () => {
  assert.match(worker, /validateTelegramInitData\\(initData, env\\.BOT_TOKEN\\)/);
  assert.match(worker, /personalReminderKey\\(telegramId, reminderId\\)/);
  assert.match(worker, /personal-reminder:\\$\\{telegramId\\}:\\$\\{reminderId\\}/);
});

test('personal reminders are isolated by Telegram account and capped', () => {
  assert.match(worker, /personalReminderKey\\(tgUser\\.id, id\\)/);
  assert.match(worker, /existing\\.keys\\.length >= 50/);
  assert.match(worker, /!\\['GET', 'POST', 'DELETE'\\]\\.includes\\(request\\.method\\)/);
});

test('personal reminders run on the one-minute cron without replacing the five-minute job', () => {
  assert.match(worker, /controller\\.cron === '\\* \\* \\* \\* \\*'/);
  assert.match(worker, /ctx\\.waitUntil\\(processPersonalReminders\\(env\\)\\)/);
  assert.match(worker, /ctx\\.waitUntil\\(runNotificationsJob\\(env\\)\\)/);
});

test('daily timetable is sent at 07:00 Moscow time and deduplicated per user/day', () => {
  assert.match(worker, /const DAILY_HOUR = 7/);
  assert.match(worker, /parts\\.hour === DAILY_HOUR/);
  assert.match(worker, /notifKey\\(user\\.telegramId, dateStr, 'daily'\\)/);
  assert.match(worker, /sendDailyNotifications\\(env, users, todayStr\\)/);
});

test('notification categories have independent user preferences', () => {
  for (const field of ['dailyNotifications', 'reminderNotifications', 'changeNotifications']) {
    assert.ok(worker.includes(field), field + ' preference missing');
  }
  for (const callback of ['notify:daily', 'notify:reminder', 'notify:change']) {
    assert.ok(worker.includes(callback), callback + ' callback missing');
  }
});

test('Mini App uses bot chat API instead of browser notification permission', () => {
  assert.ok(frontend.includes("TELEGRAM_BOT_API + '/api/reminders'"));
  assert.match(frontend, /X-Telegram-Init-Data/);
  assert.ok(frontend.includes("serviceTelegramReminderRequest('DELETE'"));
  assert.match(frontend, /Системные уведомления не используются/);
});
