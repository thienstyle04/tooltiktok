import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import * as XLSX from 'xlsx';

import { GuideService } from '../guide.service';
import { getDestinationConfig, unregisterDestination } from '../sync/destination-config';
import { parseWorkbookBuffer, SheetWorkbookSource } from '../sync/workbook-source';

function createMinimalWorkbook(): Buffer {
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet([
    ['ten_quan', 'dia_chi', 'link_drive'],
    ['Nguon runtime', '1 Duong Test', ''],
  ]), 'Quan_an');
  return XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' }) as Buffer;
}

async function run(): Promise<void> {
  const repoBackendRoot = path.resolve(__dirname, '../../../..');
  const seedRoot = path.join(repoBackendRoot, 'resources', 'workbooks');
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'dalat-xlsx-source-'));
  const tempDataRoot = path.join(tempRoot, 'data');
  const tempBackendRoot = path.join(tempRoot, 'backend');
  const tempSeedRoot = path.join(tempBackendRoot, 'resources', 'workbooks');
  fs.mkdirSync(tempDataRoot, { recursive: true });
  fs.mkdirSync(tempSeedRoot, { recursive: true });

  try {
    for (const [id, fileName] of [['dalat', 'dalat.xlsx'], ['greenland', 'greenland.xlsx']] as const) {
      const seedPath = path.join(seedRoot, fileName);
      assert.ok(fs.existsSync(seedPath), `Thiếu workbook đóng kèm ${fileName}`);
      const body = fs.readFileSync(seedPath);
      const source = parseWorkbookBuffer(body, {
        workbookName: getDestinationConfig(id).workbookName,
        destinationId: id,
        sourceUrl: seedPath,
        sourceType: 'bundled-xlsx',
      });
      assert.ok(source.workbook.SheetNames.length >= 10, `${id} phải có đủ các sheet dữ liệu chính`);
      fs.copyFileSync(seedPath, path.join(tempSeedRoot, fileName));
    }

    const service = new GuideService();
    const internals = service as any;
    internals.dataRoot = tempDataRoot;
    internals.toolRoot = tempBackendRoot;
    internals.customDestinationsPath = path.join(tempDataRoot, 'custom-destinations.json');

    const bundled = internals.loadPreferredWorkbookSource('dalat') as SheetWorkbookSource | null;
    assert.equal(bundled?.sourceType, 'bundled-xlsx', 'Máy mới phải dùng XLSX đóng kèm khi chưa có runtime cache');
    internals.validateWorkbookData(bundled);

    const runtimePath = path.join(tempDataRoot, 'workbook-cache.dalat.xlsx');
    fs.writeFileSync(runtimePath, createMinimalWorkbook());
    const runtime = internals.loadPreferredWorkbookSource('dalat') as SheetWorkbookSource | null;
    assert.equal(runtime?.sourceType, 'runtime-xlsx', 'XLSX người dùng đã nhập phải ưu tiên hơn bản đóng kèm');
    assert.equal(runtime?.workbook.SheetNames[0], 'Quan_an');

    fs.writeFileSync(runtimePath, Buffer.from('khong-phai-xlsx'));
    const recovered = internals.loadPreferredWorkbookSource('dalat') as SheetWorkbookSource | null;
    assert.equal(recovered?.sourceType, 'bundled-xlsx', 'Runtime XLSX hỏng phải quay về bản đóng kèm');

    assert.throws(
      () => internals.validateWorkbookUpload({ buffer: Buffer.from('x'), originalname: 'sai.txt', size: 1 }),
      /\.xlsx/i,
    );

    const uploadedBody = createMinimalWorkbook();
    internals.setActiveDestination = async ({ id }: { id: string }) => ({
      active: internals.getDestinationSummary(id),
      dataset: { source: { totalItems: 1 } },
    });
    const added = await service.addXlsxDestination(
      { label: 'Nguon thu nghiem' },
      { buffer: uploadedBody, originalname: 'nguon-thu.xlsx', size: uploadedBody.length },
    );
    const addedId = added.active.id;
    const savedPath = path.join(tempDataRoot, `workbook-cache.${addedId}.xlsx`);
    assert.ok(fs.existsSync(savedPath), 'API thêm XLSX phải lưu workbook runtime');
    assert.equal(added.active.hasSheetFallback, false);
    const savedBeforeInvalidReplace = fs.readFileSync(savedPath);
    await assert.rejects(
      () => service.replaceDestinationWorkbook(addedId, {
        buffer: Buffer.from('xlsx-hong'),
        originalname: 'hong.xlsx',
        size: 9,
      }),
      /XLSX|định dạng/i,
    );
    assert.deepEqual(
      fs.readFileSync(savedPath),
      savedBeforeInvalidReplace,
      'File thay thế không hợp lệ phải giữ nguyên workbook cũ',
    );

    const addedConfig = getDestinationConfig(addedId);
    addedConfig.sheetUrl = 'https://docs.google.com/spreadsheets/d/test-sheet/edit';
    addedConfig.exportUrl = 'https://docs.google.com/spreadsheets/d/test-sheet/export?format=xlsx';
    const originalFetch = global.fetch;
    global.fetch = (async () => new Response('unauthorized', { status: 401 })) as typeof fetch;
    try {
      await assert.rejects(
        () => service.refreshDestinationFromSheet(addedId),
        /dữ liệu XLSX cũ vẫn được giữ nguyên|Google Sheet/i,
      );
      assert.deepEqual(
        fs.readFileSync(savedPath),
        savedBeforeInvalidReplace,
        'Google Sheet lỗi phải giữ nguyên workbook cũ',
      );
    } finally {
      global.fetch = originalFetch;
    }
    unregisterDestination(addedId);

    console.log('PASS local-xlsx-sources: precedence, corrupt fallback, add/replace, failed Sheet refresh');
  } finally {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
}

run().catch((error) => {
  console.error('FAIL local-xlsx-sources:', error);
  process.exitCode = 1;
});
