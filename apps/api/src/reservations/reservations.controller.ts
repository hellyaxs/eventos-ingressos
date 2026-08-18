import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../guards/jwt-auth.guard';
import { RolesGuard } from '../guards/roles.guard';
import { Roles } from '../guards/roles.decorator';
import { CurrentUser } from '../guards/current-user.decorator';
import type { JwtUser } from '../guards/current-user.decorator';
import { PageQueryDto } from '../common/pagination';
import { ReservationsService } from './reservations.service';
import { ReserveEventDto } from './dto/reserve-event.dto';

@Controller('events')
export class EventReservationsController {
  constructor(private readonly reservationsService: ReservationsService) {}

  @Post(':id/reserve')
  @Roles('CLIENT')
  @UseGuards(JwtAuthGuard, RolesGuard)
  reserve(
    @Param('id') id: string,
    @Body() dto: ReserveEventDto,
    @CurrentUser() claims: JwtUser,
  ) {
    return this.reservationsService.reserve(claims, id, dto);
  }
}

@Controller('reservations')
export class ReservationsController {
  constructor(private readonly reservationsService: ReservationsService) {}

  @Get()
  @Roles('CLIENT')
  @UseGuards(JwtAuthGuard, RolesGuard)
  list(@CurrentUser() claims: JwtUser, @Query() query: PageQueryDto) {
    return this.reservationsService.listUserHolds(claims, query);
  }
}
