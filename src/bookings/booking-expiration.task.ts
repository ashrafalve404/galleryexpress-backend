import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { BookingsService } from './bookings.service';

@Injectable()
export class BookingExpirationTask {
  private readonly logger = new Logger(BookingExpirationTask.name);

  constructor(private bookingsService: BookingsService) {}

  @Cron(CronExpression.EVERY_MINUTE)
  async handleExpiredBookings() {
    try {
      const result = await this.bookingsService.expireHeldBookings();
      if (result.expired > 0) {
        this.logger.log(`Expired ${result.expired} held bookings`);
      }
    } catch (error) {
      this.logger.error('Error expiring bookings:', error);
    }
  }
}
