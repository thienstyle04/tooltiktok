// Optional, machine-local extensions. No private template or remote executable
// code is bundled in the application. Only a trusted local builder may run.
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import * as crypto from 'node:crypto';
import sharp from 'sharp';
import type { GuideDeck, GuideDeckList, WorkbookItemsBySection, PartnerRotationHistory } from '../../common/interfaces/guide.types';

export interface LocalTemplateManifest {
  id: string; version: number; name: string; description: string;
  allowedSourceIds: string[]; builder: string; assets: string[];
  pageCount?: number; previewAsset?: string;
}
export interface LocalTemplateBuildInput {
  sourceId: string; itemsBySection: WorkbookItemsBySection; seed: string;
  state: Record<string, unknown>; history: PartnerRotationHistory;
  /** Verified background photos from the active source, never another workbook. */
  coverImages: Array<{ id: string; url: string }>;
  savedCoverImageIds: string[];
  /** Read-only copy of this template's saved lists, oldest first, so a builder
   * can rebuild its own content rotation when no state was stored yet. */
  savedLists?: GuideDeckList[];
  /** Read-only snapshot of the main list with its saved page edits applied. */
  mainList?: GuideDeckList;
  assetUrl: (name: string) => string;
}
export interface LocalTemplateBuildResult {
  list: GuideDeckList; state: Record<string, unknown>;
}
type LocalBuilder = {
  build(input: LocalTemplateBuildInput): LocalTemplateBuildResult;
  /** Stable sample snapshot; reading it must not allocate data or consume cycles. */
  mainList?(): GuideDeckList | undefined;
  sync?(input: { fetch: (input: string, init?: RequestInit) => Promise<Response>; readWorkbook: (body: Buffer) => Record<string, unknown[][]> }): Promise<unknown>;
  status?(): Record<string, unknown>;
};
const safeId = (s: string) => /^local-[a-z0-9-]{1,80}$/.test(s);
const safeFile = (s: string) => /^[a-zA-Z0-9][a-zA-Z0-9_.-]{0,160}$/.test(s);
export function localTemplatesRoot(): string {
  return path.resolve(process.env.DALAT_LOCAL_TEMPLATES_DIR || path.join(process.env.LOCALAPPDATA || path.join(os.homedir(), 'AppData', 'Local'), 'DalatTikTokCarouselTool', 'local-templates'));
}
function inside(root: string, file: string): string {
  const realRoot = fs.realpathSync(root), realFile = fs.realpathSync(file);
  const relative = path.relative(realRoot, realFile);
  if (!relative || relative.startsWith('..') || path.isAbsolute(relative)) throw new Error('Tài nguyên mẫu local nằm ngoài thư mục cho phép.');
  return realFile;
}
export function listLocalTemplates(): LocalTemplateManifest[] {
  const root = localTemplatesRoot();
  if (!fs.existsSync(root)) return [];
  const manifests: LocalTemplateManifest[] = [];
  for (const directory of fs.readdirSync(root, { withFileTypes: true })) {
    if (!directory.isDirectory() || !safeId(directory.name)) continue;
    try {
      const file = inside(root, path.join(root, directory.name, 'template.json'));
      const m = JSON.parse(fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, '')) as LocalTemplateManifest;
      if (m.id !== directory.name || !safeId(m.id) || !Number.isInteger(m.version) || m.version < 1
        || typeof m.name !== 'string' || !m.name.trim() || typeof m.description !== 'string'
        || !Array.isArray(m.allowedSourceIds) || !m.allowedSourceIds.every(s => typeof s === 'string')
        || !safeFile(m.builder) || !m.builder.endsWith('.cjs')
        || !Array.isArray(m.assets) || !m.assets.every(s => typeof s === 'string' && safeFile(s))
        || (m.pageCount !== undefined && (!Number.isInteger(m.pageCount) || m.pageCount < 1 || m.pageCount > 100))
        || (m.previewAsset !== undefined && !m.assets.includes(m.previewAsset))) throw new Error('Manifest không hợp lệ.');
      manifests.push(m);
    } catch (error) { console.warn(`[local-template] ${directory.name}: ${error instanceof Error ? error.message : error}`); }
  }
  return manifests;
}
export function findLocalTemplate(id: string): LocalTemplateManifest | undefined {
  return listLocalTemplates().find(m => m.id === id);
}
export function localTemplateAllowedIds(sourceId: string): string[] {
  return listLocalTemplates().filter(m => m.allowedSourceIds.includes(sourceId)).map(m => m.id);
}
export function localTemplateDecks(sourceId: string): GuideDeck[] {
  return listLocalTemplates().filter(m => m.allowedSourceIds.includes(sourceId)).map(m => {
    const builder = localTemplateBuilder(m);
    const sample = builder.mainList?.();
    if (sample && (!Array.isArray(sample.pages) || !sample.pages.length || (m.pageCount && sample.pages.length !== m.pageCount)
      || sample.pages.some(page => page.localRender?.templateId !== m.id || page.localRender.version !== m.version))) {
      throw new Error(`${m.name}: List chính local không đúng phiên bản hoặc số trang.`);
    }
    return {
      id: m.id, navTitle: m.name, title: m.name, description: m.description,
      lists: sample ? [{ ...JSON.parse(JSON.stringify(sample)), id: `${m.id}-main`, navTitle: 'List chính' }] : [],
      localTemplate: { version: m.version, automaticContent: true, pageCount: m.pageCount,
        previewImageUrl: m.previewAsset ? localTemplateAssetUrl(m, m.previewAsset) : undefined,
        status: builder.status?.() || {} },
    };
  });
}
export function localTemplateBuilder(m: LocalTemplateManifest): LocalBuilder {
  const root = path.join(localTemplatesRoot(), m.id);
  const filename = inside(root, path.join(root, m.builder));
  // Builder modules are installed locally by the owner, never read from Sheet.
  const builder = require(filename) as LocalBuilder;
  if (typeof builder.build !== 'function') throw new Error(`${m.name}: thiếu builder local.`);
  return builder;
}
export function localTemplateAsset(id: string, version: number, filename: string): { body: Buffer; type: string } {
  const m = findLocalTemplate(id);
  if (!m || m.version !== version || !safeFile(filename) || !m.assets.includes(filename)) throw new Error('Không tìm thấy tài nguyên mẫu local/phiên bản đã lưu.');
  const root = path.join(localTemplatesRoot(), id, 'assets');
  const file = inside(root, path.join(root, filename));
  const types: Record<string, string> = { '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.woff': 'font/woff', '.ttf': 'font/ttf' };
  const type = types[path.extname(filename).toLowerCase()];
  if (!type) throw new Error('Loại tài nguyên local không được hỗ trợ.');
  const body = fs.readFileSync(file);
  // Some design exports keep the original suffix after converting the bytes.
  const actualType = body.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10])) ? 'image/png'
    : body[0] === 255 && body[1] === 216 ? 'image/jpeg'
    : body.subarray(0,4).toString() === 'RIFF' && body.subarray(8,12).toString() === 'WEBP' ? 'image/webp' : type;
  return { body, type: actualType };
}
export function localTemplateAssetUrl(m: LocalTemplateManifest, filename: string): string {
  if (!m.assets.includes(filename)) throw new Error(`Tài nguyên chưa đăng ký: ${filename}`);
  return `/api/local-templates/${m.id}/${m.version}/assets/${filename}`;
}

