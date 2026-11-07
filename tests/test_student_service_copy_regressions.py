from pathlib import Path
import json
import re
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
                home_action = hostel.index('class="service-actions hostel-home-action"')
                nav_start = hostel.index('<nav class="hostel-module-nav"')
                nav_end = hostel.index('</nav>', nav_start)
                overview_panel = hostel.index('data-hostel-panel="overview"')
                wrapper_start = hostel.index('<div class="hostel-navigation-header">')
                wrapper_end = hostel.index("</div>'+", nav_end)
                self.assertLess(wrapper_start, home_action)
                self.assertLess(home_action, nav_start)
                self.assertNotIn('hostel-home-action', hostel[nav_start:nav_end])
                self.assertLess(nav_end, wrapper_end)
                self.assertLess(nav_start, overview_panel)
                self.assertIn('.hostel-navigation-header{position:sticky;top:8px;z-index:5}', source)
                self.assertIn('.hostel-module-nav .service-btn{min-height:44px;padding:8px 12px;border-radius:12px}', source)
                self.assertIn('data-service-action="service-home"', hostel[home_action:nav_start])
                self.assertIn("function serviceHostelApplyView()", source)
                self.assertIn("button.setAttribute('aria-pressed',active?'true':'false')", source)
                self.assertIn("serviceHostelView=button.getAttribute('data-hostel-view')||'overview';", source)
                self.assertIn("if(a==='service-home')", source)
                self.assertIn("if(a==='export-word')return serviceExportWord();", source)
                self.assertIn("toast('Работа ЖБС добавлена')", source)
                self.assertIn("toast('Мероприятие ССО добавлено')", source)
                self.assertIn("const historyRows=h.work.map", source)
                self.assertIn("if(!a.date&&b.date)return 1;if(a.date&&!b.date)return -1;", source)
                self.assertIn("const reportRows=h.work.map", source)
                self.assertIn("h.social.map(function(x){return Object.assign({kind:'social'},x);})", source)
                self.assertIn("Записи ЖБС и ССО отсортированы по дате.", source)
                self.assertIn("ЖБС · +", source)
                self.assertIn("ССО</span>", source)

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


    def test_hostel_word_report_copy_matches_export_scope(self):
        for relative in ("index.html", "apps/vk/index.html"):
            source = (ROOT / relative).read_text(encoding="utf-8")
            with self.subTest(frontend=relative):
                hostel_start = source.index("function serviceRenderHostel()")
                hostel_end = source.index("function serviceSubjectList()", hostel_start)
                hostel = source[hostel_start:hostel_end]
                self.assertIn("Отчёт включает записи ЖБС и ССО.", hostel)
                export_start = source.index("function serviceExportWord()")
                export_end = source.index("let serviceCalendarDate", export_start)
                export = source[export_start:export_end]
                self.assertIn("const reportRows=h.work.map", export)
                self.assertIn("h.social.map(function(x){return Object.assign({kind:'social'},x);})", export)
                self.assertIn("reportRows.forEach(function(x)", export)
                self.assertIn("Административные / ЖБС", export)
                self.assertIn("Социальные / ССО", export)
                self.assertIn("serviceEsc(x.note||'')", export)
                self.assertIn("function serviceShowWordReport(filename,content)", source)
                modal_start = source.index("function serviceShowWordReport(filename,content)")
                modal_end = source.index("function serviceReportAttachment(record)", modal_start)
                modal = source[modal_start:modal_end]
                self.assertIn("event.key==='Tab'", modal)
                self.assertIn("event.currentTarget===frame.contentDocument", modal)
                self.assertIn("(event.shiftKey?close:download).focus()", modal)
                self.assertIn("overlay.querySelectorAll('button:not([disabled]):not([hidden]),iframe')", modal)
                self.assertIn("frame.contentDocument.addEventListener('keydown',onKey)", modal)
                self.assertIn("previousFocus.focus()", modal)
                self.assertIn("frame.srcdoc=content", modal)
                self.assertIn("download.focus()", source[source.index("function serviceShowWordReport(filename,content)"):source.index("function serviceExportWord()")])
                self.assertIn("serviceShowWordReport('KGEU_отчет_по_баллам_'+isoDate(new Date())+'.doc',doc)", export)
                self.assertIn("<th>Комментарий</th>", export)
                self.assertIn("function serviceReportAttachment(record)", source)
                self.assertIn("serviceReportAttachment(x)", export)
                self.assertIn("data:image/", source)
                self.assertIn("function serviceCompressImage(file)", source)
                self.assertIn("const maxBytes=140000, maxSide=1000", source)
                self.assertIn("serviceCompressImage(file).then(function(data)", source)
                self.assertIn("canvas.toDataURL('image/jpeg',quality)", source)
                self.assertIn("function serviceSendWordReportToTelegram(filename,content,button)", source)
                self.assertIn("api/report/telegram", source)

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


