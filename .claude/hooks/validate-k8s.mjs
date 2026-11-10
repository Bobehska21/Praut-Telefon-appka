#!/usr/bin/env node
// PostToolUse(Edit|Write): validates Kubernetes manifests right after they change.
// - file inside a Helm chart  -> helm lint + helm template | kubeconform (per values file)
// - plain manifest under deploy/ -> kubeconform
// Missing tools are skipped silently (SessionStart already reports them).
import fs from 'node:fs';
import path from 'node:path';
import { readInput, projectDir, relPath, run, feedback, head } from './_lib.mjs';

const input = await readInput();
const root = projectDir(input);
const rel = relPath(input);
if (!rel.startsWith('deploy/') || !/\.(ya?ml|tpl|json)$/.test(rel)) process.exit(0);
if (/(^|\/)(secrets)\//.test(rel) || /\.enc\.ya?ml$/.test(rel) || /deploy\/kind\//.test(rel)) process.exit(0);

const KUBECONFORM = ['-strict', '-ignore-missing-schemas', '-summary', '-schema-location', 'default', '-schema-location',
  'https://raw.githubusercontent.com/datreeio/CRDs-catalog/main/{{.Group}}/{{.ResourceKind}}_{{.ResourceAPIVersion}}.json'];

function chartRoot(file) {
  for (let dir = path.dirname(file); dir.startsWith(root) && dir !== root; dir = path.dirname(dir)) {
    if (fs.existsSync(path.join(dir, 'Chart.yaml'))) return dir;
  }
  return null;
}

const problems = [];
const abs = path.join(root, rel);
const chart = chartRoot(abs);

if (chart) {
  const chartRel = path.relative(root, chart);
  const valueFiles = fs.readdirSync(chart).filter((f) => /^values-.*\.ya?ml$/.test(f));
  // image.tag is supplied by CI at deploy time; give validation a placeholder
  const TAG = ['--set', 'image.tag=0.0.0-validate'];
  const variants = valueFiles.length ? valueFiles.map((f) => ['-f', path.join(chart, f), ...TAG]) : [TAG];
  for (const extra of variants) {
    const label = extra[0] === '-f' ? ` (${path.basename(extra[1])})` : '';
    const lint = run('helm', ['lint', chart, ...extra, '--quiet'], { cwd: root });
    if (lint.missing) break;
    if (!lint.ok) { problems.push(`helm lint ${chartRel}${label}:\n${head(lint.out, 30)}`); continue; }
    const tpl = run('helm', ['template', 'release', chart, ...extra], { cwd: root });
    if (!tpl.ok) { problems.push(`helm template ${chartRel}${label}:\n${head(tpl.out, 30)}`); continue; }
    const conform = run('kubeconform', KUBECONFORM, { cwd: root, input: tpl.out });
    if (!conform.missing && !conform.ok) problems.push(`kubeconform ${chartRel}${label}:\n${head(conform.out, 30)}`);
  }
} else if (/\.ya?ml$/.test(rel) && fs.existsSync(abs) && /^kind:/m.test(fs.readFileSync(abs, 'utf8'))) {
  const conform = run('kubeconform', [...KUBECONFORM, abs], { cwd: root });
  if (!conform.missing && !conform.ok) problems.push(`kubeconform ${rel}:\n${head(conform.out, 30)}`);
}

if (problems.length) feedback(`Kubernetes validation failed after editing ${rel}. Fix before continuing:\n\n${problems.join('\n\n')}`);
