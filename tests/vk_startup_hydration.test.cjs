const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const html = fs.readFileSync(path.join(__dirname, '..', 'apps', 'vk', 'index.html'), 'utf8');

function extract(start, end) {
  const from = html.indexOf(start);
  assert.notEqual(from, -1, 'missing source marker: ' + start);
  const to = html.indexOf(end, from + start.length);
  assert.notEqual(to, -1, 'missing end marker: ' + end);
  return html.slice(from, to);
}

const helperSource = extract('  function readLegacyServiceSyncMetaForSharedSync()', '  async function syncNow(reason)');
const syncSource = extract('  async function syncNow(reason)', '  async function linkAccount()');

function clone(value) {
  return value == null ? value : JSON.parse(JSON.stringify(value));
}

function emptyService() {
  return { version: 4, schemaVersion: 4, tasks: [], deadlines: [], events: [], hostel: { totalGoal: 250, adminGoal: 100, socialGoal: 150, work: [], social: [] }, reminders: { enabled: false, taskDays: 1, deadlineDays: 1, eventDays: 1 } };
}

function serviceWithTask(id, title) {
  const value = emptyService();
  value.tasks.push({ id, title, done: false });
  return value;
}

function createHarness(options = {}) {
  const state = {
    meta: Object.assign({ initialized: true, lastServerRevision: 7, lastSyncAt: 0, dirty: false, dirtyService: false, dirtyProfile: false, dirtyNotes: [], localChangeVersion: 0 }, clone(options.meta || {})),
    cache: options.cache === undefined ? emptyService() : clone(options.cache),
    legacyMeta: options.legacyMeta === undefined ? { dirty: false, lastServerSync: 0 } : clone(options.legacyMeta),
    remote: options.remote === undefined ? { found: true, revision: 7, updatedAt: 700, serviceData: serviceWithTask('cloud-1', 'Cloud task'), personalData: { version: 1, notes: {} }, profileData: {} } : clone(options.remote),
    applyCount: 0,
    renderCount: 0,
    postCount: 0,
    statuses: [],
    storage: new Map()
  };
  if (state.cache != null) {
    state.storage.set('kgeu_student_service_v1', JSON.stringify(state.cache));
    state.storage.set('kgeu_student_service_cache_v1', JSON.stringify(state.cache));
  }
  if (state.legacyMeta !== null) state.storage.set('kgeu_student_service_sync_v1', JSON.stringify(state.legacyMeta));

  const factory = new Function('state', 'helperSource', 'syncSource', `
    const STUDENT_SERVICE_KEY = 'kgeu_student_service_v1';
    const SERVICE_CACHE_KEY = 'kgeu_student_service_cache_v1';
    const DEFAULT_SERVICE = (${JSON.stringify(emptyService())});
    let busy = false;
    const snapshot = { serviceData: DEFAULT_SERVICE, personalData: { version: 1, notes: {} }, profileData: {} };
    const navigator = { onLine: true };
    const document = { visibilityState: 'visible' };
    const localStorage = {
      getItem(key) { return state.storage.has(key) ? state.storage.get(key) : null; },
      setItem(key, value) { state.storage.set(key, String(value)); },
      removeItem(key) { state.storage.delete(key); }
    };
    const window = {
      kgeuApplySharedServiceData(data, updatedAt) {
        state.applyCount += 1;
        state.cache = JSON.parse(JSON.stringify(data));
        localStorage.setItem(STUDENT_SERVICE_KEY, JSON.stringify(data));
        const legacy = JSON.parse(localStorage.getItem('kgeu_student_service_sync_v1') || '{}');
        legacy.dirty = false;
        legacy.lastServerSync = Number(updatedAt || 0);
        localStorage.setItem('kgeu_student_service_sync_v1', JSON.stringify(legacy));
        return true;
      },
      kgeuMarkStudentServiceSynced() {}
    };
    function readMeta() { return Object.assign({}, state.meta, { dirtyNotes: [...(state.meta.dirtyNotes || [])] }); }
    function writeMeta(meta) { state.meta = Object.assign({}, meta, { dirtyNotes: [...(meta.dirtyNotes || [])] }); }
    function readCachedService() { return state.cache == null ? null : clone(state.cache); }
    function writeCachedService(data) {
      state.cache = clone(data);
      localStorage.setItem(STUDENT_SERVICE_KEY, JSON.stringify(data));
      localStorage.setItem(SERVICE_CACHE_KEY, JSON.stringify(data));
    }
    function hasMeaningfulServiceData(data) {
      if (!data || typeof data !== 'object') return false;
      const hostel = data.hostel && typeof data.hostel === 'object' ? data.hostel : {};
      const reminders = data.reminders && typeof data.reminders === 'object' ? data.reminders : {};
      return ['tasks', 'deadlines', 'events'].some(key => Array.isArray(data[key]) && data[key].length > 0)
        || ['work', 'social'].some(key => Array.isArray(hostel[key]) && hostel[key].length > 0)
        || (hostel.totalGoal != null && Number(hostel.totalGoal) !== 250)
        || (hostel.adminGoal != null && Number(hostel.adminGoal) !== 100)
        || (hostel.socialGoal != null && Number(hostel.socialGoal) !== 150)
        || reminders.enabled === true
        || (reminders.taskDays != null && Number(reminders.taskDays) !== 1)
        || (reminders.deadlineDays != null && Number(reminders.deadlineDays) !== 1)
        || (reminders.eventDays != null && Number(reminders.eventDays) !== 1);
    }
    function stableServiceValue(value) {
      if (Array.isArray(value)) return value.map(stableServiceValue);
      if (!value || typeof value !== 'object') return value;
      const ignored = new Set(['updatedAt', 'version', 'schemaVersion']);
      const result = {};
      Object.keys(value).filter(key => !ignored.has(key)).sort().forEach(key => { result[key] = stableServiceValue(value[key]); });
      return result;
    }
    function sameServiceContent(left, right) {
      try { return JSON.stringify(stableServiceValue(left)) === JSON.stringify(stableServiceValue(right)); }
      catch (e) { return false; }
    }
    function mergeServiceRecords(cloud, local) { return Object.assign({}, cloud, local); }
    function mergeNotes(remote, local) { return { personalData: local, addedLocalNotes: false, conflicts: 0 }; }
    function localPersonal() { return { version: 1, notes: {} }; }
    function readProfile() { return {}; }
    async function applyProfile() { return false; }
    function applyPersonal() {}
    function setLinkUiState() {}
    function setStatus(message, error) { state.statuses.push({ message, error }); }
    function renderSharedServiceView() { state.renderCount += 1; }
    function scheduleSync() {}
    function payloadForSync(personal, profile, expectedRevision) { return { expectedRevision, serviceData: readCachedService() || snapshot.serviceData, personalData: personal, profileData: profile }; }
    async function request(url, options) {
      if (url === '/api/account/me') return { linkedProviders: ['telegram', 'vk'] };
      if (url === '/api/sync' && (!options || options.method === 'GET')) {
        if (state.remote instanceof Error) throw state.remote;
        return clone(state.remote);
      }
      if (url === '/api/sync' && options && options.method === 'POST') {
        state.postCount += 1;
        return { revision: Number(state.remote.revision || 0) + 1, updatedAt: 800 };
      }
      throw new Error('unexpected_request_' + url);
    }
    ${helperSource}
    ${syncSource}
    return { syncNow };
  `);
  return { state, ...factory(state, helperSource, syncSource) };
}

