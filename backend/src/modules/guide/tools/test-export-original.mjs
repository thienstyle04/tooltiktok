/**
 * Deep test for "Chất lượng gốc" (original) export profile.
 * Simulates full source-image pipeline + TikTok upscale impact.
 */
import sharp from '../../../../../frontend/node_modules/sharp/lib/index.js';
import { writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT_DIR = join(__dirname, 'export-quality-test-output', 'original');
const API_URL = process.env.GUIDE_API_URL || 'http://127.0.0.1:3000/api/guide-data';
const ASSET_BASE = process.env.ASSET_BASE || 'http://127.0.0.1:3000';

const PAGE_CSS = { width: 397, height: 562 };
const PIXEL_RATIO = 2;
const EXPORT_W = PAGE_CSS.width * PIXEL_RATIO;   // 794
const EXPORT_H = PAGE_CSS.height * PIXEL_RATIO;  // 1124
const TIKTOK_W = 1080;
const TIKTOK_H = Math.round(TIKTOK_W * (PAGE_CSS.height / PAGE_CSS.width)); // 1529

const ORIGINAL = {
  sourceImageMaxDimension: 0,
  sourceImageFormat: 'png',
  sourceImageQuality: 1,
  pixelRatio: PIXEL_RATIO,
};

const SLOTS = [
  { id: 'cover', cssW: 397, cssH: 562, label: 'Cover' },
  { id: 'grid4', cssW: 198, cssH: 281, label: 'Grid 4 cell' },
  { id: 'grid6', cssW: 198, cssH: 187, label: 'Grid 6 cell' },
  { id: 'zigzag', cssW: 86, cssH: 72, label: 'Zigzag thumb' },
];

function laplacianVariance(buffer, width, height) {
  const gray = new Float64Array(width * height);
  for (let i = 0; i < buffer.length; i += 4) {
    const idx = i / 4;
    gray[idx] = buffer[i] * 0.299 + buffer[i + 1] * 0.587 + buffer[i + 2] * 0.114;
  }
  let sum = 0, sumSq = 0, count = 0;
  const kernel = [0, 1, 0, 1, -4, 1, 0, 1, 0];
  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      let v = 0, ki = 0;
      for (let ky = -1; ky <= 1; ky++) {
        for (let kx = -1; kx <= 1; kx++) {
          v += gray[(y + ky) * width + (x + kx)] * kernel[ki++];
        }
      }
      sum += v; sumSq += v * v; count++;
    }
  }
  const mean = sum / count;
  return sumSq / count - mean * mean;
}

async function fitCoverPng(buffer, cssW, cssH, pixelRatio) {
  const tw = Math.max(1, Math.round(cssW * pixelRatio));
  const th = Math.max(1, Math.round(cssH * pixelRatio));
  const { data, info } = await sharp(buffer)
    .resize(tw, th, { fit: 'cover', position: 'centre' })
    .png()
    .toBuffer({ resolveWithObject: true });
  const raw = await sharp(data).ensureAlpha().raw().toBuffer();
  return { data, info, sharpness: laplacianVariance(raw, info.width, info.height) };
}

async function upscaleToTiktok(buffer, srcW, srcH) {
  const { data, info } = await sharp(buffer)
    .resize(TIKTOK_W, TIKTOK_H, { fit: 'fill' })
    .png()
    .toBuffer({ resolveWithObject: true });
  const raw = await sharp(data).ensureAlpha().raw().toBuffer();
  return { data, info, sharpness: laplacianVariance(raw, info.width, info.height) };
}

function resolveUrl(url) {
  if (!url) return null;
  if (url.startsWith('http')) return url;
  return `${ASSET_BASE}${url.startsWith('/') ? '' : '/'}${url}`;
}

function collectByDeck(dataset) {
  const byDeck = new Map();
  for (const deck of dataset?.decks || []) {
    const urls = [];
    for (const list of deck.lists || []) {
      for (const page of list.pages || []) {
        if (page.backgroundImage) urls.push(page.backgroundImage);
        for (const item of page.items || []) {
          if (item.imageUrl) urls.push(item.imageUrl);
        }
      }
    }
    const unique = [...new Set(urls)].slice(0, 2);
    if (unique.length) byDeck.set(deck.id, { navTitle: deck.navTitle, urls: unique });
  }
  return byDeck;
}

function verdict(sharpness, slot) {
  const thresholds = {
    cover: { good: 1200, ok: 800 },
    grid4: { good: 1000, ok: 600 },
    grid6: { good: 800, ok: 500 },
    zigzag: { good: 700, ok: 400 },
  };
  const t = thresholds[slot] || thresholds.grid4;
  if (sharpness >= t.good) return 'TỐT';
  if (sharpness >= t.ok) return 'KHÁ';
  return 'MỜ';
}

