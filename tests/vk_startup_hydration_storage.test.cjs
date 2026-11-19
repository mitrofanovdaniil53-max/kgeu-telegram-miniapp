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
const hasMeaningfulServiceSource = between('  function hasMeaningfulServiceData(data)', '  function stableServiceValue(value)');
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


// Durable Student Service dirty journal integration coverage.
// These functions are extracted verbatim from apps/vk/index.html; only localStorage,
// network, timer and DOM boundaries are deterministic test adapters.
const serviceSaveSource = between('  function serviceSave(){', '  window.kgeuUpdateSharedServiceDataLocal=function(data){');
const updateSharedLocalSource = between('  window.kgeuUpdateSharedServiceDataLocal=function(data){', '  window.kgeuApplySharedServiceData=function(data,updatedAt){');
const saveSharedServiceSource = between('  function saveSharedServiceData(data, resetFormKind) {', '  function sharedServiceNewId(prefix) {');

const serviceDirtySource = between('  function serviceMarkDirty(){', '  // Used by the separate subject-notes script');
const servicePushSource = between('  async function servicePushToBackend(expectedRevision){', '  async function servicePullFromBackend(){');
const manualPushSource = between('  async function serviceManualSyncPush(){', '  function serviceEsc(s)');
const sharedDirtySource = between('  function scheduleSync() {', '  kgeuFlushMigratedNoteSync();');
const sharedSyncNowSource = between('  async function syncNow(reason)', '  async function linkAccount()');
const cloudApplySource = between('  function serviceApplyCloudSnapshot(snapshot, expectedLocalChangeVersion)', '  async function serviceManualSyncPush(){');
const JOURNAL_KEY = 'kgeu_vk_service_dirty_journal_v1';

function createDirtyJournalRuntime(storage, options = {}) {
  const state = { requests: 0, serviceRequests: 0, scheduled: 0, statuses: [], remote: options.remote || {
    found: true, revision: 99, updatedAt: 9900, serviceData: withTask('cloud-newer', 'Cloud newer'),
    personalData: { version: 1, notes: {} }, profileData: {}
  } };
  const factory = new Function('storage', 'state', [
    'const localStorage = storage;',
    "const STUDENT_SERVICE_KEY = 'kgeu_student_service_v1';",
    "const SERVICE_CACHE_KEY = 'kgeu_vk_shared_service_cache_v1';",
    "const STUDENT_SERVICE_SYNC_KEY = 'kgeu_student_service_sync_v1';",
    "const META_KEY = 'kgeu_vk_shared_sync_meta_v1';",
    "const SERVICE_DIRTY_JOURNAL_KEY = 'kgeu_vk_service_dirty_journal_v1';",
    "const HYDRATION_UNSAFE_KEY = 'kgeu_vk_service_hydration_unsafe_v1';",
    "const STUDENT_SERVICE_BACKUP_KEY = 'kgeu_student_service_backup_v1';",
    "const KGEU_PERSONAL_DATA_KEY = 'kgeu_vk_personal_data_v1';",
    "const DEFAULT_SERVICE = " + JSON.stringify(emptyService()) + ";",
    "const window = { KGEU_VK_PLATFORM: true };",
    "const navigator = { onLine: true };",
    "const document = { visibilityState: 'visible', querySelector() { return null; } };",
    "let serviceData = " + JSON.stringify(withTask('local-before', 'Local before')) + ";",
    "let snapshot = { serviceData: serviceData };",
    "let kgeuPersonalData = { version: 1, notes: {} };",
    "let serviceLocalRevision = 0;",
    "let serviceAutoSyncTimer = null;",
    "let timer = null;",
    "let busy = false;",
    "let serviceHydrationUnsafe = false;",
    "const statuses = state.statuses;",
    "function serviceNormalizeData(value) { return JSON.parse(JSON.stringify(value || DEFAULT_SERVICE)); }",
    "function serviceEmptyData() { return DEFAULT_SERVICE; }",
    "function serviceScheduleAutoSync() {}",
    "function serviceRefreshVisibleView() {}",
    "function toast() {}",
    "function setStatus(message) { state.statuses.push(String(message)); }",
    "function setLinkUiState() {}",
    "function renderSharedServiceView() {}",
    "function setTimeout() { state.scheduled++; return state.scheduled; }",
    "function clearTimeout() {}",
    "function request() { state.requests++; return Promise.resolve(state.remote); }",
    "function serviceSyncPackage() { return {}; }",
    "function serviceSyncRequest() { state.serviceRequests++; return Promise.resolve({ revision: 100, updatedAt: 10000 }); }",
    "function servicePullFromBackend() { state.serviceRequests++; return Promise.resolve(state.remote); }",
    "function serviceHasLocalContent() { return true; }",
    "function readMeta() { return Object.assign({}, state.meta || {}); }",
    "function writeMeta(value) { state.meta = Object.assign({}, value); return true; }",
    "function readCachedServiceState() { return { valid: true, exists: true, data: serviceData }; }",
    "function readCachedService() { return serviceData; }",
    cacheSource,
    "function hasMeaningfulServiceData(data) { return !!(data && data.tasks && data.tasks.length); }",
    "function sameServiceContent(a, b) { return JSON.stringify(a) === JSON.stringify(b); }",
    "function mergeServiceRecords(a, b) { return Object.assign({}, a, b); }",
    "function mergeNotes(remote, local) { return { personalData: local, addedLocalNotes: false, conflicts: 0 }; }",
    "function localPersonal() { return { version: 1, notes: {} }; }",
    "function readProfile() { return {}; }",
    "async function applyProfile() { return false; }",
    "function applyPersonal() {}",
    "function payloadForSync() { return {}; }",
    "function scheduleSync() {}",
    "function applyCloudServiceDataSafely() { state.applies = (state.applies || 0) + 1; return true; }",
    "function kgeuFlushMigratedNoteSync() {}",
    hasMeaningfulServiceSource,
    serviceMetaSource,
    serviceDirtySource,
    serviceSaveSource,
    updateSharedLocalSource,
    sharedMetaSource,
    legacyMetaSource,
    sharedDirtySource,
    saveSharedServiceSource,
    servicePushSource,
    manualPushSource,
    sharedSyncNowSource,
    "return { serviceSave, serviceMarkDirty, saveSharedServiceData, syncNow, servicePushToBackend, serviceManualSyncPush, setServiceData(value) { serviceData = serviceNormalizeData(value); }, getServiceData() { return serviceData; }, readMeta, readServiceDirtyJournal, canSync: window.kgeuCanStudentServiceSync, window };"
  ].join('\n'));
  return { state, ...factory(storage, state) };
}

