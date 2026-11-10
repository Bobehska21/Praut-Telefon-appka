// Shared helpers for the project hooks. No dependencies; self-contained so the
// template works on any machine that has Node.
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

export async function readInput() {
  let data = '';
  for await (const chunk of process.stdin) data += chunk;
  try {
    return JSON.parse(data || '{}');
  } catch {
    return {};
  }
}

export const projectDir = (input) => process.env.CLAUDE_PROJECT_DIR ?? input?.cwd ?? process.cwd();

/** Path of the edited file, relative to the project root ('' when outside it). */
export function relPath(input) {
  const file = input?.tool_input?.file_path ?? input?.tool_input?.notebook_path;
  if (!file) return '';
  const rel = path.relative(projectDir(input), path.resolve(projectDir(input), file));
  return rel.startsWith('..') ? '' : rel.split(path.sep).join('/');
}

export function run(cmd, args, opts = {}) {
  const res = spawnSync(cmd, args, { encoding: 'utf8', timeout: 120000, maxBuffer: 32 * 1024 * 1024, ...opts });
  return { ok: !res.error && res.status === 0, missing: res.error?.code === 'ENOENT', out: `${res.stdout ?? ''}${res.stderr ?? ''}`.trim(), status: res.status };
}

export const localBin = (root, name) => {
  const p = path.join(root, 'node_modules', '.bin', name);
  return fs.existsSync(p) ? p : null;
};

export function denyPreToolUse(reason) {
  process.stdout.write(JSON.stringify({ hookSpecificOutput: { hookEventName: 'PreToolUse', permissionDecision: 'deny', permissionDecisionReason: reason } }));
  process.exit(0);
}

/** PostToolUse feedback: exit 2 shows stderr to Claude so it can fix the problem. */
export function feedback(message) {
  process.stderr.write(`${message}\n`);
  process.exit(2);
}

export const tail = (text, lines = 40) => text.split('\n').slice(-lines).join('\n');
export const head = (text, lines = 40) => text.split('\n').slice(0, lines).join('\n');
