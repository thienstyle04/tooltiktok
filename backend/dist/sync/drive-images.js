"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.extractDriveFolderId = extractDriveFolderId;
exports.extractDriveFileId = extractDriveFileId;
exports.getDriveFileViewUrl = getDriveFileViewUrl;
exports.getDriveImageProxyUrl = getDriveImageProxyUrl;
exports.listDriveFolderEntries = listDriveFolderEntries;
exports.resolveDriveLinkToEntry = resolveDriveLinkToEntry;
exports.fetchDriveFileAsset = fetchDriveFileAsset;
const DRIVE_FOLDER_CACHE_TTL_MS = 30 * 60 * 1000;
const DRIVE_FILE_CACHE_TTL_MS = 30 * 60 * 1000;
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
    const response = await fetch(url, {
        headers: {
            Referer: 'https://drive.google.com/',
            'User-Agent': 'Codex Drive Folder Reader',
        },
        redirect: 'follow',
    });
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
    const directFileId = extractDriveFileId(link);
    if (directFileId) {
        return {
            fileId: directFileId,
            fileName: '',
            viewUrl: getDriveFileViewUrl(directFileId),
        };
    }
    const folderId = extractDriveFolderId(link);
    if (!folderId)
        return null;
    const entries = await listDriveFolderEntries(folderId);
    if (entries.length === 0)
        return null;
    const imageEntries = entries.filter((entry) => looksLikeImageName(entry.fileName));
    const candidates = imageEntries.length > 0 ? imageEntries : entries;
    return candidates
        .map((entry, index) => ({
        entry,
        index,
        score: scoreDriveEntry(entry, placeName, address),
    }))
        .sort((left, right) => right.score - left.score || left.index - right.index)[0]?.entry ?? null;
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
        const response = await fetch(url, {
            headers: {
                Referer: 'https://drive.google.com/',
                'User-Agent': 'Codex Drive Image Proxy',
            },
            redirect: 'follow',
        });
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
    throw new Error(`Không tải được ảnh Drive cho fileId=${fileId}`);
}
