import { memo, useEffect, useMemo, useRef } from 'react';
import { renderCoverPage, renderListPage } from '../lib/pageMarkup';

const MOJIBAKE_TEXT_RE = /(?:Ã|Â|Ä|Å|Æ|áÂ|â€|ï¿½)/;

const BUDGET72_STORY_COPY = {
  cover: {
    title: '"72H" \u1ede \u0110\u00c0 L\u1ea0T V\u1edaI 3TR',
    subtitle: 'L\u1ecbch tr\u00ecnh 3 ng\u00e0y 2 \u0111\u00eam g\u1ecdn h\u01a1n: xem theo t\u1eebng ng\u00e0y, c\u00f3 chi ph\u00ed v\u00e0 c\u00e1c \u0111i\u1ec3m n\u00ean l\u01b0u.',
  },
  days: [
    {
      chip: 'Ng\u00e0y 01',
      title: 'Ng\u00e0y \u0111\u1ea7u v\u00e0o ph\u1ed1',
      subtitle: '\u0102n s\u00e1ng, cafe, check-in v\u00e0 m\u1ed9t bu\u1ed5i t\u1ed1i v\u1eeba \u0111\u1ee7 nh\u1ecbp \u0111\u1ec3 l\u00e0m quen \u0110\u00e0 L\u1ea1t.',
    },
    {
      chip: 'Ng\u00e0y 02',
      title: 'M\u1ed9t ng\u00e0y \u0111i tr\u1ecdn h\u01a1n',
      subtitle: 'D\u00e0nh ng\u00e0y gi\u1eefa chuy\u1ebfn cho c\u00e1c \u0111i\u1ec3m ch\u00ednh, qu\u00e1n \u0111\u1eb9p v\u00e0 ho\u1ea1t \u0111\u1ed9ng \u0111\u00e1ng gh\u00e9.',
    },
    {
      chip: 'Ng\u00e0y 03',
      title: 'Ng\u00e0y cu\u1ed1i nh\u1eb9 nh\u00e0ng',
      subtitle: 'Gi\u1eef l\u1ecbch g\u1ecdn \u0111\u1ec3 k\u1ecbp \u0103n, mua qu\u00e0, check-out v\u00e0 quay v\u1ec1 kh\u00f4ng b\u1ecb g\u1ea5p.',
    },
  ],
  total: {
    label: '72H \u0110\u00e0 L\u1ea1t',
    title: 'T\u1ed5ng chi ph\u00ed d\u1ef1 ki\u1ebfn',
    subtitle: 'C\u00e1c kho\u1ea3n ch\u00ednh \u0111\u01b0\u1ee3c gom l\u1ea1i \u0111\u1ec3 d\u1ec5 c\u00e2n ng\u00e2n s\u00e1ch tr\u01b0\u1edbc khi \u0111i.',
    finalLabel: 'T\u1ed5ng thanh to\u00e1n d\u1ef1 ki\u1ebfn',
  },
};

function hasMojibakeText(value) {
  return MOJIBAKE_TEXT_RE.test(String(value || ''));
}

function setTextIfBroken(element, fallback) {
  if (!element) return;
  const current = element.textContent || '';
  if (!current.trim() || hasMojibakeText(current)) {
    element.textContent = fallback;
  }
}

function budgetStoryDayIndex(page, fallbackIndex) {
  const raw = `${page?.chipText || ''} ${page?.title || ''} ${fallbackIndex + 1}`;
  const match = raw.match(/\b0?([123])\b/);
  if (match) return Number(match[1]) - 1;
  const pageOffset = fallbackIndex - 1;
  return pageOffset >= 0 && pageOffset <= 2 ? pageOffset : 0;
}

function repairBudget72StoryText(root, page, index) {
  const article = root.querySelector('.budget72-story-cover, .budget72-story-day, .budget72-story-total');
  if (!article) return;
  article.style.fontFamily = '"Be Vietnam Pro", Arial, sans-serif';

  if (article.classList.contains('budget72-story-cover')) {
    setTextIfBroken(article.querySelector('.budget72-story-cover-copy h1'), BUDGET72_STORY_COPY.cover.title);
    setTextIfBroken(article.querySelector('.budget72-story-cover-copy p'), BUDGET72_STORY_COPY.cover.subtitle);
    return;
  }

  if (article.classList.contains('budget72-story-day')) {
    const copy = BUDGET72_STORY_COPY.days[budgetStoryDayIndex(page, index)] || BUDGET72_STORY_COPY.days[0];
    setTextIfBroken(article.querySelector('.budget72-story-head span'), copy.chip);
    setTextIfBroken(article.querySelector('.budget72-story-head h2'), copy.title);
    setTextIfBroken(article.querySelector('.budget72-story-head p'), copy.subtitle);
    return;
  }

  setTextIfBroken(article.querySelector('.budget72-total-card > span'), BUDGET72_STORY_COPY.total.label);
  setTextIfBroken(article.querySelector('.budget72-total-card h2'), BUDGET72_STORY_COPY.total.title);
  setTextIfBroken(article.querySelector('.budget72-total-card > p'), BUDGET72_STORY_COPY.total.subtitle);
  setTextIfBroken(article.querySelector('.budget72-total-final span'), BUDGET72_STORY_COPY.total.finalLabel);
}

function renderSlideHtml(list, page, index, coverImageUrls = []) {
  return page.type === 'cover'
    ? renderCoverPage(page, index, list.pages.length, list.id, list.captionHashtags || [], list, coverImageUrls)
    : renderListPage(page, index, list.pages.length, list.id, list.captionHashtags || [], list);
}

function SlideCard({ list, page, index, selected, onSelect, coverImageUrls = [] }) {
  const contentRef = useRef(null);
  const html = useMemo(
    () => renderSlideHtml(list, page, index, coverImageUrls),
    [list, page, index, coverImageUrls],
  );

  useEffect(() => {
    const root = contentRef.current;
    if (!root) return undefined;

    repairBudget72StoryText(root, page, index);

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
