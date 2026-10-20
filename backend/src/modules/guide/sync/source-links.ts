// ─── Link nguồn theo từng máy ────────────────────────────────────────────────
// Code và bản phát hành không chứa link Google Sheet/Docs. Mỗi máy giữ link của
// nguồn dựng sẵn trong <data>/source-links.json. Lần đầu chạy bản này, máy đang
// dùng tự khôi phục link từ bản phát hành cũ còn trên đĩa, biến môi trường và dữ
// liệu đã đồng bộ; máy mới (không có gì) bắt đầu với 0 nguồn.
import * as fs from 'node:fs';
import * as path from 'node:path';
import { resolveBackendDataDir, resolveBackendRoot } from '../../../config';
import { BUILTIN_SOURCES, BUILTIN_SOURCE_IDS, DESTINATIONS, ensureSourceRegistry, markSourceRegistryLoaded, registerBuiltinSource } from './destination-config';

export type HookDocKey = 'spotlight' | 'sections';
export interface SourceLinks { sheetUrl: string; exportUrl: string }
export interface SourceLinksFile {
  version: 1;
  /** Chỉ các nguồn dựng sẵn có trên máy này; link rỗng = chỉ dùng XLSX cục bộ. */
  builtins: Record<string, SourceLinks>;
  hookDocs: Partial<Record<HookDocKey, string>>;
  createdAt: string;
  recoveredFrom?: string[];
}

export const SOURCE_LINKS_FILE = 'source-links.json';
const GOOGLE_ID = /^[A-Za-z0-9_-]{20,}$/;
let hookDocs: Partial<Record<HookDocKey, string>> = {};

export function hookDocId(key: HookDocKey): string {
  ensureSourceRegistry();
  return hookDocs[key] || '';
}

export function sheetLinksFromId(sheetId: string, sheetUrl = ''): SourceLinks {
  return {
    sheetUrl: sheetUrl || `https://docs.google.com/spreadsheets/d/${sheetId}/edit`,
    exportUrl: `https://docs.google.com/spreadsheets/d/${sheetId}/export?format=xlsx`,
  };
}

function sheetIdOf(value: unknown): string {
  return String(value || '').match(/\/spreadsheets\/d\/([A-Za-z0-9_-]{20,})/)?.[1] || '';
}

function readText(file: string): string {
  try { return fs.readFileSync(file, 'utf8'); } catch { return ''; }
}

function readJson(file: string): Record<string, unknown> | null {
  try { return JSON.parse(fs.readFileSync(file, 'utf8').replace(/^﻿/, '')); } catch { return null; }
}

function versionKey(name: string): number[] {
  return (name.match(/^(\d+)\.(\d+)\.(\d+)/) || []).slice(1).map(Number);
}

/** Thư mục bản phát hành cũ (mới nhất trước) quanh thư mục dữ liệu/code đang chạy. */
function releaseCodeRoots(startDirs: string[]): string[] {
  const seen = new Set<string>(), roots: string[] = [];
  for (const start of startDirs) {
    let dir = start;
    for (let depth = 0; depth < 5 && dir; depth += 1) {
      const releases = path.join(dir, 'releases');
      if (!seen.has(releases) && fs.existsSync(releases)) {
        seen.add(releases);
        const names = fs.readdirSync(releases, { withFileTypes: true }).filter(e => e.isDirectory()).map(e => e.name)
          .sort((a, b) => { const x = versionKey(b), y = versionKey(a); for (let i = 0; i < 3; i += 1) if ((x[i] || 0) !== (y[i] || 0)) return (x[i] || 0) - (y[i] || 0); return b.localeCompare(a); });
        roots.push(...names.map(name => path.join(releases, name)));
      }
      const parent = path.dirname(dir);
      if (parent === dir) break;
      dir = parent;
    }
  }
  return roots;
}

