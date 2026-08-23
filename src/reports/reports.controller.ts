import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { ReportsService } from './reports.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../common/decorators/current-user.decorator';
import { UserRole } from '@prisma/client';

@ApiTags('Admin - Reports')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN)
@Controller('api/v1/admin/reports')
export class ReportsController {
  constructor(private readonly reportsService: ReportsService) {}

  @Get('dashboard')
  @ApiOperation({ summary: 'Dashboard summary' })
  getDashboard(@CurrentUser() user: AuthenticatedUser) {
    return this.reportsService.getDashboardSummary(user.companyId);
  }

  @Get('revenue')
  @ApiOperation({ summary: 'Revenue report by date range' })
  getRevenue(
    @CurrentUser() user: AuthenticatedUser,
    @Query('from') from: string,
    @Query('to') to: string,
  ) {
    return this.reportsService.getRevenueByDateRange(user.companyId, from, to);
  }

  @Get('routes')
  @ApiOperation({ summary: 'Route performance report' })
  getRoutePerformance(@CurrentUser() user: AuthenticatedUser) {
    return this.reportsService.getRoutePerformance(user.companyId);
  }

  @Get('coaches')
  @ApiOperation({ summary: 'Coach performance report' })
  getCoachPerformance(@CurrentUser() user: AuthenticatedUser) {
    return this.reportsService.getCoachPerformance(user.companyId);
  }

  @Get('bookings-by-status')
  @ApiOperation({ summary: 'Bookings grouped by status' })
  getBookingsByStatus(
    @CurrentUser() user: AuthenticatedUser,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    return this.reportsService.getBookingsByStatus(user.companyId, from, to);
  }
}
