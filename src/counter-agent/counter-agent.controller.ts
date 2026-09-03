import {
  Controller,
  Post,
  Get,
  Body,
  Param,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { CounterAgentService } from './counter-agent.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../common/decorators/current-user.decorator';
import { UserRole } from '@prisma/client';
import { IsInt, IsString, IsUUID, Min, IsOptional } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

class BuyBulkDto {
  @ApiProperty() @IsUUID() routeId: string;
  @ApiProperty({ minimum: 10 }) @IsInt() @Min(10) quantity: number;
  @ApiProperty({ required: false }) @IsOptional() @IsString() paymentMethod?: string;
  @ApiProperty({ required: false }) @IsOptional() @IsString() senderPhone?: string;
  @ApiProperty({ required: false }) @IsOptional() @IsString() trxId?: string;
  @ApiProperty({ required: false }) @IsOptional() @IsString() paymentNotes?: string;
}

class AssignCounterDto {
  @ApiProperty() @IsUUID() counterId: string;
}

class SubmitKycDto {
  @ApiProperty() @IsString() nidNumber: string;
  @ApiProperty() @IsString() nidFrontDocUrl: string;
  @ApiProperty() @IsString() nidBackDocUrl: string;
}

@ApiTags('Counter Agent Portal')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.COUNTER_AGENT, UserRole.SUPER_ADMIN, UserRole.ADMIN)
@Controller('api/v1/counter-agent')
export class CounterAgentController {
  constructor(private readonly svc: CounterAgentService) {}

  @Post('kyc/submit')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Submit NID KYC Verification documents' })
  submitKyc(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: SubmitKycDto,
  ) {
    return this.svc.submitKyc(user.id, user.companyId, dto);
  }

  @Get('kyc/status')
  @ApiOperation({ summary: 'Get current agent KYC verification status' })
  getKycStatus(@CurrentUser() user: AuthenticatedUser) {
    return this.svc.getKycStatus(user.id);
  }

  @Get('admin/kyc/requests')
  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN)
  @ApiOperation({ summary: 'List counter agent KYC verification requests' })
  getAdminKycRequests(@CurrentUser() user: AuthenticatedUser) {
    return this.svc.getAdminKycRequests(user.companyId);
  }

  @Post('admin/kyc/:agentId/approve')
  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN)
  @ApiOperation({ summary: 'Approve counter agent KYC verification' })
  approveKyc(
    @CurrentUser() user: AuthenticatedUser,
    @Param('agentId') agentId: string,
  ) {
    return this.svc.approveKyc(agentId, user.companyId, user.id);
  }

  @Post('admin/kyc/:agentId/reject')
  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN)
  @ApiOperation({ summary: 'Reject counter agent KYC verification' })
  rejectKyc(
    @CurrentUser() user: AuthenticatedUser,
    @Param('agentId') agentId: string,
    @Body() body: { reason?: string },
  ) {
    return this.svc.rejectKyc(agentId, user.companyId, body?.reason);
  }

  @Post('buy-bulk')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Buy bulk tickets (min 10, Dhaka ↔ Cox\'s Bazar only)' })
  buyBulk(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: BuyBulkDto,
  ) {
    return this.svc.buyBulkTickets(user.id, user.companyId, dto);
  }

  @Post('assign-counter')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Assign counter agent to a counter' })
  assignCounter(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: AssignCounterDto,
  ) {
    return this.svc.assignCounter(user.id, user.companyId, dto.counterId);
  }

  @Get('dashboard-stats')
  @ApiOperation({ summary: 'Get counter agent dashboard stats' })
  dashboardStats(@CurrentUser() user: AuthenticatedUser) {
    return this.svc.getDashboardStats(user.id, user.companyId);
  }

  @Get('bulk-orders')
  @ApiOperation({ summary: 'Get my bulk ticket orders' })
  bulkOrders(@CurrentUser() user: AuthenticatedUser) {
    return this.svc.getMyBulkOrders(user.id, user.companyId);
  }

  @Get('commissions')
  @ApiOperation({ summary: 'Get my commission history' })
  commissions(@CurrentUser() user: AuthenticatedUser) {
    return this.svc.getMyCommissions(user.id, user.companyId);
  }

  @Get('counters')
  @ApiOperation({ summary: 'List available counters to assign' })
  counters(@CurrentUser() user: AuthenticatedUser) {
    return this.svc.getAvailableCounters(user.companyId);
  }

  @Get('allowed-routes')
  @ApiOperation({ summary: 'List allowed routes for bulk ticket purchase' })
  allowedRoutes(@CurrentUser() user: AuthenticatedUser) {
    return this.svc.getAllowedRoutes(user.companyId);
  }

  // ─── ADMIN MONITORING ENDPOINTS ──────────────────────────────────────────────

  @Get('admin/overview')
  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN)
  @ApiOperation({ summary: 'Admin overview of counter agent activities' })
  adminOverview(@CurrentUser() user: AuthenticatedUser) {
    return this.svc.getAdminOverview(user.companyId);
  }

  @Get('admin/agents')
  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN)
  @ApiOperation({ summary: 'Admin list of all counter agents with performance stats' })
  adminAgentsList(@CurrentUser() user: AuthenticatedUser) {
    return this.svc.getAdminAgentsList(user.companyId);
  }

  @Get('admin/bulk-orders')
  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN)
  @ApiOperation({ summary: 'Admin list of all bulk ticket orders' })
  adminBulkOrders(@CurrentUser() user: AuthenticatedUser) {
    return this.svc.getAdminBulkOrders(user.companyId);
  }

  @Get('admin/commissions')
  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN)
  @ApiOperation({ summary: 'Admin list of all agent commissions' })
  adminCommissions(@CurrentUser() user: AuthenticatedUser) {
    return this.svc.getAdminCommissions(user.companyId);
  }

  @Post('admin/bulk-orders/:id/approve')
  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN)
  @ApiOperation({ summary: 'Approve agent bulk ticket payment order' })
  approveBulkOrder(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') orderId: string,
  ) {
    return this.svc.approveBulkOrder(orderId, user.companyId, user.id);
  }

  @Post('admin/bulk-orders/:id/reject')
  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN)
  @ApiOperation({ summary: 'Reject agent bulk ticket payment order' })
  rejectBulkOrder(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') orderId: string,
    @Body() body: { reason?: string },
  ) {
    return this.svc.rejectBulkOrder(orderId, user.companyId, user.id, body?.reason);
  }
}

