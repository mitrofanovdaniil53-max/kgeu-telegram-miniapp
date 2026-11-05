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

const packageSource = extract('  function serviceSyncPackage(expectedRevision)', '\n  function serviceExportSyncPackage()');
const manualPushSource = extract('  async function serviceManualSyncPush()', '\n  function serviceEsc(s)');
const cloudApplySource = extract('  function serviceApplyCloudSnapshot(snapshot, expectedLocalChangeVersion)', '\n\n  // Refresh only the visible Student Service screen');
const restoreHandlerSource = html.slice(html.indexOf("if(a==='pull-cloud'){"), html.indexOf("if(a==='create-vk-link-code'){"));

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
}

function createManualPushHarness(options = {}) {
  const state = {
    meta: { localChangeVersion: 4, lastServerRevision: 7, lastSyncAt: 0, initialized: true, dirty: true, dirtyNotes: [], dirtyProfile: false, dirtyService: true },
    serviceMeta: { deviceId: 'vk-device', dirty: true, lastLocalSave: 10, lastServerSync: 100 },
    expectedRevision: null,
    postStarted: false,
    scheduled: 0,
    autoScheduled: 0,
    markedClean: 0,
    storedServiceMeta: null
  };
  const factorySource = [
    'let serviceLocalRevision = 2;',
    'let serviceData = { updatedAt: 20 };',
    'let activeGroupId = 14541, GROUP_NAME = "М-1-25", INSTITUTE_NAME = "ИЦТЭ";',
    'let settings = { theme: "light" };',
    'const STUDENT_SERVICE_SYNC_KEY = "student-service-sync";',
    'const window = { KGEU_VK_PLATFORM: true, kgeuSharedSyncMarkClean(result) { state.markedClean += 1; state.meta.lastServerRevision = result.revision; state.meta.dirty = false; } };',
    'const localStorage = { setItem(key, value) { if (key === STUDENT_SERVICE_SYNC_KEY) state.storedServiceMeta = JSON.parse(value); } };',
    'function serviceSyncMeta() { return state.serviceMeta; }',
    'function readMeta() { return state.meta; }',
    'function writeMeta(meta) { state.meta = Object.assign({}, meta, { dirtyNotes: [...(meta.dirtyNotes || [])] }); }',
    'function scheduleSync() { state.scheduled += 1; }',
    'function serviceScheduleAutoSync() { state.autoScheduled += 1; }',
    'function servicePullFromBackend() { return getGate ? getGate.promise : Promise.resolve(state.remote); }',
    'function servicePushToBackend(expectedRevision) { state.expectedRevision = expectedRevision; state.postStarted = true; return postGate ? postGate.promise : Promise.resolve({ revision: 9, updatedAt: 200 }); }',
    'function serviceHasLocalContent() { return false; }',
    'const windowConfirm = true;',
    'window.confirm = () => windowConfirm;',
    manualPushSource,
    'return { serviceManualSyncPush };'
  ].join('\n');
  const factory = new Function('state', 'getGate', 'postGate', factorySource);
  const getGate = options.getGate || null;
  const postGate = options.postGate || null;
  return { state, ...factory(state, getGate, postGate) };
}

test('VK service sync package includes the expected CAS revision', () => {
  const factorySource = [
    'const STUDENT_SERVICE_SCHEMA = 4;',
    'const window = { KGEU_VK_PLATFORM: true };',
    'const serviceData = { tasks: [] };',
    'const kgeuPersonalData = { version: 1, notes: {} };',
    'const activeGroupId = 14541, DEFAULT_GROUP_ID = 14541, GROUP_NAME = "М-1-25", DEFAULT_GROUP_NAME = "М-1-25", INSTITUTE_NAME = "ИЦТЭ", DEFAULT_INSTITUTE_NAME = "ИЦТЭ";',
    'const settings = { theme: "light" };',
    'function serviceSyncMeta() { return { deviceId: "vk-device" }; }',
    'function readMeta() { return { lastServerRevision: 7 }; }',
    'function serviceNormalizeData(data) { return data; }',
    packageSource,
    'return serviceSyncPackage;'
  ].join('\n');
  const serviceSyncPackage = new Function(factorySource)();
  assert.equal(serviceSyncPackage(8).expectedRevision, 8);
  assert.equal(serviceSyncPackage().expectedRevision, 7);
});

