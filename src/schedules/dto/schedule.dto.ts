import {
  IsString,
  IsOptional,
  IsBoolean,
  IsUUID,
  IsArray,
  IsDateString,
  IsEnum,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ScheduleStatus } from '@prisma/client';

export class CreateScheduleDto {
  @ApiProperty() @IsUUID() coachId: string;
  @ApiProperty() @IsUUID() routeId: string;
  @ApiProperty({ description: 'Date in YYYY-MM-DD format' })
  @IsString()
  departureDate: string;
  @ApiProperty({ description: 'Time in HH:mm format' })
  @IsString()
  departureTime: string;
  @ApiProperty({ description: 'Time in HH:mm format' })
  @IsString()
  arrivalTime: string;
  @ApiPropertyOptional({ default: false })
  @IsOptional()
  @IsBoolean()
  isRecurring?: boolean;
  @ApiPropertyOptional({ type: [Number], description: '0=Sun, 1=Mon...6=Sat' })
  @IsOptional()
  @IsArray()
  recurringDays?: number[];
  @ApiPropertyOptional() @IsOptional() @IsDateString() bookingOpenTime?: string;
  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  bookingCloseTime?: string;
  @ApiPropertyOptional({ enum: ScheduleStatus })
  @IsOptional()
  @IsEnum(ScheduleStatus)
  status?: ScheduleStatus;
  @ApiPropertyOptional() @IsOptional() @IsString() notes?: string;
}

export class UpdateScheduleDto {
  @ApiPropertyOptional() @IsOptional() @IsUUID() coachId?: string;
  @ApiPropertyOptional() @IsOptional() @IsUUID() routeId?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() departureDate?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() departureTime?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() arrivalTime?: string;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() isRecurring?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsArray() recurringDays?: number[];
  @ApiPropertyOptional() @IsOptional() @IsDateString() bookingOpenTime?: string;
  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  bookingCloseTime?: string;
  @ApiPropertyOptional({ enum: ScheduleStatus })
  @IsOptional()
  @IsEnum(ScheduleStatus)
  status?: ScheduleStatus;
  @ApiPropertyOptional() @IsOptional() @IsString() notes?: string;
}

export class SearchScheduleDto {
  @ApiPropertyOptional() @IsOptional() @IsString() origin?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() destination?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() from?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() to?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() date?: string;
  @ApiPropertyOptional() @IsOptional() @IsUUID() routeId?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() companyId?: string;
}
