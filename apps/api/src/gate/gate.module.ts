import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { GateController } from './gate.controller';
import { GateService } from './gate.service';

@Module({
  imports: [PrismaModule],
  controllers: [GateController],
  providers: [GateService],
})
export class GateModule {}
