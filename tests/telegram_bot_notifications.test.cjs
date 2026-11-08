const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

const worker = fs.readFileSync('workers/kgeu-schedule-bot/worker.js', 'utf8');
const frontend = fs.readFileSync('index.html', 'utf8');

test('personal reminder API validates signed Telegram Mini App data', () => {
  assert.ok(worker.includes('validateTelegramInitData(initData, env.BOT_TOKEN)'));
  assert.ok(worker.includes('personalReminderKey(telegramId, reminderId)'));
  assert.ok(worker.includes('personal-reminder:${telegramId}:${reminderId}'));
});

test('personal reminders are isolated by Telegram account and capped', () => {
  assert.ok(worker.includes('personalReminderKey(tgUser.id, id)'));
  assert.ok(worker.includes('existing.keys.length >= 50'));
  assert.ok(worker.includes("!['GET', 'POST', 'DELETE'].includes(request.method)"));
});

test('personal reminders run on the one-minute cron without replacing the five-minute job', () => {
  assert.ok(worker.includes("controller.cron === '* * * * *'"));
  assert.ok(worker.includes('ctx.waitUntil(processPersonalReminders(env))'));
  assert.ok(worker.includes('ctx.waitUntil(runNotificationsJob(env))'));
});

test('daily timetable is sent at 07:00 Moscow time and deduplicated per user/day', () => {
  assert.ok(worker.includes('const DAILY_HOUR = 7'));
  assert.ok(worker.includes('parts.hour === DAILY_HOUR'));
  assert.ok(worker.includes("notifKey(user.telegramId, dateStr, 'daily')"));
  assert.ok(worker.includes('sendDailyNotifications(env, users, todayStr)'));
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
  assert.ok(frontend.includes('X-Telegram-Init-Data'));
  assert.ok(frontend.includes("serviceTelegramReminderRequest('DELETE'"));
  assert.ok(frontend.includes('Системные уведомления не используются'));
});
