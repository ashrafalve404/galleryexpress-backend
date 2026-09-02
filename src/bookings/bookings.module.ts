import { Module } from '@nestjs/common';
import { BookingsService } from './bookings.service';
import { BookingsController } from './bookings.controller';
import { BookingExpirationTask } from './booking-expiration.task';
import { CounterAgentModule } from '../counter-agent/counter-agent.module';

@Module({
  imports: [CounterAgentModule],
  controllers: [BookingsController],
  providers: [BookingsService, BookingExpirationTask],
  exports: [BookingsService],
})
export class BookingsModule {}
