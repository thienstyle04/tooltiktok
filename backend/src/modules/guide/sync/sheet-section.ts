import { SECTION_CONFIG } from '../../../common/constants/guide.constants';
import { SectionKey } from '../../../common/interfaces/guide.types';
import { normalizeText } from '../logic/image-resolver';

const SHEET_SECTION_ALIASES: Record<string, SectionKey> = {
  luu_tru: 'homestay',
};

export function resolveSectionKeyFromSheetName(sheetName: string): SectionKey | null {
  const normalized = normalizeText(sheetName);
  const sectionKey = (SHEET_SECTION_ALIASES[normalized] ?? normalized) as SectionKey;
  return sectionKey in SECTION_CONFIG ? sectionKey : null;
}