const validatedResources = new Set<string>();
export async function validateLocalTemplateResources(list: GuideDeckList): Promise<void> {
  const urls = new Set<string>();
  for (const page of list.pages) {
    if (!page.localRender) throw new Error('List local thiếu mô hình render; chưa lưu list.');
    for (const font of page.localRender.fonts) urls.add(font.url);
    if (page.backgroundImage.startsWith('/api/local-templates/')) urls.add(page.backgroundImage);
    for (const node of page.localRender.nodes) if (node.src) urls.add(node.src);
    if (page.type === 'list') for (const item of page.items) if (item.imageUrl.startsWith('/api/local-templates/')) urls.add(item.imageUrl);
  }
  for (const url of urls) {
    const match = /^\/api\/local-templates\/(local-[a-z0-9-]+)\/(\d+)\/assets\/([\w.-]+)$/.exec(url);
    if (!match) throw new Error('Đường dẫn tài nguyên mẫu local không hợp lệ.');
    let resource: ReturnType<typeof localTemplateAsset>;
    try { resource = localTemplateAsset(match[1], Number(match[2]), match[3]); }
    catch { throw new Error(`Mẫu local: thiếu tài nguyên ${match[3]}; không dùng ảnh/font thay thế.`); }
    const key = crypto.createHash('sha256').update(resource.body).digest('hex');
    if (validatedResources.has(key)) continue;
    if (resource.type.startsWith('font/')) {
      if (resource.body.length < 48 || resource.body.subarray(0, 4).toString() !== 'wOF2' || resource.body.readUInt32BE(8) !== resource.body.length) throw new Error(`Mẫu local: font ${match[3]} bị hỏng/ghi dở.`);
    } else {
      try { await sharp(resource.body, { failOn: 'warning' }).stats(); }
      catch { throw new Error(`Mẫu local: ảnh ${match[3]} bị hỏng/ghi dở. Hãy khôi phục tài nguyên trước khi tạo list.`); }
    }
    validatedResources.add(key);
    if (validatedResources.size > 500) validatedResources.clear();
  }
}
