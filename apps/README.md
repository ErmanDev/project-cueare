# Applications

- `api` — NestJS migration host, compatibility Express API, PostgreSQL access,
  real-time transports, and deployment packaging.
- `web` — React staff console for superadmins and moderators.
- `mobile` — Flutter client for Android, iOS, and Windows.

Applications are independently deployable and keep their native dependency
managers. Shared behavior crosses application boundaries through the HTTP and
WebSocket contracts, not through source imports.
