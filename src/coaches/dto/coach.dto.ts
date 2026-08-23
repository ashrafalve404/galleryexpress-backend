import {
  IsString,
  IsOptional,
  IsBoolean,
  IsInt,
  IsEnum,
  IsUUID,
  MinLength,
  Min,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { CoachStatus } from '@prisma/client';

export class CreateCoachDto {
  @ApiProperty()
  @IsString()
  @MinLength(2)
  name: string;

  @ApiProperty()
  @IsString()
  coachNumber: string;

  @ApiProperty()
  @IsString()
  registrationNumber: string;

  @ApiProperty()
  @IsUUID()
  coachTypeId: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  seatLayoutId?: string;

  @ApiPropertyOptional({ default: false })
  @IsOptional()
  @IsBoolean()
  isAC?: boolean;

  @ApiProperty()
  @IsInt()
  @Min(1)
  totalSeats: number;

  @ApiPropertyOptional({ enum: CoachStatus, default: 'ACTIVE' })
  @IsOptional()
  @IsEnum(CoachStatus)
  status?: CoachStatus;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  description?: string;
}

export class UpdateCoachDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  name?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  coachNumber?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  registrationNumber?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  coachTypeId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  seatLayoutId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isAC?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(1)
  totalSeats?: number;

  @ApiPropertyOptional({ enum: CoachStatus })
  @IsOptional()
  @IsEnum(CoachStatus)
  status?: CoachStatus;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  description?: string;
}
