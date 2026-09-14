# Event Attendance Detail — implementation plan

## Goal and scope

Opening **Events → View Event Attendance Dashboard** shows one event's attendance, with a reliable summary and a searchable participant roster. The existing **All Events Attendance Records** page remains the cross-event audit log. This plan covers the superadmin web UI and its API; it does not change the moderator scanner or student app.

## Current state

- `web/src/App.tsx` has both `/superadmin/events/:eventId/attendance` and `/superadmin/attendance`, but both render `AdminAttendance`.
- `web/src/pages/admin/Attendance.tsx` already filters log requests by `event_id`, displays the event header and session windows, and supports edits, deletion, roster sync, and CSV export.
- The “Scanned Records” card uses `rows.length`. Those rows are capped at 500, change with search/status/date/session filters, and may contain both IN and OUT for one person. It is not an attendee count.
- `GET /admin/events/:id/participants` returns paged active registrations and each participant's per-session status and IN/OUT times. `GET /admin/attendance` returns audit log rows. `AttendanceSessionStatus` already derives `PENDING`, `PRESENT`, `LATE`, `ABSENT`, and `EXCUSED` from current attendance records; `ABSENT` applies when the session is closed.

## Data definitions

Use **active event registrations** as the event roster. Calculate all summary figures on the server for the full event, independent of the visible table's pagination and filters.

| Label | Definition |
| --- | --- |
| Registered | Count of active event registrations. |
| Checked in | Distinct registered students with a current, non-null check-in in at least one session of this event. Count each student once. |
| Participation rate | `checked_in / registered × 100`; display an em dash when `registered = 0`. Label it *participation*, not full attendance/completion. |
| Not yet checked in | `registered − checked_in`. Do not call this number “Absent” while an event or session is still open. |
| Session checked in | Registered students with a current check-in for that session; each person counted once per session. |
| Session checked out | Registered students with a current checkout for that session. |
| Session absent | Students whose status is `ABSENT` after the session is closed. Show pending separately for open sessions. |

Cancelled scan logs, corrections, and duplicate audit entries must not inflate any card. The current attendance record/status view is the source for metrics; the audit log remains the source for scan history. A student may be counted in multiple sessions, so session totals must not be added to derive event-level unique attendees.

## Implementation sequence

1. **Add an event summary query and endpoint.** In `server/src/db/queries.ts`, aggregate active registrations and `AttendanceSessionStatus` by event, with one summary row per session. Add `GET /admin/events/:id/attendance-summary` in `server/src/routes/admin.ts`; return 404 for an unknown event. The response should contain `event_id`, `registered`, `checked_in`, `not_yet_checked_in`, and session entries with `session_id`, `checked_in`, `checked_out`, `pending`, `absent`, `excused`, and `is_closed`. Keep event dates/name from the existing events response. No schema migration is expected.
2. **Separate page responsibilities.** Keep `/superadmin/attendance` as the global log. For `/superadmin/events/:eventId/attendance`, make the route's event ID authoritative for every fetch and export. A query string must not override it. Reuse the existing attendance table and edit controls, but remove the all-events selector and event column from the event-specific view; provide a clear link back to Events and a separate link to the global log.
3. **Build the event detail hierarchy.** Show event name/date/status and roster sync at the top; follow with Registered, Checked in, Participation rate, and Not yet checked in. Render session cards or rows with their IN/OUT and pending/absent counts. Place the paged participant roster next, with name/ID, section, per-session status, and scan times from `GET /admin/events/:id/participants`. Put the raw scan log below as an expandable “Scan history” section so audit actions remain available without dominating the page.
4. **Make roster filtering server-side.** Extend `GET /admin/events/:id/participants` to accept an optional session ID and status filter if status tabs are included. Validate that the session belongs to the route event, apply filters before pagination, and return an accurate `total`. Keep name/ID search and page controls; do not load every participant to compute or filter client-side. The existing roster modal can continue using the endpoint without these optional filters.
5. **Keep mutations and exports in sync.** After sync, edit, or delete, reload the summary, participant page, and log. Event-detail exports must always pass the route `event_id`; global exports keep current behavior. Label the existing CSV “Export scan log” because it exports logs, not one row per participant. A separate participant-summary CSV can be a later feature if requested.

## Acceptance checks

- Opening event A from Events shows only event A in the summary, roster, scan history, and CSV, even if the URL contains an `event_id` for event B.
- One student with IN and OUT in two sessions contributes **one** to event Checked in and **one** to each relevant session's IN/OUT figures. Search, status filters, and the 500-log cap do not change summary counts.
- A cancelled check-in no longer counts; corrected/current attendance does. A closed session without check-in is Absent, while an open session without check-in is Pending.
- Empty roster shows `0` registered and an unavailable participation rate, not `0%`. Unknown event ID gives a clear not-found state.
- Roster search, status/session filters, pagination, sync, log correction/deletion, and event-scoped CSV work without affecting the global log.

## Verification and stop condition

Add focused server tests for aggregate counts and event isolation using the attendance test setup; add a route test for event scoping and invalid session filters. Run the server test suite and web build/lint. Manually exercise a single-session event, a multi-session event, an empty roster, a closed session, and a corrected/cancelled scan. Stop when the checks above pass; defer charts, cross-event comparisons, and new export formats.
