---
name: local-up
description: Brings up the local development environment — a kind cluster named "dev" with ingress, the CloudNativePG operator, a PostgreSQL cluster, and the app's Helm chart built from the current source.
argument-hint: "[optional: service name]"
disable-model-invocation: true
---

# Local environment up

- Container runtime: !`docker info --format '{{.ServerVersion}}' 2>/dev/null || echo "NOT RUNNING"`
- kind clusters: !`kind get clusters 2>/dev/null | tr '\n' ' ' || echo "(kind not installed)"`
- Charts: !`ls -1 deploy/helm 2>/dev/null | tr '\n' ' ' || echo "(none)"`

Everything here targets the context **`kind-dev`** only. Pass `--context kind-dev` / `--kube-context kind-dev` on every command. Each step is idempotent: check first, skip what already exists.

## 0. Prerequisites
If the container runtime is not running or `kind`, `kubectl` or `helm` is missing, stop and say exactly what to start or install (`brew install kind kubectl helm`, start OrbStack). Do not install tools yourself.

## 1. Cluster
If there is no kind cluster named `dev`: `kind create cluster --name dev --config deploy/kind/cluster.yaml`, then wait: `kubectl wait --for=condition=Ready nodes --all --timeout=120s --context kind-dev`.

## 2. Ingress controller
If the `ingress-nginx` namespace is absent, install ingress-nginx with its kind-specific manifest or Helm chart (check the current install instructions with `docs-researcher` rather than guessing a URL), and wait for the controller pod to be Ready.

## 3. CloudNativePG operator
```
helm repo add cnpg https://cloudnative-pg.github.io/charts
helm upgrade --install cnpg cnpg/cloudnative-pg -n cnpg-system --create-namespace --wait --kube-context kind-dev
```

## 4. Build and load the image
For each service being deployed: `docker build -t <service>:dev <context-dir>` then `kind load docker-image <service>:dev --name dev`. (kind cannot pull local images; they must be loaded.)

## 5. Deploy the chart
```
helm upgrade --install <service> deploy/helm/<service> -n <service> --create-namespace \
  -f deploy/helm/<service>/values-dev.yaml --set image.tag=dev --rollback-on-failure --timeout 5m --kube-context kind-dev
```
The chart creates the PostgreSQL `Cluster`; the first start takes a minute or two.

## 6. Verify
- `kubectl get cluster,pods,svc,ingress -n <service> --context kind-dev` — database cluster healthy, pods Ready.
- Call the readiness endpoint through the ingress (host port from `deploy/kind/cluster.yaml`).
- If something is not healthy, run `/k8s-debug` instead of guessing.

## 7. Report
What was created vs already present, the URL of the API, and how to reach the database from the host for development: the command `kubectl port-forward svc/<service>-db-rw 5432:5432 -n <service> --context kind-dev` and the name of the Secret holding the credentials (do not print its contents).
