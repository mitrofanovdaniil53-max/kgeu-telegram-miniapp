# Telegram ↔ VK shared sync acceptance checklist

Run only after the additive D1 migration is backed up and applied, VK_APP_SECRET is configured as a Cloudflare Worker secret, and the Worker version with the shared API is deployed.

## Account linking

- [ ] Open Telegram Mini App as the account that owns the existing Student Service data.
- [ ] Open Мой сервис → Синхронизация and generate a link code.
- [ ] Open the VK Mini App from inside VK and enter the code in Настройки → Общий аккаунт Telegram ↔ VK.
- [ ] Confirm both providers appear in the account identity response for the linked account.
- [ ] Confirm the code cannot be reused, expires after 10 minutes, and more than 10 link attempts per identity per 10 minutes are rejected.
- [ ] Confirm an already-populated separate VK cloud account is not silently merged or overwritten.

## Bidirectional data

- [ ] Create a task in Telegram; verify it appears in VK without reloading the page.
- [ ] Add a task, change task completion, and delete a task in VK; verify Telegram receives the changes.
- [ ] Repeat for deadlines and events.
- [ ] Add a ЖБС work entry and a social/event entry in VK; verify totals and records in Telegram.
- [ ] Add a subject note in VK; verify it appears in Telegram. Edit it in Telegram and verify VK receives the new value.
- [ ] Change the active group and one display setting in each platform; verify the other platform applies them.
- [ ] Verify a backgrounded app refreshes after it becomes visible again.

## Conflict recovery and safety

- [ ] Make local Student Service changes on VK, then update the same cloud state from Telegram before VK syncs; verify VK pauses automatic overwrite and shows the conflict controls.
- [ ] Choose the cloud version; verify the prior local snapshot remains in local storage.
- [ ] Reproduce a conflict and choose the VK version; verify the prior cloud snapshot is retained locally and the selected VK state becomes the new cloud revision.
- [ ] Create conflicting note text on both platforms; verify the local alternative is saved in the conflict backup.
- [ ] Verify no request from an unrelated web origin receives an Access-Control-Allow-Origin header.
- [ ] Verify existing student_services rows and data remain intact after migration.
- [ ] Verify Telegram-only bot notification identifiers/preferences remain platform-specific.

## Rollback

- [ ] Keep the original student_services table during the first rollout.
- [ ] If a client or Worker test fails, revert the Worker deployment to the previous version; do not drop the new tables or rewrite existing rows during rollback.
- [ ] Do not merge the old-repository redirect until the new monorepo VK URL has been verified in a real VK launch session.