/** Đọc link từ code của bản phát hành cũ (trước khi link được đưa ra khỏi code). */
function linksFromReleaseCode(root: string): { builtins: Record<string, SourceLinks>; hookDocs: Partial<Record<HookDocKey, string>> } {
  const guide = path.join(root, 'backend', 'src', 'modules', 'guide');
  const config = readText(path.join(guide, 'sync', 'destination-config.ts'));
  const builtins: Record<string, SourceLinks> = {};
  const literalUrls = (key: string) => {
    const at = config.search(new RegExp(`^\\s*${key}:\\s*\\{`, 'm'));
    if (at < 0) return null;
    const block = config.slice(at, at + 1200).split(/\n\s*\},?\s*\n/)[0];
    const sheetUrl = block.match(/'(https:\/\/docs\.google\.com\/spreadsheets\/d\/[A-Za-z0-9_-]{20,}\/edit[^']*)'/)?.[1] || '';
    const id = sheetIdOf(sheetUrl);
    return id ? sheetLinksFromId(id, sheetUrl) : null;
  };
  const constant = (name: string, text: string) => {
    const value = text.match(new RegExp(`\\b${name}\\s*=\\s*'([^']+)'`))?.[1] || '';
    return GOOGLE_ID.test(value) ? value : '';
  };
  for (const id of ['dalat', 'greenland']) { const links = literalUrls(id); if (links) builtins[id] = links; }
  const testId = constant('DALAT_TEST_SHEET_ID', config), threadsId = constant('DALAT_THREADS_SHEET_ID', config);
  if (testId) builtins['dalat-test'] = sheetLinksFromId(testId);
  if (threadsId) builtins['dalat-threads'] = sheetLinksFromId(threadsId);
  const spotlight = constant('DEFAULT_DOC_ID', readText(path.join(guide, 'sync', 'spotlight-hook-source.ts')));
  const sections = constant('HOOK_DOC_ID', readText(path.join(guide, 'guide.service.ts')));
  return { builtins, hookDocs: { ...(spotlight ? { spotlight } : {}), ...(sections ? { sections } : {}) } };
}

function hasLocalData(dataRoot: string, toolRoot: string, id: string): boolean {
  const bundled = BUILTIN_SOURCES[id]?.bundledWorkbookFile;
  return fs.existsSync(path.join(dataRoot, `workbook-cache.${id}.xlsx`))
    || fs.existsSync(path.join(dataRoot, 'source-snapshots', id, 'current.json'))
    || fs.existsSync(path.join(dataRoot, `generated-caption-lists.${id}.json`))
    || (id === 'dalat' && fs.existsSync(path.join(dataRoot, 'generated-caption-lists.json')))
    || Boolean(bundled && fs.existsSync(path.join(toolRoot, 'resources', 'workbooks', bundled)));
}

/** Khôi phục một lần cho máy đang dùng; máy mới không có dấu vết nào nên nhận cấu hình rỗng. */
export function recoverSourceLinks(dataRoot: string, toolRoot: string, env: NodeJS.ProcessEnv = process.env): SourceLinksFile {
  const builtins: Record<string, SourceLinks> = {};
  const docs: Partial<Record<HookDocKey, string>> = {};
  const recoveredFrom = new Set<string>();
  // 1) Biến môi trường riêng của máy.
  const envLinks: Record<string, [string | undefined, string | undefined]> = {
    dalat: [env.DALAT_FNB_SHEET_URL, env.DALAT_FNB_EXPORT_URL],
    greenland: [env.GREEN_LAND_FNB_SHEET_URL, env.GREEN_LAND_FNB_EXPORT_URL],
  };
  for (const [id, [sheetUrl, exportUrl]] of Object.entries(envLinks)) {
    const sheetId = sheetIdOf(sheetUrl) || sheetIdOf(exportUrl);
    if (!sheetId) continue;
    builtins[id] = { ...sheetLinksFromId(sheetId, sheetIdOf(sheetUrl) ? String(sheetUrl) : ''), ...(exportUrl ? { exportUrl: String(exportUrl) } : {}) };
    recoveredFrom.add('env');
  }
  if (GOOGLE_ID.test(String(env.SPOTLIGHT_V3_HOOK_DOC_ID || ''))) { docs.spotlight = String(env.SPOTLIGHT_V3_HOOK_DOC_ID); recoveredFrom.add('env'); }
  // 2) Code của bản phát hành cũ còn trên đĩa (mới nhất trước).
  for (const root of releaseCodeRoots([dataRoot, toolRoot])) {
    const found = linksFromReleaseCode(root);
    for (const [id, links] of Object.entries(found.builtins)) if (!builtins[id]) { builtins[id] = links; recoveredFrom.add(`release:${path.basename(root)}`); }
    for (const [key, value] of Object.entries(found.hookDocs) as Array<[HookDocKey, string]>) if (!docs[key]) { docs[key] = value; recoveredFrom.add(`release:${path.basename(root)}`); }
  }
  // 3) Dữ liệu đã đồng bộ: bản chụp nguồn và cache hook ghi lại link đã dùng.
  for (const id of BUILTIN_SOURCE_IDS) {
    if (builtins[id]) continue;
    const sheetId = sheetIdOf(readJson(path.join(dataRoot, 'source-snapshots', id, 'current.json'))?.sourceUrl);
    if (sheetId) { builtins[id] = sheetLinksFromId(sheetId); recoveredFrom.add('snapshot'); }
  }
  for (const [key, file] of [['spotlight', 'spotlight-v3-hooks.json'], ['sections', 'hook-1-hooks.json']] as const) {
    const docId = String(readJson(path.join(dataRoot, file))?.docId || '');
    if (!docs[key] && GOOGLE_ID.test(docId)) { docs[key] = docId; recoveredFrom.add('hook-cache'); }
  }
  // Nguồn dựng sẵn chỉ xuất hiện khi máy có link hoặc dữ liệu của nó.
  for (const id of BUILTIN_SOURCE_IDS) {
    if (!builtins[id] && hasLocalData(dataRoot, toolRoot, id)) builtins[id] = { sheetUrl: '', exportUrl: '' };
  }
  const ordered: Record<string, SourceLinks> = {};
  for (const id of BUILTIN_SOURCE_IDS) if (builtins[id]) ordered[id] = builtins[id];
  return { version: 1, builtins: ordered, hookDocs: docs, createdAt: new Date().toISOString(), recoveredFrom: [...recoveredFrom] };
}

