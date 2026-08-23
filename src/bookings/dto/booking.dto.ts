import {
  IsUUID,
  IsString,
  IsOptional,
  IsArray,
  IsEnum,
  ValidateNested,
  IsEmail,
  Matches,
  IsInt,
  Min,
  Max,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { BookingSource } from '@prisma/client';

export class PassengerInfoDto {
  @ApiProperty() @IsString() name: string;
  @ApiProperty() @Matches(/^[0-9+\-\s()]{7,15}$/) phone: string;
  @ApiPropertyOptional() @IsOptional() @IsEmail() email?: string;
  @ApiPropertyOptional({ enum: ['MALE', 'FEMALE', 'OTHER'] })
  @IsOptional()
  @IsString()
  gender?: string;
  @ApiPropertyOptional() @IsOptional() @IsInt() @Min(1) @Max(120) age?: number;
  @ApiPropertyOptional() @IsOptional() @IsString() nationalId?: string;
}

export class BookingSeatInfoDto {
  @ApiProperty() @IsUUID() seatId: string;
  @ApiPropertyOptional() @IsOptional() @IsUUID() fareId?: string;
  @ApiProperty()
  @ValidateNested()
  @Type(() => PassengerInfoDto)
  passenger: PassengerInfoDto;
}

export class CreateBookingDto {
  @ApiProperty() @IsUUID() scheduleId: string;
  @ApiProperty({ type: [BookingSeatInfoDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => BookingSeatInfoDto)
  seats: BookingSeatInfoDto[];

  @ApiPropertyOptional() @IsOptional() @IsString() couponCode?: string;
  @ApiPropertyOptional({ enum: BookingSource })
  @IsOptional()
  @IsEnum(BookingSource)
  source?: BookingSource;
  @ApiPropertyOptional() @IsOptional() @IsString() notes?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() idempotencyKey?: string;
}

export class ConfirmBookingDto {
  @ApiProperty() @IsString() paymentProvider: string;
  @ApiPropertyOptional() @IsOptional() @IsString() providerRef?: string;
  @ApiPropertyOptional() @IsOptional() paymentMetadata?: object;
}

export class CancelBookingDto {
  @ApiPropertyOptional() @IsOptional() @IsString() reason?: string;
}
