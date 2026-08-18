import { Injectable } from '@nestjs/common';
import { TicketStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

type GateResult = {
  status: 'VALID' | 'INVALID' | 'ALREADY_USED' | 'WRONG_EVENT';
};

@Injectable()
export class GateService {
  constructor(private readonly prisma: PrismaService) {}

  async validate(ticketCode: string, eventId: string): Promise<GateResult> {
    const ticket = await this.prisma.ticket.findUnique({
      where: { code: ticketCode },
      select: { id: true, eventId: true, status: true },
    });

    if (!ticket) {
      return { status: 'INVALID' };
    }

    if (ticket.eventId !== eventId) {
      return { status: 'WRONG_EVENT' };
    }

    if (ticket.status === TicketStatus.USED) {
      return { status: 'ALREADY_USED' };
    }

    const updated = await this.prisma.ticket.updateMany({
      where: { id: ticket.id, status: TicketStatus.ISSUED },
      data: { status: TicketStatus.USED, usedAt: new Date() },
    });

    if (updated.count === 0) {
      return { status: 'ALREADY_USED' };
    }

    return { status: 'VALID' };
  }
}