export function readSourceLinks(dataRoot: string): SourceLinksFile | null {
  const parsed = readJson(path.join(dataRoot, SOURCE_LINKS_FILE)) as Partial<SourceLinksFile> | null;
  if (!parsed || typeof parsed.builtins !== 'object' || !parsed.builtins) return null;
  const builtins: Record<string, SourceLinks> = {};
  for (const id of BUILTIN_SOURCE_IDS) {
    const entry = (parsed.builtins as Record<string, Partial<SourceLinks>>)[id];
    if (entry && typeof entry === 'object') builtins[id] = { sheetUrl: String(entry.sheetUrl || ''), exportUrl: String(entry.exportUrl || '') };
  }
  const docs: Partial<Record<HookDocKey, string>> = {};
  for (const key of ['spotlight', 'sections'] as const) {
    const value = String((parsed.hookDocs as Record<string, unknown> | undefined)?.[key] || '');
    if (GOOGLE_ID.test(value)) docs[key] = value;
  }
  return { version: 1, builtins, hookDocs: docs, createdAt: String(parsed.createdAt || ''), ...(Array.isArray(parsed.recoveredFrom) ? { recoveredFrom: parsed.recoveredFrom.map(String) } : {}) };
}

export function writeSourceLinks(dataRoot: string, value: SourceLinksFile): void {
  fs.mkdirSync(dataRoot, { recursive: true });
  const file = path.join(dataRoot, SOURCE_LINKS_FILE), temp = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(temp, JSON.stringify(value, null, 2), 'utf-8');
  fs.renameSync(temp, file);
}

/** Đăng ký nguồn dựng sẵn có trên máy và nạp mã Google Docs của hook. */
export function applySourceLinks(dataRoot: string, toolRoot: string): SourceLinksFile {
  markSourceRegistryLoaded();
  let value = readSourceLinks(dataRoot);
  if (!value) {
    value = recoverSourceLinks(dataRoot, toolRoot);
    try {
      writeSourceLinks(dataRoot, value);
      console.log(`[source-links] Đã tạo cấu hình nguồn của máy: ${Object.keys(value.builtins).join(', ') || 'chưa có nguồn'}${value.recoveredFrom?.length ? ` (từ ${value.recoveredFrom.join(', ')})` : ''}.`);
    } catch (error) {
      console.warn('[source-links] Không ghi được cấu hình nguồn:', error instanceof Error ? error.message : error);
    }
  }
  for (const id of BUILTIN_SOURCE_IDS) {
    if (value.builtins[id]) registerBuiltinSource(id, value.builtins[id]);
    else delete DESTINATIONS[id];
  }
  hookDocs = { ...value.hookDocs };
  return value;
}

/** Nguồn của máy đang chạy (thư mục dữ liệu mặc định hoặc DALAT_DATA_DIR). */
export function loadMachineSources(): void {
  const toolRoot = resolveBackendRoot(__dirname);
  applySourceLinks(resolveBackendDataDir(toolRoot), toolRoot);
}

/** Ghi link mới cho nguồn dựng sẵn (người dùng sửa link trong Cài đặt). */
export function updateBuiltinSourceLinks(dataRoot: string, toolRoot: string, id: string, links: SourceLinks): void {
  const value = readSourceLinks(dataRoot) || recoverSourceLinks(dataRoot, toolRoot);
  value.builtins[id] = links;
  writeSourceLinks(dataRoot, value);
}
