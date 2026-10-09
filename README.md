# KGEU Student Platform — Telegram + VK

This repository is the canonical source for the KGEU student platform. The frontends remain separate entry points because Telegram Mini Apps and VK Mini Apps have different launch/authentication APIs; they share one account model, Worker API, and D1-backed state.

## Repository layout

- `index.html` — Telegram Mini App frontend and Student Service.
- `apps/vk/index.html` — VK Mini App frontend, timetable, and Student Service.
- `backend/worker.js` — shared Cloudflare Worker API.
- `backend/schema.sql` — original D1 schema; keep it unchanged for legacy compatibility.
- `backend/migrations/0002_account_linking.sql` — additive migration for shared accounts, identities, cloud state, link codes, and attempt rate limiting.
- `backend/wrangler.toml` — Worker/D1 configuration.
- `docs/UNIFIED_TELEGRAM_VK_ARCHITECTURE.md` — account and sync design.
- `docs/MONOREPO_MIGRATION.md` — deployment and migration steps.
- `docs/SHARED_SYNC_ACCEPTANCE.md` — end-to-end acceptance checklist.

## What is shared

After the user explicitly links their Telegram and VK accounts, the shared account carries:

- Student Service data: tasks, deadlines, events, hostel points, reminders, and related records.
- Subject notes.
- Active study group and supported display settings.
- A versioned state snapshot with conflict safeguards.

Telegram bot identity and Telegram-specific notification settings remain platform-specific. VK launch parameters are verified server-side; never trust a user ID supplied by local storage or a client payload.

## Important safety properties

- Link codes are random, stored hashed, expire after 10 minutes, and link attempts are rate-limited.
- The original `student_services` table remains in place during rollout and rollback.
- The Worker preserves legacy Telegram rows and keeps the old API-compatible data path.
- VK does not push an empty default state before Telegram has bootstrapped cloud data.
- If both sides have changed shared service data, automatic overwrite stops and the UI offers explicit local/cloud recovery actions with backups.
- CORS is restricted to the shared GitHub Pages origin.

## Current integration status

The unified code is staged for review, but it is **not live yet**. No production D1 migration has been applied, the shared Worker API has not been deployed, and the VK app launch URL has not been switched to the new path.

## Safe rollout order

1. Review the unified integration PR and run the static checks.
2. Back up the production D1 database.
3. Apply `backend/migrations/0002_account_linking.sql` once; it is designed to preserve existing `student_services` rows and is idempotent.
4. Configure `VK_APP_SECRET` as a Cloudflare Worker secret using the VK Mini App application secret, not the community bot token. Never commit or send this secret in a message.
5. Deploy the Worker and verify `/api/health`.
6. Publish both frontends from this repository.
7. Test with a test account first: link Telegram→VK, sync notes and group/settings in both directions, edit Student Service data from both apps, and verify conflict recovery and offline/reopen behavior.
8. Only after the new VK path is verified in a real VK Mini App session should the old repository redirect be merged.

Do not claim live cross-platform sync until the Worker, migration, both frontends, and real VK launch-signature verification have been tested end to end.
