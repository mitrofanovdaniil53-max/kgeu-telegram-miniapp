# Unified KGEU Student Platform repository

## Current layout

- `/index.html` — Telegram Mini App frontend and full Student Service.
- `/apps/vk/index.html` — VK Mini App frontend, including the Student Service tab.
- `/backend/worker.js` — shared Cloudflare Worker API, staged in PR #10.
- `/backend/schema.sql` — original D1 schema.
- `/backend/migrations/0002_account_linking.sql` — additive migration for canonical accounts and linked platform identities.
- `/tests/test_account_linking_migration.py` — local/CI migration test.

## Public paths

When GitHub Pages serves this repository root:

- Telegram: `https://mitrofanovdaniil53-max.github.io/kgeu-telegram-miniapp/`
- VK: `https://mitrofanovdaniil53-max.github.io/kgeu-telegram-miniapp/apps/vk/`

The VK Mini App launch URL is external platform configuration. Do not change it until the new path has been published and verified in a real VK launch session. Keep the old VK repository as a rollback source until the new URL passes end-to-end tests.

## Data and migration safety

- Keep the existing `student_services` table and rows during the first migration.
- Link the authenticated VK identity to the authenticated Telegram account using a short-lived one-time code.
- Keep platform bot identifiers and notification settings separate from shared user data.
- Back up D1 before applying the additive migration.
- Store the VK application secret only as the Cloudflare Worker secret `VK_APP_SECRET`.
- Test conflict recovery and all four phone/desktop cross-platform directions.

## Production activation checklist

1. Export and retain the current D1 database.
2. Apply the migration after verifying the backup:
   `npx wrangler d1 execute kgeu-student-db --remote --file=backend/migrations/0002_account_linking.sql --config backend/wrangler.toml`
3. Obtain the VK Mini App application secret from VK Developers (not the community bot token).
4. In Cloudflare Dashboard, open **Workers & Pages → kgeu-telegram-miniapp → Settings → Variables and Secrets**, add a **Secret** named `VK_APP_SECRET`, and paste the secret there. Never send the value in chat or commit it.
5. Deploy only after migration and secret setup:
   `npx wrangler deploy --config backend/wrangler.toml`
6. Test health, existing Telegram sync, account linking, VK sync, notes, group/settings, Student Service, conflict handling and rollback.
7. Only then switch the VK Mini App URL to the canonical `/apps/vk/` path.

## Status

The implementation is staged for review and has not changed the production Worker, D1 schema or VK Mini App URL.
