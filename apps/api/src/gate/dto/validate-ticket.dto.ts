import { IsNotEmpty, IsString, Length } from 'class-validator';

export class ValidateTicketDto {
  @IsString()
  @IsNotEmpty()
  @Length(8, 64)
  ticketCode!: string;
}
