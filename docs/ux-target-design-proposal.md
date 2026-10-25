# Student Service — target UX proposal

Status: proposed design direction for review; not yet validated with users and not applied to production frontends. Companion static prototype: `prototypes/student-service-dashboard.html`.

## Decision summary

Keep the timetable as the product's primary destination. Treat Student Service as a separate, compact workspace with a task-first dashboard and a persistent, predictable way back to the timetable. Do not combine unrelated hostel/points records with study tasks in the same primary list. Preserve all existing capabilities; reorganize access, do not remove features.

## Proposed information architecture

1. **Расписание** — primary app entry point, selected group, next lesson, Today / Tomorrow / Week / Month, refresh and clear loading/offline states.
2. **Мой сервис** — a dashboard with:
   - greeting/date and a single primary action;
   - an agenda for today;
   - open tasks and nearest deadlines;
   - upcoming events;
   - recent tasks as a lower-priority section.
3. **Учёба** — search and filter across tasks, deadlines and subject notes; subject detail and create/edit flows.
4. **Календарь** — month grid, selected-day agenda and clear event/lesson/task markers.
5. **Общежитие / баллы** — standalone module with overview, ЖБС, ССО and history/report tabs.
6. **Напоминания** and **Аналитика** — secondary destinations; avoid putting analytics ahead of actionable work on the home screen.
7. **Синхронизация и данные** — settings/advanced area, separated from ordinary actions. Preserve account linking, diagnostics, export, backup and recovery.

This is a proposed grouping, not permission to remove any current route or change Telegram/VK launch behavior.

## Dashboard hierarchy

1. **Primary:** what is next today and the most important immediate action.
2. **Secondary:** open tasks and the nearest deadline, with due dates and completion status.
3. **Tertiary:** upcoming events and recent tasks.
4. **Separate workspace:** hostel/points tracking; show a compact entry point and summary, not the entire module on the dashboard.

Avoid multiple competing hero cards, redundant week summaries, and duplicate shortcuts to the same action. Keep status labels close to the item they describe.

## Interaction and status rules

- A save confirmation must describe local persistence honestly; show cloud synchronization as a separate state.
- Use consistent status vocabulary: **Сохранено на устройстве**, **Синхронизация…**, **Синхронизировано**, **Нужна проверка синхронизации**.
- Empty states should say what is empty and offer one relevant action; do not show dead ends.
- Validation errors belong next to the field and must preserve the user's other form values.
- Dates must be explicit; undated legacy records should not appear newer than dated records.
- Any merge/replace/recovery action must state which copy is retained, what may be overwritten, and whether a backup will be created before confirmation.
- Keep analytics and reminders discoverable without letting them compete with today's schedule/tasks.
- Respect reduced-motion settings and system light/dark theme; avoid communicating state through color alone.

## Shared visual tokens — initial proposal

| Token | Proposed value | Intent |
|---|---|---|
| Page gutter | 16 px mobile; 24 px wide layouts | Consistent content edge |
| Card gap | 12 px | Separate sections without excessive scrolling |
| Card radius | 16 px | Consistent surface language |
| Interactive minimum | 44 × 44 px | Comfortable touch interaction |
| Main text | 16 px | Readable default body copy |
| Secondary text | 14 px or larger | Keep metadata legible |
| Section heading | 18 px, semibold | Clear hierarchy |
| Focus indicator | visible 2 px outline | Keyboard/assistive navigation |
| Motion | short and optional | Respect reduced-motion preference |

These are starting values for validation, not a final brand system. Reuse existing theme variables where they already work rather than introducing duplicate tokens.

## Telegram and VK parity

- Maintain two explicit platform entry points and each platform's own launch/authentication validation.
- Share the same content hierarchy, labels, field validation and data-safety copy wherever feasible.
- Test safe-area insets, viewport height, keyboard overlap, scrolling, back/close behavior, and theme detection separately in Telegram and VK.
- Never assume that a browser preview proves the platform-shell integration works.

## Prototype scope and limitations

The companion HTML prototype is an isolated, local interaction mock-up. It uses illustrative sample records, does not connect to the Worker/KV or sync accounts, and must not be used to edit real student data. It demonstrates the dashboard hierarchy and primary navigation only. It is not an implementation of all screens and is not evidence of usability validation.

## Validation plan

1. Review the prototype in a desktop browser and a narrow mobile viewport.
2. In separate Telegram and VK test accounts, compare the proposed hierarchy with actual user tasks.
3. Observe at least: find next lesson; create a task; find a deadline; add a subject note; open hostel history; check sync status.
4. For each task, record success/failure, elapsed time, taps, confusion, and any visible error.
5. Test invalid/expired link code, offline retry, conflict merge, and local/cloud recovery with disposable test records only.
6. Change the design only for reproduced problems; rerun existing regression suites after implementation.

## Acceptance gate

Do not close issue #30 until platform-shell tests are recorded, high-risk sync/recovery scenarios are checked or explicitly descoped by the owner, and the prototype has been reviewed. Do not merge this proposal automatically into production.
