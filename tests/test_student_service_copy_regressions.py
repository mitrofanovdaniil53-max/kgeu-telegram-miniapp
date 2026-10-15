from pathlib import Path
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


if __name__ == "__main__":
    unittest.main()
