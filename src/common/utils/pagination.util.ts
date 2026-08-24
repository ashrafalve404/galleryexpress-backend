import { IsOptional, IsInt, IsString, Min, Max } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class PaginationDto {
  @ApiPropertyOptional({ default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @ApiPropertyOptional({ default: 20 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number = 20;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  search?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  sortBy?: string;

  @ApiPropertyOptional({ enum: ['asc', 'desc'], default: 'desc' })
  @IsOptional()
  @IsString()
  sort?: 'asc' | 'desc' = 'desc';
}

export function paginatedResponse<T>(
  data: T[],
  total: number,
  page: number,
  limit: number,
) {
  return {
    data,
    meta: {
      page: Number(page) || 1,
      limit: Number(limit) || 20,
      total: Number(total) || 0,
      totalPages: Math.ceil((Number(total) || 0) / (Number(limit) || 20)),
    },
  };
}

export function getPaginationParams(dto: PaginationDto): {
  skip: number;
  take: number;
} {
  const p = typeof dto?.page === 'string' ? parseInt(dto.page, 10) : Number(dto?.page);
  const l = typeof dto?.limit === 'string' ? parseInt(dto.limit, 10) : Number(dto?.limit);

  const page = isNaN(p) || p < 1 ? 1 : p;
  const limit = isNaN(l) || l < 1 ? 20 : l;

  return {
    skip: (page - 1) * limit,
    take: limit,
  };
}
