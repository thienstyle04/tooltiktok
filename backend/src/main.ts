import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { getAppConfig } from './config';

export async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule);
  const { host, port } = getAppConfig();
  
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