test('empty clean cache hydrates non-empty cloud state at the same revision', async () => {
  const h = createHarness();
  await h.syncNow('startup');
  assert.equal(h.state.applyCount, 1);
  assert.deepEqual(h.state.cache.tasks.map(item => item.id), ['cloud-1']);
  assert.ok(h.state.storage.has('kgeu_vk_service_before_hydration_v1'), 'the prior local cache must be backed up');
});

test('empty local and empty cloud state do not trigger unnecessary hydration', async () => {
  const empty = emptyService();
  const h = createHarness({ cache: empty, remote: { found: true, revision: 7, updatedAt: 700, serviceData: empty, personalData: { version: 1, notes: {} }, profileData: {} } });
  await h.syncNow('startup');
  assert.equal(h.state.applyCount, 0);
  assert.deepEqual(h.state.cache, empty);
});

test('meaningful local state is preserved when cloud content differs at the same revision', async () => {
  const local = serviceWithTask('local-1', 'Local task');
  const h = createHarness({ cache: local });
  await h.syncNow('startup');
  assert.equal(h.state.applyCount, 0);
  assert.deepEqual(h.state.cache, local);
  assert.equal(h.state.postCount, 0);
});

test('dirty local state is not hydrated over by non-empty cloud state', async () => {
  const local = serviceWithTask('local-1', 'Local task');
  const h = createHarness({
    cache: local,
    meta: { dirty: true, dirtyService: true },
    legacyMeta: { dirty: true, lastServerSync: 700 }
  });
  await h.syncNow('startup');
  assert.equal(h.state.applyCount, 0);
  assert.deepEqual(h.state.cache, local);
  assert.equal(h.state.postCount, 1);
});

