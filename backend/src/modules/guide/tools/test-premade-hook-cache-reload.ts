import * as assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

import { loadPremadeHookPool } from '../sync/premade-hook-source';

const tempDataRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'dalat-premade-hooks-'));
const filePath = path.join(tempDataRoot, 'premade-hooks.json');

try {
  // 1) File chua ton tai luc goi lan dau (giong luc server moi khoi dong truoc khi file duoc tao)
  //    -> phai tra ve rong, KHONG duoc throw.
  const firstAttempt = loadPremadeHookPool('highlight', tempDataRoot);
  assert.deepEqual(firstAttempt, [], 'lan dau file chua ton tai phai tra ve rong');

  // 2) File duoc tao SAU do (vi du mot session khac vua ghi premade-hooks.json) -> lan goi
  //    tiep theo PHAI doc lai duoc, khong duoc khoa cung o trang thai rong mai.
  fs.writeFileSync(filePath, JSON.stringify({ highlight: ['Cau hook GG Doc so 1', 'Cau hook GG Doc so 2'] }), 'utf8');
  const afterCreate = loadPremadeHookPool('highlight', tempDataRoot);
  assert.deepEqual(afterCreate, ['Cau hook GG Doc so 1', 'Cau hook GG Doc so 2'], 'phai doc duoc pool ngay sau khi file duoc tao, khong can restart process');

  // 3) File duoc sua noi dung sau do -> lan goi tiep theo phai thay noi dung moi.
  //    Ep mtime lui/tien ro ro de tranh do phan giai mtime cua filesystem qua tho.
  fs.writeFileSync(filePath, JSON.stringify({ highlight: ['Cau hook da sua lai'] }), 'utf8');
  const forcedNewer = new Date(Date.now() + 60_000);
  fs.utimesSync(filePath, forcedNewer, forcedNewer);
  const afterEdit = loadPremadeHookPool('highlight', tempDataRoot);
  assert.deepEqual(afterEdit, ['Cau hook da sua lai'], 'phai doc duoc noi dung moi sau khi file bi sua');

  console.log('PASS premade-hook-cache-reload: khong con bi khoa cung pool rong/cu sau khi file duoc tao/sua');
} finally {
  fs.rmSync(tempDataRoot, { recursive: true, force: true });
}
