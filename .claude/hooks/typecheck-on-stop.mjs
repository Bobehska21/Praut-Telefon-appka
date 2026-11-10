#!/usr/bin/env node
// Stop: if TypeScript files changed, run `tsc --noEmit` before Claude finishes.
// On errors the stop is blocked once so Claude fixes them. Loop-safe:
// `stop_hook_active` means we already blocked this turn, so we let it end.
// Disable with CLAUDE_SKIP_TYPECHECK=1.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { readInput, projectDir, run, localBin, head } from './_lib.mjs';

const input = await readInput();
if (input.stop_hook_active || process.env.CLAUDE_SKIP_TYPECHECK === '1') process.exit(0);

const root = projectDir(input);
const tsc = localBin(root, 'tsc');
if (!tsc || !fs.existsSync(path.join(root, 'tsconfig.json'))) process.exit(0);

const status = run('git', ['status', '--porcelain', '--untracked-files=all'], { cwd: root });
if (!status.ok) process.exit(0);
const changed = status.out.split('\n').map((l) => l.slice(3)).filter((f) => /\.(m|c)?tsx?$/.test(f));
if (!changed.length) process.exit(0);

// skip when nothing changed since the last successful check
const fingerprint = crypto.createHash('sha1');
for (const f of changed) {
  try {
    const st = fs.statSync(path.join(root, f));
    fingerprint.update(`${f}:${st.mtimeMs}:${st.size};`);
  } catch {
    fingerprint.update(`${f}:deleted;`);
  }
}
const digest = fingerprint.digest('hex');
const stateFile = path.join(os.tmpdir(), `claude-typecheck-${crypto.createHash('sha1').update(root).digest('hex').slice(0, 12)}`);
try {
  if (fs.readFileSync(stateFile, 'utf8') === digest) process.exit(0);
} catch {
  /* first run */
}

const script = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8')).scripts?.typecheck;
const res = script ? run('npm', ['run', '--silent', 'typecheck'], { cwd: root, timeout: 180000 }) : run(tsc, ['--noEmit', '-p', root], { cwd: root, timeout: 180000 });

if (res.ok) {
  fs.writeFileSync(stateFile, digest);
  process.exit(0);
}
if (res.status === null) process.exit(0); // timed out: do not hold the session hostage

process.stdout.write(
  JSON.stringify({ decision: 'block', reason: `TypeScript errors after your changes — fix them before finishing:\n${head(res.out, 50)}` }),
);
