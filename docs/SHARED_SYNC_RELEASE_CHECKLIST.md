# Shared Telegram ↔ VK sync: release verification

This checklist is deliberately separate from production deployment. Passing CI is not proof that signed Telegram/VK sessions have completed a real cross-platform sync.

## Automated checks

- [ ] GitHub Actions syntax checks pass for both HTML frontends and the Worker.
- [ ] SQLite migration tests pass against an isolated in-memory database.
- [ ] Account-linking schema guardrails pass.
- [ ] No production D1 writes are performed by the test suite.

## Manual end-to-end acceptance

Use the same human-controlled Telegram and VK accounts throughout. Do not paste init data, signed launch parameters, bot tokens, app secrets, or one-time linking codes into issues or logs.

1. Open the Telegram Mini App and wait until its cloud sync status reports success.
2. Create a fresh one-time VK linking code in Telegram.
3. Open the VK Mini App through the official VK app launch flow and submit the code.
4. Confirm both providers are listed for the same account using the in-app account status.
5. Add a uniquely named task in Telegram; refresh/reopen VK and confirm it appears exactly once.
6. Add a uniquely named note in VK; refresh/reopen Telegram and confirm it appears exactly once.
7. Change the selected group/profile setting in one platform and verify it propagates to the other.
8. Simulate offline editing on one platform, restore connectivity, and verify that unsynced local changes are retained.
9. If both platforms have distinct pre-existing Student Service data, confirm the app pauses and offers an explicit conflict choice instead of silently replacing either copy.
10. Try an expired or already-used linking code; it must be rejected.
11. Reopen both apps and confirm the linked account and synced data persist.
12. Verify that the older Telegram schedule/bot flow still opens the intended production Mini App.

## Release gate

Do not switch the official VK launch URL or merge changes that affect production sync until:
- all automated checks pass;
- the real VK signed-launch authentication works from the official VK Mini App context;
- both-direction data checks pass;
- conflicting pre-existing data remains recoverable;
- a known-good commit and rollback route are recorded.

## Known coverage boundary

The automated migration/schema tests use isolated SQLite and cannot validate VK signatures, Telegram init-data authentication, browser storage, Worker deployment configuration, or the live end-to-end flow. Those require integration tests or the manual acceptance steps above.
