'use client';

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { flushSync } from 'react-dom';
import { renderCoverPage, renderListPage } from '../../lib/pageMarkup';

// Ảnh nhỏ của slide thật: cùng renderer với preview/xuất ảnh nhưng không chạy bước kiểm tra
// ảnh Drive và căn chữ (nhẹ cho dải trang và thư viện mẫu). Chỉ dựng khi cuộn tới.
// Ảnh Drive gốc (tới ~3000 px, vài MB) được thay bằng bản thu nhỏ /assets/drive-thumb và giải mã
// bất đồng bộ, nếu không cuộn thư viện mẫu sẽ khựng. Preview lớn và ảnh xuất vẫn dùng ảnh gốc.
export function thumbnailMarkup(html) {
  return String(html || '').replaceAll('/assets/drive-file?id=', '/assets/drive-thumb?id=').replace(/<img(?=[\s>])/g, '<img decoding="async"');
}

// Nhiều thumbnail cùng lọt vào màn khi lăn chuột: dựng lần lượt trong ngân sách ~6 ms mỗi khung
// hình thay vì dồn vào một khung (gây khựng ~100 ms). flushSync để React dựng ngay từng cái
// (không gộp tất cả setState vào một lần render), nhờ vậy ngân sách đo đúng công việc thật.
const renderQueue = [];
let queueScheduled = false;
function runQueue() {
  const started = performance.now();
  do renderQueue.shift()?.(); while (renderQueue.length && performance.now() - started < 6);
  if (renderQueue.length) requestAnimationFrame(runQueue);
  else queueScheduled = false;
}
function scheduleRender(callback) {
  renderQueue.push(callback);
  if (!queueScheduled) { queueScheduled = true; requestAnimationFrame(runQueue); }
}

export default function SlideThumb({ list, page, index = 0, width = 96, coverImageUrls = [], eager = false, className = '' }) {
  const host = useRef(null);
  const content = useRef(null);
  const [visible, setVisible] = useState(false);
  const [box, setBox] = useState(null);
  const html = useMemo(() => {
    if (!visible || !list || !page) return '';
    try {
      return thumbnailMarkup(page.type === 'cover'
        ? renderCoverPage(page, index, list.pages.length, list.id, list.captionHashtags || [], list, coverImageUrls)
        : renderListPage(page, index, list.pages.length, list.id, list.captionHashtags || [], list));
    } catch { return ''; }
  }, [visible, list, page, index, coverImageUrls]);

  useEffect(() => {
    if (visible || !host.current) return undefined;
    // eager: dựng ngay không cần chờ cuộn tới, nhưng vẫn qua hàng đợi để không dồn vào một khung hình.
    if (eager || typeof IntersectionObserver === 'undefined') { scheduleRender(() => flushSync(() => setVisible(true))); return undefined; }
    const observer = new IntersectionObserver(entries => {
      if (entries.some(entry => entry.isIntersecting)) { observer.disconnect(); scheduleRender(() => flushSync(() => setVisible(true))); }
    }, { rootMargin: '200px' });
    observer.observe(host.current);
    return () => observer.disconnect();
  }, [visible, eager]);

  // Đo kích thước thật của slide bằng ResizeObserver (chạy sau khi trình duyệt đã tính bố cục,
  // trước khi vẽ): đọc offsetWidth ngay khi dựng sẽ ép tính lại bố cục cả trang cho từng thumbnail.
  useLayoutEffect(() => {
    const node = content.current?.firstElementChild;
    if (!node || typeof ResizeObserver === 'undefined') return undefined;
    const observer = new ResizeObserver(() => {
      const natural = { w: node.offsetWidth || 397, h: node.offsetHeight || 562 };
      flushSync(() => setBox(previous => (previous && previous.w === natural.w && previous.h === natural.h ? previous : natural)));
    });
    observer.observe(node);
    return () => observer.disconnect();
  }, [html]);

  const scale = box ? width / box.w : width / 397;
  const height = Math.round((box ? box.h : 562) * scale);
  return (
    <div ref={host} className={`v2-thumb ${className}`.trim()} style={{ width, height }} aria-hidden="true">
      {html ? <div ref={content} className="v2-thumb-content" style={{ transform: `scale(${scale})` }} dangerouslySetInnerHTML={{ __html: html }} /> : <span className="v2-thumb-placeholder" />}
    </div>
  );
}
