'use client';
import { ExportImageError, inspectExportImages, lateImageListFailure } from './exportImageValidation';
import { verifyRuntimeSession } from './runtimeSession';
import { markRuntimeResourceFailure } from './runtimePerformance';
import { formatListSetLabel, listIsMain, parseListSetIndex, sanitizeFilePart } from './utils';
import { THREADS_CAFE_DECK_ID, THREADS_MIX_DECK_ID, THREADS_MIX_TEXT_DECK_ID, addThreadsFoodFiles, isThreadsLocalDeck, isThreadsTextOnlyDeck } from './threadsFoodExport.mjs';
import JSZip from 'jszip';
import { generateExportZip } from './exportZip';
import { clearBatchExportRoot, cloneVisiblePageForExport, ensureExportFontsReady, findVisibleSelectedPageNode, loadThreadsFoodPhoto, prepareQualityLayout, renderBatchTaskPages, renderPageBlobWithRetry, renderPageMarkupForExport, renderPagesForExport, waitForExportLayout } from './exporter/render';
import { BATCH_CACHE_TRIM_INTERVAL, BATCH_IMAGE_SETTLE_TIMEOUT_MS, EXPORT_PIXEL_RATIO, batchCaptureConcurrencyForProfile, batchRenderChunkSize, exportCallbacks, exportQualityProfile, exportRuntimeProfile, mapExportWithSequentialRetry, mapWithConcurrency, releaseExportWakeLock, renderConcurrencyLimit, requestExportWakeLock, resolveExportList } from './exporter/shared';
import { assertBudget72HExportReady, assertExportContextPartners, assertItineraryNoteDarkPartnerExportReady, assertRuntimeResources, assertSpotlightV4V6PartnerExportReady, collectDriveFileIdsFromLists, formatSkippedListSummary, isResourceExportError } from './exporter/checks';
import { inlineImagesAsBlobs, inlineImagesForNodes, resetBatchImageCache, restoreImagesFromBlobs, waitForPageImagesSettled } from './exporter/images';
import { addListMetadataFiles, createHorizontalXlsx, createListFolder, deckShortName, downloadBlobFile, exportNameWithExtension, orderListsForBatchExport, todayDateTag, uniqueBatchFolderNames } from './exporter/files';
export { ensureExportFontsReady, renderPageBlob } from './exporter/render';
export { formatSkippedListSummary } from './exporter/checks';

async function assertExportImagesReady(entries, callbacks) {
  const result = await inspectExportImages(entries, renderPageMarkupForExport);
  if (result.skippedLists.length) throw new ExportImageError(`Chưa xuất: ${result.skippedLists.flatMap(list => list.errors).map(ref => `${ref.label} (${ref.place}): ${ref.id} — ${ref.reason}`).join('; ')}`);
}

let exportQueue = Promise.resolve();