class StudentServiceDashboardHierarchyTest(unittest.TestCase):
    def test_dashboard_prioritizes_todays_agenda_before_secondary_stats_on_both_frontends(self):
        for relative in ("index.html", "apps/vk/index.html"):
            source = (ROOT / relative).read_text(encoding="utf-8")
            with self.subTest(frontend=relative):
                self.assertIn(".service-page > .service-agenda-section { order: 1; }", source)
                self.assertIn(".service-page > .service-tasks-section { order: 7; }", source)
                self.assertIn('<section class="service-tasks-section"><div class="service-section-title"><h2>Последние задачи</h2>', source)
                self.assertIn(".service-page > .service-grid { order: 2; }", source)
                self.assertIn("@media (max-width: 360px)", source)
                self.assertIn(".service-page .service-actions .service-btn, .service-page .service-section-title .service-btn { min-height: 44px; }", source)
                self.assertIn("prefers-reduced-motion: reduce", source)


class StudentServiceDataCopyTextTest(unittest.TestCase):
    def test_data_screen_explains_current_sync_and_backup_options_on_both_frontends(self):
        stale = "Пока без backend — можно безопасно перенести данные вручную."
        current = "Для переноса между Telegram и VK используй синхронизацию, а для отдельной копии — экспорт JSON."
        for relative in ("index.html", "apps/vk/index.html"):
            source = (ROOT / relative).read_text(encoding="utf-8")
            with self.subTest(frontend=relative):
                self.assertNotIn(stale, source)
                self.assertIn(current, source)
                self.assertIn("data-open-service-view=\"sync\"", source)
                self.assertIn("data-open-service-view=\"data\"", source)


class StudentServiceNavigationRegressionTest(unittest.TestCase):
    def test_settings_and_hostel_navigation_are_bound_on_both_frontends(self):
        for relative in ("index.html", "apps/vk/index.html"):
            source = (ROOT / relative).read_text(encoding="utf-8")
            with self.subTest(frontend=relative):
                self.assertIn("document.querySelectorAll('[data-open-service-view]')", source)
                self.assertIn("view==='sync'?serviceRenderSync():serviceRenderData()", source)
                self.assertIn("document.querySelectorAll('[data-hostel-view]')", source)
                self.assertIn("serviceHostelApplyView();", source)
                self.assertIn("button.setAttribute('aria-pressed',active?'true':'false')", source)
                self.assertIn("data-hostel-view=\"overview\"", source)
                self.assertIn("data-hostel-view=\"admin\"", source)
                self.assertIn("data-hostel-view=\"social\"", source)
                self.assertIn("data-hostel-view=\"history\"", source)
                self.assertIn("if(a==='service-home')", source)


class StudentServiceHostelGoalRegressionTest(unittest.TestCase):
    def test_zero_point_goals_are_preserved_in_dashboard_and_report_on_both_frontends(self):
        for relative in ("index.html", "apps/vk/index.html"):
            source = (ROOT / relative).read_text(encoding="utf-8")
            with self.subTest(frontend=relative):
                self.assertIn("h.socialGoal!=null?h.socialGoal:", source)
                self.assertIn("h.adminGoal!=null?h.adminGoal:100", source)
                self.assertIn("h.totalGoal!=null?h.totalGoal:250", source)



class StudentServiceHostelGoalNormalizationRegressionTest(unittest.TestCase):
    def test_zero_social_goal_survives_normalization_on_both_frontends(self):
        for relative in ("index.html", "apps/vk/index.html"):
            source = (ROOT / relative).read_text(encoding="utf-8")
            with self.subTest(frontend=relative):
                self.assertIn("socialGoal:serviceNonNegativeNumber(h.socialGoal!=null?h.socialGoal:150,150)", source)
                self.assertNotIn("Number(h.socialGoal||150)", source)
                self.assertIn("function serviceNonNegativeNumber(value,fallback)", source)
                self.assertIn("minutes:serviceNonNegativeNumber(x.minutes,0),points:serviceNonNegativeNumber(x.points,0)", source)
                self.assertIn("totalGoal:serviceNonNegativeNumber(h.totalGoal!=null?h.totalGoal:250,250)", source)


class StudentServiceNumericNormalizationTest(unittest.TestCase):
    def test_non_negative_number_helper_handles_empty_and_invalid_values_on_both_frontends(self):
        node = shutil.which("node")
        if not node:
            self.skipTest("Node.js is required to execute the real frontend numeric helper")

        for relative in ("index.html", "apps/vk/index.html"):
            source = (ROOT / relative).read_text(encoding="utf-8")
            marker = "function serviceNonNegativeNumber(value,fallback)"
            start = source.index(marker)
            end = source.index("\n", start)
            helper = source[start:end]
            script = "\n".join([
                "const assert = require('node:assert/strict');",
                helper,
                "assert.equal(serviceNonNegativeNumber(0, 250), 0);",
                "assert.equal(serviceNonNegativeNumber('0', 250), 0);",
                "assert.equal(serviceNonNegativeNumber(12, 250), 12);",
                "assert.equal(serviceNonNegativeNumber('12', 250), 12);",
                "assert.equal(serviceNonNegativeNumber(-4, 250), 0);",
                "assert.equal(serviceNonNegativeNumber('', 250), 250);",
                "assert.equal(serviceNonNegativeNumber('   ', 250), 250);",
                "assert.equal(serviceNonNegativeNumber(null, 250), 250);",
                "assert.equal(serviceNonNegativeNumber(undefined, 250), 250);",
                "assert.equal(serviceNonNegativeNumber('not-a-number', 250), 250);",
                "assert.equal(serviceNonNegativeNumber(Infinity, 250), 250);",
                "assert.equal(serviceNonNegativeNumber(true, 250), 250);",
                "assert.equal(serviceNonNegativeNumber(false, 250), 250);",
                "assert.equal(serviceNonNegativeNumber({}, 250), 250);",
                "console.log('numeric helper assertions passed');",
            ])
            with self.subTest(frontend=relative):
                result = subprocess.run([node, "-e", script], capture_output=True, text=True, check=False)
                self.assertEqual(result.returncode, 0, msg=result.stdout + result.stderr)
                self.assertIn("numeric helper assertions passed", result.stdout)



