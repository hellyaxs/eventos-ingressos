import { Type } from 'class-transformer';
import {
  IsEnum,
  IsInt,
  IsISO8601,
  IsOptional,
  IsString,
  IsUrl,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { SaleMode } from '@prisma/client';

export class CreateEventDto {
  @IsString({ message: 'Título inválido' })
  @MaxLength(200, { message: 'Título deve ter no máximo 200 caracteres' })
  title!: string;

  @IsOptional()
  @IsString({ message: 'Descrição inválida' })
  @MaxLength(2000, { message: 'Descrição deve ter no máximo 2000 caracteres' })
  description?: string;

  @IsUrl(
    { require_protocol: true, protocols: ['https'] },
    { message: 'Poster deve ser uma URL https válida' },
  )
  posterUrl!: string;

  @IsString({ message: 'Local inválido' })
  @MaxLength(200, { message: 'Local deve ter no máximo 200 caracteres' })
  venue!: string;

  @IsISO8601({}, { message: 'Data de início deve ser uma data ISO 8601' })
  startsAt!: string;

  @Type(() => Number)
  @IsInt({ message: 'Capacidade deve ser um número inteiro' })
  @Min(1, { message: 'Capacidade deve ser maior que zero' })
  capacity!: number;

  @Type(() => Number)
  @IsInt({ message: 'Preço deve ser um número inteiro' })
  @Min(0, { message: 'Preço deve ser maior ou igual a zero' })
  priceCents!: number;

  @IsOptional()
  @IsEnum(SaleMode, { message: 'Modo de venda inválido' })
  saleMode?: SaleMode;

  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'Linhas deve ser um número inteiro' })
  @Min(1, { message: 'Linhas deve ser maior que zero' })
  @Max(26, { message: 'Máximo de 26 linhas' })
  rows?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'Colunas deve ser um número inteiro' })
  @Min(1, { message: 'Colunas deve ser maior que zero' })
  cols?: number;

  @Type(() => Number)
  @IsInt({ message: 'tmdbId deve ser um número inteiro' })
  @Min(1, { message: 'tmdbId deve ser maior que zero' })
  tmdbId!: number;
}

export class UpdateEventDto {
  @IsOptional()
  @IsString({ message: 'Título inválido' })
  @MaxLength(200, { message: 'Título deve ter no máximo 200 caracteres' })
  title?: string;

  @IsOptional()
  @IsString({ message: 'Descrição inválida' })
  @MaxLength(2000, { message: 'Descrição deve ter no máximo 2000 caracteres' })
  description?: string;

  @IsOptional()
  @IsUrl(
    { require_protocol: true, protocols: ['https'] },
    { message: 'Poster deve ser uma URL https válida' },
  )
  posterUrl?: string;

  @IsOptional()
  @IsString({ message: 'Local inválido' })
  @MaxLength(200, { message: 'Local deve ter no máximo 200 caracteres' })
  venue?: string;

  @IsOptional()
  @IsISO8601({}, { message: 'Data de início deve ser uma data ISO 8601' })
  startsAt?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'Capacidade deve ser um número inteiro' })
  @Min(1, { message: 'Capacidade deve ser maior que zero' })
  capacity?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'Preço deve ser um número inteiro' })
  @Min(0, { message: 'Preço deve ser maior ou igual a zero' })
  priceCents?: number;

  @IsOptional()
  @IsEnum(SaleMode, { message: 'Modo de venda inválido' })
  saleMode?: SaleMode;

  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'Linhas deve ser um número inteiro' })
  @Min(1, { message: 'Linhas deve ser maior que zero' })
  @Max(26, { message: 'Máximo de 26 linhas' })
  rows?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'Colunas deve ser um número inteiro' })
  @Min(1, { message: 'Colunas deve ser maior que zero' })
  cols?: number;
}
