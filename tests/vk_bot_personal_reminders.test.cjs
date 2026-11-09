const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const test = require('node:test');
const crypto = require('node:crypto').webcrypto;

const source = fs.readFileSync('workers/kgeu-vk-bot/worker.js', 'utf8')
  .replace('export default {', 'globalThis.__worker = {');
const backendPayload = { ok: true, provider: 'vk', providerUserId: '424242' };
const calls = [];
const sandbox = {
  console,
  crypto,
  TextEncoder,
  Response,
  Request,
  Headers,
  URL,
  URLSearchParams,
  Date,
  fetch: async (url, options = {}) => {
    calls.push({ url: String(url), options });
    if (String(url).includes('/api/account/me')) {
      return new Response(JSON.stringify(backendPayload), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      });
    }
    if (String(url).includes('api.vk.com/method/messages.send')) {
      return new Response(JSON.stringify({ response: 123 }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      });
    }
    throw new Error('Unexpected fetch URL: ' + String(url));
  }
};
vm.runInNewContext(source, sandbox, { filename: 'workers/kgeu-vk-bot/worker.js' });

function makeKv(initial = {}) {
  const values = new Map(Object.entries(initial));
  return {
    values,
    async get(key, type) {
      const value = values.get(key);
      if (value == null) return null;
      return type === 'json' ? JSON.parse(value) : value;
    },
    async put(key, value) {
      values.set(key, String(value));
    },
    async delete(key) {
      values.delete(key);
    },
    async list({ prefix = '', limit = 1000 } = {}) {
      const keys = [...values.keys()]
        .filter(key => key.startsWith(prefix))
        .sort()
        .slice(0, limit)
        .map(name => ({ name }));
      return { keys, list_complete: true };
    }
  };
}

function request(method, path = '/api/reminders', body, headers = {}) {
  return new Request('https://kgeu-vk-bot.2vkv544dmd.workers.dev' + path, {
    method,
    headers: {
      Origin: 'https://mitrofanovdaniil53-max.github.io',
      'X-VK-Launch-Params': 'signed-vk-launch-data',
      ...(body ? { 'Content-Type': 'application/json' } : {}),
      ...headers
    },
    body: body ? JSON.stringify(body) : undefined
  });
}

function futureDate() {
  return new Date(Date.now() + 48 * 60 * 60 * 1000 + 3 * 60 * 60 * 1000)
    .toISOString().slice(0, 10);
}

test('VK personal reminder API requires signed VK launch parameters', async () => {
  const env = { KGEU_VK_USERS: makeKv({ 'user:424242': JSON.stringify({ vkId: 424242 }) }) };
  const response = await sandbox.__worker.fetch(
    request('GET', '/api/reminders', null, { 'X-VK-Launch-Params': '' }),
    env,
    {}
  );
  assert.equal(response.status, 401);
  assert.equal((await response.json()).error, 'vk_auth_required');
});

test('VK personal reminder API requires the user to start the community bot', async () => {
  const env = { KGEU_VK_USERS: makeKv() };
  const response = await sandbox.__worker.fetch(request('GET'), env, {});
  assert.equal(response.status, 409);
  assert.equal((await response.json()).error, 'start_bot_first');
});

test('VK personal reminders can be created, listed and deleted for the authenticated VK user', async () => {
  const kv = makeKv({ 'user:424242': JSON.stringify({ vkId: 424242 }) });
  const env = { KGEU_VK_USERS: kv };
  const create = await sandbox.__worker.fetch(request('POST', '/api/reminders', {
    title: 'Подготовить доклад',
    note: 'Проверить презентацию',
    date: futureDate(),
    time: '12:30'
  }), env, {});
  assert.equal(create.status, 201);
  const created = await create.json();
  assert.equal(created.reminder.vkId, '424242');
  assert.equal(created.reminder.title, 'Подготовить доклад');
  assert.ok(kv.values.has('personal-reminder:424242:' + created.reminder.id));

  const list = await sandbox.__worker.fetch(request('GET'), env, {});
  const listed = await list.json();
  assert.equal(listed.reminders.length, 1);
  assert.equal(listed.reminders[0].id, created.reminder.id);

  const remove = await sandbox.__worker.fetch(
    request('DELETE', '/api/reminders?id=' + encodeURIComponent(created.reminder.id)),
    env,
    {}
  );
  assert.equal(remove.status, 200);
  assert.equal((await remove.json()).deleted, true);
  assert.equal(kv.values.has('personal-reminder:424242:' + created.reminder.id), false);
});

