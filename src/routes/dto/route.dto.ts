import {
  IsString,
  IsOptional,
  IsNumber,
  IsEnum,
  IsBoolean,
  IsInt,
  Min,
  ValidateNested,
  IsArray,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { RouteStatus } from '@prisma/client';

export class CreateRouteStopDto {
  @ApiProperty() @IsString() locationName: string;
  @ApiProperty() @IsInt() @Min(0) sequence: number;
  @ApiPropertyOptional() @IsOptional() @IsInt() arrivalOffset?: number;
  @ApiPropertyOptional() @IsOptional() @IsInt() departureOffset?: number;
  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  boardingAllowed?: boolean;
  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  droppingAllowed?: boolean;
}

export class CreateRouteDto {
  @ApiProperty() @IsString() origin: string;
  @ApiProperty() @IsString() destination: string;
  @ApiPropertyOptional() @IsOptional() @IsNumber() distanceKm?: number;
  @ApiPropertyOptional() @IsOptional() @IsInt() durationMins?: number;
  @ApiPropertyOptional({ enum: RouteStatus })
  @IsOptional()
  @IsEnum(RouteStatus)
  status?: RouteStatus;
  @ApiPropertyOptional({ type: [CreateRouteStopDto] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateRouteStopDto)
  stops?: CreateRouteStopDto[];
}

export class UpdateRouteDto {
  @ApiPropertyOptional() @IsOptional() @IsString() origin?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() destination?: string;
  @ApiPropertyOptional() @IsOptional() @IsNumber() distanceKm?: number;
  @ApiPropertyOptional() @IsOptional() @IsInt() durationMins?: number;
  @ApiPropertyOptional({ enum: RouteStatus })
  @IsOptional()
  @IsEnum(RouteStatus)
  status?: RouteStatus;
}
