// Integration-style tests for the actual VK hydration/apply/rollback functions.
// The only test double is a deterministic localStorage adapter; application functions
// are extracted verbatim from apps/vk/index.html at test time.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const html = fs.readFileSync(path.join(__dirname, '..', 'apps', 'vk', 'index.html'), 'utf8');

function between(start, end) {
  const from = html.indexOf(start);
  assert.notEqual(from, -1, 'missing application source: ' + start);
  const to = html.indexOf(end, from + start.length);
  assert.notEqual(to, -1, 'missing application source end: ' + end);
  return html.slice(from, to);
}

const sharedMetaSource = between('  let sharedSyncMetadataWriteFailed = false;', '  function getDeviceId()');
const legacyMetaSource = between('  function readLegacyServiceSyncMetaForSharedSync()', '  function backupVkServiceCacheBeforeHydration()');
const cacheSource = between('  function readCachedServiceState()', '  function hasMeaningfulServiceData(data)');
const stableCompareSource = between('  function stableServiceValue(value)', '  // Merge pre-existing VK-local records');
const hydrationSource = between('  function backupVkServiceCacheBeforeHydration()', '  async function syncNow(reason)');
const serviceMetaSource = between('  function serviceSyncMeta()', '  let serviceLocalRevision=0');
const serviceBackupSource = between('  function serviceBackupBeforeCloudRestore(requireBackup)', '  function serviceApplyCloudSnapshot(snapshot, expectedLocalChangeVersion)');
const applySource = between('  window.kgeuApplySharedServiceData=function(data,updatedAt){', '  window.kgeuMarkStudentServiceSynced=function(updatedAt){');

const KEYS = {
  student: 'kgeu_student_service_v1',
  cache: 'kgeu_vk_shared_service_cache_v1',
  legacyMeta: 'kgeu_student_service_sync_v1',
  serviceMeta: 'kgeu_student_service_sync_v1',
  sharedMeta: 'kgeu_vk_shared_sync_meta_v1',
  backup: 'kgeu_vk_service_before_hydration_v1',
  serviceBackup: 'kgeu_student_service_backup_v1',
  personalBackup: 'kgeu_student_personal_backup_before_cloud_restore_v1',
  unsafe: 'kgeu_vk_service_hydration_unsafe_v1'
};

function emptyService() {
  return { version: 4, schemaVersion: 4, updatedAt: 10, tasks: [], deadlines: [], events: [], hostel: { totalGoal: 250, adminGoal: 100, socialGoal: 150, work: [], social: [] }, reminders: { enabled: false, taskDays: 1, deadlineDays: 1, eventDays: 1 } };
}
function withTask(id, title) {
  const value = emptyService();
  value.tasks.push({ id, title, done: false });
  return value;
}
function clone(value) { return value == null ? value : JSON.parse(JSON.stringify(value)); }

function createStorage(seed, faults = {}) {
  const map = new Map(Object.entries(seed || {}));
  const writes = new Map();
  const reads = new Map();
  function count(mapRef, key) {
    const next = (mapRef.get(key) || 0) + 1;
    mapRef.set(key, next);
    return next;
  }
  return {
    map,
    writes,
    reads,
    getItem(key) {
      const n = count(reads, key);
      if ((faults.failReads && (faults.failReads[key] || []).includes(n))) throw new Error('read_failed:' + key);
      return map.has(key) ? map.get(key) : null;
    },
    setItem(key, value) {
      const n = count(writes, key);
      if ((faults.failWrites && (faults.failWrites[key] || []).includes(n))) throw new Error('write_failed:' + key);
      if ((faults.silentWrites && (faults.silentWrites[key] || []).includes(n))) return;
      map.set(key, String(value));
    },
    removeItem(key) {
      const n = count(writes, key);
      if ((faults.failRemoves && (faults.failRemoves[key] || []).includes(n))) throw new Error('remove_failed:' + key);
      map.delete(key);
    },
    setFaults(next) { faults = next || {}; }
  };
}

