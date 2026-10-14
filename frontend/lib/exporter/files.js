'use client';
// Tên file/thư mục, ZIP và XLSX đi kèm khi xuất list.
import JSZip from 'jszip';
import { formatListSetLabel, parseListSetIndex, sanitizeFilePart } from '../utils';
import { addThreadsFoodFiles, isThreadsLocalDeck } from '../threadsFoodExport.mjs';
import { buildCaptionExportText } from '../captionText';
import { collectPartnerNames } from '../partnerNames.mjs';
import { assertItineraryNoteDarkPartnerExportReady, assertPartnerExportReady, assertSpotlightV4V6PartnerExportReady } from './checks';
import { loadThreadsFoodPhoto } from './render';

/**
 * Download a blob as a file. More reliable than file-saver's saveAs because:
 * 1. file-saver silently fails in background tabs (browser blocks <a> click)
 * 2. We add retry logic and fallback to window.open for background tabs
 */
export function downloadBlobFile(blob, filename) {
  let url = null;
  try {
    url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    link.style.display = 'none';
    document.body.appendChild(link);
    link.click();
    // Give the browser time to start the download before cleanup
    setTimeout(() => {
      if (link.parentNode) link.parentNode.removeChild(link);
      if (url) URL.revokeObjectURL(url);
    }, 10000);
    return true;
  } catch (error) {
    // Fallback: open in new tab (works even in background)
    try {
      if (url) {
        window.open(url, '_blank');
        return true;
      }
    } catch (fallbackError) {
      console.warn(`Download fallback failed: ${fallbackError?.message || fallbackError}`);
    }
    console.warn(`Download failed: ${error?.message || error}${url ? ` Blob URL: ${url}` : ''}`);
    if (url) URL.revokeObjectURL(url);
    return false;
  }
}
const SPOTLIGHT_PARTNER_POST_CAPTION = 'Bỏ túi ngay, kẻo đi Đà Lạt lại loay hoay 😉';
const SPOTLIGHT_PARTNER_CAPTION_BODY = 'Nếu chỉ có 3 ngày ở Đà Lạt, cứ lưu list này trước. Các điểm được chia theo khung giờ để đi đỡ vòng và đỡ phát sinh.';
const SPOTLIGHT_PARTNER_CAPTION_HASHTAGS = ['#riviudalat', '#dalat', '#dalatreview', '#spotlightdalat', '#dichvudalat'];

function escapeXml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;');
}

function columnName(index) {
  let value = index + 1;
  let result = '';
  while (value > 0) {
    const remainder = (value - 1) % 26;
    result = String.fromCharCode(65 + remainder) + result;
    value = Math.floor((value - 1) / 26);
  }
  return result;
}

export async function createHorizontalXlsx(values, sheetName = 'Doi tac') {
  const workbookZip = new JSZip();
  const normalizedValues = values
    .map((value) => String(value || '').trim())
    .filter(Boolean);
  const valueCells = normalizedValues.map((value, index) =>
    `<c r="${columnName(index)}1" t="inlineStr"><is><t>${escapeXml(value)}</t></is></c>`,
  ).join('');
  const cols = normalizedValues.map((_, index) =>
    `<col min="${index + 1}" max="${index + 1}" width="24" customWidth="1"/>`,
  ).join('');
  const colsXml = cols ? `<cols>${cols}</cols>` : '';
  const sheetDataXml = valueCells
    ? `<sheetData>
    <row r="1">${valueCells}</row>
  </sheetData>`
    : '<sheetData/>';

  workbookZip.file('[Content_Types].xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
  <Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>
  <Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>
</Types>`);
  workbookZip.folder('_rels').file('.rels', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>
</Relationships>`);
  workbookZip.folder('xl').file('workbook.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <sheets>
    <sheet name="${escapeXml(sheetName)}" sheetId="1" r:id="rId1"/>
  </sheets>
</workbook>`);
  workbookZip.folder('xl').folder('_rels').file('workbook.xml.rels', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>
  <Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
</Relationships>`);
  workbookZip.folder('xl').file('styles.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <fonts count="1"><font><sz val="11"/><name val="Calibri"/></font></fonts>
  <fills count="1"><fill><patternFill patternType="none"/></fill></fills>
  <borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>
  <cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>
  <cellXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/></cellXfs>
</styleSheet>`);
  workbookZip.folder('xl').folder('worksheets').file('sheet1.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  ${colsXml}
  ${sheetDataXml}
</worksheet>`);

  return workbookZip.generateAsync({
    type: 'blob',
    mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    compression: 'STORE',
  });
}

