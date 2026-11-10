---
name: feature
description: End-to-end workflow for implementing a feature or non-trivial change in this Electron + PostgreSQL + Kubernetes project — explore, plan, implement with the right specialist agents, test, validate, review.
argument-hint: "[what to build]"
disable-model-invocation: true
---

# Feature workflow

Build: **$ARGUMENTS**

Current state:
- Branch: !`git branch --show-current 2>/dev/null || echo "(not a git repo)"`
- Uncommitted: !`git status --short 2>/dev/null | head -20 || true`

Work through the phases in order. Do not skip the gates.

## 1. Understand
- Read `CLAUDE.md`, then the code the change touches. Find the existing pattern to extend.
- Classify what the change touches (this decides the agents and checks below):
  `main/preload/IPC` · `renderer` · `backend API` · `database schema` · `Helm/Kubernetes` · `packaging/release`
- If requirements are ambiguous in a way that changes the design, ask now — one round of questions, not a drip.

## 2. Plan
- If on `main`, create a branch `feat/<short-name>` first.
- Write a short plan: the contract changes (IPC schemas, API shapes, DB schema), the files per layer, the tests, the rollout order. For a schema change the order is always: backwards-compatible migration → code that uses it → (later release) cleanup.
- For anything beyond a small change, show the plan and wait for agreement.

## 3. Implement — contract first, then inside-out
Delegate each part to its specialist; run independent parts in parallel:

| Touches | Agent | Extra step |
|---|---|---|
| IPC / main / preload | `electron-architect` | — |
| Backend API | `backend-dev` | — |
| Database schema | design with `postgres-dba`, then run `/db-migrate` | `migration-reviewer` must approve |
| `deploy/` | `k8s-engineer` | must render for all three values files |
| Packaging / update | `release-engineer` | — |
| Unfamiliar library API | `docs-researcher` first | — |

Order: shared contracts (`src/shared/`) → migration → backend → main/preload → renderer → deploy config.

## 4. Test
`test-engineer` adds tests at the cheapest level that proves the behaviour: unit for logic and IPC schemas, integration against real PostgreSQL for queries, one end-to-end flow if a user-visible path changed. New tests must be seen failing before they pass.

## 5. Validate — gate
Run `/preflight`. Every check must pass. Fix failures at the cause; never skip a test, weaken an assertion or disable a rule to get green.

## 6. Review — gate
- Main/preload/IPC/packaging changed → `electron-security-auditor` on the diff.
- Then `/code-review` on the whole diff. Fix confirmed findings, re-run `/preflight`.

## 7. Report
Summarise: what was built, per layer; contract and schema changes; new env vars (confirm `.env.example` and Helm values updated); the real check results; what the reviewer found and how it was resolved; rollout notes (migration order, old-client compatibility).
Do **not** commit, push or deploy unless asked.
