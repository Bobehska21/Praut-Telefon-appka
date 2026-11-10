---
name: preflight
description: Runs every local quality gate — lint, typecheck, unit tests, Helm chart lint and schema validation for all environments, config scan, secret scan — and reports a pass/fail table. Use before committing, before opening a PR, and before saying work is done.
argument-hint: "[--e2e to include end-to-end tests]"
allowed-tools: Bash(npm run *) Bash(npx tsc *) Bash(helm lint *) Bash(helm template *) Bash(kubeconform *) Bash(trivy config *) Bash(gitleaks *) Bash(hadolint *) Bash(git status *) Bash(git diff *)
---

# Preflight

Arguments: `$ARGUMENTS`

Run every check that applies and report facts. Run independent checks in parallel. A check whose tool or script does not exist is **SKIPPED** (say why), never silently dropped and never counted as passed.

## Checks

**Application** (only scripts that exist in `package.json`)
1. `npm run lint`
2. `npm run typecheck` (or `npx tsc --noEmit` when there is a `tsconfig.json` but no script)
3. `npm run test`
4. `npm run test:e2e` — only when the arguments contain `--e2e`

**Kubernetes** — for every chart directory under `deploy/helm/` and every `values-*.yaml` in it:
5. `helm lint <chart> -f <chart>/values-<env>.yaml --set image.tag=0.0.0-validate`
6. `helm template release <chart> -f <chart>/values-<env>.yaml --set image.tag=0.0.0-validate | kubeconform -strict -ignore-missing-schemas -summary`
   (`image.tag` is set by CI at deploy time; the placeholder only satisfies the chart's "tag required" check)
7. `trivy config <chart> --helm-values <chart>/values-<env>.yaml --helm-set image.tag=0.0.0-validate --severity HIGH,CRITICAL --exit-code 1` (misconfiguration scan; without `--helm-set image.tag` the chart does not render and trivy silently scans nothing — a table of `-` means NOT scanned, report it as FAIL)

**Containers**
8. `hadolint <file>` for each Dockerfile

**Secrets**
9. `gitleaks detect --no-git --redact --no-banner --source .` for the working tree
10. `git status --short` — flag any `.env`, key, certificate or decrypted-secret file that is untracked-but-not-ignored or staged

## Report
A table: check · result (PASS / FAIL / SKIPPED) · detail (counts, or the first lines of the failure).
Then, for each FAIL, the relevant output and what you believe the cause is.
End with one line: **PREFLIGHT PASSED** or **PREFLIGHT FAILED (n checks)**.

Do not fix anything as part of this command unless asked — it is a measurement. Never mark a failing check as passed, and never edit tests, lint config or chart validation settings to make a check pass.
