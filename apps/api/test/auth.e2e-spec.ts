import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import request, { Response } from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from './../src/app.module';
import { accessTokenFrom, cookieHeader, tokenFor as loginToken } from './auth-token';

interface LoginUser {
  id: string;
  name: string;
  email: string;
  role: string;
  avatar: string | null;
}

interface LoginResponse {
  user: LoginUser;
  token?: string;
}

interface MeResponse {
  id: string;
  name: string;
  email: string;
  role: string;
  avatar: string | null;
}

describe('AuthModule (e2e)', () => {
  let app: INestApplication<App>;

  const organizer = {
    email: 'org@eventos.local',
    password: 'secret123',
  };

  const client = {
    email: 'cliente1@eventos.local',
    password: 'secret123',
  };

  const gate = {
    email: 'gate@eventos.local',
    password: 'secret123',
  };

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        transform: true,
        forbidNonWhitelisted: true,
      }),
    );
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  async function login(credentials: {
    email: string;
    password: string;
  }): Promise<LoginUser> {
    const res: Response = await request(app.getHttpServer())
      .post('/auth/login')
      .send(credentials)
      .expect(200);

    const body = res.body as LoginResponse;
    return body.user;
  }

  async function tokenFor(credentials: {
    email: string;
    password: string;
  }): Promise<string> {
    return loginToken(app, credentials);
  }

  describe('POST /auth/login', () => {
    it('sets an httpOnly access_token cookie and returns the user without a JWT body', async () => {
      const res: Response = await request(app.getHttpServer())
        .post('/auth/login')
        .send(organizer)
        .expect(200);

      const body = res.body as LoginResponse;
      expect(body.token).toBeUndefined();
      expect(body.user).toMatchObject({
        email: organizer.email,
        name: 'Organizador Demo',
        role: 'ORGANIZER',
      });
      expect(typeof body.user.id).toBe('string');
      expect(body.user).not.toHaveProperty('passwordHash');
      expect(typeof accessTokenFrom(res)).toBe('string');
    });

    it('sets an httpOnly access_token cookie on success', async () => {
      const res: Response = await request(app.getHttpServer())
        .post('/auth/login')
        .send(client)
        .expect(200);

      const setCookie = cookieHeader(res);
      expect(setCookie).toContain('access_token=');
      expect(setCookie).toMatch(/HttpOnly/i);
      expect(setCookie).toMatch(/SameSite/i);
    });

    it('returns a CLIENT user for a client account', async () => {
      const res: Response = await request(app.getHttpServer())
        .post('/auth/login')
        .send(client)
        .expect(200);

      const body = res.body as LoginResponse;
      expect(body.user).toMatchObject({
        email: client.email,
        name: 'Cliente Um',
        role: 'CLIENT',
      });
    });

    it('returns a GATE user for a gate account', async () => {
      const res: Response = await request(app.getHttpServer())
        .post('/auth/login')
        .send(gate)
        .expect(200);

      const body = res.body as LoginResponse;
      expect(body.user).toMatchObject({
        email: gate.email,
        name: 'Portaria Demo',
        role: 'GATE',
      });
    });

    it('rejects wrong password with 401', async () => {
      await request(app.getHttpServer())
        .post('/auth/login')
        .send({ ...organizer, password: 'wrong-password' })
        .expect(401);
    });

    it('rejects unknown email with 401', async () => {
      await request(app.getHttpServer())
        .post('/auth/login')
        .send({ email: 'ghost@eventos.local', password: 'secret123' })
        .expect(401);
    });

    it('rejects a malformed body with 400', async () => {
      await request(app.getHttpServer())
        .post('/auth/login')
        .send({ email: 'not-an-email', password: 'x' })
        .expect(400);
    });
  });

  describe('POST /auth/logout', () => {
    it('clears the access_token cookie', async () => {
      await request(app.getHttpServer())
        .post('/auth/login')
        .send(client)
        .expect(200);

      const res: Response = await request(app.getHttpServer())
        .post('/auth/logout')
        .expect(200);

      expect(res.body).toEqual({ ok: true });
      const setCookie = cookieHeader(res);
      expect(setCookie).toContain('access_token=');
      expect(setCookie).toMatch(/Expires=Thu, 01 Jan 1970 00:00:00 GMT/i);
    });
  });

  describe('GET /auth/me', () => {
    it('returns the authenticated user via the access_token cookie', async () => {
      const loginRes: Response = await request(app.getHttpServer())
        .post('/auth/login')
        .send(client)
        .expect(200);

      const cookies = cookieHeader(loginRes)
        .split(';')
        .map((part) => part.trim())
        .filter((part) => part.startsWith('access_token='))
        .join('; ');

      const me = await request(app.getHttpServer())
        .get('/auth/me')
        .set('Cookie', cookies)
        .expect(200);

      const meBody = me.body as MeResponse;
      expect(meBody).toMatchObject({
        email: client.email,
        role: 'CLIENT',
      });
      expect(meBody).not.toHaveProperty('passwordHash');
    });

    it('returns the authenticated user via a Bearer token', async () => {
      const me = await request(app.getHttpServer())
        .get('/auth/me')
        .set('Authorization', `Bearer ${await tokenFor(client)}`)
        .expect(200);

      const meBody = me.body as MeResponse;
      expect(meBody).toMatchObject({
        email: client.email,
        role: 'CLIENT',
      });
    });

    it('rejects requests without credentials with 401', async () => {
      await request(app.getHttpServer()).get('/auth/me').expect(401);
    });

    it('rejects a pre-UUID CUID session with 401 instead of Prisma P2023', async () => {
      const jwt = app.get(JwtService);
      const stale = await jwt.signAsync({
        sub: 'cmsxymtjh000j9w0s08ihw74k',
        email: client.email,
        role: 'CLIENT',
      });

      const res: Response = await request(app.getHttpServer())
        .get('/auth/me')
        .set('Cookie', `access_token=${stale}`)
        .expect(401);

      expect(cookieHeader(res)).toMatch(/access_token=/);
    });
  });

  describe('GET /users/me', () => {
    it('returns the authenticated client profile', async () => {
      const user = await login(client);

      const me = await request(app.getHttpServer())
        .get('/users/me')
        .set('Authorization', `Bearer ${await tokenFor(client)}`)
        .expect(200);

      const meBody = me.body as MeResponse;
      expect(meBody).toMatchObject({
        email: user.email,
        role: 'CLIENT',
      });
      expect(meBody).not.toHaveProperty('passwordHash');
    });

    it('rejects requests without a token with 401', async () => {
      await request(app.getHttpServer()).get('/users/me').expect(401);
    });

    it('rejects an invalid token with 401', async () => {
      await request(app.getHttpServer())
        .get('/users/me')
        .set('Authorization', 'Bearer not-a-real-token')
        .expect(401);
    });
  });

  describe('PATCH /users/me', () => {
    it('updates the authenticated client name', async () => {
      const res: Response = await request(app.getHttpServer())
        .patch('/users/me')
        .set('Authorization', `Bearer ${await tokenFor(client)}`)
        .send({ name: 'Cliente Atualizado' })
        .expect(200);

      const body = res.body as MeResponse;
      expect(body.email).toBe(client.email);
      expect(body.name).toBe('Cliente Atualizado');

      await request(app.getHttpServer())
        .patch('/users/me')
        .set('Authorization', `Bearer ${await tokenFor(client)}`)
        .send({ name: 'Cliente Um' })
        .expect(200);
    });

    it('rejects update without a token with 401', async () => {
      await request(app.getHttpServer())
        .patch('/users/me')
        .send({ name: 'Sem token' })
        .expect(401);
    });
  });

  describe('GET /users', () => {
    it('returns all users for an ORGANIZER', async () => {
      const res: Response = await request(app.getHttpServer())
        .get('/users')
        .set('Authorization', `Bearer ${await tokenFor(organizer)}`)
        .expect(200);

      const body = res.body as { items: MeResponse[]; total: number; hasMore: boolean };
      expect(Array.isArray(body.items)).toBe(true);
      expect(body.items.length).toBeGreaterThanOrEqual(4);
      expect(body.items[0]).toHaveProperty('role');
      expect(typeof body.total).toBe('number');
    });

    it('denies listing for a CLIENT role with 403', async () => {
      await request(app.getHttpServer())
        .get('/users')
        .set('Authorization', `Bearer ${await tokenFor(client)}`)
        .expect(403);
    });

    it('denies listing for a GATE role with 403', async () => {
      await request(app.getHttpServer())
        .get('/users')
        .set('Authorization', `Bearer ${await tokenFor(gate)}`)
        .expect(403);
    });

    it('denies listing without a token with 401', async () => {
      await request(app.getHttpServer()).get('/users').expect(401);
    });
  });
});
