// Measure before writing so inherited sizes are never scaled twice.
// Only live text is affected: images, map screenshots and frame dimensions stay intact.
export function resetPageTextScale(root) {
  for (const node of root?.querySelectorAll?.('[data-original-text-style]') || []) {
    node.style.fontSize = node.dataset.originalTextStyle;
    delete node.dataset.originalTextStyle;
  }
}

export function renderedTextSizes(page) {
  if (!page) return [];
  return [...new Set([page, ...page.querySelectorAll('*')].filter(node =>
    !['STYLE', 'SCRIPT', 'SVG', 'PATH'].includes(node.tagName) &&
    [...node.childNodes].some(child => child.nodeType === 3 && child.textContent.trim()) &&
    node.getClientRects().length && getComputedStyle(node).visibility !== 'hidden'
  ).map(node => Math.round(parseFloat(getComputedStyle(node).fontSize) * 100) / 100).filter(Number.isFinite))].sort((a, b) => a - b);
}

export function applyPageTextScale(root) {
  const pages = root?.matches?.('[data-text-scale]') ? [root] : [...(root?.querySelectorAll?.('[data-text-scale]') || [])];
  for (const page of pages) {
    const scale = Math.max(50, Math.min(100, Number(page.dataset.textScale) || 100)) / 100;
    const size = Number(page.dataset.textFontSize);
    const absolute = Number.isFinite(size) && size >= 8 && size <= 72;
    const nodes = [page, ...page.querySelectorAll('*')].filter(node =>
      !['STYLE', 'SCRIPT', 'SVG', 'PATH'].includes(node.tagName) &&
      [...node.childNodes].some(child => child.nodeType === 3 && child.textContent.trim()));
    for (const node of nodes) {
      if (node.dataset.originalTextStyle !== undefined) {
        node.style.fontSize = node.dataset.originalTextStyle;
        delete node.dataset.originalTextStyle;
      }
    }
    if (scale === 1 && !absolute) {
      if (typeof CustomEvent !== 'undefined') page.dispatchEvent(new CustomEvent('page-typography-ready', { bubbles: true }));
      continue;
    }
    const sizes = nodes.map(node => parseFloat(getComputedStyle(node).fontSize));
    nodes.forEach((node, index) => {
      if (!Number.isFinite(sizes[index])) return;
      node.dataset.originalTextStyle = node.style.fontSize;
      node.style.fontSize = `${absolute ? size : sizes[index] * scale}px`;
    });
    if (typeof CustomEvent !== 'undefined') page.dispatchEvent(new CustomEvent('page-typography-ready', { bubbles: true }));
  }
}
