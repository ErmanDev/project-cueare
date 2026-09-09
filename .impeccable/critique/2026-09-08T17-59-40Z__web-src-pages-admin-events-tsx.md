---
target: the events page
total_score: 19
max_score: 40
na_heuristics: 
p0_count: 0
p1_count: 3
target_identity: "file:C:\\Users\\EMMAN\\Downloads\\Coding\\Mobile Dev\\SSC QR ATTENDANCE\\web\\src\\pages\\admin\\Events.tsx"
target_fingerprint: "sha256:56f5e488b4e1d4cea3ecfb68ea9611eec42ca31d99235648c92b25ce06d24bc6"
target_path: "C:\\Users\\EMMAN\\Downloads\\Coding\\Mobile Dev\\SSC QR ATTENDANCE\\web\\src\\pages\\admin\\Events.tsx"
timestamp: 2026-09-08T17-59-40Z
slug: web-src-pages-admin-events-tsx
---
Method: dual-agent (A: 86b57de9-783f-437a-833e-98b0f728ff04 · B: 9df0be60-7a42-4b67-86f5-6f62c9502ca3)

Target: `web/src/pages/admin/Events.tsx` (list + New/Edit event modal)
Visitor mode: Operate
Visual inspection: source-only (no browser automation MCP; Vite returned 200 for the SPA shell, login-gated content was not seen)

## Design Health Score

| # | Heuristic | Score | Key Issue |
|---|-----------|-------|-----------|
| 1 | Visibility of System Status | 2 | Loading is a sentence; blur-save / Add session / Mark inactive give no in-place progress |
| 2 | Match System / Real World | 3 | Morning/Afternoon and Today are fluent; “session windows” + 24h times vs `fmtRange` on scan |
| 3 | User Control and Freedom | 2 | Cancel does not undo live session mutations; no Esc/X; delete has no undo |
| 4 | Consistency and Standards | 2 | Create vs edit save models differ; `window.confirm` vs branded modal; Students has search, Events does not |
| 5 | Error Prevention | 2 | Overlap validated on full save; edit Add can POST an overlapping stub; `min` date fights past events |
| 6 | Recognition Rather Than Recall | 2 | Icon-only Edit/Delete; Active’s effect on scanning is not shown |
| 7 | Flexibility and Efficiency | 1 | No shortcuts, search, sort, or bulk; defaults are the only accelerator |
| 8 | Aesthetic and Minimalist Design | 2 | Card is duplicate status UI + leftover ghost row; campus red unused, green Active off-brand |
| 9 | Error Recovery | 2 | Overlap toasts float away; blur failure does not revert; load error has no Retry |
| 10 | Help and Documentation | 1 | One subtitle; nothing on Active vs Today until the OS delete dialog |
| **Total** | | **19/40** | **Poor** |

Cognitive load: **5/8 checklist failures** (high). Chunking, grouping, visual hierarchy, one-thing-at-a-time, and working memory fail. Superadmin sidebar is 5 destinations (>4).

## Design Specificity Verdict

**Start here.** Category-interchangeable admin CRUD wearing campus chrome.

**LLM assessment:** The shell is authored — navy `#23326b` sidebar, ACSSCO Bukidnon lockup, white content pane, Source Serif 4 titles, Source Sans 3 UI. The Events surface itself is a generic card list + New/Edit modal. Swap the subtitle and it could be any school’s “manage events” screen.

Product-specific hooks exist but are thin: Morning/Afternoon defaults (`07:00–12:00` / `13:00–17:00`), a **Today** chip, weekday dates. Campus red `#DA1F28` almost never appears here (errors only). `fmtRange` (human AM/PM) is used on moderator scan surfaces, not on this page. Event type fields `is_expired` and `current_session_window_id` / `.chip-window.current` are unused. This does not yet feel like the ACSSCO event-day control board.

**Deterministic scan:** `impeccable detect --json web/src/pages/admin/Events.tsx` exited **0** with JSON `[]` — **0 findings**, no rule names, no file locations. Text-mode detect also printed nothing. The detector did not catch the save-model, modal, or delete issues (those are interaction/architecture, not static markup patterns). No false positives.

**Visual overlays:** Not present. No browser mutation API in this session; live-server and `detect.js` injection were skipped. No reliable user-visible overlay is available.

## Overall Impression

The chrome is disciplined campus admin. The Events page is not. Equal-weight cards bury “today’s assembly,” the edit modal lies about what Save and Cancel mean, and the highest-stakes action (wipe attendance) is a native `window.confirm`. The single biggest opportunity: make this the event-day control board — today’s event as hero, one honest save model, and a campus-red delete ritual — instead of a generic CRUD list with a modal.

## What's Working

1. **Campus-correct create defaults** (Morning 07:00–12:00, Afternoon 13:00–17:00) plus **Today** + weekday date — the one place the product’s event day is visible.
2. **Operate chrome is disciplined:** navy rail, white pane, Serif titles, 44px primary, `:focus-visible`, labeled fields.
3. **Delete copy tells the truth** about wiping sessions and attendance; most CRUD would say “Are you sure?”

