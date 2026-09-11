import { randomUUID } from 'node:crypto';

const runtimeSessionId = String(process.env.DALAT_SESSION_ID || '').trim() || randomUUID();
const runtimeAppVersion = String(process.env.DALAT_APP_VERSION || process.env.npm_package_version || 'unknown').trim();

export function getRuntimeSession(): { sessionId: string; appVersion: string } {
  return {
    sessionId: runtimeSessionId,
    appVersion: runtimeAppVersion,
  };
}
