'use client';

import { useEffect, useState } from 'react';
import dynamic from 'next/dynamic';

const DeckStudio = dynamic(() => import('./DeckStudio'), {
  ssr: false,
  loading: () => (
    <main className="app-shell studio-boot-loading" aria-busy="true" aria-live="polite">
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
  return <DeckStudio />;
}
