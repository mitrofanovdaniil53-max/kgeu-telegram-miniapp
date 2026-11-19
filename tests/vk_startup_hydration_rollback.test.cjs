// Exercise the actual VK backup and rollback helpers with deterministic storage faults.
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
const source = between('  function backupVkServiceCacheBeforeHydration()', '  function applyCloudServiceDataSafely(data, updatedAt)');
const keys = {
  student: 'kgeu_student_service_v1',
  cache: 'kgeu_vk_shared_service_cache_v1',
  sync: 'kgeu_student_service_sync_v1',
  meta: 'kgeu_vk_shared_sync_meta_v1',
  backup: 'kgeu_vk_service_before_hydration_v1'
};
const original = {
  student: JSON.stringify({ tasks: [{ id: 'local' }] }),
  cache: JSON.stringify({ tasks: [{ id: 'local' }] }),
  sync: JSON.stringify({ dirty: false, lastServerSync: 10 }),
  meta: JSON.stringify({ initialized: true, dirty: false, dirtyNotes: [], dirtyProfile: false, dirtyService: false, lastServerRevision: 7, lastSyncAt: 10 })
};
function harness(faults = {}) {
  const map = new Map([
    [keys.student, original.student], [keys.cache, original.cache],
    [keys.sync, original.sync], [keys.meta, original.meta]
  ]);
  const writes = new Map();
  const reads = new Map();
  const memory = { tasks: [{ id: 'local' }] };
  const localStorage = {
    getItem(key) {
      const n = (reads.get(key) || 0) + 1; reads.set(key, n);
      if (faults.failGet && faults.failGet.key === key && faults.failGet.at === n) throw new Error('injected_get_failure');
      return map.has(key) ? map.get(key) : null;
    },
    setItem(key, value) {
      const n = (writes.get(key) || 0) + 1; writes.set(key, n);
      if (faults.failSet && faults.failSet.key === key && faults.failSet.at === n) throw new Error('injected_set_failure');
      if (faults.silentSet && faults.silentSet.key === key && faults.silentSet.at === n) return;
      map.set(key, String(value));
    },
    removeItem(key) {
      const n = (writes.get(key) || 0) + 1; writes.set(key, n);
      if (faults.failRemove && faults.failRemove.key === key && faults.failRemove.at === n) throw new Error('injected_remove_failure');
      map.delete(key);
    }
  };
  const window = { kgeuGetSharedServiceDataInMemory: () => JSON.parse(JSON.stringify(memory)) };
  const api = new Function('localStorage','window','STUDENT_SERVICE_KEY','SERVICE_CACHE_KEY','STUDENT_SERVICE_SYNC_KEY','META_KEY',source + 'return { backupVkServiceCacheBeforeHydration, restoreVkServiceCacheAfterFailedHydration };')(
    localStorage, window, keys.student, keys.cache, keys.sync, keys.meta
  );
  return { map, writes, reads, api };
}

test('backup persists and verifies all cache and metadata snapshots', () => {
  const h = harness();
  assert.equal(h.api.backupVkServiceCacheBeforeHydration(), true);
  const backup = JSON.parse(h.map.get(keys.backup));
  assert.equal(backup.studentService, original.student);
  assert.equal(backup.serviceCache, original.cache);
  assert.equal(backup.serviceSyncMeta, original.sync);
  assert.equal(backup.sharedSyncMeta, original.meta);
  assert.deepEqual(backup.inMemoryService, { tasks: [{ id: 'local' }] });
});

test('rollback attempts every key even when one restoration write fails', () => {
  for (const key of [keys.student, keys.cache, keys.sync, keys.meta]) {
    const h = harness({ failSet: { key, at: 1 } });
    assert.equal(h.api.backupVkServiceCacheBeforeHydration(), true);
    for (const target of [keys.student, keys.cache, keys.sync, keys.meta]) h.map.set(target, '"cloud"');
    const result = h.api.restoreVkServiceCacheAfterFailedHydration(keys.backup);
    assert.equal(result.ok, false);
    assert.ok(result.errors.some(item => item.key === key));
    for (const target of [keys.student, keys.cache, keys.sync, keys.meta]) {
      if (target !== key) assert.equal(h.map.get(target), original[Object.keys(original).find(name => ({student:keys.student,cache:keys.cache,sync:keys.sync,meta:keys.meta}[name]===target))]);
    }
  }
});

