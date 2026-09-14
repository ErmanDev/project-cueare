---
name: SSC QR Attendance
description: Campus staff console for ACSSCO Bukidnon — navy, crest, and Source on a paper work desk.
colors:
  navy: "#23326b"
  navy-deep: "#1a2554"
  on-primary: "#ffffff"
  primary-container: "#d9def0"
  on-primary-container: "#1a2554"
  accent-red: "#da1f28"
  on-error: "#ffffff"
  error-container: "#ffdad8"
  on-error-container: "#410006"
  status-in: "#15803d"
  status-out: "#c2410c"
  surface: "#f7f8fc"
  on-surface: "#1a1c22"
  on-surface-variant: "#454754"
  outline: "#757686"
  outline-variant: "#c5c6d6"
  surface-lowest: "#ffffff"
  surface-low: "#f1f3fa"
  surface-container: "#eaecf5"
  surface-high: "#e4e6f1"
  surface-highest: "#dee0ec"
  inverse-surface: "#1a2554"
  on-inverse: "#f0f1f8"
  error-ground: "#f8f8f8"
  error-ink: "#101d49"
  error-muted: "#353535"
typography:
  display:
    fontFamily: "Source Serif 4, Iowan Old Style, Palatino Linotype, Palatino, serif"
    fontSize: "2.25rem"
    fontWeight: 600
    lineHeight: 1.15
    letterSpacing: "-0.02em"
  headline:
    fontFamily: "Source Serif 4, Iowan Old Style, Palatino Linotype, Palatino, serif"
    fontSize: "1.75rem"
    fontWeight: 600
    lineHeight: 1.15
    letterSpacing: "-0.02em"
  title:
    fontFamily: "Source Serif 4, Iowan Old Style, Palatino Linotype, Palatino, serif"
    fontSize: "1.375rem"
    fontWeight: 600
    lineHeight: 1.2
    letterSpacing: "-0.02em"
  body:
    fontFamily: "Source Sans 3, Segoe UI, system-ui, sans-serif"
    fontSize: "1rem"
    fontWeight: 400
    lineHeight: 1.35
    letterSpacing: "normal"
  label:
    fontFamily: "Source Sans 3, Segoe UI, system-ui, sans-serif"
    fontSize: "13px"
    fontWeight: 600
    lineHeight: 1.3
    letterSpacing: "0.01em"
rounded:
  sm: "8px"
  md: "10px"
  lg: "12px"
  xl: "16px"
  full: "50%"
spacing:
  xs: "4px"
  sm: "8px"
  md: "12px"
  lg: "16px"
  xl: "24px"
  2xl: "36px"
  3xl: "40px"
components:
  button-primary:
    backgroundColor: "{colors.navy}"
    textColor: "{colors.on-primary}"
    rounded: "{rounded.lg}"
    padding: "0 16px"
    height: "44px"
  button-primary-hover:
    backgroundColor: "{colors.navy}"
    textColor: "{colors.on-primary}"
    rounded: "{rounded.lg}"
    padding: "0 16px"
    height: "44px"
  button-secondary:
    backgroundColor: "{colors.surface-lowest}"
    textColor: "{colors.navy}"
    rounded: "{rounded.lg}"
    padding: "0 16px"
    height: "44px"
  button-ghost:
    backgroundColor: "transparent"
    textColor: "{colors.on-surface-variant}"
    rounded: "{rounded.lg}"
    padding: "0 16px"
    height: "44px"
  button-ghost-back:
    backgroundColor: "transparent"
    textColor: "{colors.navy}"
    rounded: "{rounded.lg}"
    padding: "0 16px"
    height: "44px"
  button-danger:
    backgroundColor: "{colors.accent-red}"
    textColor: "{colors.on-error}"
    rounded: "{rounded.lg}"
    padding: "0 16px"
    height: "44px"
  button-sm:
    backgroundColor: "{colors.navy}"
    textColor: "{colors.on-primary}"
    rounded: "{rounded.md}"
    padding: "0 12px"
    height: "36px"
  card:
    backgroundColor: "{colors.surface-lowest}"
    textColor: "{colors.on-surface}"
    rounded: "{rounded.lg}"
    padding: "18px 20px"
  error-card:
    backgroundColor: "{colors.surface-lowest}"
    textColor: "{colors.error-ink}"
    rounded: "{rounded.lg}"
    padding: "40px 36px 32px"
    width: "min(520px, 100%)"
  login-card:
    backgroundColor: "{colors.surface-lowest}"
    textColor: "{colors.on-surface}"
    rounded: "{rounded.lg}"
    padding: "36px 32px 32px"
    width: "min(440px, 100%)"
  field:
    backgroundColor: "{colors.surface-lowest}"
    textColor: "{colors.on-surface}"
    rounded: "{rounded.lg}"
    padding: "12px 14px"
  chip:
    backgroundColor: "{colors.primary-container}"
    textColor: "{colors.on-primary-container}"
    rounded: "{rounded.sm}"
    padding: "2px 10px"
  nav-link:
    backgroundColor: "transparent"
    textColor: "rgba(255, 255, 255, 0.82)"
    rounded: "{rounded.md}"
    padding: "10px 12px"
  nav-link-active:
    backgroundColor: "rgba(255, 255, 255, 0.16)"
    textColor: "{colors.on-primary}"
    rounded: "{rounded.md}"
    padding: "10px 12px"
