#!/usr/bin/env node
// PostToolUse(Edit|Write): formats the edited file with the project's own
// Prettier and ESLint (only if they are installed in node_modules).
import fs from 'node:fs';
import path from 'node:path';
import { readInput, projectDir, relPath, run, localBin, feedback, head } from './_lib.mjs';

const input = await readInput();
const root = projectDir(input);
const rel = relPath(input);
if (!rel || /(^|\/)(node_modules|dist|out|build|\.git)\//.test(rel)) process.exit(0);
const file = path.join(root, rel);
if (!fs.existsSync(file)) process.exit(0);
// Helm templates are Go templates, not YAML: Prettier would corrupt them
if (/(^|\/)templates\/.*\.(ya?ml|tpl)$/.test(rel)) process.exit(0);

const prettier = localBin(root, 'prettier');
if (prettier && /\.(m?[jt]sx?|cjs|json|jsonc|css|scss|less|html|vue|svelte|md|mdx|ya?ml)$/i.test(rel)) {
  run(prettier, ['--write', '--ignore-unknown', '--log-level', 'warn', file], { cwd: root, timeout: 30000 });
}

const eslint = localBin(root, 'eslint');
if (eslint && /\.(m?[jt]sx?|cjs|vue|svelte)$/i.test(rel)) {
  const res = run(eslint, ['--fix', '--no-warn-ignored', file], { cwd: root, timeout: 60000 });
  if (!res.ok && res.status === 1) feedback(`ESLint errors remain in ${rel} after --fix:\n${head(res.out, 40)}`);
}