test('manual VK push uses the revision returned by its GET before POST', async () => {
  const h = createManualPushHarness();
  h.state.remote = { found: true, revision: 8, updatedAt: 100 };
  const outcome = await h.serviceManualSyncPush();
  assert.equal(h.state.expectedRevision, 8);
  assert.equal(outcome.localChangesPending, false);
  assert.equal(h.state.markedClean, 1);
  assert.equal(h.state.meta.lastServerRevision, 9);
  assert.equal(h.state.serviceMeta.dirty, false);
});

test('manual VK push keeps newer local edits dirty when an edit arrives during POST', async () => {
  const postGate = deferred();
  const h = createManualPushHarness({ postGate });
  h.state.remote = { found: true, revision: 8, updatedAt: 100 };
  const operation = h.serviceManualSyncPush();
  for (let i = 0; i < 20 && !h.state.postStarted; i += 1) {
    await new Promise(resolve => setImmediate(resolve));
  }
  assert.equal(h.state.postStarted, true);
  h.state.meta.localChangeVersion += 1;
  h.state.meta.dirty = true;
  h.state.meta.dirtyNotes = ['group:14541::Math'];
  postGate.resolve({ revision: 9, updatedAt: 200 });
  const outcome = await operation;
  assert.equal(outcome.localChangesPending, true);
  assert.equal(h.state.markedClean, 0);
  assert.equal(h.state.meta.lastServerRevision, 9);
  assert.equal(h.state.meta.dirty, true);
  assert.equal(h.state.meta.dirtyNotes[0], 'group:14541::Math');
  assert.equal(h.state.scheduled, 1);
  assert.equal(h.state.serviceMeta.dirty, true);
  assert.equal(h.state.serviceMeta.lastServerSync, 200);
});

test('cloud restore rejects before backup or mutation when VK local generation changed', () => {
  const state = { meta: { localChangeVersion: 5 }, backupCalls: 0, writes: 0, serviceData: { tasks: [{ id: 'local' }] } };
  const factorySource = [
    'const window = { KGEU_VK_PLATFORM: true };',
    'const localStorage = { setItem() { state.writes += 1; } };',
    'const STUDENT_SERVICE_KEY = "service";',
    'let serviceData = state.serviceData;',
    'function readMeta() { return state.meta; }',
    'function serviceBackupBeforeCloudRestore() { state.backupCalls += 1; }',
    cloudApplySource,
    'return serviceApplyCloudSnapshot;'
  ].join('\n');
  const serviceApplyCloudSnapshot = new Function('state', factorySource)(state);
  assert.throws(
    () => serviceApplyCloudSnapshot({ found: true, serviceData: { tasks: [] } }, 4),
    /local_changes_during_cloud_restore/
  );
  assert.equal(state.backupCalls, 0);
  assert.equal(state.writes, 0);
  assert.equal(state.serviceData.tasks[0].id, 'local');
});

test('VK pull-cloud action captures the generation before GET and passes it to restore guard', () => {
  assert.match(restoreHandlerSource, /localChangeVersionAtPullStart=window\.KGEU_VK_PLATFORM\?Number\(readMeta\(\)\.localChangeVersion\|\|0\):null/);
  assert.match(restoreHandlerSource, /Number\(readMeta\(\)\.localChangeVersion\|\|0\)!==localChangeVersionAtPullStart/);
  assert.match(restoreHandlerSource, /serviceApplyCloudSnapshot\(snapshot,localChangeVersionAtPullStart\)/);
});
