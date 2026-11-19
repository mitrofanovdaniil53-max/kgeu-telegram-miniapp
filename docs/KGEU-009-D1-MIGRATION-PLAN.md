# KGEU-009 — D1 migration design (proposal only)

**Status:** design draft; no D1/KV reads, writes, schema changes, or migrations are performed by this document.  
**Scope:** structured bot data in the shared Telegram/VK bot KV namespace.  
**Principle:** D1 becomes the transactional source of truth only after a separately approved migration and cutover.

## 1. Entities proposed for D1

| Entity | Source data | Proposed destination |
|---|---|---|
| Bot profiles | new `user:telegram:<id>` / `user:vk:<id>` JSON; legacy `user:<id>` JSON and Telegram `user:<id>:group` / `user:<id>:notify` | `bot_profiles` |
| Notification preferences | Profile flags `notifications`, `dailyNotifications`, `reminderNotifications`, `changeNotifications` | Columns in `bot_profiles` |
| Personal reminders | new `personal-reminder:telegram:<id>:<uuid>` / `personal-reminder:vk:<id>:<uuid>`; legacy `personal-reminder:<id>:<uuid>` | `personal_reminders` |
| Notification dedupe / delivery | Telegram `notification:`, VK `sent:` prefixes | `notification_deliveries` |
| Schedule snapshots | `snapshot:<groupId>:<date>` | `schedule_snapshots` |
| Group directory cache | `cache:groups` | Not migrated; use HTTP/Workers Cache or upstream API |

## 2. Proposed schema

```sql
CREATE TABLE bot_profiles (
  platform TEXT NOT NULL CHECK (platform IN ('telegram','vk')),
  provider_user_id TEXT NOT NULL,
  username TEXT,
  first_name TEXT,
  last_name TEXT,
  group_id INTEGER,
  group_name TEXT,
  course INTEGER,
  faculty TEXT,
  faculty_id TEXT,
  notifications_enabled INTEGER NOT NULL DEFAULT 1,
  daily_enabled INTEGER NOT NULL DEFAULT 1,
  reminder_enabled INTEGER NOT NULL DEFAULT 1,
  change_enabled INTEGER NOT NULL DEFAULT 1,
  conversation_state TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  revision INTEGER NOT NULL DEFAULT 1,
  PRIMARY KEY (platform, provider_user_id)
);

CREATE INDEX idx_bot_profiles_group_platform
  ON bot_profiles(platform, group_id, notifications_enabled);

CREATE TABLE personal_reminders (
  id TEXT NOT NULL,
  platform TEXT NOT NULL CHECK (platform IN ('telegram','vk')),
  provider_user_id TEXT NOT NULL,
  title TEXT NOT NULL,
  note TEXT,
  reminder_date TEXT NOT NULL,
  reminder_time TEXT NOT NULL,
  fire_at INTEGER NOT NULL,
  created_at INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','sending','sent','cancelled','expired')),
  delivery_key TEXT NOT NULL,
  PRIMARY KEY (platform, provider_user_id, id),
  FOREIGN KEY (platform, provider_user_id)
    REFERENCES bot_profiles(platform, provider_user_id)
);

CREATE INDEX idx_personal_reminders_due
  ON personal_reminders(status, fire_at, platform);

CREATE INDEX idx_personal_reminders_owner
  ON personal_reminders(platform, provider_user_id, fire_at);

CREATE TABLE notification_deliveries (
  platform TEXT NOT NULL,
  provider_user_id TEXT NOT NULL,
  notification_type TEXT NOT NULL,
  event_key TEXT NOT NULL,
  idempotency_key TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('pending','sent','failed')),
  created_at INTEGER NOT NULL,
  sent_at INTEGER,
  provider_message_id TEXT,
  last_error TEXT,
  PRIMARY KEY (platform, provider_user_id, notification_type, event_key),
  UNIQUE (platform, idempotency_key)
);

CREATE INDEX idx_notification_deliveries_status
  ON notification_deliveries(status, created_at);

CREATE TABLE schedule_snapshots (
  group_id INTEGER NOT NULL,
  schedule_date TEXT NOT NULL,
  signature TEXT NOT NULL,
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (group_id, schedule_date)
);
```

Use explicit UTC Unix milliseconds for timestamps. Keep provider IDs as TEXT to avoid numeric precision or platform-casting ambiguity. Do not use a shared ID-only primary key: the composite platform/provider key is mandatory.

## 3. Legacy key mapping

