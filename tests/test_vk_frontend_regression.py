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
        self.assertNotIn(".vk-light .top-shell {", self.html)
        self.assertNotIn("html.vk-dark .top-shell,", self.html)

    def test_group_switch_does_not_reuse_previous_institute_label(self):
        self.assertIn(
            "INSTITUTE_NAME = resolvedInstitute || (id === DEFAULT_GROUP_ID ? DEFAULT_INSTITUTE_NAME : '');",
            self.html,
        )
        self.assertNotIn("INSTITUTE_NAME = resolvedInstitute || INSTITUTE_NAME || '';", self.html)
        self.assertIn("ИЦТЭ · М-1-25", self.html)


if __name__ == "__main__":
    unittest.main()
