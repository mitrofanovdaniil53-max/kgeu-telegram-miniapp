import shutil
import subprocess
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
VK_HTML = ROOT / "apps" / "vk" / "index.html"


class VkFrontendRegressionTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.html = VK_HTML.read_text(encoding="utf-8")

    def test_signed_launch_params_support_query_and_hash(self):
        self.assertIn("function kgeuVkLaunchParams()", self.html)
        self.assertIn("const candidates = [window.location.search, window.location.hash]", self.html)
        self.assertIn("typeof kgeuVkLaunchParams === 'function' ? kgeuVkLaunchParams()", self.html)
        self.assertIn("const vkParams=typeof kgeuVkLaunchParams==='function'?kgeuVkLaunchParams():'';", self.html)

    def test_schedule_cards_expose_subject_note_hooks(self):
        self.assertIn('data-lesson-card="1" data-subject=', self.html)
        self.assertIn('data-lesson-id=', self.html)
        self.assertIn("metaTarget.appendChild(wrap)", self.html)
        self.assertIn('card.classList.add("has-kgeu-note")', self.html)


    def test_light_theme_header_uses_theme_tokens_and_keeps_group_label_visible(self):
        self.assertIn("background: var(--card) !important;", self.html)
        self.assertIn("color: var(--text) !important;", self.html)
        self.assertIn("overflow-wrap: anywhere;", self.html)
        self.assertIn("white-space: normal;", self.html)
        self.assertIn("html.vk-light { color-scheme: light; }", self.html)
        self.assertIn("html.vk-dark { color-scheme: dark; }", self.html)
        self.assertNotIn(".vk-light .top-shell {", self.html)
        self.assertNotIn("html.vk-dark .top-shell,", self.html)

    def test_light_theme_semantic_labels_meet_wcag_aa_contrast(self):
        def luminance(hex_color):
            value = hex_color.lstrip("#")
            channels = [int(value[index:index + 2], 16) / 255 for index in (0, 2, 4)]
            linear = [
                channel / 12.92 if channel <= 0.04045
                else ((channel + 0.055) / 1.055) ** 2.4
                for channel in channels
            ]
            return sum(weight * channel for weight, channel in zip((0.2126, 0.7152, 0.0722), linear))

        def contrast(foreground, background):
            high, low = sorted((luminance(foreground), luminance(background)), reverse=True)
            return (high + 0.05) / (low + 0.05)

        def composite(foreground, background, alpha):
            def channels(value):
                value = value.lstrip("#")
                return [int(value[index:index + 2], 16) for index in (0, 2, 4)]
            front, back = channels(foreground), channels(background)
            return "#" + "".join(
                f"{round(alpha * a + (1 - alpha) * b):02x}"
                for a, b in zip(front, back)
            )

        rules = [
            "html.vk-light .hero-kicker.live { color:#15803d; }",
            "html.vk-light .status-dot { background:#15803d; }",
            "html.vk-light .status-dot.warn { background:#92400e; }",
            "html.vk-light .status-dot.err { background:#b91c1c; }",
            "html.vk-light .hero-type.pr,",
            "html.vk-light .badge.pr { color:#0f766e; }",
            "html.vk-light .hero-type.lab,",
            "html.vk-light .badge.lab { color:#6d28d9; }",
            "html.vk-light .hero-type.other,",
            "html.vk-light .badge.other,",
            "html.vk-light .service-status.upcoming,",
            "html.vk-light .service-chip { color:#475569; }",
            "html.vk-light .hero-kicker.soon,",
            "html.vk-light .next-mini .nm-label",
            "html.vk-light .badge.pr { color:#0f766e; }",
            "html.vk-light .badge.lab { color:#6d28d9; }",
            "html.vk-light .badge.replace { color:#9a3412; }",
            "html.vk-light .service-status.overdue { color:#b91c1c; }",
            "html.vk-light .service-status.today { color:#92400e; }",
            "html.vk-light .service-status.done { color:#166534; }",
            "html.vk-light .service-pill { color:#475569 !important; }",
            "html.vk-light .kgeu-note-icon { color:#667085; }",
        ]
        for rule in rules:
            self.assertIn(rule, self.html)

        text_pairs = [
            ("#15803d", "#ffffff"),
            ("#92400e", "#ffffff"),
            ("#0f766e", composite("#16a085", "#ffffff", 0.13)),
            ("#6d28d9", composite("#7c3aed", "#ffffff", 0.12)),
            ("#9a3412", composite("#ea580c", "#ffffff", 0.12)),
            ("#b91c1c", composite("#dc2626", "#ffffff", 0.12)),
            ("#92400e", composite("#d97706", "#ffffff", 0.12)),
            ("#166534", composite("#35c98a", "#ffffff", 0.13)),
            ("#475569", "#eef2f7"),
            ("#667085", "#ffffff"),
            ("#475569", composite("#94a3b8", "#ffffff", 0.15)),
        ]
        for foreground, background in text_pairs:
            self.assertGreaterEqual(
                contrast(foreground, background),
                4.5,
                msg=f"{foreground} on {background} must meet WCAG AA for normal text",
            )


        for foreground in ("#15803d", "#92400e", "#b91c1c"):
            self.assertGreaterEqual(
                contrast(foreground, "#ffffff"),
                3.0,
                msg=f"{foreground} status dot must meet 3:1 non-text contrast",
            )


    def test_group_switch_does_not_reuse_previous_institute_label(self):
        self.assertIn(
            "INSTITUTE_NAME = resolvedInstitute || (id === DEFAULT_GROUP_ID ? DEFAULT_INSTITUTE_NAME : '');",
            self.html,
        )
        self.assertNotIn("INSTITUTE_NAME = resolvedInstitute || INSTITUTE_NAME || '';", self.html)
        self.assertIn("ИЦТЭ · М-1-25", self.html)


    def test_real_group_switch_resets_missing_institute_and_restores_default_institute(self):
        node = shutil.which("node")
        if not node:
            self.skipTest("Node.js is required to execute the VK group switch")
        start = self.html.index("  async function switchGroup(id,name,meta) {")
        end = self.html.index("  window.kgeuApplySharedProfile = async function(profile)", start)
        switch_function = self.html[start:end]
        script = "\n".join([
            "const assert = require('node:assert/strict');",
            "const DEFAULT_GROUP_ID = 14541, DEFAULT_GROUP_NAME = 'М-1-25', DEFAULT_INSTITUTE_NAME = 'ИЦТЭ';",
            "const FIRST_STUDY = new Date('2026-09-02T00:00:00');",
            "let activeGroupId, GROUP_NAME, INSTITUTE_NAME, CACHE_KEY, allLessons, loadedMonths, selectedDate, weekAnchor, weekSelected, teacherView, lastUpdated, renderedLabel;",
            "function updateGroupLabel() { renderedLabel = (INSTITUTE_NAME || (activeGroupId === DEFAULT_GROUP_ID ? DEFAULT_INSTITUTE_NAME : 'КГЭУ')) + ' · ' + GROUP_NAME; }",
            "function setActiveGroup(id, name) { activeGroupId = Number(id); GROUP_NAME = name; CACHE_KEY = 'kgeu_rasp_vk_v2_' + activeGroupId; updateGroupLabel(); }",
            "function saveActiveGroup() {} function rememberGroup() {} function updateStatusLine() {} function closeGroupModal() {} function renderSavedGroups() {} function toast() {}",
            "function isoDate() { return '2026-11-05'; } function escapeHtml(value) { return String(value); }",
            "async function fetchRasp(args) { return { groupInfo: { name: args.idGroup === DEFAULT_GROUP_ID ? DEFAULT_GROUP_NAME : 'Группа ' + args.idGroup } }; }",
            "async function refresh() {}",
            "const document = { getElementById(id) { return id === 'tabs' ? { style: {} } : { innerHTML: '' }; } };",
            switch_function,
            "async function scenario(id, previousInstitute, expectedInstitute, expectedLabel) {",
            "  activeGroupId = DEFAULT_GROUP_ID; GROUP_NAME = DEFAULT_GROUP_NAME; INSTITUTE_NAME = previousInstitute; CACHE_KEY = 'old';",
            "  allLessons = []; loadedMonths = {}; selectedDate = null; weekAnchor = null; weekSelected = null; teacherView = null; lastUpdated = null;",
            "  await switchGroup(id, '', null);",
            "  assert.equal(INSTITUTE_NAME, expectedInstitute);",
            "  assert.equal(renderedLabel, expectedLabel);",
            "}",
            "(async () => {",
            "  await scenario(99, 'ИЦТЭ', '', 'КГЭУ · Группа 99');",
            "  await scenario(DEFAULT_GROUP_ID, 'Другой институт', DEFAULT_INSTITUTE_NAME, 'ИЦТЭ · М-1-25');",
            "  console.log('VK group institute fallback assertions passed');",
            "})().catch(error => { console.error(error); process.exitCode = 1; });",
        ]);
        result = subprocess.run([node, "-e", script], capture_output=True, text=True, check=False)
        self.assertEqual(result.returncode, 0, msg=result.stdout + result.stderr)
        self.assertIn("VK group institute fallback assertions passed", result.stdout)


if __name__ == "__main__":
    unittest.main()
