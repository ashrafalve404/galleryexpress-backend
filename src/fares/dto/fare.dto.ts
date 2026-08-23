import { IsUUID, IsOptional, IsDateString, IsBoolean } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateFareDto {
  @ApiProperty() @IsUUID() routeId: string;
  @ApiPropertyOptional() @IsOptional() @IsUUID() coachTypeId?: string;
  @ApiPropertyOptional() @IsOptional() @IsUUID() fromStopId?: string;
  @ApiPropertyOptional() @IsOptional() @IsUUID() toStopId?: string;
  @ApiProperty({ example: '750.00' }) baseAmount: string;
  @ApiProperty() @IsDateString() effectiveFrom: string;
  @ApiPropertyOptional() @IsOptional() @IsDateString() effectiveTo?: string;
  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class UpdateFareDto {
  @ApiPropertyOptional() @IsOptional() baseAmount?: string;
  @ApiPropertyOptional() @IsOptional() @IsDateString() effectiveFrom?: string;
  @ApiPropertyOptional() @IsOptional() @IsDateString() effectiveTo?: string;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() isActive?: boolean;
}
