const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

function loadWorker(path, extra = {}) {
  const source = fs.readFileSync(path, 'utf8').replace('export default {', 'globalThis.__worker = {');
  const sandbox = {
    console: { log() {}, warn() {}, error() {} },
    Response, Request, Headers, URL, URLSearchParams, TextEncoder, crypto: require('node:crypto').webcrypto,
    fetch: async () => { throw new Error('Unexpected external fetch'); },
    ...extra
  };
  vm.runInNewContext(source, sandbox, { filename: path });
  return sandbox;
}

function makeKv({ values = {}, failGet = () => false, failList = () => false, incompleteList = () => false, failPut = () => false, failDelete = () => false } = {}) {
  const map = new Map(Object.entries(values));
  const calls = { get: [], list: [], put: [], delete: [] };
  return {
    values: map, calls,
    async get(key, type) {
      calls.get.push(key);
      if (failGet(key)) throw new Error('injected get failure');
      const value = map.get(key);
      if (value == null) return null;
      return type === 'json' ? JSON.parse(value) : value;
    },
    async put(key, value) {
      calls.put.push(key);
      if (failPut(key)) throw new Error('injected put failure');
      map.set(key, String(value));
    },
    async delete(key) {
      calls.delete.push(key);
      if (failDelete(key)) throw new Error('injected delete failure');
      map.delete(key);
    },
    async list({ prefix = '', cursor, limit = 1000 } = {}) {
      calls.list.push(prefix);
      if (failList(prefix)) throw new Error('injected list failure');
      const keys = [...map.keys()].filter(k => k.startsWith(prefix)).sort()
        .slice(0, limit).map(name => ({ name }));
      if (incompleteList(prefix)) return { keys, list_complete: false };
      return { keys, list_complete: true };
    }
  };
}

const tgPath = 'workers/kgeu-schedule-bot/worker.js';
const vkPath = 'workers/kgeu-vk-bot/worker.js';

test('Telegram and VK numeric ID 12345 map to distinct namespaced profile keys', () => {
  const tg = loadWorker(tgPath);
  const vk = loadWorker(vkPath);
  assert.equal(tg.userKey('12345'), 'user:telegram:12345');
  assert.equal(vk.userKey('12345'), 'user:vk:12345');
  assert.notEqual(tg.userKey('12345'), vk.userKey('12345'));
});

test('legacy Telegram profile is never exposed as VK profile for the same numeric ID', async () => {
  const tg = loadWorker(tgPath);
  const vk = loadWorker(vkPath);
  const kv = makeKv({ values: { 'user:12345': JSON.stringify({ telegramId: '12345', groupId: 77 }) } });
  const env = { KGEU_SCHEDULE: kv, KGEU_VK_USERS: kv };
  assert.equal((await tg.getUser(env, '12345')).groupId, 77);
  assert.equal(await vk.getUser(env, '12345'), null);
  assert.deepEqual(kv.calls.put, []);
});

test('KV get READ_ERROR propagates from getUser and never becomes NOT_FOUND', async () => {
  const tg = loadWorker(tgPath), vk = loadWorker(vkPath);
  const tgKv = makeKv({ failGet: () => true });
  const vkKv = makeKv({ failGet: () => true });
  await assert.rejects(tg.getUser({ KGEU_SCHEDULE: tgKv }, 42), /KGEU_STORAGE_UNAVAILABLE/);
  await assert.rejects(vk.getUser({ KGEU_VK_USERS: vkKv }, 42), /KGEU_STORAGE_UNAVAILABLE/);
});

test('NOT_FOUND does not auto-create profiles without an atomic coordinator', async () => {
  const tg = loadWorker(tgPath), vk = loadWorker(vkPath);
  const tgKv = makeKv(), vkKv = makeKv();
  await assert.rejects(tg.ensureUser({ KGEU_SCHEDULE: tgKv }, { id: 42 }), /PROFILE_CREATE_REQUIRES_ATOMIC_COORDINATOR/);
  await assert.rejects(vk.ensureUser({ KGEU_VK_USERS: vkKv }, { from_id: 42 }), /PROFILE_CREATE_REQUIRES_ATOMIC_COORDINATOR/);
  assert.equal(tgKv.calls.put.length + vkKv.calls.put.length, 0);
});

