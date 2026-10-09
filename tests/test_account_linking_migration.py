import sqlite3
import unittest
from pathlib import Path


MIGRATION = Path(__file__).resolve().parents[1] / "backend" / "migrations" / "0002_account_linking.sql"


class AccountLinkingMigrationTest(unittest.TestCase):
    def setUp(self):
        self.db = sqlite3.connect(":memory:")
        self.db.execute("PRAGMA foreign_keys = ON")
        self.db.execute("""
            CREATE TABLE student_services (
                telegram_user_id TEXT PRIMARY KEY,
                service_json TEXT NOT NULL,
                schema_version INTEGER NOT NULL DEFAULT 1,
                device_id TEXT NOT NULL DEFAULT '',
                updated_at INTEGER NOT NULL
            )
        """)
        self.db.execute(
            "INSERT INTO student_services VALUES (?, ?, ?, ?, ?)",
            ("test-user-1", '{"version":4,"tasks":[{"id":"task-1"}]}', 4, "device-a", 1000),
        )
        self.db.execute(
            "INSERT INTO student_services VALUES (?, ?, ?, ?, ?)",
            ("test-user-2", '{"version":4,"tasks":[]}', 4, "device-b", 2000),
        )
        self.db.commit()

    def tearDown(self):
        self.db.close()

    def test_preserves_legacy_rows_and_seeds_telegram_identities(self):
        self.db.executescript(MIGRATION.read_text(encoding="utf-8"))
        self.assertEqual(self.db.execute("SELECT COUNT(*) FROM student_services").fetchone()[0], 2)
        self.assertEqual(self.db.execute("SELECT COUNT(*) FROM accounts").fetchone()[0], 2)
        self.assertEqual(
            self.db.execute(
                "SELECT COUNT(*) FROM account_identities WHERE provider='telegram'"
            ).fetchone()[0],
            2,
        )
        self.assertEqual(self.db.execute("PRAGMA foreign_key_check").fetchall(), [])

    def test_migration_is_idempotent(self):
        sql = MIGRATION.read_text(encoding="utf-8")
        self.db.executescript(sql)
        self.db.executescript(sql)
        self.assertEqual(self.db.execute("SELECT COUNT(*) FROM accounts").fetchone()[0], 2)
        self.assertEqual(self.db.execute("SELECT COUNT(*) FROM account_identities").fetchone()[0], 2)

    def test_existing_service_json_is_untouched(self):
        before = self.db.execute(
            "SELECT telegram_user_id, service_json, schema_version, device_id, updated_at "
            "FROM student_services ORDER BY telegram_user_id"
        ).fetchall()
        self.db.executescript(MIGRATION.read_text(encoding="utf-8"))
        after = self.db.execute(
            "SELECT telegram_user_id, service_json, schema_version, device_id, updated_at "
            "FROM student_services ORDER BY telegram_user_id"
        ).fetchall()
        self.assertEqual(after, before)


if __name__ == "__main__":
    unittest.main()
