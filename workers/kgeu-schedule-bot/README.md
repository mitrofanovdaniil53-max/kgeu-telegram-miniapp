# Telegram schedule bot Worker

Canonical source for Cloudflare Worker `kgeu-schedule-bot`: `workers/kgeu-schedule-bot/worker.js`.

## Runtime bindings

- KV namespace: `KGEU_SCHEDULE`
- Secret: `BOT_TOKEN`

## Cron triggers

Configure **both** triggers:

```text
*/5 * * * *
* * * * *
```

The Worker distinguishes them using `controller.cron`:
- Every 5 minutes: class reminders, schedule-change detection and daily timetable delivery at 07:00 Europe/Moscow.
- Every minute: personal one-off reminders created in the Mini App.

The currently inspected production Worker had no Cron Triggers configured. This PR does not deploy the Worker or change production schedules.

## Personal reminder API

Base URL: `https://kgeu-schedule-bot.2vkv544dmd.workers.dev`.

Every request includes the signed Telegram Mini App value in `X-Telegram-Init-Data`. The user must open the bot and send `/start` before the bot can send direct messages.

- `GET /api/reminders`: list the authenticated user's active reminders.
- `POST /api/reminders`: create `{ "title": "...", "date": "YYYY-MM-DD", "time": "HH:MM", "note": "optional" }`.
- `DELETE /api/reminders?id=<uuid>`: delete one reminder owned by the authenticated Telegram account.

Date and time are interpreted in `Europe/Moscow`. The Worker limits each account to 50 active reminders and rejects past or more-than-one-year-ahead dates. The bot sends the message at the event time.

## Bot notification settings

Separate toggles:
- Daily text timetable at 07:00 Moscow time.
- Class reminder 15 minutes before start.
- Schedule changes / replacements.

## Rollout checklist

1. Review PR and wait for CI.
2. Deploy `workers/kgeu-schedule-bot/worker.js` to the existing `kgeu-schedule-bot` Worker.
3. Preserve `BOT_TOKEN` and `KGEU_SCHEDULE` bindings.
4. Add both Cron Triggers above.
5. Test create/list/delete and delivery from a real Telegram account that has started the bot.
6. Separately verify daily timetable, class reminders and change notifications.

Never expose bot tokens, signed initData or user IDs in logs or repository files.
