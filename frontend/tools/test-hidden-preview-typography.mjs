import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const { build } = require('esbuild');
const bundle = await build({ entryPoints: ['frontend/lib/pageTextScale.js'], bundle: true, write: false, format: 'iife', globalName: 'Typography' });
const css = fs.readFileSync('frontend/app/styles/studio-v2.css', 'utf8');
const executablePath = [`${process.env.PROGRAMFILES}/Google/Chrome/Application/chrome.exe`, `${process.env['PROGRAMFILES(X86)']}/Microsoft/Edge/Application/msedge.exe`].find(fs.existsSync);
const browser = await chromium.launch({ headless: true, executablePath });
try {
  const page = await browser.newPage({ viewport: { width: 600, height: 800 } });
  await page.setContent(`<style>${css}</style><main class="studio-workflow studio-v2" data-editor-pane="preview"><div class="v2-review"><div class="v2-canvas"><article data-text-scale="100"><span style="font-size:24px">Title</span><span style="font-size:12px">Address</span><button>Page</button><span style="display:none;font-size:72px">Not rendered</span></article></div><aside class="right-panel">Editor</aside></div></main>`);
  await page.addScriptTag({ content: bundle.outputFiles[0].text });
  const result = await page.evaluate(() => {
    const article = document.querySelector('article');
    const before = Typography.renderedTextSizes(article);
    document.querySelector('main').dataset.editorPane = 'editor';
    // Như PageInspector: preview ẩn (vùng "Chỉnh sửa nội dung" trên màn hẹp) vẫn phải đo được chữ.
    const hiddenPreview = () => getComputedStyle(document.querySelector('.v2-canvas')).visibility === 'hidden';
    const canvasHidden = hiddenPreview();
    const hidden = Typography.renderedTextSizes(article, { hiddenPreview: canvasHidden });
    const button = article.querySelector('button'); button.focus();
    const hiddenControlFocused = document.activeElement === button;
    article.dataset.textFontSize = '9'; Typography.applyPageTextScale(article);
    const edited = Typography.renderedTextSizes(article, { hiddenPreview: hiddenPreview() });
    document.querySelector('main').dataset.editorPane = 'preview';
    const restored = Typography.renderedTextSizes(article);
    return { before, canvasHidden, hidden, edited, restored, hiddenControlFocused, overflow: document.documentElement.scrollWidth > innerWidth };
  });
  assert.equal(result.canvasHidden, true, 'Editor pane hides the preview on narrow screens');
  assert.deepEqual(result.hidden, result.before);
  assert.ok(result.hidden.length);
  assert.deepEqual(result.edited, [9]);
  assert.deepEqual(result.restored, [9]);
  assert.equal(result.hiddenControlFocused, false);
  assert.equal(result.overflow, false);
  console.log('PASS hidden preview: measured sizes preserved, 9px applies, no hidden focus or horizontal overflow', result);
} finally { await browser.close(); }
