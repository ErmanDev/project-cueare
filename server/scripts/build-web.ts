import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const appDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../app');

const result = spawnSync('flutter', ['build', 'web', '--release', '--base-href', '/'], {
  cwd: appDir,
  stdio: 'inherit',
  shell: true,
});

process.exit(result.status ?? 1);
