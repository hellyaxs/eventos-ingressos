import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
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
  SearchPageQueryDto,
  resolvePage,
  toPaginatedResponse,
} from '../common/pagination';
import { PrismaService } from '../prisma/prisma.service';
import { JwtUser } from '../guards/current-user.decorator';
import { CreateEventDto, UpdateEventDto } from './dto/create-event.dto';
import { isUuid, parseUuid } from '../common/ids';

@Injectable()
export class EventsService {
  constructor(private readonly prisma: PrismaService) {}

  create(claims: JwtUser, dto: CreateEventDto) {
    const rows = dto.rows ?? 8;
    const cols = dto.cols ?? 10;
    const saleMode = dto.saleMode ?? SaleMode.SEAT_MAP;
    const seats =
      saleMode === SaleMode.SEAT_MAP ? this.buildSeats(rows, cols) : [];

    return this.prisma.$transaction(async (tx) => {
      const event = await tx.event.create({
        data: {
          organizerId: claims.userId,
          tmdbId: dto.tmdbId,
          externalRef: `tmdb:${dto.tmdbId}`,
          title: dto.title,
          description: dto.description,
          posterUrl: dto.posterUrl,
          venue: dto.venue,
          startsAt: new Date(dto.startsAt),
          capacity: dto.capacity,
          priceCents: dto.priceCents,
          saleMode,
          status: EventStatus.DRAFT,
          rows,
          cols,
        },
      });

      if (seats.length > 0) {
        await tx.seat.createMany({
          data: seats.map((seat) => ({ ...seat, eventId: event.id })),
        });
      }

      return { ...event, seatCount: seats.length };
    });
  }

  async listPublished(query: SearchPageQueryDto, claims?: JwtUser) {
    const { page, limit, skip } = resolvePage(query);
    const q = query.q?.trim();
    const where: Prisma.EventWhereInput = {
      status: EventStatus.PUBLISHED,
      ...(q
        ? {
            OR: [
              { title: { contains: q, mode: 'insensitive' } },
              { venue: { contains: q, mode: 'insensitive' } },
            ],
          }
        : {}),
    };
    const [events, total] = await this.prisma.$transaction([
      this.prisma.event.findMany({
        where,
        orderBy: { startsAt: 'asc' },
        skip,
        take: limit,
        select: {
          id: true,
          title: true,
          posterUrl: true,
          venue: true,
          startsAt: true,
          priceCents: true,
          capacity: true,
          saleMode: true,
          externalRef: true,
          tmdbId: true,
          _count: { select: { tickets: true } },
        },
      }),
      this.prisma.event.count({ where }),
    ]);

    const ownedByEvent = new Map<string, string[]>();
    if (claims?.userId && isUuid(claims.userId) && events.length > 0) {
      const tickets = await this.prisma.ticket.findMany({
        where: {
          userId: claims.userId,
          eventId: { in: events.map((event) => event.id) },
        },
        select: { eventId: true, seatLabel: true },
      });
      for (const ticket of tickets) {
        const labels = ownedByEvent.get(ticket.eventId) ?? [];
        if (ticket.seatLabel) labels.push(ticket.seatLabel);
        ownedByEvent.set(ticket.eventId, labels);
      }
    }

    return toPaginatedResponse({
      items: events.map(({ _count, ...event }) => {
        const ownedSeatLabels = ownedByEvent.get(event.id) ?? [];
        return {
          ...event,
          seatsSold: _count.tickets,
          alreadyPurchased: ownedSeatLabels.length > 0,
          ownedSeatLabels,
        };
      }),
      page,
      limit,
      total,
    });
  }

