'use client';
// DeckStudio: chặn tên địa điểm và danh sách điểm dừng trong caption người dùng nhập.
import { GENERIC_CAPTION_BODY } from './shared';

function stripVietnameseMarks(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D');
}

function normalizeCaptionNameKey(value) {
  return stripVietnameseMarks(value).toLowerCase();
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function collectCaptionForbiddenNames(list) {
  const names = new Map();
  const addName = (value) => {
    const name = String(value || '').replace(/\s+/g, ' ').trim();
    if (name.length < 3) return;
    names.set(normalizeCaptionNameKey(name), name);
  };

  for (const page of list?.pages || []) {
    if (page.type !== 'list') continue;
    for (const item of page.items || []) {
      addName(item.rawName);
      addName(item.name);
      addName(String(item.name || '').split(/:\s*/).slice(1).join(': '));
    }
  }

  return [...names.values()].sort((a, b) => b.length - a.length);
}

function getPlaceNameCandidates(name) {
  const normalized = String(name || '').replace(/\s+/g, ' ').trim();
  const unaccented = stripVietnameseMarks(normalized);
  return [...new Set([normalized, unaccented].filter((value) => value.length >= 3))];
}

function hasForbiddenPlaceName(value, forbiddenPlaceNames) {
  return forbiddenPlaceNames.some((name) => getPlaceNameCandidates(name).some((candidate) => {
    const escaped = escapeRegExp(candidate).replace(/\s+/g, '\\s+');
    return new RegExp(`(^|[^\\p{L}\\p{N}])${escaped}(?=$|[^\\p{L}\\p{N}])`, 'iu').test(value);
  }));
}

function bodyListsStops(value, forbiddenPlaceNames) {
  if (hasForbiddenPlaceName(value, forbiddenPlaceNames)) return true;

  const dayMarkers = value.match(/\b(?:ngày\s*(?:đầu|một|hai|ba|bốn|1|2|3|4)|sáng|trưa|chiều|tối)\b/giu) || [];
  const stopVerbs = value.match(/\b(?:ghé|qua|đi|lượn|chạy|săn|ăn|uống|check-?in|chụp)\b/giu) || [];
  return dayMarkers.length >= 2 && stopVerbs.length >= 2;
}

export function sanitizeCaptionBody(body, list) {
  const clean = String(body || '').replace(/\s+/g, ' ').trim();
  if (!clean) return '';

  const forbiddenPlaceNames = collectCaptionForbiddenNames(list);
  return bodyListsStops(clean, forbiddenPlaceNames) ? GENERIC_CAPTION_BODY : clean;
}
