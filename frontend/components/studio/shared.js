'use client';
// Hằng và hàm phụ dùng chung của DeckStudio: nguồn dữ liệu dự phòng, đọc lỗi API.

export const GENERIC_CAPTION_BODY = 'Lưu list này để có lịch đi Đà Lạt gọn hơn, dễ chọn điểm theo buổi và đỡ mất thời gian mò từng nơi.';
export const SPOTLIGHT_PARTNER_DECK_ID = 'spotlight-partner';
// Không còn nguồn dựng sẵn ở giao diện: danh sách nguồn luôn lấy từ máy (máy mới có 0 nguồn).
export const BUILTIN_DESTINATION_FALLBACKS = [];

export function mergeDestinations(...lists) {
  const merged = new Map();
  for (const list of lists) {
    for (const entry of list || []) {
      if (!entry?.id) continue;
      merged.set(entry.id, { ...(merged.get(entry.id) || {}), ...entry });
    }
  }
  return [...merged.values()];
}

export async function readApiPayload(response) {
  const text = await response.text();
  if (!text) return {};
  try {
    return JSON.parse(text);
  } catch {
    return { message: text };
  }
}

export function apiErrorMessage(payload, fallback) {
  if (payload?.message) return payload.message;
  if (payload?.detail) return payload.detail;
  return fallback;
}
