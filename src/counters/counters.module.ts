import { Module } from '@nestjs/common';
import { CountersService } from './counters.service';
import { CountersController, PublicCountersController } from './counters.controller';

@Module({
  controllers: [CountersController, PublicCountersController],
  providers: [CountersService],
  exports: [CountersService],
})
export class CountersModule {}
