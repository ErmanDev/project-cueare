import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import fs from 'node:fs';

const serverDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const rootDir = path.resolve(serverDir, '..');
const distIisDir = path.join(serverDir, 'dist-iis');

console.log('[build:iis] 1. Building web frontend...');
const webBuildResult = spawnSync('bun', ['run', 'build:web'], {
  cwd: serverDir,
  stdio: 'inherit',
  shell: true,
});

if (webBuildResult.status !== 0) {
  console.error('[build:iis] Web build failed!');
  process.exit(1);
}

console.log('[build:iis] 2. Preparing IIS deployment package directory at:', distIisDir);
fs.rmSync(distIisDir, { recursive: true, force: true });
fs.mkdirSync(distIisDir, { recursive: true });

// 1. Copy essential code directories
fs.cpSync(path.join(serverDir, 'public'), path.join(distIisDir, 'public'), { recursive: true });
fs.cpSync(path.join(serverDir, 'src'), path.join(distIisDir, 'src'), { recursive: true });

// 2. Copy only essential production scripts (filtering out debug/temp scripts)
const essentialScripts = [
  'ensure-database.ts',
  'seed-admin.ts',
  'seed-fine-templates.ts',
  'seed-acquaintance-event.ts',
  'seed-event-fine-rules.ts',
  'seed-sample.ts',
  'SSC_Attendance_Schema_PostgreSQL.sql',
  'migrate_schema.ts',
  'reseed-student-user-links.ts',
];

const destScriptsDir = path.join(distIisDir, 'scripts');
fs.mkdirSync(destScriptsDir, { recursive: true });
for (const scriptFile of essentialScripts) {
  const src = path.join(serverDir, 'scripts', scriptFile);
  if (fs.existsSync(src)) {
    fs.copyFileSync(src, path.join(destScriptsDir, scriptFile));
  }
}

// 3. Copy essential configuration files
const essentialFiles = [
  'web.config',
  'package.json',
  'bun.lock',
  'tsconfig.json',
  'jwt_secret.txt',
  '.env.example',
  'README.md',
];

const rootGuide = path.join(rootDir, 'DEPLOYMENT_GUIDE.md');
if (fs.existsSync(rootGuide)) {
  fs.copyFileSync(rootGuide, path.join(distIisDir, 'DEPLOYMENT_GUIDE.md'));
}

for (const file of essentialFiles) {
  const src = path.join(serverDir, file);
  const dest = path.join(distIisDir, file);
  if (fs.existsSync(src)) {
    fs.copyFileSync(src, dest);
  }
}

// 4. Copy or create .env file
const envSrc = path.join(serverDir, '.env');
const envDest = path.join(distIisDir, '.env');
if (fs.existsSync(envSrc)) {
  fs.copyFileSync(envSrc, envDest);
} else {
  const envExample = path.join(serverDir, '.env.example');
  if (fs.existsSync(envExample)) {
    fs.copyFileSync(envExample, envDest);
  }
}

// 5. Pre-create empty folders for logs and temp files
fs.mkdirSync(path.join(distIisDir, 'logs'), { recursive: true });
fs.mkdirSync(path.join(distIisDir, '.iis-tmp'), { recursive: true });

console.log(`\n✅ [build:iis] IIS Deployment package created successfully!`);
console.log(`📍 Folder location: ${distIisDir}`);
console.log(`📋 Copy the contents of 'server/dist-iis' directly to your IIS site folder.\n`);