class StudentServiceNormalizationBehaviorTest(unittest.TestCase):
    def test_real_normalizer_preserves_zero_and_falls_back_for_malformed_hostel_values(self):
        node = shutil.which("node")
        if not node:
            self.skipTest("Node.js is required to execute the real frontend normalizer")

        for relative in ("index.html", "apps/vk/index.html"):
            source = (ROOT / relative).read_text(encoding="utf-8")
            helper_start = source.index("function serviceNonNegativeNumber(value,fallback)")
            helper_end = source.index("\n", helper_start)
            normalize_start = source.index("function serviceNormalizeData(x)")
            normalize_end = source.index("function serviceLoad()", normalize_start)
            helper = source[helper_start:helper_end]
            normalizer = source[normalize_start:normalize_end]
            script = "\n".join([
                "const assert = require('node:assert/strict');",
                "const STUDENT_SERVICE_SCHEMA = 19;",
                "function serviceRecordArray(value) { return Array.isArray(value) ? value : []; }",
                "function serviceNormalizeRecord(record, prefix) { return Object.assign({id: prefix + '_test'}, record || {}); }",
                "function serviceDateKey(value) { return typeof value === 'string' && /^\\d{4}-\\d{2}-\\d{2}$/.test(value); }",
                helper,
                normalizer,
                "const zeros = serviceNormalizeData({hostel:{totalGoal:0,adminGoal:0,socialGoal:0,work:[{minutes:'',points:'bad'}],social:[{points:true}]}});",
                "assert.equal(zeros.hostel.totalGoal, 0);",
                "assert.equal(zeros.hostel.adminGoal, 0);",
                "assert.equal(zeros.hostel.socialGoal, 0);",
                "assert.equal(zeros.hostel.work[0].minutes, 0);",
                "assert.equal(zeros.hostel.work[0].points, 0);",
                "assert.equal(zeros.hostel.social[0].points, 0);",
                "const malformed = serviceNormalizeData({hostel:{totalGoal:'',adminGoal:'bad',socialGoal:null}});",
                "assert.equal(malformed.hostel.totalGoal, 250);",
                "assert.equal(malformed.hostel.adminGoal, 100);",
                "assert.equal(malformed.hostel.socialGoal, 150);",
                "console.log('real serviceNormalizeData assertions passed');",
            ])
            with self.subTest(frontend=relative):
                result = subprocess.run([node, "-e", script], capture_output=True, text=True, check=False)
                self.assertEqual(result.returncode, 0, msg=result.stdout + result.stderr)
                self.assertIn("real serviceNormalizeData assertions passed", result.stdout)




class StudentServiceHostelInputRegressionTest(unittest.TestCase):
    def test_hostel_forms_use_safe_numeric_normalization_on_both_frontends(self):
        for relative in ("index.html", "apps/vk/index.html"):
            source = (ROOT / relative).read_text(encoding="utf-8")
            with self.subTest(frontend=relative):
                self.assertIn("serviceData.hostel.adminGoal=serviceNonNegativeNumber(document.getElementById('hostel-admin-goal').value,serviceNonNegativeNumber(serviceData.hostel.adminGoal,100));", source)
                self.assertIn("serviceData.hostel.socialGoal=serviceNonNegativeNumber(document.getElementById('hostel-social-goal').value,serviceNonNegativeNumber(serviceData.hostel.socialGoal,150));", source)
                self.assertIn("minutes=Math.floor(serviceNonNegativeNumber(document.getElementById('work-minutes').value,0));", source)
                self.assertIn("points:Math.floor(serviceNonNegativeNumber(document.getElementById('social-points').value,0))", source)


