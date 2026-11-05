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

const saveActiveGroupSource = extract('  function saveActiveGroup(suppressSyncMark)', '\n  if (!activeGroupId)');
const switchGroupSource = extract('  async function switchGroup(id,name,meta)', '\n  window.kgeuApplySharedProfile =');
const sharedProfileSource = extract('  window.kgeuApplySharedProfile = async function(profile, expectedLocalGroupChangeVersion)', '\n\n  function bindGroupModal()');
const applyProfileSource = extract('  async function applyProfile(profile)', '\n  function localPersonal()');
const saveSettingsSource = extract('  function saveSettings()', '\n  function getSystemTheme()');
const dirtyMarkerSource = extract('  window.kgeuSharedSyncMarkDirty = function (kind, key)', '\n  kgeuFlushMigratedNoteSync();');

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
}

function createHarness() {
  const state = {
    activeGroupId: 14541,
    groupName: 'М-1-25',
    instituteName: 'ИЦТЭ',
    cacheKey: 'kgeu_rasp_vk_v2_14541',
    settings: { theme: 'light', autoRefresh: true, density: 'standard', showTeachers: true, showRooms: true, showTypes: true, showBreaks: true },
    meta: { localChangeVersion: 0, localGroupChangeVersion: 0, dirty: false, dirtyProfile: false, dirtyNotes: [], dirtyService: false },
    groupKey: JSON.stringify({ id: 14541, name: 'М-1-25', institute: 'ИЦТЭ' }),
    gates: new Map(),
    pendingGroups: [],
    toasts: []
  };

  const factorySource = [
    'const ACTIVE_GROUP_KEY = "kgeu_vk_active_group_v1";',
    'const PROFILE_KEY = ACTIVE_GROUP_KEY;',
    'const SETTINGS_KEY = "kgeu_vk_settings_v1";',
    'const DEFAULT_GROUP_ID = 14541;',
    'const DEFAULT_GROUP_NAME = "М-1-25";',
    'const DEFAULT_INSTITUTE_NAME = "ИЦТЭ";',
    'const FIRST_STUDY = new Date("2026-09-02T00:00:00");',
    'const hasExplicitGroupFromLaunch = false;',
    'let activeGroupId = state.activeGroupId;',
    'let GROUP_NAME = state.groupName;',
    'let INSTITUTE_NAME = state.instituteName;',
    'let CACHE_KEY = state.cacheKey;',
    'let settings = state.settings;',
    'let allLessons = []; let loadedMonths = {}; let selectedDate = null; let weekAnchor = null; let weekSelected = null; let teacherView = null; let lastUpdated = null;',
    'const storage = new Map([[ACTIVE_GROUP_KEY, state.groupKey], [SETTINGS_KEY, JSON.stringify(state.settings)]]);',
    'const localStorage = { getItem(key) { return storage.has(key) ? storage.get(key) : null; }, setItem(key, value) { storage.set(key, String(value)); if (key === ACTIVE_GROUP_KEY) state.groupKey = String(value); if (key === SETTINGS_KEY) state.settings = JSON.parse(String(value)); } };',
    'const window = { kgeuSharedSyncApplyingProfile: false };',
    'function readMeta() { return state.meta; }',
    'function writeMeta(meta) { state.meta = Object.assign({}, meta, { dirtyNotes: [...(meta.dirtyNotes || [])] }); }',
    'function scheduleSync() {}',
    'function updateGroupLabel() {}',
    'function toast(message) { state.toasts.push(String(message)); }',
    'function rememberGroup() {}',
    'function isoDate() { return "2026-11-05"; }',
    'function fetchRasp(args) { state.pendingGroups.push(Number(args.idGroup)); const gate = state.gates.get(Number(args.idGroup)); return gate ? gate.promise : Promise.resolve({ groupInfo: { name: "Группа " + args.idGroup } }); }',
    'function setActiveGroup(id, name) { activeGroupId = Number(id); GROUP_NAME = String(name || "Группа " + id); CACHE_KEY = "kgeu_rasp_vk_v2_" + id; }',
    'function updateStatusLine() {} function closeGroupModal() {} function renderSavedGroups() {} function applyTheme() {} function syncAppearanceControls() {} function render() {}',
    'const document = { getElementById(id) { if (id === "tabs") return { style: {} }; return { innerHTML: "" }; } };',
    'async function refresh() {}',
    saveSettingsSource,
    saveActiveGroupSource,
    dirtyMarkerSource,
    'window.kgeuSharedSyncMarkDirty = window.kgeuSharedSyncMarkDirty;',
    switchGroupSource,
    sharedProfileSource,
    applyProfileSource,
    'return { applyProfile, switchGroup, saveSettings, getState() { return { activeGroupId, GROUP_NAME, INSTITUTE_NAME, settings, meta: state.meta, groupKey: state.groupKey, settingsKey: localStorage.getItem(SETTINGS_KEY), applying: window.kgeuSharedSyncApplyingProfile }; } };'
  ].join('\n');
  const factory = new Function('state', factorySource);
  const api = factory(state);
  return { state, ...api };
}

