import {
  Body,
  Controller,
  Delete,
  Get,
  Header,
  HttpCode,
  Param,
  Patch,
  Post,
  Put,
  Query,
  Req,
  Res,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import * as path from 'node:path';
import { getAppConfig } from '../../config';
import { DriveCacheWarmStatus, GuideService, LocalWorkbookUpload } from './guide.service';
import { RuntimePerformanceReport, RuntimePerformanceService, RuntimePerformanceStatus } from './runtime-performance.service';
import { MAX_WORKBOOK_FILE_BYTES } from './sync/workbook-source';
import { HookSourceUpload, MAX_HOOK_SOURCE_FILE_BYTES } from './sync/festival-hook-source';
import { getRuntimeSession } from '../../runtime-session';
import { AutomationSchedulerService } from './automation-scheduler.service';
import { AutomationScheduleInput } from './automation-scheduler.types';
import {
  DeepSeekCaptionRequest,
  DeepSeekCaptionResponse,
  AddDestinationRequest,
  AddDestinationResponse,
  AddXlsxDestinationRequest,
  DestinationListResponse,
  GenerateBatchListsRequest,
  GenerateBatchListsResponse,
  DeleteGeneratedListsRequest,
  DeleteGeneratedListsResponse,
  GenerateCaptionDeckRequest,
  GenerateCaptionDeckResponse,
  GeneratePartnerSpotlightRequest,
  GeneratePartnerSpotlightResponse,
  GuideDataset,
  HookSourcesResponse,
  SetHookModeRequest,
  SetDestinationRequest,
  SetDestinationResponse,
  UpdateGeneratedListCoverRequest,
  UpdateGeneratedListCoverResponse,
  UpdatePageTextRequest,
  UpdatePageTextResponse,
} from '../../common/interfaces/guide.types';

@Controller()
export class GuideController {
  constructor(
    private readonly guideService: GuideService,
    private readonly runtimePerformance: RuntimePerformanceService,
    private readonly automationScheduler: AutomationSchedulerService,
  ) {}

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
  getHealth(): { status: string; sessionId: string; appVersion: string } {
    return { status: 'ok', ...getRuntimeSession() };
  }

  @Get('api/drive-cache/status')
  getDriveCacheWarmStatus(): DriveCacheWarmStatus {
    return this.guideService.getDriveCacheWarmStatus();
  }

  @Get('api/guide-data')
  getGuideData(@Query('refresh') refresh?: string): Promise<GuideDataset> {
    const shouldRefresh = ['1', 'true', 'yes'].includes(String(refresh ?? '').trim().toLowerCase());
    if (shouldRefresh) this.automationScheduler.assertUserMutationAllowed();
    return this.guideService.getDataset({ refresh: shouldRefresh });
  }

  @Get('api/destinations')
  getDestinations(): DestinationListResponse {
    return this.guideService.getDestinations();
  }

  @Post('api/destination')
  setDestination(@Body() request: SetDestinationRequest): Promise<SetDestinationResponse> {
    this.automationScheduler.assertUserMutationAllowed();
    return this.guideService.setActiveDestination(request);
  }

  @Post('api/destinations')
  addDestination(@Body() request: AddDestinationRequest): Promise<AddDestinationResponse> {
    this.automationScheduler.assertUserMutationAllowed();
    return this.guideService.addDestination(request);
  }

  @Get('api/runtime-performance')
  getRuntimePerformance(): RuntimePerformanceStatus {
    return this.runtimePerformance.getStatus();
  }

  @Post('api/runtime-performance/report')
  @HttpCode(200)
  reportRuntimePerformance(@Body() report: RuntimePerformanceReport): RuntimePerformanceStatus {
    return this.runtimePerformance.report(report || {});
  }

  @Post('api/destinations/xlsx')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: MAX_WORKBOOK_FILE_BYTES } }))
  addXlsxDestination(
    @Body() request: AddXlsxDestinationRequest,
    @UploadedFile() file?: LocalWorkbookUpload,
  ): Promise<AddDestinationResponse> {
    this.automationScheduler.assertUserMutationAllowed();
    return this.guideService.addXlsxDestination(request, file);
  }

  @Put('api/destinations/:id/xlsx')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: MAX_WORKBOOK_FILE_BYTES } }))
  replaceDestinationWorkbook(
    @Param('id') id: string,
    @UploadedFile() file?: LocalWorkbookUpload,
  ): Promise<SetDestinationResponse> {
    this.automationScheduler.assertUserMutationAllowed();
    return this.guideService.replaceDestinationWorkbook(id, file);
  }

  @Post('api/destinations/:id/refresh-from-sheet')
  refreshDestinationFromSheet(@Param('id') id: string): Promise<SetDestinationResponse> {
    this.automationScheduler.assertUserMutationAllowed();
    return this.guideService.refreshDestinationFromSheet(id);
  }

  @Get('api/hook-sources')
  getHookSources(): HookSourcesResponse {
    return this.guideService.getHookSources();
  }

  @Post('api/hook-sources')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: MAX_HOOK_SOURCE_FILE_BYTES } }))
  addHookSource(
    @Body() request: { name?: string; docUrl?: string },
    @UploadedFile() file?: HookSourceUpload,
  ): Promise<HookSourcesResponse> {
    this.automationScheduler.assertUserMutationAllowed();
    return this.guideService.addHookSource(request, file);
  }

  @Put('api/hook-sources/:id')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: MAX_HOOK_SOURCE_FILE_BYTES } }))
  updateHookSource(
    @Param('id') id: string,
    @Body() request: { name?: string; docUrl?: string },
    @UploadedFile() file?: HookSourceUpload,
  ): Promise<HookSourcesResponse> {
    this.automationScheduler.assertUserMutationAllowed();
    return this.guideService.updateHookSource(id, request, file);
  }

  @Delete('api/hook-sources/:id')
  deleteHookSource(@Param('id') id: string): HookSourcesResponse {
    this.automationScheduler.assertUserMutationAllowed();
    return this.guideService.deleteHookSource(id);
  }

  @Post('api/hook-sources/:id/refresh')
  refreshHookSource(@Param('id') id: string): Promise<HookSourcesResponse> {
    this.automationScheduler.assertUserMutationAllowed();
    return this.guideService.refreshHookSource(id);
  }

  @Post('api/hook-mode')
  setHookMode(@Body() request: SetHookModeRequest): HookSourcesResponse {
    this.automationScheduler.assertUserMutationAllowed();
    return this.guideService.setHookMode(request);
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
    this.automationScheduler.assertUserMutationAllowed();
    return this.guideService.enqueueGeneration(() => this.guideService.generateDeckFromCaption(request));
  }

  @Post('api/decks/generate-batch')
  generateBatchLists(@Body() request: GenerateBatchListsRequest): Promise<GenerateBatchListsResponse> {
    this.automationScheduler.assertUserMutationAllowed();
    return this.guideService.enqueueGeneration(() => this.guideService.generateBatchLists(request));
  }

  @Post('api/decks/delete-lists')
  @HttpCode(200)
  deleteGeneratedLists(@Body() request: DeleteGeneratedListsRequest): DeleteGeneratedListsResponse {
    this.automationScheduler.assertUserMutationAllowed();
    return this.guideService.deleteGeneratedLists(request.groups || []);
  }

  @Post('api/decks/generate-partner-spotlight')
  generatePartnerSpotlight(@Body() request: GeneratePartnerSpotlightRequest): Promise<GeneratePartnerSpotlightResponse> {
    this.automationScheduler.assertUserMutationAllowed();
    return this.guideService.enqueueGeneration(() => this.guideService.generatePartnerSpotlight(request));
  }

  @Post('api/drive-files/cache-status')
  @HttpCode(200)
  driveFilesCacheStatus(@Body() body: { fileIds?: string[] }): {
    total: number;
    cached: number;
    missing: string[];
  } {
    return this.guideService.getDriveFilesCacheStatus(Array.isArray(body?.fileIds) ? body.fileIds : []);
  }

  @Post('api/drive-files/prefetch')
  @HttpCode(200)
  prefetchDriveFiles(@Body() body: { fileIds?: string[] }): Promise<{
    total: number;
    skipped: number;
    ok: number;
    fail: number;
    cancelled: boolean;
  }> {
    return this.guideService.prefetchDriveFiles(Array.isArray(body?.fileIds) ? body.fileIds : []);
  }

  @Patch('api/decks/:deckId/lists/:listId/cover')
  updateGeneratedListCover(
    @Param('deckId') deckId: string,
    @Param('listId') listId: string,
    @Body() request: UpdateGeneratedListCoverRequest,
  ): UpdateGeneratedListCoverResponse {
    this.automationScheduler.assertUserMutationAllowed();
    return this.guideService.updateGeneratedListCover(deckId, listId, request);
  }

  @Patch('api/decks/:deckId/lists/:listId/pages/:pageIndex/text')
  updatePageText(
    @Param('deckId') deckId: string,
    @Param('listId') listId: string,
    @Param('pageIndex') pageIndex: string,
    @Body() request: UpdatePageTextRequest,
  ): UpdatePageTextResponse {
    this.automationScheduler.assertUserMutationAllowed();
    return this.guideService.updatePageText(deckId, listId, Number(pageIndex), request);
  }

  @Delete('api/decks/:deckId/lists/:listId')
  @HttpCode(204)
  deleteGeneratedList(
    @Param('deckId') deckId: string,
    @Param('listId') listId: string,
  ): void {
    this.automationScheduler.assertUserMutationAllowed();
    this.guideService.deleteGeneratedList(deckId, listId);
  }

  @Get('api/automation')
  getAutomationState() {
    return this.automationScheduler.getState();
  }

  @Post('api/automation/manual-generation')
  submitManualGeneration(@Body() request: { kind: string; destinationId: string; requestId: string; request: any }) {
    return this.automationScheduler.submitManualGeneration(request);
  }

  @Get('api/automation/manual-generation/:id')
  getManualGeneration(@Param('id') id: string) {
    return this.automationScheduler.getManualGeneration(id);
  }

  @Post('api/automation/manual-generation/:id/cancel')
  cancelManualGeneration(@Param('id') id: string) {
    return this.automationScheduler.cancelManualGeneration(id);
  }

  @Post('api/automation/schedules')
  createAutomationSchedule(@Body() request: AutomationScheduleInput) {
    return this.automationScheduler.create(request);
  }

  @Put('api/automation/schedules/:id')
  updateAutomationSchedule(@Param('id') id: string, @Body() request: AutomationScheduleInput) {
    return this.automationScheduler.update(id, request);
  }

  @Delete('api/automation/schedules/:id')
  deleteAutomationSchedule(@Param('id') id: string) {
    return this.automationScheduler.delete(id);
  }

  @Post('api/automation/schedules/:id/enabled')
  setAutomationScheduleEnabled(@Param('id') id: string, @Body() request: { enabled?: boolean }) {
    return this.automationScheduler.setEnabled(id, Boolean(request?.enabled));
  }

  @Post('api/automation/schedules/:id/run-now')
  runAutomationScheduleNow(@Param('id') id: string) {
    return this.automationScheduler.runNow(id);
  }

  @Post('api/automation/runs/:id/retry')
  retryAutomationRun(@Param('id') id: string) {
    return this.automationScheduler.retry(id);
  }

  @Post('api/automation/runs/:id/cancel')
  cancelAutomationRun(@Param('id') id: string) {
    return this.automationScheduler.cancel(id);
  }

  @Delete('api/automation/runs/:id')
  deleteAutomationRunHistory(@Param('id') id: string) {
    return this.automationScheduler.deleteRunHistory(id);
  }

  @Post('api/automation/choose-output-directory')
  chooseAutomationOutputDirectory() {
    return this.automationScheduler.chooseOutputDirectory();
  }

  @Post('api/automation/manual-export')
  setAutomationManualExport(@Body() request: { active?: boolean }) {
    return this.automationScheduler.setManualExportActive(Boolean(request?.active));
  }

  @Get('api/automation/runs/:id/export-context')
  getAutomationExportContext(@Param('id') id: string, @Query('token') token: string) {
    return this.automationScheduler.getExportContext(id, token);
  }

  @Post('api/automation/runs/:id/progress')
  @HttpCode(204)
  reportAutomationProgress(
    @Param('id') id: string,
    @Query('token') token: string,
    @Body() request: { progress?: number; phase?: string },
  ): void {
    this.automationScheduler.reportProgress(id, token, Number(request?.progress), String(request?.phase || ''));
  }

  @Post('api/automation/runs/:id/archive')
  acceptAutomationArchive(@Param('id') id: string, @Query('token') token: string, @Req() request: any) {
    return this.automationScheduler.acceptArchive(id, token, request);
  }

  @Post('api/automation/runs/:id/export-failure')
  @HttpCode(204)
  reportAutomationExportFailure(
    @Param('id') id: string,
    @Query('token') token: string,
    @Body() request: { message?: string },
  ): void {
    this.automationScheduler.reportExportFailure(id, token, String(request?.message || ''));
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
    response.setHeader('Cache-Control', asset.isFallback
      ? 'no-store'
      : 'public, max-age=86400, stale-while-revalidate=604800, immutable');
    if (asset.isFallback) {
      response.setHeader('X-Drive-Image-Fallback', '1');
    }
    response.send(asset.body);
  }
}
