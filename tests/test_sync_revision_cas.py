import sqlite3
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
WORKER_SOURCE = (ROOT / "backend" / "worker.js").read_text(encoding="utf-8")


class SyncRevisionCasTests(unittest.TestCase):
    def setUp(self):
        self.db = sqlite3.connect(":memory:")
        self.db.execute("""
            CREATE TABLE account_state (
                account_id TEXT PRIMARY KEY,
                state_json TEXT NOT NULL,
                schema_version INTEGER NOT NULL,
                revision INTEGER NOT NULL,
                updated_at INTEGER NOT NULL
            )
        """)
        self.db.execute("""
            CREATE TABLE accounts (
                account_id TEXT PRIMARY KEY,
                updated_at INTEGER NOT NULL
            )
        """)
        self.db.execute("INSERT INTO accounts VALUES ('tg:1', 1)")
        self.db.commit()

    def tearDown(self):
        self.db.close()

    def cas_write(self, expected_revision, state_json, now):
        cursor = self.db.execute("""
            INSERT INTO account_state (account_id, state_json, schema_version, revision, updated_at)
            SELECT ?, ?, ?, 1, ? WHERE ? = 0
            ON CONFLICT(account_id) DO UPDATE SET
              state_json = excluded.state_json,
              schema_version = excluded.schema_version,
              revision = account_state.revision + 1,
              updated_at = excluded.updated_at
            WHERE account_state.revision = ?
        """, ("tg:1", state_json, 4, now, expected_revision, expected_revision))
        if cursor.rowcount != 1:
            raise RuntimeError("sync_revision_conflict")
        self.db.execute("UPDATE accounts SET updated_at = ? WHERE account_id = ?", (now, "tg:1"))
        self.db.commit()
        return self.db.execute(
            "SELECT revision, state_json, updated_at FROM account_state WHERE account_id = ?",
            ("tg:1",)
        ).fetchone()

    def test_first_write_requires_revision_zero(self):
        row = self.cas_write(0, '{"value":"first"}', 10)
        self.assertEqual(row, (1, '{"value":"first"}', 10))

    def test_matching_revision_increments_once(self):
        self.cas_write(0, '{"value":"first"}', 10)
        row = self.cas_write(1, '{"value":"second"}', 20)
        self.assertEqual(row, (2, '{"value":"second"}', 20))

    def test_stale_write_is_rejected_without_mutating_state_or_account_timestamp(self):
        self.cas_write(0, '{"value":"first"}', 10)
        self.cas_write(1, '{"value":"second"}', 20)
        with self.assertRaisesRegex(RuntimeError, "sync_revision_conflict"):
            self.cas_write(1, '{"value":"stale"}', 30)
        self.assertEqual(
            self.db.execute(
                "SELECT revision, state_json, updated_at FROM account_state WHERE account_id = 'tg:1'"
            ).fetchone(),
            (2, '{"value":"second"}', 20)
        )
        self.assertEqual(
            self.db.execute("SELECT updated_at FROM accounts WHERE account_id = 'tg:1'").fetchone()[0],
            20
        )

    def test_nonzero_expected_revision_cannot_create_missing_state(self):
        with self.assertRaisesRegex(RuntimeError, "sync_revision_conflict"):
            self.cas_write(3, '{"value":"invalid bootstrap"}', 30)
        self.assertIsNone(
            self.db.execute("SELECT 1 FROM account_state WHERE account_id = 'tg:1'").fetchone()
        )

    def test_worker_uses_atomic_cas_and_maps_conflict_to_http_409(self):
        self.assertIn("WHERE account_state.revision = ?", WORKER_SOURCE)
        self.assertIn("WHERE ? = 0", WORKER_SOURCE)
        self.assertIn("throw new Error('sync_revision_conflict')", WORKER_SOURCE)
        self.assertIn("|| code === 'sync_revision_conflict' ? 409", WORKER_SOURCE)
        save_start = WORKER_SOURCE.index("async function saveAccountState")
        save_end = WORKER_SOURCE.index("async function hashLinkCode", save_start)
        save_function = WORKER_SOURCE[save_start:save_end]
        self.assertLess(save_function.index("throw new Error('sync_revision_conflict')"),
                        save_function.index("UPDATE accounts SET updated_at"))

    def test_legacy_callers_can_omit_expected_revision(self):
        self.assertIn("if (incoming.hasExpectedRevision)", WORKER_SOURCE)
        self.assertIn("// Legacy clients and the account-link merge path may still use unconditional writes.", WORKER_SOURCE)


if __name__ == "__main__":
    unittest.main()
