import { memo, useEffect, useMemo, useRef } from 'react';
import { renderCoverPage, renderListPage } from '../lib/pageMarkup';

function renderSlideHtml(list, page, index) {
  return page.type === 'cover'
    ? renderCoverPage(page, index, list.pages.length, list.id, list.captionHashtags || [], list)
    : renderListPage(page, index, list.pages.length, list.id, list.captionHashtags || [], list);
}

function SlideCard({ list, page, index, selected, onSelect }) {
  const contentRef = useRef(null);
  const html = useMemo(
    () => renderSlideHtml(list, page, index),
    [list, page, index],
  );

  useEffect(() => {
    const root = contentRef.current;
    if (!root) return undefined;

    let cancelled = false;
    const controllers = [];

    const readCandidates = (img) => {
      const raw = img.dataset?.candidateSrcs;
      if (!raw) return [];
      try {
        const parsed = JSON.parse(raw);
        return Array.isArray(parsed) ? parsed : [];
      } catch {
        return raw.split('|');
      }
    };

    const normalizePreviewUrl = (url) => {
      try {
        return new URL(url, window.location.href).href;
      } catch {
        return String(url || '').trim();
      }
    };

    const tryNextCandidate = (img) => {
      const candidates = readCandidates(img)
        .map((url) => String(url || '').trim())
        .filter(Boolean);
      const current = img.currentSrc || img.src || img.getAttribute('src') || '';
      const tried = new Set(String(img.dataset.previewFallbackTried || '').split('\n').filter(Boolean));
      if (current) tried.add(normalizePreviewUrl(current));
      const next = candidates.find((url) => !tried.has(normalizePreviewUrl(url)));
      if (!next) return;
      tried.add(normalizePreviewUrl(next));
      img.dataset.previewFallbackTried = Array.from(tried).join('\n');
      img.src = next;
    };

    const inspectImage = async (img) => {
      if (!img?.src || !img.dataset?.candidateSrcs) return;
      const controller = new AbortController();
      controllers.push(controller);
      try {
        const response = await fetch(img.currentSrc || img.src, {
          cache: 'no-store',
          signal: controller.signal,
        });
        const isDriveFallback = response.headers?.get?.('x-drive-image-fallback') === '1';
        const contentType = String(response.headers?.get?.('content-type') || '').toLowerCase();
        let isFallbackSvg = false;
        if (!isDriveFallback && contentType.includes('svg')) {
          const text = await response.text();
          isFallbackSvg = text.includes('Drive image unavailable') || text.includes('File needs public access or sign-in');
        }
        if (!cancelled && (isDriveFallback || isFallbackSvg)) {
          tryNextCandidate(img);
        }
      } catch {
        if (!cancelled) tryNextCandidate(img);
      }
    };

    root.querySelectorAll('img[data-candidate-srcs]').forEach((img) => {
      img.addEventListener('error', () => tryNextCandidate(img), { once: true });
      inspectImage(img);
    });

    return () => {
      cancelled = true;
      controllers.forEach((controller) => controller.abort());
    };
  }, [html]);

  return (
    <div
      className={`slide-card-frame ${selected ? 'is-selected' : ''}`}
      role="button"
      tabIndex={0}
      aria-pressed={selected}
      aria-label={`Chon trang ${index + 1}`}
      onClick={() => onSelect(list.id, index)}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          onSelect(list.id, index);
        }
      }}
    >
      <span className="slide-card-number">{String(index + 1).padStart(2, '0')}</span>
      <div ref={contentRef} className="slide-card-content" dangerouslySetInnerHTML={{ __html: html }} />
    </div>
  );
}

export default memo(SlideCard);
