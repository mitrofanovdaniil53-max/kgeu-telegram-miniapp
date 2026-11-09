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
