const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const test = require('node:test');

const worker = fs.readFileSync('workers/kgeu-vk-bot/worker.js', 'utf8');
const helperStart = worker.indexOf('function isReminderDue(diff)');
const helperEnd = worker.indexOf('\n}', helperStart) + 2;
assert.notEqual(helperStart, -1, 'reminder window helper must exist');
assert.ok(helperEnd > helperStart, 'reminder window helper must be complete');
const helperSource = worker.slice(helperStart, helperEnd);

const context = {
  REMINDER_MINUTES: 15,
  CRON_MINUTES: 5,
  Math,
  Number
};
vm.createContext(context);
vm.runInContext(helperSource + '\nglobalThis.isReminderDue = isReminderDue;', context);
const isReminderDue = context.isReminderDue;

test('reminder window includes the complete five-minute polling interval', () => {
  for (const diff of [10, 11, 12, 13, 14, 15]) {
    assert.equal(isReminderDue(diff), true, String(diff) + ' minutes should be covered');
  }
  for (const diff of [9, 16, 0, -1]) {
    assert.equal(isReminderDue(diff), false, String(diff) + ' minutes should be outside the window');
  }
});

test('every possible class start minute is covered by a five-minute cron tick', () => {
  for (let startMinute = 0; startMinute < 24 * 60; startMinute += 1) {
    const firstTick = Math.floor((startMinute - 20) / 5) * 5;
    let matchingTicks = 0;
    for (let tick = firstTick; tick <= startMinute; tick += 5) {
      if (isReminderDue(startMinute - tick)) matchingTicks += 1;
    }
    assert.ok(matchingTicks >= 1, 'no reminder tick covers minute ' + startMinute);
  }
});

test('sendReminders uses the expanded window and retains send deduplication', () => {
  const start = worker.indexOf('async function sendReminders(');
  const end = worker.indexOf('/* =========================================================\n   CHANGE NOTIFICATIONS', start);
  assert.notEqual(start, -1, 'sendReminders must exist');
  assert.ok(end > start, 'sendReminders section must be bounded');
  const source = worker.slice(start, end);
  assert.match(source, /if \(!isReminderDue\(diff\)\)/);
  const dedupeRead = source.indexOf('env.KGEU_VK_USERS.get(');
  const send = source.indexOf('await sendMessage(');
  const dedupeWrite = source.indexOf('env.KGEU_VK_USERS.put(');
  assert.ok(dedupeRead >= 0 && dedupeRead < send, 'dedupe must be checked before sending');
  assert.ok(send >= 0 && send < dedupeWrite, 'dedupe marker must be written only after successful sending');
});
