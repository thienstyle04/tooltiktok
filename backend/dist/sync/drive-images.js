"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.extractDriveFolderId = extractDriveFolderId;
exports.extractDriveFileId = extractDriveFileId;
exports.getDriveFileViewUrl = getDriveFileViewUrl;
exports.getDriveImageProxyUrl = getDriveImageProxyUrl;
exports.listDriveFolderEntries = listDriveFolderEntries;
exports.resolveDriveLinkToEntry = resolveDriveLinkToEntry;
exports.resolveDriveLinkToEntries = resolveDriveLinkToEntries;
exports.fetchDriveFileAsset = fetchDriveFileAsset;
const DRIVE_FOLDER_CACHE_TTL_MS = 30 * 60 * 1000;
const DRIVE_FILE_CACHE_TTL_MS = 30 * 60 * 1000;
const DRIVE_FILE_FALLBACK_CACHE_TTL_MS = 5 * 60 * 1000;
const DRIVE_FETCH_TIMEOUT_MS = 15_000;
const folderEntriesCache = new Map();
const driveFileAssetCache = new Map();
const IMAGE_EXTENSIONS = new Set(['.jpg', '.jpeg', '.png', '.webp', '.gif', '.jfif', '.bmp']);
function normalizeText(value) {
    return String(value ?? '')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/đ/g, 'd')
        .replace(/Đ/g, 'D')
        .replace(/[^a-zA-Z0-9]+/g, '_')
        .replace(/^_+|_+$/g, '')
        .toLowerCase();
}
function decodeHtmlEntities(value) {
    return value
        .replace(/&amp;/g, '&')
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'")
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>');
}
function stripHtml(value) {
    return decodeHtmlEntities(value.replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();
}
function extensionOf(fileName) {
    const normalized = String(fileName ?? '').trim().toLowerCase();
    const dotIndex = normalized.lastIndexOf('.');
    return dotIndex >= 0 ? normalized.slice(dotIndex) : '';
}
function looksLikeImageName(fileName) {
    return IMAGE_EXTENSIONS.has(extensionOf(fileName));
}
function scoreDriveEntry(entry, placeName, address) {
    const normalizedFileName = normalizeText(entry.fileName);
    const normalizedName = normalizeText(placeName);
    const normalizedAddress = normalizeText(address);
    const nameTokens = normalizedName.split('_').filter(Boolean);
    const addressTokens = normalizedAddress.split('_').filter(Boolean);
    let score = looksLikeImageName(entry.fileName) ? 20 : 0;
    if (normalizedName) {
        if (normalizedFileName === normalizedName)
            score += 120;
        else if (normalizedFileName.includes(normalizedName) || normalizedName.includes(normalizedFileName))
            score += 90;
    }
    for (const token of nameTokens) {
        if (token.length >= 3 && normalizedFileName.includes(token))
            score += 18;
    }
    for (const token of addressTokens) {
        if (token.length >= 3 && normalizedFileName.includes(token))
            score += 6;
    }
    return score;
}
function sniffImageContentType(body) {
    if (body.length >= 3 && body[0] === 0xff && body[1] === 0xd8 && body[2] === 0xff)
        return 'image/jpeg';
    if (body.length >= 8 && body.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])))
        return 'image/png';
    if (body.length >= 6) {
        const header = body.subarray(0, 6).toString('ascii');
        if (header === 'GIF87a' || header === 'GIF89a')
            return 'image/gif';
    }
    if (body.length >= 12 && body.subarray(0, 4).toString('ascii') === 'RIFF' && body.subarray(8, 12).toString('ascii') === 'WEBP') {
        return 'image/webp';
    }
    if (body.length >= 2 && body[0] === 0x42 && body[1] === 0x4d)
        return 'image/bmp';
    return '';
}
function escapeSvgText(value) {
    return String(value ?? '')
        .replaceAll('&', '&amp;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;')
        .replaceAll('"', '&quot;');
}
function createTimeoutSignal(ms) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), ms);
    timeout.unref?.();
    return {
        signal: controller.signal,
        cancel: () => clearTimeout(timeout),
    };
}
function createDriveFallbackAsset(fileId) {
    const safeFileId = escapeSvgText(fileId);
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="900" viewBox="0 0 1200 900">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#f6f1e8"/>
      <stop offset="1" stop-color="#dfe9df"/>
    </linearGradient>
  </defs>
  <rect width="1200" height="900" fill="url(#bg)"/>
  <rect x="130" y="120" width="940" height="660" rx="34" fill="#fffdf8" stroke="#d8d0c1" stroke-width="6"/>
  <circle cx="382" cy="340" r="78" fill="#d8e6d8"/>
  <path d="M210 700 480 455l156 140 112-98 242 203H210Z" fill="#9fb89d"/>
  <path d="M210 700 530 510l138 118 94-78 228 150H210Z" fill="#6f9270" opacity=".78"/>
  <text x="600" y="250" text-anchor="middle" font-family="Arial, sans-serif" font-size="46" font-weight="700" fill="#274d3d">Drive image unavailable</text>
  <text x="600" y="310" text-anchor="middle" font-family="Arial, sans-serif" font-size="26" fill="#6c655c">File needs public access or sign-in</text>
  <text x="600" y="820" text-anchor="middle" font-family="Arial, sans-serif" font-size="18" fill="#8a8175">fileId=${safeFileId}</text>
</svg>`;
    const body = Buffer.from(svg, 'utf8');
    return {
        body,
        contentLength: body.byteLength,
        contentType: 'image/svg+xml',
    };
}
function extractDriveFolderId(value) {
    const text = String(value ?? '').trim();
    if (!text)
        return '';
    const folderMatch = text.match(/\/folders\/([a-zA-Z0-9_-]+)/);
    if (folderMatch)
        return folderMatch[1];
    try {
        const url = new URL(text);
        const id = url.searchParams.get('id');
        if (id && /^[a-zA-Z0-9_-]+$/.test(id))
            return id;
    }
    catch {
        // Ignore invalid URL inputs.
    }
    return '';
}
function extractDriveFileId(value) {
    const text = String(value ?? '').trim();
    if (!text)
        return '';
    const fileMatch = text.match(/\/file\/d\/([a-zA-Z0-9_-]+)/);
    if (fileMatch)
        return fileMatch[1];
    try {
        const url = new URL(text);
        const id = url.searchParams.get('id');
        if (id && /^[a-zA-Z0-9_-]+$/.test(id))
            return id;
    }
    catch {
        if (/^[a-zA-Z0-9_-]{10,}$/.test(text))
            return text;
    }
    return '';
}
function getDriveFileViewUrl(fileId) {
    return `https://drive.google.com/file/d/${encodeURIComponent(fileId)}/view?usp=drive_web`;
}
function getDriveImageProxyUrl(fileId) {
    return `/assets/drive-file?id=${encodeURIComponent(fileId)}`;
}
async function fetchText(url) {
    const timeout = createTimeoutSignal(DRIVE_FETCH_TIMEOUT_MS);
    const response = await fetch(url, {
        headers: {
            Referer: 'https://drive.google.com/',
            'User-Agent': 'Codex Drive Folder Reader',
        },
        redirect: 'follow',
        signal: timeout.signal,
    }).finally(timeout.cancel);
    if (!response.ok) {
        throw new Error(`Không tải được nội dung Drive. HTTP ${response.status}`);
    }
    return response.text();
}
async function listDriveFolderEntries(folderId) {
    const cached = folderEntriesCache.get(folderId);
    const now = Date.now();
    if (cached && cached.expiresAt > now) {
        return cached.entries;
    }
    const html = await fetchText(`https://drive.google.com/embeddedfolderview?id=${encodeURIComponent(folderId)}#list`);
    const matches = Array.from(html.matchAll(/<a [^>]*href="([^"]*\/file\/d\/[a-zA-Z0-9_-]+\/view[^"]*)"[^>]*>(.*?)<\/a>/gs));
    const seenFileIds = new Set();
    const entries = matches
        .map((match) => {
        const viewUrl = decodeHtmlEntities(match[1]);
        const fileId = extractDriveFileId(viewUrl);
        const fileName = stripHtml(match[2]);
        if (!fileId || seenFileIds.has(fileId))
            return null;
        seenFileIds.add(fileId);
        return { fileId, fileName, viewUrl };
    })
        .filter((entry) => Boolean(entry));
    folderEntriesCache.set(folderId, {
        expiresAt: now + DRIVE_FOLDER_CACHE_TTL_MS,
        entries,
    });
    return entries;
}
async function resolveDriveLinkToEntry(link, placeName, address) {
    return (await resolveDriveLinkToEntries(link, placeName, address))[0] ?? null;
}
async function resolveDriveLinkToEntries(link, placeName, address) {
    const directFileId = extractDriveFileId(link);
    if (directFileId) {
        return [{
                fileId: directFileId,
                fileName: '',
                viewUrl: getDriveFileViewUrl(directFileId),
            }];
    }
    const folderId = extractDriveFolderId(link);
    if (!folderId)
        return [];
    const entries = await listDriveFolderEntries(folderId);
    if (entries.length === 0)
        return [];
    const imageEntries = entries.filter((entry) => looksLikeImageName(entry.fileName));
    const candidates = imageEntries.length > 0 ? imageEntries : entries;
    return candidates
        .map((entry, index) => ({
        entry,
        index,
        score: scoreDriveEntry(entry, placeName, address),
    }))
        .sort((left, right) => right.score - left.score || left.index - right.index)
        .slice(0, 6)
        .map((candidate) => candidate.entry);
}
async function fetchDriveFileAsset(fileId) {
    const cached = driveFileAssetCache.get(fileId);
    const now = Date.now();
    if (cached && cached.expiresAt > now) {
        return cached.asset;
    }
    const candidateUrls = [
        `https://drive.google.com/uc?export=view&id=${encodeURIComponent(fileId)}`,
        `https://drive.google.com/thumbnail?authuser=0&sz=w1600&id=${encodeURIComponent(fileId)}`,
        `https://drive.google.com/uc?export=download&id=${encodeURIComponent(fileId)}`,
    ];
    for (const url of candidateUrls) {
        let response;
        try {
            const timeout = createTimeoutSignal(DRIVE_FETCH_TIMEOUT_MS);
            response = await fetch(url, {
                headers: {
                    Referer: 'https://drive.google.com/',
                    'User-Agent': 'Codex Drive Image Proxy',
                },
                redirect: 'follow',
                signal: timeout.signal,
            }).finally(timeout.cancel);
        }
        catch {
            continue;
        }
        if (!response.ok)
            continue;
        const body = Buffer.from(await response.arrayBuffer());
        const headerContentType = String(response.headers.get('content-type') ?? '').split(';')[0].trim().toLowerCase();
        const sniffedContentType = sniffImageContentType(body);
        const contentType = headerContentType.startsWith('image/') ? headerContentType : sniffedContentType;
        if (!contentType)
            continue;
        const asset = {
            body,
            contentLength: body.byteLength,
            contentType,
        };
        driveFileAssetCache.set(fileId, {
            expiresAt: now + DRIVE_FILE_CACHE_TTL_MS,
            asset,
        });
        return asset;
    }
    const fallbackAsset = createDriveFallbackAsset(fileId);
    driveFileAssetCache.set(fileId, {
        expiresAt: now + DRIVE_FILE_FALLBACK_CACHE_TTL_MS,
        asset: fallbackAsset,
    });
    return fallbackAsset;
}
