import * as fs from 'fs';
import * as path from 'path';
import * as XLSX from 'xlsx';
import { resolveBackendDataDir, resolveBackendReportsDir, resolveBackendRoot, resolveWorkspaceRoot } from '../../../config';

const toolRoot = resolveBackendRoot(__dirname);
const workspaceRoot = resolveWorkspaceRoot(toolRoot);
const dataRoot = resolveBackendDataDir(toolRoot);
const reportsRoot = resolveBackendReportsDir(toolRoot);
const workbookPath = path.join(workspaceRoot, 'F&B ĐÀ LẠT.xlsx');
const imageMappingPath = path.join(dataRoot, 'image-mapping.json');
const reportPath = path.join(reportsRoot, 'mapping-report.md');

function normalizeText(value: unknown): string {
    return String(value ?? '')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/đ/g, 'd')
        .replace(/Đ/g, 'D')
        .replace(/[^a-zA-Z0-9]+/g, '_')
        .replace(/^_+|_+$/g, '')
        .toLowerCase();
}

function scoreImageLibraryMatch(sectionKey: string, name: string, address: string, entry: any): number {
    const normalizedName = normalizeText(name);
    const entryTokens = new Set(entry.normalizedSubDir.split('_').filter(Boolean));
    const nameTokens = new Set(normalizedName.split('_').filter(Boolean));
    let score = 0;
    if (entry.normalizedSubDir === normalizedName) score += 100;
    else if (entry.normalizedSubDir.includes(normalizedName) || normalizedName.includes(entry.normalizedSubDir)) score += 70;
    for (const token of nameTokens) {
        if (token.length >= 3 && entryTokens.has(token)) score += 18;
    }
    return score;
}

const mapping = JSON.parse(fs.readFileSync(imageMappingPath, 'utf-8'));
const libraryRoots = [
    { key: 'main', path: mapping.libraryRoot },
    ...(mapping.extraLibraryRoots || []).map((p: string, i: number) => ({ key: `extra_${i}`, path: p }))
];

const libraryEntries: any[] = [];
const imageExtensions = new Set(['.jpg', '.jpeg', '.png', '.webp', '.jfif']);
for (const root of libraryRoots) {
    if (!root.path || !fs.existsSync(root.path)) continue;
    try {
        const firstLevels = fs.readdirSync(root.path, { withFileTypes: true });
        for (const dl of firstLevels) {
            if (!dl.isDirectory()) continue;
            const p = path.join(root.path, dl.name);
            const imgs = fs.readdirSync(p).filter(f => imageExtensions.has(path.extname(f).toLowerCase()));
            if (imgs.length > 0) libraryEntries.push({ normalizedSubDir: normalizeText(dl.name), assetUrls: imgs, topDir: dl.name });
            const secondLevels = fs.readdirSync(p, { withFileTypes: true });
            for (const d2 of secondLevels) {
                if (!d2.isDirectory()) continue;
                const p2 = path.join(p, d2.name);
                const imgs2 = fs.readdirSync(p2).filter(f => imageExtensions.has(path.extname(f).toLowerCase()));
                if (imgs2.length > 0) libraryEntries.push({ normalizedSubDir: normalizeText(d2.name), assetUrls: imgs2, topDir: dl.name });
            }
        }
    } catch (e) {}
}

const workbook = XLSX.readFile(workbookPath);
const hasRealImage: any[] = [];
const hasFallback: any[] = [];

for (const sheetName of workbook.SheetNames) {
    const sheet = workbook.Sheets[sheetName];
    const rows: any[] = XLSX.utils.sheet_to_json(sheet, {header: 1});
    if (rows.length < 2) continue;
    const headers = rows[0].map((h: any) => normalizeText(h));
    const dataRows = rows.slice(1);

    for (const rawRow of dataRows) {
        const row: any = {};
        headers.forEach((h: string, i: number) => { row[h] = rawRow[i]; });
        const name = row['ten_quan'] || row['ten_dia_diem'] || row['ten'];
        if (!name) continue;
        const address = row['dia_chi'] || '';
        const item = { sheet: sheetName, name, address };

        const manualMatch = mapping.mappings.find((m: any) => normalizeText(m.name) === normalizeText(name));
        if (manualMatch && manualMatch.imagePath) {
            hasRealImage.push({ ...item, type: 'THỦ CÔNG', path: manualMatch.imagePath });
            continue;
        }

        const bestAuto = libraryEntries
            .map(e => ({ e, score: scoreImageLibraryMatch(normalizeText(sheetName), name, address, e) }))
            .sort((a, b) => b.score - a.score)[0];

        if (bestAuto && bestAuto.score >= 55) {
            hasRealImage.push({ ...item, type: 'TỰ ĐỘNG', path: bestAuto.e.topDir + '/' + bestAuto.e.normalizedSubDir });
            continue;
        }
        hasFallback.push(item);
    }
}

let md = `# BÁO CÁO TÌNH TRẠNG ẢNH\n\n`;
md += `## TỔNG QUAN\n`;
md += `- **Tổng số toàn bộ địa điểm**: ${hasRealImage.length + hasFallback.length}\n`;
md += `- **Số địa điểm ĐÃ CÓ ẢNH thực tế**: ${hasRealImage.length}\n`;
md += `- **Số địa điểm CHƯA CÓ ẢNH (Dùng minh họa)**: ${hasFallback.length}\n\n`;

md += `## 1. DANH SÁCH ĐỊA ĐIỂM ĐÃ CÓ ẢNH THỰC TẾ (${hasRealImage.length})\n`;
md += `| Nhóm | Tên địa điểm | Loại Map | Chi tiết ảnh |\n`;
md += `| :--- | :--- | :--- | :--- |\n`;
hasRealImage.forEach(x => {
    md += `| ${x.sheet} | ${x.name} | ${x.type} | ${x.path} |\n`;
});

md += `\n## 2. DANH SÁCH ĐỊA ĐIỂM CHƯA CÓ ẢNH - DÙNG MINH HỌA (${hasFallback.length})\n`;
md += `| Nhóm | Tên địa điểm | Địa chỉ |\n`;
md += `| :--- | :--- | :--- |\n`;
hasFallback.forEach(x => {
    md += `| ${x.sheet} | ${x.name} | ${x.address} |\n`;
});

fs.mkdirSync(reportsRoot, { recursive: true });
fs.writeFileSync(reportPath, md);
console.log(`Đã tạo báo cáo tại: ${reportPath}`);
