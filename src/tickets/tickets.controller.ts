import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { TicketsService } from './tickets.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../common/decorators/current-user.decorator';
import { UserRole } from '@prisma/client';

@ApiTags('Tickets')
@Controller('api/v1')
export class TicketsController {
  constructor(private readonly ticketsService: TicketsService) {}

  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @Get('tickets/:ticketNumber')
  @ApiOperation({ summary: 'Get ticket by number' })
  findOne(
    @Param('ticketNumber') ticketNumber: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.ticketsService.findByTicketNumber(ticketNumber, user.companyId);
  }

  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(
    UserRole.SUPER_ADMIN,
    UserRole.ADMIN,
    UserRole.COUNTER_MANAGER,
    UserRole.COUNTER_AGENT,
    UserRole.STAFF,
  )
  @Get('tickets/:ticketNumber/verify')
  @ApiOperation({ summary: 'Verify ticket at boarding' })
  verify(
    @Param('ticketNumber') ticketNumber: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.ticketsService.verifyTicket(ticketNumber, user.companyId);
  }

  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(
    UserRole.SUPER_ADMIN,
    UserRole.ADMIN,
    UserRole.COUNTER_MANAGER,
    UserRole.COUNTER_AGENT,
    UserRole.STAFF,
  )
  @Get('tickets/qr/:qrToken/verify')
  @ApiOperation({ summary: 'Verify ticket by QR token' })
  verifyByQr(
    @Param('qrToken') qrToken: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.ticketsService.verifyByQrToken(qrToken, user.companyId);
  }

  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.COUNTER_MANAGER, UserRole.COUNTER_AGENT, UserRole.STAFF)
  @Get('admin/tickets')
  @ApiOperation({ summary: 'List tickets (admin)' })
  adminList(
    @CurrentUser() user: AuthenticatedUser,
    @Query('scheduleId') scheduleId?: string,
  ) {
    return this.ticketsService.adminList(user.companyId, scheduleId);
  }
}
