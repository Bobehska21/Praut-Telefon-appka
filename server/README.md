# Focus multiplayer server

Authoritative backend for the multiplayer part of the focus app: points, kills, proximity proof, nearby lookup, leaderboard, reports and moderation. Fastify + `pg` (no ORM) + zod + sharp, PostgreSQL 16. API reference: [`docs/multiplayer-api.md`](../docs/multiplayer-api.md).

## Quick start (local only)

```sh
cd server
npm install
docker compose up -d --wait        # postgres:16 as container `focus-pg` on localhost:5433, db `focus_dev`
export DATABASE_URL=postgresql://focus:<password>@localhost:5433/focus_dev   # see .env.example
export ADMIN_TOKEN=<at least 32 random characters>
npm run migrate                    # npm run migrate:down reverts the last migration
npm run dev                        # http://localhost:3000, GET /healthz, GET /readyz
```

The compose database is for local development only. Never point `DATABASE_URL` of these scripts at a shared environment; staging/production migrations run through the deployment pipeline.

## Scripts

| Script | What |
|---|---|
| `npm run dev` | run with reload (tsx) |
| `npm run build` / `npm start` | bundle to `dist/` (esbuild) / run it |
| `npm run migrate` / `migrate:down` | apply pending / revert last SQL migration in `migrations/` (`NNNN_name.up.sql` + `.down.sql`) |
| `npm test` | vitest against the real local Postgres; every test file creates and drops its own schema |
| `npm run typecheck` / `npm run lint` | `tsc --noEmit` / eslint |

Tests need `docker compose up -d --wait` first; they use `TEST_DATABASE_URL` (default: the compose database).

## Environment variables

Config comes from the environment only; the process exits at startup with a message if a required variable is missing or invalid. All are listed in the repository `.env.example`.

| Variable | Default | Notes |
|---|---|---|
| `DATABASE_URL` | required | PostgreSQL connection string (never logged) |
| `ADMIN_TOKEN` | required, >= 32 chars | bearer token for `/admin/*` |
| `PORT` / `HOST` | 3000 / 0.0.0.0 | |
| `LOG_LEVEL` | info | JSON logs to stdout with a request id; `Authorization` is redacted |
| `DB_POOL_MAX` | 10 | one pool per process; keep `replicas x DB_POOL_MAX` below the DB connection limit |
| `DB_STATEMENT_TIMEOUT_MS` | 5000 | applied to every connection |
| `LEADERBOARD_TZ` | Europe/Prague | day of the leaderboard |
| `PHOTO_STORAGE` | local | `local` or `s3`; production requires `s3` |
| `PHOTO_DIR` | ./data/photos | local-disk storage (development only) |
| `S3_ENDPOINT` | AWS regional endpoint | custom HTTP(S) origin; production requires HTTPS |
| `S3_REGION` / `S3_BUCKET` | us-east-1 / required with S3 | private general-purpose bucket; path-style requests |
| `S3_ACCESS_KEY_ID` / `S3_SECRET_ACCESS_KEY` | required with S3 | explicit credentials, injected from a Secret |
| `S3_SESSION_TOKEN` | unset | optional temporary credential token; rotation is external |
| `S3_PREFIX` / `S3_TIMEOUT_MS` | photos/ / 5000 | slash-terminated key prefix; request timeout 100–30000 ms |
| `RATE_LIMIT_STORE` | memory | `memory` for development or `postgres` for shared counters; production requires `postgres` |
| `TRUST_PROXY` | false | set `true` behind an ingress so rate limits see client IPs |
| `SHUTDOWN_TIMEOUT_MS` | 20000 | keep below the pod termination grace period |
| `RATE_LIMIT_GLOBAL_PER_MIN` / `_REGISTER_PER_HOUR` / `_CHALLENGE_PER_MIN` / `_REPORT_PER_HOUR` / `_LOGIN_PER_MIN` | 300 / 20 / 20 / 10 / 10 | per client (IP, or token for authenticated routes) |
| `DEV_FAKE_MINUTES` | false | **development only.** `true` adds `POST /v1/dev/focus-minutes {minutes}` (grants focus minutes to the caller, to pass the 90-minute kill gate without waiting). The process refuses to start with it when `NODE_ENV=production`, logs a warning when enabled, and the route does not exist (404) when it is off |
| `PASSWORD_SCRYPT_LOG2N` | 15 | scrypt cost exponent for new password hashes (10-18; r=8, p=3). Raise it as hardware allows; old hashes are upgraded on login. Tests use 10 |
| `TEST_DATABASE_URL` | local compose DB | tests only |

## Accounts and passwords

Players sign up with a private username and a password (`POST /v1/auth/register`); there is no e-mail. Passwords are hashed with **scrypt** (`node:crypto`, per-user salt, parameters stored in the hash so the cost can be raised; N=2^15, r=8, p=3 by default) and live in the `accounts` table, never in `players`. Tokens are random, stored only as SHA-256 in `auth_tokens`, and revocable (logout, password change, a new login revokes the old ones).

Failed logins are throttled durably in PostgreSQL (exponential lock per username+IP and per username, capped at 5 minutes); the request limits use the selected store (PostgreSQL in production, memory per replica in development). **Because there is no e-mail there is no password reset**: a forgotten password means a new account. Details: [`docs/multiplayer-api.md`](../docs/multiplayer-api.md).

## Shields

