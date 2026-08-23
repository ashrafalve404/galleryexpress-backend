import { Module } from '@nestjs/common';
import { BookingsService } from './bookings.service';
import { BookingsController } from './bookings.controller';
import { BookingExpirationTask } from './booking-expiration.task';

@Module({
  controllers: [BookingsController],
  providers: [BookingsService, BookingExpirationTask],
  exports: [BookingsService],
})
export class BookingsModule {}
