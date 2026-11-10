---
paths:
  - "deploy/**"
  - "**/Dockerfile*"
  - "**/.dockerignore"
---

# Kubernetes / Helm / container rules

**Charts**
- New settings go in `values.yaml` with a comment and a safe default; override per environment only in `values-<env>.yaml`. No environment names hard-coded in templates.
- After any edit the chart must lint and render for all three values files (a hook checks this; fix what it reports).
- Images pinned by tag or digest, never `latest`. The tag comes from values so CI can set it.
- Every container: resource requests + memory limit, readiness and liveness probes, `runAsNonRoot`, `readOnlyRootFilesystem: true`, `allowPrivilegeEscalation: false`, `capabilities.drop: [ALL]`, `seccompProfile: RuntimeDefault`.
- Staging/prod: ≥ 2 replicas, a `PodDisruptionBudget`, topology spread. A default-deny `NetworkPolicy` with explicit allows.
- Use the helper templates for names and labels (`app.kubernetes.io/*`).

**Secrets**
- No plaintext `Secret` manifests and no secret values in any values file (a hook blocks this). Use an `existingSecret` reference or a SOPS-encrypted file in `deploy/secrets/*.enc.yaml`. Never decrypt production secrets.

**Commands**
- Always `--context` (kubectl) / `--kube-context` (helm), stated explicitly.
- Local cluster `kind-dev`: free to change. Any other cluster: show `helm diff upgrade` first and get confirmation. Production: read-only — hand over the command.
- Upgrades use `helm upgrade --install --rollback-on-failure --timeout 5m` so a failed rollout rolls back.

**Dockerfiles**
- Multi-stage build; final stage on a minimal pinned base, running as a non-root user; `npm ci --omit=dev`; no secrets in `ARG`/`ENV`/layers; a `.dockerignore` that excludes `.git`, `node_modules`, `.env*`.
- Images must build for the cluster's architecture (`--platform linux/amd64` when building on an Apple Silicon Mac for amd64 nodes).
