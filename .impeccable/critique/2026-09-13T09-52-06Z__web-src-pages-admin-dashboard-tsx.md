---
target: the admin home page
total_score: 22
max_score: 40
na_heuristics: 
p0_count: 0
p1_count: 3
target_identity: "file:C:\\Users\\EMMAN\\Downloads\\Coding\\Mobile Dev\\SSC QR ATTENDANCE\\web\\src\\pages\\admin\\Dashboard.tsx"
target_fingerprint: "sha256:3390f377afd14aa5c4b189640db376be300ce8db992c509858870510954cd490"
target_path: "C:\\Users\\EMMAN\\Downloads\\Coding\\Mobile Dev\\SSC QR ATTENDANCE\\web\\src\\pages\\admin\\Dashboard.tsx"
timestamp: 2026-09-13T09-52-06Z
slug: web-src-pages-admin-dashboard-tsx
---
Method: dual-agent (A: 102b1cfa-3239-4f3f-835b-35cca5b07a4f · B: 837f11ae-a119-4055-b7bc-2b5e929719f5)

Target: `web/src/pages/admin/Dashboard.tsx` (Superadmin Home / `/superadmin` index)
Visitor mode: Operate
Visual inspection: source-only (no browser automation MCP; in-page overlay not produced)

## Design Health Score

| # | Heuristic | Score | Key Issue |
|---|-----------|-------|-----------|
| 1 | Visibility of System Status | 2 | Live clock and today/selected cells exist; load is 42 `aria-hidden` empty days — no skeleton, `aria-busy`, or live region |
| 2 | Match System / Real World | 2 | Calendar metaphor is right; “Superadmin” / `@username` are tool jargon; Sunday-first grid; fines unlabeled |
| 3 | User Control and Freedom | 3 | Prev/Next/Today and out-of-month jump work; `goMonth` silently reseeds the selected day with no undo |
| 4 | Consistency and Standards | 2 | Nav says Home, `h2` says Superadmin; Events uses `TableSkeleton` + primary CTA, Home uses blank cells + a text link |
| 5 | Error Prevention | 3 | No destructive actions here; `ymd(event.event_date)` can shift PH dates; month change overwrites the day you were on |
| 6 | Recognition Rather Than Recall | 2 | Desktop pills name events; ≤700px hides names for 6px dots; `aria-label` is ISO `YYYY-MM-DD`; weekday row is `aria-hidden` |
| 7 | Flexibility and Efficiency | 2 | Today is the only accelerator; 42 tab stops; Open Events drops the selected date; no create-on-this-day |
| 8 | Aesthetic and Minimalist Design | 2 | `.page-head` + tinted `.welcome-card` outweigh `.cal-month`; welcome duplicates `.sidebar-user`; clock competes with the month |
| 9 | Error Recovery | 3 | First-fail `EmptyState` + Try again is solid; empty day has no next step; retry vanishes once any load succeeded |
| 10 | Help and Documentation | 1 | One subtitle; no legend for pills/dots/inactive; empty day teaches nothing |
| **Total** | | **22/40** | **Acceptable** |

Cognitive load: **4/8 checklist failures** (high). Failed: single focus, visual hierarchy, one thing at a time, minimal choices. The primary decision is 42 `.cal-day` buttons. Superadmin sidebar is 6 destinations (Home, Events, Fines, Students, Moderators, Attendance). Chunking, grouping, progressive disclosure, and working memory pass on desktop because the panel repeats the day’s events.

## Design Specificity Verdict

**Start here.** Campus chrome around a category-interchangeable calendar admin.

**LLM assessment:** The job — this month’s council events, pick a day, go to Events — is the only product-true move. The composition around it is stock SaaS: `h2` “Superadmin”, a `.welcome-card` (“Welcome, {name}” + `@{username}`), and a ticking `.home-now` that never binds to a session window. Navy, Source Serif, and the ACSSCO Bukidnon lockup live in `Shell`, not in the dashboard. Swap the logo and this is any school calendar. Adjacent Events already speaks the domain (session windows, fine template, `chip-today`); Home dumps `fine_policy.template_name` as unlabeled muted text and never applies existing `.chip-window.current` even though a 1s ticker is running. Inactive events are opacity, not campus status. The week starts Sunday. Coherent tokens, interchangeable layout.

**Deterministic scan:** `impeccable detect --json web/src/pages/admin/Dashboard.tsx` exited **0** with JSON `[]` — **0 findings**, no rule names, no file locations. The detector did not catch the welcome-vs-task hierarchy, dead event rows, or load-state a11y (those are interaction and composition, not static markup patterns). No false positives.

**Visual overlays:** Not present. No browser mutation API in this session; live-server and `detect.js` injection were skipped. No reliable user-visible overlay is available.

## Overall Impression

