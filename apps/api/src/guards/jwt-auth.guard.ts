import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import type { CookieOptions, Response } from 'express';
import { isUuid } from '../common/ids';
import { JwtUser } from './current-user.decorator';

export const ACCESS_TOKEN_COOKIE = 'access_token';

export function readCookie(
  header: string | undefined,
  name: string,
): string | undefined {
  if (!header) return undefined;
  for (const part of header.split(';')) {
    const separator = part.indexOf('=');
    if (separator === -1) continue;
    const key = part.slice(0, separator).trim();
    const value = part.slice(separator + 1).trim();
    if (key !== name) continue;
    try {
      return decodeURIComponent(value);
    } catch {
      return value;
    }
  }
  return undefined;
}

function cookieClearOptions(secure: boolean): CookieOptions {
  return {
    httpOnly: true,
    sameSite: 'lax',
    secure,
    path: '/',
  };
}

function jwtUserFromPayload(payload: {
  sub?: string;
  email?: string;
  role?: string;
}): JwtUser | null {
  if (!payload.sub || !isUuid(payload.sub) || !payload.email || !payload.role) {
    return null;
  }
  return {
    userId: payload.sub,
    email: payload.email,
    role: payload.role,
  };
}

export function readAccessToken(
  headers: Record<string, string | undefined>,
): string | undefined {
  const cookieToken = readCookie(headers['cookie'], ACCESS_TOKEN_COOKIE);
  const header = headers['authorization'];
  const bearerToken =
    header && header.startsWith('Bearer ')
      ? header.slice('Bearer '.length).trim()
      : undefined;
  return cookieToken ?? bearerToken;
}

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const http = context.switchToHttp();
    const request = http.getRequest<{
      headers: Record<string, string | undefined>;
      user?: JwtUser;
    }>();
    const response = http.getResponse<Response>();

    const token = readAccessToken(request.headers);
    if (!token) {
      throw new UnauthorizedException('Token de acesso ausente');
    }
    const secret = this.configService.get<string>(
      'JWT_SECRET',
      'dev-secret-change-me',
    );
    const secure =
      this.configService.get<string>('NODE_ENV', 'development') ===
      'production';

    try {
      const payload = await this.jwtService.verifyAsync<{
        sub: string;
        email: string;
        role: string;
      }>(token, { secret });

      const user = jwtUserFromPayload(payload);
      if (!user) {
        response.clearCookie(ACCESS_TOKEN_COOKIE, cookieClearOptions(secure));
        throw new UnauthorizedException('Sessão inválida');
      }

      request.user = user;
      return true;
    } catch (err) {
      if (err instanceof UnauthorizedException) {
        throw err;
      }
      if (err instanceof Error && err.name === 'TokenExpiredError') {
        throw new UnauthorizedException('Token expirado');
      }
      throw new UnauthorizedException('Token inválido');
    }
  }
}

@Injectable()
export class OptionalJwtAuthGuard implements CanActivate {
  constructor(
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const http = context.switchToHttp();
    const request = http.getRequest<{
      headers: Record<string, string | undefined>;
      user?: JwtUser;
    }>();
    const response = http.getResponse<Response>();

    const token = readAccessToken(request.headers);
    if (!token) {
      return true;
    }

    const secret = this.configService.get<string>(
      'JWT_SECRET',
      'dev-secret-change-me',
    );
    const secure =
      this.configService.get<string>('NODE_ENV', 'development') ===
      'production';

    try {
      const payload = await this.jwtService.verifyAsync<{
        sub: string;
        email: string;
        role: string;
      }>(token, { secret });
      const user = jwtUserFromPayload(payload);
      if (user) {
        request.user = user;
      } else {
        // cookie pré-migração (CUID): ignora claims e limpa a sessão
        response.clearCookie(ACCESS_TOKEN_COOKIE, cookieClearOptions(secure));
      }
    } catch {
      // rota pública: cookie/token inválido não bloqueia a leitura
    }

    return true;
  }
}
