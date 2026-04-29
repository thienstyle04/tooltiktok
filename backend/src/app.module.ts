import { Module } from '@nestjs/common';
import { GuideModule } from './modules/guide/guide.module';

@Module({
  imports: [GuideModule],
})
export class AppModule {}