class StudentServiceSurfaceStyleRegressionTest(unittest.TestCase):
    def test_summary_and_dashboard_surface_rules_are_explicit_and_theme_aware(self):
        style_blocks = []
        for relative, platform in (("index.html", "tg"), ("apps/vk/index.html", "vk")):
            source = (ROOT / relative).read_text(encoding="utf-8")
            match = re.search(r'<style id="kgeu-unified-design-system-v1">([\s\S]*?)</style>', source)
            self.assertIsNotNone(match, msg=f"{relative}: unified design system style block is missing")
            css = match.group(1)
            style_blocks.append(match.group(0))

            summary = re.search(r"\.day-summary\s*\{([^}]*)\}", css)
            self.assertIsNotNone(summary, msg=f"{relative}: day summary rule is missing")
            for declaration in (
                "border-radius: var(--ui-radius-lg);",
                "background: var(--ui-panel-surface);",
                "box-shadow: var(--ui-shadow);",
            ):
                self.assertIn(declaration, summary.group(1))

            sections = re.search(
                r"\.service-page \.service-agenda-section,\s*"
                r"\.service-page \.service-deadlines-section,\s*"
                r"\.service-page \.service-events-section,\s*"
                r"\.service-page \.service-tasks-section\s*\{([^}]*)\}",
                css,
            )
            self.assertIsNotNone(sections, msg=f"{relative}: dashboard section surface rule is missing")
            for declaration in (
                "padding: var(--ui-space-3);",
                "border: 1px solid var(--ui-panel-outline);",
                "border-radius: var(--ui-radius-lg);",
                "background: var(--ui-panel-surface);",
                "box-shadow: none;",
                "backdrop-filter: none;",
            ):
                self.assertIn(declaration, sections.group(1))

            empty_states = re.search(
                r"\.service-page \.service-empty,\s*"
                r"\.service-page \.service-calendar-empty\s*\{([^}]*)\}",
                css,
            )
            self.assertIsNotNone(empty_states, msg=f"{relative}: empty-state reset is missing")
            for declaration in (
                "border: 0;",
                "border-radius: 0;",
                "background: transparent;",
                "box-shadow: none;",
            ):
                self.assertIn(declaration, empty_states.group(1))

            for theme_selector in (f"html.{platform}-dark", f"html.{platform}-light"):
                self.assertIn(theme_selector, css)
            self.assertIn("color-mix(in srgb, var(--card) 96%, white 4%)", css)

        self.assertEqual(style_blocks[0], style_blocks[1])

if __name__ == "__main__":
    unittest.main()


class TelegramReportDeliveryRegressionTest(unittest.TestCase):
    def test_worker_sends_report_only_to_authenticated_telegram_user(self):
        source = (ROOT / "backend/worker.js").read_text(encoding="utf-8")
        self.assertIn("const telegramReportPath = url.pathname === '/api/report/telegram';", source)
        self.assertIn("if (identity.provider !== 'telegram')", source)
        self.assertIn("api.telegram.org/bot' + env.TELEGRAM_BOT_TOKEN + '/sendDocument", source)
        self.assertIn("telegram_start_bot_first", source)
        self.assertIn("telegram_report_too_large", source)


class StudentServiceImportBackupSafetyTest(unittest.TestCase):
    def test_json_restore_backs_up_notes_and_aborts_when_backup_or_save_fails(self):
        for relative in ("index.html", "apps/vk/index.html"):
            source = (ROOT / relative).read_text(encoding="utf-8")
            with self.subTest(frontend=relative):
                backup_start = source.index("function serviceBackupCurrent()")
                backup_end = source.index("\n", backup_start)
                backup = source[backup_start:backup_end]
                self.assertIn("localStorage.setItem(STUDENT_SERVICE_BACKUP_KEY,JSON.stringify(serviceData))", backup)
                self.assertIn("kgeu_student_personal_backup_before_cloud_restore_v1", backup)
                self.assertIn("JSON.stringify(kgeuPersonalData||{version:1,notes:{}})", backup)
                self.assertIn("return true", backup)
                self.assertIn("return false", backup)
                import_start = source.index("function serviceImportData(file)")
                import_end = source.index("function serviceRenderSync()", import_start)
                importer = source[import_start:import_end]
                self.assertIn("function serviceConfirmDataRestore(onConfirm)", source)
                confirm_start = source.index("function serviceConfirmDataRestore(onConfirm)")
                confirm_end = source.index("function serviceApplyImportedData(payload)", confirm_start)
                confirm = source[confirm_start:confirm_end]
                self.assertIn("tg.showConfirm(message", confirm)
                self.assertIn("window.confirm(message)", confirm)
                self.assertIn("Перед применением текущие данные и заметки сохранятся в резервных копиях", confirm)
                self.assertIn("serviceConfirmDataRestore(function(){serviceApplyImportedData(payload);})", importer)
                apply_start = source.index("function serviceApplyImportedData(payload)")
                apply_end = source.index("function serviceImportData(file)", apply_start)
                apply = source[apply_start:apply_end]
                self.assertIn("if(!serviceBackupCurrent())", apply)
                self.assertIn("if(!serviceSave())", apply)
                self.assertIn("if(!kgeuSavePersonalData(importedPersonalData))", apply)
                self.assertIn("serviceData=previousServiceData", apply)
                self.assertIn("kgeuPersonalData=previousPersonalData", apply)

    def test_backup_helper_persists_both_data_sets_and_reports_partial_failure(self):
        node = shutil.which("node")
        if not node:
            self.skipTest("Node.js is required to execute the backup helper")
        for relative in ("index.html", "apps/vk/index.html"):
            source = (ROOT / relative).read_text(encoding="utf-8")
            start = source.index("function serviceBackupCurrent()")
            end = source.index("\n", start)
            helper = source[start:end]
            script = "\n".join([
                "const assert = require('node:assert/strict');",
                "const STUDENT_SERVICE_BACKUP_KEY = 'service-backup';",
                "const serviceData = {tasks:[{id:'task-1'}]};",
                "const kgeuPersonalData = {version:1,notes:{math:'saved note'}};",
                "const saved = {}; let failPersonal = false;",
                "const localStorage = {setItem(key,value){if(failPersonal && key === 'kgeu_student_personal_backup_before_cloud_restore_v1') throw new Error('quota'); saved[key]=String(value);}};",
                helper,
                "assert.equal(serviceBackupCurrent(), true);",
                "assert.deepEqual(JSON.parse(saved['service-backup']), serviceData);",
                "assert.deepEqual(JSON.parse(saved['kgeu_student_personal_backup_before_cloud_restore_v1']), kgeuPersonalData);",
                "failPersonal = true;",
                "assert.equal(serviceBackupCurrent(), false);",
                "console.log('service and personal backup helper assertions passed');",
            ])
            with self.subTest(frontend=relative):
                result = subprocess.run([node, "-e", script], capture_output=True, text=True, check=False)
                self.assertEqual(result.returncode, 0, msg=result.stdout + result.stderr)
                self.assertIn("service and personal backup helper assertions passed", result.stdout)