async function main() {
  mkdirSync(OUT_DIR, { recursive: true });
  console.log('=== TEST CHẤT LƯỢNG GỐC (original) ===\n');
  console.log(`Export size : ${EXPORT_W}x${EXPORT_H} px (pixelRatio=${PIXEL_RATIO})`);
  console.log(`TikTok upscale: ${EXPORT_W}x${EXPORT_H} → ${TIKTOK_W}x${TIKTOK_H} px\n`);

  const res = await fetch(API_URL);
  if (!res.ok) throw new Error(`API ${res.status}`);
  const dataset = await res.json();
  const byDeck = collectByDeck(dataset);

  const allResults = [];
  let sampleIdx = 0;

  for (const [deckId, { navTitle, urls }] of byDeck) {
    if (!['grid-4', 'grid-4-mutant', 'grid-6', 'grid-6-zigzag', 'grid-8', 'spotlight-guide'].includes(deckId)) continue;

    console.log(`--- Deck: ${navTitle} (${deckId}) ---`);
    for (const rawUrl of urls) {
      sampleIdx++;
      const url = resolveUrl(rawUrl);
      const imgRes = await fetch(url);
      if (!imgRes.ok) { console.log(`  [skip] HTTP ${imgRes.status}`); continue; }
      const src = Buffer.from(await imgRes.arrayBuffer());
      const meta = await sharp(src).metadata();
      console.log(`  Ảnh #${sampleIdx}: ${meta.width}x${meta.height} ${meta.format} (${(src.length/1024).toFixed(0)} KB)`);

      for (const slot of SLOTS) {
        const { data, info, sharpness } = await fitCoverPng(src, slot.cssW, slot.cssH, ORIGINAL.pixelRatio);
        const coverBuf = slot.id === 'cover' ? data : null;
        let tiktokSharp = null;
        let tiktokDrop = null;
        if (slot.id === 'cover') {
          const up = await upscaleToTiktok(data, info.width, info.height);
          tiktokSharp = up.sharpness;
          tiktokDrop = ((1 - tiktokSharp / sharpness) * 100).toFixed(1);
          writeFileSync(join(OUT_DIR, `${deckId}-cover-export.png`), data);
          writeFileSync(join(OUT_DIR, `${deckId}-cover-tiktok.png`), up.data);
        }

        const v = verdict(sharpness, slot.id);
        const row = {
          deckId, navTitle, sample: sampleIdx,
          slot: slot.id, slotLabel: slot.label,
          source: `${meta.width}x${meta.height}`,
          prepared: `${info.width}x${info.height}`,
          fileKB: +(data.length / 1024).toFixed(1),
          sharpness: +sharpness.toFixed(1),
          tiktokSharpness: tiktokSharp ? +tiktokSharp.toFixed(1) : null,
          tiktokDropPct: tiktokDrop,
          verdict: v,
        };
        allResults.push(row);
        const tiktokNote = tiktokDrop ? ` | TikTok upscale: ${tiktokSharp} (-${tiktokDrop}%)` : '';
        console.log(`    ${slot.label.padEnd(14)} ${info.width}x${info.height}  sharp=${sharpness.toFixed(0)}  ${v}  ${row.fileKB}KB${tiktokNote}`);
      }
    }
    console.log('');
  }

  // Summary
  const slotSummary = SLOTS.map((slot) => {
    const rows = allResults.filter((r) => r.slot === slot.id);
    const avg = rows.reduce((s, r) => s + r.sharpness, 0) / (rows.length || 1);
    const good = rows.filter((r) => r.verdict === 'TỐT').length;
    const ok = rows.filter((r) => r.verdict === 'KHÁ').length;
    const blur = rows.filter((r) => r.verdict === 'MỜ').length;
    return { slot: slot.label, avgSharp: +avg.toFixed(1), good, ok, blur, total: rows.length };
  });

  const coverTiktok = allResults.filter((r) => r.tiktokDropPct);
  const avgTiktokDrop = coverTiktok.reduce((s, r) => s + Number(r.tiktokDropPct), 0) / (coverTiktok.length || 1);

  console.log('=== TỔNG KẾT CHẤT LƯỢNG GỐC ===\n');
  for (const s of slotSummary) {
    console.log(`${s.slot}: avg sharpness=${s.avgSharp} | TỐT=${s.good} KHÁ=${s.ok} MỜ=${s.blur}/${s.total}`);
  }
  console.log(`\nCover sau upscale TikTok (${TIKTOK_W}x${TIKTOK_H}): mất nét trung bình ~${avgTiktokDrop.toFixed(1)}%`);

  const overallGood = allResults.filter((r) => r.verdict !== 'MỜ').length;
  const overallPct = (overallGood / allResults.length * 100).toFixed(0);

  const report = {
    profile: 'original',
    exportSize: `${EXPORT_W}x${EXPORT_H}`,
    tiktokSize: `${TIKTOK_W}x${TIKTOK_H}`,
    avgTiktokSharpnessDropPct: +avgTiktokDrop.toFixed(1),
    slotSummary,
    results: allResults,
    conclusion: null,
  };

  if (overallPct >= 85) {
    report.conclusion = {
      rating: 'ĐẠT',
      text: `Chất lượng gốc đạt ${overallPct}% mẫu ở mức TỐT/KHÁ. Đủ nét để đăng TikTok. Chọn "Chất lượng gốc" khi xuất.`,
      recommendDefault: true,
    };
  } else if (overallPct >= 60) {
    report.conclusion = {
      rating: 'KHÁ',
      text: `Chất lượng gốc đạt ${overallPct}% mẫu TỐT/KHÁ. Cover đủ nét; grid nhỏ có thể hơi mềm nếu ảnh nguồn thấp.`,
      recommendDefault: true,
    };
  } else {
    report.conclusion = {
      rating: 'CHƯA ĐẠT',
      text: `Nhiều ảnh nguồn resolution thấp. Cần kiểm tra ảnh Drive/library gốc.`,
      recommendDefault: false,
    };
  }

  writeFileSync(join(OUT_DIR, 'original-report.json'), JSON.stringify(report, null, 2));
  console.log(`\n=== KẾT LUẬN: ${report.conclusion.rating} ===`);
  console.log(report.conclusion.text);
  console.log(`\nOutput: ${OUT_DIR}`);
}

main().catch((err) => {
  console.error('Test failed:', err.message || err);
  process.exit(1);
});
