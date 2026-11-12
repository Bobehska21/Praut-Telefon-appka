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
| `RATE_LIMIT_GLOBAL_PER_MIN` / `_REGISTER_PER_HOUR` / `_CHALLENGE_PER_MIN` / `_REPORT_PER_HOUR` | 300 / 20 / 20 / 10 | per client (IP, or token for authenticated routes) |
| `TEST_DATABASE_URL` | local compose DB | tests only |

## Operational notes

- Liveness `GET /healthz` has no dependencies; readiness `GET /readyz` checks the database and turns 503 while shutting down.
- SIGTERM stops accepting connections, lets in-flight requests finish (long polls end early), closes the pool and exits.
- Stateless except for two things that must change before running more than one replica in production: photo storage (`PhotoStorage` has only a local-disk implementation, an S3 one is still to write) and the in-memory rate-limit counters (per replica; reports additionally have a durable per-reporter DB limit).
- Schema changes are made only through new migration files; migrations are reviewed by `migration-reviewer` before they are committed or applied anywhere.
