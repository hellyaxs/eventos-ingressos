import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AuthModule } from '../auth/auth.module';
import { PrismaModule } from '../prisma/prisma.module';
import { TicketsController } from './tickets.controller';
import { TicketsService } from './tickets.service';

@Module({
  imports: [PrismaModule, AuthModule, ConfigModule],
  controllers: [TicketsController],
  providers: [TicketsService],
  exports: [TicketsService, TicketsModule],
})
export class TicketsModule {}
