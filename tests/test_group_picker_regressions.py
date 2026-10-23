from pathlib import Path
import unittest


ROOT = Path(__file__).resolve().parents[1]


class GroupPickerRegressionTest(unittest.TestCase):
    def test_both_frontends_use_shared_group_directory_proxy(self):
        expected = "https://kgeu-telegram-miniapp.2vkv544dmd.workers.dev/api/groups?year=2026-2027"
        for relative in ("index.html", "apps/vk/index.html"):
            source = (ROOT / relative).read_text(encoding="utf-8")
            with self.subTest(frontend=relative):
                self.assertIn(expected, source)
                self.assertNotIn(
                    "https://kabinet.kgeu.ru/api/raspGrouplist?year=2026-2027",
                    source,
                )

    def test_worker_has_public_read_only_group_directory_route(self):
        source = (ROOT / "backend" / "worker.js").read_text(encoding="utf-8")
        self.assertIn("url.pathname === '/api/groups' && request.method === 'GET'", source)
        self.assertIn("https://kabinet.kgeu.ru/api/raspGrouplist?year=", source)
        self.assertIn("group_directory_invalid_response", source)
        self.assertIn("group_directory_unavailable", source)

    def test_empty_schedule_on_probe_date_does_not_reject_group(self):
        for relative in ("index.html", "apps/vk/index.html"):
            source = (ROOT / relative).read_text(encoding="utf-8")
            with self.subTest(frontend=relative):
                self.assertIn("An empty schedule for one date does not mean the group is invalid.", source)
                self.assertNotIn(
                    "if (!probe.groupInfo && !probe.lessons.length) {\n        throw new Error('group not found');",
                    source,
                )


if __name__ == "__main__":
    unittest.main()