async function runAdaptiveExport(attempt, context, callbacks) {
  const previous = exportQueue;
  /** @type {() => void} */
  let release;
  exportQueue = new Promise(resolve => { release = resolve; });
  await previous;
  const leaseId = `export-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const updateLease = (active) => fetch('/api/night-sync/export-lease', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ id: leaseId, active }), signal: AbortSignal.timeout(10000),
  }).catch(() => null);
  await updateLease(true);
  const leaseTimer = setInterval(() => { void updateLease(true); }, 30000);
  const cb = exportCallbacks(callbacks);
  try {
    try {
      cb.setStatus('Đang kiểm tra đối tác trước khi xuất...');
      context = assertExportContextPartners(context, attempt === exportBatchAttempt);
      cb.setStatus('Đang xác minh phiên frontend/backend trước khi xuất...');
      const assetFileId = collectRuntimePreflightFileIds(context)[0] || '';
      await verifyRuntimeSession({ checkExportRoutes: true, assetFileId });
    } catch (error) {
      const message = error?.message || 'Không xác minh được phiên tool.';
      cb.failProgress(`Không thể xuất: ${message}`);
      cb.setStatus(`Lỗi: ${message}`);
      const skippedLists = error.skippedLists || context._partnerSkippedLists || [];
      // Only an all-rejected preflight accounts for every scheduled list.
      // Runtime/session failures leave valid lists unexported, not "skipped".
      if (error.skippedLists) await context.onExportOutcome?.({ exportedLists: [], skippedLists });
      return { success: false, error: message, exportedLists: [], skippedLists };
    }
    try {
      return await attempt(context, callbacks);
    } catch (error) {
      if (!error?.retryCompatibleExport) throw error;
      await markRuntimeResourceFailure();
      exportCallbacks(callbacks).setStatus('Thiếu tài nguyên khi xuất; đang xuất lại toàn bộ bằng Cân bằng tương thích...');
      return await attempt({ ...context, _compatRetry: true }, callbacks);
    }
  } catch (error) {
    // Also covers failures before an attempt's own try/finally (runtime checks,
    // layout validation, metadata and compatible retry initialization).
    const message = error?.message || 'Không rõ lỗi.';
    cb.failProgress(`Xuất file thất bại: ${message}`);
    cb.setStatus(`Lỗi: ${message} Đã dừng xuất và hủy dữ liệu xuất dở; list được giữ nguyên. Hãy khắc phục rồi xuất lại.`);
    return { success: false, error: message, exportedLists: [], skippedLists: context._partnerSkippedLists || [] };
  } finally {
    cb.setBusy(false);
    clearBatchExportRoot();
    resetBatchImageCache();
    clearInterval(leaseTimer);
    await updateLease(false);
    release();
  }
}

function collectRuntimePreflightFileIds(context) {
  if (context?.list) return collectDriveFileIdsFromLists([{ list: context.list }]);
  const selectedIds = context?.selectedListIds instanceof Set
    ? context.selectedListIds
    : new Set(context?.selectedListIds || []);
  if (!context?.dataset || !selectedIds.size) return [];
  const selectedLists = [];
  for (const deck of context.dataset.decks || []) {
    for (const list of deck.lists || []) {
      if (selectedIds.has(list.id) && !listIsMain(list)) selectedLists.push({ list });
    }
  }
  return collectDriveFileIdsFromLists(selectedLists);
}

export function exportSelectedPagePng(context, callbacks = {}) {
  return runAdaptiveExport(exportSelectedPagePngAttempt, context, callbacks);
}

export function exportActiveList(context, callbacks = {}) {
  return runAdaptiveExport(exportActiveListAttempt, context, callbacks);
}

export function exportBatch(context, callbacks = {}) {
  return runAdaptiveExport(exportBatchAttempt, context, callbacks);
}

async function exportSelectedPagePngAttempt(context, callbacks = {}) {
  const cb = exportCallbacks(callbacks);
  const { deck, list, selectedPageIndex, quality = 'optimized', dataset = null, _compatRetry = false } = context;
  if (!deck || !list) return;
  if (isThreadsLocalDeck(deck.id)) throw new Error(`Mẫu Threads này chỉ xuất ZIP gồm TXT, XLSX đối tác${isThreadsTextOnlyDeck(deck.id) ? '' : ' và 6 ảnh'}; hãy dùng Xuất list ZIP.`);
  const runtime = _compatRetry ? { mode: 'legacy' } : await exportRuntimeProfile(quality, cb);
  const qualityProfile = exportQualityProfile(quality, deck.id, runtime.mode, context.format);

  const exportList = resolveExportList(deck, list, dataset);
  const page = exportList.pages?.[selectedPageIndex];
  if (page?.layoutVariant === 'budget-3n2d-table') {
    assertBudget72HExportReady(deck, exportList);
  }

  cb.setBusy(true);
  cb.setStatus(`Đang xuất ${qualityProfile.imageExtension.toUpperCase()} cho trang ${selectedPageIndex + 1}/${list.pages.length}...`);
  cb.showProgress(`Chuẩn bị xuất trang ${selectedPageIndex + 1}/${list.pages.length}...`, 5);
  resetBatchImageCache();

  try {
    await assertExportImagesReady([{ deck, list: exportList, onlyPageIndex: selectedPageIndex }], cb);
    const visiblePageNode = findVisibleSelectedPageNode(list, selectedPageIndex);
    const preferFreshRender = qualityProfile.losslessSource || page?.layoutVariant === 'budget-3n2d-table'
      || page?.layoutVariant === 'budget-3n2d'
      || page?.layoutVariant === 'grid-8-quaytung-menu'
      || page?.type === 'cover' && String(page?.layoutVariant || '').startsWith('budget');
    const pageNodes = (!preferFreshRender && visiblePageNode)
      ? [cloneVisiblePageForExport(visiblePageNode)]
      : renderPagesForExport(exportList, { pageIndex: selectedPageIndex });
    prepareQualityLayout(pageNodes, qualityProfile);
    await waitForExportLayout();
    cb.updateProgress(18, `Đang dựng layout trang ${selectedPageIndex + 1}/${list.pages.length}...`);
    const pageNode = pageNodes.find((node) => Number(node.dataset.pageIndex) === selectedPageIndex);
    if (!pageNode) throw new Error(`Không tìm thấy trang ${selectedPageIndex + 1}/${list.pages.length} để xuất.`);
    cb.updateProgress(36, 'Đang chuẩn bị ảnh cho trang...');
    await waitForPageImagesSettled(pageNode, BATCH_IMAGE_SETTLE_TIMEOUT_MS);
    const preparedImages = await inlineImagesAsBlobs(pageNode, {
      fitImagesToElement: true,
      fitPixelRatio: qualityProfile.pixelRatio,
      maxImageDimension: qualityProfile.sourceImageMaxDimension,
      sourceImageFormat: qualityProfile.sourceImageFormat,
      sourceImageQuality: qualityProfile.sourceImageQuality,
      uniqueObjectUrl: true,
    });
    let blob;
    try {
      await assertRuntimeResources(qualityProfile);
      cb.updateProgress(66, `Đang render ${qualityProfile.imageExtension.toUpperCase()}...`);
      blob = await renderPageBlobWithRetry(pageNode, {
        imagesReady: true,
        pixelRatio: qualityProfile.pixelRatio,
        imageFormat: qualityProfile.imageFormat,
        imageQuality: qualityProfile.imageQuality,
        backgroundColor: qualityProfile.backgroundColor,
        preferHtml2Canvas: qualityProfile.preferHtml2Canvas,
        renderTimeoutMs: qualityProfile.renderTimeoutMs,
      });
    } finally {
      restoreImagesFromBlobs(preparedImages);
    }
    cb.updateProgress(92, 'Đang lưu file ảnh...');
    await assertRuntimeResources(qualityProfile);
    if (!downloadBlobFile(blob, `${sanitizeFilePart(deck.id)}-${sanitizeFilePart(list.id)}-${exportNameWithExtension(pageNode, selectedPageIndex, qualityProfile.imageExtension)}`)) {
      throw new Error('Trình duyệt chặn bước tải ảnh. Hãy giữ tab tool đang mở rồi bấm xuất lại.');
    }
    cb.completeProgress(`Đã xuất xong ${qualityProfile.imageExtension.toUpperCase()}.`);
    cb.setStatus(`Đã xuất ${qualityProfile.imageExtension.toUpperCase()}.`);
  } catch (error) {
    if (!_compatRetry && quality === 'optimized' && runtime.mode === 'modern' && isResourceExportError(error)) {
      error.retryCompatibleExport = true;
      throw error;
    }
    const message = error?.message || 'Không rõ lỗi.';
    console.warn(`Page PNG export failed: ${message}`);
    cb.failProgress(`Xuất ảnh thất bại: ${message}`);
    cb.setStatus(`Lỗi: ${message} Đã dừng xuất và hủy dữ liệu xuất dở; list được giữ nguyên. Hãy khắc phục rồi xuất lại.`);
    return { success: false, error: message };
  } finally {
    clearBatchExportRoot();
    resetBatchImageCache();
    cb.setBusy(false);
  }
}

async function generateZipForList(list, zipInstance = null, options = {}, callbacks = {}) {
  const cb = exportCallbacks(callbacks);
  const currentZip = zipInstance || new JSZip();
  const deckId = options.deckId || 'unknown';
  const folder = createListFolder(currentZip, list, zipInstance, deckId);
  const pageNodes = (options.pageNodes || renderPagesForExport(list))
    .sort((a, b) => Number(a.dataset.pageIndex) - Number(b.dataset.pageIndex));

  if (pageNodes.length === 0 || pageNodes.length !== list.pages?.length) throw new Error(`List "${list.id}" thiếu trang; đã dừng xuất để tránh ZIP không đầy đủ.`);

  const baseDate = Date.now();
  const concurrencyLimit = Number(options.renderConcurrencyLimit || renderConcurrencyLimit());
  prepareQualityLayout(pageNodes, options);
  for (let i = 0; i < pageNodes.length; i += concurrencyLimit) {
    await assertRuntimeResources(options);
    const chunk = pageNodes.slice(i, i + concurrencyLimit);
    const chunkStart = i + 1;
    const chunkEnd = i + chunk.length;
    cb.setStatus(`Đang chuẩn bị ảnh "${list.title}": ${chunkStart}-${chunkEnd}/${pageNodes.length}...`);
    options.onChunkPreparing?.({ list, chunkStart, chunkEnd, pageCount: pageNodes.length });
    await Promise.all(chunk.map((pageNode) => waitForPageImagesSettled(pageNode, BATCH_IMAGE_SETTLE_TIMEOUT_MS)));
    const preparedImages = [];
    try {
      const preparedResults = await Promise.allSettled(chunk.map(pageNode => inlineImagesAsBlobs(pageNode, {
      waitForReady: options.waitForImageReady,
      fitImagesToElement: true,
      fitPixelRatio: options.pixelRatio || EXPORT_PIXEL_RATIO,
      maxImageDimension: options.maxImageDimension,
      sourceImageFormat: options.sourceImageFormat,
      sourceImageQuality: options.sourceImageQuality,
      uniqueObjectUrl: true,
      })));
      for (const result of preparedResults) {
        if (result.status === 'fulfilled') preparedImages.push(...result.value);
      }
      const preparationFailure = preparedResults.find(result => result.status === 'rejected');
      if (preparationFailure) throw preparationFailure.reason;
      await mapExportWithSequentialRetry(chunk, options.losslessSource ? 2 : chunk.length, async (pageNode, chunkIdx) => {
        const globalIdx = i + chunkIdx;
        cb.setStatus(`Đang render "${list.title}": ${globalIdx + 1}/${pageNodes.length}...`);

        const blob = await renderPageBlobWithRetry(pageNode, {
          imagesReady: true,
          pixelRatio: options.pixelRatio,
          renderTimeoutMs: options.renderTimeoutMs,
          imageFormat: options.imageFormat,
          imageQuality: options.imageQuality,
          backgroundColor: options.backgroundColor,
          preferHtml2Canvas: options.preferHtml2Canvas,
          embedFonts: options.embedFonts,
          waitForImageReady: options.waitForImageReady,
        });
        const exportName = exportNameWithExtension(pageNode, globalIdx, options.fileExtension || 'png');
        folder.file(exportName, blob, {
          date: new Date(baseDate + (pageNodes.length - globalIdx) * 4000),
          compression: 'STORE',
        });
        options.onPageRendered?.({ list, pageNode, pageIndex: globalIdx, pageCount: pageNodes.length });
      }, () => Boolean(options.losslessSource));
    } finally {
      restoreImagesFromBlobs(preparedImages);
    }
  }

  await addListMetadataFiles(folder, list, parseListSetIndex(list), deckId);
  await assertRuntimeResources(options);

  return zipInstance ? null : await generateExportZip(currentZip, options.onZipProgress);
}

async function exportActiveListAttempt(context, callbacks = {}) {
  const cb = exportCallbacks(callbacks);
  const { deck, list, quality = 'optimized', dataset = null, _compatRetry = false } = context;
  if (!deck || !list) return;
  const runtime = _compatRetry ? { mode: 'legacy' } : await exportRuntimeProfile(quality, cb);
  const qualityProfile = exportQualityProfile(quality, deck.id, runtime.mode, context.format);

  const exportList = resolveExportList(deck, list, dataset);
  assertBudget72HExportReady(deck, exportList);

  cb.setBusy(true);
  cb.setStatus(`Đang chuẩn bị ZIP cho list "${list.title}"...`);
  cb.showProgress(`Chuẩn bị xuất ZIP "${list.title}"...`, 3);
  resetBatchImageCache();

  try {
    assertSpotlightV4V6PartnerExportReady(exportList, deck.id);
    assertItineraryNoteDarkPartnerExportReady(exportList, deck.id);
    if (isThreadsLocalDeck(deck.id)) {
      const zip = new JSZip();
      await addThreadsFoodFiles(zip, exportList, item => loadThreadsFoodPhoto(item, exportList.photoPreset), sanitizeFilePart, createHorizontalXlsx);
      const textOnly = isThreadsTextOnlyDeck(deck.id);
      cb.updateProgress(85, textOnly ? 'Đang đóng ZIP gồm TXT và XLSX...' : 'Đang đóng ZIP gồm TXT, XLSX và 6 ảnh...');
      const blob = await generateExportZip(zip);
      const setLabel = formatListSetLabel(parseListSetIndex(list));
      const filePrefix = deck.id === THREADS_CAFE_DECK_ID ? 'ca-phe-threads-'
        : deck.id === THREADS_MIX_DECK_ID ? 'tong-hop-threads-'
          : deck.id === THREADS_MIX_TEXT_DECK_ID ? 'tong-hop-threads-chu-' : 'quan-an-threads-';
      if (!downloadBlobFile(blob, filePrefix + setLabel + '.zip')) {
        throw new Error('Trình duyệt chặn bước tải ZIP. Hãy giữ tab tool đang mở rồi bấm xuất lại.');
      }
      const doneMessage = textOnly ? 'Đã xuất TXT và XLSX đối tác; không có ảnh.' : 'Đã xuất TXT, XLSX đối tác và 6 ảnh.';
      cb.completeProgress(doneMessage);
      cb.setStatus(doneMessage);
      return { success: true };
    }
    await assertExportImagesReady([{ deck, list: exportList }], cb);
    const pageNodes = renderPagesForExport(exportList);
    await waitForExportLayout();
    cb.updateProgress(8, `Đang dựng layout ${pageNodes.length} trang...`);
    let renderedPages = 0;
    const totalPages = Math.max(pageNodes.length, 1);
    const blob = await generateZipForList(exportList, null, {
      pageNodes,
      deckId: deck.id,
      fullResolutionV6: qualityProfile.fullResolutionV6,
      losslessSource: qualityProfile.losslessSource,
      compatibility: qualityProfile.compatibility,
      pixelRatio: qualityProfile.pixelRatio,
      maxImageDimension: qualityProfile.sourceImageMaxDimension,
      sourceImageFormat: qualityProfile.sourceImageFormat,
      sourceImageQuality: qualityProfile.sourceImageQuality,
      imageFormat: qualityProfile.imageFormat,
      imageQuality: qualityProfile.imageQuality,
      backgroundColor: qualityProfile.backgroundColor,
      preferHtml2Canvas: qualityProfile.preferHtml2Canvas,
      renderTimeoutMs: qualityProfile.renderTimeoutMs,
      fileExtension: qualityProfile.imageExtension,
      renderConcurrencyLimit: batchRenderChunkSize(qualityProfile),
      onChunkPreparing: ({ chunkStart, chunkEnd, pageCount }) => {
        cb.updateProgress(10 + (renderedPages / totalPages) * 75, `Đang chuẩn bị ảnh "${list.title}": ${chunkStart}-${chunkEnd}/${pageCount} trang...`);
      },
      onPageRendered: () => {
        renderedPages += 1;
        cb.updateProgress(10 + (renderedPages / totalPages) * 75, `Đang render "${list.title}": ${renderedPages}/${pageNodes.length} trang...`);
      },
      onZipProgress: (metadata) => {
        cb.updateProgress(85 + (Number(metadata?.percent || 0) * 0.14), 'Đang đóng file ZIP...');
      },
    }, cb);
    cb.updateProgress(99, 'Đang lưu file ZIP...');
    await assertRuntimeResources(qualityProfile);
    const setLabel = formatListSetLabel(parseListSetIndex(list));
    if (!downloadBlobFile(blob, `${deckShortName(deck.id)}-${setLabel}.zip`)) {
      throw new Error('Trình duyệt chặn bước tải ZIP. Hãy giữ tab tool đang mở rồi bấm xuất lại.');
    }
    cb.completeProgress(`Đã xuất xong ZIP cho "${list.title}".`);
    cb.setStatus(`Đã xong ZIP cho list "${list.title}".`);
  } catch (error) {
    if (!_compatRetry && quality === 'optimized' && runtime.mode === 'modern' && isResourceExportError(error)) {
      error.retryCompatibleExport = true;
      throw error;
    }
    const message = error?.message || 'Không rõ lỗi.';
    console.warn(`List ZIP export failed: ${message}`);
    cb.failProgress(`Xuất ZIP thất bại: ${message}`);
    cb.setStatus(`Lỗi: ${message} Đã dừng xuất và hủy dữ liệu xuất dở; list được giữ nguyên. Hãy khắc phục rồi xuất lại.`);
    return { success: false, error: message };
  } finally {
    clearBatchExportRoot();
    resetBatchImageCache();
    cb.setBusy(false);
  }
}

async function exportBatchAttempt(context, callbacks = {}) {
  const cb = exportCallbacks(callbacks);
  const { dataset, selectedListIds, quality = 'optimized', _compatRetry = false } = context;
  if (!dataset || selectedListIds.size === 0) return;
  const runtime = _compatRetry ? { mode: 'legacy' } : await exportRuntimeProfile(quality, cb);
  const qualityProfile = exportQualityProfile(quality, undefined, runtime.mode, context.format);

  const listIds = Array.from(selectedListIds);
  const allLists = [];
  dataset.decks.forEach((deck) => {
    deck.lists.forEach((list) => {
      if (listIds.includes(list.id) && !listIsMain(list)) allLists.push({ deck, list });
    });
  });

  if (allLists.length === 0) {
    cb.setStatus('Chưa có list AI để xuất. List gốc/mẫu đã được bỏ qua.');
    cb.completeProgress('Không có list AI được chọn để xuất.');
    return { success: false, exportedLists: [] };
  }

  let orderedLists = orderListsForBatchExport(structuredClone(allLists), dataset).map((item) => ({
    ...item,
    list: resolveExportList(item.deck, item.list, dataset),
  }));

  orderedLists.forEach(({ deck, list }) => assertBudget72HExportReady(deck, list));

  cb.setBusy(true);
  cb.setStatus(`Đang chuẩn bị xuất ${orderedLists.length} list (${qualityProfile.label})...`);
  cb.showProgress(`Chuẩn bị xuất ${orderedLists.length} list (${qualityProfile.label})...`, 2);
  resetBatchImageCache();

  const skippedLists = [...(context._partnerSkippedLists || [])];
  let mainZip;
  try {
    orderedLists.forEach(({ deck, list }) => assertSpotlightV4V6PartnerExportReady(list, deck.id));
    orderedLists.forEach(({ deck, list }) => assertItineraryNoteDarkPartnerExportReady(list, deck.id));
    const localEntries = orderedLists.filter((entry) => isThreadsLocalDeck(entry.deck.id));
    const inspection = await inspectExportImages(
      orderedLists.filter((entry) => !isThreadsLocalDeck(entry.deck.id)),
      renderPageMarkupForExport,
    );
    if (inspection.skippedLists.length) {
      skippedLists.push(...inspection.skippedLists);
      const accepted = context.skipImageErrors === true || await context.confirmSkipImages?.(inspection);
      if (!inspection.validEntries.length && !localEntries.length) {
        await context.onExportOutcome?.({ exportedLists: [], skippedLists });
        throw new ExportImageError('Tất cả list đều thiếu ảnh hợp lệ. Hãy cập nhật dữ liệu trước khi xuất.');
      }
      if (!accepted) {
        cb.setStatus('Đã hủy xuất. Các list được giữ nguyên.');
        cb.completeProgress('Đã hủy xuất.');
        return { success: false, cancelled: true, exportedLists: [], skippedLists };
      }
      orderedLists = orderListsForBatchExport([...inspection.validEntries, ...localEntries], dataset);
    }

    mainZip = new JSZip();
    await requestExportWakeLock();
    const totalPages = Math.max(orderedLists.reduce((total, item) => total + (isThreadsLocalDeck(item.deck.id) ? 0 : item.list.pages?.length || 0), 0), 1);
    let renderedPages = 0;
    cb.updateProgress(3, `Đang chuẩn bị ${orderedLists.length} folder ${qualityProfile.label}...`);
    if (orderedLists.some((item) => !isThreadsLocalDeck(item.deck.id))) {
      await ensureExportFontsReady(document.documentElement, { decodeImages: false, embedFonts: true });
    }

    const folderNames = uniqueBatchFolderNames(orderedLists, dataset);
    const folders = folderNames.map(name => mainZip.folder(name));
    await mapWithConcurrency(orderedLists, qualityProfile.compatibility ? 1 : 6, (item, index) => addListMetadataFiles(folders[index], item.list, parseListSetIndex(item.list), item.deck.id));

    const pageTasks = [];
    orderedLists.forEach((item, listIndex) => {
      if (isThreadsLocalDeck(item.deck.id)) return;
      const pages = item.list.pages || [];
      if (pages.length === 0) {
        throw new Error(`List "${item.list.id}" không có trang; đã dừng xuất.`);
      }
      pages.forEach((page, pageIndex) => {
        pageTasks.push({
          qualityProfile: exportQualityProfile(quality, item.deck.id, runtime.mode, context.format),
          list: item.list,
          listIndex,
          page,
          pageIndex,
          pageCount: pages.length,
          folder: folders[listIndex],
        });
      });
    });

    const baseDate = Date.now();
    // A cold local photo preset is rendered by a bounded backend worker pool.
    // Mounting a large photo grid queues dozens of transforms at once and can
    // exhaust the image-settle deadline before valid images have been served.
    const hasLocalPhotoPreset = pageTasks.some(task => task.page.localRender && (task.page.photoPreset || task.list.photoPreset));
    const concurrencyLimit = hasLocalPhotoPreset ? Math.min(batchRenderChunkSize(qualityProfile), 2) : batchRenderChunkSize(qualityProfile);
    let pagesSinceLastTrim = 0;
    for (let i = 0; i < pageTasks.length; i += concurrencyLimit) {
      await assertRuntimeResources(qualityProfile);
      const chunk = pageTasks.slice(i, i + concurrencyLimit).filter(task => !skippedLists.some(skip => skip.listId === task.list.id));
      if (!chunk.length) continue;
      const chunkStart = i + 1;
      const chunkEnd = i + chunk.length;
      cb.setStatus(`Đang chuẩn bị ảnh ${qualityProfile.label} ${chunkStart}-${chunkEnd}/${pageTasks.length} trang...`);
      cb.updateProgress(3 + (renderedPages / totalPages) * 86, `Đang chuẩn bị ảnh ${qualityProfile.label} ${chunkStart}-${chunkEnd}/${pageTasks.length} trang...`);
      const renderedChunk = renderBatchTaskPages(chunk);
      await waitForExportLayout();
      let validChunk = renderedChunk.filter((task) => task.pageNode);
      validChunk.forEach((task) => prepareQualityLayout([task.pageNode], task.qualityProfile));
      if (validChunk.length !== chunk.length) {
        throw new Error('Thiếu trang khi dựng layout; đã dừng xuất để tránh ZIP không đầy đủ.');
      }
      // Đợi ảnh preview/load xong trước khi inline — tránh fetch lại Drive rồi ra nền xám.
      await Promise.all(validChunk.map(async (task) => {
        try { await waitForPageImagesSettled(task.pageNode, BATCH_IMAGE_SETTLE_TIMEOUT_MS); }
        catch (error) {
          if (task.deckId !== 'threads-grid6-collage' && !task.pageNode.classList.contains('threads-grid6') && !task.pageNode.classList.contains('threads-note-dark') && !task.pageNode.classList.contains('threads-recap')) throw error;
          const entry = orderedLists[task.listIndex];
          if (!skippedLists.some(skip => skip.listId === task.list.id)) skippedLists.push(lateImageListFailure(entry, task, error));
        }
      }));
      validChunk = validChunk.filter(task => !skippedLists.some(skip => skip.listId === task.list.id));
      const preparedImages = [];
      try {
      // Keep image caches/profile selection isolated in mixed-template batches.
      for (const task of validChunk) {
        const qualityProfile = task.qualityProfile;
        try {
        preparedImages.push(...await inlineImagesForNodes([task.pageNode], {
        waitForReady: true,
        concurrency: qualityProfile.imagePrepareConcurrency,
        maxImageDimension: qualityProfile.sourceImageMaxDimension,
        sourceImageFormat: qualityProfile.sourceImageFormat,
        sourceImageQuality: qualityProfile.sourceImageQuality,
        fitImagesToElement: true,
        fitPixelRatio: qualityProfile.pixelRatio,
        uniqueObjectUrl: true,
      }));
        } catch (error) {
          if (error?.code !== 'EXPORT_IMAGE_UNAVAILABLE' && !task.pageNode.classList.contains('threads-grid6') && !task.pageNode.classList.contains('threads-note-dark') && !task.pageNode.classList.contains('threads-recap')) throw error;
          const entry = orderedLists[task.listIndex];
          if (!skippedLists.some(skip => skip.listId === task.list.id)) skippedLists.push(lateImageListFailure(entry, task, error));
        }
      }
      validChunk = validChunk.filter(task => !skippedLists.some(skip => skip.listId === task.list.id));
        await mapExportWithSequentialRetry(validChunk, batchCaptureConcurrencyForProfile(qualityProfile), async (task, chunkIdx) => {
          try {
          const qualityProfile = task.qualityProfile;
          const globalIdx = i + chunkIdx;
          const blob = await renderPageBlobWithRetry(task.pageNode, {
            batchRender: true,
            imagesReady: true,
            pixelRatio: qualityProfile.pixelRatio,
            imageFormat: qualityProfile.imageFormat,
            imageQuality: qualityProfile.imageQuality,
            backgroundColor: qualityProfile.backgroundColor,
            preferHtml2Canvas: qualityProfile.preferHtml2Canvas,
            embedFonts: true,
            waitForImageReady: false,
            renderTimeoutMs: qualityProfile.renderTimeoutMs,
          });
          const exportName = exportNameWithExtension(task.pageNode, task.pageIndex, qualityProfile.imageExtension);
          task.folder.file(exportName, blob, {
            date: new Date(baseDate + (pageTasks.length - globalIdx) * 4000),
            compression: 'STORE',
          });
          renderedPages += 1;
          cb.updateProgress(3 + (renderedPages / totalPages) * 86, `Đang render ${qualityProfile.label} ${renderedPages}/${totalPages} trang...`);
          } catch (error) {
            if (error?.code !== 'EXPORT_IMAGE_UNAVAILABLE' && !task.pageNode.classList.contains('threads-grid6') && !task.pageNode.classList.contains('threads-note-dark') && !task.pageNode.classList.contains('threads-recap')) throw error;
            const entry = orderedLists[task.listIndex];
            if (!skippedLists.some(skip => skip.listId === task.list.id)) skippedLists.push(lateImageListFailure(entry, task, error));
          }
        }, (task) => Boolean(task.qualityProfile.losslessSource));
      } finally {
        restoreImagesFromBlobs(preparedImages);
        clearBatchExportRoot();
      }
      // Periodically trim image cache to prevent OOM on large batch exports (20-50 lists)
      pagesSinceLastTrim += chunk.length;
      if (pagesSinceLastTrim >= BATCH_CACHE_TRIM_INTERVAL) {
        resetBatchImageCache();
        pagesSinceLastTrim = 0;
      }
    }

    const successful = orderedLists.filter(({ list }) => !skippedLists.some(skip => skip.listId === list.id));
    for (let index = 0; index < orderedLists.length; index++) if (skippedLists.some(skip => skip.listId === orderedLists[index].list.id)) {
      const skipped = skippedLists.find(skip => skip.listId === orderedLists[index].list.id);
      // Remove the whole failed list: earlier pages and TXT/XLSX metadata may
      // already exist when a later page fails. Never ship that partial folder.
      skipped.discardedFiles = Object.values(mainZip.files).filter(file => !file.dir && file.name.startsWith(folders[index].root)).length;
      mainZip.remove(folders[index].root);
    }
    if (!successful.length) {
      await context.onExportOutcome?.({ exportedLists: [], skippedLists });
      throw new ExportImageError('Không có list nào đủ ảnh để xuất; không tạo ZIP rỗng.');
    }
    if (skippedLists.some(skip => skip.late) && context.skipImageErrors !== true) {
      const accepted = await context.confirmSkipImages?.({ validEntries: successful, validPages: successful.reduce((n, entry) => n + entry.list.pages.length, 0), skippedLists });
      if (!accepted) {
        cb.setStatus('Đã hủy xuất. Các list được giữ nguyên.');
        cb.completeProgress('Đã hủy xuất.');
        return { success: false, cancelled: true, exportedLists: [], skippedLists };
      }
    }
    if (skippedLists.length) mainZip.file('BAO-CAO-LIST-BO-QUA.json', JSON.stringify({ skippedLists }, null, 2));
    if (skippedLists.length) mainZip.file('BAO-CAO-LIST-BO-QUA.txt', '\uFEFF' + formatSkippedListSummary(skippedLists));
    const outcome = { success: true, exportedLists: successful.map(({ deck, list }) => ({ deckId: deck.id, listId: list.id })), skippedLists };
    cb.updateProgress(90, 'Đang đóng file ZIP hàng loạt...');
    const archive = await generateExportZip(mainZip, (metadata) => {
      const zipPercent = Number(metadata?.percent || 0);
      cb.updateProgress(
        Math.min(98, 90 + (zipPercent * 0.08)),
        `Đang đóng file ZIP hàng loạt... ${Math.round(zipPercent)}%`,
      );
    });
    cb.updateProgress(99, 'Đang lưu file ZIP hàng loạt...');
    await assertRuntimeResources(qualityProfile);
    // Yield to event loop before download — lets the browser settle after
    // heavy ZIP generation so the download trigger is more reliable.
    await new Promise((resolve) => setTimeout(resolve, 100));
    const archiveName = `${todayDateTag()}.zip`;
    if (typeof context.onArchive === 'function') {
      await context.onArchive(archive, archiveName, outcome);
    } else {
      const downloadStarted = downloadBlobFile(archive, archiveName);
      if (!downloadStarted) {
        throw new Error('Trình duyệt chặn bước tải ZIP. Hãy giữ tab tool đang mở rồi bấm xuất lại.');
      }
    }
    const discarded = skippedLists.reduce((total, skip) => total + (skip.discardedFiles || 0), 0);
    const doneMessage = `Đã xuất ${successful.length} list.` + (skippedLists.length ? ' ' + formatSkippedListSummary(skippedLists) : '')
      + (discarded ? ` Đã loại bỏ ${discarded} file xuất dở của các list lỗi khỏi ZIP; giữ nguyên list để sửa và xuất lại.` : '');
    cb.completeProgress(doneMessage);
    cb.setStatus(doneMessage);
    return outcome;
  } catch (error) {
    if (!_compatRetry && quality === 'optimized' && runtime.mode === 'modern' && isResourceExportError(error)) {
      error.retryCompatibleExport = true;
      throw error;
    }
    const message = error?.message || 'Không rõ lỗi.';
    console.warn(`Batch export failed: ${message}`);
    cb.failProgress(`Xuất hàng loạt thất bại: ${message}`);
    cb.setStatus(`Lỗi: ${message} Đã dừng xuất và hủy dữ liệu xuất dở; list được giữ nguyên. Hãy khắc phục rồi xuất lại.`);
    return { success: false, exportedLists: [], skippedLists, error: message };
  } finally {
    if (mainZip) for (const name of Object.keys(mainZip.files)) mainZip.remove(name);
    await releaseExportWakeLock();
    cb.setBusy(false);
    clearBatchExportRoot();
    resetBatchImageCache();
  }
}
