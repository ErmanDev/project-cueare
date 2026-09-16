import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import fs from 'node:fs';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const webDir = path.join(rootDir, 'web');
const webDist = path.join(webDir, 'dist');
const serverPublic = path.join(rootDir, 'server/public');

const result = spawnSync('pnpm', ['run', 'build'], {
  cwd: webDir,
  stdio: 'inherit',
  shell: true,
});

if (result.status === 0 && fs.existsSync(webDist)) {
  fs.rmSync(serverPublic, { recursive: true, force: true });
  fs.cpSync(webDist, serverPublic, { recursive: true });
  console.log(`[build-web] Synced ${webDist} -> ${serverPublic}`);
}

process.exit(result.status ?? 1);
