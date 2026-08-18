import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request, { Response } from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from './../src/app.module';
import { PrismaService } from './../src/prisma/prisma.service';
import { tokenFor } from './auth-token';

jest.setTimeout(30000);

interface LoginResponse {
  token: string;
  user: { id: string; role: string };
}

interface CreatedEventBody {
  id: string;
  title?: string;
  status: string;
}

interface ReserveBody {
  reservationIds: string[];
  expiresAt: string;
  seats: string[];
}

interface PaymentBody {
  id: string;
  status: string;
}

interface TicketBody {
  eventId: string;
  code: string;
  shareToken: string;
  status: string;
  seatLabel: string;
}

describe('ShareModule + GateModule (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let organizerToken: string;
  let clientToken: string;

  let eventA: CreatedEventBody;
  let eventB: CreatedEventBody;
  let seatA1: { id: string; label: string };
  let seatA2: { id: string; label: string };
  let ticketA1: TicketBody;
  let ticketA2: TicketBody;

  const organizer = { email: 'org@eventos.local', password: 'secret123' };
  const client = { email: 'cliente1@eventos.local', password: 'secret123' };

  async function login(credentials: {
    email: string;
    password: string;
  }): Promise<string> {
    return tokenFor(app, credentials);
  }

  async function createPublishedEvent(title: string): Promise<CreatedEventBody> {
    const createRes: Response = await request(app.getHttpServer())
      .post('/events')
      .set('Authorization', `Bearer ${organizerToken}`)
      .send({
        title,
        description:
          'Evento criado para os testes de portaria e compartilhamento',
        venue: 'Teatro Portaria',
        startsAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
        capacity: 80,
        priceCents: 10000,
        tmdbId: 603,
        posterUrl: 'https://picsum.photos/seed/the-matrix/500/750',
      })
      .expect(201);

    const created = createRes.body as CreatedEventBody;
    expect(created.status).toBe('DRAFT');

    const publishRes: Response = await request(app.getHttpServer())
      .post(`/events/${created.id}/publish`)
      .set('Authorization', `Bearer ${organizerToken}`)
      .expect(200);
    expect((publishRes.body as { status: string }).status).toBe('PUBLISHED');

    return created;
  }

  async function payFor(reservationId: string): Promise<string> {
    const payRes: Response = await request(app.getHttpServer())
      .post('/payments')
      .send({ reservationId, simulatedOutcome: 'approve' })
      .expect(201);

    const paymentId = (payRes.body as PaymentBody).id;

    const deadline = Date.now() + 8000;
    let last: PaymentBody | undefined;
    while (Date.now() < deadline) {
      const res: Response = await request(app.getHttpServer())
        .get(`/payments/${paymentId}`)
        .expect(200);
      last = res.body as PaymentBody;
      if (last.status === 'APPROVED') {
        return paymentId;
      }
      await new Promise((resolve) => setTimeout(resolve, 150));
    }

    throw new Error(
      `Pagamento ${paymentId} não aprovado (último status ${last?.status})`,
    );
  }

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

    prisma = app.get(PrismaService);
    organizerToken = await login(organizer);
    clientToken = await login(client);

    const now = Date.now();
    eventA = await createPublishedEvent(`Portaria A ${now}`);
    eventB = await createPublishedEvent(`Portaria B ${now}`);

    const seats = await prisma.seat.findMany({
      where: { eventId: eventA.id },
      orderBy: { label: 'asc' },
      take: 2,
      select: { id: true, label: true },
    });
    expect(seats).toHaveLength(2);
    [seatA1, seatA2] = seats.map((seat) => ({
      id: seat.id.toString(),
      label: seat.label,
    }));

    const reserveRes: Response = await request(app.getHttpServer())
      .post(`/events/${eventA.id}/reserve`)
      .set('Authorization', `Bearer ${clientToken}`)
      .send({ seatIds: [seatA1.id, seatA2.id] })
      .expect(201);

    const reserveBody = reserveRes.body as ReserveBody;
    expect(reserveBody.reservationIds).toHaveLength(2);
    await payFor(reserveBody.reservationIds[0]);
    await payFor(reserveBody.reservationIds[1]);

    const ticketsRes: Response = await request(app.getHttpServer())
      .get('/tickets')
      .set('Authorization', `Bearer ${clientToken}`)
      .expect(200);

    const tickets = (ticketsRes.body as { items: TicketBody[] }).items
      .filter((ticket) => ticket.eventId === eventA.id)
      .sort((t1, t2) => t1.seatLabel.localeCompare(t2.seatLabel));

    expect(tickets).toHaveLength(2);
    [ticketA1, ticketA2] = tickets;
  });

  afterAll(async () => {
    await app.close();
  });

  describe('POST /gate/:eventId/validate', () => {
    it('rejects a non-existent ticket code with INVALID', async () => {
      const res: Response = await request(app.getHttpServer())
        .post(`/gate/${eventA.id}/validate`)
        .send({ ticketCode: 'NOTACODE' })
        .expect(200);

      expect((res.body as { status: string }).status).toBe('INVALID');
    });

    it('rejects a valid ticket scanned at the wrong event with WRONG_EVENT', async () => {
      const res: Response = await request(app.getHttpServer())
        .post(`/gate/${eventB.id}/validate`)
        .send({ ticketCode: ticketA1.code })
        .expect(200);

      expect((res.body as { status: string }).status).toBe('WRONG_EVENT');
    });

    it('validates an issued ticket at the correct event and marks it used', async () => {
      const res: Response = await request(app.getHttpServer())
        .post(`/gate/${eventA.id}/validate`)
        .send({ ticketCode: ticketA1.code })
        .expect(200);

      expect((res.body as { status: string }).status).toBe('VALID');

      const used = await prisma.ticket.findUnique({
        where: { code: ticketA1.code },
        select: { status: true, usedAt: true },
      });
      expect(used?.status).toBe('USED');
      expect(used?.usedAt).toBeDefined();
    });

    it('rejects a ticket that was already used with ALREADY_USED', async () => {
      const res: Response = await request(app.getHttpServer())
        .post(`/gate/${eventA.id}/validate`)
        .send({ ticketCode: ticketA1.code })
        .expect(200);

      expect((res.body as { status: string }).status).toBe('ALREADY_USED');
    });

    it('rejects a request without a ticketCode with 400', async () => {
      await request(app.getHttpServer())
        .post(`/gate/${eventA.id}/validate`)
        .send({})
        .expect(400);
    });
  });

  describe('GET /share/:shareToken', () => {
    it('returns only public event + seat info for a valid share token', async () => {
      const res: Response = await request(app.getHttpServer())
        .get(`/share/${ticketA2.shareToken}`)
        .expect(200);

      const body = res.body as {
        status: string;
        seatLabel: string;
        event: { title: string; venue: string };
      };

      expect(body.status).toBe('ISSUED');
      expect(body.seatLabel).toBe(seatA2.label);
      expect(body.event.title).toBe(eventA.title);

      const leakedKeys = [
        'code',
        'codeHash',
        'paymentId',
        'userId',
        'shareToken',
      ];
      for (const key of leakedKeys) {
        expect(body).not.toHaveProperty(key);
      }
      expect((body as Record<string, unknown>).event).not.toHaveProperty(
        'codeHash',
      );
    });

    it('returns 404 for an unknown share token', async () => {
      await request(app.getHttpServer())
        .get('/share/does-not-exist')
        .expect(404);
    });
  });
});
