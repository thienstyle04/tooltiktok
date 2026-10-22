// Ảnh bị góp ý "thay ảnh bìa" (Sheet góp ý 2026-10-22): không chọn làm bìa cho đúng mẫu đó; ảnh vẫn dùng ở chỗ khác.
// Loạt ảnh chữ "Đà Lạt" sơn trên mặt đường trong tab Hình nền (11 ảnh): lạc trong mọi bìa ghép 4 ảnh
// (spotlightv2 bị góp ý; grid8feed và 4n3d stack dùng cùng kiểu bìa). Bìa Đường một chiều vẫn dùng vì hợp chủ đề.
const STENCIL_PHOTOS = [
  '1XYQKjPEoVl1O3MVfiTEsSVSNlfNrjMKt', '1yqJouyB42WgsyXnDEvQ6cUPHolw1v95j', '10Ju2eG_JtdzTt6L3F7s20dtEzxBHnti1',
  '1w2l9qqY2o5op0u51-47KqRSFuprrmX27', '1AY0uZBjSYJtxBIkOWKvg6wijJT0UNdst', '1PwSSN4WHhiGq2oIZzei7ssNwI55uVsWB',
  '1LCpQtrywT1oTBL8ncT4i-U7vImg3pPK6', '1GatOg5LdcyQZnHgsSDO1Vr5U3LNxoV_w', '16fAebDdDCezT8VgfZ5oZ2HlpBhvpPz0D',
  '16Idv26434sHvILpXL-aOf2f9fbgAUg0J', '1qqX03YZVG-sR63kzGMST8vBbimVI9MNI',
];
const COVER_EXCLUDED_FILE_IDS: Record<string, ReadonlySet<string>> = {
  'spotlight-v2': new Set(STENCIL_PHOTOS),
  'grid-8-feed': new Set(STENCIL_PHOTOS),
  'itinerary-4n3d-stack': new Set(STENCIL_PHOTOS),
  'itinerary-timeline': new Set(['1v4NilNh9fHy71qZTVlLeKwtUhAFUJp89']),
};

/** Kho ảnh bìa của mẫu sau khi bỏ ảnh bị góp ý; nếu bỏ hết thì giữ kho cũ để không làm hỏng mẫu. */
export function coverImagesForDeck(deckId: string, coverImageUrls: string[]): string[] {
  const excluded = COVER_EXCLUDED_FILE_IDS[deckId];
  if (!excluded) return coverImageUrls;
  const allowed = coverImageUrls.filter(url => !excluded.has(String(url || '').match(/[?&]id=([a-zA-Z0-9_-]+)/)?.[1] || ''));
  return allowed.length ? allowed : coverImageUrls;
}