A player earns a shield (max 3, shown only to the owner) per focus session with 5 h of credited focus time; a shield absorbs one kill (no points, 10-minute immunity, not counted as a kill). Added by migrations `0003_shields` (expand) and `0004_shields_validate` (validate the constraints, drop the old one); both must be applied before the code that writes shield notifications. Rules and API: [`docs/multiplayer-api.md`](../docs/multiplayer-api.md). With `DEV_FAKE_MINUTES=true`, `POST /v1/dev/focus-minutes {minutes, creditSession: true}` fast-forwards session credit to test them.

## Operational notes

- Liveness `GET /healthz` has no dependencies; readiness `GET /readyz` checks the database and turns 503 while shutting down.
- SIGTERM stops accepting connections, lets in-flight requests finish (long polls end early), closes the pool and exits.
- `players.token_hash` is a legacy column (nullable since migration 0002, no longer read); a later release drops it.
- Production uses private S3 objects and PostgreSQL rate-limit counters across replicas. Each request consumes an atomic fixed-window counter, isolated by route and client; only a SHA-256 bucket identity is stored. Database failure returns 503 rather than bypassing limits. Expired rows are removed in batches of 1000 per replica each minute. Budget for one additional DB query per rate-limited request; this is intended for the current app scale, not an edge DDoS filter.
- The S3 adapter supports PUT/GET/DELETE with SigV4, an explicit region, path-style addressing and supplied credentials. It does not discover or refresh IAM role credentials, support directory buckets or follow regional redirects. Use the bucket's correct regional endpoint and rotate credentials externally. The bucket stays private; existing authenticated photo routes enforce visibility for both profile photos and report evidence. Grant GetObject, PutObject and DeleteObject on the prefix, and ListBucket scoped to the prefix so missing objects return 404 rather than 403. Block public access and configure encryption, retention and backups with the storage provider.
- Schema changes are made only through new migration files; migrations are reviewed by `migration-reviewer` before they are committed or applied anywhere.

## Container and Helm deployment

Build from the repository root:

```sh
docker build --platform linux/amd64 -f server/Dockerfile -t focus-server:step4 .
```

The image runs as UID/GID 10001, contains production dependencies and bundled server/migration entry points,
and works with a read-only root filesystem (only `/tmp` is writable). The base is `node:22-bookworm-slim`;
release builds can pin its digest using `--build-arg NODE_IMAGE=node:22-bookworm-slim@sha256:<approved-digest>`.
Run the server with `node dist/main.js` and migrations with `node dist/migrate.js` (add `down` for rollback).
Do not use `npm run migrate` inside the runtime image: it intentionally contains no TypeScript toolchain.

The chart in `deploy/helm/app` is configured for this server, with probes, resource limits, non-root security,
HPA/PDB support, a private S3 backend and shared PostgreSQL counters. It expects the CloudNativePG operator
or `database.existingSecret` (key `uri`). Provision an existing Secret named `focus-server` in the app namespace
with keys `admin-token`, `s3-bucket`, `s3-access-key-id`, `s3-secret-access-key`.
Override `env.S3_REGION` and optionally `env.S3_ENDPOINT` for the selected provider. Temporary credentials
also need `S3_SESSION_TOKEN` via `envFromSecrets`. Never put credentials into values files.

First installation runs migrations in init containers before API startup. On upgrades a pre-upgrade hook
applies them before replacing pods; init containers then do an idempotent check. PostgreSQL advisory locks
serialize migration runners. Migration 0011 creates only a new table and its index, so previous code can
continue serving. Rollback code before reverting 0011; its down migration drops only request counters.
Existing migrations 0009/0010 must precede moderation code. No deployment is performed by these instructions.

Before switching an existing installation from disk to S3, stop photo writes, copy **all** `*.jpg` files
(including `report-*.jpg`) from PHOTO_DIR to the configured bucket prefix with the same filenames, verify
counts/content, then switch all replicas. Retain the old directory until the new deployment is verified.
No database photo keys or mobile URLs need changing. For storage rollback, freeze writes and copy new
objects back before switching to local storage and a single replica in a development environment.

NetworkPolicy allows DNS, the managed database and outbound TCP 443 for object storage. Set
`networkPolicy.allowObjectStorageHttps=false` and supply provider-specific `extraEgress` rules to narrow it.
An external database requires its own egress rule; local HTTP object storage needs an explicit port rule.
`TRUST_PROXY` stays false by default: enable it only where the ingress strips client-supplied forwarding
headers and the app cannot be reached directly from untrusted clients. Configure real ingress hosts/TLS,
database backups and a tested restore before a production release; the example hostnames are placeholders.

CI now checks both packages, runs the server suite against PostgreSQL, builds the container, and validates
Helm manifests. The deployment workflow requires the `KUBE_CONTEXT` variable and `KUBECONFIG_B64` secret
in each GitHub Environment. Production remains behind its environment approval. It only deploys on main
or a manual workflow run; preparing these files does not deploy this working branch.

Local checks without PostgreSQL:

```sh
cd server
npm run lint
npm run typecheck
npm run build
npm test -- tests/config.test.ts tests/s3-storage.test.ts tests/rate-limit-store.test.ts
```

The complete `npm test` also covers concurrent shared limits across two app instances, expiry, bounded
cleanup and migration up/down/up using a real local test database. S3 unit tests exercise signed requests,
errors and size limits; verify PUT/GET/DELETE against the chosen private provider before deploying.
