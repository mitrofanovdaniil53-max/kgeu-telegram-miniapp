# KGEU Student Platform — Telegram + VK

This repository is being prepared as the single source of truth for the KGEU student platform. The two frontends remain separate entry points because Telegram Mini Apps and VK Mini Apps have different launch/authentication APIs.

## Repository layout

- `index.html` — Telegram Mini App frontend, including the existing Student Service.
- `vk/index.html` — VK Mini App frontend.
- `backend/worker.js` — shared Cloudflare Worker API.
- `backend/schema.sql` — original D1 schema; keep it unchanged for legacy compatibility.
- `backend/migrations/0002_account_linking.sql` — additive migration for shared accounts and Telegram↔VK linking.
- `backend/wrangler.toml` — Worker/D1 configuration.

## What is shared

After a user explicitly links the two platform accounts, the shared Worker account is intended to carry:
- Student Service data (tasks, deadlines, events, dormitory points and reminders).
- Subject notes.
- Selected study group and supported display settings.

The existing Telegram bot identity and Telegram-specific launch/authentication remain Telegram-only. VK launch data is verified server-side; do not trust a user ID supplied by local storage or a client payload.

## Current integration status

The integration branch contains the server API, Telegram one-time-code UI and VK client-side linking/sync logic. The VK frontend now includes a Student Service entry point and the task, deadline, event, hostel-points, study, calendar, analytics, reminders, backup and sync screens copied from the Telegram implementation. The two entry points remain separate because their platform launch/authentication differs; the Student Service model is kept compatible through the shared data envelope.

The Worker changes are not safe to deploy until the additive D1 migration has been backed up and applied, and the Cloudflare Worker secret `VK_APP_SECRET` has been configured. Never put that secret in this repository or in a message.

## Safe rollout order

1. Review the unified integration PR and run static checks.
2. Back up the production D1 database.
3. Apply `backend/migrations/0002_account_linking.sql` once; it is designed to preserve `student_services` rows and is idempotent.
4. Set `VK_APP_SECRET` as a Cloudflare Worker secret (use the secret from the VK application settings).
5. Deploy the Worker code and verify `/api/health`.
6. Publish the Telegram frontend and the VK frontend from this repository's two entry points.
7. Test with a non-production/test account first: link Telegram→VK, sync a note and group setting in each direction, verify Student Service data, then test offline/reopen behavior and local conflict backups.
8. Only after successful tests, switch the live VK mini-app hosting source to this repository. Keep the old VK repository untouched until the new source is confirmed live.

## Data safety rules

- Never automatically merge a non-empty VK account into an existing Telegram account. The link endpoint refuses a target account that already has cloud state.
- One-time link codes expire after 10 minutes and are stored hashed in D1.
- Keep the original `student_services` table during rollout and rollback planning.
- Do not claim live cross-platform sync until the Worker, database migration, both frontends and real VK launch-signature verification have been tested end to end.
