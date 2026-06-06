'use client';

import { useEffect, useRef, useState } from 'react';
import { exportBatch } from '../../lib/exportClient';
import { listIsMain } from '../../lib/utils';

function targetListCount() {
  if (typeof window === 'undefined') return 35;
  const raw = Number(new URLSearchParams(window.location.search).get('lists') || 35);
  if (!Number.isFinite(raw)) return 35;
  return Math.min(Math.max(Math.round(raw), 1), 50);
}

function buildBenchmarkDataset(dataset, targetLists) {
  const cloned = JSON.parse(JSON.stringify(dataset));
  const mains = [];
  for (const deck of cloned.decks || []) {
    const main = (deck.lists || []).find((list) => listIsMain(list));
    if (main?.pages?.length) mains.push({ deck, main });
  }
  if (!mains.length) throw new Error('Không có list main để mô phỏng benchmark.');

  const selectedIds = new Set();
  for (let i = 0; i < targetLists; i++) {
    const { deck, main } = mains[i % mains.length];
    const benchId = `${deck.id}-export-bench-${String(i + 1).padStart(2, '0')}`;
    deck.lists.push({
      ...main,
      id: benchId,
      title: `${main.title} (bench ${i + 1})`,
    });
    selectedIds.add(benchId);
  }
  return { dataset: cloned, selectedIds };
}

export default function ExportBenchmarkPage() {
  const started = useRef(false);
  const [status, setStatus] = useState('Chuẩn bị...');
  const [resultJson, setResultJson] = useState('');

  useEffect(() => {
    if (started.current) return;
    started.current = true;

    const params = new URLSearchParams(window.location.search);
    if (params.get('autostart') !== '1') {
      setStatus('Thêm ?autostart=1 để chạy benchmark.');
      return;
    }

    (async () => {
      const startedAt = performance.now();
      try {
        setStatus('Đang tải dataset...');
        const res = await fetch('/api/guide-data', { cache: 'no-store' });
        if (!res.ok) throw new Error(`API ${res.status}`);
        const dataset = await res.json();
        const listTarget = targetListCount();
        const { dataset: benchDataset, selectedIds } = buildBenchmarkDataset(dataset, listTarget);
        const totalPages = benchDataset.decks.flatMap((d) => d.lists)
          .filter((l) => selectedIds.has(l.id))
          .reduce((sum, l) => sum + (l.pages?.length || 0), 0);

        window.__EXPORT_BENCHMARK__ = {
          done: false,
          startedAt: Date.now(),
          listCount: selectedIds.size,
          totalPages,
          quality: 'optimized',
        };

        setStatus(`Đang xuất ${selectedIds.size} list (${totalPages} trang)...`);
        const result = await exportBatch({
          dataset: benchDataset,
          selectedListIds: selectedIds,
          quality: 'optimized',
        }, {
          setStatus: (msg) => setStatus(msg),
          setBusy: () => {},
          showProgress: () => {},
          updateProgress: () => {},
          completeProgress: () => {},
          failProgress: () => {},
        });

        const durationMs = Math.round(performance.now() - startedAt);
        window.__EXPORT_BENCHMARK__ = {
          done: true,
          success: Boolean(result?.success),
          error: result?.error || null,
          durationMs,
          durationSec: +(durationMs / 1000).toFixed(1),
          durationMin: +(durationMs / 60000).toFixed(2),
          listCount: selectedIds.size,
          totalPages,
          exportedLists: result?.exportedLists?.length || 0,
          quality: 'optimized',
          profile: { jpegQuality: 0.97, maxDimension: 3000, pixelRatio: 2.5 },
          finishedAt: Date.now(),
        };
        const payload = window.__EXPORT_BENCHMARK__;
        setResultJson(JSON.stringify(payload, null, 2));
        setStatus(result?.success
          ? `Hoàn thành: ${selectedIds.size} list / ${totalPages} trang trong ${(durationMs / 1000).toFixed(1)}s`
          : `Thất bại: ${result?.error || 'unknown'}`);
      } catch (error) {
        const durationMs = Math.round(performance.now() - startedAt);
        window.__EXPORT_BENCHMARK__ = {
          done: true,
          success: false,
          error: error?.message || String(error),
          durationMs,
          durationSec: +(durationMs / 1000).toFixed(1),
          finishedAt: Date.now(),
        };
        setResultJson(JSON.stringify(window.__EXPORT_BENCHMARK__, null, 2));
        setStatus(`Lỗi: ${error?.message || error}`);
      }
    })();
  }, []);

  return (
    <main style={{ padding: 24, fontFamily: 'sans-serif' }}>
      <h1>Export benchmark</h1>
      <p>{status}</p>
      <pre id="export-benchmark-status">{resultJson}</pre>
    </main>
  );
}
