import request, { Response } from 'supertest';
import type { INestApplication } from '@nestjs/common';
import type { App } from 'supertest/types';

export function cookieHeader(res: Response): string {
  const values = res.headers['set-cookie'];
  if (Array.isArray(values)) return values.join('; ');
  return values ?? '';
}

export function accessTokenFrom(res: Response): string {
  const raw = cookieHeader(res);
  const match = raw
    .split(';')
    .map((part) => part.trim())
    .find((part) => part.startsWith('access_token='));
  if (!match) {
    throw new Error('Cookie access_token ausente');
  }
  return decodeURIComponent(match.slice('access_token='.length));
}

export async function tokenFor(
  app: INestApplication<App>,
  credentials: { email: string; password: string },
): Promise<string> {
  const res: Response = await request(app.getHttpServer())
    .post('/auth/login')
    .send(credentials)
    .expect(200);
  return accessTokenFrom(res);
}
