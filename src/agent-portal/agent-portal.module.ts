import { Module } from '@nestjs/common';
import { AgentPortalController } from './agent-portal.controller';
import { AgentPortalService } from './agent-portal.service';

@Module({
  controllers: [AgentPortalController],
  providers: [AgentPortalService],
  exports: [AgentPortalService],
})
export class AgentPortalModule {}
