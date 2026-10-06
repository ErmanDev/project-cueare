# Database migration operations

The API uses ordered, checksummed PostgreSQL migrations. Application instances
verify schema state during production startup but never apply migrations there.

## Commands

Run from `apps/api`:

```powershell
bun run migrate:status
bun run migrate:verify
bun run migrate:up
```

- `migrate:status` is read-only and reports applied, pending, mismatched, and
  unknown migration versions.
- `migrate:verify` is read-only. It permits pending migrations but fails on an
  altered applied migration or a database version unknown to the current code.
- `migrate:up` takes a PostgreSQL advisory lock and applies pending migrations
  in order. Each migration and its `SchemaMigrations` record commit together.

## Production deployment order

```text
1. Take/verify the required backup or recovery point
2. bun run migrate:verify
3. bun run migrate:up (one deployment job)
4. Deploy or restart API instances
5. Check /api/v2/readiness and smoke-test critical commands
```

Set `APP_ENV=production` and `AUTO_MIGRATE=false`. Production configuration
rejects automatic migration application. Startup fails with an actionable
pending-migration error when the deployment job was skipped.

## Adding a migration

1. Add the next numbered file under `src/db/migrations`.
2. Export one `DatabaseMigration` with a strictly increasing version, stable
   snake-case name, checksum source URLs, and an idempotent `up` function.
3. Add it to `src/db/migrations/manifest.ts` in ascending order.
4. Prefer expand-and-contract changes compatible with both the previous and new
   application version during a rolling deployment.
5. Test fresh application, repeated application, failure rollback, and mixed
   old/new application behavior.

Applied migration files and their checksum sources are immutable. Never edit
`0001`, `schema-bootstrap.ts`, or `schema.ts`; create a new migration instead.

## Rollback policy

The runner intentionally has no automatic `down` command. Destructive reversal
is not assumed safe after new application versions have written data.

- Roll back application code only when the previous version is compatible with
  the expanded schema.
- Repair a schema using a reviewed forward migration.
- Restore PostgreSQL only when the incident plan explicitly accepts the data
  loss bounded by the recovery point objective.
- Contract/drop old columns in a later deployment after telemetry proves no
  supported application version uses them.

## Migration metadata

`ssc."SchemaMigrations"` records the version, name, SHA-256 checksum, applied
UTC timestamp, and execution duration. The checksum normalizes line endings so
Windows and Linux deployments calculate the same value.
