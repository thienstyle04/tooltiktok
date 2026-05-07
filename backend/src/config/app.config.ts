import * as fs from 'node:fs';
import * as path from 'node:path';

export interface AppConfig {
  host: string;
  port: number;
  frontendOrigin: string;
}

export function getAppConfig(): AppConfig {
  return {
    host: process.env.HOST || '127.0.0.1',
    port: Number(process.env.PORT ?? 3000),
    frontendOrigin: normalizeOrigin(process.env.FRONTEND_ORIGIN || 'http://127.0.0.1:3001'),
  };
}

function normalizeOrigin(origin: string): string {
  return origin.replace(/\/+$/, '');
}

export function resolveBackendRoot(startDir = __dirname): string {
  let currentDir = path.resolve(startDir);

  for (let depth = 0; depth < 8; depth += 1) {
    if (fs.existsSync(path.join(currentDir, 'package.json')) && fs.existsSync(path.join(currentDir, 'src'))) {
      return currentDir;
    }

    const parentDir = path.dirname(currentDir);
    if (parentDir === currentDir) break;
    currentDir = parentDir;
  }

  if (fs.existsSync(path.join(process.cwd(), 'package.json')) && fs.existsSync(path.join(process.cwd(), 'src'))) {
    return process.cwd();
  }

  return path.resolve(startDir, '../../');
}

export function resolveWorkspaceRoot(backendRoot = resolveBackendRoot()): string {
  return path.resolve(backendRoot, '..');
}

export function resolveBackendDataDir(backendRoot = resolveBackendRoot()): string {
  return path.join(backendRoot, 'data');
}

export function resolveBackendReportsDir(backendRoot = resolveBackendRoot()): string {
  return path.join(backendRoot, 'reports');
}
