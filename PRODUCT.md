# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Primary web users are **SSC officers (superadmin)** and **event scanners (moderators)** at ACSSCO Bukidnon Campus. They manage events, rosters, and attendance, or scan student QR codes during session windows. Students use the Flutter app (their own QR and attendance), not this web UI. The web error page can be seen by anyone: signed-in staff, signed-out visitors, or someone who followed a broken link.

## Product Purpose

SSC QR Attendance records who timed IN and OUT at campus events by scanning a student QR code. Success is a correct, auditable IN/OUT record for the right student, event, and session window, without double-IN or lost scans. This web app is the staff console: events, students, sections, fines, moderators, and attendance; moderators also scan from the browser.

## Positioning

IN/OUT is decided on the **server clock** against the event’s session windows (first confirmed scan = IN, second = OUT, later scans blocked). Cancel writes an audit row that never changes IN/OUT. Confirm runs in a transaction so two scanners cannot both record IN for the same student.

## Operating Context

Campus events (assemblies, activities) with Morning/Afternoon (or other) session windows. Superadmin prepares events, students, and accounts; moderators pick an active event and scan at the door. Production is served from IIS on a campus host name; the React UI is built into the Express API. The Flutter app is used on phones; this record is for the **web** staff console.

## Capabilities and Constraints

- Roles: superadmin (full admin), moderator (scan + own history). Students have no web login.
- Unknown URLs currently redirect to Home with no explanation. The error surface must cover **missing pages (404)** and **unexpected crashes**, in the same friendly voice.
- Anyone may land there. They need a calm “what happened” note and a way to retry or go back (Home if signed in, Log in if not).
- Staff UI is navy / campus-crest branded; login is a standalone full-page, authenticated work sits in a sidebar shell.
- Camera scanning in a browser over plain HTTP may be blocked; HTTPS or typed student codes are the fallback.

## Brand Commitments

- Product name: **SSC QR Attendance**
- Campus: **ACSSCO Bukidnon Campus**
- Voice: plain, operational, no hype. Errors already speak in short sentences (“Invalid username or password.” / “Could not sign in.”). The error page should stay **friendly and calm**, not alarming or jokey.
- Assets: campus crest at `web/public/logo.png` (ACSSCO Bukidnon Campus logo).

## Evidence on Hand

- Runnable React admin/moderator UI in `/web` (login, dashboards, events, students, sections, fines, attendance, scanner).
- Campus logo at `web/public/logo.png`.
- No DESIGN.md yet; visual identity lives in `web/src/index.css` and the login/shell screens.
- Do not invent testimonials, enrollment counts, or campus claims beyond what the UI already states.

## Product Principles

- Recover without shame: a broken link or crash should explain itself and offer a next step.
- Server truth wins: attendance state is authoritative on the server; the UI reports it, it does not invent it.
- Same voice everywhere: short, specific, campus-staff language.
- Role-aware wayfinding: send people back to the place their role actually uses.
- Do not fabricate proof, stats, or marketing claims.

## Accessibility & Inclusion

No product-specific standard was set beyond ordinary operable UI. Error copy must stay readable, not rely on color alone, and keep a visible primary action. Staff may use this on laptops at event tables and on smaller admin screens.
