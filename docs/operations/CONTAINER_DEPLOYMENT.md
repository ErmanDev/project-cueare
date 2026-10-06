# Container deployment

The API image uses Bun 1.4.2, installs only locked production dependencies, and
runs as the unprivileged `bun` user. It contains the NestJS host, migration
runner, and current static web build. It does not contain secrets or test tools.

## Build

From the repository root:

```powershell
docker build --pull --file apps/api/Dockerfile `
  --build-arg RELEASE_VERSION=1.0.0 `
  --build-arg RELEASE_REVISION=<git-sha> `
  --build-arg RELEASE_SOURCE=<repository-url> `
  --tag ssc-attendance-api:1.0.0 .
```

## Local production-like topology

The Compose file is intentionally a **staging** topology. Its PostgreSQL traffic
stays on a private Docker network but does not use TLS, so it must not be treated
as the production database architecture.

```powershell
Copy-Item infrastructure/containers/staging.env.example infrastructure/containers/staging.env
docker compose --file infrastructure/containers/compose.staging.yml up --build
```

Change every placeholder secret first. Compose starts PostgreSQL, waits for it
to become healthy, runs migrations once, and only then starts the API. The API
is bound to `127.0.0.1:8080`; PostgreSQL is not published to the host.

The PostgreSQL 18 volume is mounted at `/var/lib/postgresql`, matching the
versioned data-directory layout introduced by the official PG18 image. Do not
change it back to the pre-18 `/var/lib/postgresql/data` mount.

## Production contract

- Inject secrets from the deployment platform; never bake or commit them.
- Use a least-privilege PostgreSQL role and `DATABASE_SSL_MODE=verify-full` with
  the trusted CA supplied by the platform.
- Run `bun run migrate:verify`, then `bun run migrate:up`, as one deployment job
  before updating API instances.
- Keep `APP_ENV=production` and `AUTO_MIGRATE=false` on every API instance.
- Route liveness to `/api/v2/health` and readiness to `/api/v2/readiness`.
- Terminate public TLS at the ingress and set `TRUST_PROXY_HOPS` to the exact
  number of trusted proxies.
- Provide immutable `RELEASE_VERSION` and `RELEASE_REVISION` values. They appear
  in startup logs and the v2 health payload.
- Scan the final immutable image, generate provenance/SBOM at publication, and
  deploy by digest rather than a mutable tag.

## Repository security settings

The CI workflow typechecks, exercises migrations against PostgreSQL 18, runs the
full API suite, builds the image, scans it with Trivy, and reviews dependency
changes on pull requests. Enable GitHub dependency graph/Dependabot alerts and
secret scanning in repository settings. Protect the default branch by requiring
all API CI checks and at least one review.