test('conflicting shared and legacy dirty metadata blocks hydration and POST', async () => {
  const local = serviceWithTask('local-1', 'Local task');
  const h = createHarness({ cache: local, legacyMeta: { dirty: true, lastServerSync: 700 } });
  await h.syncNow('startup');
  assert.equal(h.state.applyCount, 0);
  assert.deepEqual(h.state.cache, local);
  assert.equal(h.state.postCount, 0);
  assert.ok(h.state.statuses.some(item => /метаданные синхронизации/.test(item.message)));
});

test('remote.found=false preserves local state and does not POST', async () => {
  const local = serviceWithTask('local-1', 'Local task');
  const h = createHarness({ cache: local, remote: { found: false, revision: 0 } });
  await h.syncNow('startup');
  assert.equal(h.state.applyCount, 0);
  assert.deepEqual(h.state.cache, local);
  assert.equal(h.state.postCount, 0);
});

test('GET errors preserve local state and do not POST', async () => {
  const local = serviceWithTask('local-1', 'Local task');
  const h = createHarness({ cache: local, remote: new Error('network_down') });
  await h.syncNow('startup');
  assert.equal(h.state.applyCount, 0);
  assert.deepEqual(h.state.cache, local);
  assert.equal(h.state.postCount, 0);
  assert.ok(h.state.statuses.some(item => /недоступна/.test(item.message)));
});

test('newer cloud revision hydrates clean local state but older revision does not', async () => {
  const local = serviceWithTask('local-1', 'Local task');
  const newer = createHarness({ cache: local, remote: { found: true, revision: 8, updatedAt: 800, serviceData: serviceWithTask('cloud-2', 'Cloud newer'), personalData: { version: 1, notes: {} }, profileData: {} } });
  await newer.syncNow('startup');
  assert.equal(newer.state.applyCount, 1);
  assert.deepEqual(newer.state.cache.tasks.map(item => item.id), ['cloud-2']);

  const older = createHarness({ cache: local, remote: { found: true, revision: 6, updatedAt: 600, serviceData: serviceWithTask('cloud-old', 'Cloud older'), personalData: { version: 1, notes: {} }, profileData: {} } });
  await older.syncNow('startup');
  assert.equal(older.state.applyCount, 0);
  assert.deepEqual(older.state.cache, local);
});

test('repeated startup hydration is idempotent and does not duplicate records', async () => {
  const h = createHarness();
  await h.syncNow('startup');
  await h.syncNow('startup');
  assert.equal(h.state.applyCount, 1);
  assert.deepEqual(h.state.cache.tasks.map(item => item.id), ['cloud-1']);
});
