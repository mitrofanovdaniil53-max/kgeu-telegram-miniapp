# AI Project Handoff — KGEU Student Platform (Telegram + VK)

**Last verified:** 2026-10-25 (refreshed after merging UX documentation PR #56; GitHub state checked on this date).  
**Purpose:** continue development in a new ChatGPT conversation without losing architecture, decisions, safety constraints, current work, or verification status.

## 1. Product and repositories

The project is a student platform for KGEU with two entry points: Telegram Mini App and VK Mini App. The timetable is the main product destination; Student Service provides tasks, deadlines, events, subject notes, hostel/points records, reports, reminders, analytics, synchronization and backup/recovery.

Primary repository / source of truth:
- https://github.com/mitrofanovdaniil53-max/kgeu-telegram-miniapp
- Default branch: `main`
- Telegram frontend: `index.html`
- VK frontend: `apps/vk/index.html`
- Shared Cloudflare Worker: `backend/worker.js`
- Original D1 schema: `backend/schema.sql`
- Additive account-linking migration: `backend/migrations/0002_account_linking.sql`
- UX documentation: `docs/ux-screen-inventory.md`, `docs/ux-target-design-proposal.md`, and the UX prototype files under `docs/` / `prototypes/`
- Automated tests are in `tests/`; GitHub Actions validates source syntax and regression behavior.

Legacy VK repository:
- https://github.com/mitrofanovdaniil53-max/kgeu-schedule-vk
- It is not the canonical implementation. Its redirect PR #6 was merged to route to the unified VK frontend while preserving launch query/hash parameters.
- Do not delete the repository or change the configured VK launch URL until real VK-shell launch and rollback are verified.

Canonical published frontends documented in the README:
- Telegram: https://mitrofanovdaniil53-max.github.io/kgeu-telegram-miniapp/
- VK: https://mitrofanovdaniil53-max.github.io/kgeu-telegram-miniapp/apps/vk/

## 2. Architecture and data boundaries

- Telegram and VK have separate platform entry points and platform-specific launch/authentication validation.
- After explicit account linking, compatible Student Service state is intended to be shared: tasks, deadlines, events, hostel/points records, reminders, subject notes, selected study group, and compatible display settings.
- Public timetable data continues to come from the KGEU schedule API.
- Telegram/VK identities, notification subscriptions, tokens and client-only caches remain platform-specific.
- The separate `kgeu-vk-bot` and `kgeu-schedule-bot` Workers must not be merged into the shared sync API.
- The owner has manually reported that group selection and bidirectional sync (including subject notes) work. Treat this as owner-reported confirmation, not independent proof of all edge cases.
- Passing CI verifies automated source/test checks only; it does not prove that the published pages work inside the Telegram or VK shells.

## 3. Non-negotiable safety constraints

1. **Do not deploy Worker changes, modify production D1 data, alter secrets, or change platform launch URLs as part of UX work without explicit authorization and a reviewed rollout.**
2. Do not remove existing capabilities/routes simply to simplify navigation. Prefer reorganization and presentation changes.
3. Do not run destructive import/restore, merge, conflict, or recovery scenarios against production data. Use disposable test accounts and test records.
4. Before a schema change, retain a production D1 export and use an additive migration where feasible.
5. Never commit, request in chat, or expose `VK_APP_SECRET`, bot tokens, or other secrets. Configure secrets only through Cloudflare's secret mechanism.
6. Do not implement subscription/payment/paywall UI until free/paid boundaries, renewal, cancellation/refund and post-expiry behavior are explicitly agreed.
7. Do not claim a test passed unless it was actually run. Label findings as source-derived, automated, owner-reported, or independently verified.
8. Keep Telegram and VK entry points intact. Preserve VK launch parameters and hash/query behavior during any redirect.
9. Avoid changing stable business logic without a reproducible defect and regression coverage.

## 4. UX direction already agreed

The timetable remains the primary destination. Student Service is a separate, compact workspace, with a task-first dashboard and an obvious route back to the timetable. Do not mix hostel/points records into the main study-task list.

Proposed information architecture:
1. **Расписание** — group, next lesson, Today / Tomorrow / Week / Month, refresh, loading/offline/error states.
2. **Мой сервис** — today’s agenda first, open tasks and nearest deadlines next, events and recent tasks lower in the hierarchy.
3. **Учёба** — search/filter tasks, deadlines and subject notes; subject details and create/edit flows.
4. **Календарь** — month grid and selected-day agenda with understandable markers.
5. **Общежитие / баллы** — standalone overview, ЖБС, ССО, history/report.
6. **Напоминания** and **Аналитика** — secondary destinations, discoverable but not competing with urgent work.
7. **Синхронизация и данные** — settings/advanced area for account linking, diagnostics, export, backup and recovery.

Design guidance in the existing proposal is an initial hypothesis, not a validated design system: 16 px mobile page gutter, 12 px card gap, 16 px card radius, minimum 44×44 px interactive targets, 16 px body text, secondary text at least 14 px, visible 2 px keyboard focus, reduced-motion support and system light/dark themes. Reuse existing variables where possible.

State copy must distinguish local persistence from cloud sync:
- “Сохранено на устройстве”
- “Синхронизация…”
- “Синхронизировано”
- “Нужна проверка синхронизации”

Any restore/replace/merge confirmation must explain which copy wins, what may be overwritten and whether a backup will be made before confirmation.

## 5. Current UX audit status

Main tracking issue:
- [Issue #30 — UX audit: map user journeys and redesign Telegram/VK Mini Apps](https://github.com/mitrofanovdaniil53-max/kgeu-telegram-miniapp/issues/30)

Existing audit artifacts:
- [Screen inventory](https://github.com/mitrofanovdaniil53-max/kgeu-telegram-miniapp/blob/main/docs/ux-screen-inventory.md)
- [Target UX proposal](https://github.com/mitrofanovdaniil53-max/kgeu-telegram-miniapp/blob/main/docs/ux-target-design-proposal.md)
- [Interactive prototype](https://github.com/mitrofanovdaniil53-max/kgeu-telegram-miniapp/blob/main/docs/ux-prototype.html) (verify exact current path before editing; another prototype also exists under `prototypes/`).

**Latest UX documentation state at handoff:**
- [PR #56 — docs: audit production UX against prototype](https://github.com/mitrofanovdaniil53-max/kgeu-telegram-miniapp/pull/56) — merged after successful workflow #258.
- It is documentation-only; it compares production navigation with the isolated prototype, records source-derived findings and guardrails, and explicitly does not claim live shell testing.
- PR comment reported GitHub Actions workflow run #258 passed the syntax job, including frontend/Worker syntax, D1 migration, shared-state merge/revision behavior, legacy-field retention and VK launch-signature checks.
- Cloudflare posted a successful deployment status for commit preview / branch preview. These are Worker previews, **not proof that the published Telegram/VK frontends work in the actual apps**.
- PR #56 was subsequently merged after workflow #258 passed. Its merge does not complete the real-platform usability audit.

UX audit is **not complete**. Required remaining work:
1. Perform the checklist inside real Telegram and VK clients, separately, and record pass/fail/blocked, device/platform, steps, elapsed time, errors, confusion and need for assistance.
2. Use test accounts to test invalid/expired linking code, offline/retry, conflicting edits, local/cloud recovery, and backup/restore semantics.
3. Only prioritize defects supported by observed/reproducible evidence.
4. Review the prototype on desktop and narrow mobile viewport; distinguish visual review from actual usability tests.
5. Do not close issue #30 until the required checks are recorded or explicitly descoped.

## 6. Manual acceptance checklist

Run independently in Telegram and VK. Use a test account for sync/recovery.

- [ ] Open app; inspect selected group; search a normal group name; select result; relaunch and verify persistence.
- [ ] Find today's next lesson; switch Today → Week → Today; refresh; observe loading/error feedback.
- [ ] Create a subject note and a task with a due date; verify subject association and persistence after relaunch.
- [ ] Create a deadline and event; verify expected dashboard/calendar placement.
- [ ] Open Hostel; change a goal; add a ЖБС work entry; add an ССО entry with evidence; inspect history; export Word report.
- [ ] Check reminder settings and permission-denied behavior without assuming push notifications are available.
- [ ] Link disposable Telegram/VK test accounts; verify notes/tasks and one other supported record type in both directions.
- [ ] With test data only, simulate offline/retry and conflicting edits; before merge/replace, verify clear copy-wins messaging and backup creation.
- [ ] Repeat key journeys at narrow mobile widths and in light/dark themes; check clipping, horizontal overflow, keyboard overlap and touch-target size.
- [ ] Verify launch/auth behavior inside both platform shells, not only in a desktop browser.

## 7. Recent merged work / regression context

Repository issue/PR history inspected on 2026-10-25:
- **PR #46**: compact Student Service dashboard and responsive refinements; unified ЖБС/ССО history and Word report; hostel numeric normalization; source screen inventory and target UX proposal; prototype tests. CI passed on merge.
- **PR #47–#48**: Word report preview/download flow and authenticated Telegram report delivery; image evidence included in reports.
- **PR #49**: compress evidence photos to improve report inclusion; previously saved filename-only records cannot regain missing image bytes and must be reattached.
- **PR #50 and #52**: keyboard focus containment and iframe keyboard regression test for Word report preview.
- **PR #51**: protect subject notes and Student Service records during JSON backup restore; requires a backup and explicit confirmation; aborts if backup cannot be written.
- **PR #53**: target UX architecture/specification.
- **PR #54** was superseded by #55.
- **PR #55**: isolated interactive UX prototype; demo data only, no Worker/API/real account sync.
- **PR #56**: merged UX gap analysis; workflow #258 passed. Merge commit `85967990a7185c07aad9158789612275ad3ff763`.
- **PR #57**: merged AI-readable handoff and manual-test template; documentation only.
- **PR #56**: merged documentation audit of production UX against prototype; CI workflow #258 passed. Merge commit: `85967990a7185c07aad9158789612275ad3ff763`. This is documentation-only and does not establish live Telegram/VK behavior.
- Legacy VK redirect PR #6 was merged in the legacy repository.

Do not assume that a closed PR means a feature has been manually verified in Telegram/VK. Read each PR's validation notes.

## 8. Known testing boundary and next action

No independent real-shell usability run is evidenced in the latest repository notes. The current blocker is not lack of another speculative redesign; it is that real Telegram/VK access and test-account workflows are required to verify platform behavior. If the assistant cannot operate those clients directly, prepare a compact execution sheet for the owner rather than inventing results.

Recommended next sequence:
1. Keep issue #30 open while real Telegram/VK shell and test-account sync/recovery checks remain unverified.
2. Review the isolated prototype for source-level defects and run repository tests where execution access is available.
3. Use the manual-test results template to collect evidence that cannot be collected remotely.
4. Fix only reproducible issues, add regression coverage, and verify the relevant shell before closing issue #30.

## 9. Evidence / source links

- Main README / architecture and safe rollout: https://github.com/mitrofanovdaniil53-max/kgeu-telegram-miniapp/blob/main/README.md
- UX audit issue #30: https://github.com/mitrofanovdaniil53-max/kgeu-telegram-miniapp/issues/30
- Latest PR #56: https://github.com/mitrofanovdaniil53-max/kgeu-telegram-miniapp/pull/56
- UX screen inventory: https://github.com/mitrofanovdaniil53-max/kgeu-telegram-miniapp/blob/main/docs/ux-screen-inventory.md
- UX proposal: https://github.com/mitrofanovdaniil53-max/kgeu-telegram-miniapp/blob/main/docs/ux-target-design-proposal.md
- Telegram frontend: https://github.com/mitrofanovdaniil53-max/kgeu-telegram-miniapp/blob/main/index.html
- VK frontend: https://github.com/mitrofanovdaniil53-max/kgeu-telegram-miniapp/blob/main/apps/vk/index.html
- Shared Worker: https://github.com/mitrofanovdaniil53-max/kgeu-telegram-miniapp/blob/main/backend/worker.js

**Continuation rule:** start from live GitHub state, not from this file alone. This document is a dated handoff, not a guarantee that PRs, deployments, code or platform behavior remain unchanged.
