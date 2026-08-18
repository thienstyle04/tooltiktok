import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const workspaceRoot = join(here, '../../../../../');
const serviceSource = readFileSync(join(workspaceRoot, 'backend/src/modules/guide/guide.service.ts'), 'utf8');
const hookCache = JSON.parse(readFileSync(join(workspaceRoot, 'backend/data/hook-1-hooks.json'), 'utf8'));

assert.match(
  serviceSource,
  /'itinerary-timeline'\s*:\s*\{\s*key:\s*'hook-1'\s*,\s*headingIncludes:\s*\['Hook 1',\s*'3N2Đ'\]\s*\}/,
  'Timeline phải lấy đúng nhóm Hook 1 (3N2Đ) từ Google Docs',
);
assert.equal(hookCache.docId, '1E1erto0ZzdOO3NLC5ss1_cj8Dr_E46BY1OVk_UW70Lc');
assert.ok(Array.isArray(hookCache.hooks) && hookCache.hooks.length > 0, 'Cache Hook 1 phải có dữ liệu');

console.log(`PASS Timeline dùng Google Docs Hook 1 (${hookCache.hooks.length} hook dự phòng)`);
