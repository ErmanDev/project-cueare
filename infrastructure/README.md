# Infrastructure

- `database` contains standalone database artifacts.
- `containers` contains a production-like local/staging topology. It gates API
  startup on a successful one-shot migration job and keeps PostgreSQL private.

Deployment manifests, observability configuration, and infrastructure-as-code
belong here when introduced. Runtime implementation remains within `apps/api`.
