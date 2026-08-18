import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  EventStatus,
  Prisma,
  ReservationStatus,
  SaleMode,
} from '@prisma/client';
import {
  PageQueryDto,
  resolvePage,
  toPaginatedResponse,
} from '../common/pagination';
import { PrismaService } from '../prisma/prisma.service';
import { JwtUser } from '../guards/current-user.decorator';
import { ReserveEventDto } from './dto/reserve-event.dto';
import { parseSeatId, parseUuid } from '../common/ids';

const HOLD_MINUTES = 10;

@Injectable()
export class ReservationsService {
  constructor(private readonly prisma: PrismaService) {}

  async reserve(claims: JwtUser, eventId: string, dto: ReserveEventDto) {
    parseUuid(eventId, 'Evento não encontrado');
    const { seatIds } = dto;

    const event = await this.prisma.event.findUnique({
      where: { id: eventId },
      select: {
        id: true,
        status: true,
        saleMode: true,
        seats: { select: { id: true, label: true } },
      },
    });

    if (!event) {
      throw new NotFoundException('Evento não encontrado');
    }
    if (event.status !== EventStatus.PUBLISHED) {
      throw new BadRequestException('Evento não publicado');
    }
    if (event.saleMode === SaleMode.GA_QTY) {
      throw new BadRequestException('Venda Geral não suportada');
    }

    const seatById = new Map(
      event.seats.map((seat) => [seat.id.toString(), seat] as const),
    );
    const seatIdValues = seatIds.map((seatId) => parseSeatId(seatId));
    for (const seatId of seatIds) {
      if (!seatById.has(seatId)) {
        throw new BadRequestException('Assento não pertence a este evento');
      }
    }

    const labels = seatIds
      .map((seatId) => seatById.get(seatId)?.label)
      .filter((label): label is string => Boolean(label));
    const alreadyOwned = await this.prisma.ticket.findMany({
      where: {
        userId: claims.userId,
        eventId,
        seatLabel: { in: labels },
      },
      select: { seatLabel: true },
    });
    if (alreadyOwned.length > 0) {
      const seats = alreadyOwned
        .map((ticket) => ticket.seatLabel)
        .filter((label): label is string => Boolean(label))
        .join(', ');
      throw new ConflictException(
        seats
          ? `Você já comprou este ingresso (${seats})`
          : 'Você já comprou este ingresso',
      );
    }

    const expiresAt = new Date(Date.now() + HOLD_MINUTES * 60 * 1000);

    try {
      const reservations = await this.prisma.$transaction(async (tx) => {
        await tx.reservation.updateMany({
          where: {
            eventId,
            seatId: { in: seatIdValues },
            status: ReservationStatus.HOLD,
            expiresAt: { lt: new Date() },
          },
          data: { status: ReservationStatus.EXPIRED },
        });

        return Promise.all(
          seatIdValues.map((seatId) =>
            tx.reservation.create({
              data: {
                eventId,
                userId: claims.userId,
                seatId,
                quantity: 1,
                status: ReservationStatus.HOLD,
                expiresAt,
              },
              select: { id: true },
            }),
          ),
        );
      });

      const seats = seatIds
        .map((seatId) => {
          const seat = seatById.get(seatId);
          return seat ? seat.label : null;
        })
        .filter((label): label is string => label !== null);

      return {
        reservationIds: reservations.map((reservation) => reservation.id),
        expiresAt,
        seats,
      };
    } catch (err) {
      if (
        err instanceof Prisma.PrismaClientKnownRequestError &&
        err.code === 'P2002'
      ) {
        throw new ConflictException('Assento indisponível');
      }
      throw err;
    }
  }

  async listUserHolds(claims: JwtUser, query: PageQueryDto) {
    const { page, limit, skip } = resolvePage(query);
    const where = { userId: claims.userId, status: ReservationStatus.HOLD };

    const [reservations, total] = await this.prisma.$transaction([
      this.prisma.reservation.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
        select: {
          id: true,
          status: true,
          expiresAt: true,
          createdAt: true,
          event: {
            select: {
              id: true,
              title: true,
              venue: true,
              startsAt: true,
              posterUrl: true,
              priceCents: true,
            },
          },
          seat: { select: { label: true } },
        },
      }),
      this.prisma.reservation.count({ where }),
    ]);

    return toPaginatedResponse({
      items: reservations.map(({ seat, ...reservation }) => ({
        ...reservation,
        event: reservation.event,
        seats: seat ? [seat.label] : [],
      })),
      page,
      limit,
      total,
    });
  }
}
