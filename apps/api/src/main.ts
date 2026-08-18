import { existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestExpressApplication } from '@nestjs/platform-express';
import type { NextFunction, Request, Response } from 'express';
import './common/bigint-json';
import { AppModule } from './app.module';

function resolveWebDist(): string | null {
  const candidates = [
    join(process.cwd(), 'apps/web/dist'),
    join(process.cwd(), '../web/dist'),
    join(__dirname, '../../../web/dist'),
    join(__dirname, '../../web/dist'),
  ];
  for (const dir of candidates) {
    if (existsSync(join(dir, 'index.html'))) {
      return resolve(dir);
    }
  }
  return null;
}

function corsOrigins(config: ConfigService): string[] {
  const origins = [
    config.get<string>('CORS_ORIGIN'),
    process.env.RENDER_EXTERNAL_URL,
    'http://localhost:5173',
    'http://localhost:3000',
  ].filter((value): value is string => Boolean(value?.trim()));
  return [...new Set(origins)];
}

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  const config = app.get(ConfigService);

  app.enableCors({
    origin: corsOrigins(config),
    credentials: true,
  });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: true,
    }),
  );

  app.setGlobalPrefix('api');
  app.enableShutdownHooks();

  const webDist = resolveWebDist();
  if (process.env.NODE_ENV === 'production' && webDist) {
    app.useStaticAssets(webDist, { index: false });
    app.use((req: Request, res: Response, next: NextFunction) => {
      if (req.method !== 'GET' && req.method !== 'HEAD') {
        next();
        return;
      }
      if (req.path.startsWith('/api')) {
        next();
        return;
      }
      res.sendFile(join(webDist, 'index.html'));
    });
  } else if (process.env.NODE_ENV === 'production') {
    console.warn('SPA dist not found; serving API only');
  }

  const port = process.env.PORT ?? config.get<string>('API_PORT', '3000');
  await app.listen(port);
  console.log(`API listening on port ${port}`);
}

void bootstrap();
