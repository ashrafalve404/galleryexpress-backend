import {
  Controller,
  Get,
  Post,
  Body,
  UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { AgentPortalService, PurchaseBulkQuotaDto, IssueTicketFromQuotaDto } from './agent-portal.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../common/decorators/current-user.decorator';
import { UserRole } from '@prisma/client';

import { SubmitKycDto } from './dto/submit-kyc.dto';

@ApiTags('Agent Portal')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.COUNTER_AGENT, UserRole.SUPER_ADMIN, UserRole.ADMIN)
@Controller('api/v1/agent')
export class AgentPortalController {
  constructor(private readonly agentPortalService: AgentPortalService) {}

  @Get('dashboard-stats')
  @ApiOperation({ summary: 'Get summary stats for agent dashboard' })
  getMyStats(@CurrentUser() user: AuthenticatedUser) {
    return this.agentPortalService.getMyStats(user.id, user.companyId);
  }

  @Post('bulk-orders')
  @ApiOperation({ summary: 'Agent purchases bulk ticket quota on a route' })
  purchaseBulkQuota(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: PurchaseBulkQuotaDto,
  ) {
    return this.agentPortalService.purchaseBulkQuota(user.id, user.companyId, dto);
  }

  @Get('bulk-orders')
  @ApiOperation({ summary: 'Get agent active bulk quota orders' })
  getMyBulkOrders(@CurrentUser() user: AuthenticatedUser) {
    return this.agentPortalService.getMyBulkOrders(user.id, user.companyId);
  }

  @Post('issue-ticket')
  @ApiOperation({ summary: 'Issue passenger seat ticket from active bulk quota' })
  issueTicketFromQuota(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: IssueTicketFromQuotaDto,
  ) {
    return this.agentPortalService.issueTicketFromQuota(user.id, user.companyId, dto);
  }

  @Get('issued-tickets')
  @ApiOperation({ summary: 'Get list of tickets issued by this agent' })
  getMyIssuedTickets(@CurrentUser() user: AuthenticatedUser) {
    return this.agentPortalService.getMyIssuedTickets(user.id, user.companyId);
  }

  @Get('kyc')
  @ApiOperation({ summary: 'Get current agent KYC verification details' })
  getKycStatus(@CurrentUser() user: AuthenticatedUser) {
    return this.agentPortalService.getKycStatus(user.id);
  }

  @Post('kyc')
  @ApiOperation({ summary: 'Submit agent NID & Counter KYC verification' })
  submitKyc(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: SubmitKycDto,
  ) {
    return this.agentPortalService.submitKyc(user.id, dto);
  }
}
