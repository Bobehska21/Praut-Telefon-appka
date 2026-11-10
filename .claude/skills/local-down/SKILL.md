---
name: local-down
description: Tears down the local development environment — uninstalls releases from the kind cluster, or deletes the whole "dev" kind cluster including its database data.
argument-hint: "[releases | cluster]  (default: releases)"
disable-model-invocation: true
---

# Local environment down

Mode: **$ARGUMENTS** (empty = `releases`)

- kind clusters: !`kind get clusters 2>/dev/null | tr '\n' ' ' || echo "(kind not installed)"`
- Releases in kind-dev: !`helm list -A --kube-context kind-dev --short 2>/dev/null | tr '\n' ' ' || echo "(cluster not reachable)"`

Only the context **`kind-dev`** and the kind cluster named **`dev`**. If the target resolves to anything else, stop.

## `releases` (default) — keep the cluster, remove the app
1. List what will be removed (application releases; keep `cnpg` and the ingress controller).
2. `helm uninstall <release> -n <ns> --kube-context kind-dev` for each.
3. PostgreSQL data lives in PersistentVolumeClaims, which survive uninstall. Ask before deleting them: it destroys the local database.

## `cluster` — remove everything
1. Say plainly that this deletes the cluster and **all local database data**, and wait for confirmation.
2. `kind delete cluster --name dev`

## Report
What was removed and what remains (clusters, volumes, images).
