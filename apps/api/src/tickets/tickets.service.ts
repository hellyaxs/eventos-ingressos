import { Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Ticket, TicketStatus } from '@prisma/client';
import { randomUUID } from 'crypto';
import {
  PageQueryDto,
  resolvePage,
  toPaginatedResponse,
} from '../common/pagination';
import { PrismaService } from '../prisma/prisma.service';
import { buildCode, hashCode } from './ticket-codes';

@Injectable()
export class TicketsService {
  private readonly hmacSecret: string;

  constructor(
    private readonly prisma: PrismaService,
    config: ConfigService,
  ) {
    this.hmacSecret =
      config.get<string>('TICKET_HMAC_SECRET') ?? 'dev-ticket-secret';
  }

  async issueForPayment(
    paymentId: string,
    eventId: string,
    seats: { seatLabel: string }[],
  ): Promise<Ticket[]> {
    return this.prisma.$transaction(async (tx) => {
      const payment = await tx.payment.findUnique({
        where: { id: paymentId },
        include: { reservation: { select: { userId: true } } },
      });
      if (!payment || !payment.reservation) {
        throw new NotFoundException('Pagamento não encontrado');
      }

      const userId = payment.reservation.userId;
      return Promise.all(
        seats.map(async (seat) => {
          const code = buildCode(
            eventId,
            paymentId,
            seat.seatLabel,
            this.hmacSecret,
          );
          return tx.ticket.create({
            data: {
              eventId,
              userId,
              paymentId,
              seatLabel: seat.seatLabel,
              code,
              codeHash: hashCode(code),
              shareToken: randomUUID(),
              status: TicketStatus.ISSUED,
            },
          });
        }),
      );
    });
  }

  async findByUser(userId: string, query: PageQueryDto) {
    const { page, limit, skip } = resolvePage(query);
    const where = { userId };

    const [tickets, total] = await this.prisma.$transaction([
      this.prisma.ticket.findMany({
        where,
        skip,
        take: limit,
        select: {
          id: true,
          eventId: true,
          paymentId: true,
          code: true,
          shareToken: true,
          status: true,
          seatLabel: true,
          usedAt: true,
          createdAt: true,
          event: {
            select: {
              title: true,
              venue: true,
              startsAt: true,
              posterUrl: true,
            },
          },
        },
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.ticket.count({ where }),
    ]);

    return toPaginatedResponse({
      items: tickets,
      page,
      limit,
      total,
    });
  }
}
