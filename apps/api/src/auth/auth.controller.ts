import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Res,
  UseGuards,
} from '@nestjs/common';
import type { CookieOptions, Response } from 'express';
import { ConfigService } from '@nestjs/config';
import { AuthService } from './auth.service';
import type { AuthUser } from './auth.service';
import { LoginDto } from './dto/login.dto';
import { JwtAuthGuard } from '../guards/jwt-auth.guard';
import { CurrentUser } from '../guards/current-user.decorator';
import type { JwtUser } from '../guards/current-user.decorator';

export const ACCESS_TOKEN_COOKIE = 'access_token';

@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly configService: ConfigService,
  ) {}

  private cookieOptions(): CookieOptions {
    const secure =
      this.configService.get<string>('NODE_ENV', 'development') ===
      'production';
    return {
      httpOnly: true,
      sameSite: 'lax',
      secure,
      path: '/',
      maxAge: 7 * 24 * 60 * 60 * 1000,
    };
  }

  @Post('login')
  @HttpCode(HttpStatus.OK)
  async login(
    @Body() dto: LoginDto,
    @Res({ passthrough: true }) res: Response,
  ): Promise<{ user: AuthUser }> {
    const result = await this.authService.login(dto);
    res.cookie(ACCESS_TOKEN_COOKIE, result.token, this.cookieOptions());
    return { user: result.user };
  }

  @Post('logout')
  @HttpCode(HttpStatus.OK)
  logout(@Res({ passthrough: true }) res: Response) {
    const { maxAge: _maxAge, ...clearOptions } = this.cookieOptions();
    res.clearCookie(ACCESS_TOKEN_COOKIE, clearOptions);
    return { ok: true };
  }

  @Get('me')
  @UseGuards(JwtAuthGuard)
  me(@CurrentUser() claims: JwtUser) {
    return this.authService.me(claims);
  }
}
