---
name: incident
description: Read-only incident investigation — collects cluster state, database health and recent deployments into a timeline with ranked hypotheses and proposed mitigations for the human to execute. Use when production or staging is misbehaving.
argument-hint: "[what is wrong, where, since when]"
disable-model-invocation: true
---

# Incident investigation

Report: **$ARGUMENTS**

- Time now (UTC): !`date -u +%Y-%m-%dT%H:%M:%SZ`
- Current kube context: !`kubectl config current-context 2>/dev/null || echo "(none)"`

**You observe; the human acts.** Nothing in this workflow changes a cluster or a database. Mitigations are proposals with exact commands. Speed matters: report what you know early and refine.

## 1. Scope (one short round of questions only if essential)
Which environment and context, which service, what users see, when it started, what changed recently. State the context and namespace you will inspect; pass `--context` on every command.

## 2. Collect in parallel
- **Cluster** — `k8s-troubleshooter`: unhealthy workloads, warning events, restarts, OOM kills, node pressure, rollout state, ingress.
- **Database** — `postgres-dba` (read-only): connections vs limit, long-running and idle-in-transaction sessions, lock waits and blockers, replication lag, disk usage, recent slow queries; CloudNativePG cluster phase.
- **Changes** — yourself: `helm history <release>` for affected releases, `kubectl rollout history`, merged PRs and workflow runs in the window (`gh pr list --state merged`, `gh run list`), migrations shipped in the last release.
- **Application logs** — errors around the start time (`kubectl logs --since=... `, `stern`), grouped by message; first occurrence of each.

## 3. Timeline
A UTC table: time · event · source. Include the last deploy/config/migration before the first error. Mark what is observed versus inferred.

## 4. Hypotheses
Ranked list. For each: the evidence for and against, confidence, and the single cheapest check that would confirm or kill it. Prefer "what changed just before it broke".

## 5. Mitigation options
For each: the exact command, expected effect, risk, and how to undo it. Typical options — roll back the release (`helm rollback`), scale out, restart a stuck workload, terminate a blocking database session, disable a feature flag. Recommend one. **Do not run it**: on production the hooks block it, and the decision belongs to the human.

## 6. After mitigation
Verification steps to confirm recovery, and a draft post-incident note: impact, timeline, root cause, what detection or safeguard was missing, follow-up actions.