---

# Design System: SSC QR Attendance

## Overview

**Creative North Star: "The Official Work Desk"**

SSC QR Attendance is the ACSSCO Bukidnon staff console: a paper work surface with one institutional navy and the campus crest. Authenticated work sits in a navy sidebar beside a white content pane. Recovery is the same desk without the sidebar — one bordered card, the crest, a serif headline, and a short sentence. Login is the only full-bleed navy door; it is not the template for other full-page states.

The pairing is official without ceremony. Source Serif 4 carries titles; Source Sans 3 carries body, chrome, and actions. Corners are quietly rounded (12px on plates and primary actions). Status green and rust mark IN and OUT; campus red is reserved for true error, danger, and blocked states. Copy stays short and operational.

Staff work, login, and recovery all lock to a light color scheme even when the OS is dark. New screens inherit that lock.

**Key Characteristics:**
- Paper-white work and recovery surfaces; navy is the spine and the primary action, not a second wallpaper
- Source Serif 4 titles, Source Sans 3 everything else
- The ACSSCO shield as the only identity image
- Flat white cards with a navy-tinted 1px border; lift is for overlays and the two standalone plates (login, recovery)
- 44px primary actions; recovery stacks a full-width navy button over a navy ghost “Go back”

## Colors

Campus navy is the institutional voice. Neutrals are cool paper and ink. Red is scarce. IN and OUT are a separate status pair.

### Primary
- **Campus Navy**: Sidebar fill, primary buttons, serif titles, focus rings, and recovery “Go back” ink. The same value is `--primary` and `--navy` on light work surfaces.
- **Navy Deep**: Login stage ground only. Not a work-pane fill and not a recovery ground.
- **On Primary**: Type and icons on navy fills.
- **Primary Container / On Primary Container**: Selected calendar days, welcome strips, active chips, and avatar wells — navy at a whisper.

### Secondary
- **Campus Red**: Danger buttons, form/login error chrome, blocked chips, and toast error fills. Same token as `--error` / `--secondary`. It does not paint the recovery plate.

### Tertiary
- **Status In**: Confirmed IN chips, IN stats, IN direction pills.
- **Status Out**: Confirmed OUT chips, OUT stats, OUT direction pills.

### Neutral
- **Cool Paper**: App body behind the shell (`--surface`).
- **Plate White**: Cards, fields, content pane, login plate, recovery plate (`--surface-lowest`).
- **Desk Ground**: Recovery page fill only — a near-white paper (`--error-ground`) under a tiled ground texture. Cooler than plate white, flatter than Cool Paper.
- **Ink / Recovery Ink**: Default work text (`--on-surface`); recovery page text (`--error-ink`, a deeper navy-black).
- **Muted / Desk Muted**: Secondary work copy (`--on-surface-variant`); the one recovery sentence (`--error-muted`, a warmer charcoal).
- **Outline / Outline Variant**: Field borders and hairlines; cards mix navy at 12% into outline-variant for a campus-tinted edge.
- **Surface Low → Highest**: Nested wells, table headers, segmented tracks, hover washes.
- **Inverse Surface / On Inverse**: Default toasts.

### Named Rules
**The Desk-Not-Door Rule.** Recovery and authenticated work sit on paper. Do not restage them on Navy Deep, login rays, or a washed-out crest wallpaper.

