import { IsUUID, IsOptional, IsDateString, IsBoolean, IsString } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateFareDto {
  @ApiProperty() @IsUUID() routeId: string;
  @ApiPropertyOptional() @IsOptional() @IsString() coachTypeId?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() fromStopId?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() toStopId?: string;
  @ApiProperty({ example: '750.00' }) @IsString() baseAmount: string;
  @ApiProperty() @IsDateString() effectiveFrom: string;
  @ApiPropertyOptional() @IsOptional() @IsDateString() effectiveTo?: string;
  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class UpdateFareDto {
  @ApiPropertyOptional() @IsOptional() @IsString() routeId?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() coachTypeId?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() baseAmount?: string;
  @ApiPropertyOptional() @IsOptional() @IsDateString() effectiveFrom?: string;
  @ApiPropertyOptional() @IsOptional() @IsDateString() effectiveTo?: string;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() isActive?: boolean;
}
