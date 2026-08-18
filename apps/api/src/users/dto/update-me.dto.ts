import { IsOptional, IsString, IsUrl, MaxLength } from 'class-validator';

export class UpdateMeDto {
  @IsOptional()
  @IsString({ message: 'Nome inválido' })
  @MaxLength(120, { message: 'Nome deve ter no máximo 120 caracteres' })
  name?: string;

  @IsOptional()
  @IsUrl({}, { message: 'Avatar deve ser uma URL válida' })
  avatar?: string;
}