class StudentServiceTransactionalRestoreRegressionTest(unittest.TestCase):
    def test_json_restore_rolls_back_persisted_state_after_partial_write_failures(self):
        node = shutil.which("node")
        if not node:
            self.skipTest("Node.js is required to execute restore transactions")
        for relative in ("index.html", "apps/vk/index.html"):
            source = (ROOT / relative).read_text(encoding="utf-8")
            start = source.index("function serviceApplyImportedData(payload)")
            end = source.index("function serviceImportData(file)", start)
            apply_function = source[start:end]
            script = "\n".join([
                "const assert = require('node:assert/strict');",
                "const STUDENT_SERVICE_KEY='service'; const KGEU_PERSONAL_DATA_KEY='personal'; const STUDENT_SERVICE_SYNC_KEY='sync';",
                "let serviceData={id:'local'}, kgeuPersonalData={version:1,notes:{local:'note'}};",
                "const store={service:JSON.stringify(serviceData),personal:JSON.stringify(kgeuPersonalData),sync:JSON.stringify({dirty:false})};",
                "let mode='personal-write-then-fail', messages=[];",
                "const localStorage={getItem(k){return Object.prototype.hasOwnProperty.call(store,k)?store[k]:null;},setItem(k,v){store[k]=String(v);},removeItem(k){delete store[k];}};",
                "function serviceBackupCurrent(){return true;} function serviceNormalizeData(v){return {...v};}",
                "function serviceSave(){serviceData.updatedAt=123;store.service=JSON.stringify(serviceData);return mode!=='service-write-then-fail';}",
                "function kgeuSavePersonalData(v){store.personal=JSON.stringify({...v,version:1});return mode!=='personal-write-then-fail';}",
                "function toast(m){messages.push(m);} function serviceRenderData(){return '';} function serviceBind(){} const document={getElementById(){return {innerHTML:''};}};",
                apply_function,
                "const oldService=store.service, oldPersonal=store.personal, oldSync=store.sync;",
                "serviceApplyImportedData({serviceData:{id:'cloud'},personalData:{notes:{cloud:'note'}}});",
                "assert.equal(store.service,oldService); assert.equal(store.personal,oldPersonal); assert.equal(store.sync,oldSync);",
                "assert.equal(serviceData.id,'local'); assert.equal(kgeuPersonalData.notes.local,'note');",
                "assert.match(messages.at(-1),/предыдущие данные восстановлены/);",
                "mode='service-write-then-fail'; messages=[];",
                "serviceApplyImportedData({serviceData:{id:'cloud'}});",
                "assert.equal(store.service,oldService); assert.equal(serviceData.id,'local');",
                "assert.match(messages.at(-1),/Предыдущие данные восстановлены/);",
                "console.log('JSON restore transaction assertions passed');"
            ])
            with self.subTest(frontend=relative):
                result = subprocess.run([node, "-e", script], capture_output=True, text=True, check=False)
                self.assertEqual(result.returncode, 0, msg=result.stdout + result.stderr)
                self.assertIn("JSON restore transaction assertions passed", result.stdout)

    def test_cloud_snapshot_restore_rolls_back_service_personal_and_sync_metadata(self):
        node = shutil.which("node")
        if not node:
            self.skipTest("Node.js is required to execute cloud restore transactions")
        for relative in ("index.html", "apps/vk/index.html"):
            source = (ROOT / relative).read_text(encoding="utf-8")
            start = source.index("function serviceApplyCloudSnapshot(")
            end = source.index("// Refresh only the visible Student Service screen", start)
            apply_function = source[start:end]
            script = "\n".join([
                "const assert = require('node:assert/strict');",
                "const STUDENT_SERVICE_KEY='service'; const KGEU_PERSONAL_DATA_KEY='personal'; const STUDENT_SERVICE_SYNC_KEY='sync';",
                "let serviceData={id:'local'}, kgeuPersonalData={version:1,notes:{local:'note'}};",
                "const oldService=JSON.stringify(serviceData), oldPersonal=JSON.stringify(kgeuPersonalData), oldSync=JSON.stringify({dirty:true,lastServerRevision:4});",
                "const store={service:oldService,personal:oldPersonal,sync:oldSync}; let mode='personal-write-then-fail';",
                "const localStorage={getItem(k){return Object.prototype.hasOwnProperty.call(store,k)?store[k]:null;},setItem(k,v){store[k]=String(v);if(k==='personal'&&mode==='personal-write-then-fail')return;if(k==='sync'&&mode==='metadata-fail'&&String(v)!==oldSync)throw new Error('quota');},removeItem(k){delete store[k];}};",
                "const window={KGEU_VK_PLATFORM:false,kgeuApplySharedProfile(){return Promise.resolve();}}; const hasExplicitGroupFromLaunch=false;",
                "function serviceBackupBeforeCloudRestore(){} function serviceNormalizeData(v){return {...v};}",
                "function serviceSyncMeta(){return JSON.parse(store.sync||'{}');} function kgeuSavePersonalData(v){localStorage.setItem('personal',JSON.stringify({...v,version:1}));return mode!=='personal-write-then-fail';}",
                "function kgeuMigrateLegacyNotesForActiveGroup(){} function kgeuFlushLegacyNoteMigrationSync(){} function kgeuFlushMigratedNoteSync(){}",
                "function readMeta(){return {};} function saveSettings(){} function applyTheme(){} function setActiveGroup(){} function saveActiveGroup(){} function rememberGroup(){} function updateGroupLabel(){}",
                apply_function,
                "const snapshot={found:true,serviceData:{id:'cloud'},personalData:{notes:{cloud:'note'}},updatedAt:2000,revision:5};",
                "assert.throws(()=>serviceApplyCloudSnapshot(snapshot),/cloud_snapshot_personal_save_failed/);",
                "assert.equal(store.service,oldService);assert.equal(store.personal,oldPersonal);assert.equal(store.sync,oldSync);",
                "assert.equal(serviceData.id,'local');assert.equal(kgeuPersonalData.notes.local,'note');",
                "mode='metadata-fail';",
                "assert.throws(()=>serviceApplyCloudSnapshot(snapshot),/cloud_snapshot_metadata_save_failed/);",
                "assert.equal(store.service,oldService);assert.equal(store.personal,oldPersonal);assert.equal(store.sync,oldSync);",
                "console.log('cloud snapshot transaction assertions passed');"
            ])
            with self.subTest(frontend=relative):
                result = subprocess.run([node, "-e", script], capture_output=True, text=True, check=False)
                self.assertEqual(result.returncode, 0, msg=result.stdout + result.stderr)
                self.assertIn("cloud snapshot transaction assertions passed", result.stdout)


