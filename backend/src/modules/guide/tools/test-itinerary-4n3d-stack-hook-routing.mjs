import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const workspaceRoot = join(here, '../../../../../');
const serviceSource = readFileSync(join(workspaceRoot, 'backend/src/modules/guide/guide.service.ts'), 'utf8');
const hookCache = JSON.parse(readFileSync(join(workspaceRoot, 'backend/data/hook-2-hooks.json'), 'utf8'));

assert.match(
  serviceSource,
  /'itinerary-4n3d-stack'\s*:\s*\{\s*key:\s*'hook-2'\s*,\s*headingIncludes:\s*\['Hook 2',\s*'4N3Đ'\]\s*\}/,
  '4N3Đ Stack phải được ánh xạ vào nhóm Hook 2 của Google Docs',
);
assert.equal(hookCache.docId, '1E1erto0ZzdOO3NLC5ss1_cj8Dr_E46BY1OVk_UW70Lc');
assert.ok(Array.isArray(hookCache.hooks) && hookCache.hooks.length > 0, 'Cache Hook 2 phải có dữ liệu');
assert.ok(hookCache.hooks.every((hook) => String(hook).trim()), 'Hook 2 không được chứa dòng rỗng');

console.log(`PASS 4N3Đ Stack dùng Google Docs Hook 2 (${hookCache.hooks.length} hook dự phòng)`);
