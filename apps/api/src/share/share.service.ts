import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class ShareService {
  constructor(private readonly prisma: PrismaService) {}

  async getByShareToken(shareToken: string) {
    const ticket = await this.prisma.ticket.findUnique({
      where: { shareToken },
      select: {
        status: true,
        seatLabel: true,
        usedAt: true,
        event: {
          select: {
            title: true,
            venue: true,
            startsAt: true,
            posterUrl: true,
          },
        },
      },
    });

    if (!ticket) {
      throw new NotFoundException('Ingresso não encontrado');
    }

    return ticket;
  }
}
