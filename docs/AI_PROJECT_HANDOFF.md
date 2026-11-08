## Current repository snapshot — 2026-11-08

> **Verified repository state:** 2026-11-08, after PR #99.
>
> - **Repository:** https://github.com/mitrofanovdaniil53-max/kgeu-telegram-miniapp
> - **Current `main` HEAD:** `0544f062c854bba8b94dc1150a307b4f7c15c5f0` — `fix(vk): add timeouts to schedule and group directory requests (#99)`.
> - **Open pull requests:** none returned by the repository's `GET /pulls?state=open` endpoint at this check.
> - **PR #99:** merged. It adds the existing 12-second timeout/AbortController pattern to VK schedule and group-directory fetches; no Worker/API/D1/secrets/account-data/launch-URL changes were included. The regression test extracts and executes the real helper in both frontends, checks timeout rejection and abort of the stalled request, and checks a successful response.
> - **PR-head CI:** run [#416](https://github.com/mitrofanovdaniil53-max/kgeu-telegram-miniapp/actions/runs/42406806692) passed for PR head `539e91633924c41fddfa7c472f83cf6db94fcc69`.
> - **Post-merge CI:** run [#417](https://github.com/mitrofanovdaniil53-max/kgeu-telegram-miniapp/actions/runs/42406857939) passed on push for the current `main` SHA. The syntax job, migration tests, shared-state/revision tests, schedule proxy validation, legacy-field preservation, VK launch signature, sync-race/restore guards, and theme/group-label tests all passed.
> - **GitHub Pages:** build/deployment run [#101](https://github.com/mitrofanovdaniil53-max/kgeu-telegram-miniapp/actions/runs/42406857737) completed successfully for the same current `main` SHA. This is deployment-job evidence, not a browser or Mini App shell test.
> - **Cloudflare Worker control plane:** read-only inspection at 2026-11-08 recorded latest deployment `a75a2923-f322-436f-8ea9-5338c85648b0`, created 2026-11-07 19:34:31 UTC, routing 100% to Worker version `c71f91c5-a8e8-4270-873f-3ce0bc6c0ebc` (version 605). Its script ETag `d3e5c69687cea5b69c381c9563b012b512a7a8ac0ba14f78b2582c05fbc93778` matches versions 598 and 601; this indicates the Worker script bundle did not change across these uploads. D1 and the expected secret bindings were present; secret values were not read.
> - **Issue #30:** remains open. Published Telegram/VK shell acceptance, fresh/disposable-account linking and bidirectional sync, conflict/offline/recovery checks, and the expanded attachment/points cases remain unrecorded. Use the existing `docs/ux-manual-test-results-template.md` and `docs/SHARED_SYNC_ACCEPTANCE.md`; do not create duplicate checklists.
> - The published Pages URLs and Worker health endpoint were not accessible to the available web verifier in this check. This is a verifier limitation and does not establish service downtime.
>
> **Next sequence**
> 1. Complete manual acceptance in the actual Telegram and VK apps, separately, using disposable accounts and records.
> 2. Record device, app/WebView version, commit/deployment, viewport/theme, exact steps, observed result, errors and evidence in the existing manual template.
> 3. Complete the shared-sync/recovery and attachment-boundary checks in the existing checklist.
> 4. Keep issue #30 open until evidence is recorded or the owner explicitly descopes the remaining checks.
>
> **Evidence labels:** source reviewed ≠ automated test passed ≠ owner-reported ≠ manual shell verified.

---

## Current repository snapshot — 2026-11-07

> **Verified repository state:** 2026-11-07, after merging PR #97.
>
> - **Repository:** https://github.com/mitrofanovdaniil53-max/kgeu-telegram-miniapp
> - **main base for this documentation update:** fec92575aa231d41b73bc341dad6ce974e62f3d6.
> - **PR #83 — schedule proxy calendar-date validation:** merged. Merge commit 6cf7c59ecf4c799b061410a4c6c1464641dd5674.
> - **PR #84 — Student Service date/numeric validation:** merged. Merge commit d461d2f6989f136d5d3f3837d40f7d5f1f6c0056.
> - **PR #85 — transactional JSON/cloud restore safety:** merged. Merge commit 9fd0488c22b3adc96f24e8878604fcd8e63e56e6.
> - **PR #86 — VK light-theme contrast and group-label wrapping:** merged. Merge commit 690e99896d9b63363c11af27cc827e4ff4abece7.
> - **PR #88 — refreshed project handoff:** merged. Merge commit 3f40f3234c117cfa4411a36f58c6eb5deabd24ea.
> - **PR #89 — attachment payload-size guard:** merged. Merge commit c9793dd1822b748d3df0acbd13c424366c2fb4de. Both Telegram and VK measure the prospective complete shared-sync envelope before retaining new attachment content. If the envelope would exceed 850,000 bytes, the content is omitted and the filename is retained; the Worker limit is 900,000 bytes.
> - **PR #91 — integer normalization for hostel records:** merged. Merge commit fd263d7b162722365a92470fbcb0bda31620db13. ЖБС minutes/points and ССО points are normalized to non-negative integers in both frontends; zero and existing malformed-value fallback behavior are preserved.
> - **PR #93 — event/hostel points parity regression test:** merged. Adds a Node-backed test that executes the actual event prompt and normalizer in both frontends and verifies calendar-event points match the SSO ledger record after saving.
> - **PR #95 — manual acceptance coverage for attachments and points:** merged. Extends the existing manual template with fractional event-points parity, small attachment retention, and aggregate payload-over-850,000-byte filename-only fallback cases; extends the shared-sync checklist with cross-platform attachment transfer and oversized-envelope behavior. Merge commit 4b96d65dbb734adf7d7f25d9e5af20fd32fbd784.
> - **PR #96 — handoff refresh after #95:** merged. Records the new manual acceptance cases and PR #95 CI run #408. Merge commit 587753b8fc2bb54046e525064d270406e84dd0b9.
> - **PR #97 — final repository snapshot after #96:** merged. Merge commit fec92575aa231d41b73bc341dad6ce974e62f3d6.
> - [PR #72](https://github.com/mitrofanovdaniil53-max/kgeu-telegram-miniapp/pull/72) was closed as superseded by #86; its branch was 43 commits behind the then-current main. The institute fallback logic was already present in main.
> - [Issue #30](https://github.com/mitrofanovdaniil53-max/kgeu-telegram-miniapp/issues/30) remains open. Real Telegram/VK WebView acceptance and test-account sync/recovery checks remain outstanding.
> - The manual test record template is docs/ux-manual-test-results-template.md; the shared sync checklist is docs/SHARED_SYNC_ACCEPTANCE.md. Do not create duplicate checklists.
> - PR #95 documentation head `e1655b1342a48770ce54a64fe6a4e906feebb49f` passed GitHub Actions run [#408](https://github.com/mitrofanovdaniil53-max/kgeu-telegram-miniapp/actions/runs/42396482646). This validates repository automation only; the added acceptance cases remain unrun until actual Telegram/VK shell checks are recorded.
> - PR #89 head `0bcb15fa6c06e7b8fed2dc639bca2938fe507381` passed GitHub Actions run [#394](https://github.com/mitrofanovdaniil53-max/kgeu-telegram-miniapp/actions/runs/42392399338). PR #90 documentation head passed run #396. PR #91 head `a58f7792522a1185198285608ec651d6a3989535` passed run [#398](https://github.com/mitrofanovdaniil53-max/kgeu-telegram-miniapp/actions/runs/42392661244). PR #92 documentation head passed run #400. PR #93 head `e169e9db14340d886eed4932531f3025651ea6ba` passed run [#403](https://github.com/mitrofanovdaniil53-max/kgeu-telegram-miniapp/actions/runs/42392898416). These PR-head runs parsed both frontends and Worker and passed the full regression suite, D1 migration tests, shared-state merge/revision, schedule proxy validation, legacy preservation, VK launch auth, sync race/restore and theme/group-label tests. These are PR-head CI results, not live shell tests.
> - **Post-merge CI:** GitHub Actions run [#413](https://github.com/mitrofanovdaniil53-max/kgeu-telegram-miniapp/actions/runs/42396699227) completed successfully for main commit fec92575aa231d41b73bc341dad6ce974e62f3d6 (push event). The syntax parse, additive migration and listed regression tests all passed.
> - GitHub Pages build/deployment run [#99](https://github.com/mitrofanovdaniil53-max/kgeu-telegram-miniapp/actions/runs/42396698486) completed successfully for main commit fec92575aa231d41b73bc341dad6ce974e62f3d6 at 2026-11-07 17:31:06 UTC. This is a successful Pages deployment job, not a browser-level or Telegram/VK shell test.
> - Read-only Cloudflare control-plane inspection at 2026-11-07 17:32:04 UTC recorded deployment 05160b5c-9ea6-4584-91ca-5d43abdaffce, with Worker version fb14ea22-46e8-4d1a-b0d0-c2771a0d9554 (version number 598) receiving 100% of traffic. Its script ETag matches versions 567 and 589; this indicates the deployed script bundle is unchanged from the earlier deployment, not a new backend-code change. D1, TELEGRAM_BOT_TOKEN and VK_APP_SECRET bindings were present; secret values were not read.
> - The public GitHub Pages URLs and Worker /api/health URL remained inaccessible to the available web verifier during this session. This is a verifier limitation and does not establish that the services are down.
> - PRs #83–#86, #88, #89, #91, #93, #95, #96 and #97 are merged. These changes did not modify production D1 data or secrets. Worker deployment is separate from frontend GitHub Pages publication.
>
> **Next sequence**
> 1. Complete real Telegram and VK Mini App WebView acceptance using disposable accounts/data. Record results in docs/ux-manual-test-results-template.md.
> 2. Verify cross-platform linking/sync, offline retry, conflicts, backup/restore and rollback using docs/SHARED_SYNC_ACCEPTANCE.md.
> 3. Verify the attachment boundary in both shells: small attachment retained and synced; aggregate payload over 850,000 bytes omits new content but preserves filename and displays the combined warning.
> 4. Verify fractional imported/legacy values are floored consistently in both clients, and confirm the event prompt's calendar and SSO records show the same integer points.
> 5. Verify public Pages and Worker endpoints from a normal network. Do not infer publication from PR merge or preview upload.
> 6. Fix only reproducible issues. Keep issue #30 open until evidence is recorded or remaining checks are explicitly descoped.
>
> **Evidence labels:** source reviewed ≠ automated test passed ≠ owner-reported ≠ manual shell verified.

---

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
- **PR #58**: merged Liquid Glass visual restoration for Telegram and VK frontends; CSS-only changes plus a source-level regression test. Merge commit `5a12f088cb6813bbc13d4c4012daa3bc5a03c07c`; post-merge workflow #267 passed. This does not by itself verify appearance inside live Telegram/VK shells or establish deployment status.
- **PR #56**: merged documentation audit of production UX against prototype; CI workflow #258 passed. Merge commit: `85967990a7185c07aad9158789612275ad3ff763`. This is documentation-only and does not establish live Telegram/VK behavior.
- Legacy VK redirect PR #6 was merged in the legacy repository.

Do not assume that a closed PR means a feature has been manually verified in Telegram/VK. Read each PR's validation notes.

## 8. Known testing boundary and next action

The owner reported on 2026-11-04 that the platform works. Treat this as owner-reported confirmation, not independently reproduced shell evidence. The Liquid Glass restoration is merged in PR #58 and the post-merge validation workflow passed; deployment and final visual appearance in live Telegram/VK clients are not confirmed by CI. If shell access is unavailable, record owner-side checks rather than inventing results.

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
