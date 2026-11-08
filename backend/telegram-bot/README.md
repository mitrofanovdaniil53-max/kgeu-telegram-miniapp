# Telegram bot notifications

This file mirrors the currently configured Cloudflare Worker `kgeu-schedule-bot` and adds the Mini App personal-reminder API plus daily schedule delivery.

## Runtime bindings

- KV namespace binding: `KGEU_SCHEDULE`
- Secret: `BOT_TOKEN`
- Worker name: `kgeu-schedule-bot`

## Cron requirement

Configure the Worker Cron Trigger as:

```text
* * * * *
```

The one-minute cadence is required for personal reminders and the 07:00 Moscow daily schedule. The class reminder window is narrowed to one minute so it does not drift 15–19 minutes early under a one-minute cron.

**This repository change does not configure or deploy the production Cron Trigger.** The currently inspected production Worker had no Cron Trigger configured. Do not claim automated messages are live until the trigger and Worker deployment are verified.

## Personal reminder API

Base URL: `https://kgeu-schedule-bot.<account-subdomain>.workers.dev` (use the existing deployed Worker URL).

All requests require the signed Telegram Mini App `initData` in `X-Telegram-Init-Data`. The user must have opened the Telegram bot and sent `/start` at least once so the bot can message them.

- `GET /api/reminders` — list the authenticated user's reminders.
- `POST /api/reminders` — create a reminder with `{ "title": "...", "eventAt": 1790000000000, "leadMinutes": 15 }`.
- `POST /api/reminders` — delete with `{ "action": "delete", "id": "<uuid>" }`.

`eventAt` is a Unix timestamp in milliseconds. The Mini App interprets the selected local input as Moscow time (`Europe/Moscow`). Supported offsets are 0, 15, 60 and 1440 minutes. Reminders are stored under a per-Telegram-user KV prefix and are only listed/deleted within that authenticated user's namespace.

## Delivery behavior

- Personal reminders are checked every minute and delivered as messages from the Telegram bot.
- Daily timetable is sent at 07:00 Europe/Moscow, once per user per day.
- Existing class reminders run 15 minutes before a lesson; timetable snapshots detect changes for today and tomorrow and notify users who enabled change alerts.
- No browser Notification API permission is required for bot chat messages.

## Rollout checklist

1. Review the PR and automated checks.
2. Deploy the Worker source to `kgeu-schedule-bot` while preserving its existing `BOT_TOKEN` secret and `KGEU_SCHEDULE` KV binding.
3. Configure Cron Trigger `* * * * *`.
4. Confirm the deployed Worker version and schedule.
5. Test from a real Telegram account that has started the bot: create a test reminder a few minutes ahead, verify delivery, then delete any leftover test reminder.
6. Verify the 07:00 Moscow delivery and existing class/replacement notifications separately.

Do not expose bot tokens, signed initData or user IDs in logs or repository files.
