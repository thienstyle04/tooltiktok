import * as fs from 'node:fs';
import * as path from 'node:path';
import * as crypto from 'node:crypto';
import type { SheetWorkbookSource } from './workbook-source';
import type { SheetDriveImageManifest } from './sheet-drive-manifest';

function sourceRoot(dataRoot: string, id: string) {
  if (!/^[a-z0-9-]+$/.test(id)) throw new Error('Mã nguồn không hợp lệ.');
  return path.join(dataRoot, 'source-snapshots', id);
}
export function publishedSourcePaths(dataRoot: string, id: string) {
  const root = sourceRoot(dataRoot, id), pointer = path.join(root, 'current.json');
  if (!fs.existsSync(pointer)) return null;
  const value = JSON.parse(fs.readFileSync(pointer, 'utf8').replace(/^\uFEFF/, ''));
  if (!/^[a-z0-9-]+$/.test(value.revision || '') || value.destinationId !== id) throw new Error('Con trỏ nguồn dữ liệu không hợp lệ.');
  const directory = path.join(root, value.revision);
  const workbook = path.join(directory, 'workbook.xlsx'), manifest = path.join(directory, 'manifest.json');
  if (!fs.existsSync(workbook) || !fs.existsSync(manifest)) throw new Error('Bản dữ liệu đã công bố không đầy đủ.');
  return { workbook, manifest, sourceUrl: String(value.sourceUrl || '') };
}
/** A single pointer publishes both complete files. Interrupted staging cannot
 * expose half a snapshot; previous revisions remain recoverable. */
export function publishSourceSnapshot(dataRoot: string, source: SheetWorkbookSource,
  manifest: SheetDriveImageManifest, canPublish: () => boolean) {
  if (!source.workbookBuffer?.length) throw new Error('Thiếu nội dung workbook để công bố.');
  const root = sourceRoot(dataRoot, source.destinationId);
  const revision = `${Date.now()}-${crypto.randomBytes(8).toString('hex')}`;
  const directory = path.join(root, revision);
  fs.mkdirSync(directory, { recursive: true });
  fs.writeFileSync(path.join(directory, 'workbook.xlsx'), source.workbookBuffer, { flag: 'wx' });
  fs.writeFileSync(path.join(directory, 'manifest.json'), JSON.stringify(manifest, null, 2), { flag: 'wx' });
  if (!canPublish()) throw new Error('Đã dừng đồng bộ; dữ liệu cũ vẫn được giữ nguyên.');
  const temporary = path.join(root, `pointer-${revision}.tmp`);
  fs.writeFileSync(temporary, JSON.stringify({ revision, destinationId: source.destinationId, sourceUrl: source.sourceUrl }), { flag: 'wx' });
  fs.renameSync(temporary, path.join(root, 'current.json'));
}