class VkSyncInFlightEditRegressionTest(unittest.TestCase):
    def test_vk_sync_does_not_overwrite_edits_made_during_pending_push(self):
        node = shutil.which("node")
        if not node:
            self.skipTest("Node.js is required to execute VK sync")
        source = (ROOT / "apps/vk/index.html").read_text(encoding="utf-8")
        dirty_start = source.index("window.kgeuSharedSyncMarkDirty = function")
        dirty_end = source.index("\n  kgeuFlushMigratedNoteSync();", dirty_start)
        dirty_function = source[dirty_start:dirty_end]
        sync_start = source.index("async function syncNow(reason)")
        sync_end = source.index("\n  async function linkAccount()", sync_start)
        sync_function = source[sync_start:sync_end]
        script = "\n".join([
            "const assert = require('node:assert/strict');",
            "let busy = false, scheduled = 0, resolvePost, postedPayload = null;",
            "let kgeuPersonalData = { version: 1, notes: { keep: 'old value' } };",
            "let metaStore = { deviceId: 'vk-test', lastServerRevision: 1, lastSyncAt: 1, initialized: true, dirty: true, dirtyNotes: [], dirtyProfile: false, dirtyService: true, localChangeVersion: 0 };",
            "const serviceCache = { tasks: [], deadlines: [], events: [], hostel: { work: [], social: [] } };",
            "const remote = { found: true, revision: 1, updatedAt: 1000, serviceData: serviceCache, personalData: { version: 1, notes: { keep: 'old value' } }, profileData: {} };",
            "const snapshot = {};",
            "const window = { kgeuMarkStudentServiceSynced() {} };",
            "const navigator = { onLine: true };",
            "const document = { visibilityState: 'visible' };",
            "const localStorage = { setItem() {}, getItem() { return null; } };",
            "function readMeta() { return JSON.parse(JSON.stringify(metaStore)); }",
            "function writeMeta(value) { metaStore = JSON.parse(JSON.stringify(value)); }",
            "function scheduleSync() { scheduled++; }",
            "function setLinkUiState() {}",
            "function setStatus() {}",
            "function localPersonal() { return JSON.parse(JSON.stringify(kgeuPersonalData)); }",
            "function readProfile() { return {}; }",
            "function readCachedService() { return serviceCache; }",
            "function hasMeaningfulServiceData() { return false; }",
            "function sameServiceContent() { return true; }",
            "function mergeNotes(cloud, local) { return { personalData: local, addedLocalNotes: false, conflicts: 0 }; }",
            "async function applyProfile() { return false; }",
            "function applyPersonal(personal) { kgeuPersonalData = JSON.parse(JSON.stringify(personal)); }",
            "function payloadForSync(personal, profile, revision) { return { personalData: JSON.parse(JSON.stringify(personal)), profileData: profile, expectedRevision: revision }; }",
            "function renderSharedServiceView() {}",
            "function request(path, options) {",
            "  if (path === '/api/account/me') return Promise.resolve({ linkedProviders: ['telegram', 'vk'] });",
            "  if (path === '/api/sync' && options.method === 'GET') return Promise.resolve(remote);",
            "  if (path === '/api/sync' && options.method === 'POST') {",
            "    postedPayload = JSON.parse(options.body);",
            "    return new Promise(resolve => { resolvePost = () => resolve({ revision: 2, updatedAt: 2000 }); });",
            "  }",
            "  throw new Error('unexpected request ' + path);",
            "}",
            dirty_function,
            sync_function,
            "(async () => {",
            "  const pending = syncNow('regression-test');",
            "  for (let i = 0; i < 20 && !resolvePost; i++) await Promise.resolve();",
            "  assert.equal(typeof resolvePost, 'function', 'sync should reach the pending POST');",
            "  assert.deepEqual(postedPayload.personalData.notes, { keep: 'old value' });",
            "  kgeuPersonalData = { version: 1, notes: { keep: 'old value', during: 'edited while POST is pending' } };",
            "  window.kgeuSharedSyncMarkDirty('note', 'during');",
            "  resolvePost();",
            "  await pending;",
            "  assert.equal(kgeuPersonalData.notes.during, 'edited while POST is pending', 'in-flight edit must not be overwritten by stale payload');",
            "  assert.equal(metaStore.dirty, true, 'new edit must remain queued');",
            "  assert.ok(metaStore.dirtyNotes.includes('during'), 'new note key must remain dirty');",
            "  assert.equal(metaStore.lastServerRevision, 2, 'follow-up push must use the revision returned by the completed request');",
            "  assert.ok(scheduled >= 2, 'a follow-up sync must be scheduled after the in-flight edit');",
            "  console.log('VK in-flight edit assertions passed');",
            "})().catch(error => { console.error(error); process.exitCode = 1; });",
        ])
        result = subprocess.run([node, "-e", script], capture_output=True, text=True, check=False)
        self.assertEqual(result.returncode, 0, msg=result.stdout + result.stderr)
        self.assertIn("VK in-flight edit assertions passed", result.stdout)


