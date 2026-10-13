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


if __name__ == "__main__":
    unittest.main()
