# Event contributions

Primary target: apps/web/src/pages/admin/EventContributions.tsx
Mode: Operate. Local extension of the existing event staff console; preserve DESIGN.md, source fonts, navy palette, existing shell, cards, forms, modal and table conventions.

## Direction contract

- Job: SSC officers define monetary event contributions, assign the active roster or selected students, record installments, and inspect student balances and payment history.
- Hierarchy: event title and create action, compact collection totals, contribution definitions, searchable student balances, contextual payment history.
- Interaction: default amounts remain visible; assignments copy amounts; payment form names the student and remaining balance; receipt references survive retries; destructive corrections require a reason; loading, empty, error, busy and cancelled states are explicit.
- Responsive: same staff shell; table data keeps readable column widths and scrolls horizontally inside its region; mobile forms stay operable and totals stack.
- Scope: no identity redesign or raster assets; no attendance or fine behavior changes; no student mobile UI. Built in code from the existing interface without an approved image comp.

Acceptance: complete backend and web workflow, role protection, exact monetary comparisons, concurrent payment safety, preserved void history, cross-event ownership, new versioned migration, focused integration tests and browser interaction proof.

## Finish verification

191 API tests passed with PostgreSQL integration enabled. API typecheck and production web build passed. Web lint passed with existing warnings elsewhere. Browser verified selected student assignment, installment payment balance/history, focused history navigation and restored trigger focus. Desktop/mobile and correction screenshots: docs/contributions-preview/. Independent finish reviewer scored all three requested fixes resolved and returned ship for that fix list. Existing DESIGN.md is retained for this local extension.