function cleanDirtyJournalSeed() {
  const local = withTask('local-before', 'Local before');
  return {
    [KEYS.student]: JSON.stringify(local),
    [KEYS.cache]: JSON.stringify(local),
    [KEYS.legacyMeta]: JSON.stringify({ dirty: false, lastLocalSave: 10, lastServerSync: 10 }),
    [KEYS.sharedMeta]: JSON.stringify({
      initialized: true, lastServerRevision: 7, lastSyncAt: 10, dirty: false,
      dirtyNotes: [], dirtyProfile: false, dirtyService: false,
      localGroupChangeVersion: 0, localChangeVersion: 0
    })
  };
}

test('real serviceSave aborts before primary cache write when durable journal write cannot be verified', () => {
  const storage = createStorage(cleanDirtyJournalSeed(), { failWrites: { [JOURNAL_KEY]: [1] } });
  const before = storage.map.get(KEYS.student);
  const h = createDirtyJournalRuntime(storage);
  h.setServiceData(withTask('must-not-persist', 'Must not persist'));
  assert.equal(h.serviceSave(), false);
  assert.equal(storage.map.get(KEYS.student), before);
  assert.equal(storage.map.has(JOURNAL_KEY), false);
});

test('real serviceSave leaves durable journal after both legacy and shared metadata writes fail; reload blocks hydration and every POST route', async () => {
  const storage = createStorage(cleanDirtyJournalSeed(), {
    failWrites: {
      [KEYS.legacyMeta]: [1],
      [KEYS.sharedMeta]: [1]
    }
  });
  const h1 = createDirtyJournalRuntime(storage);
  const localChanged = withTask('local-dirty-survives', 'Local meaningful data');
  h1.setServiceData(localChanged);
  assert.equal(h1.serviceSave(), false);
  assert.equal(storage.map.get(KEYS.student), JSON.stringify(localChanged), 'primary cache write succeeded before metadata failure');
  assert.ok(storage.map.has(JOURNAL_KEY), 'journal remains durable');
  assert.deepEqual(JSON.parse(storage.map.get(KEYS.legacyMeta)), { dirty: false, lastLocalSave: 10, lastServerSync: 10 }, 'old clean legacy metadata remains');
  assert.equal(JSON.parse(storage.map.get(KEYS.sharedMeta)).dirtyService, false, 'old clean shared metadata remains');
  assert.equal(storage.writes.get(KEYS.legacyMeta), 1, 'legacy metadata write was attempted');
  assert.equal(storage.writes.get(KEYS.sharedMeta), 1, 'shared metadata write was attempted independently');

  // Destroy runtime and construct a fresh one over the same durable storage.
  storage.setFaults({});
  const h2 = createDirtyJournalRuntime(storage, { remote: {
    found: true, revision: 99, updatedAt: 9900, serviceData: withTask('cloud-newer', 'Cloud newer'),
    personalData: { version: 1, notes: {} }, profileData: {}
  } });
  await h2.syncNow('startup');
  assert.equal(h2.state.requests, 0, 'startup must stop before GET when journal is present');
  assert.equal(h2.state.applies || 0, 0, 'cloud hydration must not start');
  assert.equal(storage.map.get(KEYS.student), JSON.stringify(localChanged), 'meaningful local primary cache survives reload');
  assert.ok(storage.map.has(JOURNAL_KEY), 'startup must not auto-clear uncertainty');
  await assert.rejects(() => h2.servicePushToBackend(), /student_service_dirty_journal_blocked/);
  await assert.rejects(() => h2.serviceManualSyncPush(), /student_service_dirty_journal_blocked/);
  assert.equal(h2.state.serviceRequests, 0, 'manual paths must be blocked before GET/POST');
});

