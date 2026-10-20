// ─── Đối tác bắt buộc khi tạo list ──────────────────────────────────────────
// Người dùng chọn đối tác (theo tên) phải có mặt trong MỌI list tạo ra. Builder
// của từng mẫu vẫn giữ luật nhóm/quota riêng; module này chỉ cho biết đối tác
// nào cần được ưu tiên tuyệt đối, và GuideService kiểm tra lại list đã dựng.
import { BadRequestException } from '@nestjs/common';
import type { GuideItem, WorkbookItemsBySection } from '../../../common/interfaces/guide.types';
import { normalizeText } from './image-resolver';

export const MAX_REQUIRED_PARTNERS = 12;

/** Same identity as partner rotation and XLSX: a venue is its normalized name. */
export function requiredPartnerKey(name: unknown): string {
  const normalized = normalizeText(String(name ?? '').replace(/^venue\|/, ''));
  return normalized ? `venue|${normalized}` : '';
}

/** Tên hiển thị đã làm sạch, giữ thứ tự chọn, bỏ trùng theo định danh. */
export function normalizeRequiredPartners(raw: unknown): string[] {
  if (raw === undefined || raw === null || raw === '') return [];
  if (!Array.isArray(raw)) throw new BadRequestException('Danh sách đối tác bắt buộc không hợp lệ.');
  const names = new Map<string, string>();
  for (const value of raw) {
    if (typeof value !== 'string') throw new BadRequestException('Danh sách đối tác bắt buộc không hợp lệ.');
    const name = value.trim().slice(0, 200), key = requiredPartnerKey(name);
    if (key && !names.has(key)) names.set(key, name);
  }
  if (names.size > MAX_REQUIRED_PARTNERS) throw new BadRequestException(`Chỉ chọn tối đa ${MAX_REQUIRED_PARTNERS} đối tác bắt buộc cho một mẫu.`);
  return [...names.values()];
}

export class RequiredPartnersError extends BadRequestException {}

/** Đối tác nào hiển thị được trong một mẫu (chạy thử builder, không lưu gì). */
export interface PartnerEligibilityResponse {
  deckId: string;
  /** Mẫu không dựng được ngay cả khi thử (thiếu dữ liệu chung), nếu có. */
  error?: string;
  partners: Array<{ name: string; sections: string[]; eligible: boolean; reason?: string }>;
}

let active: Set<string> | null = null;

/** Builder context, set only around a synchronous build (like the hook context). */
export function setRequiredPartnerContext(names: string[]): void {
  active = names.length ? new Set(names.map(requiredPartnerKey).filter(Boolean)) : null;
}

export function clearRequiredPartnerContext(): void {
  active = null;
}

/**
 * Runs a synchronous build with a temporary selection and restores the previous
 * one afterwards, so a dry run never disturbs a generation that is awaiting I/O.
 */
export function withRequiredPartners<T>(names: string[], run: () => T, options: { dryRun?: boolean } = {}): T {
  const previous = active, previousDryRun = dryRun;
  setRequiredPartnerContext(names);
  dryRun = Boolean(options.dryRun);
  try { return run(); } finally { active = previous; dryRun = previousDryRun; }
}

let dryRun = false;

/** Step limit for exhaustive builder searches: only with a selection or in a dry run. */
export function requiredSearchBudget(): number {
  // A dry run only needs a quick verdict; a real creation may search longer.
  return dryRun ? 20_000 : active ? 200_000 : Infinity;
}

/** Identity keys of the current selection (empty when nothing is required). */
export function requiredPartnerKeys(): string[] {
  return active ? [...active] : [];
}

/** True only while the user required at least one partner; otherwise builders behave as before. */
export function hasRequiredPartners(): boolean {
  return Boolean(active);
}

export function isRequiredPartner(item: Pick<GuideItem, 'isPartner' | 'name'> | null | undefined): boolean {
  return Boolean(active && item?.isPartner && active.has(requiredPartnerKey(item.name)));
}

/** 0 for a required partner, 1 otherwise: use as the FIRST key of a partner sort. */
export function requiredPartnerRank(item: Pick<GuideItem, 'isPartner' | 'name'> | null | undefined): number {
  return isRequiredPartner(item) ? 0 : 1;
}

/** Stable reorder that moves required partners to the front, keeping the rest. */
export function requiredPartnersFirst<T extends Pick<GuideItem, 'isPartner' | 'name'>>(items: T[]): T[] {
  if (!active) return items;
  return [...items.filter(item => isRequiredPartner(item)), ...items.filter(item => !isRequiredPartner(item))];
}

/** True when every required partner is among the chosen items (or none is required). */
export function requiredPartnersSatisfied(items: Array<Pick<GuideItem, 'isPartner' | 'name'>>): boolean {
  if (!active) return true;
  const chosen = new Set(items.filter(item => item?.isPartner).map(item => requiredPartnerKey(item.name)));
  return [...active].every(key => chosen.has(key));
}

export function partnerItemsByName(itemsBySection: WorkbookItemsBySection, names: string[]): Map<string, GuideItem[]> {
  const byKey = new Map(names.map(name => [requiredPartnerKey(name), name] as const));
  const found = new Map<string, GuideItem[]>(names.map(name => [name, []]));
  for (const item of Object.values(itemsBySection).flat()) {
    const name = item?.isPartner ? byKey.get(requiredPartnerKey(item.name)) : undefined;
    if (name) found.get(name)!.push(item);
  }
  return found;
}

/** Required names not visible in the rendered partner names of a list. */
export function missingRequiredPartners(renderedNames: string[], names: string[]): string[] {
  const rendered = new Set(renderedNames.map(requiredPartnerKey));
  return names.filter(name => !rendered.has(requiredPartnerKey(name)));
}