- `user:telegram:<numericId>` and `user:vk:<numericId>`: new platform-scoped profile keys; validate that the embedded platform ID matches the key.
- `user:<numericId>`: legacy shared key. Parse JSON and infer platform only from exactly one of `telegramId` or `vkId`. If both are present, both absent, or the embedded ID differs from the key suffix, quarantine the row; do not guess.
- `user:<numericId>:group`: Telegram profile group fields. Import only when the value parses and the matching Telegram profile is not ambiguous.
- `user:<numericId>:notify`: Telegram notification preference. Missing means legacy default; malformed values are quarantined.
- `personal-reminder:telegram:<numericId>:<uuid>` and `personal-reminder:vk:<numericId>:<uuid>`: new platform-scoped reminder keys; verify the embedded owner.
- `personal-reminder:<numericId>:<uuid>`: legacy shared reminder key; infer platform from exactly one of `telegramId` or `vkId` and verify the owner.
- `notification:` and `sent:`: map to `notification_deliveries` with explicit platform and a deterministic event key. Unparseable keys remain in backup/quarantine.
- `snapshot:`: map group/date/signature to `schedule_snapshots`.
- `replacement:` and unknown prefixes: inventory separately before mapping; do not bulk-delete or silently discard.

## 4. Rollout stages

1. **Inventory and backup:** owner-approved, read-only export of all relevant KV keys/values, including pagination completion proofs. Record namespace/key counts and timestamp. Because KV is eventually consistent, a consistent cutover requires a controlled write pause or an explicitly accepted delta window.
2. **Schema on isolated D1:** apply schema to a staging database only. Test unique constraints, foreign keys, transactions, CAS revision updates, due-reminder indexes, and concurrent first-profile creation.
3. **Dry-run importer:** parse and normalize into staging D1; quarantine ambiguous records; do not delete or rename KV keys.
4. **Integrity verification:** compare source and target counts by entity/platform, owner IDs, profile fields, reminder IDs/fireAt/status, notification keys and snapshot signatures. Compute deterministic SHA-256 over canonical JSON rows sorted by composite primary key. Require zero unexplained mismatches and zero unprocessed source keys.
5. **Shadow-read:** read from D1 in staging and compare against KV results without changing user-visible behavior. Log only aggregate mismatch counters, never profile payloads.
6. **Controlled dual-write (only if approved):** make D1 the primary transactional write, and use a durable outbox for KV compatibility writes if needed. Never interpret a timeout as a failed write without checking the idempotency key. Do not issue destructive KV operations during dual-write.
7. **Cutover:** switch reads to D1 after QA, backup, owner approval, and explicit rollback window. Keep legacy KV data intact and read-only through the observation period.
8. **Retirement:** only after the retention period, reconciliation, and a separate owner-approved change may legacy KV data be archived or deleted.

## 5. Dual-read / dual-write rules

- During import and shadow-read, KV remains canonical; D1 is a comparison target.
- During controlled migration, use D1 transactions and `PRIMARY KEY(platform, provider_user_id)` for atomic profile creation/upsert. Use `revision` / compare-and-swap for profile updates.
- Do not blindly write to both stores in parallel. A durable outbox row with a deterministic operation ID is required to replay compatibility writes safely.
- Read fallback is permitted only for a confirmed D1 NOT_FOUND during a defined migration phase. D1 errors must remain distinct from NOT_FOUND.
- Once D1 is canonical, do not fall back to stale KV after D1 READ_ERROR; fail closed.

## 6. Backup, checksums and rollback

- Backup must include a complete paginated KV export and D1 pre-migration snapshot. Verify backup readability before import.
- Store backup metadata: source namespace logical label, export time, key counts by prefix, importer version, and checksum manifest. Keep physical namespace IDs and user identifiers out of general logs.
- Per-table checksums: canonicalize JSON (stable key ordering, normalized number/string forms), sort by composite key, hash each row, then hash the ordered row-hash list.
- Stop immediately on incomplete pagination, parse ambiguity, owner mismatch, checksum/count mismatch, unexpected duplicate, failed transaction, or write error rate above the agreed threshold.
- Rollback before cutover: discard staging D1 and continue on unchanged KV.
- Rollback after cutover: restore the prior Worker version only after assessing post-cutover writes. Replay D1 outbox/delta into KV with owner-scoped conditional reconciliation; never restore an old snapshot over newer user data. Keep all KV keys until rollback validation completes.
- Repeated importer execution must be idempotent via composite keys and import-batch IDs; never duplicate reminders or notification delivery records.

## 7. Required acceptance gates

- Same numeric Telegram/VK IDs remain separate rows and never share settings.
- Concurrent profile creation produces one row per composite identity without lost updates.
- Every legacy source key is imported, quarantined with a reason, or explicitly accounted for.
- Due-reminder selection is bounded and indexed; no full table scan is required per minute.
- Notification outbox prevents duplicate provider actions where the provider supports idempotency; Telegram's sendMessage limitation needs a separate delivery-state policy.
- QA validates backup restore and rollback on isolated staging before any production decision.

**Owner decision required:** choose D1 vs Durable Object as the atomic profile-creation coordinator, approve backup/cutover window, and decide whether to keep temporary KV compatibility writes.
