'use client';

import { useEffect, useState } from 'react';
import { exportBatch } from '../lib/exportClient';
import { fetchGuideDataset } from '../lib/apiClient';
import { sanitizeDataset } from '../lib/utils';

function backendUrl(path) {
  const host = window.location.hostname || '127.0.0.1';
  return `http://${host}:3000${path}`;
}

async function readError(response, fallback) {
  try {
    const payload = await response.json();
    return String(payload?.message || payload?.error || fallback);
  } catch {
    return `${fallback} (HTTP ${response.status})`;
  }
}

export default function AutomationExportRunner({ runId, token }) {
  const [label, setLabel] = useState('Đang chuẩn bị phiên xuất tự động...');
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    let stopped = false;
    let lastReportAt = 0;
    const endpoint = (suffix) => backendUrl(`/api/automation/runs/${encodeURIComponent(runId)}${suffix}?token=${encodeURIComponent(token)}`);
    const report = async (value, phase) => {
      if (stopped) return;
      setProgress(Math.max(0, Math.min(100, Number(value) || 0)));
      setLabel(phase);
      const now = Date.now();
      if (Number(value) < 99 && now - lastReportAt < 800) return;
      lastReportAt = now;
      await fetch(endpoint('/progress'), {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ progress: value, phase }),
      }).catch(() => undefined);
    };
    const run = async () => {
      try {
        const contextResponse = await fetch(endpoint('/export-context'), { cache: 'no-store' });
        if (!contextResponse.ok) throw new Error(await readError(contextResponse, 'Không tải được ngữ cảnh xuất tự động.'));
        const context = await contextResponse.json();
        await report(64, 'Đang nạp các list vừa tạo...');
        const datasetResponse = await fetchGuideDataset('/api/guide-data', { cache: 'no-store' });
        if (!datasetResponse.ok) throw new Error(await readError(datasetResponse, 'Không tải được dữ liệu render.'));
        const dataset = sanitizeDataset(await datasetResponse.json());
        const available = new Set((dataset.decks || []).flatMap((deck) => (deck.lists || []).map((list) => list.id)));
        const selectedListIds = new Set((context.listIds || []).filter((id) => available.has(id)));
        if (selectedListIds.size !== context.listIds.length) throw new Error(`Thiếu ${context.listIds.length - selectedListIds.size} list trong snapshot render.`);
        const result = await exportBatch({
          dataset,
          selectedListIds,
          quality: 'optimized',
          onArchive: async (archive) => {
            await report(99, 'Đang chuyển ZIP về thư mục đã chọn...');
            const upload = await fetch(endpoint('/archive'), {
              method: 'POST',
              headers: { 'Content-Type': 'application/zip' },
              body: archive,
            });
            if (!upload.ok) throw new Error(await readError(upload, 'Không lưu được ZIP tự động.'));
          },
        }, {
          setBusy: () => undefined,
          setStatus: (value) => report(Math.max(progress, 70), value),
          showProgress: (value, amount) => report(amount, value),
          updateProgress: (value, phase) => report(65 + (Number(value) || 0) * 0.34, phase),
          completeProgress: (value) => { setProgress(100); setLabel(value); },
          failProgress: setLabel,
        });
        if (!result?.success) throw new Error(result?.error || 'Luồng xuất không hoàn tất.');
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        setLabel(`Lỗi: ${message}`);
        await fetch(endpoint('/export-failure'), {
          method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ message }),
        }).catch(() => undefined);
      }
    };
    void run();
    return () => { stopped = true; };
  }, [runId, token]);

  return (
    <main className="automation-runner" aria-live="polite">
      <section>
        <span className="automation-runner-mark">ĐL</span>
        <h1>Đang xuất tự động</h1>
        <p>{label}</p>
        <div><i style={{ width: `${progress}%` }} /></div>
        <strong>{Math.round(progress)}%</strong>
      </section>
    </main>
  );
}
