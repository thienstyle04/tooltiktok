'use client';

import { useEffect, useState } from 'react';
import dynamic from 'next/dynamic';
import { MotionConfig } from 'motion/react';
import BarLoader from './ui/BarLoader';

const DeckStudio = dynamic(() => import('./DeckStudio'), {
  ssr: false,
  loading: () => (
    <main className="app-shell studio-boot-loading" aria-busy="true" aria-live="polite">
      <BarLoader />
      <p>Đang tải studio...</p>
    </main>
  ),
});

const AutomationExportRunner = dynamic(() => import('./AutomationExportRunner'), { ssr: false });

export default function DeckStudioLoader() {
  const [clientReady, setClientReady] = useState(false);

  useEffect(() => {
    setClientReady(true);
  }, []);

  // Tránh hydrate HTML bị extension (Bitdefender bis_skin_checked, v.v.) sửa trước khi React chạy.
  if (!clientReady) {
    return null;
  }

  const params = new URLSearchParams(window.location.search);
  const automationRunId = params.get('automationRunId');
  const automationToken = params.get('automationToken');
  if (automationRunId && automationToken) {
    return <AutomationExportRunner runId={automationRunId} token={automationToken} />;
  }
  // Tôn trọng tùy chọn giảm chuyển động của Windows cho mọi hiệu ứng motion trong studio.
  return <MotionConfig reducedMotion="user"><DeckStudio /></MotionConfig>;
}
