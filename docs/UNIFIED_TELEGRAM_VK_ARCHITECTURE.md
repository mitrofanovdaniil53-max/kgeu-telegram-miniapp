# Unified Telegram + VK platform — architecture plan

Status: discovery and design only. No production code, bindings, secrets, or user data changed by this document.

## Goal

A student's supported personal data must follow their linked account across Telegram Mini App and VK Mini App, on phone and desktop. The schedule itself is fetched from KGEU's schedule API; the shared platform should synchronize the student's selection/preferences and personal data, not duplicate public schedule records unnecessarily.

## Current state confirmed from source and Cloudflare

### GitHub repositories
- Telegram Mini App: `mitrofanovdaniil53-max/kgeu-telegram-miniapp`, default branch `main`.
- VK Mini App: `mitrofanovdaniil53-max/kgeu-schedule-vk`, default branch `main`.
- Both frontends are currently single-file `index.html` applications. Telegram repo also contains `backend/worker.js`, `backend/schema.sql`, and `backend/wrangler.toml`.
- Both Mini App URLs currently use the same GitHub Pages origin `https://mitrofanovdaniil53-max.github.io`; Telegram's bot Worker points to `/kgeu-telegram-miniapp/`, and the VK bot Worker points to `/kgeu-schedule-vk/index.html`.
- The VK Mini App ID in the current VK bot Worker is `54754459` (community ID `241328142`).

### Cloudflare Workers
- `kgeu-telegram-miniapp`: D1 binding `DB` to `kgeu-student-db`; secret binding `TELEGRAM_BOT_TOKEN`.
- `kgeu-vk-bot`: VK Callback API bot, KV binding `KGEU_VK_USERS`, secret binding `VK_TOKEN`. This worker currently handles bot callbacks, not the Mini App's shared-data API.
- `kgeu-schedule-bot`: Telegram bot/notification worker using KV `KGEU_SCHEDULE`, secret `BOT_TOKEN`.
- The existing D1 database has table `student_services(telegram_user_id PRIMARY KEY, service_json, schema_version, device_id, updated_at)`. It is used by the Telegram Mini App sync API.

### Frontend storage and auth
- Telegram Mini App authenticates its sync requests with server-verified `X-Telegram-Init-Data`.
- Telegram Student Service already syncs its service data and subject notes with the Telegram Worker.
- VK Mini App's subject notes currently use browser `localStorage` key `kgeu_vk_personal_data_v1`; the Telegram version uses a different key, `kgeu_tg_personal_data_v1`.
- Both frontends keep group selection and display settings in separate localStorage keys. Schedule data is fetched from KGEU's public schedule API and cached locally.
- The VK Worker stores VK bot user preferences/notification state in KV. The Telegram bot Worker stores Telegram bot user preferences/notification state in a separate KV. These are platform-specific bot subscriptions and must not be blindly merged into one notification flag.

## Proposed architecture

### One canonical account, separate platform identities

Use D1 as the canonical shared data store. Add an internal immutable `account_id` and identity-link table; do not assume a Telegram numeric ID equals a VK numeric ID.

Proposed conceptual tables:
- `accounts(account_id, created_at, updated_at)`
- `account_identities(provider, provider_user_id, account_id, linked_at)`, unique on `(provider, provider_user_id)`
- `account_state(account_id PRIMARY KEY, state_json, schema_version, revision, updated_at)`
- `account_link_codes(code_hash, source_account_id, source_provider, expires_at, consumed_at, created_at)`

Exact SQL and migration mechanics are to be reviewed before applying. Existing `student_services` rows must be preserved and mapped to the same account for their existing Telegram user. Do not drop the old table during the first rollout.

### Server-side authentication

- Telegram identity: keep validating Telegram `initData` with `TELEGRAM_BOT_TOKEN`.
- VK identity: validate a signed VK Mini App launch payload on the server using the VK application's secret, stored only as a Worker secret (never in HTML or Git). Do not trust a client-supplied VK ID alone.
- The VK Callback API bot remains separate from the Mini App sync API, even if both eventually use shared D1 data.
- Restrict CORS to the actual deployed frontend origins after confirming them.

### Account linking and migration

1. User opens Account/Sync settings in the platform already linked to their data and requests a short-lived one-time link code.
2. User opens the other platform and confirms the code while authenticated there.
3. Backend verifies both platform identities, consumes the code atomically, and links the second identity to the existing canonical account. Never merge two accounts automatically by display name, email-like username, or matching numeric IDs.
4. Import local VK notes and local preferences using a reviewed merge strategy; preserve backups and report conflicts. Existing Telegram cloud data remains the initial canonical state for a Telegram account.
5. After linking, both frontends read/write the same versioned account state. Keep per-platform notification delivery preferences and platform identifiers separate.

### Shared data to evaluate for v1
- Subject notes.
- Student Service tasks, deadlines, events, and dormitory/points data.
- Selected group and compatible student-facing preferences.
- Any future personal student tools added to Student Service.

### Keep platform-specific
- Telegram/VK bot IDs, push/reminder subscriptions, tokens, VK bridge state, and client-only caches.
- Schedule payloads and public group directory cache unless a later measured need justifies central caching.

## Rollout and safety plan

1. Finish inventory of all persisted fields and data owners in both Mini Apps and both bot Workers.
2. Add schema migrations in a reviewed branch; create a backup/export checkpoint before any production D1 mutation.
3. Implement a versioned shared API with provider-specific authentication and an atomic one-time linking flow.
4. Add VK Mini App client integration while leaving existing localStorage keys intact until cloud data is confirmed.
5. Migrate Telegram sync to canonical accounts without removing backward compatibility for existing Telegram IDs.
6. Test old Telegram sync, VK local-only behavior, link/unlink errors, stale/conflicting writes, backups, and all four phone/desktop cross-platform directions.
7. Deploy progressively and retain a rollback path. Do not archive or delete either repository or Worker during rollout.

## External configuration that may be needed

The VK app secret is not available from the frontend source or the current Worker bindings. Before implementing production VK identity verification, the owner will need to configure a secret such as `VK_APP_SECRET` in the shared API Worker using the VK application's official secret. Never paste it into source code, an issue, or a chat message. The exact secret and official app settings must be verified before activation.

## Acceptance criteria

- One-time account linking is required and verified for each provider.
- An edit made in Telegram appears in VK, and vice versa, without manual export/import.
- Same-platform cross-device sync remains intact.
- Existing Telegram cloud data and local VK notes are not silently overwritten.
- Telegram and VK bot notifications continue to work independently.
- Authentication, conflicts, offline state, and restore errors are visible and recoverable.
- No production database is changed until the migration and backup have been reviewed.