function createHarness(options = {}) {
  const local = options.local || withTask('local-1', 'Local before');
  const storage = createStorage({
    [KEYS.student]: JSON.stringify(local),
    [KEYS.cache]: JSON.stringify(local),
    [KEYS.legacyMeta]: JSON.stringify({ dirty: false, lastServerSync: 10 }),
    [KEYS.sharedMeta]: JSON.stringify({ initialized: true, lastServerRevision: 7, lastSyncAt: 10, dirty: false, dirtyNotes: [], dirtyProfile: false, dirtyService: false, localGroupChangeVersion: 0, localChangeVersion: 0 })
  }, options.faults || {});
  const factory = new Function('storage', 'local', [
    "const localStorage = storage;",
    "const META_KEY = 'kgeu_vk_shared_sync_meta_v1';",
    "const SERVICE_CACHE_KEY = 'kgeu_vk_shared_service_cache_v1';",
    "const STUDENT_SERVICE_KEY = 'kgeu_student_service_v1';",
    "const STUDENT_SERVICE_SYNC_KEY = 'kgeu_student_service_sync_v1';",
    "const STUDENT_SERVICE_BACKUP_KEY = 'kgeu_student_service_backup_v1';",
    "const KGEU_PERSONAL_DATA_KEY = 'kgeu_vk_personal_data_v1';",
    "const HYDRATION_UNSAFE_KEY = 'kgeu_vk_service_hydration_unsafe_v1';",
    "const DEFAULT_SERVICE = " + JSON.stringify(emptyService()) + ";",
    "let serviceHydrationUnsafe = false;",
    "let serviceData = JSON.parse(JSON.stringify(local));",
    "let kgeuPersonalData = { version: 1, notes: {} };",
    "const statuses = [];",
    "const window = {};",
    "const document = { querySelector() { return null; } };",
    "function setStatus(message) { statuses.push(String(message)); }",
    "function serviceEmptyData() { return " + JSON.stringify(emptyService()) + "; }",
    "function serviceNormalizeData(value) { return JSON.parse(JSON.stringify(value || serviceEmptyData())); }",
    "function serviceRefreshVisibleView() {}",
    stableCompareSource,
    serviceBackupSource,
    serviceMetaSource,
    applySource,
    "let failMemoryRestore = false;",
    "window.kgeuSetSharedServiceDataInMemory=function(data){if(failMemoryRestore)return false;try{serviceData=serviceNormalizeData(data||serviceEmptyData());return true;}catch(e){return false;}};",
    sharedMetaSource,
    legacyMetaSource,
    cacheSource,
    hydrationSource,
    "return { readMeta, writeMeta, readLegacyServiceSyncMetaForSharedSync, readCachedService, readCachedServiceState, writeCachedService, backupVkServiceCacheBeforeHydration, restoreVkServiceCacheAfterFailedHydration, applyCloudServiceDataSafely, getMemory:()=>serviceData, statuses, unsafe:()=>serviceHydrationUnsafe, metadataWriteFailed:()=>sharedSyncMetadataWriteFailed, failMemoryRestore:()=>{failMemoryRestore=true;}, window };"
  ].join('\n'));
  return { storage, ...factory(storage, local) };
}

test('readMeta distinguishes absent metadata from corrupt or invalid metadata and refuses overwrite', () => {
  const absent = createHarness();
  absent.storage.map.delete(KEYS.sharedMeta);
  assert.equal(absent.readMeta().initialized, false);
  assert.equal(absent.readMeta().__storageInvalid, undefined);
  assert.equal(absent.readMeta().__storageState, 'missing');

  const corrupt = createHarness();
  corrupt.storage.map.set(KEYS.sharedMeta, '{broken');
  const invalid = corrupt.readMeta();
  assert.equal(invalid.__storageInvalid, true);
  assert.equal(corrupt.writeMeta(invalid), false);
  assert.equal(corrupt.storage.map.get(KEYS.sharedMeta), '{broken');

  corrupt.storage.map.set(KEYS.sharedMeta, JSON.stringify({ dirty: 'false' }));
  assert.equal(corrupt.readMeta().__storageInvalid, true);
});

test('legacy metadata with valid old fields remains readable; malformed legacy metadata fails closed', () => {
  const h = createHarness();
  assert.equal(h.readCachedServiceState().valid, true);
  const raw = h.storage.map.get(KEYS.legacyMeta);
  assert.deepEqual(JSON.parse(raw), { dirty: false, lastServerSync: 10 });
  h.storage.map.set(KEYS.legacyMeta, JSON.stringify({ dirty: 'false' }));
  assert.equal(h.readLegacyServiceSyncMetaForSharedSync().valid, false);
  h.storage.map.set(KEYS.legacyMeta, JSON.stringify({ dirty: false, lastServerSync: '10' }));
  assert.equal(h.readLegacyServiceSyncMetaForSharedSync().valid, false);
});

test('backup failure prevents the real application apply function from running', () => {
  const h = createHarness({ faults: { failWrites: { [KEYS.backup]: [1] } } });
  const before = h.getMemory();
  assert.equal(h.applyCloudServiceDataSafely(withTask('cloud-1', 'Cloud'), 20), false);
  assert.deepEqual(h.getMemory(), before);
  assert.equal(h.storage.map.get(KEYS.student), JSON.stringify(before));
});

