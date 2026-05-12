import { Body, Controller, Delete, Get, Header, HttpCode, Param, Patch, Post, Query, Res } from '@nestjs/common';
import * as path from 'node:path';
import { getAppConfig } from '../../config';
import { GuideService } from './guide.service';
import {
  DeepSeekCaptionRequest,
  DeepSeekCaptionResponse,
  GenerateBatchListsRequest,
  GenerateBatchListsResponse,
  GenerateCaptionDeckRequest,
  GenerateCaptionDeckResponse,
  GeneratePartnerSpotlightRequest,
  GeneratePartnerSpotlightResponse,
  GuideDataset,
  UpdateGeneratedListCoverRequest,
  UpdateGeneratedListCoverResponse,
} from '../../common/interfaces/guide.types';

@Controller()
export class GuideController {
  constructor(private readonly guideService: GuideService) {}

  private sendBinaryAsset(response: any, body: Buffer, contentType: string, cacheControl: string): void {
    response.setHeader('Content-Type', contentType);
    response.setHeader('Content-Length', body.length);
    response.setHeader('Cache-Control', cacheControl);
    response.send(body);
  }

  @Get()
  @Header('Content-Type', 'text/html; charset=utf-8')
  getIndex(): string {
    const frontendUrl = this.escapeHtml(`${getAppConfig().frontendOrigin}/`);

    return [
      '<!doctype html>',
      '<html lang="vi">',
      '<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">',
      `<meta http-equiv="refresh" content="0; url=${frontendUrl}">`,
      '<title>Dalat Carousel API</title></head>',
      '<body style="font-family: system-ui, sans-serif; padding: 32px">',
      '<h1>Frontend da chuyen sang Next.js</h1>',
      `<p>Mo giao dien tai <a href="${frontendUrl}">${frontendUrl}</a>.</p>`,
      '</body></html>',
    ].join('');
  }

  private escapeHtml(value: string): string {
    return value
      .replace(/&/g, '&amp;')
      .replace(/"/g, '&quot;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
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
    this.sendBinaryAsset(response, body, this.guideService.guessMime(fileName), 'public, max-age=31536000, immutable');
  }

  @Get('api/health')
  getHealth(): { status: string } {
    return { status: 'ok' };
  }

  @Get('api/guide-data')
  getGuideData(@Query('refresh') refresh?: string): Promise<GuideDataset> {
    const shouldRefresh = ['1', 'true', 'yes'].includes(String(refresh ?? '').trim().toLowerCase());
    return this.guideService.getDataset({ refresh: shouldRefresh });
  }

  @Get('api/partners')
  getPartners(): Promise<Array<{ id: string; name: string; section: string; address: string; imageCount: number }>> {
    return this.guideService.getPartnerList();
  }

  @Post('api/ai/deepseek/caption')
  generateDeepSeekCaption(@Body() request: DeepSeekCaptionRequest): Promise<DeepSeekCaptionResponse> {
    return this.guideService.generateDeepSeekCaption(request);
  }

  @Post('api/decks/generate-from-caption')
  generateDeckFromCaption(@Body() request: GenerateCaptionDeckRequest): Promise<GenerateCaptionDeckResponse> {
    return this.guideService.generateDeckFromCaption(request);
  }

  @Post('api/decks/generate-batch')
  generateBatchLists(@Body() request: GenerateBatchListsRequest): Promise<GenerateBatchListsResponse> {
    return this.guideService.generateBatchLists(request);
  }

  @Post('api/decks/generate-partner-spotlight')
  generatePartnerSpotlight(@Body() request: GeneratePartnerSpotlightRequest): Promise<GeneratePartnerSpotlightResponse> {
    return this.guideService.generatePartnerSpotlight(request);
  }

  @Patch('api/decks/:deckId/lists/:listId/cover')
  updateGeneratedListCover(
    @Param('deckId') deckId: string,
    @Param('listId') listId: string,
    @Body() request: UpdateGeneratedListCoverRequest,
  ): UpdateGeneratedListCoverResponse {
    return this.guideService.updateGeneratedListCover(deckId, listId, request);
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
    this.sendBinaryAsset(response, body, this.guideService.guessMime(fileName), 'public, max-age=86400, stale-while-revalidate=604800');
  }

  @Get('assets/tiktok/:folderName/:fileName')
  getTiktokAsset(
    @Param('folderName') folderName: string,
    @Param('fileName') fileName: string,
    @Res() response: any,
  ): void {
    const body = this.guideService.getTiktokAsset(folderName, fileName);
    this.sendBinaryAsset(response, body, this.guideService.guessMime(fileName), 'public, max-age=86400, stale-while-revalidate=604800');
  }

  @Get('assets/workspace')
  getWorkspaceAssetFromQuery(@Query('path') queryPath: string, @Res() response: any): void {
    const body = this.guideService.getWorkspaceAsset(queryPath);
    this.sendBinaryAsset(response, body, this.guideService.guessMime(queryPath), 'public, max-age=86400, stale-while-revalidate=604800');
  }

  @Get('assets/library')
  getLibraryAssetFromQuery(@Query('path') queryPath: string, @Query('root') rootKey: string, @Res() response: any): void {
    const body = this.guideService.getLibraryAsset(queryPath, String(rootKey ?? '').trim() || 'main');
    this.sendBinaryAsset(response, body, this.guideService.guessMime(queryPath), 'public, max-age=86400, stale-while-revalidate=604800');
  }

  @Get('assets/drive-file')
  async getDriveFileAssetFromQuery(@Query('id') fileId: string, @Res() response: any): Promise<void> {
    const asset = await this.guideService.getDriveFileAsset(fileId);
    response.setHeader('Content-Type', asset.contentType);
    response.setHeader('Content-Length', asset.contentLength);
    response.setHeader('Cache-Control', 'public, max-age=86400, stale-while-revalidate=604800, immutable');
    response.send(asset.body);
  }
}
