/**
 * Simulate export image preprocessing for optimized vs original quality profiles.
 * Measures output dimensions, file size, and Laplacian sharpness score.
 */
import sharp from '../../../../../frontend/node_modules/sharp/lib/index.js';
import { writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT_DIR = join(__dirname, 'export-quality-test-output');
const API_URL = process.env.GUIDE_API_URL || 'http://127.0.0.1:3000/api/guide-data';
const FRONTEND_BASE = process.env.FRONTEND_BASE || 'http://127.0.0.1:3001';

const PAGE_CSS = { width: 397, height: 562 };
const PIXEL_RATIO = 2;

const SLOTS = [
  { id: 'cover-full', cssWidth: 397, cssHeight: 562, label: 'Cover full-page' },
  { id: 'grid4-cell', cssWidth: 198, cssHeight: 281, label: 'Grid 4 ô (1 cell)' },
  { id: 'grid6-cell', cssWidth: 198, cssHeight: 187, label: 'Grid 6 ô (1 cell)' },
  { id: 'zigzag-thumb', cssWidth: 86, cssHeight: 72, label: 'Zigzag thumbnail' },
];

const PROFILES = {
  optimized: {
    id: 'optimized',
    sourceImageMaxDimension: 1800,
    sourceImageFormat: 'jpeg',
    sourceImageQuality: 0.86,
    pixelRatio: 2,
    preferHtml2Canvas: true,
  },
  original: {
    id: 'original',
    sourceImageMaxDimension: 0,
    sourceImageFormat: 'png',
    sourceImageQuality: 1,
    pixelRatio: 2,
    preferHtml2Canvas: false,
  },
};

function laplacianVariance(buffer, width, height) {
  // Simple 3x3 Laplacian on grayscale — higher = sharper
  const gray = new Float64Array(width * height);
  for (let i = 0; i < buffer.length; i += 4) {
    const idx = i / 4;
    gray[idx] = buffer[i] * 0.299 + buffer[i + 1] * 0.587 + buffer[i + 2] * 0.114;
  }
  let sum = 0;
  let sumSq = 0;
  let count = 0;
  const kernel = [0, 1, 0, 1, -4, 1, 0, 1, 0];
  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      let v = 0;
      let ki = 0;
      for (let ky = -1; ky <= 1; ky++) {
        for (let kx = -1; kx <= 1; kx++) {
          v += gray[(y + ky) * width + (x + kx)] * kernel[ki++];
        }
      }
      sum += v;
      sumSq += v * v;
      count++;
    }
  }
  const mean = sum / count;
  return sumSq / count - mean * mean;
}

async function resizeSource(buffer, profile) {
  const meta = await sharp(buffer).metadata();
  const maxDim = profile.sourceImageMaxDimension;
  if (!maxDim) return buffer;
  const largest = Math.max(meta.width || 0, meta.height || 0);
  if (largest <= maxDim) {
    return sharp(buffer)
      .jpeg({ quality: Math.round(profile.sourceImageQuality * 100), mozjpeg: true })
      .toBuffer();
  }
  const scale = maxDim / largest;
  const w = Math.max(1, Math.round((meta.width || 0) * scale));
  const h = Math.max(1, Math.round((meta.height || 0) * scale));
  return sharp(buffer)
    .resize(w, h, { fit: 'inside' })
    .jpeg({ quality: Math.round(profile.sourceImageQuality * 100), mozjpeg: true })
    .toBuffer();
}

async function fitCover(buffer, cssWidth, cssHeight, pixelRatio, format, quality) {
  const targetW = Math.max(1, Math.round(cssWidth * pixelRatio));
  const targetH = Math.max(1, Math.round(cssHeight * pixelRatio));
  let pipeline = sharp(buffer).resize(targetW, targetH, {
    fit: 'cover',
    position: 'centre',
  });
  if (format === 'jpeg') {
    pipeline = pipeline.jpeg({ quality: Math.round(quality * 100), mozjpeg: true });
  } else {
    pipeline = pipeline.png();
  }
  return pipeline.toBuffer({ resolveWithObject: true });
}

function collectImageUrls(dataset) {
  const urls = new Set();
  for (const deck of dataset?.decks || []) {
    for (const list of deck.lists || []) {
      for (const page of list.pages || []) {
        if (page.backgroundImage) urls.add(page.backgroundImage);
        for (const item of page.items || []) {
          if (item.imageUrl) urls.add(item.imageUrl);
        }
      }
    }
  }
  return Array.from(urls).slice(0, 8);
}

function resolveUrl(url) {
  if (!url) return null;
  if (url.startsWith('http://') || url.startsWith('https://')) return url;
  if (url.startsWith('/')) return `${FRONTEND_BASE}${url}`;
  return `${FRONTEND_BASE}/${url}`;
}

