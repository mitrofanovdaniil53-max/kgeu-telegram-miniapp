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

    def test_telegram_service_home_has_one_analytics_action(self):
        source = (ROOT / "index.html").read_text(encoding="utf-8")
        start = source.index("function serviceRenderToday()")
        end = source.index("function serviceRenderHostel()", start)
        home_renderer = source[start:end]
        self.assertEqual(home_renderer.count('data-service-action="analytics"'), 1)

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
        self.assertIn("Number(remote.revision || 0),", merge)
        self.assertIn("mergedService\\n        ))", merge)
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


if __name__ == "__main__":
    unittest.main()
