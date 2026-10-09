# Unified Telegram + VK student platform

**Status:** implementation staged in PR #8; not deployed to production. The existing live apps and Workers must remain unchanged until the rollout gates below pass.

## Goal

A student's supported personal data follows a deliberately linked account across Telegram Mini App and VK Mini App, on phone and desktop. Public timetable data continues to come from KGEU's schedule API; we synchronize personal state instead of duplicating public schedule records.

## Current deployment topology

### Repositories and frontends
- Telegram frontend source: `mitrofanovdaniil53-max/kgeu-telegram-miniapp/index.html`.
- VK frontend source: `mitrofanovdaniil53-max/kgeu-schedule-vk/index.html`.
- Both currently use the GitHub Pages origin `https://mitrofanovdaniil53-max.github.io`.
- The Telegram Mini App currently uses the `/kgeu-telegram-miniapp/` path; the existing VK Mini App uses `/kgeu-schedule-vk/index.html`.
- The consolidated repository keeps Telegram at `index.html` and stages VK at `vk/index.html`. After publishing and verifying this repository, the new VK URL will be `https://mitrofanovdaniil53-max.github.io/kgeu-telegram-miniapp/vk/index.html`. Do not change the VK application URL until that URL is published and tested.

### Cloudflare
- Shared sync Worker: `kgeu-telegram-miniapp`, D1 binding `DB` to `kgeu-student-db`, existing secret `TELEGRAM_BOT_TOKEN`.
- The shared sync Worker currently does **not** have `VK_APP_SECRET`; VK authentication will remain unavailable until the owner configures that secret from the VK application's official settings.
- `kgeu-vk-bot` is a separate VK Callback API bot Worker; `kgeu-schedule-bot` is a separate Telegram notification Worker. Keep both and their platform-specific bot subscriptions untouched.
- The production D1 schema currently includes the legacy `student_services` table. The original table must remain during rollout and rollback.

## Shared account model

The integration branch adds:
- `accounts`: canonical account identity.
- `account_identities`: provider identity mapping, unique per `(provider, provider_user_id)`.
- `account_state`: versioned shared data envelope and revision.
- `account_link_codes`: hashed, single-use, expiring link codes.

The additive migration seeds Telegram identities from existing `student_services` rows and does not delete or rewrite those legacy rows.

## Authentication and linking

- Telegram identity is verified on the server using Telegram `initData` and the existing `TELEGRAM_BOT_TOKEN` secret.
- VK identity is verified on the server using signed VK Mini App launch parameters and `VK_APP_SECRET`; the frontend must never send a trusted user ID by itself.
- The account link code is valid for 10 minutes and is stored hashed in D1.
- The initial linking flow treats the existing Telegram account as canonical. Local VK notes are merged with conflict backups; an already-populated VK cloud account is not silently merged.
- The VK Callback API bot remains separate from the Mini App shared-data API.

## Data intended to be shared

- Student Service tasks, deadlines, events, dormitory points, reminders and related data.
- Subject notes.
- Selected study group and compatible display preferences.

Platform-specific notification subscriptions, bot IDs, tokens and client-only caches remain separate.

## Repository layout

```text
kgeu-telegram-miniapp/
├── index.html                         # Telegram Mini App
├── vk/
│   └── index.html                     # VK Mini App
├── backend/
│   ├── worker.js                      # shared sync API
│   ├── schema.sql                     # original schema, retained
│   ├── migrations/
│   │   └── 0002_account_linking.sql   # additive migration
│   └── wrangler.toml
├── scripts/check-inline-js.mjs
├── tests/test_account_linking_migration.py
└── .github/workflows/platform-checks.yml
```

## Rollout plan

1. Review PR #8 and wait for CI checks.
2. Generate and retain a production D1 export before any mutation.
3. Apply `backend/migrations/0002_account_linking.sql`; verify table counts and foreign keys.
4. Configure `VK_APP_SECRET` as a Worker secret. Do not commit or paste it into chat.
5. Deploy `backend/worker.js`; check `/api/health` reports the shared API version and `vkAuthConfigured: true`.
6. Publish the Telegram root frontend and the VK frontend at the new `/vk/index.html` path.
7. Test using a real VK session: link Telegram→VK, confirm notes and group settings in both directions, create/edit Student Service data from both clients, test phone/desktop updates, offline/reopen behavior, conflict backups and rejection of invalid/expired codes.
8. Only after those tests pass, update the VK Mini App launch URL to the new GitHub Pages path. Keep the old repository and bot Workers intact until rollback is verified.

## Acceptance criteria

- An edit made in Telegram appears in VK and vice versa without manual export/import.
- Same-platform phone↔desktop sync continues to work.
- The Student Service interface is available in both frontends.
- Existing Telegram cloud data and local VK notes are not silently overwritten.
- Telegram and VK bot notifications continue independently.
- Invalid auth, link-code errors, offline state and conflicts are recoverable and visible.
- No production database migration or Worker deployment occurs before backup and configuration checks.
