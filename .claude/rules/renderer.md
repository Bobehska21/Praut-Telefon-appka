---
paths:
  - "src/renderer/**"
---

# Renderer rules

- The renderer is an untrusted web page. No Node or Electron imports (`fs`, `path`, `child_process`, `electron`); everything privileged goes through the typed API that preload exposes on `window`.
- Need a new capability? Add an IPC channel (contract in `src/shared/`, handler in main, function in preload) — do not widen an existing one into a generic passthrough.
- No `eval`, `new Function`, inline event-handler strings, or `dangerouslySetInnerHTML`/`innerHTML` with data that is not sanitized. The CSP forbids `unsafe-eval` and inline scripts; do not relax it.
- Never load remote scripts or styles; bundle dependencies.
- Validate and handle errors from every `window.<api>` call: the main process may reject the request.
- No tokens or secrets in renderer state, `localStorage` or logs.
- Interactive elements get an accessible role/name and a `data-testid` where end-to-end tests need a stable handle.
