from pathlib import Path
import shutil
import subprocess
import unittest


ROOT = Path(__file__).resolve().parents[1]


class StudentServiceCopyRegressionTest(unittest.TestCase):
    def test_social_attachment_copy_matches_shared_account_sync(self):
        stale = "Файл остаётся в данных этого устройства до подключения синхронизации с ботом."
        replacement = "Подтверждение сохраняется в записи и синхронизируется вместе с общим аккаунтом."
        for relative in ("index.html", "apps/vk/index.html"):
            source = (ROOT / relative).read_text(encoding="utf-8")
            with self.subTest(frontend=relative):
                self.assertNotIn(stale, source)
                self.assertIn(replacement, source)

    def test_telegram_service_home_hides_analytics_but_keeps_implementation(self):
        source = (ROOT / "index.html").read_text(encoding="utf-8")
        start = source.index("function serviceRenderToday()")
        end = source.index("function serviceRenderHostel()", start)
        home_renderer = source[start:end]
        self.assertNotIn('data-service-action="analytics"', home_renderer)
        self.assertIn("function serviceRenderAnalytics(", source)

    def test_dashboard_navigation_is_compact_and_redundant_week_summary_is_removed(self):
        for relative in ("index.html", "apps/vk/index.html"):
            source = (ROOT / relative).read_text(encoding="utf-8")
            with self.subTest(frontend=relative):
                home_start = source.index("function serviceRenderToday()")
                home_end = source.index("function serviceRenderHostel()", home_start)
                home = source[home_start:home_end]
                self.assertIn('class="service-btn service-hostel-entry" data-service-action="hostel"', home)
                self.assertNotIn('class="service-reminder-section"', home)
                self.assertNotIn("На ближайшие 7 дней", home)
                self.assertIn('data-service-action="calendar"', home)
                self.assertIn('data-service-action="study"', home)
                self.assertIn('data-service-action="reminders"', home)

    def test_hostel_is_a_standalone_module_in_both_frontends(self):
        for relative in ("index.html", "apps/vk/index.html"):
            source = (ROOT / relative).read_text(encoding="utf-8")
            with self.subTest(frontend=relative):
                home_start = source.index("function serviceRenderToday()")
                home_end = source.index("function serviceRenderHostel()", home_start)
                home = source[home_start:home_end]
                self.assertIn('data-service-action="hostel"', home)
                self.assertNotIn("service-hostel-section", home)
                hostel_start = source.index("function serviceRenderHostel()")
                hostel_end = source.index("function serviceSubjectList()", hostel_start)
                hostel = source[hostel_start:hostel_end]
                for view in ("overview", "admin", "social", "history"):
                    self.assertIn('data-hostel-panel="' + view + '"', hostel)
                    self.assertIn('data-hostel-view="' + view + '"', hostel)
                self.assertIn("data-service-del-work=", hostel)
                self.assertIn("data-service-del-social=", hostel)
                self.assertIn('data-service-action="export-word"', hostel)

    def test_settings_expose_sync_and_backup_navigation_in_both_frontends(self):
        for relative in ("index.html", "apps/vk/index.html"):
            source = (ROOT / relative).read_text(encoding="utf-8")
            with self.subTest(frontend=relative):
                self.assertIn('data-open-service-view="sync"', source)
                self.assertIn('data-open-service-view="data"', source)
                self.assertIn("serviceRenderSync()", source)
                self.assertIn("serviceRenderData()", source)

    def test_vk_link_code_is_hidden_after_persistent_account_link(self):
        source = (ROOT / "apps" / "vk" / "index.html").read_text(encoding="utf-8")
        self.assertIn("function setLinkUiState(linked)", source)
        self.assertIn("setLinkUiState(linked);", source)
        self.assertIn("Одноразовый код нужен только для первой привязки", source)
        sync_start = source.index("async function syncNow(reason)")
        link_state = source.index("setLinkUiState(linked);", sync_start)
        unlinked_guard = source.index("if (!linked)", link_state)
        self.assertLess(link_state, unlinked_guard)

    def test_vk_sync_conflict_offers_backup_protected_merge(self):
        source = (ROOT / "apps" / "vk" / "index.html").read_text(encoding="utf-8")
        self.assertIn('id="shared-merge-both"', source)
        self.assertIn("async function mergeBothVersions()", source)
        self.assertIn("kgeu_vk_before_merge_both_v1", source)
        self.assertIn("kgeu_vk_cloud_before_merge_both_v1", source)
        self.assertIn("mergeServiceRecords(remote.serviceData || DEFAULT_SERVICE, localService)", source)
        self.assertIn("payloadForSync(", source)
        self.assertIn("sync_revision_conflict", source)
        self.assertIn("Удаления записей автоматически не переносятся", source)

    def test_vk_merge_keeps_local_cache_unchanged_until_cas_write_succeeds(self):
        source = (ROOT / "apps" / "vk" / "index.html").read_text(encoding="utf-8")
        start = source.index("async function mergeBothVersions()")
        end = source.index("async function forcePushLocalVersion()", start)
        merge = source[start:end]
        post = merge.index("const result = await request('/api/sync'")
        cache_write = merge.index("writeCachedService(mergedService);")
        self.assertLess(post, cache_write)
        revision_arg = merge.index("Number(remote.revision || 0),")
        merged_service_arg = merge.index("mergedService", revision_arg)
        self.assertLess(post, revision_arg)
        self.assertLess(revision_arg, merged_service_arg)
        self.assertLess(merged_service_arg, cache_write)
        self.assertIn("function payloadForSync(personal, profile, expectedRevision, serviceData)", source)

    def test_vk_merge_algorithm_preserves_conflicts_and_unions_lists(self):
        node = shutil.which("node")
        if not node:
            self.skipTest("Node.js is required to execute the real frontend merge function")

        source = (ROOT / "apps" / "vk" / "index.html").read_text(encoding="utf-8")
        stable_start = source.index("  function stableServiceValue(value) {")
        same_start = source.index("  function sameServiceContent(left, right) {", stable_start)
        merge_comment = source.index("  // Merge pre-existing VK-local records", same_start)
        merge_start = source.index("  function mergeServiceRecords(cloudValue, localValue) {", merge_comment)
        merge_end = source.index("  function sharedServiceEscape(value) {", merge_start)

        stable_function = source[stable_start:same_start]
        same_function = source[same_start:merge_comment]
        merge_function = source[merge_start:merge_end]
        assertions = r'''
const assert = require('node:assert/strict');
const cloud = {
  schemaVersion: 4,
  tasks: [
    { id: 'same', title: 'Telegram copy' },
    { id: 'cloud-only', title: 'Cloud only' },
    { id: 'same-vk-tasks', title: 'Pre-existing ID collision' }
  ],
  deadlines: [{ id: 'deadline-1', title: 'Exam', updatedAt: 1, version: 1 }],
  events: [{ id: 'event-cloud', title: 'Cloud event' }],
  hostel: {
    totalGoal: 250,
    work: [{ id: 'work-cloud', title: 'Cloud work' }],
    social: [{ id: 'social-cloud', title: 'Cloud event', points: 5 }]
  }
};
const local = {
  schemaVersion: 4,
  tasks: [
    { id: 'same', title: 'VK copy' },
    { id: 'local-only', title: 'Local only' }
  ],
  deadlines: [{ id: 'deadline-1', title: 'Exam', updatedAt: 99, version: 2 }],
  events: [{ id: 'event-local', title: 'Local event' }],
  hostel: {
    totalGoal: 300,
    work: [{ id: 'work-local', title: 'Local work' }],
    social: [{ id: 'social-local', title: 'Local event', points: 3 }]
  }
};
const merged = mergeServiceRecords(cloud, local);
assert.equal(merged.tasks.find(x => x.id === 'same').title, 'Telegram copy');
assert.equal(merged.tasks.find(x => x.id === 'same-vk-tasks-2').title, 'VK copy');
assert.ok(merged.tasks.some(x => x.id === 'cloud-only'));
assert.ok(merged.tasks.some(x => x.id === 'local-only'));
assert.equal(merged.deadlines.length, 1, 'same logical record should not duplicate for metadata-only changes');
assert.equal(merged.events.length, 2, 'unique events from both accounts should survive');
assert.deepEqual(merged.hostel.work.map(x => x.id).sort(), ['work-cloud', 'work-local']);
assert.deepEqual(merged.hostel.social.map(x => x.id).sort(), ['social-cloud', 'social-local']);
assert.equal(merged.hostel.totalGoal, 300, 'non-list scalar fields follow the explicit local-wins rule');
console.log('VK merge behavior assertions passed');
''';
        script = "\n".join([
            "const DEFAULT_SERVICE = {};",
            stable_function,
            same_function,
            merge_function,
            assertions,
        ])
        result = subprocess.run([node, "-e", script], capture_output=True, text=True, check=False)
        self.assertEqual(result.returncode, 0, msg=result.stdout + result.stderr)
        self.assertIn("VK merge behavior assertions passed", result.stdout)


    def test_vk_group_scoped_notes_migration_preserves_backup_and_syncs_scoped_keys(self):
        node = shutil.which("node")
        if not node:
            self.skipTest("Node.js is required to execute the note migration helper")

        source = (ROOT / "apps" / "vk" / "index.html").read_text(encoding="utf-8")
        self.assertIn('const hasExplicitGroupFromLaunch = Boolean(Number(params.get(\'groupId\')) || Number(hashParams.get(\'groupId\')));', source)
        self.assertIn("if(!hasExplicitGroupFromLaunch&&profile.activeGroup&&Number(profile.activeGroup.id))", source)
        self.assertIn("if (!hasExplicitGroupFromLaunch && group && Number(group.id)", source)
        start = source.index("function kgeuSubjectKey(subject)")
        end = source.index("function kgeuGetNote(subject)", start)
        helpers = source[start:end]
        assertions = r'''
const assert = require('node:assert/strict');
const saved = {};
const dirty = [];
global.window = { kgeuSharedSyncMarkDirty: (kind, key) => dirty.push([kind, key]) };
global.localStorage = {
  getItem: key => Object.prototype.hasOwnProperty.call(saved, key) ? saved[key] : null,
  setItem: (key, value) => { saved[key] = String(value); }
};
let activeGroupId = 123;
let kgeuPersonalData = { version: 1, notes: {
  'mathematics': 'legacy note',
  'group:123::mathematics': 'existing scoped note',
  'group:456::mathematics': 'other group note'
}};
let shouldSavePersonalData = true;
function kgeuSavePersonalData(data) {
  if (!shouldSavePersonalData) return false;
  saved.kgeu_vk_personal_data_v1 = JSON.stringify(data);
  return true;
}
''';
        script = "\n".join([
            assertions,
            helpers,
            r'''
const original = JSON.parse(JSON.stringify(kgeuPersonalData));
assert.equal(kgeuMigrateLegacyNotesForActiveGroup(), true);
kgeuFlushMigratedNoteSync(); // sync is available only after frontend initialization
assert.equal(JSON.parse(saved.kgeu_vk_notes_migration_backup_v1).notes.mathematics, original.notes.mathematics);
assert.equal(kgeuPersonalData.notes['group:123::mathematics'], 'existing scoped note');
assert.equal(kgeuPersonalData.notes['group:456::mathematics'], 'other group note');
assert.equal(Object.prototype.hasOwnProperty.call(kgeuPersonalData.notes, 'mathematics'), false);
assert.deepEqual(dirty, [['note', 'group:123::mathematics']]);
assert.equal(kgeuMigrateLegacyNotesForActiveGroup(), false, 'migration should be idempotent');

// A failed local save must restore the legacy data and must not queue a dirty sync key.
dirty.length = 0;
kgeuPendingMigratedNoteKeys = [];
kgeuPersonalData = { version: 1, notes: { 'legacy-subject': 'recover me' } };
shouldSavePersonalData = false;
assert.equal(kgeuMigrateLegacyNotesForActiveGroup(), false);
assert.deepEqual(kgeuPersonalData.notes, { 'legacy-subject': 'recover me' });
kgeuFlushMigratedNoteSync();
assert.deepEqual(dirty, []);
console.log('VK group-scoped note migration assertions passed');
'''
        ])
        result = subprocess.run([node, "-e", script], capture_output=True, text=True, check=False)
        self.assertEqual(result.returncode, 0, msg=result.stdout + result.stderr)
        self.assertIn("VK group-scoped note migration assertions passed", result.stdout)




    def test_telegram_group_note_migration_is_backup_safe_and_queues_sync(self):
        node = shutil.which("node")
        if not node:
            self.skipTest("Node.js is required to execute the note migration helper")

        source = (ROOT / "index.html").read_text(encoding="utf-8")
        start = source.index("function kgeuSubjectKey(subject)")
        end = source.index("function kgeuGetNote(subject)", start)
        helpers = source[start:end]
        script = r"""
const assert = require('node:assert/strict');
const saved = {};
const dirty = [];
let activeGroupId = 123;
let kgeuPersonalData = { version: 1, notes: {
  mathematics: 'legacy note',
  'group:123::mathematics': 'scoped note wins',
  'group:456::mathematics': 'other group note'
}};
let shouldSavePersonalData = true;
let failBackup = false;
global.window = { kgeuMarkStudentServiceDirty: () => dirty.push('dirty') };
global.localStorage = {
  getItem: key => Object.prototype.hasOwnProperty.call(saved, key) ? saved[key] : null,
  setItem: (key, value) => {
    if (failBackup && key === 'kgeu_tg_notes_migration_backup_v1') throw new Error('backup failed');
    saved[key] = String(value);
  }
};
function kgeuSavePersonalData(data) {
  if (!shouldSavePersonalData) return false;
  saved.kgeu_tg_personal_data_v1 = JSON.stringify(data);
  return true;
}
"""
        script = "\n".join([
            script,
            helpers,
            r"""
const original = JSON.parse(JSON.stringify(kgeuPersonalData));
assert.equal(kgeuMigrateLegacyNotesForActiveGroup(), true);
assert.equal(kgeuPersonalData.notes['group:123::mathematics'], 'scoped note wins');
assert.equal(kgeuPersonalData.notes['group:456::mathematics'], 'other group note');
assert.equal(Object.prototype.hasOwnProperty.call(kgeuPersonalData.notes, 'mathematics'), false);
assert.deepEqual(JSON.parse(saved.kgeu_tg_notes_migration_backup_v1), original);
assert.deepEqual(dirty, ['dirty']);
assert.equal(kgeuMigrateLegacyNotesForActiveGroup(), false, 'migration is idempotent');

// A failed save must restore the original in-memory data and must not queue sync.
dirty.length = 0;
kgeuPersonalData = { version: 1, notes: { 'legacy-subject': 'recover me' } };
shouldSavePersonalData = false;
assert.equal(kgeuMigrateLegacyNotesForActiveGroup(), false);
assert.equal(JSON.stringify(kgeuPersonalData), JSON.stringify({ version: 1, notes: { 'legacy-subject': 'recover me' } }));
assert.deepEqual(dirty, []);

// A failed backup must abort before any mutation.
kgeuPersonalData = { version: 1, notes: { 'keep-this': 'safe' } };
shouldSavePersonalData = true;
failBackup = true;
assert.equal(kgeuMigrateLegacyNotesForActiveGroup(), false);
assert.equal(JSON.stringify(kgeuPersonalData), JSON.stringify({ version: 1, notes: { 'keep-this': 'safe' } }));
assert.deepEqual(dirty, []);

// Cloud restore defers dirty marking until the caller has finalized sync metadata.
failBackup = false;
kgeuPersonalData = { version: 1, notes: { 'cloud-legacy': 'cloud note' } };
assert.equal(kgeuMigrateLegacyNotesForActiveGroup({ deferSync: true }), true);
assert.deepEqual(dirty, []);
assert.equal(kgeuFlushLegacyNoteMigrationSync(), true);
assert.deepEqual(dirty, ['dirty']);
console.log('Telegram backup-safe note migration assertions passed');
"""
        ])
        result = subprocess.run([node, "-e", script], capture_output=True, text=True, check=False)
        self.assertEqual(result.returncode, 0, msg=result.stdout + result.stderr)
        self.assertIn("Telegram backup-safe note migration assertions passed", result.stdout)