class WordReportKeyboardBehaviorTest(unittest.TestCase):
    def test_iframe_tab_wraps_to_expected_controls_in_both_frontends(self):
        node = shutil.which("node")
        if not node:
            self.skipTest("Node.js is required to execute the keyboard handler")
        for relative in ("index.html", "apps/vk/index.html"):
            source = (ROOT / relative).read_text(encoding="utf-8")
            with self.subTest(frontend=relative):
                modal_start = source.index("function serviceShowWordReport(filename,content)")
                handler_start = source.index("function onKey(event){", modal_start)
                handler_end = source.index("\n    close.addEventListener('click',dismiss);", handler_start)
                handler = source[handler_start:handler_end]
                script = "\n".join([
                    "const assert = require('node:assert/strict');",
                    "const vm = require('node:vm');",
                    "const handler = " + json.dumps(handler) + ";",
                    "function runTab(shiftKey, expectedFocus) {",
                    "  let focused = '', prevented = false;",
                    "  const frame = { contentDocument: {} };",
                    "  const close = { focus() { focused = 'close'; } };",
                    "  const download = { focus() { focused = 'download'; } };",
                    "  const overlay = { querySelectorAll() { return [download, close, frame]; }, contains() { return true; } };",
                    "  const document = { activeElement: frame, removeEventListener() {} };",
                    "  const dismiss = () => {};",
                    "  const onKey = vm.runInNewContext(handler + '\\nonKey', { document, overlay, frame, close, download, dismiss });",
                    "  onKey({ key: 'Tab', currentTarget: frame.contentDocument, shiftKey, preventDefault() { prevented = true; } });",
                    "  assert.equal(focused, expectedFocus);",
                    "  assert.equal(prevented, true);",
                    "}",
                    "runTab(false, 'download');",
                    "runTab(true, 'close');",
                    "console.log('iframe Tab / Shift+Tab behavior passed');",
                ])
                result = subprocess.run([node, "-e", script], capture_output=True, text=True, check=False)
                self.assertEqual(result.returncode, 0, msg=result.stdout + result.stderr)
                self.assertIn("iframe Tab / Shift+Tab behavior passed", result.stdout)


class UXPrototypeRegressionTest(unittest.TestCase):
    def test_documented_prototype_is_isolated_and_inline_script_parses(self):
        source = (ROOT / "docs" / "ux-prototype.html").read_text(encoding="utf-8")
        for expected in (
            'data-view="schedule"',
            'data-view="tasks"',
            'data-view="service"',
            'data-view="settings"',
            'data-service-tab="zhbs"',
            'data-service-tab="sso"',
            'aria-modal="true"',
            "реальная резервная копия не создавалась",
        ):
            with self.subTest(expected=expected):
                self.assertIn(expected, source)
        self.assertNotIn("fetch(", source)
        self.assertNotIn("Telegram.WebApp", source)
        self.assertNotIn("VKWebApp", source)
        match = re.search(r"<script>([\s\S]*?)</script>", source)
        self.assertIsNotNone(match, "prototype should contain one inline behavior script")
        node = shutil.which("node")
        if not node:
            self.skipTest("Node.js is required to parse the prototype script")
        result = subprocess.run(
            [node, "--check"],
            input=match.group(1),
            capture_output=True,
            text=True,
            check=False,
        )
        self.assertEqual(result.returncode, 0, msg=result.stdout + result.stderr)


