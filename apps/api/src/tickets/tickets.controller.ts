import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../guards/jwt-auth.guard';
import { RolesGuard } from '../guards/roles.guard';
import { Roles } from '../guards/roles.decorator';
import { CurrentUser } from '../guards/current-user.decorator';
import type { JwtUser } from '../guards/current-user.decorator';
import { PageQueryDto } from '../common/pagination';
import { TicketsService } from './tickets.service';

@Controller('tickets')
export class TicketsController {
  constructor(private readonly ticketsService: TicketsService) {}

  @Get()
  @Roles('CLIENT')
  @UseGuards(JwtAuthGuard, RolesGuard)
  findByUser(@CurrentUser() claims: JwtUser, @Query() query: PageQueryDto) {
    return this.ticketsService.findByUser(claims.userId, query);
  }
}
