import { Body, Controller, HttpCode, Param, Post } from '@nestjs/common';
import { GateService } from './gate.service';
import { ValidateTicketDto } from './dto/validate-ticket.dto';

@Controller('gate')
export class GateController {
  constructor(private readonly gateService: GateService) {}

  @Post(':eventId/validate')
  @HttpCode(200)
  validate(@Param('eventId') eventId: string, @Body() dto: ValidateTicketDto) {
    return this.gateService.validate(dto.ticketCode, eventId);
  }
}
