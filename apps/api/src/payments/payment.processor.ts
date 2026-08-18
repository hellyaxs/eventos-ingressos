import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { PaymentStatus, ReservationStatus } from '@prisma/client';
import { PAYMENTS_QUEUE } from './payments.constants';
import { PaymentJobPayload, PaymentsService } from './payments.service';
import { TicketsService } from '../tickets/tickets.service';
import { PrismaService } from '../prisma/prisma.service';

@Processor(PAYMENTS_QUEUE, { concurrency: 1 })
export class PaymentProcessor extends WorkerHost {
  private readonly logger = new Logger(PaymentProcessor.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly paymentsService: PaymentsService,
    private readonly ticketsService: TicketsService,
  ) {
    super();
  }

  async process(job: Job<PaymentJobPayload>) {
    const { paymentId, reservationId, simulatedOutcome } = job.data;
    this.logger.log(
      `Processando pagamento ${paymentId} para reserva ${reservationId} (concurrency=1)`,
    );

    if (simulatedOutcome === 'approve') {
      return this.approve(paymentId);
    }
    return this.reject(paymentId);
  }

  private async approve(paymentId: string) {
    return this.prisma.$transaction(async (tx) => {
      const payment = await tx.payment.findUnique({
        where: { id: paymentId },
        include: {
          reservation: {
            include: { seat: true },
          },
        },
      });
      if (!payment || !payment.reservation) {
        this.logger.error(`Pagamento ${paymentId} não encontrado`);
        return { paymentId, status: 'REJECTED' };
      }

      if (payment.status !== PaymentStatus.PENDING) {
        this.logger.log(
          `Pagamento ${paymentId} já está em estado final (${payment.status}), ignorando`,
        );
        return { paymentId, status: payment.status };
      }

      const reservation = payment.reservation;
      if (
        reservation.status !== ReservationStatus.HOLD ||
        reservation.expiresAt <= new Date()
      ) {
        this.logger.warn(
          `Reserva ${reservation.id} expirada ou não está mais em espera, rejeitando pagamento ${paymentId}`,
        );
        await tx.payment.update({
          where: { id: paymentId },
          data: { status: PaymentStatus.REJECTED },
        });
        return { paymentId, status: 'REJECTED' };
      }

      await tx.payment.update({
        where: { id: paymentId },
        data: { status: PaymentStatus.APPROVED },
      });
      await tx.reservation.update({
        where: { id: reservation.id },
        data: { status: ReservationStatus.CONVERTED },
      });

      const seatLabels = reservation.seat ? [reservation.seat.label] : [];
      let ticketsIssued = 0;
      if (seatLabels.length > 0) {
        const tickets = await this.ticketsService.issueForPayment(
          paymentId,
          reservation.eventId,
          seatLabels.map((seatLabel) => ({ seatLabel })),
        );
        ticketsIssued = tickets.length;
      }

      this.logger.log(
        `Pagamento ${paymentId} aprovado com ${ticketsIssued} ingressos emitidos`,
      );
      return { paymentId, status: 'APPROVED', ticketsIssued };
    });
  }

  private async reject(paymentId: string) {
    return this.prisma.$transaction(async (tx) => {
      const payment = await tx.payment.findUnique({
        where: { id: paymentId },
      });
      if (!payment) {
        this.logger.error(`Pagamento ${paymentId} não encontrado`);
        return { paymentId, status: 'REJECTED' };
      }

      if (payment.status !== PaymentStatus.PENDING) {
        this.logger.log(
          `Pagamento ${paymentId} já está em estado final (${payment.status}), ignorando`,
        );
        return { paymentId, status: payment.status };
      }

      await tx.payment.update({
        where: { id: paymentId },
        data: { status: PaymentStatus.REJECTED },
      });
      await tx.reservation.update({
        where: { id: payment.reservationId },
        data: { status: ReservationStatus.CANCELLED },
      });

      this.logger.log(`Pagamento ${paymentId} rejeitado`);
      return { paymentId, status: 'REJECTED' };
    });
  }
}
