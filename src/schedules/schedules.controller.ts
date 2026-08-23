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
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { SchedulesService } from './schedules.service';
import {
  CreateScheduleDto,
  UpdateScheduleDto,
  SearchScheduleDto,
} from './dto/schedule.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../common/decorators/current-user.decorator';
import { PaginationDto } from '../common/utils/pagination.util';
import { Public } from '../common/decorators/public.decorator';
import { UserRole } from '@prisma/client';

@ApiTags('Schedules')
@Controller('api/v1')
export class SchedulesController {
  constructor(private readonly schedulesService: SchedulesService) {}

  @Public()
  @Get('schedules/search')
  @ApiOperation({ summary: 'Search schedules (public)' })
  search(
    @Query() dto: SearchScheduleDto,
    @Query('companyId') companyId: string,
  ) {
    return this.schedulesService.search(companyId, dto);
  }

  @Public()
  @Get('schedules/:id')
  @ApiOperation({ summary: 'Get schedule details (public)' })
  findOnePublic(
    @Param('id', ParseUUIDPipe) id: string,
    @Query('companyId') companyId: string,
  ) {
    return this.schedulesService.findOne(id, companyId);
  }

  @Public()
  @Get('schedules/:id/seats')
  @ApiOperation({ summary: 'Get seat availability for a schedule (public)' })
  getSeats(
    @Param('id', ParseUUIDPipe) id: string,
    @Query('companyId') companyId: string,
  ) {
    return this.schedulesService.getSeats(id, companyId);
  }

  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.STAFF)
  @Post('admin/schedules')
  @ApiOperation({ summary: 'Create schedule (admin)' })
  create(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateScheduleDto,
  ) {
    return this.schedulesService.create(user.companyId, dto);
  }

  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.STAFF)
  @Get('admin/schedules')
  @ApiOperation({ summary: 'List all schedules (admin)' })
  findAll(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: PaginationDto & { date?: string; routeId?: string },
  ) {
    return this.schedulesService.findAll(user.companyId, query);
  }

  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.STAFF)
  @Get('admin/schedules/:id')
  @ApiOperation({ summary: 'Get schedule (admin)' })
  findOne(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.schedulesService.findOne(id, user.companyId);
  }

  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN)
  @Patch('admin/schedules/:id')
  @ApiOperation({ summary: 'Update schedule (admin)' })
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: UpdateScheduleDto,
  ) {
    return this.schedulesService.update(id, user.companyId, dto);
  }

  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN)
  @Delete('admin/schedules/:id')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Cancel schedule (admin)' })
  cancel(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.schedulesService.cancel(id, user.companyId);
  }
}
