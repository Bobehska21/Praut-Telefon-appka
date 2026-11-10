---
name: k8s-debug
description: Diagnoses a problem in a Kubernetes cluster without changing anything — crashing or pending pods, failed rollouts, failing probes, unreachable services, unhealthy database cluster. Use when something deployed is not working.
argument-hint: "[symptom] [optional: context / namespace]"
context: fork
agent: k8s-troubleshooter
---

# Diagnose

Symptom: **$ARGUMENTS**

- Current kube context: !`kubectl config current-context 2>/dev/null || echo "(none)"`
- Available contexts: !`kubectl config get-contexts -o name 2>/dev/null | tr '\n' ' ' || echo "(kubectl not installed)"`

1. Decide the context and namespace from the symptom text; fall back to the current context. State both before the first command, and pass `--context` on every command.
2. Follow your method: unhealthy objects → warning events → state-specific checks → networking → database cluster → what changed last (`helm history`, rollout history).
3. Read-only commands and the read-only `kubernetes` MCP tools only. No apply, delete, patch, scale, restart, exec or port-forward — even if it would be a quick fix. Do not read Secret values.

Return:
- **Root cause** with the quoted evidence (event or log line).
- **Confidence**: confirmed / likely / hypothesis — and what would confirm it.
- **Fix**: the exact command or file change, and who runs it (production: the human).
- **Prevention**: the probe, resource setting, chart change or CI check that would have caught it.
