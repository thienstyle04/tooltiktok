"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.SHEET_DRIVE_MANIFEST_FILE = void 0;
exports.getSheetDriveManifestPath = getSheetDriveManifestPath;
exports.emptySheetDriveManifest = emptySheetDriveManifest;
exports.readSheetDriveManifest = readSheetDriveManifest;
exports.buildSheetDriveManifest = buildSheetDriveManifest;
exports.writeSheetDriveManifest = writeSheetDriveManifest;
const fs = __importStar(require("node:fs"));
const path = __importStar(require("node:path"));
const XLSX = __importStar(require("xlsx"));
const drive_images_1 = require("./drive-images");
const image_resolver_1 = require("../logic/image-resolver");
const workbook_source_1 = require("./workbook-source");
const constants_1 = require("../core/constants");
exports.SHEET_DRIVE_MANIFEST_FILE = 'sheet-drive-images.json';
function isLikelyLinkHeader(header) {
    return header.includes('link') || header.includes('anh') || header.includes('hinh');
}
function workbookRowsWithLinks(sheet) {
    const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, raw: false, defval: '' });
    if (rows.length === 0)
        return [];
    const headers = (rows[0] ?? []).map((header) => (0, image_resolver_1.normalizeText)(header));
    const results = [];
    for (const [rowOffset, rawRow] of rows.slice(1).entries()) {
        const rowMap = {};
        headers.forEach((header, columnIndex) => {
            const rawValue = String(rawRow[columnIndex] ?? '').trim();
            const cellRef = XLSX.utils.encode_cell({ r: rowOffset + 1, c: columnIndex });
            const cell = sheet[cellRef];
            const hyperlink = typeof cell?.l?.Target === 'string' ? cell.l.Target.trim() : '';
            rowMap[header] = hyperlink && isLikelyLinkHeader(header) ? hyperlink : rawValue;
            if (hyperlink)
                rowMap[`${header}__hyperlink`] = hyperlink;
        });
        results.push(rowMap);
    }
    return results;
}
function preferredImageLink(row) {
    return (0, image_resolver_1.firstValue)(row, 'link_drive__hyperlink', 'link_drive', 'link_anh__hyperlink', 'link_anh', 'link_hinh__hyperlink', 'link_hinh', 'link_hinh_anh__hyperlink', 'link_hinh_anh', 'hinh_anh__hyperlink', 'hinh_anh', 'image_link__hyperlink', 'image_link');
}
function getSheetDriveManifestPath(toolRoot) {
    return path.join(toolRoot, exports.SHEET_DRIVE_MANIFEST_FILE);
}
function emptySheetDriveManifest() {
    return {
        version: 1,
        generatedAt: new Date(0).toISOString(),
        workbookName: workbook_source_1.PREFERRED_WORKBOOK_NAME,
        workbookMtimeMs: 0,
        items: {},
    };
}
function readSheetDriveManifest(toolRoot, workbookPath) {
    const manifestPath = getSheetDriveManifestPath(toolRoot);
    if (!fs.existsSync(manifestPath))
        return emptySheetDriveManifest();
    try {
        const raw = fs.readFileSync(manifestPath, 'utf-8');
        const parsed = JSON.parse(raw);
        const manifest = {
            version: Number(parsed.version ?? 1),
            generatedAt: String(parsed.generatedAt ?? new Date(0).toISOString()),
            workbookName: String(parsed.workbookName ?? workbook_source_1.PREFERRED_WORKBOOK_NAME),
            workbookMtimeMs: Number(parsed.workbookMtimeMs ?? 0),
            items: parsed.items && typeof parsed.items === 'object' ? parsed.items : {},
        };
        if (workbookPath && fs.existsSync(workbookPath)) {
            const workbookName = path.basename(workbookPath);
            if (manifest.workbookName !== workbookName) {
                return emptySheetDriveManifest();
            }
        }
        return manifest;
    }
    catch {
        return emptySheetDriveManifest();
    }
}
async function buildSheetDriveManifest(workbookPath) {
    const workbook = XLSX.readFile(workbookPath, { cellDates: false });
    const items = {};
    for (const sheetName of workbook.SheetNames) {
        const sectionKey = (0, image_resolver_1.normalizeText)(sheetName);
        if (!(sectionKey in constants_1.SECTION_CONFIG))
            continue;
        const sheet = workbook.Sheets[sheetName];
        for (const row of workbookRowsWithLinks(sheet)) {
            const name = (0, image_resolver_1.firstValue)(row, 'ten_quan', 'ten_dia_diem', 'ten');
            if (!name)
                continue;
            const address = (0, image_resolver_1.firstValue)(row, 'dia_chi');
            const imageLink = preferredImageLink(row);
            if (!imageLink)
                continue;
            const resolvedEntry = await (0, drive_images_1.resolveDriveLinkToEntry)(imageLink, name, address).catch((error) => {
                console.warn(`[sync] Bỏ qua ảnh Drive lỗi cho "${name}": ${error instanceof Error ? error.message : String(error)}`);
                return null;
            });
            if (!resolvedEntry)
                continue;
            const key = (0, image_resolver_1.itemMappingKey)(sectionKey, name, address);
            items[key] = {
                key,
                sectionKey,
                name,
                address,
                sourceLink: imageLink,
                fileId: resolvedEntry.fileId,
                fileName: resolvedEntry.fileName,
            };
        }
    }
    const workbookStats = fs.statSync(workbookPath);
    return {
        version: 1,
        generatedAt: new Date().toISOString(),
        workbookName: path.basename(workbookPath),
        workbookMtimeMs: workbookStats.mtimeMs,
        items,
    };
}
function writeSheetDriveManifest(toolRoot, manifest) {
    const manifestPath = getSheetDriveManifestPath(toolRoot);
    fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2), 'utf-8');
    return manifestPath;
}
