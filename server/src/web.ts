import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import type { Express, RequestHandler } from 'express';
import express from 'express';

const serverRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const API_PREFIXES = [
  '/api',
  '/docs',
  '/openapi.json',
  '/health',
  '/auth',
  '/admin',
  '/moderator',
  '/student',
];

export function resolveWebDist(): string | null {
  const env = process.env.WEB_DIST?.trim();
  const candidates = [env, path.join(serverRoot, 'public'), path.resolve(serverRoot, '../app/build/web')].filter(
    (d): d is string => Boolean(d),
  );
  for (const dir of candidates) {
    if (fs.existsSync(path.join(dir, 'index.html'))) return dir;
  }
  return null;
}

function isApiPath(pathname: string): boolean {
  return API_PREFIXES.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}

/** Serve the Flutter web build at `/` when `app/build/web` exists. */
export function mountFlutterWeb(app: Express, webDir: string): void {
  app.use(express.static(webDir, { index: 'index.html', fallthrough: true }));
  const fallback: RequestHandler = (req, res, next) => {
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      next();
      return;
    }
    if (isApiPath(req.path)) {
      next();
      return;
    }
    res.sendFile(path.join(webDir, 'index.html'));
  };
  app.use(fallback);
}
