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
  amountCents: number;
  reservationId: string;
  reservation?: { status?: string; seat?: { label: string } | null };
  tickets?: Array<Record<string, unknown>>;
}

describe('ReservationsModule + TicketsModule + PaymentsModule (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let clientToken: string;
  let organizerToken: string;
  let eventId: string;
  let seatA: { id: string; label: string };
  let seatB: { id: string; label: string };
  let firstReservationId: string;
  let approvedPaymentId: string;

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

    prisma = app.get(PrismaService);

    clientToken = await tokenFor(app, client);
    organizerToken = await tokenFor(app, organizer);

    const createRes: Response = await request(app.getHttpServer())
      .post('/events')
      .set('Authorization', `Bearer ${organizerToken}`)
      .send({
        title: `Reservas E2E ${Date.now()}`,
        description: 'Evento criado para os testes de reserva e pagamento',
        venue: 'Teatro Reservas',
        startsAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
        capacity: 80,
        priceCents: 10000,
        tmdbId: 680,
        posterUrl: 'https://picsum.photos/seed/pulp-fiction/500/750',
      })
      .expect(201);

    const created = createRes.body as CreatedEventBody;
    expect(created.status).toBe('DRAFT');
    eventId = created.id;

    const publishRes: Response = await request(app.getHttpServer())
      .post(`/events/${eventId}/publish`)
      .set('Authorization', `Bearer ${organizerToken}`)
      .expect(200);
    expect((publishRes.body as { status: string }).status).toBe('PUBLISHED');

    const seats = await prisma.seat.findMany({
      where: { eventId },
      orderBy: { label: 'asc' },
      take: 2,
      select: { id: true, label: true },
    });
    expect(seats).toHaveLength(2);
    [seatA, seatB] = seats.map((seat) => ({
      id: seat.id.toString(),
      label: seat.label,
    }));
  });

  afterAll(async () => {
    await app.close();
  });

  async function pollPaymentUntil(
    paymentId: string,
    predicate: (payment: PaymentBody) => boolean,
  ): Promise<PaymentBody> {
    const deadline = Date.now() + 8000;
    let last: PaymentBody | undefined;
    while (Date.now() < deadline) {
      const res: Response = await request(app.getHttpServer())
        .get(`/payments/${paymentId}`)
        .expect(200);
      last = res.body as PaymentBody;
      if (predicate(last)) {
        return last;
      }
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
    throw new Error(
      `Pagamento ${paymentId} não atingiu o estado esperado a tempo`,
    );
  }

  describe('POST /events/:id/reserve', () => {
    it('reserva um assento (201), rejeita duplicidade com 409 e assento estranho com 400', async () => {
      const reserveRes: Response = await request(app.getHttpServer())
        .post(`/events/${eventId}/reserve`)
        .set('Authorization', `Bearer ${clientToken}`)
        .send({ seatIds: [seatA.id] })
        .expect(201);

      const body = reserveRes.body as ReserveBody;
      expect(body.reservationIds).toHaveLength(1);
      expect(body.seats).toEqual([seatA.label]);
      expect(typeof body.expiresAt).toBe('string');
      firstReservationId = body.reservationIds[0];

      const dupRes: Response = await request(app.getHttpServer())
        .post(`/events/${eventId}/reserve`)
        .set('Authorization', `Bearer ${clientToken}`)
        .send({ seatIds: [seatA.id] })
        .expect(409);
      expect((dupRes.body as { message: string }).message).toBe(
        'Assento indisponível',
      );

      const foreignRes: Response = await request(app.getHttpServer())
        .post(`/events/${eventId}/reserve`)
        .set('Authorization', `Bearer ${clientToken}`)
        .send({ seatIds: ['assento-inexistente'] })
        .expect(400);
      expect((foreignRes.body as { message: string }).message).toBe(
        'Assento não pertence a este evento',
      );
    });

    it('lista HOLDs com id e priceCents do evento', async () => {
      const holdsRes: Response = await request(app.getHttpServer())
        .get('/reservations')
        .set('Authorization', `Bearer ${clientToken}`)
        .expect(200);
      const items = (
        holdsRes.body as {
          items: Array<{
            id: string;
            seats: string[];
            event: { id: string; priceCents: number };
          }>;
        }
      ).items;
      const hold = items.find((item) => item.id === firstReservationId);
      expect(hold).toBeDefined();
      expect(hold!.event.id).toBe(eventId);
      expect(hold!.event.priceCents).toBe(10000);
    });
  });

  describe('POST /payments (approve)', () => {
    it('enfileira com idempotência e aprova emitindo um ingresso CENA-', async () => {
      const payload = {
        reservationId: firstReservationId,
        simulatedOutcome: 'approve',
      };

      const first: Response = await request(app.getHttpServer())
        .post('/payments')
        .send(payload)
        .expect(201);

      const firstBody = first.body as PaymentBody;
      expect(firstBody.status).toBe('PENDING');
      expect(firstBody.amountCents).toBe(10000);
      approvedPaymentId = firstBody.id;

      const second: Response = await request(app.getHttpServer())
        .post('/payments')
        .send(payload)
        .expect(201);
      expect((second.body as PaymentBody).id).toBe(approvedPaymentId);

      const approved = await pollPaymentUntil(
        approvedPaymentId,
        (payment) => payment.status === 'APPROVED',
      );
      expect(approved.reservation?.status).toBe('CONVERTED');
      expect(approved.amountCents).toBe(10000);
      expect(approved.tickets).toHaveLength(1);
      const ticket = approved.tickets![0] as {
        code: string;
        seatLabel: string;
      };
      expect(ticket.code.startsWith('CENA-')).toBe(true);
      expect(ticket.seatLabel).toBe(seatA.label);
    });

    it('recupera o pagamento por reserva autenticado', async () => {
      const res: Response = await request(app.getHttpServer())
        .get(`/payments/by-reservation/${firstReservationId}`)
        .set('Authorization', `Bearer ${clientToken}`)
        .expect(200);
      const body = res.body as PaymentBody;
      expect(body.status).toBe('APPROVED');
      expect(body.tickets).toHaveLength(1);
    });

    it('exige JWT em GET /payments/by-reservation/:reservationId', async () => {
      await request(app.getHttpServer())
        .get(`/payments/by-reservation/${firstReservationId}`)
        .expect(401);
    });

    it('retorna 404 para reserva inexistente em GET /payments/by-reservation/:reservationId', async () => {
      await request(app.getHttpServer())
        .get('/payments/by-reservation/reserva-inexistente')
        .set('Authorization', `Bearer ${clientToken}`)
        .expect(404);
    });

    it('expõe o ingresso na lista do cliente sem o codeHash', async () => {
      const res: Response = await request(app.getHttpServer())
        .get('/tickets')
        .set('Authorization', `Bearer ${clientToken}`)
        .expect(200);

      const tickets = (res.body as { items: Array<Record<string, unknown>> }).items;
      const mine = tickets.find(
        (ticket) => ticket.paymentId === approvedPaymentId,
      );
      expect(mine).toBeDefined();
      expect((mine as Record<string, unknown>).code).toContain('CENA-');
      expect((mine as Record<string, unknown>).seatLabel).toBe(seatA.label);
      expect(mine).not.toHaveProperty('codeHash');
    });

    it('rejeita reservar de novo um assento já comprado com 409 amigável', async () => {
      const res: Response = await request(app.getHttpServer())
        .post(`/events/${eventId}/reserve`)
        .set('Authorization', `Bearer ${clientToken}`)
        .send({ seatIds: [seatA.id] })
        .expect(409);
      expect((res.body as { message: string }).message).toContain(
        'Você já comprou este ingresso',
      );
    });
  });

  describe('POST /payments (lote)', () => {
    let batchReservationIds: string[];
    let batchPaymentIds: string[];

    beforeAll(async () => {
      const extra = await prisma.seat.findMany({
        where: { eventId },
        orderBy: { label: 'asc' },
        skip: 2,
        take: 2,
        select: { id: true, label: true },
      });
      expect(extra).toHaveLength(2);

      const reserveRes: Response = await request(app.getHttpServer())
        .post(`/events/${eventId}/reserve`)
        .set('Authorization', `Bearer ${clientToken}`)
        .send({ seatIds: extra.map((seat) => seat.id.toString()) })
        .expect(201);
      const body = reserveRes.body as ReserveBody;
      expect(body.reservationIds).toHaveLength(2);
      batchReservationIds = body.reservationIds;
    });

    it('enfileira em lote (201) e aprova emitindo um ingresso por assento', async () => {
      const res: Response = await request(app.getHttpServer())
        .post('/payments')
        .send({
          reservationIds: batchReservationIds,
          simulatedOutcome: 'approve',
        })
        .expect(201);

      const payments = res.body as PaymentBody[];
      expect(Array.isArray(payments)).toBe(true);
      expect(payments).toHaveLength(2);
      payments.forEach((payment) => {
        expect(payment.status).toBe('PENDING');
        expect(payment.amountCents).toBe(10000);
      });
      batchPaymentIds = payments.map((payment) => payment.id);

      const approved = await Promise.all(
        batchPaymentIds.map((paymentId) =>
          pollPaymentUntil(
            paymentId,
            (payment) => payment.status === 'APPROVED',
          ),
        ),
      );
      approved.forEach((payment) => {
        expect(payment.reservation?.status).toBe('CONVERTED');
        expect(payment.tickets).toHaveLength(1);
        const ticket = payment.tickets![0] as { code: string };
        expect(ticket.code.startsWith('CENA-')).toBe(true);
      });
    });

    it('é idempotente: repetir o mesmo lote devolve os mesmos pagamentos', async () => {
      const res: Response = await request(app.getHttpServer())
        .post('/payments')
        .send({
          reservationIds: batchReservationIds,
          simulatedOutcome: 'approve',
        })
        .expect(201);

      const payments = res.body as PaymentBody[];
      expect(payments.map((payment) => payment.id)).toEqual(batchPaymentIds);
    });
  });

  describe('POST /payments (reject)', () => {
    it('libera a reserva ao rejeitar o pagamento', async () => {
      const reserveRes: Response = await request(app.getHttpServer())
        .post(`/events/${eventId}/reserve`)
        .set('Authorization', `Bearer ${clientToken}`)
        .send({ seatIds: [seatB.id] })
        .expect(201);

      const body = reserveRes.body as ReserveBody;
      const reservationId = body.reservationIds[0];
      expect(body.seats).toEqual([seatB.label]);

      const payRes: Response = await request(app.getHttpServer())
        .post('/payments')
        .send({ reservationId, simulatedOutcome: 'reject' })
        .expect(201);
      const paymentId = (payRes.body as PaymentBody).id;

      const rejected = await pollPaymentUntil(
        paymentId,
        (payment) => payment.status === 'REJECTED',
      );
      expect(rejected.reservation?.status).toBe('CANCELLED');

      const holdsRes: Response = await request(app.getHttpServer())
        .get('/reservations')
        .set('Authorization', `Bearer ${clientToken}`)
        .expect(200);
      const holdIds = (holdsRes.body as { items: Array<{ id: string }> }).items.map(
        (hold) => hold.id,
      );
      expect(holdIds).not.toContain(reservationId);
    });
  });
});
