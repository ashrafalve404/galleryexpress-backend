import { Controller, Get, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser, AuthenticatedUser } from '../common/decorators/current-user.decorator';
import { UserRole } from '@prisma/client';
import { NotificationsService } from './notifications.service';

@Controller('api/v1')
export class NotificationsController {
  constructor(private readonly notificationsService: NotificationsService) {}

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.COUNTER_MANAGER)
  @Get('admin/notifications')
  async getAdminNotifications(@CurrentUser() user: AuthenticatedUser) {
    return this.notificationsService.getAdminNotifications(user.companyId);
  }

  @UseGuards(JwtAuthGuard)
  @Get('notifications/my')
  async getUserNotifications(@CurrentUser() user: AuthenticatedUser) {
    return this.notificationsService.getUserNotifications(user.id, user.companyId);
  }
}
