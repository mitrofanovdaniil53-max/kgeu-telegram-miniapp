const assert = require('node:assert/strict');
const fs = require('node:fs');
const test = require('node:test');

const html = fs.readFileSync('index.html', 'utf8');
const start = html.indexOf('  async function serviceAutoSync(reason){');
const end = html.indexOf('  function serviceStartAutoSync(){', start);
assert.ok(start >= 0 && end > start, 'Telegram auto-sync function must exist');
const autoSyncSource = html.slice(start, end);

function deferred() {
  let resolve;
  const promise = new Promise(res => { resolve = res; });
  return { promise, resolve };
}

function createHarness(remote) {
  const gate = deferred();
  const state = {
    meta: { dirty: false, lastServerSync: 200, lastServerRevision: 4 },
    localHasContent: true,
    applied: 0,
    pushes: 0,
    expectedRevision: null,
    statuses: []
  };
  const factory = new Function('state', 'gate', autoSyncSource + `
    let serviceLocalRevision = 10;
    let serviceAutoSyncRunning = false;
    let serviceAutoSyncAgain = false;
    const STUDENT_SERVICE_SYNC_KEY = 'sync-meta';
    const localStorage = {
      setItem(key, value) {
        if (key === STUDENT_SERVICE_SYNC_KEY) state.meta = JSON.parse(value);
      }
    };
    function serviceTelegramInitData() { return 'available'; }
    function serviceSyncMeta() { return Object.assign({}, state.meta); }
    function serviceHasLocalContent() { return state.localHasContent; }
    function servicePullFromBackend() { return gate.promise; }
    function serviceApplyCloudSnapshot() { state.applied += 1; }
    function serviceRefreshVisibleView() {}
    function serviceSetAutoSyncStatus(message, kind) { state.statuses.push({ message, kind }); }
    function servicePushToBackend(revision) {
      state.pushes += 1;
      state.expectedRevision = revision;
      return Promise.resolve({ revision: revision + 1, updatedAt: 300 });
    }
    return {
      serviceAutoSync,
      editDuringPull() {
        serviceLocalRevision += 1;
        state.meta.dirty = true;
      }
    };
  `);
  return { state, gate, ...factory(state, gate) };
}

test('Telegram does not apply a newer cloud snapshot over an edit made during GET', async () => {
  const h = createHarness();
  const operation = h.serviceAutoSync('test');
  h.editDuringPull();
  h.gate.resolve({ found: true, updatedAt: 201, revision: 5 });
  await operation;

  assert.equal(h.state.applied, 0, 'the cloud snapshot must not overwrite the concurrent local edit');
  assert.equal(h.state.pushes, 0, 'a stale local version must not be pushed over a newer cloud revision');
  assert.ok(h.state.statuses.some(item => item.kind === 'conflict'));
});

test('Telegram refreshes dirty metadata after GET and pushes against an unchanged revision', async () => {
  const h = createHarness();
  const operation = h.serviceAutoSync('test');
  h.editDuringPull();
  h.gate.resolve({ found: true, updatedAt: 200, revision: 4 });
  await operation;

  assert.equal(h.state.applied, 0);
  assert.equal(h.state.pushes, 1, 'the local edit should be uploaded when the cloud revision is unchanged');
  assert.equal(h.state.expectedRevision, 4, 'the write must use the revision returned by GET');
  assert.equal(h.state.meta.dirty, false, 'successful upload should clear the dirty flag');
});

test('Telegram manual cloud restore aborts if local data changes during GET or confirmation', () => {
  const pullStart = html.indexOf("if(a==='pull-cloud'){");
  const pullEnd = html.indexOf("if(a==='export-sync')", pullStart);
  assert.ok(pullStart >= 0 && pullEnd > pullStart, 'manual pull handler must exist');
  const handler = html.slice(pullStart, pullEnd);
  const capture = handler.indexOf('const localRevisionAtPullStart=serviceLocalRevision;');
  const get = handler.indexOf('const snapshot=await servicePullFromBackend();');
  const firstGuard = handler.indexOf("if(serviceLocalRevision!==localRevisionAtPullStart)throw new Error('local_changes_during_cloud_restore');");
  const confirm = handler.indexOf('window.confirm(');
  const secondGuard = handler.indexOf("if(serviceLocalRevision!==localRevisionAtPullStart)throw new Error('local_changes_during_cloud_restore');", firstGuard + 1);
  const apply = handler.indexOf('serviceApplyCloudSnapshot(snapshot);');
  assert.ok(capture >= 0 && capture < get);
  assert.ok(get < firstGuard && firstGuard < confirm);
  assert.ok(confirm < secondGuard && secondGuard < apply);
  assert.match(handler, /local_changes_during_cloud_restore/);
});

const manualStart = html.indexOf("if(a==='sync-now'){");
const manualEnd = html.indexOf("if(a==='pull-cloud'){", manualStart);
assert.ok(manualStart >= 0 && manualEnd > manualStart, 'Telegram manual push handler must exist');
const manualPushSource = html.slice(manualStart, manualEnd);

function createManualPushHarness(postGate) {
  const state = {
    meta: { dirty: true, lastServerSync: 200, lastServerRevision: 4 },
    pushStarted: false,
    expectedRevision: null,
    scheduled: 0,
    feedback: { textContent: '' },
    app: { innerHTML: '' }
  };
  const factory = new Function('state', 'postGate', `
    let serviceLocalRevision = 20;
    const STUDENT_SERVICE_SYNC_KEY = 'sync-meta';
    const localStorage = {
      setItem(key, value) {
        if (key === STUDENT_SERVICE_SYNC_KEY) state.meta = JSON.parse(value);
      }
    };
    const window = { confirm() { return true; } };
    const document = {
      getElementById(id) {
        if (id === 'service-sync-feedback') return state.feedback;
        if (id === 'app') return state.app;
        return null;
      }
    };
    function serviceSyncMeta() { return Object.assign({}, state.meta); }
    function servicePullFromBackend() {
      return Promise.resolve({ found: true, revision: 4, updatedAt: 200 });
    }
    function servicePushToBackend(revision) {
      state.pushStarted = true;
      state.expectedRevision = revision;
      return postGate.promise;
    }
    function serviceHasLocalContent() { return true; }
    function serviceScheduleAutoSync() { state.scheduled += 1; }
    function serviceEsc(value) { return String(value); }
    function serviceRenderSync() { return 'sync'; }
    function serviceBind() {}
    function toast() {}
    return {
      run: async function(a) { ${manualPushSource} },
      editDuringPost() {
        serviceLocalRevision += 1;
        state.meta.dirty = true;
      }
    };
  `);
  return { state, ...factory(state, postGate) };
}

test('Telegram manual push keeps edits made while POST is pending', async () => {
  const postGate = deferred();
  const h = createManualPushHarness(postGate);
  const operation = h.run('sync-now');
  for (let i = 0; i < 20 && !h.state.pushStarted; i += 1) {
    await new Promise(resolve => setImmediate(resolve));
  }
  assert.equal(h.state.pushStarted, true);
  h.editDuringPost();
  postGate.resolve({ revision: 5, updatedAt: 300, status: 'saved' });
  await operation;

  assert.equal(h.state.expectedRevision, 4);
  assert.equal(h.state.meta.lastServerRevision, 5);
  assert.equal(h.state.meta.dirty, true, 'a successful older payload must not clear a newer local edit');
  assert.equal(h.state.scheduled, 1, 'the newer local edit must be queued for another sync');
  assert.match(h.state.feedback.textContent, /новые локальные изменения/);
});