async function createTableXlsx(headers, rows, sheetName = 'Du lieu') {
  const workbookZip = new JSZip();
  const allRows = [headers, ...rows];
  const sheetRows = allRows.map((row, rowIndex) => {
    const cells = row.map((value, columnIndex) =>
      `<c r="${columnName(columnIndex)}${rowIndex + 1}" t="inlineStr"><is><t>${escapeXml(value)}</t></is></c>`,
    ).join('');
    return `<row r="${rowIndex + 1}">${cells}</row>`;
  }).join('');
  const cols = headers.map((_, index) =>
    `<col min="${index + 1}" max="${index + 1}" width="28" customWidth="1"/>`,
  ).join('');
  workbookZip.file('[Content_Types].xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/></Types>`);
  workbookZip.folder('_rels').file('.rels', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`);
  workbookZip.folder('xl').file('workbook.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="${escapeXml(sheetName)}" sheetId="1" r:id="rId1"/></sheets></workbook>`);
  workbookZip.folder('xl').folder('_rels').file('workbook.xml.rels', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/></Relationships>`);
  workbookZip.folder('xl').folder('worksheets').file('sheet1.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><cols>${cols}</cols><sheetData>${sheetRows}</sheetData></worksheet>`);
  return workbookZip.generateAsync({
    type: 'blob',
    mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    compression: 'STORE',
  });
}

export function exportNameWithExtension(pageNode, index, extension = 'png') {
  const fallbackName = `page-${index + 1}.${extension}`;
  const exportName = pageNode.dataset.exportName
    || pageNode.querySelector?.('.story-page')?.dataset?.exportName
    || fallbackName;
  if (extension === 'png') return exportName;
  const renamed = exportName.replace(/\.[^.]+$/, `.${extension}`);
  return renamed === exportName ? `${exportName}.${extension}` : renamed;
}

export function createListFolder(zip, list, zipInstance, deckId, dataset = null) {
  const folderName = batchFolderName(deckId, parseListSetIndex(list), dataset);
  return zip.folder(folderName);
}

function deckOrderIndex(dataset, deckId) {
  const decks = dataset?.decks || [];
  const idx = decks.findIndex((deck) => deck.id === deckId);
  return idx >= 0 ? idx : Number.MAX_SAFE_INTEGER;
}

/** Group by caption set first, then deck order in dataset (A set1, B set1, A set2, B set2). */
export function orderListsForBatchExport(items, dataset) {
  return [...items].sort((a, b) => {
    const setA = parseListSetIndex(a.list);
    const setB = parseListSetIndex(b.list);
    if (setA !== setB) return setA - setB;
    return deckOrderIndex(dataset, a.deck.id) - deckOrderIndex(dataset, b.deck.id);
  });
}

export function deckShortName(deckId) {
  const map = {
    'itinerary-3n2d': '3n2d',
    'itinerary-4n3d': '4n3d',
    'itinerary-4n2d-grid8': '4n3d-luoi8',
    'pov-3-day': 'pov3',
    'must-go': 'mustgo',
    'first-time': 'firsttime',
    'grid-6': 'grid6',
    'grid-6-quaytung': 'grid6qt',
    'grid-8': 'grid8',
    'grid-8-feed': 'grid8feed',
    'grid-8-quaytung': 'grid8qt',
    'itinerary-4n3d-stack': '4n3dstack',
    'itinerary-timeline': 'timeline3d',
    'grid-4': 'grid4',
    'grid-5': 'grid5',
    'spotlight-guide': 'spotlight',
    'spotlight-v2': 'spotlightv2',
    'spotlight-v3': 'spotlightv3',
    'spotlight-v4': 'spotlightv4',
    'spotlight-v5': 'spotlightv5',
    'spotlight-v5-color-edit': 'spotlight-v5-color-edit',
    'spotlight-v6': 'spotlightv6',
    'spotlight-v6-color-edit': 'spotlight-color-edit',
    'spotlight-v6-green': 'spotlightv6-mang-xanh',
    'spotlight-v6-dark': 'spotlightv6-tone-den',
    'spotlight-v6-persimmon': 'spotlight-mua-hong',
    'spotlight-v6-maps': 'spotlightv6-google-maps',
    'spotlight-v6-diary': 'spotlight-nhat-ky-da-lat',
    'threads-food-local': 'quan-an-threads',
    'threads-cafe-local': 'ca-phe-threads',
    'threads-mix-local': 'tong-hop-threads',
    'threads-mix-text': 'tong-hop-threads-chu',
    'summary-note': 'summary-note',
    'itinerary-note-2days': 'itinerary-note-2days',
    'itinerary-note-dark': 'itinerary-note-dark',
    'itinerary-note-timed': 'itinerary-note-timed',
    'carousel-mau-1': 'mau1',
    'one-way-story': 'duong-mot-chieu',
    'spotlight-partner': 'partner',
  };
  return map[String(deckId || '')] || sanitizeFilePart(deckId || 'mau');
}

function batchFolderName(deckId, setIndex, dataset = null) {
  const short = deckShortName(deckId);
  const setLabel = formatListSetLabel(setIndex);
  // Set prefix so Explorer alphabetical sort = set1 all decks, then set2…
  if (dataset?.decks?.length) {
    const orderTag = String(deckOrderIndex(dataset, deckId) + 1).padStart(2, '0');
    return `${setLabel} ${orderTag} ${short}`;
  }
  return `${setLabel} ${short}`;
}

export function uniqueBatchFolderNames(entries, dataset) {
  const used = new Set();
  return entries.map(({ deck, list }) => {
    const base = batchFolderName(deck.id, parseListSetIndex(list), dataset);
    let name = base, duplicate = 1;
    // Legacy partner lists have no caption number, so several parse as set1.
    // Never let JSZip overwrite another list's images, TXT or workbook.
    while (used.has(name)) name = `${base} - list${++duplicate}`;
    used.add(name);
    return name;
  });
}

export function todayDateTag() {
  const now = new Date();
  const dd = String(now.getDate()).padStart(2, '0');
  const mm = String(now.getMonth() + 1).padStart(2, '0');
  const yyyy = now.getFullYear();
  const hh = String(now.getHours()).padStart(2, '0');
  const min = String(now.getMinutes()).padStart(2, '0');
  const ss = String(now.getSeconds()).padStart(2, '0');
  return `${dd}-${mm}-${yyyy}_${hh}-${min}-${ss}`;
}

export async function addListMetadataFiles(folder, list, setIndex = parseListSetIndex(list), deckId = '') {
  assertPartnerExportReady(list, deckId);
  if (isThreadsLocalDeck(deckId)) {
    await addThreadsFoodFiles(folder, list, item => loadThreadsFoodPhoto(item, list.photoPreset), sanitizeFilePart, createHorizontalXlsx);
    return;
  }
  assertSpotlightV4V6PartnerExportReady(list, deckId);
  assertItineraryNoteDarkPartnerExportReady(list, deckId);
  const setLabel = formatListSetLabel(setIndex);
  const coverTitle = String(list.coverTitle || list.title || list.navTitle || '').trim();
  const isSpotlightPartnerList = Array.isArray(list?.pages)
    && list.pages.some((page) => page?.layoutVariant === 'spotlight-partner' || page?.layoutVariant === 'spotlight-partner-info');
  const usePartnerCaptionFallback = isSpotlightPartnerList && !String(list.postCaption || '').trim();
  const captionText = buildCaptionExportText(list, usePartnerCaptionFallback
    ? {
      title: SPOTLIGHT_PARTNER_POST_CAPTION,
      description: SPOTLIGHT_PARTNER_CAPTION_BODY,
      hashtags: SPOTLIGHT_PARTNER_CAPTION_HASHTAGS,
    }
    : {
      hashtags: Array.isArray(list.captionHashtags) && list.captionHashtags.length > 0
        ? list.captionHashtags
        : (isSpotlightPartnerList ? SPOTLIGHT_PARTNER_CAPTION_HASHTAGS : []),
    });
  folder.file(`caption-${setLabel}.txt`, captionText || coverTitle);
  folder.file(`partners-${setLabel}.xlsx`, await createHorizontalXlsx(collectPartnerNames(list)));
  if ((list.pages || []).some((page) => page?.layoutVariant === 'carousel-mau-1-page')) {
    const rows = (list.pages || []).flatMap((page, pageIndex) => (page.items || []).map((item) => [
      String(pageIndex + 1),
      item.sourceKey || item.id || '',
      item.sourceSectionKey || '',
      item.rawName || item.name || '',
      item.metaPrimary || '',
      item.imageUrl || '',
    ]));
    folder.file(`du-lieu-mau-1-${setLabel}.xlsx`, await createTableXlsx(
      ['Trang', 'ID nguồn', 'Nhóm dữ liệu', 'Tên địa điểm', 'Địa chỉ', 'URL ảnh'],
      rows,
      'Du lieu Mau 1',
    ));
  }
}
