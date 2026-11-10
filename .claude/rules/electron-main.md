---
paths:
  - "src/main/**"
  - "src/preload/**"
  - "src/shared/**"
  - "electron-builder.*"
  - "forge.config.*"
---

# Electron main / preload rules

- Every window: `contextIsolation: true`, `sandbox: true`, `nodeIntegration: false`, `webSecurity: true`. Never switch one off to make something work.
- Preload exposes named functions through `contextBridge.exposeInMainWorld`. Never expose `ipcRenderer`, `require`, `process` or a generic `invoke(channel, ...args)`.
- Each IPC channel has, in `src/shared/`: a channel constant, a request schema and a response schema. The handler parses the request with the schema first and rejects on failure.
- Handlers check `event.senderFrame` is an origin the app serves before acting.
- Use `ipcMain.handle` + `ipcRenderer.invoke`. No `sendSync`, no `@electron/remote`.
- Renderer-supplied paths, URLs and commands are untrusted: resolve and check paths stay inside an allowed directory; `shell.openExternal` only for allowlisted `https:`/`mailto:` URLs; never build shell commands from them (`execFile` with an argument array, not `exec`).
- `setWindowOpenHandler` returns `{ action: 'deny' }` by default; `will-navigate` blocks anything outside the app's origin.
- Secrets at rest go through `safeStorage`. Nothing secret in the renderer, in `localStorage`, or in the bundle.
- Blocking or CPU-heavy work runs in a `utilityProcess`/worker, not on the main thread.
- The desktop app talks to the backend API; it never opens a direct PostgreSQL connection.
- After changing anything here, have `electron-security-auditor` review the diff.
