const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const html = fs.readFileSync(path.join(__dirname, '..', 'apps', 'vk', 'index.html'), 'utf8');

function extract(start, end) {
  const from = html.indexOf(start);
  assert.notEqual(from, -1, 'missing source marker: ' + start);
  const to = html.indexOf(end, from + start.length);
  assert.notEqual(to, -1, 'missing end marker: ' + end);
  return html.slice(from, to).trim();
}

const guardSource = extract('  function guardManualSyncLocalChanges(', '\n  async function mergeBothVersions()');
const mergeSource = extract('  async function mergeBothVersions()', '\n  async function forcePushLocalVersion()');
const pushSource = extract('  async function forcePushLocalVersion()', '\n  async function forcePullCloudVersion()');
const pullSource = extract('  async function forcePullCloudVersion()', '\n\n  function bindControls()');

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function createHarness(options = {}) {
  const state = {
    meta: {
      localChangeVersion: 1, lastServerRevision: 3, lastSyncAt: 0,
      initialized: true, dirty: true, dirtyNotes: ['group:14541::Math'],
      dirtyProfile: false, dirtyService: true
    },
    personal: { version: 1, notes: { local: 'before' }, updatedAt: 10 },
    service: { tasks: [{ id: 'local', title: 'Local version' }], deadlines: [], events: [], hostel: { work: [], social: [] } },
    profile: { activeGroup: { id: 14541, name: 'М-1-25', institute: 'ИЦТЭ' }, settings: { theme: 'light' } },
    remote: {
      found: true, revision: 4, updatedAt: 40,
      serviceData: { tasks: [{ id: 'cloud', title: 'Cloud version' }], deadlines: [], events: [], hostel: { work: [], social: [] } },
      personalData: { version: 1, notes: { cloud: 'cloud note' }, updatedAt: 40 },
      profileData: { activeGroup: { id: 14541, name: 'М-1-25', institute: 'ИЦТЭ' }, settings: { theme: 'dark' } }
    },
    getStarted: false, postStarted: false, postPayload: null, postCalls: 0,
    appliedPersonalCount: 0, appliedProfileCount: 0, cacheWrites: 0,
    scheduled: 0, statuses: [], backups: []
  };

  const factorySource = [
    'let busy = false;',
    'const DEFAULT_SERVICE = { tasks: [], deadlines: [], events: [], hostel: { work: [], social: [] } };',
    'const snapshot = {};',
    'const window = { confirm: () => true };',
    'const localStorage = { setItem(key, value) { state.backups.push({ key, value }); } };',
    'function readMeta() { return state.meta; }',
    'function writeMeta(meta) { state.meta = Object.assign({}, meta, { dirtyNotes: [...(meta.dirtyNotes || [])] }); }',
    'function scheduleSync() { state.scheduled += 1; }',
    'function renderSharedServiceView() {}',
    'function setStatus(message) { state.statuses.push(String(message)); }',
    'function localSharedService() { return JSON.parse(JSON.stringify(state.service)); }',
    'function localPersonal() { return JSON.parse(JSON.stringify(state.personal)); }',
    'function readProfile() { return JSON.parse(JSON.stringify(state.profile)); }',
    'function mergeServiceRecords(cloud, local) { return Object.assign({}, cloud, { tasks: [...(cloud.tasks || []), ...(local.tasks || [])] }); }',
    'function mergeNotes(cloud, local) { return { personalData: { version: 1, notes: Object.assign({}, cloud.notes || {}, local.notes || {}), updatedAt: 50 }, conflicts: 0 }; }',
    'function payloadForSync(personal, profile, revision, service) { return { personalData: personal, profileData: profile, expectedRevision: revision, serviceData: service }; }',
    'async function request(path, options) {',
    '  if (options.method === "GET") { state.getStarted = true; return getGate ? await getGate.promise : state.remote; }',
    '  state.postStarted = true; state.postCalls += 1; state.postPayload = JSON.parse(options.body);',
    '  return postGate ? await postGate.promise : { revision: 5, updatedAt: 50 };',
    '}',
    'function applyPersonal(personal) { state.appliedPersonalCount += 1; state.personal = JSON.parse(JSON.stringify(personal)); }',
    'async function applyProfile(profile) { state.appliedProfileCount += 1; if (profileGate) await profileGate.promise; state.profile = JSON.parse(JSON.stringify(profile)); }',
    'function writeCachedService(service) { state.cacheWrites += 1; state.service = JSON.parse(JSON.stringify(service)); }',
    guardSource,
    mergeSource,
    pushSource,
    pullSource,
    'return { mergeBothVersions, forcePushLocalVersion, forcePullCloudVersion };'
  ].join('\n');
  const factory = new Function('state', 'getGate', 'postGate', 'profileGate', factorySource);
  const getGate = options.getGate || null;
  const postGate = options.postGate || null;
  const profileGate = options.profileGate || null;
  return { state, ...factory(state, getGate, postGate, profileGate) };
}

function markLocalEdit(state, suffix = 'edited') {
  state.meta.localChangeVersion = Number(state.meta.localChangeVersion || 0) + 1;
  state.meta.dirty = true;
  state.meta.dirtyService = true;
  state.personal = { version: 1, notes: { local: suffix }, updatedAt: Date.now() };
  state.service = { tasks: [{ id: 'local-new', title: suffix }], deadlines: [], events: [], hostel: { work: [], social: [] } };
}

