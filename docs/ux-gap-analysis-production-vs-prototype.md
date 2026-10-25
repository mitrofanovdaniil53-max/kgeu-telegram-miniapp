# UX gap analysis: production frontends vs. isolated prototype

**Scope:** static source review of `index.html`, `apps/vk/index.html`, `docs/ux-prototype.html`, and existing regression tests on `main`.
**Limit:** this is not a live browser, Telegram-shell, or VK-shell test. No claim is made that responsive behavior or platform SDK interactions were manually verified.

## Executive summary

The production Telegram and VK entry points are structurally parallel and retain their own launch/authentication integration. The UX prototype is useful for discussing information architecture and interaction patterns, but it is **not a drop-in representation of the current production UI**. Treating it as a pixel-perfect specification would cause scope drift.

## Confirmed from source

### 1. Navigation models differ

- Production frontends expose a top-level schedule tab strip: `Мой сервис`, `Сегодня`, `Завтра`, `Неделя`, `Месяц`, `Преподаватели`.
- The prototype instead uses a four-item sidebar navigation: `Расписание`, `Задачи`, `Сервис студента`, `Настройки`.
- In production, tasks, deadlines, calendar/events, reminders, subject notes, and hostel records are features within Student Service; the prototype promotes tasks to a top-level destination.
- Decision needed before implementation: preserve the existing schedule-first navigation and simplify the Student Service internals, or explicitly approve a broader information-architecture change. Recommendation: preserve the production top-level schedule modes for the first implementation pass; do not promote Tasks to a new top-level tab without usage evidence.

### 2. Prototype data is intentionally non-production

- The prototype labels its task/record/restore interactions as demo behavior; its JavaScript uses in-memory demo data.
- It does not call the Worker, Telegram WebApp SDK, or VK Mini App SDK.
- It cannot validate actual cloud sync, account linking, backup/restore, or production persistence.
- Therefore its interaction states can guide copy, hierarchy, and confirmation design, but production data operations must remain implemented by existing application functions.

### 3. Production settings already expose the key destinations

Both frontends contain settings navigation for:
- **Синхронизация** — cloud copy and Telegram ↔ VK account connection.
- **Данные и резервная копия** — export and restore.

The settings UI also includes appearance controls (theme and density). These existing destinations should be reused rather than creating a second settings implementation.

### 4. Student Service structure already has several agreed UX changes

The regression tests assert in both frontends that:
- the dashboard avoids a direct Analytics action while the analytics implementation remains available;
- the hostel module is a standalone destination;
- hostel views include overview, ЖБС, ССО, and history;
- hostel records support delete actions and Word export;
- settings provide sync and data/backup navigation;
- hostel history/report rows are date-sorted.

These are useful guardrails. New UX changes should extend these tests rather than replace them with prototype-only checks.

### 5. Telegram and VK parity is a maintenance constraint

The two production HTML files are separate and large (approximately 4,753 and 5,749 lines at review time). Similar markup and behavior exist in both, but their platform integrations and some sync handling differ. Any shared UX change should be implemented deliberately in both frontends and tested for parity without copying platform-specific authentication code across them.

## Recommended implementation order

### P0 — Establish a safe baseline
1. Run the repository's full automated test suite on the current `main` commit and record the exact commit SHA and result.
2. Confirm the GitHub Pages deployment for that same commit.
3. Open the production URL in a normal browser at narrow and wide viewport widths; separately verify Telegram and VK shells when available. Record platform-shell checks as pending until actually performed.
4. Capture a short checklist for schedule navigation, Student Service entry/exit, settings → sync/data, hostel tabs, and report preview.

### P1 — Low-risk production UX improvements
1. Align terminology and helper text between Telegram and VK.
2. Check keyboard focus, visible focus indicators, Escape handling, dialog focus restoration, and minimum touch-target sizes for the production settings and report dialogs.
3. Verify that active navigation state is exposed to assistive technology consistently.
4. Improve empty/error/loading states without changing storage schemas or Worker contracts.
5. Add regression assertions for each confirmed production fix in both frontends.

### P2 — Controlled structural changes
1. Use the prototype to review proposed screen hierarchy with the owner.
2. Make one navigation or layout change per pull request.
3. Keep the existing production functions and data flows; avoid replacing the production interface wholesale with the prototype.
4. For changes touching task/record CRUD, account linking, sync conflicts, or restore, add tests for both frontends and data-preservation behavior.

## Acceptance checklist for the next implementation PR

- [ ] Telegram and VK have equivalent user-facing labels and destinations.
- [ ] Schedule modes (today, tomorrow, week, month, teachers) still work.
- [ ] Student Service can be entered and exited without losing the selected schedule context unexpectedly.
- [ ] Settings → Sync and Settings → Data/Backup open the existing production views.
- [ ] Hostel overview, ЖБС, ССО, and history remain reachable; CRUD and date ordering are preserved.
- [ ] Analytics remains implemented but does not reappear as a dashboard shortcut unless explicitly requested.
- [ ] Keyboard dialogs remain usable with Tab, Shift+Tab, Escape, and focus restoration.
- [ ] No Worker endpoint, account-linking contract, storage key, or sync payload changes are introduced as part of a presentation-only task.
- [ ] Automated tests pass on the exact PR head.
- [ ] Deployment is verified independently; successful CI alone is not proof that the deployed Telegram/VK shell works.

## Open items / not verified

- Current Pages deployment status for the latest `main` commit was not returned by the available commit-status query.
- Real Telegram and VK shell testing was not performed during this source review.
- Fresh-account / second-device end-to-end sync remains a separate verification item.
- No evidence was collected here about actual user analytics, so navigation priority recommendations are conservative rather than usage-data-driven.
