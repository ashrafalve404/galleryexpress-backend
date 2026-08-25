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
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { ContactMessagesService } from './contact-messages.service';
import { Public } from '../common/decorators/public.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { UserRole } from '@prisma/client';
import { IsString, IsEmail, IsOptional } from 'class-validator';

export class CreateContactMessageDto {
  @IsString() name: string;
  @IsEmail() email: string;
  @IsOptional() @IsString() phone?: string;
  @IsString() message: string;
  @IsOptional() @IsString() companyId?: string;
}

@ApiTags('Contact Messages')
@Controller('api/v1')
export class ContactMessagesController {
  constructor(private readonly contactService: ContactMessagesService) {}

  @Public()
  @Post('contact-messages')
  @ApiOperation({ summary: 'Submit contact message (public)' })
  create(@Body() dto: CreateContactMessageDto) {
    return this.contactService.create(dto);
  }

  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.STAFF)
  @Get('admin/contact-messages')
  @ApiOperation({ summary: 'List contact messages (admin)' })
  findAllAdmin() {
    return this.contactService.findAllAdmin();
  }

  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.STAFF)
  @Patch('admin/contact-messages/:id/read')
  @ApiOperation({ summary: 'Mark contact message as read (admin)' })
  markAsRead(@Param('id', ParseUUIDPipe) id: string) {
    return this.contactService.markAsRead(id);
  }

  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.STAFF)
  @Delete('admin/contact-messages/:id')
  @ApiOperation({ summary: 'Delete contact message (admin)' })
  remove(@Param('id', ParseUUIDPipe) id: string) {
    return this.contactService.remove(id);
  }
}
