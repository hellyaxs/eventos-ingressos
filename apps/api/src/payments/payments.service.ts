import { Injectable, Logger } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { Payment, PaymentStatus, ReservationStatus } from '@prisma/client';
import { PAYMENT_PROCESS_JOB, PAYMENTS_QUEUE } from './payments.constants';
import { PrismaService } from '../prisma/prisma.service';
import { parseUuid } from '../common/ids';

export type SimulatedOutcome = 'approve' | 'reject';

export type PaymentJobPayload = {
  paymentId: string;
  reservationId: string;
  simulatedOutcome: SimulatedOutcome;
};

@Injectable()
export class PaymentsService {
  private readonly logger = new Logger(PaymentsService.name);

  constructor(
    private readonly prisma: PrismaService,
    @InjectQueue(PAYMENTS_QUEUE) private readonly paymentsQueue: Queue,
  ) {}

  async enqueue(input: {
    reservationIds: string[];
    simulatedOutcome: SimulatedOutcome;
  }): Promise<Payment[]> {
    const { simulatedOutcome } = input;
    const reservationIds = [...new Set(input.reservationIds)];

    const reservations = await this.prisma.reservation.findMany({
      where: { id: { in: reservationIds } },
      include: { event: true },
    });

    if (reservations.length !== reservationIds.length) {
      throw new NotFoundException('Uma ou mais reservas não foram encontradas');
    }

    const reservationById = new Map(
      reservations.map((reservation) => [reservation.id, reservation]),
    );
    const first = reservations[0];
    const sameUser = reservations.every(
      (reservation) => reservation.userId === first.userId,
    );
    const sameEvent = reservations.every(
      (reservation) => reservation.eventId === first.eventId,
    );
    if (!sameUser || !sameEvent) {
      throw new BadRequestException(
        'As reservas devem pertencer ao mesmo usuário e ao mesmo evento',
      );
    }

    const payments: Payment[] = [];

    for (const reservationId of reservationIds) {
      const reservation = reservationById.get(reservationId)!;

      const existing = await this.prisma.payment.findUnique({
        where: { reservationId },
      });
      if (existing) {
        this.logger.log(
          `Pagamento já existe para a reserva ${reservationId}, ignorando duplicação`,
        );
        payments.push(existing);
        continue;
      }

      if (reservation.status !== ReservationStatus.HOLD) {
        throw new ConflictException('Reserva não está mais em espera');
      }
      if (reservation.expiresAt <= new Date()) {
        throw new ConflictException('Reserva expirada');
      }

      const amountCents =
        reservation.event.priceCents *
        (reservation.seatId ? 1 : (reservation.quantity ?? 1));

      const payment = await this.prisma.payment.create({
        data: {
          reservationId,
          userId: reservation.userId,
          status: PaymentStatus.PENDING,
          simulatedOutcome,
          amountCents,
        },
      });

      await this.paymentsQueue.add(
        PAYMENT_PROCESS_JOB,
        {
          paymentId: payment.id,
          reservationId,
          simulatedOutcome,
        } satisfies PaymentJobPayload,
        {
          jobId: payment.id,
          removeOnComplete: 100,
          removeOnFail: 200,
          attempts: 3,
          backoff: { type: 'exponential', delay: 1000 },
        },
      );

      this.logger.log(`Pagamento ${payment.id} enfileirado`);
      payments.push(payment);
    }

    return payments;
  }

  async get(paymentId: string) {
    parseUuid(paymentId, 'Pagamento não encontrado');
    return this.prisma.payment.findUnique({
      where: { id: paymentId },
      include: {
        reservation: {
          include: {
            seat: true,
            event: { select: { title: true } },
          },
        },
        tickets: true,
      },
    });
  }

  async getByReservation(userId: string, reservationId: string) {
    parseUuid(userId, 'Pagamento não encontrado');
    parseUuid(reservationId, 'Pagamento não encontrado');
    const payment = await this.prisma.payment.findFirst({
      where: { reservationId, userId },
      include: {
        reservation: {
          include: {
            seat: true,
            event: { select: { title: true, id: true } },
          },
        },
        tickets: true,
      },
    });
    if (!payment) {
      throw new NotFoundException('Pagamento não encontrado');
    }
    return payment;
  }
}
