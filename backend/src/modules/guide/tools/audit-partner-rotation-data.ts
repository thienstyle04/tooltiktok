// Read-only inventory audit. Does NOT generate lists, sync, repair cache or write
// user data. Only the report is saved in an independent temporary directory.
import 'dotenv/config';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import sharp from 'sharp';
import * as XLSX from 'xlsx';
import { normalizeText, normalizeWorkbookHeaders, firstValue, composeAddress, itemMappingKey } from '../logic/image-resolver';
import { resolveSectionKeyFromSheetName } from '../sync/sheet-section';
import { publishedSourcePaths } from '../sync/published-source';

async function main() {
  const data = path.resolve(process.env.DALAT_DATA_DIR || path.join(__dirname, '../../../../data'));
  const cache = path.resolve(process.env.DALAT_DRIVE_FILE_CACHE_DIR || path.join(data, 'drive-file-cache'));
  const report: any[] = [], decoded = new Map<string, string>();
  for (const id of ['dalat', 'dalat-test', 'greenland', 'dalat-threads']) {
    const snapshot = publishedSourcePaths(data, id);
    const workbookPath = snapshot?.workbook || path.join(data, `workbook-cache.${id}.xlsx`);
    const manifestPath = snapshot?.manifest || path.join(data, `sheet-drive-images.${id}.json`);
    if (!fs.existsSync(workbookPath) || !fs.existsSync(manifestPath)) { report.push({ source: id, error: 'Chưa có workbook/manifest cục bộ' }); continue; }
    const original = [workbookPath, manifestPath].map(file => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex'));
    const workbook = XLSX.readFile(workbookPath), manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8').replace(/^\uFEFF/, ''));
    const partners: any[] = [];
    for (const sheetName of workbook.SheetNames) {
      const sectionKey = resolveSectionKeyFromSheetName(sheetName); if (!sectionKey) continue;
      const rows = XLSX.utils.sheet_to_json<any[]>(workbook.Sheets[sheetName], { header: 1, raw: false, defval: '' });
      const headers = normalizeWorkbookHeaders(rows[0] || []);
      for (const values of rows.slice(1)) {
        const row = Object.fromEntries(headers.map((header, index) => [header, String(values[index] || '')]));
        if (normalizeText(firstValue(row, 'doi_tac', 'doi_tac_cong_ty')) !== 'x') continue;
        const name = firstValue(row, 'ten_quan', 'ten_dia_diem', 'hoat_dong', 'ten'); if (!name) continue;
        const rawAddress = firstValue(row, 'dia_chi'), address = composeAddress(rawAddress, firstValue(row, 'ten_phuong'));
        const entry = manifest.items[itemMappingKey(sectionKey, name, address)] || manifest.items[itemMappingKey(sectionKey, name, rawAddress)]
          || Object.values(manifest.items).find((entry: any) => entry.sectionKey === sectionKey && normalizeText(entry.name) === normalizeText(name)) as any;
        const ids: string[] = [...new Set<string>((entry?.candidateImages?.length ? entry.candidateImages : [{ fileId: entry?.fileId }]).map((image: any) => image.fileId).filter(Boolean))];
        const hashes = new Set<string>(), missing: string[] = [];
        for (const fileId of ids) {
          if (!decoded.has(fileId)) {
            try {
              const bytes = await sharp(fs.readFileSync(path.join(cache, fileId + '.bin')), { failOn: 'warning' }).rotate().resize(64, 64, { fit: 'fill' }).removeAlpha().raw().toBuffer();
              decoded.set(fileId, crypto.createHash('sha256').update(bytes).digest('hex'));
            } catch { decoded.set(fileId, ''); }
          }
          const hash = decoded.get(fileId); if (hash) hashes.add(hash); else missing.push(fileId);
        }
        partners.push({ sectionKey, name, address, manifestPhotos: ids.length, validDistinctCachedPhotos: hashes.size, missingOrCorrupt: missing });
      }
    }
    const groups = Object.fromEntries([...new Set(partners.map(item => item.sectionKey))].map(section => {
      const group = partners.filter(item => item.sectionKey === section);
      return [section, { partners: group.length, withPhoto: group.filter(item => item.validDistinctCachedPhotos >= 1).length, withAlternatingPhotos: group.filter(item => item.validDistinctCachedPhotos >= 2).length }];
    }));
    const after = [workbookPath, manifestPath].map(file => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex'));
    if (JSON.stringify(original) !== JSON.stringify(after)) throw Error('Nguồn đang đổi trong lúc audit; cần chạy lại để có kết quả nhất quán.');
    report.push({ source: id, groups, partners, limitations: 'Đọc cache cục bộ; không tải hoặc kiểm tra quyền Google Drive trên mạng. Ảnh trùng nhận diện theo pixel sau resize; các cột ảnh Nhật ký riêng chưa được tính.' });
    console.log(id, JSON.stringify(groups));
  }
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'partner-rotation-data-audit-'));
  fs.writeFileSync(path.join(directory, 'inventory.json'), JSON.stringify(report, null, 2));
  console.log('AUDIT_REPORT=' + path.join(directory, 'inventory.json'));
}
main().catch(error => { console.error(error); process.exitCode = 1; });
