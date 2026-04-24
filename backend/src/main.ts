import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';

export async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule);
  const port = Number(process.env.PORT ?? 3000);
  
  app.use((_request: any, response: any, next: () => void) => {
    response.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    response.setHeader('Pragma', 'no-cache');
    response.setHeader('Expires', '0');
    next();
  });

  await app.listen(port, '127.0.0.1');
  console.log(`Dalat carousel tool ready: http://127.0.0.1:${port}/`);
}

if (require.main === module) {
  bootstrap().catch((error: unknown) => {
    console.error('Failed to start Nest application.', error);
    process.exitCode = 1;
  });
}
