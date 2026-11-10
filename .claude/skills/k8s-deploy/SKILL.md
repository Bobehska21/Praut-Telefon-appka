---
name: k8s-deploy
description: Deploys a Helm release to an environment with a diff-first, confirm, atomic-upgrade, verify sequence. For production it only prepares the diff and the command for the human to run.
argument-hint: "[dev|staging|prod] [service]"
disable-model-invocation: true
---

# Deploy

Request: **$ARGUMENTS** (environment, then optional service name; default service = the only chart under `deploy/helm/`)

- Current kube context: !`kubectl config current-context 2>/dev/null || echo "(none)"`
- Available contexts: !`kubectl config get-contexts -o name 2>/dev/null | tr '\n' ' ' || echo "(kubectl not installed)"`
- Charts: !`ls -1 deploy/helm 2>/dev/null | tr '\n' ' ' || echo "(none)"`
- Git: !`git status --short 2>/dev/null | wc -l | tr -d ' '` uncommitted file(s) on !`git branch --show-current 2>/dev/null || echo "?"`

## 1. Resolve the target — and say it out loud
Map the environment to a kube context using the table in `CLAUDE.md` and `.claude/environments.json`:
- `dev` → `kind-dev`
- `staging`, `prod` → the context listed in `CLAUDE.md`. If it is still `TODO` or does not exist in the available contexts, **stop and ask**. Never guess a context.

Print: environment, context, namespace, release name, chart path, values file, image tag. Every command below passes `--kube-context <context>` explicitly; never rely on the current context and never switch it.

## 2. Pre-checks
- Chart lints and renders with the target values file (`helm lint`, `helm template ... | kubeconform -strict -ignore-missing-schemas`).
- The image tag exists: for `dev`, built and loaded into kind (`kind load docker-image <image> --name dev`); otherwise present in the registry.
- For `staging`/`prod`: the working tree is clean and the commit is pushed. Deploying unreviewed local changes to a shared cluster is not allowed.
- If the release includes migrations, confirm they were reviewed and are backwards compatible with the version currently running (`helm get values` / current image tag).

## 3. Diff
`helm diff upgrade <release> <chart> -n <ns> -f <values> --set image.tag=<tag> --kube-context <context>`
(If the helm-diff plugin is missing: `helm template` piped to `kubectl diff -f - --context <context>`.)
Summarise the diff in plain language: what gets created, changed, deleted; anything that restarts pods or touches the database, PVCs, Ingress or NetworkPolicy.

## 4. Apply — depends on the environment
- **dev (`kind-dev`)**: proceed.
- **staging / other shared cluster**: show the summary and the exact command, and wait for an explicit "yes".
- **prod**: **do not run it.** Production is read-only for you and the guard hook will block it. Output the diff summary, the exact command, and the verification and rollback commands, for the human to run. Stop here.

Command:
`helm upgrade --install <release> <chart> -n <ns> --create-namespace -f <values> --set image.tag=<tag> --rollback-on-failure --timeout 5m --kube-context <context>`

## 5. Verify
- `kubectl rollout status deploy/<name> -n <ns> --context <context> --timeout=180s`
- Pods Ready with zero unexpected restarts; no Warning events since the upgrade.
- Smoke test: the readiness endpoint through the Service or Ingress.
- If anything is wrong, run `/k8s-debug` — do not improvise fixes on the cluster.

## 6. Report
Environment and context, release revision before → after (`helm history`), image tag, the verification results, and the rollback command: `helm rollback <release> <previous-revision> -n <ns> --kube-context <context>`.
