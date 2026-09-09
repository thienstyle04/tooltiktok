import { Module } from '@nestjs/common';
import { GuideController } from './guide.controller';
import { GuideService } from './guide.service';
import { RuntimePerformanceService } from './runtime-performance.service';

@Module({
  controllers: [GuideController],
  providers: [GuideService, RuntimePerformanceService],
  exports: [GuideService],
})
export class GuideModule {}