async function waitFor(predicate) {
  for (let i = 0; i < 20; i += 1) {
    if (predicate()) return;
    await new Promise(resolve => setImmediate(resolve));
  }
  assert.fail('timed out waiting for async operation');
}

test('merge aborts before writing if a local edit occurs during cloud GET', async () => {
  const getGate = deferred();
  const h = createHarness({ getGate });
  const operation = h.mergeBothVersions();
  markLocalEdit(h.state, 'edit-during-get');
  getGate.resolve(h.state.remote);
  await operation;
  assert.equal(h.state.postCalls, 0);
  assert.equal(h.state.personal.notes.local, 'edit-during-get');
  assert.equal(h.state.service.tasks[0].title, 'edit-during-get');
  assert.equal(h.state.meta.dirty, true);
  assert.ok(h.state.scheduled > 0);
});

test('merge keeps newer local edits if they arrive while POST is pending', async () => {
  const postGate = deferred();
  const h = createHarness({ postGate });
  const operation = h.mergeBothVersions();
  await waitFor(() => h.state.postStarted);
  markLocalEdit(h.state, 'edit-during-post');
  postGate.resolve({ revision: 5, updatedAt: 50 });
  await operation;
  assert.equal(h.state.personal.notes.local, 'edit-during-post');
  assert.equal(h.state.service.tasks[0].title, 'edit-during-post');
  assert.equal(h.state.appliedPersonalCount, 0);
  assert.equal(h.state.cacheWrites, 0);
  assert.equal(h.state.meta.dirty, true);
  assert.equal(h.state.meta.lastServerRevision, 5);
  assert.ok(h.state.scheduled > 0);
});

test('merge keeps newer local edits if they arrive while applying the merged profile', async () => {
  const profileGate = deferred();
  const h = createHarness({ profileGate });
  const operation = h.mergeBothVersions();
  await waitFor(() => h.state.appliedProfileCount > 0);
  markLocalEdit(h.state, 'edit-during-profile-apply');
  profileGate.resolve();
  await operation;
  assert.equal(h.state.personal.notes.local, 'edit-during-profile-apply');
  assert.equal(h.state.service.tasks[0].title, 'edit-during-profile-apply');
  assert.equal(h.state.appliedPersonalCount, 0);
  assert.equal(h.state.cacheWrites, 0);
  assert.equal(h.state.meta.dirty, true);
  assert.equal(h.state.meta.lastServerRevision, 5);
});

test('force push aborts if a local edit occurs during cloud GET', async () => {
  const getGate = deferred();
  const h = createHarness({ getGate });
  const operation = h.forcePushLocalVersion();
  markLocalEdit(h.state, 'push-edit-during-get');
  getGate.resolve(h.state.remote);
  await operation;
  assert.equal(h.state.postCalls, 0);
  assert.equal(h.state.personal.notes.local, 'push-edit-during-get');
  assert.equal(h.state.meta.dirty, true);
});

test('force push keeps newer local edits if they arrive while POST is pending', async () => {
  const postGate = deferred();
  const h = createHarness({ postGate });
  const operation = h.forcePushLocalVersion();
  await waitFor(() => h.state.postStarted);
  markLocalEdit(h.state, 'push-edit-during-post');
  postGate.resolve({ revision: 5, updatedAt: 50 });
  await operation;
  assert.equal(h.state.personal.notes.local, 'push-edit-during-post');
  assert.equal(h.state.service.tasks[0].title, 'push-edit-during-post');
  assert.equal(h.state.appliedPersonalCount, 0);
  assert.equal(h.state.cacheWrites, 0);
  assert.equal(h.state.meta.dirty, true);
  assert.equal(h.state.meta.lastServerRevision, 5);
});

test('force pull aborts before replacing local data if an edit occurs during cloud GET', async () => {
  const getGate = deferred();
  const h = createHarness({ getGate });
  const operation = h.forcePullCloudVersion();
  markLocalEdit(h.state, 'pull-edit-during-get');
  getGate.resolve(h.state.remote);
  await operation;
  assert.equal(h.state.appliedPersonalCount, 0);
  assert.equal(h.state.cacheWrites, 0);
  assert.equal(h.state.personal.notes.local, 'pull-edit-during-get');
  assert.equal(h.state.service.tasks[0].title, 'pull-edit-during-get');
  assert.equal(h.state.meta.dirty, true);
});

test('force pull keeps edits made while the profile is being applied', async () => {
  const profileGate = deferred();
  const h = createHarness({ profileGate });
  const operation = h.forcePullCloudVersion();
  await waitFor(() => h.state.appliedProfileCount > 0);
  markLocalEdit(h.state, 'pull-edit-during-profile-apply');
  profileGate.resolve();
  await operation;
  assert.equal(h.state.personal.notes.local, 'pull-edit-during-profile-apply');
  assert.equal(h.state.service.tasks[0].title, 'pull-edit-during-profile-apply');
  assert.equal(h.state.meta.dirty, true);
  assert.equal(h.state.meta.lastServerRevision, 4);
  assert.ok(h.state.scheduled > 0);
});
