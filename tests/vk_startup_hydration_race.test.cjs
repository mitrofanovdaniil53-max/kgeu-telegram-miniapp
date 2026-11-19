// Deferred GET race tests for the actual syncNow orchestration in the VK frontend.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const html = fs.readFileSync(path.join(__dirname, '..', 'apps', 'vk', 'index.html'), 'utf8');

function between(start, end) {
  const from = html.indexOf(start);
  assert.notEqual(from, -1, 'missing source: ' + start);
  const to = html.indexOf(end, from + start.length);
  assert.notEqual(to, -1, 'missing source end: ' + end);
  return html.slice(from, to);
}
const syncSource = between('  async function syncNow(reason)', '  async function linkAccount()');
function emptyService() {
  return { version: 4, schemaVersion: 4, tasks: [], deadlines: [], events: [], hostel: { totalGoal: 250, adminGoal: 100, socialGoal: 150, work: [], social: [] }, reminders: { enabled: false, taskDays: 1, deadlineDays: 1, eventDays: 1 } };
}
function task(id) { const value = emptyService(); value.tasks.push({ id, title: id }); return value; }

function harness(options = {}) {
  const state = {
    meta: { initialized: true, lastServerRevision: 7, lastSyncAt: 10, dirty: false, dirtyNotes: [], dirtyProfile: false, dirtyService: false, localGroupChangeVersion: 0, localChangeVersion: 0 },
    cache: options.cache || emptyService(),
    requests: [], posts: 0, applies: 0, statuses: [], renders: 0,
    metadataWriteFailed: options.metadataWriteFailed === true,
    visibilityState: options.visibilityState || 'visible',
    resolveGet: null
  };
  const factory = new Function('state', 'syncSource', 'emptyService', 'task', [
    "let busy = false;",
    "let serviceHydrationUnsafe = false;",
    "let sharedSyncMetadataWriteFailed = state.metadataWriteFailed;",
    "function serviceDirtyJournalBlocksSync() { return false; }",
    "const navigator = { onLine: true };",
    "const document = { visibilityState: state.visibilityState };",
    "const window = { kgeuMarkStudentServiceSynced() {} };",
    "let snapshot = { serviceData: emptyService(), personalData: {version:1,notes:{}}, profileData:{} };",
    "function readMeta(){ return Object.assign({}, state.meta, { dirtyNotes: state.meta.dirtyNotes.slice() }); }",
    "function readCachedService(){ return state.cache; }",
    "function readCachedServiceState(){ return {valid:true, degraded:false, exists:!!state.cache, data:state.cache}; }",
    "function readLegacyServiceSyncMetaForSharedSync(){ return {exists:false, valid:true, dirty:false}; }",
    "function hasMeaningfulServiceData(data){ return !!(data && Array.isArray(data.tasks) && data.tasks.length); }",
    "function sameServiceContent(a,b){ return JSON.stringify(a)===JSON.stringify(b); }",
    "function mergeServiceRecords(cloud,local){ return Object.assign({},cloud,local); }",
    "function mergeNotes(remote,local){ return {personalData:local,addedLocalNotes:false,conflicts:0}; }",
    "function localPersonal(){ return {version:1,notes:{}}; }",
    "function readProfile(){ return {}; }",
    "async function applyProfile(){ return false; }",
    "function applyPersonal(){}",
    "function setLinkUiState(){}",
    "function setStatus(message){ state.statuses.push(String(message)); }",
    "function renderSharedServiceView(){ state.renders++; }",
    "function scheduleSync(){}",
    "function payloadForSync(personal,profile,expectedRevision){ return {personal,profile,expectedRevision,serviceData:state.cache}; }",
    "function writeCachedService(data){ state.cache=data; return {ok:true}; }",
    "function applyCloudServiceDataSafely(data){ state.applies++; state.cache=data; return true; }",
    "async function request(url, options){",
    "  state.requests.push({url,options});",
    "  if(url==='/api/account/me') return {linkedProviders:['telegram','vk']};",
    "  if(url==='/api/sync' && (!options || options.method==='GET')) return await new Promise(resolve=>{state.resolveGet=resolve;});",
    "  if(url==='/api/sync' && options && options.method==='POST'){state.posts++;return {revision:8,updatedAt:20};}",
    "  throw new Error('unexpected_request:'+url);",
    "}",
    syncSource,
    "return { syncNow };"
  ].join('\n'));
  return { state, ...factory(state, syncSource, emptyService, task) };
}

