import { Body, Controller, ForbiddenException, Get, Header, Post, Put, Req } from '@nestjs/common';
import { aiProvider } from './ai-provider';
import { getAppConfig } from '../../config';

@Controller('api/ai/settings')
export class AiSettingsController {
  private guard(req:any) {
    if(!['127.0.0.1','::1','::ffff:127.0.0.1'].includes(req.socket?.remoteAddress)) throw new ForbiddenException('Cấu hình AI chỉ dùng trên máy cục bộ.');
    const origin=String(req.headers.origin || '');
    const expected=new URL(getAppConfig().frontendOrigin);
    let valid=false;
    try {const u=new URL(origin); valid=['localhost','127.0.0.1','[::1]'].includes(u.hostname) && u.port===expected.port && u.protocol===expected.protocol;} catch {}
    if(!valid || req.headers['x-dalat-ai-settings']!=='1') throw new ForbiddenException('Hãy mở Cài đặt AI từ giao diện cục bộ của tool.');
  }
  @Get() @Header('Cache-Control','no-store')
  status(@Req() req:any) {this.guard(req);return aiProvider.status();}
  @Put() @Header('Cache-Control','no-store')
  save(@Req() req:any,@Body() body:any) {this.guard(req);return aiProvider.save(body);}
  @Post('models') @Header('Cache-Control','no-store')
  models(@Req() req:any,@Body() body:any) {this.guard(req);return aiProvider.models(body);}
  @Post('test') @Header('Cache-Control','no-store')
  test(@Req() req:any,@Body() body:any) {this.guard(req);return aiProvider.test(body);}
}
