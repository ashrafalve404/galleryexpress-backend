import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  ParseUUIDPipe,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiBearerAuth,
  ApiQuery,
} from '@nestjs/swagger';
import { CoachesService } from './coaches.service';
import { CreateCoachDto, UpdateCoachDto } from './dto/coach.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../common/decorators/current-user.decorator';
import { PaginationDto } from '../common/utils/pagination.util';
import { UserRole, CoachStatus } from '@prisma/client';
import { IsString, IsOptional, IsInt, Min, IsObject } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

class CreateCoachTypeDto {
  @ApiProperty() @IsString() name: string;
  @ApiPropertyOptional() @IsOptional() @IsString() description?: string;
}

class CreateSeatLayoutDto {
  @ApiProperty() @IsString() name: string;
  @ApiProperty() @IsInt() @Min(1) rows: number;
  @ApiProperty() @IsInt() @Min(1) columns: number;
  @ApiProperty() @IsObject() layoutConfig: object;
  @ApiPropertyOptional() @IsOptional() @IsString() description?: string;
}

@ApiTags('Admin - Coaches')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN)
@Controller('api/v1/admin/coaches')
export class CoachesController {
  constructor(private readonly coachesService: CoachesService) {}

  @Post()
  @ApiOperation({ summary: 'Create a new coach' })
  create(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateCoachDto) {
    return this.coachesService.create(user.companyId, dto);
  }

  @Get()
  @ApiOperation({ summary: 'List all coaches' })
  @ApiQuery({ name: 'status', enum: CoachStatus, required: false })
  findAll(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: PaginationDto & { status?: CoachStatus },
  ) {
    return this.coachesService.findAll(user.companyId, query);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get coach details with seats' })
  findOne(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.coachesService.findOne(id, user.companyId);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update coach' })
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: UpdateCoachDto,
  ) {
    return this.coachesService.update(id, user.companyId, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Deactivate coach' })
  remove(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.coachesService.remove(id, user.companyId);
  }

  @Post(':id/generate-seats')
  @ApiOperation({ summary: 'Generate seats from layout' })
  generateSeats(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthenticatedUser,
    @Body('seatLayoutId', ParseUUIDPipe) seatLayoutId: string,
  ) {
    return this.coachesService.generateSeatsForCoach(
      id,
      seatLayoutId,
      user.companyId,
    );
  }

  // Coach Types sub-routes
  @Post('types')
  @ApiOperation({ summary: 'Create coach type' })
  createCoachType(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateCoachTypeDto,
  ) {
    return this.coachesService.createCoachType(
      user.companyId,
      dto.name,
      dto.description,
    );
  }

  @Get('types')
  @ApiOperation({ summary: 'List coach types' })
  findAllCoachTypes(@CurrentUser() user: AuthenticatedUser) {
    return this.coachesService.findAllCoachTypes(user.companyId);
  }

  // Seat Layouts sub-routes
  @Post('layouts')
  @ApiOperation({ summary: 'Create seat layout' })
  createSeatLayout(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateSeatLayoutDto,
  ) {
    return this.coachesService.createSeatLayout(
      user.companyId,
      dto.name,
      dto.rows,
      dto.columns,
      dto.layoutConfig,
      dto.description,
    );
  }

  @Get('layouts')
  @ApiOperation({ summary: 'List seat layouts' })
  findAllSeatLayouts(@CurrentUser() user: AuthenticatedUser) {
    return this.coachesService.findAllSeatLayouts(user.companyId);
  }
}
