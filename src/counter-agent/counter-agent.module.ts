import { Module } from '@nestjs/common';
import { CounterAgentController } from './counter-agent.controller';
import { CounterAgentService } from './counter-agent.service';
import { PrismaModule } from '../prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  controllers: [CounterAgentController],
  providers: [CounterAgentService],
  exports: [CounterAgentService],
})
export class CounterAgentModule {}
