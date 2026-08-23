import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Query,
  UseGuards,
  ParseUUIDPipe,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { BookingsService } from './bookings.service';
import {
  CreateBookingDto,
  ConfirmBookingDto,
  CancelBookingDto,
} from './dto/booking.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../common/decorators/current-user.decorator';
import { PaginationDto } from '../common/utils/pagination.util';
import { UserRole, BookingStatus } from '@prisma/client';

@ApiTags('Bookings')
@Controller('api/v1')
export class BookingsController {
  constructor(private readonly bookingsService: BookingsService) {}

  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @Post('bookings')
  @ApiOperation({ summary: 'Create a new booking (hold seats)' })
  createBooking(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateBookingDto,
  ) {
    return this.bookingsService.createBooking(user.companyId, dto, user.id);
  }

  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @Post('bookings/:id/confirm')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Confirm booking after payment' })
  confirmBooking(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: ConfirmBookingDto,
  ) {
    return this.bookingsService.confirmBooking(
      id,
      user.companyId,
      dto,
      user.id,
    );
  }

  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @Post('bookings/:id/cancel')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Cancel a booking' })
  cancelBooking(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CancelBookingDto,
  ) {
    return this.bookingsService.cancelBooking(id, user.companyId, dto, user.id);
  }

  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @Get('bookings/:id')
  @ApiOperation({ summary: 'Get booking details' })
  findOne(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.bookingsService.findOne(id, user.companyId);
  }

  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @Get('bookings/ref/:ref')
  @ApiOperation({ summary: 'Get booking by reference number' })
  findByRef(@Param('ref') ref: string, @CurrentUser() user: AuthenticatedUser) {
    return this.bookingsService.findByRef(ref, user.companyId);
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
  @Get('admin/bookings')
  @ApiOperation({ summary: 'List all bookings (admin)' })
  findAll(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: PaginationDto & { status?: BookingStatus; date?: string },
  ) {
    return this.bookingsService.findAll(user.companyId, query);
  }

  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(
    UserRole.SUPER_ADMIN,
    UserRole.ADMIN,
    UserRole.COUNTER_MANAGER,
    UserRole.COUNTER_AGENT,
  )
  @Post('admin/bookings')
  @ApiOperation({ summary: 'Create booking on behalf of customer (counter)' })
  createCounterBooking(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateBookingDto & { counterId?: string },
  ) {
    return this.bookingsService.createBooking(
      user.companyId,
      dto,
      user.id,
      dto.counterId,
    );
  }
}