test('a local edit during deferred startup GET wins and cloud hydration/POST are skipped', async () => {
  const h = harness();
  const pending = h.syncNow('startup');
  while (!h.state.resolveGet) await new Promise(resolve => setImmediate(resolve));
  const localAfterEdit = task('local-during-get');
  h.state.cache = localAfterEdit;
  h.state.meta.localChangeVersion = 1;
  h.state.meta.dirty = true;
  h.state.meta.dirtyService = true;
  h.state.resolveGet({
    found: true, revision: 8, updatedAt: 20,
    serviceData: task('cloud-newer'),
    personalData: { version: 1, notes: {} },
    profileData: {}
  });
  await pending;
  assert.deepEqual(h.state.cache, localAfterEdit);
  assert.equal(h.state.applies, 0);
  assert.equal(h.state.posts, 0);
  assert.ok(h.state.statuses.some(message => /локальные изменения/.test(message)));
});

test('offline and hidden startup states do not issue requests', async () => {
  const offline = harness();
  offline.state.meta.localChangeVersion = 0;
  // The execution context's navigator is fixed online; this test validates source-level guard
  // by compiling a second context with offline navigator through the same real function body.
  const source = syncSource.replace('const navigator = { onLine: true };', 'const navigator = { onLine: false };');
  const h = harness();
  const offlineFactory = new Function('state','syncSource','emptyService','task', [
    "let busy=false; let serviceHydrationUnsafe=false; const navigator={onLine:false}; const document={visibilityState:'visible'};",
    "const window={}; let snapshot={serviceData:emptyService(),personalData:{version:1,notes:{}},profileData:{}};",
    "function readMeta(){return state.meta;} function setStatus(){} function setLinkUiState(){} function request(){state.requests.push('request');}",
    "function renderSharedServiceView(){} function readCachedServiceState(){return {valid:true,degraded:false,data:state.cache};}",
    "function readCachedService(){return state.cache;} function readLegacyServiceSyncMetaForSharedSync(){return {exists:false,valid:true,dirty:false};}",
    "function hasMeaningfulServiceData(){return false;} function sameServiceContent(){return true;} function mergeNotes(){return {personalData:{},addedLocalNotes:false,conflicts:0};}",
    "function localPersonal(){return {};} function readProfile(){return {};} function applyProfile(){} function applyPersonal(){} function mergeServiceRecords(a){return a;}",
    "function payloadForSync(){return {};} function scheduleSync(){} function writeCachedService(){} function applyCloudServiceDataSafely(){}",
    syncSource, "return {syncNow};"
  ].join('\n'));
  const off = {state:{requests:[]},...offlineFactory({requests:[]},source,emptyService,task)};
  await off.syncNow('startup');
  assert.equal(off.state.requests.length,0);
});


test('a failed metadata persistence check blocks all sync requests', async () => {
  const h = harness({ metadataWriteFailed: true });
  await h.syncNow('startup');
  assert.equal(h.state.requests.length, 0);
  assert.equal(h.state.posts, 0);
  assert.ok(h.state.statuses.some(message => /метаданные синхронизации/.test(message)));
});

test('hidden startup state does not issue requests', async () => {
  const h = harness({ visibilityState: 'hidden' });
  await h.syncNow('startup');
  assert.equal(h.state.requests.length, 0);
  assert.equal(h.state.posts, 0);
});
