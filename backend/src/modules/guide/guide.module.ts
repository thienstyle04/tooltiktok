import { Module } from '@nestjs/common';
import { AiSettingsController } from './ai-settings.controller';
import { GuideController } from './guide.controller';
import { GuideService } from './guide.service';
import { RuntimePerformanceService } from './runtime-performance.service';
import { AutomationSchedulerService } from './automation-scheduler.service';
import { UpdateService } from './update.service';
import { UpdateController } from './update.controller';

@Module({
  controllers: [GuideController, AiSettingsController, UpdateController],
  providers: [GuideService, RuntimePerformanceService, AutomationSchedulerService, UpdateService],
  exports: [GuideService],
})
export class GuideModule {}