test('real apply path rolls back when either cache key write fails', () => {
  for (const [key, occurrence] of [[KEYS.cache, 1], [KEYS.student, 2]]) {
    const h = createHarness({ faults: { failWrites: { [key]: [occurrence] } } });
    const before = h.getMemory();
    assert.equal(h.applyCloudServiceDataSafely(withTask('cloud-2', 'Cloud'), 20), false);
    assert.deepEqual(h.getMemory(), before);
    assert.equal(h.storage.map.get(KEYS.student), JSON.stringify(before));
    assert.equal(h.storage.map.get(KEYS.cache), JSON.stringify(before));
    assert.equal(h.unsafe(), false);
  }
});

test('real apply path rolls back when service metadata write fails', () => {
  const h = createHarness({ faults: { failWrites: { [KEYS.serviceMeta]: [1] } } });
  const before = h.getMemory();
  assert.equal(h.applyCloudServiceDataSafely(withTask('cloud-3', 'Cloud'), 30), false);
  assert.deepEqual(h.getMemory(), before);
  assert.equal(h.storage.map.get(KEYS.student), JSON.stringify(before));
  assert.equal(h.storage.map.get(KEYS.serviceMeta), JSON.stringify({ dirty: false, lastServerSync: 10 }));
});

test('real apply path detects silent cache writes through read-back verification', () => {
  const h = createHarness({ faults: { silentWrites: { [KEYS.cache]: [1] } } });
  const before = h.getMemory();
  assert.equal(h.applyCloudServiceDataSafely(withTask('cloud-4', 'Cloud'), 40), false);
  assert.deepEqual(h.getMemory(), before);
  assert.equal(h.storage.map.get(KEYS.cache), JSON.stringify(before));
});

test('rollback attempts every key independently and reports a failed key', () => {
  const keys = [KEYS.student, KEYS.cache, KEYS.serviceMeta, KEYS.sharedMeta];
  for (const failedKey of keys) {
    const h = createHarness({ faults: { failWrites: { [failedKey]: [1] } } });
    assert.equal(h.backupVkServiceCacheBeforeHydration(), true);
    for (const key of keys) h.storage.map.set(key, '"cloud-mutated"');
    const result = h.restoreVkServiceCacheAfterFailedHydration(KEYS.backup);
    assert.equal(result.ok, false);
    assert.ok(result.errors.some(item => item.key === failedKey), JSON.stringify(result));
    for (const key of keys.filter(item => item !== failedKey)) {
      const expected = key === KEYS.student || key === KEYS.cache
        ? JSON.stringify(withTask('local-1', 'Local before'))
        : key === KEYS.legacyMeta || key === KEYS.serviceMeta
          ? JSON.stringify({ dirty: false, lastServerSync: 10 })
          : JSON.stringify({ initialized: true, lastServerRevision: 7, lastSyncAt: 10, dirty: false, dirtyNotes: [], dirtyProfile: false, dirtyService: false, localGroupChangeVersion: 0, localChangeVersion: 0 });
      assert.equal(h.storage.map.get(key), expected, 'other key should still restore: ' + key);
    }
  }
});

test('partial rollback enters unsafe state and blocks repeated hydration', () => {
  const h = createHarness({ faults: { failWrites: { [KEYS.cache]: [1], [KEYS.student]: [3] } } });
  assert.equal(h.applyCloudServiceDataSafely(withTask('cloud-5', 'Cloud'), 50), false);
  assert.equal(h.unsafe(), true);
  assert.equal(h.storage.map.get(KEYS.unsafe), '1');
  const writesBefore = h.storage.writes.get(KEYS.student) || 0;
  assert.equal(h.applyCloudServiceDataSafely(withTask('cloud-6', 'Cloud again'), 60), false);
  assert.equal(h.storage.writes.get(KEYS.student) || 0, writesBefore);
});

test('failed app apply restores in-memory serviceData to the pre-hydration version', () => {
  const h = createHarness({ faults: { failWrites: { [KEYS.serviceMeta]: [1] } } });
  const before = h.getMemory();
  assert.equal(h.applyCloudServiceDataSafely(withTask('cloud-7', 'Cloud'), 70), false);
  assert.deepEqual(h.getMemory(), before);
  assert.equal(h.unsafe(), false);
});

