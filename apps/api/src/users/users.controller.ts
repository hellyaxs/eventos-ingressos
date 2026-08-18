import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Query,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../guards/jwt-auth.guard';
import { RolesGuard } from '../guards/roles.guard';
import { Roles } from '../guards/roles.decorator';
import { CurrentUser } from '../guards/current-user.decorator';
import type { JwtUser } from '../guards/current-user.decorator';
import { PageQueryDto } from '../common/pagination';
import { UsersService } from './users.service';
import { UpdateMeDto } from './dto/update-me.dto';

@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get('me')
  @UseGuards(JwtAuthGuard)
  me(@CurrentUser() claims: JwtUser) {
    return this.usersService.me(claims);
  }

  @Patch('me')
  @UseGuards(JwtAuthGuard)
  updateMe(@CurrentUser() claims: JwtUser, @Body() dto: UpdateMeDto) {
    return this.usersService.updateMe(claims, dto);
  }

  @Get()
  @Roles('ORGANIZER')
  @UseGuards(JwtAuthGuard, RolesGuard)
  listAll(@Query() query: PageQueryDto) {
    return this.usersService.listAll(query);
  }

  @Get(':id')
  findPublic(@Param('id') id: string) {
    return this.usersService.findPublic(id);
  }
}
