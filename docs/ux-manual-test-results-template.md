# UX manual test record — Telegram and VK Mini Apps

Use this template only while testing the published app. Keep separate records for Telegram and VK; do not infer one platform's result from the other. Use disposable test accounts and test records for account linking, conflicts, import, merge, restore, or deletion.

## Run metadata

| Field | Value |
|---|---|
| Date/time and time zone | |
| Tester | |
| Platform | Telegram / VK |
| Device + OS | |
| App/WebView version (if available) | |
| Published URL / configured launch entry point | |
| Commit or deployment version verified | |
| Viewport / screen size | |
| Theme | Light / Dark / System |
| Account/data type | Disposable test account / test data only |
| Result | Pass / Fail / Blocked / Not run |

**Evidence rule:** record the exact visible outcome. Attach screenshots or screen recordings only after removing personal data, tokens, link codes, IDs and other secrets. A successful desktop-browser test is not a successful Telegram/VK shell test.

## Task-based checks

For each task record: Pass / Fail / Blocked / Not run, elapsed time, number of taps if practical, error text, confusion or assistance, and evidence reference.

| ID | Task | Expected result | Status | Time / taps | Observed result / exact error | Evidence |
|---|---|---|---|---|---|---|
| T01 | Open the app and identify selected study group | App opens; current group is clear | Not run | | | |
| T02 | Search for a normal group name and choose a result | Search returns selectable matches; group persists after relaunch | Not run | | | |
| T03 | Switch Today → Week → Today | Correct mode and active state are visible; timetable updates | Not run | | | |
| T04 | Refresh schedule | Clear loading/result/error feedback; no broken state | Not run | | | |
| T05 | Create a subject note | Note is associated with the selected subject and persists after relaunch | Not run | | | |
| T06 | Create a task with due date and mark complete | Correct status/date; persists after relaunch | Not run | | | |
| T07 | Create a deadline and event | Both appear in the intended dashboard/calendar locations | Not run | | | |
| T08 | Open Hostel/points overview | Overview and goals are reachable and understandable | Not run | | | |
| T09 | Add a ЖБС entry | Validation works; entry appears in history with correct category/date | Not run | | | |
| T10 | Add an ССО entry with evidence | Evidence is retained; entry appears in history | Not run | | | |
| T11 | Inspect history and generate Word report | Records are ordered correctly; category labels/fields are retained | Not run | | | |
| T12 | Open reminder settings and deny permission if prompted | UI explains actual state; no unsupported promise of push notifications | Not run | | | |
| T13 | Open Settings → Sync and inspect status | Status distinguishes local save from cloud synchronization | Not run | | | |
| T14 | Open Settings → Data/Backup | Export/restore actions are discoverable and explain consequences | Not run | | | |
| T15 | Repeat key tasks at narrow width | No clipped content, unintended horizontal overflow or inaccessible controls | Not run | | | |
| T16 | Repeat key tasks with light/dark/system theme | Text, focus and state indicators remain legible | Not run | | | |
| T17 | Keyboard/dialog behavior where supported | Tab/Shift+Tab, Escape and focus restoration work | Not run | | | |

## Sync and recovery checks — disposable data only

Do not perform these checks using the owner's real account or irreplaceable records.

| ID | Scenario | Required safety condition | Expected result | Status | Observed result / evidence |
|---|---|---|---|---|---|
| S01 | Link disposable Telegram and VK accounts | Explicit consent; no real account data | Linking state is clear and confirmed | Not run | |
| S02 | Edit a note/task in Telegram and verify in VK | Test records only | Change appears in VK after sync | Not run | |
| S03 | Edit a supported record in VK and verify in Telegram | Test records only | Change appears in Telegram after sync | Not run | |
| S04 | Submit invalid or expired one-time link code | No production link code | Clear failure and safe retry path; no false “linked” state | Not run | |
| S05 | Go offline, edit test data, reconnect/retry | Test data only | Pending/error state is clear; retry does not silently discard edits | Not run | |
| S06 | Make conflicting edits on both sides | Disposable records; preserve copies | Conflict outcome is explicit and deterministic; no silent data loss | Not run | |
| S07 | Test JSON export and restore confirmation | Export test data first | Confirmation states what is replaced; restore aborts if backup cannot be made | Not run | |
| S08 | Test local/cloud recovery choice | Disposable records only | Source-of-truth and overwrite behavior are clear; recovery result is verified | Not run | |

## Defect record

Duplicate this section for each failure.

- **Defect ID:**
- **Platform/device:**
- **Commit/deployment:**
- **Preconditions/test data:**
- **Exact reproduction steps:**
- **Expected result:**
- **Actual result:**
- **Exact error text:**
- **Frequency:** every time / intermittent / once
- **Severity:** blocker / high / medium / low
- **Evidence reference:**
- **Can the issue be reproduced in both platforms?**
- **Data-safety impact:**
- **Proposed fix:**
- **Regression test to add:**
- **Retest result and commit:**

## Completion gate

Do not mark the audit complete until each required check is either tested with evidence or explicitly marked blocked/not applicable with a reason. Distinguish:
- **Source reviewed** — code or markup inspected.
- **Automated test passed** — named test/workflow passed on a recorded commit.
- **Owner-reported** — owner says it works; not independently reproduced.
- **Manual shell verified** — tested in the actual Telegram or VK app and recorded here.

A passing automated suite or Cloudflare Worker preview does not establish that a published frontend works in Telegram/VK. Keep issue #30 open until the agreed acceptance gate is met or the owner explicitly descopes remaining checks.
