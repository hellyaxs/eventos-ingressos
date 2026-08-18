import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import {
  EventReservationsController,
  ReservationsController,
} from './reservations.controller';
import { ReservationsService } from './reservations.service';

@Module({
  imports: [AuthModule],
  controllers: [EventReservationsController, ReservationsController],
  providers: [ReservationsService],
  exports: [ReservationsService],
})
export class ReservationsModule {}
