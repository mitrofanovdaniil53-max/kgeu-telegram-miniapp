// Execute the real VK metadata parsers extracted from apps/vk/index.html.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const html = fs.readFileSync(path.join(__dirname, '..', 'apps', 'vk', 'index.html'), 'utf8');

function between(start, end) {
  const from = html.indexOf(start);
  assert.notEqual(from, -1, 'missing source: ' + start);
  const to = html.indexOf(end, from + start.length);
  assert.notEqual(to, -1, 'missing end source: ' + end);
  return html.slice(from, to);
}
const shared = between('  function readMeta()', '  function getDeviceId()');
const legacy = between('  function readLegacyServiceSyncMetaForSharedSync()', '  function backupVkServiceCacheBeforeHydration()');
const KEY = 'kgeu_vk_shared_sync_meta_v1';
function harness(seed = {}) {
  const map = new Map(Object.entries(seed));
  let corruptReadback = false;
  const localStorage = {
    getItem(key) { return map.has(key) ? map.get(key) : null; },
    setItem(key, value) { map.set(key, String(value)); if (corruptReadback) map.set(key, String(value) + 'x'); },
    removeItem(key) { map.delete(key); }
  };
  const api = new Function('localStorage', 'META_KEY', shared + legacy + 'return { readMeta, writeMeta, readLegacyServiceSyncMetaForSharedSync };')(localStorage, KEY);
  return { map, localStorage, api, corrupt: value => { corruptReadback = value; } };
}
const validMeta = {
  initialized: true, dirty: false, dirtyNotes: [], dirtyProfile: false,
  dirtyService: false, lastServerRevision: 7, lastSyncAt: 10
};

test('shared metadata: absent is distinct from valid', () => {
  const h = harness();
  const meta = h.api.readMeta();
  assert.equal(meta.__storageInvalid, undefined);
  assert.equal(meta.initialized, false);
  h.map.set(KEY, JSON.stringify(validMeta));
  assert.equal(h.api.readMeta().__storageState, 'valid');
});

test('shared metadata: partial object fails closed', () => {
  const h = harness({ [KEY]: JSON.stringify({ initialized: true, dirty: false }) });
  const meta = h.api.readMeta();
  assert.equal(meta.__storageInvalid, true);
  assert.equal(meta.__storageState, 'partial');
  assert.equal(h.api.writeMeta(meta), false);
});

test('shared metadata: malformed JSON and invalid field types fail closed', () => {
  const h = harness({ [KEY]: '{broken' });
  assert.equal(h.api.readMeta().__storageState, 'malformed');
  h.map.set(KEY, JSON.stringify({ ...validMeta, dirtyNotes: 'not-an-array' }));
  assert.equal(h.api.readMeta().__storageState, 'malformed');
});

test('shared metadata write verifies storage read-back', () => {
  const h = harness();
  assert.equal(h.api.writeMeta(validMeta), true);
  h.corrupt(true);
  assert.equal(h.api.writeMeta(validMeta), false);
});

test('legacy Student Service metadata distinguishes absent, valid, partial and malformed', () => {
  const key = 'kgeu_student_service_sync_v1';
  const h = harness();
  assert.equal(h.api.readLegacyServiceSyncMetaForSharedSync().exists, false);
  h.map.set(key, JSON.stringify({ dirty: false, lastServerSync: 10 }));
  assert.equal(h.api.readLegacyServiceSyncMetaForSharedSync().valid, true);
  h.map.set(key, JSON.stringify({ lastServerSync: 10 }));
  assert.equal(h.api.readLegacyServiceSyncMetaForSharedSync().valid, false);
  h.map.set(key, '{broken');
  assert.equal(h.api.readLegacyServiceSyncMetaForSharedSync().valid, false);
});
