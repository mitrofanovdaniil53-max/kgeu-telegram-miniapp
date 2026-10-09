# Unified KGEU Student Platform repository

## Current layout

- `/index.html` — Telegram Mini App frontend and Student Service.
- `/apps/vk/index.html` — VK Mini App timetable frontend.
- `/backend/worker.js` — shared Cloudflare Worker API (the shared-account API is proposed in PR #5).
- `/backend/schema.sql` — existing D1 schema.
- `/backend/migrations/0002_account_linking.sql` — additive draft migration for canonical accounts and linked platform identities.

## Why this is a monorepo

The Telegram and VK frontends remain platform-specific because each platform has its own launch/authentication mechanism and UI. They share one account model, one Worker API, and one D1-backed state. This avoids trying to make Telegram's launch data work as VK authentication or vice versa.

## Public paths

When GitHub Pages serves the repository root, the intended frontend paths are:

- Telegram: `https://mitrofanovdaniil53-max.github.io/kgeu-telegram-miniapp/`
- VK: `https://mitrofanovdaniil53-max.github.io/kgeu-telegram-miniapp/apps/vk/`

The VK Mini App's configured launch URL is external platform configuration and is not changed by this repository commit. Before switching it, test the new path in a real VK launch session. A redirect from the old repository can be added as a compatibility step if required.

## Data and migration safety

- Keep the existing `student_services` table and rows during the first migration.
- Use a one-time, short-lived link code to link the authenticated VK identity to the authenticated Telegram account.
- Keep platform bot identifiers and notification settings separate from shared user data.
- Do not deploy the new Worker before the additive D1 migration is backed up and applied.
- The VK app secret must be stored as the Cloudflare Worker secret `VK_APP_SECRET`; it must never be committed to source control.
- Treat profile/notes conflict recovery and the first cross-platform login as explicit acceptance tests.

## Status

This is a migration staging document. It does not change the active GitHub Pages URL, the VK application configuration, Cloudflare deployment, D1 production data, or any secret.