test('a recoverable hydration error can be retried after storage recovers', () => {
  const h = createHarness({ faults: { failWrites: { [KEYS.cache]: [1] } } });
  assert.equal(h.applyCloudServiceDataSafely(withTask('cloud-8', 'Cloud'), 80), false);
  assert.equal(h.unsafe(), false);
  h.storage.setFaults({});
  assert.equal(h.applyCloudServiceDataSafely(withTask('cloud-8', 'Cloud'), 80), true);
  assert.equal(h.getMemory().tasks[0].id, 'cloud-8');
  assert.equal(JSON.parse(h.storage.map.get(KEYS.student)).tasks[0].id, 'cloud-8');
  assert.equal(JSON.parse(h.storage.map.get(KEYS.cache)).tasks[0].id, 'cloud-8');
});


test('rollback detects a silent restore write that fails read-back', () => {
  const h = createHarness();
  assert.equal(h.backupVkServiceCacheBeforeHydration(), true);
  h.storage.map.set(KEYS.sharedMeta, '"changed"');
  h.storage.setFaults({ silentWrites: { [KEYS.sharedMeta]: [1] } });
  const result = h.restoreVkServiceCacheAfterFailedHydration(KEYS.backup);
  assert.equal(result.ok, false);
  assert.ok(result.errors.some(item => item.key === KEYS.sharedMeta));
});


test('shared metadata distinguishes valid, partial, malformed and absent states', () => {
  const h = createHarness();
  assert.equal(h.readMeta().__storageInvalid, undefined);
  assert.equal(h.readMeta().__storageState, 'valid');
  h.storage.map.delete(KEYS.sharedMeta);
  assert.equal(h.readMeta().__storageInvalid, undefined);
  h.storage.map.set(KEYS.sharedMeta, JSON.stringify({ initialized: true, dirty: false }));
  assert.equal(h.readMeta().__storageInvalid, true);
  assert.equal(h.readMeta().__storageState, 'partial');
  h.storage.map.set(KEYS.sharedMeta, '{not-json');
  assert.equal(h.readMeta().__storageState, 'malformed');
});

test('malformed primary cache falls back to a valid secondary cache without hiding local data', () => {
  const local = withTask('secondary-1', 'Secondary survives');
  const h = createHarness({ local });
  h.storage.map.set(KEYS.student, '{broken-primary');
  h.storage.map.set(KEYS.cache, JSON.stringify(local));
  const state = h.readCachedServiceState();
  assert.equal(state.valid, true);
  assert.equal(state.degraded, true);
  assert.equal(state.reason, 'primary_cache_malformed');
  assert.deepEqual(state.data, local);
  assert.deepEqual(h.readCachedService(), local);
});

test('each cache write is attempted and verified independently', () => {
  const value = withTask('write-1', 'Write test');
  for (const key of [KEYS.student, KEYS.cache]) {
    const h = createHarness({ faults: { failWrites: { [key]: [1] } } });
    const result = h.writeCachedService(value);
    assert.equal(result.ok, false);
    assert.ok(result.errors.some(item => item.key === key));
    assert.ok(result.keys.length >= 1);
  }
});


test('failed in-memory restoration marks the app unsafe even when persistent rollback succeeds', () => {
  const h = createHarness({ faults: { failWrites: { [KEYS.serviceMeta]: [1] } } });
  const before = h.getMemory();
  h.failMemoryRestore();
  assert.equal(h.applyCloudServiceDataSafely(withTask('cloud-memory-fail', 'Cloud'), 90), false);
  assert.deepEqual(h.getMemory(), before);
  assert.equal(h.unsafe(), true);
  assert.equal(h.storage.map.get(KEYS.unsafe), '1');
});


test('shared metadata write failure is sticky and detectable by sync preflight', () => {
  const h = createHarness({ faults: { failWrites: { [KEYS.sharedMeta]: [1] } } });
  const next = Object.assign({}, h.readMeta(), { dirty: true, localChangeVersion: 1 });
  assert.equal(h.writeMeta(next), false);
  assert.equal(h.metadataWriteFailed(), true);
  h.storage.setFaults({});
  assert.equal(h.writeMeta(next), true);
  assert.equal(h.metadataWriteFailed(), true, 'a later successful write must not erase uncertainty from the failed write');
});

test('actual apply path handles failure of the primary cache key write before the secondary write', () => {
  const h = createHarness({ faults: { failWrites: { [KEYS.student]: [1] } } });
  const before = h.getMemory();
  assert.equal(h.applyCloudServiceDataSafely(withTask('cloud-primary-fail', 'Cloud'), 90), false);
  assert.deepEqual(h.getMemory(), before);
  assert.equal(h.storage.map.get(KEYS.student), JSON.stringify(before));
  assert.equal(h.storage.map.get(KEYS.cache), JSON.stringify(before));
  assert.equal(h.unsafe(), false);
});
