# KGEU Student Service — v22 two-way sync

This release aligns the repository with the deployed Cloudflare Worker v22.

## Changes
- Adds authenticated cloud pull through GET /api/sync.
- Keeps POST /api/sync upload and includes subject notes with service data.
- Sets the deployed Worker URL as the default endpoint.
- Adds separate “Отправить в облако” and “Получить из облака” actions.
- Creates local backups before restoring cloud data.
- Requires confirmation before replacing local data and blocks a push when the cloud copy is newer than the last known sync.
- Keeps compatibility with legacy v21 D1 rows.

## Verification
- The connected Cloudflare Worker source contains the v22 health response and GET /api/sync handler.
- The frontend release branch is based on the existing main source and patches only the sync endpoint, sync helpers, sync screen, and sync actions.
- After merge, verify /api/health returns version v22 and database true, then test push/pull in Telegram using two devices or browser profiles.
- A plain browser session without valid Telegram WebApp initData should fail authorization.