  async listOrganizer(claims: JwtUser, query: PageQueryDto) {
    const { page, limit, skip } = resolvePage(query);
    const where = { organizerId: claims.userId };
    const [events, total] = await this.prisma.$transaction([
      this.prisma.event.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
        select: {
          id: true,
          title: true,
          description: true,
          posterUrl: true,
          venue: true,
          startsAt: true,
          priceCents: true,
          capacity: true,
          saleMode: true,
          status: true,
          rows: true,
          cols: true,
          externalRef: true,
          tmdbId: true,
        },
      }),
      this.prisma.event.count({ where }),
    ]);

    return toPaginatedResponse({
      items: events,
      page,
      limit,
      total,
    });
  }

  async update(claims: JwtUser, id: string, dto: UpdateEventDto) {
    parseUuid(id, 'Evento não encontrado');
    const existing = await this.prisma.event.findUnique({
      where: { id },
      include: { _count: { select: { tickets: true } } },
    });
    if (!existing) {
      throw new NotFoundException('Evento não encontrado');
    }
    if (existing.organizerId !== claims.userId) {
      throw new ForbiddenException('Você não pode editar este evento');
    }

    const data: Prisma.EventUpdateInput = {};
    if (dto.title !== undefined) data.title = dto.title;
    if (dto.description !== undefined) data.description = dto.description;
    if (dto.posterUrl !== undefined && existing._count.tickets === 0) {
      data.posterUrl = dto.posterUrl;
    }
    if (dto.venue !== undefined) data.venue = dto.venue;
    if (dto.startsAt !== undefined) data.startsAt = new Date(dto.startsAt);
    if (dto.capacity !== undefined) data.capacity = dto.capacity;
    if (dto.priceCents !== undefined) data.priceCents = dto.priceCents;
    if (dto.saleMode !== undefined) data.saleMode = dto.saleMode;
    if (dto.rows !== undefined) data.rows = dto.rows;
    if (dto.cols !== undefined) data.cols = dto.cols;

    if (Object.keys(data).length === 0) {
      throw new BadRequestException('Nenhum campo informado para atualização');
    }

    return this.prisma.event.update({ where: { id }, data });
  }

  async getSeatMap(id: string, claims?: JwtUser) {
    parseUuid(id, 'Evento não encontrado');
    const event = await this.prisma.event.findUnique({
      where: { id },
      select: {
        id: true,
        title: true,
        posterUrl: true,
        venue: true,
        startsAt: true,
        priceCents: true,
        capacity: true,
        saleMode: true,
        rows: true,
        cols: true,
        status: true,
        _count: { select: { tickets: true } },
        seats: {
          orderBy: [{ row: 'asc' }, { col: 'asc' }],
          select: { id: true, label: true, row: true, col: true },
        },
      },
    });

    if (!event) {
      throw new NotFoundException('Evento não encontrado');
    }
    if (event.status !== EventStatus.PUBLISHED) {
      throw new BadRequestException('Evento não publicado');
    }

    const now = new Date();
    const reservations = await this.prisma.reservation.findMany({
      where: { eventId: event.id },
      select: { seatId: true, status: true, expiresAt: true },
    });

    const occupied = new Set(
      reservations
        .filter(
          (reservation) =>
            reservation.status === ReservationStatus.CONVERTED ||
            (reservation.status === ReservationStatus.HOLD &&
              reservation.expiresAt > now),
        )
        .map((reservation) => reservation.seatId),
    );

    const ownedLabels = new Set<string>();
    if (claims?.userId && isUuid(claims.userId)) {
      const tickets = await this.prisma.ticket.findMany({
        where: { userId: claims.userId, eventId: event.id },
        select: { seatLabel: true },
      });
      for (const ticket of tickets) {
        if (ticket.seatLabel) ownedLabels.add(ticket.seatLabel);
      }
    }

    const { status: _status, _count, ...eventInfo } = event;
    return {
      ...eventInfo,
      seatsSold: _count.tickets,
      seats: eventInfo.seats.map((seat) => ({
        ...seat,
        id: seat.id.toString(),
        available: !occupied.has(seat.id),
        owned: ownedLabels.has(seat.label),
      })),
    };
  }

  async publish(id: string) {
    parseUuid(id, 'Evento não encontrado');
    const event = await this.prisma.event.findUnique({ where: { id } });
    if (!event) {
      throw new NotFoundException('Evento não encontrado');
    }
    if (event.status !== EventStatus.DRAFT) {
      throw new ConflictException(
        'Apenas eventos em rascunho podem ser publicados',
      );
    }
    return this.prisma.event.update({
      where: { id },
      data: { status: EventStatus.PUBLISHED },
    });
  }

  private buildSeats(
    rows: number,
    cols: number,
  ): Array<{ label: string; row: number; col: number }> {
    const seats: Array<{ label: string; row: number; col: number }> = [];
    for (let r = 0; r < rows; r++) {
      const letter = String.fromCharCode('A'.charCodeAt(0) + r);
      for (let c = 1; c <= cols; c++) {
        seats.push({ label: `${letter}${c}`, row: r + 1, col: c });
      }
    }
    return seats;
  }
}