test('alternate shared service editor save uses the same durable journal and cannot bypass dirty metadata failure', () => {
  const storage = createStorage(cleanDirtyJournalSeed(), {
    failWrites: { [KEYS.legacyMeta]: [1], [KEYS.sharedMeta]: [1] }
  });
  const h = createDirtyJournalRuntime(storage);
  const localChanged = withTask('alternate-save-dirty', 'Alternate save path');
  assert.equal(h.saveSharedServiceData(localChanged), false);
  assert.ok(storage.map.has(JOURNAL_KEY));
  assert.deepEqual(JSON.parse(storage.map.get(KEYS.student)).tasks.map(item => item.id), ['alternate-save-dirty']);
  assert.deepEqual(JSON.parse(storage.map.get(KEYS.cache)).tasks.map(item => item.id), ['alternate-save-dirty']);
  assert.equal(JSON.parse(storage.map.get(KEYS.legacyMeta)).dirty, false);
  assert.equal(JSON.parse(storage.map.get(KEYS.sharedMeta)).dirtyService, false);
});

test('journal is removed only after both dirty metadata values are confirmed and removeItem read-back succeeds', () => {
  const storage = createStorage(cleanDirtyJournalSeed());
  const h = createDirtyJournalRuntime(storage);
  const localChanged = withTask('local-confirmed', 'Local confirmed');
  h.setServiceData(localChanged);
  assert.equal(h.serviceSave(), true);
  assert.equal(storage.map.has(JOURNAL_KEY), false);
  assert.equal(JSON.parse(storage.map.get(KEYS.legacyMeta)).dirty, true);
  const shared = JSON.parse(storage.map.get(KEYS.sharedMeta));
  assert.equal(shared.dirty, true);
  assert.equal(shared.dirtyService, true);
});

test('journal removal failure keeps serviceSave unconfirmed and preserves the journal', () => {
  const storage = createStorage(cleanDirtyJournalSeed(), { failRemoves: { [JOURNAL_KEY]: [1] } });
  const h = createDirtyJournalRuntime(storage);
  h.setServiceData(withTask('local-remove-fail', 'Local remove failure'));
  assert.equal(h.serviceSave(), false);
  assert.ok(storage.map.has(JOURNAL_KEY));
  assert.equal(JSON.parse(storage.map.get(KEYS.legacyMeta)).dirty, true);
  assert.equal(JSON.parse(storage.map.get(KEYS.sharedMeta)).dirtyService, true);
});

test('journal read-back failure after remove restores a durable blocker and returns false', () => {
  const storage = createStorage(cleanDirtyJournalSeed(), { failReads: { [JOURNAL_KEY]: [6] } });
  const h = createDirtyJournalRuntime(storage);
  h.setServiceData(withTask('local-journal-readback', 'Local journal readback'));
  assert.equal(h.serviceSave(), false);
  assert.ok(storage.map.has(JOURNAL_KEY), 'journal must be restored when deletion cannot be verified');
  assert.equal(h.canSync(), false);
});

test('malformed or unreadable dirty journal blocks real startup sync without clearing it', async () => {
  for (const mode of ['malformed', 'unreadable']) {
    const seed = cleanDirtyJournalSeed();
    seed[JOURNAL_KEY] = mode === 'malformed' ? '{broken' : JSON.stringify({ version: 1, dirty: true, createdAt: 10, reason: 'test' });
    const faults = mode === 'unreadable' ? { failReads: { [JOURNAL_KEY]: [1] } } : {};
    const storage = createStorage(seed, faults);
    const h = createDirtyJournalRuntime(storage);
    await h.syncNow('startup');
    assert.equal(h.state.requests, 0, mode);
    assert.equal(h.state.applies || 0, 0, mode);
    assert.ok(storage.map.has(JOURNAL_KEY), mode);
  }
});

