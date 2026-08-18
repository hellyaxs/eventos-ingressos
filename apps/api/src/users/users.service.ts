import { Injectable, NotFoundException } from '@nestjs/common';
import {
  PageQueryDto,
  resolvePage,
  toPaginatedResponse,
} from '../common/pagination';
import { PrismaService } from '../prisma/prisma.service';
import { JwtUser } from '../guards/current-user.decorator';
import { UpdateMeDto } from './dto/update-me.dto';

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  private readonly safeSelect = {
    id: true,
    name: true,
    email: true,
    role: true,
    avatar: true,
    createdAt: true,
    updatedAt: true,
  } as const;

  async me(claims: JwtUser) {
    const user = await this.prisma.user.findUnique({
      where: { id: claims.userId },
      select: this.safeSelect,
    });
    if (!user) {
      throw new NotFoundException('Usuário não encontrado');
    }
    return user;
  }

  async updateMe(claims: JwtUser, dto: UpdateMeDto) {
    return this.prisma.user.update({
      where: { id: claims.userId },
      data: dto,
      select: this.safeSelect,
    });
  }

  async listAll(query: PageQueryDto) {
    const { page, limit, skip } = resolvePage(query);
    const [users, total] = await this.prisma.$transaction([
      this.prisma.user.findMany({
        select: { id: true, name: true, email: true, role: true, avatar: true },
        orderBy: { createdAt: 'asc' },
        skip,
        take: limit,
      }),
      this.prisma.user.count(),
    ]);

    return toPaginatedResponse({
      items: users,
      page,
      limit,
      total,
    });
  }

  async findPublic(id: string) {
    const user = await this.prisma.user.findUnique({
      where: { id },
      select: { id: true, name: true, avatar: true },
    });
    if (!user) {
      throw new NotFoundException('Usuário não encontrado');
    }
    return user;
  }
}
