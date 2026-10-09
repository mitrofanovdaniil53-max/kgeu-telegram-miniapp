# KGEU Student Platform — Telegram + VK

This repository is the intended single source of truth for the KGEU student platform. The Telegram and VK entry points remain separate because their launch and authentication APIs differ, while linked accounts share a versioned cloud state.

## Repository layout

- `index.html` — Telegram Mini App frontend and Student Service.
- `apps/vk/index.html` — VK Mini App frontend, including Student Service screens.
- `backend/worker.js` — shared Cloudflare Worker API.
- `backend/schema.sql` — original D1 schema, retained for compatibility.
- `backend/migrations/0002_account_linking.sql` — additive migration for shared accounts and one-time linking.
- `docs/` — architecture, migration and acceptance criteria.
- `tests/test_account_linking_migration.py` — local SQLite migration test.

## What is shared

After the user explicitly links their accounts, the shared state is intended to include Student Service tasks, deadlines, events, dormitory points, reminders, subject notes, selected study group and compatible display settings. Public timetable data remains sourced from KGEU's schedule API.

Telegram and VK bot identities, notification subscriptions, tokens and client-only caches remain platform-specific. The separate `kgeu-vk-bot` and `kgeu-schedule-bot` Workers must not be merged into the shared sync API.

## Current status

The unified integration is staged in [PR #9](https://github.com/mitrofanovdaniil53-max/kgeu-telegram-miniapp/pull/9). It has passed static JavaScript syntax checks and migration tests in CI, but production account linking has not yet been enabled.

The VK frontend's canonical path after publication will be:

`https://mitrofanovdaniil53-max.github.io/kgeu-telegram-miniapp/apps/vk/`

Do not change the VK Mini App launch URL until the new path is live and verified.

## Safe rollout

1. Retain a production D1 export before changing the schema.
2. Apply the additive migration `backend/migrations/0002_account_linking.sql`.
3. Configure `VK_APP_SECRET` as a Cloudflare Worker secret. Never commit or paste it into chat.
4. Deploy the shared Worker and verify `/api/health`.
5. Publish both frontends and test with a real VK session, including cross-platform edits and conflict recovery.
6. Only after testing, switch the VK Mini App URL. Keep the old VK repository and bot Workers intact until rollback is verified.
