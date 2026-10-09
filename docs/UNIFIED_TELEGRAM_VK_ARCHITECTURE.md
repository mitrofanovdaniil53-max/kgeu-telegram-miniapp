# Unified Telegram + VK student platform

**Status:** implementation staged in PR #10; not deployed to production. Existing live apps and Workers must remain unchanged until rollout gates pass.

## Goal

A student's supported personal data follows a deliberately linked account across Telegram Mini App and VK Mini App, on phone and desktop. Public timetable data continues to come from KGEU's schedule API; shared state stores personal information and preferences rather than duplicating public schedule records.

## Current deployment topology

- Telegram frontend: `index.html`.
- VK frontend: `apps/vk/index.html`.
- Both use the GitHub Pages origin `https://mitrofanovdaniil53-max.github.io`.
- Current Telegram path: `https://mitrofanovdaniil53-max.github.io/kgeu-telegram-miniapp/`.
- New VK path after publication: `https://mitrofanovdaniil53-max.github.io/kgeu-telegram-miniapp/apps/vk/`.
- Do not change the VK Mini App launch URL until the new path is published and verified in a real VK session.

## Cloudflare topology

- Shared sync Worker: `kgeu-telegram-miniapp`, D1 binding `DB` to `kgeu-student-db`, existing secret `TELEGRAM_BOT_TOKEN`.
- The production Worker currently does not have `VK_APP_SECRET`; VK authentication must remain unavailable until the owner configures that secret from the official VK Mini App settings. `VK_APP_ID` is an optional non-secret binding that additionally pins the expected app ID.
- `kgeu-vk-bot` is a separate VK Callback API bot Worker; `kgeu-schedule-bot` is a separate Telegram notification Worker. Keep them and their platform-specific notification subscriptions untouched.
- The existing D1 `student_services` table and rows must remain during the first migration.

## Shared account model

The staged Worker and additive migration add:
- `accounts`: canonical account identity.
- `account_identities`: provider identity mapping, unique per `(provider, provider_user_id)`.
- `account_state`: versioned shared state envelope and revision.
- `account_link_codes`: hashed, single-use, expiring link codes.

The migration seeds Telegram identities from existing `student_services` rows and does not delete or rewrite those legacy rows.

## Authentication and linking

- Telegram identity is verified server-side using Telegram `initData` and `TELEGRAM_BOT_TOKEN`.
- VK identity is verified server-side using signed VK Mini App launch parameters and `VK_APP_SECRET`; never trust a client-supplied VK ID alone.
- Link codes expire after 10 minutes and are stored hashed in D1.
- Telegram is the canonical source during initial linking. Local VK notes are merged with conflict backups; a populated VK cloud account is not silently merged.
- The VK Callback API bot remains separate from the Mini App shared-data API.

## Shared data

- Student Service tasks, deadlines, events, dormitory points, reminders and related data.
- Subject notes.
- Selected study group and compatible display preferences.

Platform-specific bot IDs, tokens, notification subscriptions and client-only caches remain separate.

## Rollout gates

1. Review PR #10 and wait for CI checks.
2. Generate and retain a production D1 export before any mutation.
3. Apply `backend/migrations/0002_account_linking.sql`; verify table counts and foreign keys.
4. Configure `VK_APP_SECRET` as a Cloudflare Worker secret from the VK Mini App settings, not the community bot token. Do not commit or paste it into chat. Optionally set `VK_APP_ID` as a plain Worker variable to pin the app ID.
5. Deploy the Worker and verify `/api/health` reports the shared API version and `vkAuthConfigured: true`.
6. Publish the Telegram root frontend and VK at `/apps/vk/`.
7. Test with a real VK session: link Telegram→VK, verify notes/group/settings in both directions, create and edit Student Service data in both clients, test phone/desktop updates, offline/reopen behavior, conflict backups and rejection of invalid/expired codes.
8. Only after all tests pass, update the VK Mini App launch URL. Keep the old repository and bot Workers intact until rollback is verified.

## Acceptance criteria

- Edits made in Telegram appear in VK and vice versa without manual export/import.
- Same-platform phone↔desktop sync continues to work.
- Student Service is available in both frontends.
- Existing Telegram cloud data and local VK notes are not silently overwritten.
- Telegram and VK bot notifications continue independently.
- Auth, link-code errors, offline state and conflicts are visible and recoverable.
- No production database migration or Worker deployment before backup and configuration checks.
