---
name: electron-audit
description: Full security audit of the Electron application — window options, IPC surface, preload API, navigation, CSP, fuses, dependencies, packaging. Use before a release, after significant main/preload changes, or on request.
argument-hint: "[optional: 'diff' to audit only uncommitted and branch changes]"
context: fork
agent: electron-security-auditor
---

# Electron security audit

Scope: **$ARGUMENTS** (empty = whole application; `diff` = only what changed against `main`)

- Electron version: !`node -p "(()=>{try{const p=require('./package.json');return (p.devDependencies||{}).electron||(p.dependencies||{}).electron||'not found'}catch{return 'no package.json'}})()" 2>/dev/null || echo unknown`
- Changed files: !`git diff --name-only main...HEAD 2>/dev/null | head -40 || true`

## Procedure
1. **Map the attack surface.** Find every `new BrowserWindow`, `WebContentsView`, `<webview>`, every `ipcMain.handle`/`ipcMain.on`, every `contextBridge.exposeInMainWorld`, every `protocol.handle`/`registerSchemesAsPrivileged`, every `shell.openExternal`, `loadURL`/`loadFile`, and every `child_process`/`fs` call reachable from an IPC handler. List them with `file:line`.
2. **Walk your checklist** against that map — window options, IPC validation and sender checks, navigation and window-open handling, permissions, CSP, content loading, external links.
3. **Trace renderer input.** For each IPC handler follow the arguments to where they are used. Flag any path to the filesystem, a process, a URL load, SQL or `eval` without validation.
4. **Supply chain.** `npm audit --omit=dev` (report high/critical in shipped dependencies); check whether the Electron major version is still supported.
5. **Packaging.** Fuses configuration, asar integrity, entitlements, what gets bundled (no `.env`, no source maps with secrets, no dev tooling), update feed and signature verification.

Read-only: do not modify any file.

## Report
1. **Summary** — overall posture in two sentences and the count of findings per severity.
2. **Findings**, most severe first — severity, `file:line`, the defect, a concrete exploit scenario, the specific fix.
3. **Verified OK** — checklist items you confirmed in code.
4. **Not verified** — what you could not check and why.
