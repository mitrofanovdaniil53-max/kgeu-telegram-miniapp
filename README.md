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

- Telegram and VK frontends share the Cloudflare Worker API after explicit account linking.
- Automated checks parse inline JavaScript and the Worker, and test the additive SQLite migration.
- Regression checks cover VK launch-parameter extraction and subject-note button hooks.
- The owner has manually confirmed bidirectional sync, including subject notes, in both platforms. This is not a substitute for a full end-to-end test on a fresh account and a second device.
- Shared-sync fixes are merged into `main`. GitHub Pages deployment is automatic, but each published build should be verified in the actual Telegram/VK shells before announcing a release.

Canonical VK path:
`https://mitrofanovdaniil53-max.github.io/kgeu-telegram-miniapp/apps/vk/`

Do not change the VK Mini App launch URL or retire the old VK app until the canonical path has been opened successfully inside VK and rollback is confirmed.

## Safe rollout

1. Retain a production D1 export before changing the schema.
2. Apply the additive migration `backend/migrations/0002_account_linking.sql`.
3. Configure `VK_APP_SECRET` as a Cloudflare Worker secret from the VK Mini App settings (not a community bot token). Never commit or paste it into chat. Optionally set the non-secret `VK_APP_ID` Worker variable to pin the expected app ID.
4. Deploy the shared Worker and verify `/api/health`.
5. Publish both frontends and test with a real VK session, including cross-platform edits and conflict recovery.
6. Only after testing, switch the VK Mini App URL. Keep the old VK repository and bot Workers intact until rollback is verified.