test('actual cloud apply does not start when mandatory internal backup cannot be persisted and verified', () => {
  const local = withTask('local-before-cloud', 'Keep local');
  for (const key of [KEYS.serviceBackup, KEYS.personalBackup]) {
    const storage = createStorage({
      [KEYS.student]: JSON.stringify(local),
      [KEYS.serviceMeta]: JSON.stringify({ dirty: true, lastLocalSave: 20, lastServerSync: 10 }),
      [KEYS.personalBackup]: JSON.stringify({ version: 1, notes: { keep: 'local' } })
    }, { failWrites: { [key]: [1] } });
    const factory = new Function('storage', [
      'const localStorage = storage;',
      "const STUDENT_SERVICE_KEY = 'kgeu_student_service_v1';",
      "const STUDENT_SERVICE_SYNC_KEY = 'kgeu_student_service_sync_v1';",
      "const STUDENT_SERVICE_BACKUP_KEY = 'kgeu_student_service_backup_v1';",
      "const KGEU_PERSONAL_DATA_KEY = 'kgeu_vk_personal_data_v1';",
      "let serviceData = " + JSON.stringify(local) + ";",
      "let kgeuPersonalData = { version: 1, notes: { keep: 'local' } };",
      "const window = { KGEU_VK_PLATFORM: true };",
      "function serviceNormalizeData(value) { return JSON.parse(JSON.stringify(value)); }",
      "function serviceRefreshVisibleView() {}",
      serviceBackupSource,
      cloudApplySource,
      "return { serviceApplyCloudSnapshot, get serviceData() { return serviceData; } };"
    ].join('\n'));
    const h = factory(storage);
    assert.throws(() => h.serviceApplyCloudSnapshot({
      found: true, updatedAt: 999, serviceData: withTask('cloud-overwrite', 'Cloud overwrite'),
      personalData: { version: 1, notes: { cloud: 'new' } }
    }, null), /cloud_restore_backup_failed/);
    assert.deepEqual(h.serviceData, local);
    assert.equal(storage.map.get(KEYS.student), JSON.stringify(local));
    assert.equal(storage.writes.get(KEYS.student) || 0, 0, 'cloud apply must not write primary cache before backup verification');
  }
});


test('H09 real cache parser treats absent primary plus meaningful secondary as degraded', () => {
  const local = withTask('secondary-only', 'Secondary only');
  const h = createHarness({ local });
  h.storage.map.delete(KEYS.student);
  h.storage.map.set(KEYS.cache, JSON.stringify(local));
  const state = h.readCachedServiceState();
  assert.equal(state.valid, true);
  assert.equal(state.degraded, true);
  assert.equal(state.reason, 'primary_cache_missing');
  assert.deepEqual(state.data, local);
});

test('H09 real cache parser rejects empty primary that conflicts with meaningful secondary', () => {
  const local = withTask('secondary-meaningful', 'Secondary meaningful');
  const h = createHarness({ local });
  h.storage.map.set(KEYS.student, JSON.stringify(emptyService()));
  h.storage.map.set(KEYS.cache, JSON.stringify(local));
  const state = h.readCachedServiceState();
  assert.equal(state.valid, false);
  assert.equal(state.degraded, true);
  assert.equal(state.reason, 'cache_key_conflict');
});

test('H17 real cache parser covers remaining malformed primary/secondary combinations', () => {
  const local = withTask('cache-valid', 'Valid fallback');
  const cases = [
    { name: 'primary malformed / secondary valid', primary: '{broken', secondary: JSON.stringify(local), valid: true, degraded: true, reason: 'primary_cache_malformed' },
    { name: 'primary valid / secondary malformed', primary: JSON.stringify(local), secondary: '{broken', valid: true, degraded: true, reason: 'secondary_cache_malformed' },
    { name: 'both malformed', primary: '{broken-primary', secondary: '{broken-secondary', valid: false, degraded: true, reason: 'invalid_cache_json' },
    { name: 'primary malformed / secondary absent', primary: '{broken-primary', secondary: null, valid: false, degraded: true, reason: 'invalid_cache_json' },
    { name: 'primary absent / secondary malformed', primary: null, secondary: '{broken-secondary', valid: false, degraded: true, reason: 'invalid_cache_json' }
  ];
  for (const item of cases) {
    const h = createHarness({ local });
    if (item.primary === null) h.storage.map.delete(KEYS.student);
    else h.storage.map.set(KEYS.student, item.primary);
    if (item.secondary === null) h.storage.map.delete(KEYS.cache);
    else h.storage.map.set(KEYS.cache, item.secondary);
    const state = h.readCachedServiceState();
    assert.equal(state.valid, item.valid, item.name);
    assert.equal(state.degraded, item.degraded, item.name);
    assert.equal(state.reason, item.reason, item.name);
    if (item.valid) assert.deepEqual(state.data, local, item.name);
  }
});
