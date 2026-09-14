import { Module } from '@nestjs/common';
import { GuideController } from './guide.controller';
import { GuideService } from './guide.service';
import { RuntimePerformanceService } from './runtime-performance.service';
import { AutomationSchedulerService } from './automation-scheduler.service';

@Module({
  controllers: [GuideController],
  providers: [GuideService, RuntimePerformanceService, AutomationSchedulerService],
  exports: [GuideService],
})
export class GuideModule {}
