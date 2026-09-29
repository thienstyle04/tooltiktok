import { Body, Controller, ForbiddenException, Get, Header, Post, Req } from '@nestjs/common';
import { getAppConfig } from '../../config';
import { UpdateService } from './update.service';

@Controller('api/app-update')
export class UpdateController {
  constructor(private readonly updates: UpdateService) {}

  private guard(req: any) {
    if (!['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(req.socket?.remoteAddress)) throw new ForbiddenException('Cập nhật chỉ dùng trên máy cục bộ.');
    const expected = new URL(getAppConfig().frontendOrigin);
    let valid = false;
    try {
      const origin = new URL(String(req.headers.origin || ''));
      valid = ['localhost', '127.0.0.1', '[::1]'].includes(origin.hostname)
        && origin.port === expected.port && origin.protocol === expected.protocol;
    } catch {}
    if (!valid || req.headers['x-dalat-update'] !== '1') throw new ForbiddenException('Hãy cập nhật từ giao diện cục bộ của tool.');
  }

  @Get('status') @Header('Cache-Control', 'no-store')
  status(@Req() req: any) { this.guard(req); return this.updates.status(); }

  @Post('check') @Header('Cache-Control', 'no-store')
  check(@Req() req: any) { this.guard(req); return this.updates.check(); }

  @Post('defer') @Header('Cache-Control', 'no-store')
  defer(@Req() req: any, @Body() body: { scheduledAt: string }) { this.guard(req); return this.updates.defer(body?.scheduledAt); }

  @Post('cancel-schedule') @Header('Cache-Control', 'no-store')
  cancelSchedule(@Req() req: any) { this.guard(req); return this.updates.cancelSchedule(); }

  @Post('install') @Header('Cache-Control', 'no-store')
  install(@Req() req: any) { this.guard(req); return this.updates.install(); }

  @Post('freeze') @Header('Cache-Control', 'no-store')
  freeze(@Req() req: any) { this.guard(req); return this.updates.freezeForInstall(); }
}