## Priority Issues

- **[P1] Split save model in Edit event**
  - **Why it matters:** Session Add/blur/Remove hit the API immediately; **Save** only sends `name` / `event_date` / `is_active`. **Cancel** cannot roll windows back. Superadmins will think they discarded changes they already published to scanners.
  - **Fix:** One commit: draft windows locally; persist all fields on Save; Cancel / backdrop restore the loaded event. Do not POST a stub `Session 08:00–09:00` on Add.
  - **Suggested command:** `/impeccable harden`

- **[P1] Modal and icon controls fail keyboard/SR basics**
  - **Why it matters:** No focus trap, no Escape, no close button, backdrop-click dismiss. Pencil/Trash/Remove are `title`-only (no `aria-label`). Shared `Modal` in `ui.tsx`. Tab escapes into the sidebar under the backdrop.
  - **Fix:** Trap focus, Esc + named close, initial focus on the title field, `aria-label` on every icon button. Keep `:focus-visible`.
  - **Suggested command:** `/impeccable audit`

- **[P1] Cascade delete is a native confirm with no undo**
  - **Why it matters:** Highest-stakes action on the page (attendance gone) uses `window.confirm`, identical visual weight to Sign out. Trash is not danger-styled. Peak–end for delete is a valley.
  - **Fix:** Branded dialog that names the event, restates the cascade, uses campus red on the confirm control. No typed-name unless you want extra friction; at minimum stop using the OS alert.
  - **Suggested command:** `/impeccable harden`

- **[P2] Status is triplicated and semantically opaque**
  - **Why it matters:** Chip + **Mark inactive** + modal Status. **Today** ≠ **Active**; expired/current session from the data model never appear. Staff cannot see which window is live now.
  - **Fix:** One status control on the card (“Moderators can scan”). Surface current window with existing `.chip-window.current` / `current_session_window_id`.
  - **Suggested command:** `/impeccable distill`

- **[P2] Date `min={today}` on edit**
  - **Why it matters:** Past (or timezone-shifted) events can become unsavable in the date field — blocks a real admin correction path.
  - **Fix:** Apply `min={today}` on create only. On edit, allow the existing date; constrain only if the user is moving a future event backward into an invalid state you actually care about.
  - **Suggested command:** `/impeccable harden`

## Persona Red Flags

**Alex (Power User)**
- No search/filter/sort while Students has a search field — cannot jump to Friday’s intramurals in a long list.
- No bulk Mark inactive / delete; must open every card.
- No keyboard shortcut for New event; modal ignores Esc.
- **Mark inactive** is a second click instead of toggling the Active chip.
- Edit-mode Add immediately creates a dummy `Session 08:00–09:00`.
- Blur-save fights rapid tabbing through times.

**Sam (Accessibility-Dependent)**
- Tab order: header → every card’s Mark inactive → Pencil → Trash, with no skip; icon buttons are 40×40 and 4px apart.
- Dialog does not trap focus; tab escapes into the sidebar under the backdrop.
- No Escape to close; SR users get `aria-modal` without a named close.
- Event names are `<strong>`, not headings.
- Validation errors live in a 3.6s toast, not `aria-invalid` / `aria-describedby` on the overlapping Start/End fields.
- Load failure: `.error-text` only, no focus move, no Retry control.

**Jordan (First-Timer)**
- Empty state does not contain **New event** (`EmptyState` has an `action` slot that Events never passes).
- Will not know Active means “scanners can use this,” vs Today meaning “calendar day.”
- “Session windows” + **Add** with label “Session” does not teach the lunch gap (12:00–13:00) the defaults imply.

No `## Design Context` in `.cursorrules`; no extra project-specific personas.

## Minor Observations

- Window chips omit `fmtRange`; moderator Home uses it.
- `.chip-window.current` is CSS dead code on this page.
- Toggle success is silent; delete/create toast.
- Trash in-list and in-modal share `.icon-btn` with Pencil — destructive not distinct until hover.
- Wide modal at 720px still uses a 2-column scramble for three time fields.
- `@media (max-width: 900px)` hides brand + user; Events header wraps **New event** under the title — empty state then has no visual sibling CTA.
- Forced light `.content` vs OS dark `:root` tokens: sidebar-only dark is a hybrid.
- `window.confirm` for Sign out and Delete trains an “OK to the gray box” reflex on a cascade delete.

## Questions to Consider

1. If this page exists so Friday’s assembly can be scanned, why isn’t **today’s event** the hero and everything else archive — instead of equal cards and a modal?
2. What would **Save** mean if session times could not go live until Save?
3. Should **Active** be a switch on the card that explains “Moderators can scan,” and delete a campus-red dialog that names the event?
4. If Morning and Afternoon are the product, why can **Add** create a nameless overlapping `Session` — would a locked two-window day with an optional evening be the more honest campus tool?
