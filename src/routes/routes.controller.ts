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
import { RoutesService } from './routes.service';
import {
  CreateRouteDto,
  UpdateRouteDto,
  CreateRouteStopDto,
} from './dto/route.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../common/decorators/current-user.decorator';
import { PaginationDto } from '../common/utils/pagination.util';
import { Public } from '../common/decorators/public.decorator';
import { UserRole } from '@prisma/client';

@ApiTags('Routes')
@Controller('api/v1')
export class RoutesController {
  constructor(private readonly routesService: RoutesService) {}

  // ---- Public endpoints ----
  @Public()
  @Get('routes')
  @ApiOperation({ summary: 'Search available routes (public)' })
  searchRoutes(
    @Query('companyId') companyId: string,
    @Query('origin') origin?: string,
    @Query('destination') destination?: string,
  ) {
    return this.routesService.searchRoutes(companyId, origin, destination);
  }

  @Public()
  @Get('routes/:id')
  @ApiOperation({ summary: 'Get route details (public)' })
  findOnePublic(
    @Param('id', ParseUUIDPipe) id: string,
    @Query('companyId') companyId: string,
  ) {
    return this.routesService.findOne(id, companyId);
  }

  // ---- Admin endpoints ----
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.COUNTER_MANAGER, UserRole.STAFF)
  @Post('admin/routes')
  @ApiOperation({ summary: 'Create route (admin)' })
  create(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateRouteDto) {
    return this.routesService.create(user.companyId, dto);
  }

  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.COUNTER_MANAGER, UserRole.STAFF)
  @Get('admin/routes')
  @ApiOperation({ summary: 'List all routes (admin)' })
  findAll(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: PaginationDto,
  ) {
    return this.routesService.findAll(user.companyId, query);
  }

  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.COUNTER_MANAGER, UserRole.STAFF)
  @Get('admin/routes/:id')
  @ApiOperation({ summary: 'Get route (admin)' })
  findOne(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.routesService.findOne(id, user.companyId);
  }

  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN)
  @Patch('admin/routes/:id')
  @ApiOperation({ summary: 'Update route (admin)' })
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: UpdateRouteDto,
  ) {
    return this.routesService.update(id, user.companyId, dto);
  }

  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN)
  @Delete('admin/routes/:id')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Deactivate route (admin)' })
  remove(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.routesService.remove(id, user.companyId);
  }

  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN)
  @Delete('admin/routes/:id/permanent')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Permanently delete route (admin)' })
  hardRemove(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.routesService.hardRemove(id, user.companyId);
  }

  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN)
  @Post('admin/routes/:id/stops')
  @ApiOperation({ summary: 'Add stop to route (admin)' })
  addStop(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateRouteStopDto,
  ) {
    return this.routesService.addStop(id, user.companyId, dto);
  }

  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN)
  @Patch('admin/routes/:id/stops/:stopId')
  @ApiOperation({ summary: 'Update stop (admin)' })
  updateStop(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('stopId', ParseUUIDPipe) stopId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: Partial<CreateRouteStopDto>,
  ) {
    return this.routesService.updateStop(id, stopId, user.companyId, dto);
  }

  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN)
  @Delete('admin/routes/:id/stops/:stopId')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Remove stop (admin)' })
  removeStop(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('stopId', ParseUUIDPipe) stopId: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.routesService.removeStop(id, stopId, user.companyId);
  }
}
