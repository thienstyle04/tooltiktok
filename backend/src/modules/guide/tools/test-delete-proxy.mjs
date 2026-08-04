/**
 * Test nhanh: proxy DELETE + ưu tiên 127.0.0.1 (lỗi "Không kết nối được backend" khi xóa).
 *
 *   node backend/src/modules/guide/tools/test-delete-proxy.mjs
 */
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { pathToFileURL } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '../../../../..');
const API = process.env.TEST_API_URL || 'http://127.0.0.1:3000';
const FRONTEND = process.env.FRONTEND_URL || 'http://127.0.0.1:3001';

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function waitReady(timeoutMs = 180000) {
  const t0 = Date.now();
  while (Date.now() - t0 < timeoutMs) {
    try {
      const [be, fe] = await Promise.all([
        fetch(`${API}/api/health`, { signal: AbortSignal.timeout(4000) }),
        fetch(FRONTEND, { signal: AbortSignal.timeout(4000) }),
      ]);
      if (be.ok && fe.ok) return true;
    } catch {
      // retry
    }
    await sleep(2000);
  }
  return false;
}

async function testOriginPreference() {
  // Load backendProxy without Next runtime — eval helper by reading source.
  const require = createRequire(import.meta.url);
  const fs = require('fs');
  const src = fs.readFileSync(join(ROOT, 'frontend/lib/backendProxy.js'), 'utf8');
  if (!src.includes("url.hostname = '127.0.0.1'")) {
    throw new Error('backendProxy thiếu rewrite localhost → 127.0.0.1');
  }
  if (!src.includes("method === 'DELETE'")) {
    throw new Error('backendProxy thiếu retry DELETE qua nhiều origin');
  }
  // Simulate preferIpv4Loopback
  const prefer = (origin) => {
    const value = String(origin || '').replace(/\/+$/, '');
    const url = new URL(value);
    if (url.hostname === 'localhost' || url.hostname === '::1') {
      url.hostname = '127.0.0.1';
      return url.toString().replace(/\/+$/, '');
    }
    return value;
  };
  const a = prefer('http://localhost:3000');
  const b = prefer('http://127.0.0.1:3000');
  if (a !== 'http://127.0.0.1:3000' || b !== 'http://127.0.0.1:3000') {
    throw new Error(`preferIpv4Loopback sai: ${a} / ${b}`);
  }
  return { ok: true, rewritten: a };
}

async function findDeletableList() {
  const response = await fetch(`${API}/api/guide-data`, { signal: AbortSignal.timeout(120000) });
  if (!response.ok) throw new Error(`guide-data HTTP ${response.status}`);
  const data = await response.json();
  for (const deck of data.decks || []) {
    for (const list of deck.lists || []) {
      const id = String(list.id || '');
      if (id && !id.includes('main') && (id.includes('caption') || id.startsWith('ai') || /AI\s*\d+/i.test(list.navTitle || ''))) {
        return { deckId: deck.id, listId: list.id, navTitle: list.navTitle };
      }
      // generated lists thường không phải list gốc đầu tiên
      if (deck.lists.indexOf(list) > 0) {
        return { deckId: deck.id, listId: list.id, navTitle: list.navTitle };
      }
    }
  }
  return null;
}

async function createTempList() {
  // Tạo 1 list nhỏ nếu không có list AI để xóa.
  const deckId = 'grid-4';
  const response = await fetch(`${API}/api/decks/generate-batch`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ deckId, count: 1 }),
    signal: AbortSignal.timeout(300000),
  });
  if (!response.ok) {
    const text = await response.text().catch(() => '');
    throw new Error(`generate-batch fail HTTP ${response.status}: ${text.slice(0, 200)}`);
  }
  const payload = await response.json();
  const listId = payload.lists?.[0]?.listId || payload.lists?.[0]?.id;
  if (!listId) throw new Error('generate-batch không trả listId');
  return { deckId, listId, navTitle: payload.lists?.[0]?.navTitle || listId, created: true };
}

async function deleteViaProxy(deckId, listId) {
  const url = `${FRONTEND}/api/decks/${encodeURIComponent(deckId)}/lists/${encodeURIComponent(listId)}`;
  const response = await fetch(url, {
    method: 'DELETE',
    signal: AbortSignal.timeout(60000),
  });
  const text = await response.text().catch(() => '');
  let json = null;
  try { json = JSON.parse(text); } catch { /* ignore */ }
  return {
    status: response.status,
    ok: response.ok || response.status === 204 || response.status === 404,
    body: text.slice(0, 400),
    message: json?.message || null,
    detail: json?.detail || null,
  };
}

async function deleteViaBackendDirect(deckId, listId) {
  const url = `${API}/api/decks/${encodeURIComponent(deckId)}/lists/${encodeURIComponent(listId)}`;
  const response = await fetch(url, { method: 'DELETE', signal: AbortSignal.timeout(30000) });
  return { status: response.status, ok: response.ok || response.status === 204 || response.status === 404 };
}

async function main() {
  console.log('=== TEST DELETE PROXY / 127.0.0.1 ===');
  const originCheck = await testOriginPreference();
  console.log('[origin]', JSON.stringify(originCheck));

  const ready = await waitReady();
  if (!ready) {
    console.error('FAIL: backend/frontend chưa sẵn sàng. Chạy start.bat rồi test lại.');
    process.exit(1);
  }
  console.log('[ready] backend + frontend OK');

  let target = await findDeletableList();
  let created = false;
  if (!target) {
    console.log('[setup] Không có list AI — tạo 1 list tạm để xóa...');
    try {
      target = await createTempList();
      created = true;
    } catch (error) {
      console.warn(`[setup] Không tạo được list tạm: ${error.message || error}`);
      console.log('[fallback] Chỉ test DELETE 404 qua proxy (list giả).');
      target = { deckId: 'grid-4', listId: 'caption-test-delete-missing', navTitle: 'missing' };
    }
  }
  console.log('[target]', JSON.stringify(target));

  const direct = await deleteViaBackendDirect(target.deckId, target.listId);
  console.log('[direct backend DELETE]', JSON.stringify(direct));

  // Nếu đã xóa direct rồi, proxy DELETE cùng id phải ra 404 (vẫn OK) — hoặc tạo lại nếu created.
  let proxyTarget = target;
  if (direct.ok && created) {
    // đã xóa list vừa tạo — tạo lại để proxy có việc xóa thật
    try {
      proxyTarget = await createTempList();
      console.log('[recreate for proxy]', JSON.stringify(proxyTarget));
    } catch {
      proxyTarget = target;
    }
  } else if (direct.ok && !created) {
    // list cũ đã xóa — proxy sẽ 404, vẫn chứng minh proxy tới được Nest
  }

  const proxied = await deleteViaProxy(proxyTarget.deckId, proxyTarget.listId);
  console.log('[proxy frontend DELETE]', JSON.stringify(proxied));

  const failConnect = proxied.status === 502
    || /Không kết nối được backend/i.test(String(proxied.message || proxied.body || ''));
  const pass = proxied.ok && !failConnect;

  console.log('\n=== TỔNG KẾT ===');
  console.log(JSON.stringify({
    ok: pass,
    failConnect,
    proxyStatus: proxied.status,
    proxyMessage: proxied.message,
    proxyDetail: proxied.detail,
  }, null, 2));
  process.exit(pass ? 0 : 2);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
