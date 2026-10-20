export const COLOR_EDIT_PRESET = 'iphone-color-edit-v1';
export const COLOR_EDIT_SETTINGS = Object.freeze({ exposure: -20, brilliance: -15, highlights: 15,
  contrast: -4, brightness: -10, blackPoint: 8, sharpness: 15, definition: 18 });

export interface PhotoAdjustments {
  exposure?: number; brilliance?: number; highlights?: number; shadows?: number;
  contrast?: number; brightness?: number; blackPoint?: number; saturation?: number;
  warmth?: number; tint?: number; vibrance?: number; sharpness?: number; definition?: number;
}

// Values transcribed from the six supplied references, in attachment order.
// Unspecified sliders are neutral. Conversion is an approximation, not Apple's pipeline.
export const REFERENCE_PHOTO_PRESETS = [
  { id: 'photo-ref-01-food-bright-v1', label: '01 · Món ăn sáng nét', description: 'Sáng, ấm, nổi màu món ăn',
    settings: { exposure: 4, brightness: 53, highlights: -35, shadows: 36, brilliance: 20, contrast: 17, blackPoint: -15, saturation: 11, warmth: 13, sharpness: 77 } },
  { id: 'photo-ref-02-garden-green-v1', label: '02 · Vườn xanh dịu', description: 'Vườn cây, ngoài trời, xanh dịu',
    settings: { exposure: -30, brilliance: -6, highlights: 15, shadows: 10, sharpness: 50, contrast: 8, brightness: 32, blackPoint: -6, saturation: 4, tint: 20 } },
  { id: 'photo-ref-03-food-deep-v1', label: '03 · Món ăn trầm', description: 'Tông trầm, tương phản rõ, giữ chi tiết',
    settings: { exposure: -5, brilliance: -25, highlights: -10, contrast: 15, blackPoint: 3, sharpness: 25, definition: 5 } },
  { id: 'photo-ref-04-cafe-sunlit-v1', label: '04 · Cà phê nắng', description: 'Không gian cà phê sáng, màu nổi',
    settings: { exposure: 9, brilliance: 100, highlights: -42, shadows: 22, contrast: 21, brightness: -16, saturation: 26, warmth: -18 } },
  { id: 'photo-ref-05-vintage-deep-v1', label: '05 · Vintage trầm', description: 'Giảm màu, tương phản đậm, nét rõ',
    settings: { exposure: -23, brilliance: -48, highlights: 34, shadows: -16, contrast: 30, blackPoint: 10, saturation: -25, warmth: -10, sharpness: 35, definition: 45 } },
  { id: 'photo-ref-06-courtyard-calm-v1', label: '06 · Sân vườn dịu', description: 'Cảnh sân vườn dịu, giảm độ rực',
    settings: { exposure: -15, vibrance: -15, contrast: 10, brightness: -5, blackPoint: 7, saturation: -10 } },
] as const;

export type PhotoPresetId = typeof COLOR_EDIT_PRESET | typeof REFERENCE_PHOTO_PRESETS[number]['id'];
export function photoPresetSettings(id: string): PhotoAdjustments | undefined {
  return id === COLOR_EDIT_PRESET ? COLOR_EDIT_SETTINGS : REFERENCE_PHOTO_PRESETS.find(p => p.id === id)?.settings;
}
