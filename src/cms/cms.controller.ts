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
import { CmsService, CreateCmsPageDto } from './cms.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../common/decorators/current-user.decorator';
import { Public } from '../common/decorators/public.decorator';
import { UserRole } from '@prisma/client';

@ApiTags('CMS')
@Controller('api/v1')
export class CmsController {
  constructor(private readonly cmsService: CmsService) {}

  @Public()
  @Get('cms/:slug')
  @ApiOperation({ summary: 'Get CMS page by slug (public)' })
  findBySlug(
    @Param('slug') slug: string,
    @Query('companyId') companyId: string,
  ) {
    return this.cmsService.findBySlug(slug, companyId);
  }

  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN)
  @Post('admin/cms')
  @ApiOperation({ summary: 'Create CMS page (admin)' })
  create(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateCmsPageDto,
  ) {
    return this.cmsService.create(user.companyId, dto);
  }

  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN)
  @Get('admin/cms')
  @ApiOperation({ summary: 'List all CMS pages (admin)' })
  findAll(@CurrentUser() user: AuthenticatedUser) {
    return this.cmsService.findAll(user.companyId);
  }

  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN)
  @Patch('admin/cms/:id')
  @ApiOperation({ summary: 'Update CMS page (admin)' })
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: Partial<CreateCmsPageDto>,
  ) {
    return this.cmsService.update(id, user.companyId, dto);
  }
}
