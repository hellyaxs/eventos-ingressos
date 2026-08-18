import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import request, { Response } from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from './../src/app.module';
import { cookieHeader, tokenFor as loginToken } from './auth-token';

interface LoginResponse {
  user: { id: string; role: string };
  token?: string;
}

interface CreateEventBody {
  id: string;
  status: string;
  seatCount: number;
  rows: number;
  cols: number;
  externalRef: string;
  tmdbId: number;
}

interface PublishedEventBody {
  status: string;
  title: string;
}

interface UpdateEventBody {
  id: string;
  title: string;
  venue: string;
  priceCents: number;
}

interface OrganizerEventBody {
  id: string;
  title: string;
  status: string;
}

describe('EventsModule + CatalogModule (e2e)', () => {
  let app: INestApplication<App>;

  const organizer = {
    email: 'org@eventos.local',
    password: 'secret123',
  };

  const client = {
    email: 'cliente1@eventos.local',
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

  async function tokenFor(credentials: {
    email: string;
    password: string;
  }): Promise<string> {
    return loginToken(app, credentials);
  }

  function validEventPayload(overrides: Record<string, unknown> = {}) {
    return {
      title: `Evento E2E ${Date.now()}`,
      description: 'Evento criado pelo teste de integração',
      venue: 'Teatro Teste',
      startsAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
      capacity: 200,
      priceCents: 5000,
      tmdbId: 27205,
      posterUrl: 'https://picsum.photos/seed/inception/500/750',
      ...overrides,
    };
  }

  describe('POST /events', () => {
    it('creates a DRAFT SEAT_MAP event with seatCount rows*cols (default 80) for an ORGANIZER', async () => {
      const res: Response = await request(app.getHttpServer())
        .post('/events')
        .set('Authorization', `Bearer ${await tokenFor(organizer)}`)
        .send(validEventPayload())
        .expect(201);

      const body = res.body as CreateEventBody;
      expect(typeof body.id).toBe('string');
      expect(body.status).toBe('DRAFT');
      expect(body.rows).toBe(8);
      expect(body.cols).toBe(10);
      expect(body.seatCount).toBe(80);
      expect(body.tmdbId).toBe(27205);
      expect(body.externalRef).toBe('tmdb:27205');
    });

    it('creates an event honoring explicit rows/cols for seatCount', async () => {
      const res: Response = await request(app.getHttpServer())
        .post('/events')
        .set('Authorization', `Bearer ${await tokenFor(organizer)}`)
        .send(validEventPayload({ rows: 2, cols: 3 }))
        .expect(201);

      const body = res.body as CreateEventBody;
      expect(body.rows).toBe(2);
      expect(body.cols).toBe(3);
      expect(body.seatCount).toBe(6);
    });

    it('persists TMDb association as externalRef tmdb:{id}', async () => {
      const res: Response = await request(app.getHttpServer())
        .post('/events')
        .set('Authorization', `Bearer ${await tokenFor(organizer)}`)
        .send(validEventPayload({ tmdbId: 27205, rows: 2, cols: 2 }))
        .expect(201);

      const body = res.body as CreateEventBody;
      expect(body.tmdbId).toBe(27205);
      expect(body.externalRef).toBe('tmdb:27205');
    });

    it('rejects create without tmdbId with 400', async () => {
      const { tmdbId: _tmdbId, ...payload } = validEventPayload();
      await request(app.getHttpServer())
        .post('/events')
        .set('Authorization', `Bearer ${await tokenFor(organizer)}`)
        .send(payload)
        .expect(400);
    });

    it('rejects create without posterUrl with 400', async () => {
      const { posterUrl: _posterUrl, ...payload } = validEventPayload();
      await request(app.getHttpServer())
        .post('/events')
        .set('Authorization', `Bearer ${await tokenFor(organizer)}`)
        .send(payload)
        .expect(400);
    });

    it('rejects a non-organizer CLIENT with 403', async () => {
      await request(app.getHttpServer())
        .post('/events')
        .set('Authorization', `Bearer ${await tokenFor(client)}`)
        .send(validEventPayload())
        .expect(403);
    });

    it('rejects requests without a token with 401', async () => {
      await request(app.getHttpServer())
        .post('/events')
        .send(validEventPayload())
        .expect(401);
    });
  });

  describe('POST /events/:id/publish', () => {
    it('publishes a DRAFT event (200, status PUBLISHED) then rejects a second publish with 409', async () => {
      const createRes: Response = await request(app.getHttpServer())
        .post('/events')
        .set('Authorization', `Bearer ${await tokenFor(organizer)}`)
        .send(validEventPayload())
        .expect(201);

      const created = createRes.body as CreateEventBody;

      const publishRes: Response = await request(app.getHttpServer())
        .post(`/events/${created.id}/publish`)
        .set('Authorization', `Bearer ${await tokenFor(organizer)}`)
        .expect(200);

      expect((publishRes.body as PublishedEventBody).status).toBe('PUBLISHED');

      await request(app.getHttpServer())
        .post(`/events/${created.id}/publish`)
        .set('Authorization', `Bearer ${await tokenFor(organizer)}`)
        .expect(409);
    });

    it('rejects publishing an unknown event with 404', async () => {
      await request(app.getHttpServer())
        .post('/events/does-not-exist/publish')
        .set('Authorization', `Bearer ${await tokenFor(organizer)}`)
        .expect(404);
    });

    it('rejects a non-organizer trying to publish with 403', async () => {
      const createRes: Response = await request(app.getHttpServer())
        .post('/events')
        .set('Authorization', `Bearer ${await tokenFor(organizer)}`)
        .send(validEventPayload())
        .expect(201);

      const created = createRes.body as CreateEventBody;

      await request(app.getHttpServer())
        .post(`/events/${created.id}/publish`)
        .set('Authorization', `Bearer ${await tokenFor(client)}`)
        .expect(403);
    });
  });

  describe('PATCH /events/:id', () => {
    it('updates fields of an owned event (200) and returns the updated event', async () => {
      const createRes: Response = await request(app.getHttpServer())
        .post('/events')
        .set('Authorization', `Bearer ${await tokenFor(organizer)}`)
        .send(validEventPayload())
        .expect(201);

      const created = createRes.body as CreateEventBody;

      const patchRes: Response = await request(app.getHttpServer())
        .patch(`/events/${created.id}`)
        .set('Authorization', `Bearer ${await tokenFor(organizer)}`)
        .send({
          title: 'Evento Renomeado',
          venue: 'Arena Nova',
          priceCents: 7500,
        })
        .expect(200);

      const body = patchRes.body as UpdateEventBody;
      expect(body.id).toBe(created.id);
      expect(body).toMatchObject({
        title: 'Evento Renomeado',
        venue: 'Arena Nova',
        priceCents: 7500,
      });
    });

    it('rejects updating an unknown event with 404', async () => {
      await request(app.getHttpServer())
        .patch('/events/does-not-exist')
        .set('Authorization', `Bearer ${await tokenFor(organizer)}`)
        .send({ title: 'Qualquer' })
        .expect(404);
    });

    it('rejects an empty body with 400', async () => {
      const createRes: Response = await request(app.getHttpServer())
        .post('/events')
        .set('Authorization', `Bearer ${await tokenFor(organizer)}`)
        .send(validEventPayload())
        .expect(201);

      const created = createRes.body as CreateEventBody;

      await request(app.getHttpServer())
        .patch(`/events/${created.id}`)
        .set('Authorization', `Bearer ${await tokenFor(organizer)}`)
        .send({})
        .expect(400);
    });

    it('rejects a non-organizer trying to update with 403', async () => {
      const createRes: Response = await request(app.getHttpServer())
        .post('/events')
        .set('Authorization', `Bearer ${await tokenFor(organizer)}`)
        .send(validEventPayload())
        .expect(201);

      const created = createRes.body as CreateEventBody;

      await request(app.getHttpServer())
        .patch(`/events/${created.id}`)
        .set('Authorization', `Bearer ${await tokenFor(client)}`)
        .send({ title: 'Inválido' })
        .expect(403);
    });

    it('rejects requests without a token with 401', async () => {
      await request(app.getHttpServer())
        .patch('/events/some-id')
        .send({ title: 'Inválido' })
        .expect(401);
    });
  });

  describe('GET /events/mine', () => {
    it('returns the organizer own events including drafts', async () => {
      await request(app.getHttpServer())
        .post('/events')
        .set('Authorization', `Bearer ${await tokenFor(organizer)}`)
        .send(validEventPayload({ title: 'Meu Rascunho' }))
        .expect(201);

      const res: Response = await request(app.getHttpServer())
        .get('/events/mine')
        .set('Authorization', `Bearer ${await tokenFor(organizer)}`)
        .expect(200);

      const body = res.body as { items: OrganizerEventBody[] };
      expect(Array.isArray(body.items)).toBe(true);
      expect(body.items.some((e) => e.title === 'Meu Rascunho')).toBe(true);
    });

    it('rejects a non-organizer with 403', async () => {
      await request(app.getHttpServer())
        .get('/events/mine')
        .set('Authorization', `Bearer ${await tokenFor(client)}`)
        .expect(403);
    });
  });

  describe('GET /events', () => {
    it('returns a list of published events including the seeded "Showcase de Verão"', async () => {
      const res: Response = await request(app.getHttpServer())
        .get('/events')
        .expect(200);

      const body = res.body as {
        items: Array<Record<string, unknown>>;
        page: number;
        hasMore: boolean;
        total: number;
      };
      expect(Array.isArray(body.items)).toBe(true);

      const seeded = body.items.find((e) => e.title === 'Showcase de Verão');
      expect(seeded).toBeDefined();
      expect(seeded).toMatchObject({
        venue: 'Arena Demo',
        priceCents: 10000,
        capacity: 80,
        saleMode: 'SEAT_MAP',
      });
      expect(typeof (seeded as Record<string, unknown>).id).toBe('string');
      expect(typeof (seeded as Record<string, unknown>).seatsSold).toBe(
        'number',
      );
      expect(Array.isArray((seeded as Record<string, unknown>).ownedSeatLabels)).toBe(
        true,
      );
    });

    it('lists published events even with a pre-UUID CUID access token', async () => {
      const jwt = app.get(JwtService);
      const stale = await jwt.signAsync({
        sub: 'cmsxymtjh000j9w0s08ihw74k',
        email: client.email,
        role: 'CLIENT',
      });

      const res: Response = await request(app.getHttpServer())
        .get('/events')
        .set('Cookie', `access_token=${stale}`)
        .expect(200);

      const body = res.body as { items: unknown[] };
      expect(Array.isArray(body.items)).toBe(true);
      expect(cookieHeader(res)).toMatch(/access_token=/);
    });
  });

  describe('GET /catalog/search', () => {
    it('returns a catalog search response with a results array (fixture or TMDb)', async () => {
      const res: Response = await request(app.getHttpServer())
        .get('/catalog/search?q=test')
        .expect(200);

      const body = res.body as { results: unknown[] };
      expect(Array.isArray(body.results)).toBe(true);
    });

    it('returns an empty results array for an empty query', async () => {
      const res: Response = await request(app.getHttpServer())
        .get('/catalog/search?q=')
        .expect(200);

      expect((res.body as { results: unknown[] }).results).toEqual([]);
    });

    it('returns movies matching the query instead of the full fixture list', async () => {
      const res: Response = await request(app.getHttpServer())
        .get('/catalog/search?q=Inception')
        .expect(200);

      const body = res.body as {
        items: Array<{ title: string }>;
        results: Array<{ title: string }>;
      };
      expect(body.items.length).toBeGreaterThan(0);
      expect(body.results).toEqual(body.items);
      expect(
        body.items.some((movie) => /inception|origem/i.test(movie.title)),
      ).toBe(true);
    });

    it('does not return the unfiltered fixture list for an unmatched query', async () => {
      const res: Response = await request(app.getHttpServer())
        .get('/catalog/search?q=homenxyznaoexiste')
        .expect(200);

      const body = res.body as {
        items: Array<{ title: string }>;
        results: unknown[];
      };
      expect(Array.isArray(body.results)).toBe(true);
      expect(body.items.map((movie) => movie.title)).not.toEqual([
        'The Dark Knight',
        'Inception',
        'Interstellar',
        'The Matrix',
        'Pulp Fiction',
      ]);
    });
  });

  describe.each(['/catalog/now-playing', '/catalog/upcoming'] as const)(
    'GET %s',
    (path) => {
      it('returns 200 with items and results of catalog movies', async () => {
        const res: Response = await request(app.getHttpServer())
          .get(path)
          .expect(200);

        const body = res.body as {
          items: Array<{
            id: number;
            title: string;
            poster_path: string | null;
          }>;
          results: unknown[];
        };

        expect(Array.isArray(body.items)).toBe(true);
        expect(body.items.length).toBeGreaterThanOrEqual(1);
        expect(body.results).toEqual(body.items);

        for (const item of body.items) {
          expect(typeof item.id).toBe('number');
          expect(typeof item.title).toBe('string');
          expect(item).toHaveProperty('poster_path');
        }
      });
    },
  );
});
