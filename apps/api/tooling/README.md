# API tooling archive

This directory contains historical, one-off database diagnostics that are not
part of the API build, test suite, migration system, or deployment package.

- `legacy-diagnostics/` contains old inspection and repair experiments. Review
  every query before running one against any database.
- `archive/` contains obsolete non-UTF-8 scripts retained only for historical
  reference. They are not supported executable tools.

Supported operational commands live in `scripts/` and are exposed through
`package.json`. Production schema changes must use `bun run migrate:up`; do not
promote a file from this directory into production automation.
