import { Body, Controller, Delete, Get, Header, HttpCode, Param, Post, Query, Res } from '@nestjs/common';
import * as path from 'node:path';
import { GuideService } from './guide.service';
import {
  DeepSeekCaptionRequest,
  DeepSeekCaptionResponse,
  GenerateCaptionDeckRequest,
  GenerateCaptionDeckResponse,
  GuideDataset,
} from '../core/types';

@Controller()
export class GuideController {
  constructor(private readonly guideService: GuideService) {}

  @Get()
  @Header('Content-Type', 'text/html; charset=utf-8')
  getIndex(): string {
    return [
      '<!doctype html>',
      '<html lang="vi">',
      '<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">',
      '<meta http-equiv="refresh" content="0; url=http://127.0.0.1:3001/">',
      '<title>Dalat Carousel API</title></head>',
      '<body style="font-family: system-ui, sans-serif; padding: 32px">',
      '<h1>Frontend da chuyen sang Next.js</h1>',
      '<p>Mo giao dien tai <a href="http://127.0.0.1:3001/">http://127.0.0.1:3001/</a>.</p>',
      '</body></html>',
    ].join('');
  }

  @Get('styles.css')
  @Header('Content-Type', 'text/css; charset=utf-8')
  getStyles(): string {
    return this.guideService.getFrontendTextFile('styles.css');
  }

  @Get('js/:fileName')
  @Header('Content-Type', 'application/javascript; charset=utf-8')
  getJsFiles(@Param('fileName') fileName: string): string {
    return this.guideService.getFrontendTextFile(`js/${fileName}`);
  }

  @Get('fonts/:fileName')
  getFontAsset(@Param('fileName') fileName: string, @Res() response: any): void {
    const body = this.guideService.getFrontendBinaryFile(path.join('fonts', fileName));
    response.setHeader('Content-Type', this.guideService.guessMime(fileName));
    response.setHeader('Content-Length', body.length);
    response.send(body);
  }

  @Get('api/health')
  getHealth(): { status: string } {
    return { status: 'ok' };
  }

  @Get('api/guide-data')
  getGuideData(@Query('refresh') refresh?: string): GuideDataset {
    const shouldRefresh = ['1', 'true', 'yes'].includes(String(refresh ?? '').trim().toLowerCase());
    return this.guideService.getDataset({ refresh: shouldRefresh });
  }

  @Post('api/ai/deepseek/caption')
  generateDeepSeekCaption(@Body() request: DeepSeekCaptionRequest): Promise<DeepSeekCaptionResponse> {
    return this.guideService.generateDeepSeekCaption(request);
  }

  @Post('api/decks/generate-from-caption')
  generateDeckFromCaption(@Body() request: GenerateCaptionDeckRequest): GenerateCaptionDeckResponse {
    return this.guideService.generateDeckFromCaption(request);
  }

  @Delete('api/decks/:deckId/lists/:listId')
  @HttpCode(204)
  deleteGeneratedList(
    @Param('deckId') deckId: string,
    @Param('listId') listId: string,
  ): void {
    this.guideService.deleteGeneratedList(deckId, listId);
  }

  @Get('assets/dalat/:fileName')
  getDalatAsset(@Param('fileName') fileName: string, @Res() response: any): void {
    const body = this.guideService.getDalatAsset(fileName);
    response.setHeader('Content-Type', this.guideService.guessMime(fileName));
    response.setHeader('Content-Length', body.length);
    response.send(body);
  }

  @Get('assets/tiktok/:folderName/:fileName')
  getTiktokAsset(
    @Param('folderName') folderName: string,
    @Param('fileName') fileName: string,
    @Res() response: any,
  ): void {
    const body = this.guideService.getTiktokAsset(folderName, fileName);
    response.setHeader('Content-Type', this.guideService.guessMime(fileName));
    response.setHeader('Content-Length', body.length);
    response.send(body);
  }

  @Get('assets/workspace')
  getWorkspaceAssetFromQuery(@Query('path') queryPath: string, @Res() response: any): void {
    const body = this.guideService.getWorkspaceAsset(queryPath);
    response.setHeader('Content-Type', this.guideService.guessMime(queryPath));
    response.setHeader('Content-Length', body.length);
    response.send(body);
  }

  @Get('assets/library')
  getLibraryAssetFromQuery(@Query('path') queryPath: string, @Query('root') rootKey: string, @Res() response: any): void {
    const body = this.guideService.getLibraryAsset(queryPath, String(rootKey ?? '').trim() || 'main');
    response.setHeader('Content-Type', this.guideService.guessMime(queryPath));
    response.setHeader('Content-Length', body.length);
    response.send(body);
  }

  @Get('assets/drive-file')
  async getDriveFileAssetFromQuery(@Query('id') fileId: string, @Res() response: any): Promise<void> {
    const asset = await this.guideService.getDriveFileAsset(fileId);
    response.setHeader('Content-Type', asset.contentType);
    response.setHeader('Content-Length', asset.contentLength);
    response.send(asset.body);
  }
}