async function waitFor(predicate) {
  for (let i = 0; i < 20; i += 1) {
    if (predicate()) return;
    await new Promise(resolve => setImmediate(resolve));
  }
  assert.fail('timed out waiting for async operation');
}

test('a newer local group selection wins over a pending cloud profile switch', async () => {
  const h = createHarness();
  const cloudGate = deferred();
  h.state.gates.set(333, cloudGate);
  const cloudApply = h.applyProfile({
    activeGroup: { id: 333, name: 'Cloud group', institute: 'Cloud institute' },
    settings: { theme: 'light' }
  });
  await waitFor(() => h.state.pendingGroups.includes(333));

  await h.switchGroup(222, 'Local group', { name: 'Local group', institute: 'Local institute' });
  cloudGate.resolve({ groupInfo: { name: 'Cloud group' } });
  await assert.rejects(cloudApply, /shared_profile_apply_superseded/);

  const current = h.getState();
  assert.equal(current.activeGroupId, 222);
  assert.equal(JSON.parse(current.groupKey).id, 222);
  assert.equal(current.meta.localGroupChangeVersion, 1);
  assert.equal(current.meta.dirtyProfile, true);
});

test('user setting changes remain dirty while remote group metadata is loading', async () => {
  const h = createHarness();
  const cloudGate = deferred();
  h.state.gates.set(333, cloudGate);
  const cloudApply = h.applyProfile({
    activeGroup: { id: 333, name: 'Cloud group', institute: 'Cloud institute' },
    settings: { theme: 'dark' }
  });
  await waitFor(() => h.state.pendingGroups.includes(333));

  const whileLoading = h.getState();
  assert.equal(whileLoading.applying, false);
  h.state.settings.theme = 'light';
  h.saveSettings();
  assert.equal(h.state.meta.dirtyProfile, true);
  assert.equal(h.state.meta.localGroupChangeVersion, 0);

  cloudGate.resolve({ groupInfo: { name: 'Cloud group' } });
  await cloudApply;
  const current = h.getState();
  assert.equal(current.activeGroupId, 333);
  assert.equal(current.settings.theme, 'light');
  assert.equal(JSON.parse(current.settingsKey).theme, 'light');
  assert.equal(current.meta.dirtyProfile, true);
  assert.equal(current.meta.localGroupChangeVersion, 0);
});

test('failed cloud group lookup does not leave the profile storage ahead of the active group', async () => {
  const h = createHarness();
  const cloudGate = deferred();
  h.state.gates.set(333, cloudGate);
  const cloudApply = h.applyProfile({
    activeGroup: { id: 333, name: 'Cloud group', institute: 'Cloud institute' },
    settings: { theme: 'dark' }
  });
  await waitFor(() => h.state.pendingGroups.includes(333));
  cloudGate.reject(new Error('upstream_unavailable'));
  await assert.rejects(cloudApply, /upstream_unavailable/);

  const current = h.getState();
  assert.equal(current.activeGroupId, 14541);
  assert.equal(JSON.parse(current.groupKey).id, 14541);
});
