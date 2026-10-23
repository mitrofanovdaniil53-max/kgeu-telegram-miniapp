# UX/UI audit — current state and target journey

Related tracking issue: #30

## Purpose and audit status

This document starts a source-based audit of the Telegram and VK Mini Apps. It is not a claim that the flows have already been usability-tested. Source inspection identifies existing capabilities and high-risk flows; final prioritization requires testing in the actual Telegram and VK shells with representative users.

### Confirmed product surface

The repository README and current frontend sources identify:
- Two separate entry points: `index.html` (Telegram) and `apps/vk/index.html` (VK).
- Timetable views for today, tomorrow, week and month, plus teacher search.
- A Student Service area with tasks, deadlines, events, calendar, analytics, reminders, notes and hostel/ЖБС point tracking.
- Settings for group and display preferences, including theme, text density/size and timetable display options.
- Account linking and shared cloud synchronization.
- Sync status, offline/error feedback and data backup/recovery controls.
- Subject notes and personal data that must survive any interface redesign.

## Current user journeys to map

### A. First launch → useful timetable
1. Open the Mini App from Telegram or VK.
2. Identify whether a group is already selected.
3. Select or change the study group if needed.
4. Wait for schedule data to load.
5. Find today's next lesson and navigate to another day/week.
6. Understand refresh, offline, empty and error states.

**Questions to test:** Is the next action obvious on a fresh account? Does the app explain how to choose a group? Can the user recover from a failed load without guessing? How many taps until today's timetable is useful?

### B. Everyday timetable use
1. Open the app.
2. See the relevant date and next lesson.
3. Switch between today, tomorrow, week and month.
4. Open lesson details and add/read a subject note.
5. Refresh or return after losing connectivity.

**Questions to test:** Is the active date/view unmistakable? Are lesson type, room, teacher and time easy to scan? Does the interface communicate stale or offline data honestly? Are controls comfortable on a small screen?

### C. Student Service
1. Open My Service.
2. Find the relevant area: tasks, deadlines, events, calendar, analytics, reminders or hostel/ЖБС tracking.
3. Add or update an entry.
4. Confirm that the entry was saved and queued for synchronization.
5. Find the same entry on the other linked platform.

**Questions to test:** Are similar concepts clearly distinguished? Is the navigation hierarchy understandable? Does save feedback distinguish local save from cloud synchronization? Can users find an item later?

### D. Telegram ↔ VK account linking
1. Understand the benefit of linking accounts.
2. Generate a one-time code in the source platform.
3. Enter the code in the other platform.
4. Understand success, invalid/expired code and retry behavior.
5. Confirm which data is shared and which remains platform-specific.

**Questions to test:** Does the user know which platform to open first? Is the code's expiry and one-time use explained? Is success clearly confirmed? Is the data-sharing boundary described in plain language?

### E. Sync conflict and recovery
The VK frontend currently exposes actions for manual sync, merging Telegram and VK records, sending the local VK version to the cloud, and replacing local data with the cloud version. Some operations use confirmation dialogs and save backups.

**Risk:** These are consequential data operations. A technically correct action can still be a serious UX failure if users cannot predict which version will win or what will be overwritten.

**Required design rule:** Before any destructive or conflict-resolution action, explain the affected copy, the expected result, and whether a backup will be made. Keep recovery actions visually separated from ordinary sync. Never remove backup behavior as part of a visual redesign.

### F. Subscription journey — design only for now
1. Understand the difference between free and paid access.
2. See the monthly price and exact renewal/expiry terms.
3. Decide whether to subscribe.
4. Understand payment success/failure and expiry behavior.

**Dependency:** Product rules must be agreed before paywall design or implementation: free/paid feature boundaries, renewal model, reminder schedule, cancellation/refund behavior and access after expiry. Do not imply that payment is already implemented.

## Initial audit priorities

| Priority | Area | Why it matters | Evidence needed |
|---|---|---|---|
| P0 | Data safety during sync and recovery | User data can be overwritten or conflict | Test conflicting edits, offline mode and recovery on two devices |
| P1 | First launch and group selection | Blocks access to the core value | Fresh-account test on Telegram and VK |
| P1 | Navigation across timetable and Student Service | Many distinct features are exposed in one app | Screen inventory and task-based usability tests |
| P1 | Sync status and error messages | Users need to distinguish local save from cloud sync | Test offline, delayed response, conflict and retry |
| P2 | Visual consistency and accessibility | Affects scan speed and ease of use | Check typography, contrast, touch targets, themes and small screens |
| P2 | Subscription entry points | Impacts conversion and trust | Validate only after product rules are agreed |

These priorities are provisional. Frequency and severity must be confirmed with real users and observed behavior.

## Proposed target experience principles

1. **Show the next useful action.** On first launch, make group selection and schedule loading self-explanatory.
2. **Keep the timetable primary.** Secondary tools should be discoverable without competing with the core schedule.
3. **Use plain-language status.** Distinguish “saved on this device”, “syncing”, “synced” and “sync needs attention”.
4. **Make recovery predictable.** Explain local vs cloud versions before merge/replace actions and preserve backups.
5. **Design once, validate twice.** Keep a shared information architecture and design language, while respecting Telegram/VK platform constraints.
6. **Avoid redesigning from assumptions.** Validate the current journey before removing or rearranging existing controls.
7. **Measure usability.** Track task completion, time to completion, error/retry rate and points where users ask for help.

## Test script for the first audit session

Run each task in Telegram and VK, ideally with a fresh account and then with a linked account:
1. Find today's next lesson.
2. Switch to the weekly schedule and return to today.
3. Find a subject and save a note.
4. Add a task with a due date and then mark it complete.
5. Find the sync status and explain what it means.
6. Link the second platform and verify that a note appears there.
7. Simulate or observe a failed sync and recover without losing edits.
8. Find the backup/recovery controls and explain the consequences before confirming an action.

For every task, record: success/failure, taps, time, confusion points, error messages, and whether the user needed assistance.

## Not yet established

- No live usability session or screenshot-by-screenshot review has been completed in this audit.
- Source code alone does not establish whether controls are visually prominent or understandable in Telegram/VK.
- Final navigation, visual direction, subscription gating and success metrics remain decisions for the product owner after reviewing the audit evidence.
- No production code, data, Worker deployment or Mini App launch URL is changed by this document.
