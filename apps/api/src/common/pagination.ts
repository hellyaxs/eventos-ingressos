import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsString, Max, Min } from 'class-validator';

export class PageQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  limit = 12;
}

export class SearchPageQueryDto extends PageQueryDto {
  @IsOptional()
  @IsString()
  q?: string;
}

export type PaginatedResponse<T> = {
  items: T[];
  page: number;
  limit: number;
  total: number;
  hasMore: boolean;
};

export function resolvePage(input?: PageQueryDto): {
  page: number;
  limit: number;
  skip: number;
} {
  const page = Math.max(1, input?.page ?? 1);
  const limit = Math.min(50, Math.max(1, input?.limit ?? 12));
  const skip = (page - 1) * limit;
  return { page, limit, skip };
}

export function toPaginatedResponse<T>(params: {
  items: T[];
  page: number;
  limit: number;
  total: number;
}): PaginatedResponse<T> {
  const { items, page, limit, total } = params;
  return {
    items,
    page,
    limit,
    total,
    hasMore: page * limit < total,
  };
}