test('KV get error while processing personal reminders never calls delete (Telegram and VK)', async () => {
  const tg = loadWorker(tgPath), vk = loadWorker(vkPath);
  const tgKey = 'personal-reminder:telegram:42:rem-1';
  const vkKey = 'personal-reminder:vk:42:rem-1';
  const tgKv = makeKv({ values: { [tgKey]: '{}' }, failGet: key => key === tgKey });
  const vkKv = makeKv({ values: { [vkKey]: '{}' }, failGet: key => key === vkKey });
  await assert.rejects(tg.processPersonalReminders({ KGEU_SCHEDULE: tgKv }), /KGEU_STORAGE_UNAVAILABLE/);
  await assert.rejects(vk.processPersonalReminders({ KGEU_VK_USERS: vkKv }), /KGEU_STORAGE_UNAVAILABLE/);
  assert.deepEqual(tgKv.calls.delete, []);
  assert.deepEqual(vkKv.calls.delete, []);
});

test('list() errors and truncated pages fail closed for both user scanners', async () => {
  const tg = loadWorker(tgPath), vk = loadWorker(vkPath);
  for (const [worker, binding] of [[tg, 'KGEU_SCHEDULE'], [vk, 'KGEU_VK_USERS']]) {
    const listError = makeKv({ failList: () => true });
    await assert.rejects(worker.listUsers({ [binding]: listError }), /injected list failure/);
    const truncated = makeKv({ incompleteList: () => true });
    await assert.rejects(worker.listUsers({ [binding]: truncated }), /KV_LIST_INCOMPLETE/);
  }
});

test('get() error during listUsers fails the complete scan instead of returning partial users', async () => {
  const tg = loadWorker(tgPath), vk = loadWorker(vkPath);
  const tgKv = makeKv({ values: { 'user:telegram:1': JSON.stringify({ telegramId: '1' }) }, failGet: () => true });
  const vkKv = makeKv({ values: { 'user:vk:1': JSON.stringify({ vkId: 1 }) }, failGet: () => true });
  await assert.rejects(tg.listUsers({ KGEU_SCHEDULE: tgKv }), /KGEU_STORAGE_UNAVAILABLE/);
  await assert.rejects(vk.listUsers({ KGEU_VK_USERS: vkKv }), /KGEU_STORAGE_UNAVAILABLE/);
});

test('saveUser does not perform read-after-write verification that can fail after a successful put', async () => {
  const tg = loadWorker(tgPath), vk = loadWorker(vkPath);
  const tgKv = makeKv(), vkKv = makeKv();
  await tg.saveUser({ KGEU_SCHEDULE: tgKv }, { telegramId: '1' });
  await vk.saveUser({ KGEU_VK_USERS: vkKv }, { vkId: 1 });
  assert.equal(tgKv.calls.get.length, 0);
  assert.equal(vkKv.calls.get.length, 0);
});

test('saveUser avoids a fragile read-after-write verification request', async () => {
  const tg = loadWorker(tgPath), vk = loadWorker(vkPath);
  const tgKv = makeKv(), vkKv = makeKv();
  await tg.saveUser({ KGEU_SCHEDULE: tgKv }, { telegramId: '1' });
  await vk.saveUser({ KGEU_VK_USERS: vkKv }, { vkId: 1 });
  assert.equal(tgKv.calls.get.length, 0);
  assert.equal(vkKv.calls.get.length, 0);
});

test('read failure after successful or failed put never triggers another profile write', async () => {
  const tg = loadWorker(tgPath), vk = loadWorker(vkPath);
  let readFails = false;
  const tgAfterSuccess = makeKv({ failGet: () => readFails });
  const vkAfterSuccess = makeKv({ failGet: () => readFails });
  await tg.saveUser({ KGEU_SCHEDULE: tgAfterSuccess }, { telegramId: '91' });
  await vk.saveUser({ KGEU_VK_USERS: vkAfterSuccess }, { vkId: 91 });
  readFails = true;
  await assert.rejects(tg.ensureUser({ KGEU_SCHEDULE: tgAfterSuccess }, { id: 91 }), /KGEU_STORAGE_UNAVAILABLE/);
  await assert.rejects(vk.ensureUser({ KGEU_VK_USERS: vkAfterSuccess }, { from_id: 91 }), /KGEU_STORAGE_UNAVAILABLE/);
  assert.equal(tgAfterSuccess.calls.put.length, 1);
  assert.equal(vkAfterSuccess.calls.put.length, 1);

  const tgAfterFailure = makeKv({ failGet: () => true, failPut: () => true });
  const vkAfterFailure = makeKv({ failGet: () => true, failPut: () => true });
  await assert.rejects(tg.saveUser({ KGEU_SCHEDULE: tgAfterFailure }, { telegramId: '92' }), /KGEU_STORAGE_UNAVAILABLE/);
  await assert.rejects(vk.saveUser({ KGEU_VK_USERS: vkAfterFailure }, { vkId: 92 }), /KGEU_STORAGE_UNAVAILABLE/);
  await assert.rejects(tg.ensureUser({ KGEU_SCHEDULE: tgAfterFailure }, { id: 92 }), /KGEU_STORAGE_UNAVAILABLE/);
  await assert.rejects(vk.ensureUser({ KGEU_VK_USERS: vkAfterFailure }, { from_id: 92 }), /KGEU_STORAGE_UNAVAILABLE/);
  assert.equal(tgAfterFailure.calls.put.length, 1);
  assert.equal(vkAfterFailure.calls.put.length, 1);
});