The chrome is disciplined campus admin. The Home page is not yet a command board. Officers land on a role title and a welcome card they already saw in the sidebar; the month they came for sits third. The calendar itself is the right IA — board + day panel, not KPI tiles — but the end of the journey is a limp “Open Events” link that throws away the day they picked. The single biggest opportunity: make Home today’s event-day board — month first, live window status, and a real path into the event you selected.

## What's Working

1. **Right Operate IA.** `.cal-board` month + `.cal-panel` day list is the correct home, not a six-tile dashboard dump.
2. **Time literacy is already in the tokens.** `.home-now`, `.cal-day.is-today`, the Today control, and `goMonth` snap-back to today share chip language with Events (`chip-today` / `chip-active`).
3. **First-load failure is honest.** `EmptyState` + Try again names the miss and offers a retry — stronger than most admin homes.

## Priority Issues

- **[P1] Welcome and “Superadmin” bury the calendar**
  - **Why it matters:** Officers come to see this month’s events. The first two blocks are identity theater that duplicates `.sidebar-user`. Hierarchy fails before the task starts.
  - **Fix:** Title the page like Events (`Home` / `This month’s events`). Kill or collapse `.welcome-card` on desktop. Lead with month + today.
  - **Suggested command:** `/impeccable layout`

- **[P1] Event rows are dead; `.cal-open` dumps the selected date**
  - **Why it matters:** The primary action — open the event you picked — is not on the event. `<strong>{event.name}</strong>` looks clickable and isn’t. Peak-end is a generic text link to `/superadmin/events`.
  - **Fix:** Make each event a link that keeps the date. Promote one primary CTA (Open this day / New event on this date). Use `Button`, not `.cal-open`.
  - **Suggested command:** `/impeccable clarify`

- **[P1] Load state is a silent empty month**
  - **Why it matters:** First paint is 42 inert `.cal-day` cells with `aria-hidden` and no `aria-busy`. Looks like no events. Events already has `TableSkeleton`.
  - **Fix:** Reuse skeleton language; `aria-busy` on `.cal-board`; polite live “Loading events.”
  - **Suggested command:** `/impeccable harden`

- **[P2] The clock never says whether a window is open**
  - **Why it matters:** This product’s only time-critical cue is a ticking time unrelated to Morning/Afternoon windows. `.chip-window.current` already exists and is unused here.
  - **Fix:** When `selected === today`, mark the in-range window in `.cal-panel` and say it in plain language.
  - **Suggested command:** `/impeccable delight`

- **[P2] Calendar is mouse-first and ISO-labeled**
  - **Why it matters:** `.cal-week` is `aria-hidden`; day `aria-label` is `2026-09-13`; 42 tab stops; ≤700px hides event names for 6px dots; inactive is opacity.
  - **Fix:** Spoken weekday labels; expose weekday headers to AT; roving tabindex + arrows; text status not opacity; keep names available when pills hide.
  - **Suggested command:** `/impeccable audit`

## Persona Red Flags

**Alex (Power User):** No shortcuts on Prev/Today/Next. Forty-two tab stops in `.cal-grid`. `.cal-open` drops `selected`. Cannot create from “No events on this date.” Welcome card is skip-bait. No year jump.

**Sam (Accessibility-Dependent):** Weekday row hidden from AT. Day labels are ISO dates. Load cells are `aria-hidden` with no status. Panel has no `aria-live`. Sign out in the shell is `title="Sign out"` only. Inactive by opacity. 6×6 `.cal-dot`. Light `.content` ignores `prefers-color-scheme`. No arrow-key grid.

**Jordan (First-Timer):** Heading says Superadmin while nav says Home. `@username` is tool chrome. Event names look clickable and aren’t. “Active/Inactive” and a bare fine-template name have no explanation. Empty day has no next step.

## Minor Observations

- `goMonth` auto-selects the first event in the month without saying why.
- When `selected === today`, the panel `h3` and `.chip-today` both say “Today.”
- Sunday-first `WEEKDAYS` vs a typical PH Monday week.
- `.home` max 640px is overridden by `.home-cal` 960px — leftover tile-home constraint.
- At ≤900px `.sidebar-brand` / `.sidebar-user` hide; welcome becomes the only identity (desktop waste, mobile crutch).
- Events empty state teaches create/sessions/fines; Home empty day does not.
- `ymd()` on string dates is timezone-fragile for grouping.
- Retry is hidden after a successful load, so a later refresh error has no in-page recovery.

## Questions to Consider

- If this is Home, why is the first heading a role name instead of today’s events?
- What would the clock be for if it couldn’t show whether a session window is open?
- Why can you see an event on a day and not open that event?
- Should a no-event day start “New event” the way Events already does?
- Is the welcome card for officers, or leftover from the Moderator “Hi, @user” pattern?
