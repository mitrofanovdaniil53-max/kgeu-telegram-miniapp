import sqlite3
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
MIGRATION = ROOT / "backend" / "migrations" / "0002_account_linking.sql"


class AccountLinkingSchemaHardeningTest(unittest.TestCase):
    """Guardrails for the production account-linking schema.

    These tests execute the migration against an isolated SQLite database. They do
    not contact or modify production Cloudflare D1.
    """

    def setUp(self):
        self.db = sqlite3.connect(":memory:")
        self.db.execute("PRAGMA foreign_keys = ON")
        self.db.executescript("""
            CREATE TABLE student_services (
                telegram_user_id TEXT PRIMARY KEY,
                service_json TEXT NOT NULL,
                schema_version INTEGER NOT NULL DEFAULT 1,
                device_id TEXT NOT NULL DEFAULT '',
                updated_at INTEGER NOT NULL
            );
        """)
        self.db.execute(
            "INSERT INTO student_services VALUES (?, ?, ?, ?, ?)",
            ("telegram-100", '{"version":4,"tasks":[{"id":"preserve-me"}]}', 4, "phone", 1000),
        )
        self.db.executescript(MIGRATION.read_text(encoding="utf-8"))

    def tearDown(self):
        self.db.close()

    def test_identity_is_unique_per_provider_and_user(self):
        with self.assertRaises(sqlite3.IntegrityError):
            self.db.execute(
                "INSERT INTO account_identities (provider, provider_user_id, account_id, linked_at) "
                "VALUES ('telegram', 'telegram-100', 'tg:telegram-100', 2000)"
            )

    def test_provider_check_rejects_unknown_platform(self):
        self.db.execute(
            "INSERT INTO accounts (account_id, created_at, updated_at) VALUES ('test-account', 1000, 1000)"
        )
        with self.assertRaises(sqlite3.IntegrityError):
            self.db.execute(
                "INSERT INTO account_identities (provider, provider_user_id, account_id, linked_at) "
                "VALUES ('unknown', 'user-1', 'test-account', 1000)"
            )

    def test_foreign_keys_prevent_orphan_identity_and_state(self):
        with self.assertRaises(sqlite3.IntegrityError):
            self.db.execute(
                "INSERT INTO account_identities (provider, provider_user_id, account_id, linked_at) "
                "VALUES ('vk', 'vk-1', 'missing-account', 1000)"
            )
        with self.assertRaises(sqlite3.IntegrityError):
            self.db.execute(
                "INSERT INTO account_state (account_id, state_json, schema_version, revision, updated_at) "
                "VALUES ('missing-account', '{}', 1, 1, 1000)"
            )

    def test_link_codes_store_hash_and_support_single_consumption_state(self):
        columns = {
            row[1] for row in self.db.execute("PRAGMA table_info(account_link_codes)").fetchall()
        }
        self.assertIn("code_hash", columns)
        self.assertIn("consumed_at", columns)
        self.assertNotIn("code", columns)

    def test_delete_account_cascades_identity_and_state(self):
        self.db.execute(
            "INSERT INTO account_state (account_id, state_json, schema_version, revision, updated_at) "
            "VALUES ('tg:telegram-100', '{\"envelopeVersion\":1}', 1, 1, 1000)"
        )
        self.db.execute("DELETE FROM accounts WHERE account_id = 'tg:telegram-100'")
        self.assertEqual(
            self.db.execute(
                "SELECT COUNT(*) FROM account_identities WHERE account_id = 'tg:telegram-100'"
            ).fetchone()[0],
            0,
        )
        self.assertEqual(
            self.db.execute(
                "SELECT COUNT(*) FROM account_state WHERE account_id = 'tg:telegram-100'"
            ).fetchone()[0],
            0,
        )

    def test_legacy_service_data_survives_migration_unchanged(self):
        row = self.db.execute(
            "SELECT service_json, schema_version, device_id, updated_at "
            "FROM student_services WHERE telegram_user_id = 'telegram-100'"
        ).fetchone()
        self.assertEqual(row, ('{"version":4,"tasks":[{"id":"preserve-me"}]}', 4, "phone", 1000))

    def test_foreign_key_check_is_clean_after_migration(self):
        self.assertEqual(self.db.execute("PRAGMA foreign_key_check").fetchall(), [])


if __name__ == "__main__":
    unittest.main()
