import JSZip from 'jszip';

let assessmentPromise = null;

async function jsonFetch(url, options = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15000);
  try {
    const response = await fetch(url, { cache: 'no-store', ...options, signal: controller.signal });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return await response.json();
  } finally { clearTimeout(timer); }
}

function canvasBlob(canvas, type = 'image/png') {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error('Không tạo được ảnh benchmark.')), type, 1);
  });
}

async function runBrowserBenchmark() {
  if (typeof document === 'undefined' || document.visibilityState !== 'visible') {
    return { hidden: true, browserSupported: true, success: false };
  }
  if (typeof createImageBitmap !== 'function' || typeof HTMLCanvasElement === 'undefined') {
    return { browserSupported: false, success: false, failureKind: 'unsupported' };
  }
  const startedAt = performance.now();
  let wasHidden = false;
  const onVisibilityChange = () => { if (document.visibilityState !== 'visible') wasHidden = true; };
  document.addEventListener('visibilitychange', onVisibilityChange);
  let source = null;
  let output = null;
  let bitmap = null;
  try {
    source = document.createElement('canvas');
    source.width = 4096;
    source.height = 3072;
    const context = source.getContext('2d');
    if (!context) throw new Error('Không tạo được canvas benchmark.');
    const gradient = context.createLinearGradient(0, 0, source.width, source.height);
    gradient.addColorStop(0, '#183f57');
    gradient.addColorStop(0.55, '#df8e5b');
    gradient.addColorStop(1, '#2b6e54');
    context.fillStyle = gradient;
    context.fillRect(0, 0, source.width, source.height);
    for (let index = 0; index < 800; index += 1) {
      context.fillStyle = `hsla(${index % 360}, 75%, 70%, .45)`;
      context.fillRect((index * 97) % source.width, (index * 211) % source.height, 84, 84);
    }
    const decoded = await canvasBlob(source);
    bitmap = await createImageBitmap(decoded);
    output = document.createElement('canvas');
    output.width = 1080;
    output.height = 1920;
    const outputContext = output.getContext('2d');
    if (!outputContext) throw new Error('Không tạo được khung ảnh benchmark.');
    outputContext.drawImage(bitmap, 1184, 0, 1728, 3072, 0, 0, 1080, 1920);
    const rendered = await canvasBlob(output);
    const zip = new JSZip();
    zip.file('sample.png', rendered, { compression: 'STORE' });
    zip.file('memory-check.bin', new Uint8Array(16 * 1024 * 1024), { compression: 'STORE' });
    await zip.generateAsync({ type: 'blob', compression: 'STORE', streamFiles: true });
    return { success: true, hidden: wasHidden, browserSupported: true, elapsedMs: Math.round(performance.now() - startedAt) };
  } catch (error) {
    return {
      success: false,
      browserSupported: true,
      failureKind: /memory|allocation|bitmap|canvas|decode/i.test(String(error?.message || error)) ? 'resource' : 'benchmark',
      elapsedMs: Math.round(performance.now() - startedAt),
    };
  } finally {
    document.removeEventListener('visibilitychange', onVisibilityChange);
    bitmap?.close?.();
    if (source) { source.width = 0; source.height = 0; }
    if (output) { output.width = 0; output.height = 0; }
  }
}

export async function getRuntimePerformance() {
  try {
    return await jsonFetch('/api/runtime-performance');
  } catch {
    return { mode: 'legacy', unavailable: true, reason: 'Không kiểm tra được sức máy; dùng Cân bằng tương thích.', evaluatedAt: null };
  }
}

export async function ensureRuntimePerformanceForBalancedExport() {
  if (assessmentPromise) return assessmentPromise;
  const assess = async () => {
    const current = await getRuntimePerformance();
    if (current.mode !== 'checking') return current;
    const benchmark = current.busy
      ? { success: false, browserSupported: true, failureKind: 'benchmark' }
      : await runBrowserBenchmark();
    try {
      return await jsonFetch('/api/runtime-performance/report', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(benchmark),
      });
    } catch {
      return { mode: 'legacy', reason: 'Không gửi được kết quả kiểm tra; dùng Cân bằng tương thích.', evaluatedAt: null };
    }
  };
  assessmentPromise = typeof navigator !== 'undefined' && navigator.locks?.request
    ? navigator.locks.request('carousel-runtime-benchmark', assess)
    : assess();
  try {
    return await assessmentPromise;
  } finally {
    assessmentPromise = null;
  }
}

export async function markRuntimeResourceFailure() {
  try {
    return await jsonFetch('/api/runtime-performance/report', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ success: false, browserSupported: true, failureKind: 'resource' }),
    });
  } catch {
    return { mode: 'legacy', reason: 'Xuất ảnh thiếu tài nguyên; dùng Cân bằng tương thích.', evaluatedAt: null };
  }
}