class GroupPickerRegressionTest(unittest.TestCase):
    def test_both_frontends_use_shared_group_directory_contract(self):
        for relative in ("index.html", "apps/vk/index.html"):
            source = (ROOT / relative).read_text(encoding="utf-8")
            with self.subTest(frontend=relative):
                self.assertIn("https://kgeu-telegram-miniapp.2vkv544dmd.workers.dev/api/groups?year=2026-2027", source)
                self.assertIn("Array.isArray(data && data.data) ? data.data : []", source)
                self.assertIn("data-group-directory-id", source)
                self.assertIn("data-retry-group-directory", source)
                self.assertIn("loadGroupDirectory(true)", source)
                self.assertIn("function getSavedGroups()", source)
                self.assertIn("data-sgid", source)
                self.assertIn("switchGroup(g.id,g.name)", source)

    def test_group_directory_failure_preserves_stale_cache(self):
        for relative in ("index.html", "apps/vk/index.html"):
            source = (ROOT / relative).read_text(encoding="utf-8")
            with self.subTest(frontend=relative):
                start = source.index("async function loadGroupDirectory(forceRefresh)")
                end = source.index("function renderGroupDirectoryResults(query)", start)
                loader = source[start:end]
                self.assertIn("staleCache = cached.items", loader)
                self.assertIn("if (staleCache && staleCache.length)", loader)
                self.assertIn("groupDirectory = staleCache", loader)

    def test_worker_exposes_read_only_group_directory_proxy(self):
        source = (ROOT / "backend" / "worker.js").read_text(encoding="utf-8")
        start = source.index("if (url.pathname === '/api/groups' && request.method === 'GET')")
        end = source.index("const syncPath =", start)
        route = source[start:end]
        self.assertIn("raspGrouplist?year=", route)
        self.assertIn("Array.isArray(payload.data)", route)
        self.assertIn("group_directory_invalid_response", route)
        self.assertIn("group_directory_unavailable", route)
        self.assertIn("invalid_year", route)

    def test_worker_cors_allows_canonical_github_pages_origin(self):
        source = (ROOT / "backend" / "worker.js").read_text(encoding="utf-8")
        self.assertIn("origin === 'https://mitrofanovdaniil53-max.github.io'", source)
        self.assertIn("Access-Control-Allow-Origin", source)
        self.assertIn("Vary': 'Origin'", source)

if __name__ == "__main__":
    unittest.main()
