import { Module } from '@nestjs/common';
import { AiSettingsController } from './ai-settings.controller';
import { GuideController } from './guide.controller';
import { GuideService } from './guide.service';
import { RuntimePerformanceService } from './runtime-performance.service';
import { AutomationSchedulerService } from './automation-scheduler.service';

@Module({
  controllers: [GuideController, AiSettingsController],
  providers: [GuideService, RuntimePerformanceService, AutomationSchedulerService],
  exports: [GuideService],
})
export class GuideModule {}
