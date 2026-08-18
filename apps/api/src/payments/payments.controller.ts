import {
  BadRequestException,
  Body,
  Controller,
  Get,
  NotFoundException,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import {
  ArrayNotEmpty,
  IsArray,
  IsIn,
  IsOptional,
  IsString,
  MinLength,
} from 'class-validator';
import { JwtAuthGuard } from '../guards/jwt-auth.guard';
import { RolesGuard } from '../guards/roles.guard';
import { Roles } from '../guards/roles.decorator';
import { CurrentUser } from '../guards/current-user.decorator';
import type { JwtUser } from '../guards/current-user.decorator';
import { PaymentsService } from './payments.service';

class EnqueuePaymentDto {
  @IsOptional()
  @IsArray()
  @ArrayNotEmpty()
  @IsString({ each: true })
  @MinLength(1, { each: true })
  reservationIds?: string[];

  @IsOptional()
  @IsString()
  @MinLength(1)
  reservationId?: string;

  @IsIn(['approve', 'reject'])
  simulatedOutcome!: 'approve' | 'reject';
}

@Controller('payments')
export class PaymentsController {
  constructor(private readonly paymentsService: PaymentsService) {}

  @Post()
  async enqueue(@Body() body: EnqueuePaymentDto) {
    const reservationIds = body.reservationIds
      ? body.reservationIds
      : body.reservationId
        ? [body.reservationId]
        : [];
    if (reservationIds.length === 0) {
      throw new BadRequestException('Informe reservationId ou reservationIds');
    }
    const payments = await this.paymentsService.enqueue({
      reservationIds,
      simulatedOutcome: body.simulatedOutcome,
    });
    return body.reservationId ? payments[0] : payments;
  }

  @Get('by-reservation/:reservationId')
  @Roles('CLIENT')
  @UseGuards(JwtAuthGuard, RolesGuard)
  getByReservation(
    @Param('reservationId') reservationId: string,
    @CurrentUser() claims: JwtUser,
  ) {
    return this.paymentsService.getByReservation(claims.userId, reservationId);
  }

  @Get(':id')
  async get(@Param('id') id: string) {
    const payment = await this.paymentsService.get(id);
    if (!payment) {
      throw new NotFoundException('Pagamento não encontrado');
    }
    return payment;
  }
}
