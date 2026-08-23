import {
  Controller,
  Get,
  Post,
  Patch,
  Body,
  Param,
  Query,
  UseGuards,
  ParseUUIDPipe,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { DiscountsService, CreateDiscountDto } from './discounts.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../common/decorators/current-user.decorator';
import { Public } from '../common/decorators/public.decorator';
import { UserRole } from '@prisma/client';

@ApiTags('Discounts')
@Controller('api/v1')
export class DiscountsController {
  constructor(private readonly discountsService: DiscountsService) {}

  @Public()
  @Get('discounts/validate')
  @ApiOperation({ summary: 'Validate coupon code (public)' })
  validate(
    @Query('code') code: string,
    @Query('companyId') companyId: string,
    @Query('amount') amount?: string,
  ) {
    return this.discountsService.validate(
      companyId,
      code,
      amount ? parseFloat(amount) : undefined,
    );
  }

  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN)
  @Post('admin/discounts')
  @ApiOperation({ summary: 'Create discount/coupon (admin)' })
  create(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateDiscountDto,
  ) {
    return this.discountsService.create(user.companyId, dto);
  }

  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN)
  @Get('admin/discounts')
  @ApiOperation({ summary: 'List discounts (admin)' })
  findAll(@CurrentUser() user: AuthenticatedUser) {
    return this.discountsService.findAll(user.companyId);
  }

  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN)
  @Get('admin/discounts/:id')
  findOne(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.discountsService.findOne(id, user.companyId);
  }

  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN)
  @Patch('admin/discounts/:id')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: Partial<CreateDiscountDto>,
  ) {
    return this.discountsService.update(id, user.companyId, dto);
  }
}
