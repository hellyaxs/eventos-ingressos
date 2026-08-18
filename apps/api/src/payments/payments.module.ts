import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { PaymentsController } from './payments.controller';
import { PaymentsService } from './payments.service';
import { PaymentProcessor } from './payment.processor';
import { PAYMENTS_QUEUE } from './payments.constants';
import { AuthModule } from '../auth/auth.module';
import { PrismaModule } from '../prisma/prisma.module';
import { TicketsModule } from '../tickets/tickets.module';

@Module({
  imports: [
    BullModule.registerQueue({
      name: PAYMENTS_QUEUE,
    }),
    PrismaModule,
    TicketsModule,
    AuthModule,
  ],
  controllers: [PaymentsController],
  providers: [PaymentsService, PaymentProcessor],
  exports: [PaymentsService],
})
export class PaymentsModule {}
