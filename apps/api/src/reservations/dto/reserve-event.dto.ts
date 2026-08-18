import { ArrayNotEmpty, IsArray, IsNotEmpty, IsString } from 'class-validator';

export class ReserveEventDto {
  @IsArray({ message: 'Assentos deve ser uma lista' })
  @ArrayNotEmpty({ message: 'Nenhum assento informado' })
  @IsString({ each: true, message: 'Assento deve ser um texto' })
  @IsNotEmpty({ each: true, message: 'Assento não pode ser vazio' })
  seatIds!: string[];
}
