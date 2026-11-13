import { build } from 'esbuild';

await build({
  entryPoints: { main: 'src/main.ts', migrate: 'scripts/migrate.ts' },
  outdir: 'dist',
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node22',
  packages: 'external',
  sourcemap: true,
});
