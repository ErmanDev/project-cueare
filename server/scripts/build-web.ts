import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const webDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../web');

const result = spawnSync('pnpm', ['run', 'build'], {
  cwd: webDir,
  stdio: 'inherit',
  shell: true,
});

process.exit(result.status ?? 1);
