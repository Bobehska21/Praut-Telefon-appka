# Project guide

> Template: replace the `TODO` markers when you apply this to a real app. Keep this file short — details live in `.claude/rules/` (loaded per path) and `docs/`.

## What this is
TODO one paragraph: what the app does and for whom.

Electron desktop client + backend API on PostgreSQL, deployed to Kubernetes with Helm.

## Layout
| Path | Contents |
|---|---|
| `src/main/` | Electron main process (Node, privileged) |
| `src/preload/` | Preload scripts — the only bridge (`contextBridge`) |
| `src/renderer/` | UI (untrusted, no Node access) |
| `src/shared/` | Types and IPC contracts shared by all three |
| `server/` | Backend API service |
| `server/migrations/` | SQL migrations (immutable once on `main`) |
| `deploy/helm/<service>/` | Helm chart per service, `values-{dev,staging,prod}.yaml` |
| `deploy/kind/` | Local cluster definition |
| `deploy/secrets/` | SOPS-encrypted secrets (`*.enc.yaml`) |

## Commands
| Task | Command |
|---|---|
| Dev (Electron) | `npm run dev` |
| Lint / types / unit | `npm run lint` · `npm run typecheck` · `npm run test` |
| E2E (Playwright + Electron) | `npm run test:e2e` |
| Package the app | `npm run build` |
| New migration | TODO e.g. `npm run db:new -- <name>` |
| Apply migrations locally | TODO e.g. `npm run db:migrate` |
| Local cluster up / down | `/local-up` · `/local-down` |

## Environments
| Name | Kube context | Database | Claude may |
|---|---|---|---|
| local | `kind-dev` | `localhost` | change freely |
| staging | TODO | TODO | change after confirmation |
| production | TODO | TODO | **read only** |

List the real context names and DB hosts in `.claude/environments.json` — the guard hooks classify by those patterns.

## Workflows (slash commands)
`/feature` · `/preflight` · `/db-migrate` · `/db-inspect` · `/k8s-deploy` · `/k8s-debug` · `/local-up` · `/local-down` · `/electron-audit` · `/release` · `/incident` — see `docs/workflow.md`.

## Agents — delegate when the work matches
- Process/IPC design → `electron-architect`; security review of Electron code → `electron-security-auditor`
- API work → `backend-dev`; schema/query design → `postgres-dba`; **every** new migration → `migration-reviewer`
- Charts/manifests → `k8s-engineer`; anything broken in a cluster → `k8s-troubleshooter`
- Packaging/signing/updates → `release-engineer`; tests → `test-engineer`; unfamiliar library APIs → `docs-researcher`

## Definition of done
1. `/preflight` passes (lint, types, tests, chart validation, secret scan) — report real output.
2. New behaviour has tests; IPC channels have schema validation on the main side.
3. Schema changes ship as a new, reviewed, backwards-compatible migration.
4. Chart changes render for all three values files.
5. New config is documented in `.env.example`; no secrets in the diff.

## Hard rules
- Production is read-only for you. Prepare the command or PR; the human runs it.
- Always pass `--context` / `--kube-context` explicitly.
- Never weaken Electron security defaults (`contextIsolation`, `sandbox`, `nodeIntegration: false`, `webSecurity`) to make something work.
- Never edit an applied migration, a lockfile, or anything under `deploy/secrets/` by hand.