test('VK loadGroups falls back to upstream API after KV cache read error and does not overwrite cache', async () => {
  let fetchCount = 0;
  const vk = loadWorker(vkPath, {
    fetch: async () => {
      fetchCount++;
      return new Response(JSON.stringify({ data: [{ id: 7, name: 'TEST-01', kurs: 1, facul: 'TEST' }] }), { status: 200 });
    }
  });
  const kv = makeKv({ failGet: key => key === 'cache:groups' });
  const groups = await vk.loadGroups({ KGEU_VK_USERS: kv });
  assert.equal(fetchCount, 1);
  assert.equal(groups.length, 1);
  assert.equal(groups[0].id, 7);
  assert.deepEqual(kv.calls.put, []);
});

test('KV put/delete errors are propagated and not reported as successful operations', async () => {
  const tg = loadWorker(tgPath), vk = loadWorker(vkPath);
  const tgPut = makeKv({ failPut: () => true });
  const vkPut = makeKv({ failPut: () => true });
  await assert.rejects(tg.saveUser({ KGEU_SCHEDULE: tgPut }, { telegramId: '1' }), /KGEU_STORAGE_UNAVAILABLE/);
  await assert.rejects(vk.saveUser({ KGEU_VK_USERS: vkPut }, { vkId: 1 }), /KGEU_STORAGE_UNAVAILABLE/);

  const now = Date.now();
  const oldTg = 'personal-reminder:telegram:1:old';
  const oldVk = 'personal-reminder:vk:1:old';
  const tgDelete = makeKv({ values: { [oldTg]: JSON.stringify({ telegramId: '1', fireAt: now - 20 * 60 * 1000 }) }, failDelete: () => true });
  const vkDelete = makeKv({ values: { [oldVk]: JSON.stringify({ vkId: '1', fireAt: now - 20 * 60 * 1000 }) }, failDelete: () => true });
  await assert.rejects(tg.processPersonalReminders({ KGEU_SCHEDULE: tgDelete }, now), /KGEU_STORAGE_UNAVAILABLE/);
  await assert.rejects(vk.processPersonalReminders({ KGEU_VK_USERS: vkDelete }, now), /KGEU_STORAGE_UNAVAILABLE/);
});

test('VK cron performs one complete user scan and reuses the snapshot', async () => {
  const vk = loadWorker(vkPath);
  const kv = makeKv();
  await vk.runCron({ KGEU_VK_USERS: kv, VK_TOKEN: 'test-token' });
  assert.equal(kv.calls.list.filter(prefix => prefix === 'user:').length, 1);
});

test('VK stable notification id is deterministic across retries', () => {
  const vk = loadWorker(vkPath);
  assert.equal(vk.stableRandomId('reminder:424242:2026-11-20:lesson-1'), vk.stableRandomId('reminder:424242:2026-11-20:lesson-1'));
  assert.notEqual(vk.stableRandomId('reminder:424242:2026-11-20:lesson-1'), vk.stableRandomId('reminder:424242:2026-11-20:lesson-2'));
});

test('VK cron skips all broadcasts when the complete user scan fails', async () => {
  let externalFetches = 0;
  const vk = loadWorker(vkPath, { fetch: async () => { externalFetches++; throw new Error('broadcast must not run'); } });
  const kv = makeKv({ failList: prefix => prefix === 'user:' });
  await vk.runCron({ KGEU_VK_USERS: kv, VK_TOKEN: 'test-token' });
  assert.equal(externalFetches, 0);
  assert.equal(kv.calls.list.includes('user:'), true);
});
