# Screen inventory — Telegram and VK Mini Apps

Status: source-based inventory of branch `ux/home-dashboard-design-system`, reviewed 2026-10-25. This is not a screenshot audit or usability-test result. Labels and routes below are inferred from frontend source; visibility, platform-shell behavior, and functional success still require live verification.

## Entry points and primary navigation

| Surface | Telegram | VK | Validation status |
|---|---|---|---|
| Timetable home | `index.html` | `apps/vk/index.html` | Source inspected; live shell not tested for this branch |
| Schedule modes | Today, Tomorrow, Week, Month, Teachers | Same labels/modes | Confirm mode changes, selected-state clarity, loading/error states |
| Main service | “Мой сервис” tab | “Мой сервис” tab | Confirm dashboard order, touch targets and scroll behavior |
| Settings | Group/appearance/schedule/service/data sections | Same core sections plus shared-account controls | Confirm modal opening/closing, focus, scroll and save feedback |
| Group selection | Search directory, recent groups, manual ID in advanced fallback | Same general flow | Regression check only; owner reported group selection works |
| Share / refresh | Header actions | Header actions | Confirm platform behavior and feedback |

## Student Service screens

| Screen / destination | Main content and actions | Main UX/data risk | Test priority |
|---|---|---|---|
| Service dashboard | Next lesson, task/deadline summary, “Сегодня” agenda, upcoming deadlines/events, recent tasks; quick actions for task, deadline and event | User must identify the next useful action; dashboard hierarchy and scroll order | P1 |
| Study centre | Search and filters across tasks, deadlines and subjects; subject notes; add task/deadline/note | Search/empty states, association with subject, save confirmation | P1 |
| Subject detail | Note, tasks, deadlines, upcoming lessons for a subject | Correct subject association and persistence | P1 |
| Add/edit task, deadline, event | Form fields and save/cancel actions | Validation, date handling, accidental duplicate or lost edits | P1 |
| Calendar | Month navigation, selectable days, agenda for selected date; lesson/task/deadline/event markers | Legend comprehension, small-screen tap targets, empty days | P1 |
| Reminders | Enable/disable, notification permission request, upcoming seven-day list | Copy states that reminders are local and work while service is open; permission denied | P2 |
| Analytics | Overall progress, subject workload, recent four-week trend, suggestions | Explain what data is included; avoid implying completeness when data is sparse | P2 |
| Hostel / points module — Overview | Goals, progress summary, save goals | Blank/malformed goal inputs and correct fallback behavior | P1 |
| Hostel / points module — ЖБС | Work-minute entries; conversion to points | Numeric validation, zero/negative/blank values, history correctness | P1 |
| Hostel / points module — ССО | Social-point entries with date, points and evidence | Required fields, evidence retention and sync | P1 |
| Hostel / points module — History/report | Unified history, category-specific actions, Word export | Chronology, undated legacy entries, report order and category labels | P1 |
| Sync / account linking | Sync status, one-time Telegram↔VK linking, diagnostics and recovery controls | Confusing local-vs-cloud status; conflict resolution and overwrites | P0 |
| Data / backup | Local-data summary, JSON export/import/recovery, schema compatibility | Data loss from wrong recovery choice; backup availability and consequences | P0 |

## Platform-specific notes from source inspection

- Telegram exposes service destinations from settings and the service tab. Its service navigation includes sync and data/backup entry points.
- VK exposes the same core Student Service functions and additional subject-note navigation. Its sync view also exposes Worker/API diagnostics and manual package controls.
- Shared information architecture should not erase platform-specific launch/authentication behavior. Telegram and VK must continue using their own entry points.
- Existing account linking and shared-state behavior must remain intact during visual changes. Do not test destructive recovery actions with production data.

## Manual acceptance run

Run separately in Telegram and VK. Use a test account and test records for sync/recovery. Record **Pass / Fail / Blocked**, device/platform, taps, elapsed time, exact error text, and whether assistance was needed.

1. Open the app and identify the selected group; search for a normal group name, select a result, and reopen the app.
2. Find today's next lesson, switch to Week, then return to Today; refresh and observe loading/error feedback.
3. Create a subject note, then create and complete a task with a due date. Verify the subject association and persistence after relaunch.
4. Create a deadline and event; confirm they appear in the expected dashboard/calendar locations.
5. Open Hostel: change a goal, add a ЖБС work entry, add an ССО entry with evidence, inspect history, and export a Word report.
6. Check reminder settings and notification permission behavior without assuming push notifications are available.
7. Link test accounts across Telegram and VK; verify notes/tasks and at least one other supported data type in both directions.
8. With test data only, exercise offline/retry and a conflicting edit. Before any replace/merge operation, verify the confirmation explains which copy wins and that a backup is created.
9. Repeat key journeys on a narrow mobile viewport and in light/dark themes; verify no clipped text, horizontal overflow, or undersized controls.

## Exit criteria

- Do not mark the UX audit complete from source review or CI alone.
- Close a defect only after reproducible evidence, a fix, automated regression coverage where feasible, and verification in the relevant platform shell.
- Keep source-derived observations and owner-reported confirmations distinct from independently observed usability findings.
- Do not introduce subscription/paywall UI until free/paid boundaries, renewal, cancellation/refund, and expiry behavior are agreed.
