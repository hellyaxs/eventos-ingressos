import { Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcryptjs';
import { PrismaService } from '../prisma/prisma.service';
import { isUuid } from '../common/ids';
import { JwtUser } from '../guards/current-user.decorator';
import { LoginDto } from './dto/login.dto';

export type Roles = 'ORGANIZER' | 'CLIENT' | 'GATE';

export interface AuthUser {
  id: string;
  name: string;
  email: string;
  role: Roles;
  avatar: string | null;
}

export interface LoginResult {
  token: string;
  user: AuthUser;
}

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
  ) {}

  async login(dto: LoginDto): Promise<LoginResult> {
    const user = await this.prisma.user.findUnique({
      where: { email: dto.email.toLowerCase() },
    });

    if (!user) {
      throw new UnauthorizedException('E-mail ou senha incorretos');
    }

    const passwordOk = await bcrypt.compare(dto.password, user.passwordHash);
    if (!passwordOk) {
      throw new UnauthorizedException('E-mail ou senha incorretos');
    }

    const secret = this.configService.get<string>(
      'JWT_SECRET',
      'dev-secret-change-me',
    );

    const token = await this.jwtService.signAsync(
      { sub: user.id, email: user.email, role: user.role },
      { secret, expiresIn: '7d' },
    );

    this.logger.log(`User ${user.email} logged in`);
    return {
      token,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        avatar: user.avatar,
      },
    };
  }

  async me(claims: JwtUser): Promise<AuthUser> {
    if (!isUuid(claims.userId)) {
      throw new UnauthorizedException('Sessão inválida');
    }

    const user = await this.prisma.user.findUnique({
      where: { id: claims.userId },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        avatar: true,
      },
    });

    if (!user) {
      throw new UnauthorizedException('Sessão inválida');
    }

    return user;
  }
}
