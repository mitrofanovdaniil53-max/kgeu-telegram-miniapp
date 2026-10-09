-- Migration 0002: canonical accounts and cross-platform identity linking.
-- SAFE PREPARATION ONLY: this file is not executed automatically.
-- It preserves the existing student_services table and every existing row.
-- Review and back up production D1 before applying.

PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS accounts (
  account_id TEXT PRIMARY KEY,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS account_identities (
  provider TEXT NOT NULL CHECK (provider IN ('telegram', 'vk')),
  provider_user_id TEXT NOT NULL,
  account_id TEXT NOT NULL,
  linked_at INTEGER NOT NULL,
  PRIMARY KEY (provider, provider_user_id),
  FOREIGN KEY (account_id) REFERENCES accounts(account_id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_account_identities_account
  ON account_identities(account_id);

CREATE TABLE IF NOT EXISTS account_state (
  account_id TEXT PRIMARY KEY,
  state_json TEXT NOT NULL,
  schema_version INTEGER NOT NULL DEFAULT 1,
  revision INTEGER NOT NULL DEFAULT 1,
  updated_at INTEGER NOT NULL,
  FOREIGN KEY (account_id) REFERENCES accounts(account_id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS account_link_codes (
  code_hash TEXT PRIMARY KEY,
  source_account_id TEXT NOT NULL,
  source_provider TEXT NOT NULL CHECK (source_provider IN ('telegram', 'vk')),
  expires_at INTEGER NOT NULL,
  consumed_at INTEGER,
  created_at INTEGER NOT NULL,
  FOREIGN KEY (source_account_id) REFERENCES accounts(account_id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_account_link_codes_expiry
  ON account_link_codes(expires_at, consumed_at);

-- Preserve the current Telegram identity mapping for users already present
-- in student_services. Keep the old table in place for compatibility/rollback.
INSERT OR IGNORE INTO accounts (account_id, created_at, updated_at)
SELECT 'tg:' || telegram_user_id, updated_at, updated_at
FROM student_services;

INSERT OR IGNORE INTO account_identities
  (provider, provider_user_id, account_id, linked_at)
SELECT 'telegram', telegram_user_id, 'tg:' || telegram_user_id, updated_at
FROM student_services;