test('rollback reports missing or malformed backup without claiming success', () => {
  const h = harness();
  assert.deepEqual(h.api.restoreVkServiceCacheAfterFailedHydration(keys.backup).ok, false);
  h.map.set(keys.backup, '{bad');
  const result = h.api.restoreVkServiceCacheAfterFailedHydration(keys.backup);
  assert.equal(result.ok, false);
  assert.equal(result.errors.length, 1);
});


test('rollback read-back failure is detected independently for every restored key', () => {
  for (const key of [keys.student, keys.cache, keys.sync, keys.meta]) {
    const h = harness({ failGet: { key, at: key === keys.sync ? 3 : 2 } });
    assert.equal(h.api.backupVkServiceCacheBeforeHydration(), true);
    for (const target of [keys.student, keys.cache, keys.sync, keys.meta]) h.map.set(target, '"cloud"');
    const result = h.api.restoreVkServiceCacheAfterFailedHydration(keys.backup);
    assert.equal(result.ok, false, key);
    assert.ok(result.errors.some(item => item.key === key && /injected_get_failure/.test(item.error)), JSON.stringify(result));
    for (const target of [keys.student, keys.cache, keys.sync, keys.meta]) {
      if (target !== key) assert.ok(result.restored.includes(target), 'remaining key should restore: ' + target);
    }
  }
});

test('rollback reports removeItem failure for every key absent in the backup', () => {
  for (const key of [keys.student, keys.cache, keys.sync, keys.meta]) {
    const h = harness({ failRemove: { key, at: 1 } });
    h.map.delete(key);
    assert.equal(h.api.backupVkServiceCacheBeforeHydration(), true);
    h.map.set(key, '"cloud-added"');
    const result = h.api.restoreVkServiceCacheAfterFailedHydration(keys.backup);
    assert.equal(result.ok, false, key);
    assert.ok(result.errors.some(item => item.key === key && /injected_remove_failure/.test(item.error)), JSON.stringify(result));
    assert.equal(h.map.get(key), '"cloud-added"', 'failed removal must remain visible as an error');
    for (const other of [keys.student, keys.cache, keys.sync, keys.meta]) {
      if (other !== key) assert.ok(result.restored.includes(other), 'other key should restore: ' + other);
    }
  }
});

test('rollback continues after multiple simultaneous errors and reports each one', () => {
  const h = harness({
    failSet: { key: keys.student, at: 1 },
    silentSet: { key: keys.cache, at: 1 },
    failGet: { key: keys.sync, at: 3 }
  });
  assert.equal(h.api.backupVkServiceCacheBeforeHydration(), true);
  for (const target of [keys.student, keys.cache, keys.sync, keys.meta]) h.map.set(target, '"cloud"');
  const result = h.api.restoreVkServiceCacheAfterFailedHydration(keys.backup);
  assert.equal(result.ok, false);
  assert.deepEqual(new Set(result.errors.map(item => item.key)), new Set([keys.student, keys.cache, keys.sync]));
  assert.ok(result.restored.includes(keys.meta), 'rollback must continue and restore the remaining key');
  assert.equal(h.map.get(keys.meta), original.meta);
});

test('rollback rejects backups with missing or damaged individual key snapshots', () => {
  const h = harness();
  assert.equal(h.api.backupVkServiceCacheBeforeHydration(), true);
  const backup = JSON.parse(h.map.get(keys.backup));
  delete backup.serviceCache;
  backup.studentService = { corrupted: true };
  h.map.set(keys.backup, JSON.stringify(backup));
  for (const target of [keys.student, keys.cache, keys.sync, keys.meta]) h.map.set(target, '"cloud"');
  const result = h.api.restoreVkServiceCacheAfterFailedHydration(keys.backup);
  assert.equal(result.ok, false);
  assert.ok(result.errors.some(item => item.key === keys.student && /backup_value_invalid/.test(item.error)));
  assert.ok(result.errors.some(item => item.key === keys.cache && /backup_value_missing/.test(item.error)));
  assert.ok(result.restored.includes(keys.sync));
  assert.ok(result.restored.includes(keys.meta));
  assert.equal(h.map.get(keys.student), '"cloud"');
  assert.equal(h.map.get(keys.cache), '"cloud"');
});
