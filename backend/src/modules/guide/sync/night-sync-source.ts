import { DestinationConfig } from './destination-config';
import { fetchWorkbookFromSheet, SheetWorkbookSource } from './workbook-source';
import { buildSheetDriveManifest, readSheetDriveManifest, SheetDriveImageManifest } from './sheet-drive-manifest';
import { clearKnownFailedDriveFileIds, warmDriveFileDiskCache } from './drive-images';
import { hasSyncPermit } from './night-sync-policy';
import { NightSourceResult, SyncProgress } from './night-sync-coordinator';

interface SourceHooks {
  progress?: (value: SyncProgress) => void;
  dataRoot: string;
  load: () => SheetWorkbookSource | null;
  validate: (source: SheetWorkbookSource) => void;
  save: (source: SheetWorkbookSource) => void;
  syncHooks?: (manifest: SheetDriveImageManifest) => Promise<string[]>;
  publish: (source: SheetWorkbookSource, manifest: SheetDriveImageManifest) => Promise<void>;
}

/** Destination-scoped worker. Publication is supplied by the owner of the dataset lock. */
export async function syncNightSource(config: DestinationConfig, sheetDone: boolean, markSheetDone: () => void, hooks: SourceHooks): Promise<NightSourceResult> {
  if (!hasSyncPermit()) throw new Error('Không có quyền tải trong lượt đồng bộ hiện tại.');
  let source = sheetDone ? hooks.load() : null;
  if (!source) {
    hooks.progress?.({ stage: 'Đang tải Google Sheet' });
    source = await fetchWorkbookFromSheet(config);
    hooks.validate(source);
    hooks.save(source);
    markSheetDone();
  }
  const previous = readSheetDriveManifest(hooks.dataRoot, config.id);
  hooks.progress?.({ stage: 'Đang đọc link ảnh' });
  const manifest = await buildSheetDriveManifest(source, previous, { forceRevalidate: true, revalidateUncached: true,
    onProgress: (completed, total) => hooks.progress?.({ stage: 'Đang đọc link ảnh', completed, total }),
  });
  if (!hasSyncPermit()) throw new Error('Đã hết khung giờ; giữ nguyên dataset đang dùng.');
  const ids = new Set<string>();
  for (const item of Object.values(manifest.items)) {
    for (const id of [item.fileId, item.mapFileId, ...(item.candidateImages || []).map(e => e.fileId), ...(item.mapCandidateImages || []).map(e => e.fileId)]) {
      if (id) ids.add(id);
    }
  }
  for (const entries of [manifest.coverImages, ...Object.values(manifest.coverImageGroups || {})]) {
    for (const entry of entries || []) if (entry.fileId) ids.add(entry.fileId);
  }
  clearKnownFailedDriveFileIds([...ids]);
  const warmed = await warmDriveFileDiskCache([...ids], { concurrency: 2,
    onProgress: value => hooks.progress?.({ stage: 'Đang tải ảnh vào cache', total: value.total,
      completed: value.skipped + value.ok + value.fail, failed: value.fail }),
  });
  if (!hasSyncPermit()) throw new Error('Đã hết khung giờ; ảnh hoàn chỉnh được giữ cho lượt sau.');
  hooks.progress?.({ stage: 'Đang cập nhật hook theo chủ đề' });
  const hookErrors = await hooks.syncHooks?.(manifest) || [];
  hooks.progress?.({ stage: 'Đang công bố dữ liệu mới' });
  await hooks.publish(source, manifest);
  return {
    downloaded: warmed.ok, failed: warmed.fail, hookErrors,
    added: Object.keys(manifest.items).filter(key => !previous.items[key]).length,
    changed: Object.entries(manifest.items).filter(([key, value]) => previous.items[key] && JSON.stringify(previous.items[key]) !== JSON.stringify(value)).length,
  };
}