class LiquidGlassVisualRegressionTest(unittest.TestCase):
    def test_glass_surfaces_are_present_in_both_platform_frontends(self):
        for relative, platform in (("index.html", "tg"), ("apps/vk/index.html", "vk")):
            source = (ROOT / relative).read_text(encoding="utf-8")
            with self.subTest(frontend=relative):
                for selector in (
                    ".hero, .next-mini, .lesson-card, .day-summary, .feature-box",
                    ".service-page .service-hero, .service-page .service-card",
                    "backdrop-filter: blur(20px) saturate(1.35)",
                    "prefers-reduced-motion: reduce",
                ):
                    self.assertIn(selector, source)
                self.assertIn("html." + platform + "-dark", source)
                self.assertIn("html." + platform + "-light", source)


class UnifiedDesignSystemRegressionTest(unittest.TestCase):
    def test_both_frontends_share_the_same_design_system(self):
        sources = []
        for relative in ("index.html", "apps/vk/index.html"):
            source = (ROOT / relative).read_text(encoding="utf-8")
            with self.subTest(frontend=relative):
                self.assertIn('id="kgeu-unified-design-system-v1"', source)
                for token in (
                    "--ui-radius-sm: 10px",
                    "--ui-radius-md: 14px",
                    "--ui-radius-lg: 18px",
                    "--ui-control-height: 44px",
                    ".service-page .service-grid { gap: var(--ui-space-2) !important; }",
                    ".service-page { gap: var(--ui-space-3) !important; }",
                    ".service-list { gap: var(--ui-space-2) !important; }",
                    "Student Service dashboard groups use one restrained card surface.",
                    "background: transparent;",
                    "box-shadow: none;",
                    "-webkit-backdrop-filter: none;",
                    ".service-page .service-calendar-empty",
                    ".service-btn:focus-visible",
                    "@media (prefers-reduced-motion: reduce)",
                ):
                    self.assertIn(token, source)
                start = source.index('<style id="kgeu-unified-design-system-v1">')
                end = source.index("</style>", start) + len("</style>")
                sources.append(source[start:end])
        self.assertEqual(sources[0], sources[1])

class StudentServiceDashboardRedundancyTest(unittest.TestCase):
    def test_redundant_next_lesson_and_task_summary_cards_are_removed_in_both_frontends(self):
        for relative in ("index.html", "apps/vk/index.html"):
            source = (ROOT / relative).read_text(encoding="utf-8")
            with self.subTest(frontend=relative):
                start = source.index("function serviceRenderToday()")
                end = source.index("function serviceRenderHostel()", start)
                home = source[start:end]

                self.assertNotIn("Следующая пара", home)
                self.assertNotIn("Мои дела", home)
                self.assertNotIn('class="service-grid"', home)
                self.assertNotIn("const taskOpen=", home)
                self.assertNotIn("const dlOpen=", home)

                # The underlying agenda and task/deadline views remain available.
                self.assertIn("getLessonsForDate(isoDate(new Date()))", home)
                self.assertIn("serviceData.tasks.filter", home)
                self.assertIn("serviceData.deadlines.filter", home)
                self.assertIn('class="service-deadlines-section"', home)
                self.assertIn('class="service-tasks-section"', home)
                self.assertIn('data-service-action="task"', home)
                self.assertIn('data-service-action="deadline"', home)




class ScheduleAndServiceAccessibilityPolishRegressionTest(unittest.TestCase):
    def test_schedule_mode_buttons_expose_selected_state_in_both_frontends(self):
        for relative in ("index.html", "apps/vk/index.html"):
            source = (ROOT / relative).read_text(encoding="utf-8")
            with self.subTest(frontend=relative):
                self.assertIn('id="tabs" role="group" aria-label="Режим расписания"', source)
                self.assertIn('data-mode="today" aria-pressed="true"', source)
                self.assertIn("t.setAttribute('aria-pressed', selected ? 'true' : 'false')", source)

    def test_student_service_controls_have_touch_and_focus_states(self):
        blocks = []
        for relative in ("index.html", "apps/vk/index.html"):
            source = (ROOT / relative).read_text(encoding="utf-8")
            with self.subTest(frontend=relative):
                start = source.index('<style id="student-service-control-polish">')
                end = source.index("</style>", start) + len("</style>")
                block = source[start:end]
                blocks.append(block)
                self.assertIn(".service-main-nav .service-btn", block)
                self.assertIn("min-height: 44px;", block)
                self.assertIn(".service-page textarea:focus-visible", block)
                self.assertIn("@media (prefers-reduced-motion: no-preference)", block)
        self.assertEqual(blocks[0], blocks[1])

    def test_schedule_card_wrapping_is_scoped_and_consistent(self):
        blocks = []
        for relative in ("index.html", "apps/vk/index.html"):
            source = (ROOT / relative).read_text(encoding="utf-8")
            with self.subTest(frontend=relative):
                start = source.index('<style id="schedule-card-layout-polish">')
                end = source.index("</style>", start) + len("</style>")
                block = source[start:end]
                blocks.append(block)
                self.assertIn(".card-top .badge { flex-shrink:0; white-space:nowrap; }", block)
                self.assertNotIn("\n.badge {", block)
                self.assertIn(".card-subject { overflow-wrap:anywhere; hyphens:auto; }", block)
                self.assertIn("@media (max-width: 380px)", block)
        self.assertEqual(blocks[0], blocks[1])
