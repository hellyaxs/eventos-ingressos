import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { PageQueryDto, SearchPageQueryDto } from '../common/pagination';
import { JwtAuthGuard, OptionalJwtAuthGuard } from '../guards/jwt-auth.guard';
import { RolesGuard } from '../guards/roles.guard';
import { Roles } from '../guards/roles.decorator';
import { CurrentUser } from '../guards/current-user.decorator';
import type { JwtUser } from '../guards/current-user.decorator';
import { EventsService } from './events.service';
import { CreateEventDto, UpdateEventDto } from './dto/create-event.dto';

@Controller('events')
export class EventsController {
  constructor(private readonly eventsService: EventsService) {}

  @Post()
  @Roles('ORGANIZER')
  @UseGuards(JwtAuthGuard, RolesGuard)
  create(@CurrentUser() claims: JwtUser, @Body() dto: CreateEventDto) {
    return this.eventsService.create(claims, dto);
  }

  @Get()
  @UseGuards(OptionalJwtAuthGuard)
  listPublished(
    @Query() query: SearchPageQueryDto,
    @CurrentUser() claims?: JwtUser,
  ) {
    return this.eventsService.listPublished(query, claims);
  }

  @Get('mine')
  @Roles('ORGANIZER')
  @UseGuards(JwtAuthGuard, RolesGuard)
  listOrganizer(@CurrentUser() claims: JwtUser, @Query() query: PageQueryDto) {
    return this.eventsService.listOrganizer(claims, query);
  }

  @Get(':id/seats')
  @UseGuards(OptionalJwtAuthGuard)
  getSeatMap(@Param('id') id: string, @CurrentUser() claims?: JwtUser) {
    return this.eventsService.getSeatMap(id, claims);
  }

  @Patch(':id')
  @Roles('ORGANIZER')
  @UseGuards(JwtAuthGuard, RolesGuard)
  update(
    @CurrentUser() claims: JwtUser,
    @Param('id') id: string,
    @Body() dto: UpdateEventDto,
  ) {
    return this.eventsService.update(claims, id, dto);
  }

  @Post(':id/publish')
  @Roles('ORGANIZER')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @HttpCode(HttpStatus.OK)
  publish(@Param('id') id: string) {
    return this.eventsService.publish(id);
  }
}