**The One Navy Rule.** Campus Navy is the voice of titles and primary actions. It fills the sidebar. It does not flood work or recovery canvases.

**The Scarce Red Rule.** Campus Red marks failure, danger, and blocked — never the recovery card, never a decorative accent stripe.

## Typography

**Display Font:** Source Serif 4 (with Iowan Old Style, Palatino Linotype, Palatino, serif)
**Body Font:** Source Sans 3 (with Segoe UI, system-ui, sans-serif)
**Label/Mono Font:** Source Sans 3 for labels; `ui-monospace, Consolas, monospace` only for student IDs and the fine-note textarea

**Character:** A campus-official pairing. The serif is the named thing on the desk; the sans is the clerk’s hand. Weights cluster at 600 for titles and actions, 650–700 for compact chrome.

### Hierarchy
- **Display** (600, 2.25rem / 2rem below 640px, 1.15, −0.02em): Recovery headline only. Cap at about 20ch and wrap balanced.
- **Headline** (600, 1.75rem, 1.15, −0.02em): Page heads and the login product title. Navy ink.
- **Title** (600, 1.125–1.375rem, ~1.2): Modal titles, calendar month, empty-state headings, sidebar-adjacent section titles.
- **Body** (400, 1rem, 1.35): Work copy. Recovery body steps to 1.125rem (1rem below 640px) at 1.45, max about 36ch, desk-muted.
- **Label** (600–700, 12–13px): Field captions, table headers (uppercase, 0.04em), chips, nav. Sidebar product name is 15px / 650 sans — not serif.

### Named Rules
**The Source Pair Rule.** Serif for named titles. Sans for chrome, body, buttons, and the sidebar. Do not set shell navigation in Source Serif 4.

**The Short Sentence Rule.** Empty states and recovery use one serif title and one calm sentence. No status codes, no stacked eyebrows, no display numerals as the message.

## Layout

The authenticated console is a 260px navy sidebar plus a white content pane padded 40px 48px 64px (16px on viewports at or below 900px). Work pages cap at 1080px; the home column caps at 640px. Two-up tile grids collapse to one column at 560px. Sections use a 260px sticky tree beside the roster until 900px.

Login and recovery are standalone, centered, full-viewport plates with no sidebar. Login pads at least 36px (20–28px on narrow screens). Recovery pads at least 24px including safe-area insets. The recovery card is at most 520px; its actions column is at most 420px, stacked, 8px apart, with 36px above the actions.

Touch targets for primary and recovery actions stay at 44px. Compact pager and icon buttons may drop to 32–40px.

## Elevation & Depth

Work is flat. Cards, fields, and tables are plate-white with a 1px campus-tinted border and no resting shadow. Depth comes from nested surface steps (low / container / high) and from a navy wash on selected or “today” rows.

Lift is reserved: the recovery card (`0 8px 24px` navy-tinted shadow), the login plate (inset hairline plus a deep navy stage shadow), modals (`0 16px 48px`), and toasts (`0 8px 24px`). Segmented active pills and file wells use a 1–2px whisper only.

Recovery enters by settling 8px over 220ms (`cubic-bezier(0.16, 1, 0.3, 1)`). Login uses the same ease at 280ms. Both cancel under reduced motion. Forced-colors drops atmosphere textures and shadows and draws a CanvasText border.

### Shadow Vocabulary
- **Desk plate** (`box-shadow: 0 8px 24px rgba(26, 37, 84, 0.12)`): Recovery card; also default toasts.
- **Door plate** (`box-shadow: 0 1px 0 rgba(255, 255, 255, 0.95) inset, 0 28px 64px rgba(8, 12, 32, 0.42)`): Login card on the navy stage only.
- **Overlay** (`box-shadow: 0 16px 48px rgba(26, 37, 84, 0.12)`): Modals.
- **Whisper** (`box-shadow: 0 1px 3px rgba(26, 37, 84, 0.12)`): Active segmented control.

### Named Rules
**The Flat Card Rule.** Work cards do not float. If a surface needs a shadow, it is an overlay or one of the two standalone plates.

## Shapes

The house corner is a quiet 12px (`--radius`) on cards, primary buttons, fields, the recovery plate, and the login plate. Compact chrome tightens to 10px (nav links, small buttons, icon buttons, toasts) or 8px (chips, pager, tree rows). Modals open to 16px. Avatars are full circles. The scanner well is a 12px clipped dark stage.

