'use client';
import useStudioController from './studio/useStudioController';
import StudioV2 from './v2/StudioV2';

// Studio: toàn bộ trạng thái/thao tác ở useStudioController, giao diện ở StudioV2
// (Hôm nay · Tạo · Duyệt & Xuất · Tự động · Cài đặt).
export default function DeckStudio({ initialDataset = null }) {
  const studio = useStudioController({ initialDataset });
  return <StudioV2 studio={studio} />;
}