async function main() {
  mkdirSync(OUT_DIR, { recursive: true });
  console.log('Fetching guide data...');
  const res = await fetch(API_URL);
  if (!res.ok) throw new Error(`API ${res.status}`);
  const dataset = await res.json();
  const imageUrls = collectImageUrls(dataset);
  if (imageUrls.length === 0) throw new Error('No image URLs found in dataset');

  const results = [];
  for (let i = 0; i < Math.min(3, imageUrls.length); i++) {
    const url = resolveUrl(imageUrls[i]);
    console.log(`\nSample ${i + 1}: ${url}`);
    const imgRes = await fetch(url);
    if (!imgRes.ok) {
      console.warn(`  Skip: HTTP ${imgRes.status}`);
      continue;
    }
    const sourceBuffer = Buffer.from(await imgRes.arrayBuffer());
    const sourceMeta = await sharp(sourceBuffer).metadata();
    console.log(`  Source: ${sourceMeta.width}x${sourceMeta.height} ${sourceMeta.format} (${(sourceBuffer.length / 1024).toFixed(1)} KB)`);

    for (const slot of SLOTS) {
      for (const profile of Object.values(PROFILES)) {
        const preprocessed = await resizeSource(sourceBuffer, profile);
        const { data, info } = await fitCover(
          preprocessed,
          slot.cssWidth,
          slot.cssHeight,
          profile.pixelRatio,
          profile.sourceImageFormat,
          profile.sourceImageQuality,
        );
        const raw = await sharp(data).ensureAlpha().raw().toBuffer();
        const sharpness = laplacianVariance(raw, info.width, info.height);
        const finalOutputW = Math.round(PAGE_CSS.width * profile.pixelRatio);
        const finalOutputH = Math.round(PAGE_CSS.height * profile.pixelRatio);

        results.push({
          sample: i + 1,
          slot: slot.id,
          slotLabel: slot.label,
          profile: profile.id,
          sourcePx: `${sourceMeta.width}x${sourceMeta.height}`,
          preparedPx: `${info.width}x${info.height}`,
          finalPagePx: `${finalOutputW}x${finalOutputH}`,
          fileKB: +(data.length / 1024).toFixed(1),
          sharpness: +sharpness.toFixed(1),
          jpegQ: profile.sourceImageFormat === 'jpeg' ? profile.sourceImageQuality : 1,
          maxDim: profile.sourceImageMaxDimension,
        });

        const fname = `s${i + 1}-${slot.id}-${profile.id}.${profile.sourceImageFormat === 'jpeg' ? 'jpg' : 'png'}`;
        writeFileSync(join(OUT_DIR, fname), data);
      }
    }
  }

  // Aggregate comparison per slot
  console.log('\n=== KẾT QUẢ SO SÁNH (sharpness cao hơn = nét hơn) ===\n');
  for (const slot of SLOTS) {
    const opt = results.filter((r) => r.slot === slot.id && r.profile === 'optimized');
    const orig = results.filter((r) => r.slot === slot.id && r.profile === 'original');
    const avg = (arr, key) => arr.reduce((s, r) => s + r[key], 0) / (arr.length || 1);
    const optSharp = avg(opt, 'sharpness');
    const origSharp = avg(orig, 'sharpness');
    const diffPct = origSharp > 0 ? ((optSharp - origSharp) / origSharp * 100).toFixed(1) : '0';
    console.log(`${slot.label}:`);
    console.log(`  optimized : sharpness=${optSharp.toFixed(1)}, avg file=${avg(opt, 'fileKB').toFixed(1)} KB, prepared=${opt[0]?.preparedPx}`);
    console.log(`  original  : sharpness=${origSharp.toFixed(1)}, avg file=${avg(orig, 'fileKB').toFixed(1)} KB, prepared=${orig[0]?.preparedPx}`);
    console.log(`  chênh lệch: optimized ${diffPct}% so với original\n`);
  }

  const summary = {
    pageCss: PAGE_CSS,
    exportPixelRatio: PIXEL_RATIO,
    finalPageSize: `${PAGE_CSS.width * PIXEL_RATIO}x${PAGE_CSS.height * PIXEL_RATIO}`,
    tiktokRecommended: '1080x1920 (9:16) — tool xuất 794x1124, cần upscale ~1.36x khi đăng TikTok',
    profiles: PROFILES,
    slots: SLOTS,
    results,
    recommendation: null,
  };

  // Decide recommendation
  const coverOpt = results.filter((r) => r.slot === 'cover-full' && r.profile === 'optimized');
  const coverOrig = results.filter((r) => r.slot === 'cover-full' && r.profile === 'original');
  const coverSharpDrop = coverOrig.length && coverOpt.length
    ? (1 - avg(coverOpt, 'sharpness') / avg(coverOrig, 'sharpness')) * 100
    : 0;

  if (coverSharpDrop > 15) {
    summary.recommendation = {
      mode: 'original',
      reason: `Chế độ optimized làm giảm độ nét ảnh cover ~${coverSharpDrop.toFixed(0)}% do nén JPEG 86% + resize max 1800px. Dùng "Chất lượng gốc" cho ảnh đẹp nhất.`,
      defaultShouldChange: true,
    };
  } else if (coverSharpDrop > 5) {
    summary.recommendation = {
      mode: 'original',
      reason: `Optimized hơi mờ hơn original ~${coverSharpDrop.toFixed(0)}% trên ảnh cover. Khuyên dùng "Chất lượng gốc" khi ưu tiên độ nét; optimized khi xuất 30-50 list.`,
      defaultShouldChange: true,
    };
  } else {
    summary.recommendation = {
      mode: 'optimized',
      reason: 'Hai chế độ gần tương đương về độ nét. Giữ optimized cho tốc độ và dung lượng.',
      defaultShouldChange: false,
    };
  }

  writeFileSync(join(OUT_DIR, 'report.json'), JSON.stringify(summary, null, 2));
  console.log('=== KHUYẾN NGHỊ ===');
  console.log(`Chế độ tối ưu: ${summary.recommendation.mode}`);
  console.log(`Lý do: ${summary.recommendation.reason}`);
  console.log(`\nOutput saved to: ${OUT_DIR}`);
}

function avg(arr, key) {
  return arr.reduce((s, r) => s + r[key], 0) / (arr.length || 1);
}

main().catch((err) => {
  console.error('Test failed:', err.message || err);
  process.exit(1);
});
