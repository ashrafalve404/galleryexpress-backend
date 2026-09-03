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
import { Type, Transform } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { BookingSource } from '@prisma/client';

export class PassengerInfoDto {
  @ApiProperty() @IsString() name: string;
  @ApiProperty() @Matches(/^[0-9+\-\s()]{7,15}$/) phone: string;
  // Transform empty string "" -> undefined so @IsOptional skips @IsEmail validation
  @ApiPropertyOptional()
  @IsOptional()
  @IsEmail()
  @Transform(({ value }) => (value === '' || value === null ? undefined : value))
  email?: string;
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

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @Transform(({ value }) => (value === '' || value === null ? undefined : value))
  counterId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @Transform(({ value }) => (value === '' || value === null ? undefined : value))
  boardingStopId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @Transform(({ value }) => (value === '' || value === null ? undefined : value))
  droppingStopId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @Transform(({ value }) => (value === '' || value === null ? undefined : value))
  boardingPoint?: string;

  @ApiPropertyOptional() @IsOptional() @IsString() couponCode?: string;
  @ApiPropertyOptional({ enum: BookingSource })
  @IsOptional()
  @IsEnum(BookingSource)
  source?: BookingSource;
  @ApiPropertyOptional() @IsOptional() @IsString() notes?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() idempotencyKey?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() paymentMethod?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() senderPhone?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() trxId?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() paymentNotes?: string;
}

export class ConfirmBookingDto {
  @ApiProperty() @IsString() paymentProvider: string;
  @ApiPropertyOptional() @IsOptional() @IsString() providerRef?: string;
  @ApiPropertyOptional() @IsOptional() paymentMetadata?: object;
}

export class CancelBookingDto {
  @ApiPropertyOptional() @IsOptional() @IsString() reason?: string;
}
