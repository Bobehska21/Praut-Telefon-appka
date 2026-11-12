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
| `PHOTO_DIR` | ./data/photos | local-disk photo storage (dev only, git-ignored) |
| `TRUST_PROXY` | false | set `true` behind an ingress so rate limits see client IPs |
| `SHUTDOWN_TIMEOUT_MS` | 20000 | keep below the pod termination grace period |
| `RATE_LIMIT_GLOBAL_PER_MIN` / `_REGISTER_PER_HOUR` / `_CHALLENGE_PER_MIN` / `_REPORT_PER_HOUR` / `_LOGIN_PER_MIN` | 300 / 20 / 20 / 10 / 10 | per client (IP, or token for authenticated routes) |
| `DEV_FAKE_MINUTES` | false | **development only.** `true` adds `POST /v1/dev/focus-minutes {minutes}` (grants focus minutes to the caller, to pass the 90-minute kill gate without waiting). The process refuses to start with it when `NODE_ENV=production`, logs a warning when enabled, and the route does not exist (404) when it is off |
| `PASSWORD_SCRYPT_LOG2N` | 15 | scrypt cost exponent for new password hashes (10-18; r=8, p=3). Raise it as hardware allows; old hashes are upgraded on login. Tests use 10 |
| `TEST_DATABASE_URL` | local compose DB | tests only |

## Accounts and passwords

Players sign up with a private username and a password (`POST /v1/auth/register`); there is no e-mail. Passwords are hashed with **scrypt** (`node:crypto`, per-user salt, parameters stored in the hash so the cost can be raised; N=2^15, r=8, p=3 by default) and live in the `accounts` table, never in `players`. Tokens are random, stored only as SHA-256 in `auth_tokens`, and revocable (logout, password change, a new login revokes the old ones).

Failed logins are throttled durably in PostgreSQL (exponential lock per username+IP and per username, capped at 5 minutes); the per-IP rate limits are in memory per replica. **Because there is no e-mail there is no password reset**: a forgotten password means a new account. Details: [`docs/multiplayer-api.md`](../docs/multiplayer-api.md).

## Shields

A player earns a shield (max 3, shown only to the owner) per focus session with 5 h of credited focus time; a shield absorbs one kill (no points, 10-minute immunity, not counted as a kill). Added by migrations `0003_shields` (expand) and `0004_shields_validate` (validate the constraints, drop the old one); both must be applied before the code that writes shield notifications. Rules and API: [`docs/multiplayer-api.md`](../docs/multiplayer-api.md). With `DEV_FAKE_MINUTES=true`, `POST /v1/dev/focus-minutes {minutes, creditSession: true}` fast-forwards session credit to test them.

## Operational notes

- Liveness `GET /healthz` has no dependencies; readiness `GET /readyz` checks the database and turns 503 while shutting down.
- SIGTERM stops accepting connections, lets in-flight requests finish (long polls end early), closes the pool and exits.
- `players.token_hash` is a legacy column (nullable since migration 0002, no longer read); a later release drops it.
- Stateless except for two things that must change before running more than one replica in production: photo storage (`PhotoStorage` has only a local-disk implementation, an S3 one is still to write) and the in-memory rate-limit counters (per replica; reports additionally have a durable per-reporter DB limit).
- Schema changes are made only through new migration files; migrations are reviewed by `migration-reviewer` before they are committed or applied anywhere.
