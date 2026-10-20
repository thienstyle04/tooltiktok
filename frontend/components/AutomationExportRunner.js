'use client';

import { useEffect, useState } from 'react';
import { exportBatch } from '../lib/exportClient';
import { fetchGuideDataset } from '../lib/apiClient';
import { sanitizeDataset } from '../lib/utils';

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
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let stopped = false;
    let lastReportAt = 0;
    // Use the configured server-side proxy, not a hard-coded backend port.
    const endpoint = (suffix) => `/api/automation/runs/${encodeURIComponent(runId)}${suffix}?token=${encodeURIComponent(token)}`;
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
        // Lượt lớn được chia nhiều phần ZIP (backend quyết định): mỗi phần xuất, gửi về rồi giải phóng
        // bộ nhớ trước phần sau. Một phần lỗi không làm mất các phần đã lưu; lượt vẫn đi tiếp.
        const parts = Array.isArray(context.parts) && context.parts.length ? context.parts : [context.listIds];
        for (let index = 0; index < parts.length; index++) {
          if (stopped) return;
          const part = index + 1;
          const prefix = parts.length > 1 ? `Phần ${part}/${parts.length}: ` : '';
          const scaled = (value) => 65 + ((index + Math.max(0, Math.min(100, Number(value) || 0)) / 100) / parts.length) * 34;
          const recordOutcome = async (outcome) => {
            const recorded = await fetch(endpoint('/progress'), {
              method: 'POST', headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ progress: scaled(99), phase: `${prefix}Đang lưu kết quả xuất...`, outcome, part }),
            });
            if (!recorded.ok) throw new Error(await readError(recorded, 'Không lưu được báo cáo list bỏ qua.'));
          };
          const result = await exportBatch({
            dataset,
            selectedListIds: new Set(parts[index]),
            quality: 'optimized',
            format: context.format || 'png',
            skipImageErrors: true,
            onExportOutcome: recordOutcome,
            onArchive: async (archive, name, outcome) => {
              await recordOutcome(outcome);
              await report(scaled(99), `${prefix}Đang chuyển ZIP về thư mục đã chọn...`);
              const upload = await fetch(`${endpoint('/archive')}&part=${part}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/zip' },
                body: archive,
              });
              if (!upload.ok) throw new Error(await readError(upload, 'Không lưu được ZIP tự động.'));
            },
          }, {
            setBusy: () => undefined,
            setStatus: (value) => report(scaled(5), `${prefix}${value}`),
            showProgress: (value, amount) => report(scaled(amount), `${prefix}${value}`),
            updateProgress: (value, phase) => report(scaled(value), `${prefix}${phase}`),
            completeProgress: (value) => { setProgress(scaled(100)); setLabel(`${prefix}${value}`); },
            failProgress: (value) => setLabel(`${prefix}${value}`),
          });
          if (result?.cancelled) throw new Error('Luồng xuất đã bị hủy.');
          if (!result?.success) {
            if (parts.length === 1) throw new Error(result?.error || 'Luồng xuất không hoàn tất.');
            // Báo lỗi riêng phần này rồi xuất tiếp phần sau (backend bỏ qua nếu phần đã có kết quả).
            await fetch(endpoint('/export-failure'), {
              method: 'POST', headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ message: result?.error || 'Phần này không xuất được.', part }),
            }).catch(() => undefined);
          }
        }
      } catch (error) {
        stopped = true;
        setFailed(true);
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
        <h1>{failed ? 'Xuất tự động đã dừng' : 'Đang xuất tự động'}</h1>
        <p>{label}</p>
        {!failed && <><div><i style={{ width: `${progress}%` }} /></div><strong>{Math.round(progress)}%</strong></>}
        {failed && <p>Hãy khắc phục lỗi rồi chạy lại lịch xuất trong tool.</p>}
      </section>
    </main>
  );
}
