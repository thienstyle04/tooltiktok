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
exports.PREFERRED_WORKBOOK_NAME = exports.DALAT_FNB_EXPORT_URL = exports.DALAT_FNB_SHEET_URL = void 0;
exports.findWorkbookPath = findWorkbookPath;
exports.syncWorkbookFromSheet = syncWorkbookFromSheet;
const fs = __importStar(require("node:fs"));
const path = __importStar(require("node:path"));
exports.DALAT_FNB_SHEET_URL = 'https://docs.google.com/spreadsheets/d/1-ECVLtuySSlCO5AShcJle1uP9j8XCA4l/edit?gid=1236724598#gid=1236724598';
exports.DALAT_FNB_EXPORT_URL = 'https://docs.google.com/spreadsheets/d/1-ECVLtuySSlCO5AShcJle1uP9j8XCA4l/export?format=xlsx';
exports.PREFERRED_WORKBOOK_NAME = 'F&B ĐÀ LẠT.xlsx';
function listWorkbookPaths(workspaceRoot) {
    return fs
        .readdirSync(workspaceRoot)
        .filter((entry) => entry.toLowerCase().endsWith('.xlsx'))
        .map((entry) => path.join(workspaceRoot, entry));
}
function findWorkbookPath(workspaceRoot) {
    const workbookPaths = listWorkbookPaths(workspaceRoot);
    if (workbookPaths.length === 0)
        return null;
    const preferredPath = path.join(workspaceRoot, exports.PREFERRED_WORKBOOK_NAME);
    if (fs.existsSync(preferredPath))
        return preferredPath;
    if (workbookPaths.length === 1)
        return workbookPaths[0];
    return workbookPaths
        .map((filePath) => ({ filePath, mtimeMs: fs.statSync(filePath).mtimeMs }))
        .sort((left, right) => right.mtimeMs - left.mtimeMs || left.filePath.localeCompare(right.filePath, 'vi'))[0]?.filePath ?? null;
}
async function syncWorkbookFromSheet(workspaceRoot) {
    const response = await fetch(exports.DALAT_FNB_EXPORT_URL, {
        headers: {
            Referer: exports.DALAT_FNB_SHEET_URL,
            'User-Agent': 'Codex Workbook Sync',
        },
    });
    if (!response.ok) {
        throw new Error(`Không tải được workbook từ Google Sheet. HTTP ${response.status}`);
    }
    const arrayBuffer = await response.arrayBuffer();
    const workbookBuffer = Buffer.from(arrayBuffer);
    const workbookPath = path.join(workspaceRoot, exports.PREFERRED_WORKBOOK_NAME);
    const tempPath = `${workbookPath}.download`;
    fs.writeFileSync(tempPath, workbookBuffer);
    fs.copyFileSync(tempPath, workbookPath);
    // Windows/Node 24 can crash natively when deleting the freshly downloaded
    // xlsx temp file while another file handle is settling. Keep one stable temp
    // file and overwrite it on the next sync instead of deleting it here.
    return { workbookPath, bytes: workbookBuffer.byteLength };
}
