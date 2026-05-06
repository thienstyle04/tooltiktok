import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { getAppConfig } from './config';

export async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule);
  const { host, port, frontendOrigin } = getAppConfig();
  const allowedCorsOrigins = getAllowedCorsOrigins(frontendOrigin);

  app.enableCors({
    origin: (origin: string | undefined, callback: (error: Error | null, allow?: boolean) => void) => {
      if (!origin || allowedCorsOrigins.has(origin) || isLocalDevOrigin(origin)) {
        callback(null, true);
        return;
      }
      callback(null, false);
    },
    methods: ['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  });
  
  app.use((request: any, response: any, next: () => void) => {
    const requestPath = String(request.path || request.url || '');
    const cacheableAsset = requestPath.startsWith('/assets/') || requestPath.startsWith('/fonts/');
    if (!cacheableAsset) {
      response.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
      response.setHeader('Pragma', 'no-cache');
      response.setHeader('Expires', '0');
    }
    next();
  });

  await app.listen(port, host);
  console.log(`Dalat carousel tool ready: http://${host}:${port}/`);
}

if (require.main === module) {
  bootstrap().catch((error: unknown) => {
    console.error('Failed to start Nest application.', error);
    process.exitCode = 1;
  });
}

function getAllowedCorsOrigins(frontendOrigin: string): Set<string> {
  const origins = new Set([frontendOrigin]);

  try {
    const url = new URL(frontendOrigin);
    origins.add(`http://127.0.0.1:${url.port}`);
    origins.add(`http://localhost:${url.port}`);
  } catch {
    // Keep the configured origin only.
  }

  return origins;
}

function isLocalDevOrigin(origin: string): boolean {
  try {
    const url = new URL(origin);
    return url.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(url.hostname);
  } catch {
    return false;
  }
}
