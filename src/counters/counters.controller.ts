import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  UseGuards,
  ParseUUIDPipe,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { CountersService, CreateCounterDto } from './counters.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../common/decorators/current-user.decorator';
import { UserRole } from '@prisma/client';
import { IsUUID } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

import { Public } from '../common/decorators/public.decorator';
import { Query } from '@nestjs/common';

class AssignUserDto {
  @ApiProperty() @IsUUID() userId: string;
}

@ApiTags('Counters')
@Controller('api/v1')
export class PublicCountersController {
  constructor(private readonly countersService: CountersService) {}

  @Public()
  @Get('counters')
  @ApiOperation({ summary: 'List counters (public)' })
  findAllPublic(@Query('companyId') companyId?: string) {
    // Public API returns active counters
    return this.countersService.findAll(companyId || '', 'ACTIVE');
  }
}

@ApiTags('Admin - Counters')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.COUNTER_AGENT, UserRole.COUNTER_MANAGER, UserRole.STAFF)
@Controller('api/v1/admin/counters')
export class CountersController {
  constructor(private readonly countersService: CountersService) {}

  @Post()
  @ApiOperation({ summary: 'Create counter' })
  create(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateCounterDto,
  ) {
    return this.countersService.create(user.companyId, dto);
  }

  @Get()
  @ApiOperation({ summary: 'List counters' })
  findAll(@CurrentUser() user: AuthenticatedUser) {
    return this.countersService.findAll(user.companyId);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get counter' })
  findOne(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.countersService.findOne(id, user.companyId);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update counter' })
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: Partial<CreateCounterDto>,
  ) {
    return this.countersService.update(id, user.companyId, dto);
  }

  @Post(':id/users')
  @ApiOperation({ summary: 'Assign user to counter' })
  assignUser(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: AssignUserDto,
  ) {
    return this.countersService.assignUser(id, dto.userId, user.companyId);
  }

  @Delete(':id/users/:userId')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Remove user from counter' })
  removeUser(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('userId', ParseUUIDPipe) userId: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.countersService.removeUser(id, userId, user.companyId);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Deactivate counter' })
  remove(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.countersService.remove(id, user.companyId);
  }

  @Delete(':id/permanent')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Delete counter permanently' })
  hardRemove(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.countersService.hardRemove(id, user.companyId);
  }
}