Borders are 1px, navy-tinted on cards (`color-mix` navy 12% into outline-variant) and outline-variant on fields. Focus is a 2px Campus Navy ring, offset 2px (1px on calendar days). Field focus thickens the border to 2px navy and insets padding by 1px so the box does not grow.

The crest is a shield, not a rounded app icon. On recovery it is 112px (96px below 640px); on login 160px (112px on short viewports); in the sidebar 40px on an 8px white square.

## Components

### Buttons
Campus-navy actions. 12px corners, 600 weight, 8px icon gap, 44px min height, 16px horizontal padding.

- **Shape:** Quiet 12px (`--radius`); small variant 10px at 36px tall
- **Primary:** Navy fill, white type. Hover brightens (`filter: brightness(1.08)`). Recovery primary is the same button at full width of the actions column.
- **Secondary:** White fill, navy type, 1px border mixed from navy at 45%.
- **Ghost:** Transparent, muted ink; hover washes surface-container. Recovery “Go back” is ghost with navy type and 600 weight — still a text control, not a second filled button.
- **Danger:** Campus Red fill, white type.
- **Hover / Focus:** Global `:focus-visible` is a 2px navy ring. Disabled sits at 50% opacity.

### Chips
Tight 8px pills, 12px / 700, 2px 10px padding. Draft/today use primary-container. IN uses status-in at 16% wash; OUT uses status-out the same way. Blocked uses error-container. Window chips are surface-low navy; the current window promotes to primary-container.

### Cards / Containers
- **Corner Style:** 12px
- **Background:** Plate white. Welcome cards invert to primary-container with no border.
- **Shadow Strategy:** None at rest in the shell. Recovery uses the desk-plate shadow.
- **Border:** 1px navy-tinted hairline
- **Internal Padding:** 18px 20px typical; recovery 40px 36px 32px (32px 20px 24px below 640px), centered column
- **Empty state:** Centered serif title, muted line, optional action — the in-page cousin of the recovery plate

### Inputs / Fields
- **Style:** Plate white, 1px outline-variant, 12px radius, 12px 14px padding. Label is 13px / 600 muted.
- **Focus:** Navy 2px border, no glow.
- **Error / Disabled:** Login errors are a 10px-radius error-container well, 14px sentence. Disabled fields wash surface-low.

### Navigation
Navy sidebar, white type. Links are 14px / 600, 10px radius, 82% white at rest; hover 8% white wash; active 16% white wash. The 40px crest sits on an 8px white square beside 15px sans product name and 11px campus line. Below 900px the sidebar becomes a horizontal wrap and brand/user blocks hide.

### Recovery plate
Full-viewport desk: tiled paper ground over desk-ground fill, one centered card, official crest, serif display title, one muted sentence, full-width navy primary (Home / Log in / Try again), navy ghost “Go back”. Missing-page and crash share this plate. Primary destination is role-aware (superadmin home, scanner home, or login). No sidebar, no 404 numeral, no login-stage navy.

### Login plate
The door: Navy Deep stage, faint crest and rays, 440px white card, 160px crest, serif product title, navy campus line, stacked fields, full-width navy submit. Do not reuse this stage for recovery or empty work.

## Do's and Don'ts

### Do:
- **Do** put work and recovery on paper-white plates with a 12px navy-tinted border and Source Serif 4 titles in Campus Navy.
- **Do** use one navy primary and one ghost back on recovery; keep the primary 44px and full-width in the actions column.
- **Do** show the ACSSCO crest as a real mark (login 160px, recovery 112px, sidebar 40px).
- **Do** speak errors in one short sentence, then offer a next step (Home if signed in, Log in if not, Try again on crash, Go back always).
- **Do** lock staff work, login, and recovery to a light color scheme.

### Don't:
- **Don't** clone the navy login stage (deep fill, rays, giant faded crest) onto recovery or authenticated pages.
- **Don't** lead recovery with a giant 404, a status code, or Campus Red.
- **Don't** set shell chrome or body copy in Source Serif 4.
- **Don't** float ordinary work cards; reserve shadows for overlays, login, and recovery.
- **Don't** invent a second logo or replace the crest with a generic mark.