test('VK personal reminder API rejects invalid date/time and expired reminders', async () => {
  const env = { KGEU_VK_USERS: makeKv({ 'user:424242': JSON.stringify({ vkId: 424242 }) }) };
  const invalid = await sandbox.__worker.fetch(request('POST', '/api/reminders', {
    title: 'Test', date: '2026-02-30', time: '25:61'
  }), env, {});
  assert.equal(invalid.status, 400);
  assert.equal((await invalid.json()).error, 'invalid_reminder');

  const past = await sandbox.__worker.fetch(request('POST', '/api/reminders', {
    title: 'Test', date: '2020-01-01', time: '12:00'
  }), env, {});
  assert.equal(past.status, 400);
  assert.equal((await past.json()).error, 'reminder_time_out_of_range');
});

test('VK personal reminder API caps active reminders at 50', async () => {
  const initial = { 'user:424242': JSON.stringify({ vkId: 424242 }) };
  for (let i = 0; i < 50; i++) {
    const id = String(i).padStart(8, '0') + '-0000-4000-8000-000000000000';
    initial['personal-reminder:424242:' + id] = JSON.stringify({ id, vkId: '424242', fireAt: Date.now() + 60000 });
  }
  const env = { KGEU_VK_USERS: makeKv(initial) };
  const response = await sandbox.__worker.fetch(request('POST', '/api/reminders', {
    title: 'Extra', date: futureDate(), time: '12:30'
  }), env, {});
  assert.equal(response.status, 429);
  assert.equal((await response.json()).error, 'reminder_limit_reached');
});

test('due VK personal reminder is sent once and removed only after successful VK API response', async () => {
  const now = Date.now();
  const id = '123e4567-e89b-42d3-a456-426614174000';
  const key = 'personal-reminder:424242:' + id;
  const kv = makeKv({
    [key]: JSON.stringify({
      id, vkId: '424242', title: 'Проверить расписание',
      note: 'Не опоздать', date: '2026-11-10', time: '09:00',
      fireAt: now - 1000
    })
  });
  await sandbox.processPersonalReminders({ KGEU_VK_USERS: kv, VK_TOKEN: 'test-token' }, now);
  assert.equal(kv.values.has(key), false);
  const vkCall = calls.find(call => call.url.includes('api.vk.com/method/messages.send'));
  assert.ok(vkCall, 'VK messages.send must be called');
  assert.match(String(vkCall.options.body), /Проверить расписание/);
  assert.match(String(vkCall.options.body), /Не опоздать/);
});

test('overdue VK personal reminders older than ten minutes are discarded without sending', async () => {
  const now = Date.now();
  const id = '123e4567-e89b-42d3-a456-426614174001';
  const key = 'personal-reminder:424242:' + id;
  const kv = makeKv({
    [key]: JSON.stringify({
      id, vkId: '424242', title: 'Устаревшее',
      date: '2026-11-10', time: '09:00',
      fireAt: now - 11 * 60 * 1000
    })
  });
  const before = calls.filter(call => call.url.includes('api.vk.com/method/messages.send')).length;
  await sandbox.processPersonalReminders({ KGEU_VK_USERS: kv, VK_TOKEN: 'test-token' }, now);
  const after = calls.filter(call => call.url.includes('api.vk.com/method/messages.send')).length;
  assert.equal(kv.values.has(key), false);
  assert.equal(after, before);
});

test('VK reminder endpoint returns CORS only for the production GitHub Pages origin', async () => {
  const env = { KGEU_VK_USERS: makeKv({ 'user:424242': JSON.stringify({ vkId: 424242 }) }) };
  const allowed = await sandbox.__worker.fetch(request('OPTIONS'), env, {});
  assert.equal(allowed.status, 204);
  assert.equal(allowed.headers.get('Access-Control-Allow-Origin'), 'https://mitrofanovdaniil53-max.github.io');

  const blocked = await sandbox.__worker.fetch(request('OPTIONS', '/api/reminders', null, {
    Origin: 'https://attacker.example'
  }), env, {});
  assert.equal(blocked.headers.get('Access-Control-Allow-Origin'), null);
});
