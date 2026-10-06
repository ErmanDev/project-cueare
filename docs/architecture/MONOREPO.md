# Monorepo boundaries

The broader engineering requirements are defined in
[`ENTERPRISE_GRADE_GUIDE.md`](ENTERPRISE_GRADE_GUIDE.md).

## Applications

`apps/api`, `apps/web`, and `apps/mobile` are deployable applications. They may
depend on generated packages, but must not import source files from one another.

## Feature ownership

Use the same business vocabulary across applications: `auth`, `attendance`,
`events`, `students`, `moderators`, `fines`, and `reporting`.

The API uses feature modules under `apps/api/src/nest/modules`. Large modules may
split into `api`, `application`, `domain`, and `infrastructure`; small modules
should remain shallow.

The React and Flutter applications should colocate feature-specific UI, state,
API access, and tests under their respective feature folders. Generic shared
folders are reserved for code with multiple real consumers.

## Shared contracts

`packages` is reserved for generated API contracts and genuinely reusable build
configuration. TypeScript models are not copied into Flutter; future clients
should be generated from the API's OpenAPI document.

## Transitional code

Express compatibility remains isolated under `apps/api/src/legacy` until every
route has a Nest owner and contract tests pass. Removing compatibility code is
a separate, explicit migration stage.

The Nest migration host is the default runtime. Native ownership currently
covers health and auth (`login`, `me`, and student password changes), including
all published unversioned and versioned aliases. Native `/api/v2` also owns the
authenticated student profile, event, fine, and attendance read models. The
native attendance module also owns additive v2 scan preview and confirmation at
`/api/v2/attendance/scan/*`. The Express-only entrypoint is retained as
`bun run start:legacy` for rollback, and the legacy moderator scan routes remain
available until their consumers migrate.

New consumers should use the additive `/api/v2` response contract documented in
[`API_RESPONSE_FORMAT.md`](API_RESPONSE_FORMAT.md). Legacy aliases are not
wrapped until their web and mobile readers migrate.
