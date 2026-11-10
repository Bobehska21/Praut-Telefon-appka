---
paths:
  - ".github/workflows/**"
  - ".github/actions/**"
---

# CI workflow rules

- Top-level `permissions: contents: read`; grant more per job only where needed (`id-token: write` for OIDC, `contents: write` for releases, `packages: write` for image push).
- Third-party actions are pinned to a full commit SHA with the version in a trailing comment (run `pinact run` to pin). First-party `actions/*` may use a major tag.
- Secrets only through `${{ secrets.* }}` at the step that needs them; never `echo` them, never pass them on a command line, never expose them to `pull_request` runs from forks.
- Never interpolate untrusted values (`github.event.*.title`, branch names, PR bodies) directly into `run:` — pass them through `env:` and quote.
- `concurrency` group per workflow + ref, cancelling superseded runs (not for deploy or release jobs).
- Use `npm ci`, cache via `actions/setup-node`, and set `timeout-minutes` on every job.
- Deployments: staging on merge to `main`; production only through a GitHub Environment with required reviewers. Prefer OIDC to long-lived cloud or cluster credentials.
- Signing certificates and notarization credentials are used only in the release workflow, on tag builds from `main`.
