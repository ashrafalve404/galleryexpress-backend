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
import { FaresService } from './fares.service';
import { CreateFareDto, UpdateFareDto } from './dto/fare.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../common/decorators/current-user.decorator';
import { UserRole } from '@prisma/client';

@ApiTags('Admin - Fares')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN)
@Controller('api/v1/admin/fares')
export class FaresController {
  constructor(private readonly faresService: FaresService) {}

  @Post()
  @ApiOperation({ summary: 'Create fare' })
  create(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateFareDto) {
    return this.faresService.create(user.companyId, dto);
  }

  @Get()
  @ApiOperation({ summary: 'List fares' })
  findAll(
    @CurrentUser() user: AuthenticatedUser,
    @Query('routeId') routeId?: string,
  ) {
    return this.faresService.findAll(user.companyId, routeId);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get fare' })
  findOne(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.faresService.findOne(id, user.companyId);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update fare' })
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: UpdateFareDto,
  ) {
    return this.faresService.update(id, user.companyId, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Deactivate fare' })
  remove(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.faresService.remove(id, user.companyId);
  }
}
