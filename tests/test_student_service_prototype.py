from html.parser import HTMLParser
from pathlib import Path
import re
import unittest


ROOT = Path(__file__).resolve().parents[1]
PROTOTYPE = ROOT / "prototypes" / "student-service-dashboard.html"


class PrototypeMarkupParser(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.ids = []
        self.view_targets = []
        self.attributes = []

    def handle_starttag(self, tag, attrs):
        attrs = dict(attrs)
        self.attributes.append((tag, attrs))
        if attrs.get("id"):
            self.ids.append(attrs["id"])
        if tag == "button" and attrs.get("data-view"):
            self.view_targets.append(attrs["data-view"])


class StudentServicePrototypeRegressionTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.source = PROTOTYPE.read_text(encoding="utf-8")
        cls.parser = PrototypeMarkupParser()
        cls.parser.feed(cls.source)

    def test_dom_ids_are_unique_and_script_references_exist(self):
        ids = self.parser.ids
        self.assertEqual(len(ids), len(set(ids)), "Prototype contains duplicate DOM ids")
        referenced = set(re.findall(r"getElementById\(['\"]([^'\"]+)['\"]\)", self.source))
        missing = sorted(referenced - set(ids))
        self.assertEqual(missing, [], "Script references missing DOM ids")

    def test_every_navigation_target_has_a_view_container(self):
        views_match = re.search(r"const views=\{([^}]+)\}", self.source)
        self.assertIsNotNone(views_match, "View registry not found")
        registered = set(re.findall(r"([a-zA-Z]+):document\.getElementById\(['\"]([^'\"]+)['\"]\)", views_match.group(1)))
        registered_keys = {key for key, _ in registered}
        registered_ids = {element_id for _, element_id in registered}
        self.assertTrue({"homeView", "studyView", "calendarView", "hostelView"}.issubset(registered_ids))
        self.assertTrue(set(self.parser.view_targets).issubset(registered_keys))
        self.assertTrue({"home", "study", "calendar", "hostel"}.issubset(registered_keys))

    def test_feedback_and_demo_boundary_are_explicit(self):
        self.assertRegex(self.source, r'role="status"[^>]*aria-live="polite"|aria-live="polite"[^>]*role="status"')
        self.assertIn("тестовые данные", self.source.lower())
        self.assertIn("Ничего не синхронизируется и не сохраняется в аккаунт", self.source)
        self.assertIn("prefers-reduced-motion:reduce", self.source)
        self.assertIn(".btn.small{min-height:44px", self.source)

    def test_modal_supports_escape_focus_trap_and_focus_return(self):
        self.assertIn("e.key==='Escape'", self.source)
        self.assertIn("e.key==='Tab'&&dialog", self.source)
        self.assertIn("modalOpener.focus()", self.source)
        self.assertIn('role="dialog" aria-modal="true"', self.source)


if __name__ == "__main__":
    unittest.main()
