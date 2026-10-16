// ─── Caption AI và làm sạch chữ của list (hàm thuần) ─────────────────────────
// Hàm cần biết nguồn dữ liệu (để chọn chữ theo địa phương) nhận destinationId
// làm tham số đầu tiên; GuideService truyền nguồn đang chọn qua các hàm ủy quyền.
import { BadRequestException } from '@nestjs/common';
import type { DeckPage, DeepSeekCaptionResponse, GuideDeck, GuideDeckList, GuideItem, ListPage, PageItem } from '../../common/interfaces/guide.types';
import type { DestinationId } from './sync/destination-config';
import { buildCaptionHashtags, cityLabel, getDeckHashtagExtras, getMarketingCopy, localizeText, resolveDeckIdFromListId } from './sync/destination-localize';
import { finalizePov3V2Tagline, sanitizeDeckHeadline, truncateGrid8FeedCoverSubtitle } from './logic/deck-builder';
import { normalizeGrid8FeedPostCaption } from './logic/deck-builder-v2';
import { normalizeText, stableHash } from './logic/image-resolver';
import { isThreadsLocalDeck } from './logic/threads-food-local';
import { isTextNoteDeck } from './deck-kinds';
import { cloneJson } from './guide-file-io';
import { normalizeEditablePageMultilineText } from './page-text-overrides';

/** Cụm cover/caption mẫu — list mới không được dùng lại nguyên văn. */
export function bannedSampleCaptionPhrases(): string[] {
  return [
    'ĐÀ LẠT 8 ĐIỂM / 1 TRANG',
    'ĐÀ LẠT 8 ĐIỂM/1 TRANG',
    '8 ĐIỂM / 1 TRANG',
    '8 ĐIỂM/1 TRANG',
    '4N3Đ ĐÀ LẠT 8 ĐIỂM MỖI TRANG',
    '8 ĐIỂM MỖI TRANG',
    'LƯU LIỀN 4 NGÀY ĐÀ LẠT',
    'LƯU LIỀN 4 NGÀY',
    'ĐÀ LẠT GỌN TRONG TỪNG LIST',
    'ĐÀ LẠT GỌN TRONG 10 TRANG',
    'GỌN TRONG TỪNG LIST',
    'CẨM NANG ĐÀ LẠT GỌN NHẸ',
    'ĐÀ LẠT NHẸ NHÀNG ĐÁNG GHÉ',
    'NHẸ NHÀNG ĐÁNG GHÉ',
    'ĐÀ LẠT NHỮNG ĐIỂM KHÔNG THỂ BỎ LỠ',
    'NHỮNG ĐIỂM KHÔNG THỂ BỎ LỠ',
    'CHECK-IN ĐÀ LẠT ĐỪNG BỎ LỠ',
    'ĐÀ LẠT CÓ GÌ MÀ ĐI HOÀI',
    'ĐÀ LẠT – GÓC NHỎ ĐÁNG LƯU',
    'ĐÀ LẠT – CHILL TỪNG GÓC PHỐ',
    '4 NGÀY ĐÀ LẠT NHẸ NHÀNG',
    'Mẫu lưới dày để xem nhiều lựa chọn hơn trong một lần lướt.',
    'Mẫu lưới dày để xem nhiều lựa chọn hơn trong một lần lướt',
    'BỎ TÚI NGAY LIST NÀY RỦ BÉ BẠN XÁCH BA LÔ LÊN ĐÀ LẠT CHƠI LIỀN NÈ. CHIA THEO TỪNG LIST ĐỂ CHỌN NHANH, ĐỠ PHẢI LĂN TĂN.',
    'BỎ TÚI NGAY LIST NÀY RỦ BÉ BẠN XÁCH BA LÔ LÊN ĐÀ LẠT CHƠI LIỀN NÈ',
    'CHIA THEO TỪNG LIST ĐỂ CHỌN NHANH, ĐỠ PHẢI LĂN TĂN',
  ];
}

export function isBannedSampleCaptionText(value: string): boolean {
  const normalized = normalizeText(value);
  if (!normalized) return false;
  if (/8\s*diem\s*\/?\s*1\s*trang/i.test(normalized)) return true;
  if (/8\s*diem\s*moi\s*trang/i.test(normalized)) return true;
  if (/mau\s*luoi\s*day/i.test(normalized)) return true;
  if (/bo\s*tui\s*ngay\s*list\s*nay\s*ru\s*be\s*ban\s*xach\s*ba\s*lo/i.test(normalized)) return true;
  // Title máy móc kiểu "LƯU LIỀN 4 NGÀY ĐÀ LẠT"
  if (/^luu\s*(lien|ngay)\s*\d+\s*ngay(\s*da\s*lat)?$/i.test(normalized)) return true;
  if (/^luu\s*(lien|ngay)\s*(lich\s*trinh|board|list)/i.test(normalized)) return true;
  // Title meta về “list/trang” — kiểu "ĐÀ LẠT GỌN TRONG TỪNG LIST"
  if (/gon\s*trong\s*(tung\s*)?(list|trang|\d+\s*trang)/i.test(normalized)) return true;
  if (/trong\s*tung\s*list/i.test(normalized)) return true;
  if (/cam\s*nang\s*.*\bgon\b/i.test(normalized)) return true;
  if (/^da\s*lat\s+gon(\s|$)/i.test(normalized)) return true;
  if (/nhe\s*nhang\s*dang\s*ghe/i.test(normalized)) return true;
  return bannedSampleCaptionPhrases().some((phrase) => {
    const banned = normalizeText(phrase);
    return banned && (normalized === banned || normalized.includes(banned) || banned.includes(normalized));
  });
}

export function coverTitleMaxLen(deckId = ''): number {
  // Nới thêm ~20% so với giới hạn prompt yêu cầu AI nhắm tới (35/48) làm vùng đệm an toàn —
  // AI hay viết hơi dài hơn target, nới nhẹ giúp giảm tần suất phải cắt câu giữa chừng.
  if (deckId === 'grid-8' || deckId === 'grid-8-feed' || deckId === 'itinerary-4n2d-grid8') return 56;
  return 42;
}

/**
 * Cắt chuỗi về đúng maxLen nhưng lùi về ranh giới từ gần nhất (AI hay bỏ qua giới hạn ký tự,
 * nếu cắt cứng bằng slice() sẽ đứt ngang từ/dấu ngoặc giữa chừng, đọc rất kỳ trên trang cover thật).
 */
export function truncateCaptionText(value: string, maxLen: number): string {
  const clean = String(value || '').trim();
  if (clean.length <= maxLen) return clean;
  const hardCut = clean.slice(0, maxLen);
  const lastSpace = hardCut.lastIndexOf(' ');
  const safeCut = lastSpace >= Math.floor(maxLen * 0.6) ? hardCut.slice(0, lastSpace) : hardCut;
  return safeCut.replace(/["'“‘'"()\[{,;:\-–—]+$/u, '').trim();
}

export function itineraryGrid8CoverTitleFallback(destinationId: DestinationId, seed = ''): string {
  const pool = [
    'ĐÀ LẠT 4N3Đ – CHUYẾN ĐI KHÔNG MUỐN KẾT THÚC',
    'BỐN NGÀY NHƯ MỘT BỨC TRANH',
    'ĐÀ LẠT 4N3Đ – Ở LẠI THÊM MỘT CHÚT',
    'ĐÀ LẠT – BỐN NGÀY GIỮ LẠI BẦU TRỜI',
    'ĐÀ LẠT 4N3Đ – ĐI CHẬM ĐỂ NHỚ LÂU',
  ].map((title) => localizeText(title, destinationId));
  const index = Math.abs(stableHash(`itinerary-grid8-title:${seed || Date.now()}`)) % pool.length;
  return pool[index].slice(0, coverTitleMaxLen('itinerary-4n2d-grid8'));
}

/** Title cover lưới 8 / feed — thơ / cảm xúc, kiểu “Đà Lạt – …”. */
export function grid8CoverTitleFallback(destinationId: DestinationId, seed = ''): string {
  const pool = [
    'ĐÀ LẠT – MỖI GÓC PHỐ LÀ MỘT BỨC TRANH',
    'ĐÀ LẠT – CHUYẾN ĐI MÀ MÌNH KHÔNG MUỐN KẾT THÚC',
    'ĐÀ LẠT – NƠI LÒNG MUỐN Ở LẠI',
    'ĐÀ LẠT – GÓC NHỎ LÀM MÌNH THƯƠNG',
    'ĐÀ LẠT – ĐI MỘT LẦN NHỚ MÃI',
    'ĐÀ LẠT – CHẬM LẠI MỘT NHỊP THỞ',
  ].map((title) => localizeText(title, destinationId));
  const index = Math.abs(stableHash(`grid8-title:${seed || Date.now()}`)) % pool.length;
  return pool[index].slice(0, coverTitleMaxLen('grid-8'));
}

export function coverTitleFallbackForDeck(destinationId: DestinationId, deckId: string, seed = ''): string {
  if (deckId === 'itinerary-4n2d-grid8') return itineraryGrid8CoverTitleFallback(destinationId, seed);
  if (deckId === 'grid-8' || deckId === 'grid-8-feed') return grid8CoverTitleFallback(destinationId, seed);
  return localizeText('ĐI ĐÀ LẠT THÌ LƯU NGAY LIST NÀY', destinationId).slice(0, 35);
}

export function buildDeepSeekPrompt(
  destinationId: DestinationId,
  deck: GuideDeck,
  deckList: GuideDeckList,
  tone: DeepSeekCaptionResponse['tone'],
  target: DeepSeekCaptionResponse['target'],
  current: { coverTitle: string; headline: string; body: string; hashtags: string[] },
  usedTitles: string[] = [],
): string {
  const pageLines = deckList.pages.map((page, index) => {
    if (page.type === 'cover') {
      // Không đưa tiêu đề/mô tả mẫu vào prompt — AI hay copy y hệt (vd. "ĐÀ LẠT 8 ĐIỂM / 1 TRANG").
      return `Trang ${index + 1}: cover | tự viết coverTitle + body mới (KHÔNG copy tiêu đề/mô tả mẫu)`;
    }
    const itemLines = page.items.map((item, i) => `- ${i + 1}. ${item.name} | ${item.metaPrimary} | ${item.metaSecondary}`).join('\n');
    return [`Trang ${index + 1}: list`, `Chủ đề: ${page.chipText}`, `Tiêu đề: ${page.title}`, `Mô tả: ${page.subtitle}`, 'Địa điểm:', itemLines].join('\n');
  });

  const toneInstructions: Record<DeepSeekCaptionResponse['tone'], string> = {
    gen_z: 'Sử dụng ngôn ngữ trẻ trung, năng động, dùng từ lóng Gen Z phù hợp NGỮ CẢNH DU LỊCH (chill, đỉnh nóc, mlem, cháy, xịn, đu trend...), cấu trúc câu ngắn gọn, có thể dùng icon linh hoạt. TRÁNH dùng từ lóng mua sắm/sale không hợp cảnh (như "chốt đơn", "săn sale", "add to cart") vì đây là list ảnh du lịch để lưu lại, không phải sản phẩm để mua — dùng "lưu ngay", "note lại", "úp lên là đi" thay thế. Headline ví dụ: "ĐÀ LẠT PHÁ ĐẢO CÙNG BESTIE", "CHÁY PHỐ ĐÀ LẠT 0Đ", "TOP SPOT CHILL CỰC ĐỈNH".',
    tinh_te: 'Giọng văn nhẹ nhàng, bay bổng, giàu cảm xúc và hình ảnh. Tập trung vào không gian, cảm giác yên bình và vẻ đẹp thơ mộng của Đà Lạt. Headline ví dụ: "ĐÀ LẠT VÀ NHỮNG BẢN TÌNH CA", "NƠI TÌM VỀ MIỀN KÝ ỨC", "CHÚT TÌNH GỬI GIÓ ĐÀ LẠT".',
    review_chan_that: 'Giọng văn thực tế, đi thẳng vào vấn đề, chia sẻ trải nghiệm thật (khen chê rõ ràng nhưng vẫn giữ thái độ tích cực). Nhấn mạnh vào tính hữu ích. Headline ví dụ: "SỰ THẬT VỀ ĐÀ LẠT MÙA NÀY", "LIST QUÁN ĂN NGON BẤT BẠI", "ĐI ĐÀ LẠT ĐỪNG BỎ QUA NƠI NÀY".',
    ban_hang_nhe: 'Giọng văn mời gọi nhưng không quá lộ liễu, khéo léo lồng ghép lợi ích khi sử dụng dịch vụ/địa điểm. Tập trung vào sự tiện lợi và chất lượng. Headline ví dụ: "TRẢI NGHIỆM ĐÀ LẠT KHÁC BIỆT", "DỊCH VỤ TOUR ĐÀ LẠT CHẤT LƯỢNG", "ƯU ĐÃI ĐỘC QUYỀN TẠI ĐÀ LẠT".',
    lich_trinh_huu_ich: 'Cung cấp thông tin rõ ràng, logic, theo trình tự thời gian hoặc chủ đề. Giọng văn hướng dẫn, tận tâm như một hướng dẫn viên bản địa. Headline ví dụ: "LỊCH TRÌNH 3N2Đ TỐI ƯU NHẤT", "CẨM NANG DU LỊCH ĐÀ LẠT TỰ TÚC", "TỔNG HỢP ĐIỂM ĐẾN HOT NHẤT".',
  };

  const diversityAngles = [
    'chon mot trai nghiem mo dau that cu the, gan voi cam giac di Da Lat trong ngay do',
    'viet nhu mot loi nhac rieng cho ban than sap len lich di Da Lat',
    'bat dau tu mot loi ich thuc te: de chon quan, de chon diem, de sap xep thoi gian',
    'ke nhu mot review ngan sau khi vua di ve, co chi tiet that va khong qua quang cao',
    'dung goc nhin tiet kiem cong suc: nguoi xem chi can luu lai va di theo',
    'tao cam giac phat hien duoc vai diem dang thu trong list',
    'viet gon nhu caption de dang copy dang TikTok, nhung van co chat rieng',
    'uu tien nhac den nhom ban, cap doi hoac nguoi moi di Da Lat lan dau',
  ];
  const variationSeed = stableHash([
    deck.id,
    deckList.id,
    tone,
    target,
    current.coverTitle,
    current.headline,
    current.body,
    current.hashtags.join(','),
    Date.now().toString(),
    Math.random().toString(36).slice(2),
  ].join('|'));
  const diversityAngle = diversityAngles[variationSeed % diversityAngles.length];

  const deckNotes = deck.id === 'itinerary-4n2d-grid8'
    ? [
      'Lưu ý đặc biệt: đây là lịch trình 4N3Đ (4 đêm 3 ngày), mỗi ngày một trang lưới 8 ô. Không gọi là 3N2Đ hay 4N2Đ trong caption.',
      'KHÔNG BẮT BUỘC phải nhét "4N3Đ" vào coverTitle — chỉ thêm nếu ghép tự nhiên, gọn, TUYỆT ĐỐI không ghép gượng gạo kiểu "đà lạt 4n3đ đi trong 72 giờ của…" (sai ngữ pháp, nghe rất kỳ). Ưu tiên câu sạch, không số, hơn là câu có số nhưng gãy.',
      'VD tốt (đúng văn phong casual chung — xem "Lưu ý văn phong chung" bên dưới): "4n3đ ở đà lạt thì nên đi đâu nè??", "đi đà lạt 4 ngày 3 đêm thì lịch trình sao cho hợp lý?".',
    ].join(' ')
    : '';

  const globalStyleNote = [
    'LƯU Ý VĂN PHONG CHUNG CHO MỌI MẪU (áp dụng thống nhất, người dùng đã duyệt qua thực tế theo đúng mẫu 3N2Đ, ưu tiên phong cách này hơn mọi phong cách khác đã đề cập trước đó trong prompt):',
    'coverTitle viết CASUAL, viết THƯỜNG (không viết hoa chữ đầu từng từ, không viết hoa toàn bộ) — giống hệt văn phong 1 caption TikTok đời thường, tự nhiên như đang gõ chat, được phép dùng dấu "??" hoặc lặp chữ cuối câu cho cảm giác thật (vd "nhiềuuu", "đẹppp" khi hợp tone).',
    'coverTitle nên là 1 câu hỏi ngắn, thân thiện, viết thường — ví dụ mẫu THẬT đã duyệt: "3n2d ở đà lạt thì nên đi đâu??".',
    'QUAN TRỌNG: ví dụ trên CHỈ để học văn phong/độ dài/cách viết thường — TUYỆT ĐỐI KHÔNG chép lại y nguyên hay gần giống câu chữ của ví dụ. Mỗi lần sinh phải là câu HOÀN TOÀN MỚI, đổi cách hỏi/cách kể khác nhau, và phải hợp với chủ đề/địa điểm của TỪNG mẫu (không phải lúc nào cũng hỏi kiểu 3n2d, có thể kể/tâm sự/mời gọi tuỳ Tone yêu cầu).',
    'LƯU Ý QUAN TRỌNG: người dùng đã quyết định KHÔNG dùng phần mô tả (body) nữa — trang cover chỉ còn tiêu đề. Chỉ cần tập trung chất lượng vào coverTitle (và headline để đăng bài). Xem thêm hướng dẫn body ở cuối prompt.',
  ].join(' ');

  const destinationLabel = cityLabel(destinationId);
  const coreHashtags = getMarketingCopy(destinationId).hashtags.slice(0, 3).join(' ');
  const deckHashtagExtras = getDeckHashtagExtras(deck.id, destinationId).join(' ');

  return [
    `Tạo nội dung TikTok cho bộ ảnh du lịch ${destinationLabel} sau.`,
    `Tên chủ đề: ${deck.title}`,
    `Mô tả chung: ${deck.description}`,
    globalStyleNote,
    deckNotes,
    `Danh sách địa điểm: ${deckList.title}`,
    `Mô tả danh sách: ${deckList.description}`,
    `Tone yêu cầu: ${tone}`,
    `Hướng dẫn giọng văn: ${toneInstructions[tone]}`,
    `Phần cần sinh: ${target}`,
    `Goc trien khai bat buoc cho lan sinh nay: ${diversityAngle}.`,
    current.coverTitle ? `Tiêu đề cover hiện tại: ${current.coverTitle}` : '',
    current.headline ? `Caption đăng bài hiện tại: ${current.headline}` : '',
    current.hashtags.length ? `Hashtags hiện tại: ${current.hashtags.join(' ')}` : '',
    '',
    (current.coverTitle || current.headline)
      ? 'QUAN TRỌNG: Nội dung bạn sinh ra lần này PHẢI HOÀN TOÀN KHÁC với nội dung hiện tại ở trên. Không được dùng lại cùng ý, cùng cấu trúc câu, cùng từ mở đầu, hay cùng góc nhìn. Hãy đổi hoàn toàn cách tiếp cận, dùng từ vựng khác, mở đầu khác, và truyền tải thông điệp theo hướng mới.'
      : '',
    usedTitles.length > 0
      ? `CÁC TIÊU ĐỀ ĐÃ DÙNG (TUYỆT ĐỐI KHÔNG ĐƯỢC LẶP LẠI BẤT KỲ CÁI NÀO DƯỚI ĐÂY):\n${usedTitles.map((t, i) => `${i + 1}. "${t}"`).join('\n')}\nHãy nghĩ ra tiêu đề và caption hoàn toàn mới, khác 100% so với danh sách trên.`
      : '',
    '',
    'DỮ LIỆU ĐỊA ĐIỂM CHI TIẾT:',
    ...pageLines,
    '',
    'VĂN PHONG MẪU THAM KHẢO (đây là các câu hook TikTok Đà Lạt thật, được người dùng chọn lọc — KHÔNG copy y nguyên bất kỳ câu nào dưới đây, chỉ học giọng văn: ngắn, đời thường, tự nhiên như người thật đang nói, có cảm xúc/lý do cụ thể, không sáo rỗng, không nghe như quảng cáo hay liệt kê máy móc):',
    '- "Nhận đi Đà Lạt giùm cho ai đang nhớ Đà Lạt."',
    '- "Đi Đà Lạt cả chục lần rồi, đây là những kinh nghiệm đáng tiền nhất."',
    '- "Có cái list này là đi Đà Lạt khỏe hơn hẳn."',
    '- "Nếu chỉ có 3 ngày ở Đà Lạt thì mình sẽ đi như thế này."',
    '- "Sống ở Đà Lạt hơn 20 năm, đây là những quán mình vẫn quay lại."',
    '- "Luỵ Đà Lạt mãi."',
    '- "Đây không phải Pinterest. Đây là Đà Lạt."',
    '- "POV: Chỉ còn 48 giờ ở Đà Lạt."',
    '- "Đà Lạt tháng 7 có gì?"',
    '- "Ai nói Đà Lạt hết đẹp?"',
    '',
    'YÊU CẦU BẮT BUỘC VỀ CHẤT LƯỢNG CÂU (áp dụng cho MỌI mẫu, không chỉ riêng lưới 8 — đây là lỗi hay gặp nhất, phải tuân thủ nghiêm):',
    '- coverTitle và headline PHẢI là câu hoặc cụm từ HOÀN CHỈNH, đọc lên hiểu ngay, giống đúng giọng văn ở phần "VĂN PHONG MẪU THAM KHẢO" trên.',
    '- TỰ KIỂM TRA bắt buộc trước khi trả lời: đọc lại coverTitle và headline, tự hỏi "câu này có nói được 1 ý CỤ THỂ không — 1 lý do, 1 cảm giác thật, 1 câu hỏi, hay 1 tình huống — hay chỉ là mỹ từ/số liệu không gắn với điều gì cả?". Nếu không trả lời được, viết lại.',
    '- 9 KIỂU LỖI CẤM TUYỆT ĐỐI (đây là lỗi AI hay mắc nhất, ví dụ THẬT đã bị từ chối):',
    '  (1) Nghe như slogan/quảng cáo du lịch chung: TRÁNH "ĐÀ LẠT – NÉT ĐẸP KHÔNG CẦN TỐN TIỀN", "ĐÀ LẠT — VẺ ĐẸP BẤT TẬN". Slogan không có góc nhìn cá nhân, ai viết cũng được, nghe rất sáo.',
    '  (2) Chỉ liệt kê thông số như bảng specs, không có cảm xúc/lý do: TRÁNH "ĐÀ LẠT 72 GIỜ, GỌN VÍ 3TR", "ĐÀ LẠT 3N2Đ – 8 ĐIỂM 500K". Số giờ/số tiền/số điểm không tự nó tạo thành 1 câu có hồn.',
    '  (3) Hoa mỹ/trừu tượng nhưng rỗng nghĩa, không nói được điều gì cụ thể: TRÁNH "CHẶNG DỪNG CHO TÂM HỒN", "ĐÀ LẠT VÀ NHỮNG SẮC MÀU", "ĐÀ LẠT CỦA RIÊNG BẠN", "ĐÀ LẠT TRONG TỪNG KHUNG HÌNH", "ĐÀ LẠT — GÓC NHÌN RIÊNG". Nếu dùng chữ "riêng"/"của bạn"/"góc nhìn" thì PHẢI nói rõ riêng cái gì, góc nhìn về cái gì cụ thể — không được để lửng.',
    '  (4) Nhắc tên địa danh/quán cụ thể trong coverTitle: TRÁNH "Sáng 6h dậy đi Cầu Đất" (lộ tên "Cầu Đất" — vi phạm ngay quy tắc không nêu tên địa điểm cụ thể ở dưới). Chỉ được nói chung "Đà Lạt", không nêu tên đồi/hồ/quán/khu vực cụ thể nào.',
    '  (5) Kết câu bằng 1 từ đơn lẻ mơ hồ, đọc xong không rõ nghĩa: TRÁNH kiểu "…, gửi chút lạc" (từ "lạc" đứng một mình không rõ là an lạc, lạc lối, hay gì khác). Nếu dùng từ trừu tượng/đa nghĩa, phải có từ đi kèm làm rõ nghĩa (vd. "an lạc", "lạc quan"), không để trơ một mình gây khó hiểu.',
    '  (6) Lặp lại 1 từ để tạo vần/nhịp cho vui tai nhưng nghĩa không khớp với danh từ đi kèm: TRÁNH "Đà Lạt 8 spots xịn, ví cũng xịn luôn!" — "xịn" hợp với "spots" (đẹp/chất) nhưng vô nghĩa khi gắn với "ví" (ví không có khái niệm "xịn", nói vậy không ai hiểu ý là "không tốn tiền"). Muốn nói ví không hao tiền thì viết đúng nghĩa: "ví không hao", "ví vẫn dày", "đỡ tốn ví" — TUYỆT ĐỐI không tái dùng nguyên 1 từ khen sang vế sau nếu nghĩa không khớp, chỉ vì nghe vần.',
    '  (7) Nêu SỐ LƯỢNG cụ thể trong coverTitle/headline — đây là lỗi RẤT hay tái phát, kiểm tra kỹ nhất: TRÁNH "8 điểm", "8 chỗ", "8 góc", "5 điểm", "6 điểm", "lưới 8 ô", "2 homestay", "4 địa điểm", hay bất kỳ số + danh từ nào nói về số lượng ảnh/địa điểm/ô lưới. Số lượng ô ảnh là thông tin về CẤU TRÚC LAYOUT, không phải nội dung cảm xúc — tuyệt đối không được xuất hiện trong coverTitle hay headline dưới bất kỳ danh từ nào đi kèm (kể cả từ đồng nghĩa với "điểm"). Cũng TRÁNH số tiền cụ thể kiểu "500k", "48h chỉ cần 500k" trong coverTitle. Ngoại lệ duy nhất: số 0 trong "0đ" (giá) và số ngày/giờ khi đúng là lịch trình theo ngày (ví dụ "4N3Đ", "72H") — những số đó KHÔNG bị cấm.',
    '  (8) Câu quá chung chung, không gắn với NỘI DUNG CỤ THỂ của bộ ảnh này, đọc xong không biết bộ ảnh nói về cái gì: TRÁNH "mê đà lạt quá thì làm sao", "đà lạt vậy mà đáng đi nhỉ", "đà lạt sương mù chill cực xịn" — những câu này đúng ngữ pháp nhưng không gắn với chủ đề/nội dung riêng của bộ ảnh (ăn uống, lịch trình, quán cà phê, homestay...), đổi tên mẫu nào vào cũng dùng được thì coi như chưa đạt. coverTitle PHẢI cho biết mơ hồ được là bộ ảnh này giúp ích gì cụ thể (chọn quán, lên lịch, tìm góc chụp, tiết kiệm chi phí...).',
    '  (9) Chèn cụm từ trong dấu ngoặc kép/nháy vào giữa câu để tạo hiệu ứng: TRÁNH "đà lạt đi chỗ này là \'ghiền\' liền", "ghi liền chỗ này để né \'đi lại vòng vòng\'" — cách chèn ngoặc kép giữa câu đọc kỳ, không tự nhiên như văn phong caption thật. Nếu muốn nhấn mạnh 1 từ thì viết thẳng vào câu, không cần đóng mở ngoặc kép.',
    '- Thay vào đó hãy bám sát đúng dạng câu trong "VĂN PHONG MẪU THAM KHẢO": có 1 tình huống/cảm giác/lý do CỤ THỂ (ví dụ: nhớ Đà Lạt, sắp đi, vừa đi về, tiếc tiền oan, chỉ có ít ngày, sống lâu năm nên biết chỗ hay...).',
    '- CẤM ghép từ gượng gạo, sai ngữ pháp, thiếu chủ ngữ/vị ngữ, hoặc nghe kỳ cục khi đọc thành tiếng.',
    '- Ưu tiên 1 ý rõ ràng, câu ngắn hơn là câu dài mà lan man. Trước khi trả lời, tự đọc lại câu — nếu thấy tối nghĩa hoặc dài dòng thì viết lại đơn giản, ngắn gọn hơn.',
    '- coverTitle phải NẰM TRONG giới hạn ký tự cho phép (xem mục "YÊU CẦU QUAN TRỌNG VỀ COVER TITLE" bên dưới) — trước khi trả lời, tự đếm số ký tự, nếu vượt quá giới hạn thì viết lại ngắn hơn thay vì viết dài rồi để bị cắt mất chữ cuối.',
    '',
    'YÊU CẦU QUAN TRỌNG VỀ COVER TITLE (TIÊU ĐỀ TRANG COVER):',
    '- `coverTitle` là chữ in đậm ở trang bìa của bộ ảnh. Phải dễ scan, có hồn.',
    '- BẮT BUỘC viết THƯỜNG, casual theo đúng "Lưu ý văn phong chung cho mọi mẫu" ở trên (giống mẫu 3N2Đ: "3n2d ở đà lạt thì nên đi đâu??"). TUYỆT ĐỐI KHÔNG viết hoa toàn bộ chữ, KHÔNG viết hoa chữ đầu từng từ (không phải "LỊCH TRÌNH 3N2Đ TỐI ƯU NHẤT", cũng không phải "Lịch Trình 3N2Đ Tối Ưu Nhất" — mà là "lịch trình 3n2đ thì nên đi đâu ta??" kiểu vậy) — viết hoa (dù toàn bộ hay từng chữ) đều đọc trịnh trọng/quảng cáo, không giống văn phong đời thường người dùng muốn.',
    '- Có thể là câu hỏi (như ví dụ 3N2Đ), câu tâm sự, hoặc lời mời — miễn viết thường, tự nhiên, đúng 1 ý cụ thể.',
    '- ĐA DẠNG CÁCH VIẾT — không phải lúc nào cũng là câu hỏi kết bằng "??" giống hệt mẫu 3N2Đ. Có thể đổi sang câu kể, câu rủ rê, câu tự trào, tuỳ Tone yêu cầu — miễn giữ đúng tinh thần viết thường/casual.',
    deck.id === 'grid-8' || deck.id === 'grid-8-feed' || deck.id === 'itinerary-4n2d-grid8'
      ? '- Với lưới 8 / lịch trình lưới 8: tối đa 48 ký tự.'
      : '- Tuyệt đối KHÔNG vượt quá 35 ký tự (tính cả khoảng trắng).',
    '- Bám sát "Tone yêu cầu". Không được trùng với "Caption đăng bài".',
    '- Không dùng chữ "free" trong cover title. Thay bằng "0đ", "dễ đi", "nhẹ tiền" hoặc bỏ luôn.',
    '- Với nội dung 0đ/miễn phí, ưu tiên cách nói dí dỏm kiểu "không tốn tiền, chỉ tốn thời gian thôi" thay vì chỉ nói cụt "không tốn 1 xu" — nghe có duyên và đúng thực tế hơn (vẫn cần bỏ thời gian đi, chỉ là không mất tiền).',
    '- HẠN CHẾ TỐI ĐA số tiền cụ thể ("triệu", "tr", "3tr", "500k"...) trong coverTitle — nghe như quảng cáo giá, không giống văn phong đời thường. Nói về tiền thì dùng cảm giác thay số cụ thể, ĐỔI VÒNG nhiều cách khác nhau — không chỉ mỗi "ví": "nhẹ tiền", "giá mềm", "không lo chi phí", "chi tiêu thoải mái", "hợp túi" — chỉ giữ số tiền trong headline/body nếu cần, không phải trong coverTitle. Ngoại lệ: "0đ" vẫn được phép.',
    '- TUYỆT ĐỐI không nhắc tên quán/địa điểm/khu vực cụ thể trong cover title (xem lỗi (4) ở trên) — chỉ dùng "đà lạt" chung.',
    '- KHÔNG copy tiêu đề mẫu kiểu "… 8 điểm / 1 trang", hay bất kỳ tiêu đề nào trong danh sách đã dùng.',
    deck.id === 'grid-8' || deck.id === 'grid-8-feed'
      ? '- Với mẫu lưới 8: CẤM meta layout / listicle cứng.'
      : '',
    '',
    'YÊU CẦU QUAN TRỌNG VỀ HEADLINE (CAPTION ĐĂNG BÀI):',
    '- `headline` là caption người dùng copy để dán vào TikTok khi đăng bài.',
    '- Chỉ viết DUY NHẤT 1 câu ngắn gọn (tối đa 80 ký tự), giọng văn bám sát "Tone yêu cầu".',
    '- Câu phải có hook thu hút ngay, có thể thêm 1 emoji cuối câu (không quá 1 emoji).',
    '- Không lặp lại nguyên văn cover title. Không dùng chữ "free" / "deck".',
    '- Có thể mời người xem lưu lại bộ ảnh, nhưng tuyệt đối không gọi tên địa điểm/quán cụ thể.',
    '- KHÔNG dùng lại caption mẫu kiểu "BỎ TÚI NGAY LIST NÀY RỦ BÉ BẠN XÁCH BA LÔ...".',
    '- NHẮC LẠI lỗi (7) — RẤT hay tái phát ở headline dù coverTitle đã tránh được: TUYỆT ĐỐI không nêu số lượng cụ thể trong headline (TRÁNH "8 điểm check-in xịn mà không tốn một xu", "Ghé 4 homestay xinh như mơ" — đều lộ số lượng ô lưới/địa điểm). Kiểm tra riêng câu headline này một lần nữa trước khi trả lời — không chỉ kiểm tra coverTitle.',
    '- Không dùng từ hiếm/mơ hồ mà người đọc phải đoán nghĩa (TRÁNH "góc ém", "chốn ẩn"...) — chỉ dùng từ phổ thông, ai đọc cũng hiểu ngay không cần suy nghĩ.',
    '',
    'CÁC YÊU CẦU KHÁC:',
    '- TUYỆT ĐỐI không dùng từ "deck" trong nội dung. Thay vào đó hãy dùng: "hình", "ảnh", "bộ ảnh", "cẩm nang", "lịch trình", "bộ này", "tuyển tập này"...',
    '- Không dùng từ "ảnh" để chỉ bộ nội dung — dùng "bộ", "cẩm nang", "tuyển tập" thay thế.',
    '- HẠN CHẾ TỐI ĐA (không cấm tuyệt đối, nhưng KHÔNG lặp lại nhiều lần trong cùng 1 lần sinh) 3 từ đang bị dùng quá tay: "miễn phí", "list", "ví". Mỗi từ chỉ được xuất hiện tối đa 1 lần trong toàn bộ coverTitle+headline+body, và ưu tiên KHÔNG dùng nếu có cách nói khác:',
    '  + Thay "miễn phí" bằng "0đ", "không tốn xu", "đỡ tốn tiền", hoặc dí dỏm kiểu "không tốn tiền, chỉ tốn thời gian thôi" — đổi cách nói mỗi lần, không lặp "miễn phí" ở cả coverTitle và headline.',
    '  + Thay "list" bằng "bộ này", "cẩm nang này", "tuyển tập này", "loạt ảnh này" — không dùng "list" làm từ mặc định lặp đi lặp lại.',
    '  + "ví" đang bị lặp CỰC NHIỀU vì hay bị gợi ý làm cách nói giảm về tiền — ĐỔI VÒNG các cách khác nhau mỗi lần, KHÔNG lặp lại "ví" nhiều lần liên tiếp giữa các mẫu: "nhẹ tiền", "không tốn kém", "giá mềm", "chi tiêu thoải mái", "dễ chịu về giá", "không lo chi phí", "hợp túi". Chỉ dùng "ví" như MỘT trong nhiều lựa chọn, không phải lựa chọn mặc định.',
    '- (Nhắc lại lỗi (7) ở trên vì rất hay tái phát): coverTitle/headline TUYỆT ĐỐI không được có số lượng ô ảnh/địa điểm dưới bất kỳ hình thức nào.',
    '- Không dùng các cụm diễn đạt nội bộ như "ảnh đã chọn", "bộ ảnh này", "ghim ảnh".',
    '- Tránh lỗi chính tả: "đông đúc" (không phải "đông đúng"), "nơi đẹp mê ly" (không phải "nơi đẹp thẳng thừng").',
    '- Không để câu bị cụt hoặc dư ký tự lạ ở cuối (như "ng", "c", "ghim").',
    '- KHÔNG viết body/mô tả nữa — người dùng đã quyết định trang cover chỉ còn tiêu đề, không còn mô tả bên dưới. Trường "body" trong JSON trả về LUÔN LUÔN là chuỗi rỗng "".',
    '- Dữ liệu địa điểm chỉ dùng để hiểu tinh thần bộ ảnh; không chép tên địa điểm/quán vào cover title hay headline.',
    '- Khong mo ta bo cuc thiet ke hoac kich thuoc layout trong caption. Tranh cac cum: "2x3", "3x3", "2x4", "luoi", "layout", "grid", "o anh", "o hinh", "8 diem / 1 trang", "N diem / 1 trang".',
    '- Moi lan bam sinh lai phai doi goc viet, doi nhip cau, doi dong tu mo dau; khong chi thay vai tu dong nghia.',
    `- Hashtags: đúng 5 hashtag. 3 hashtag đầu BẮT BUỘC cố định: ${coreHashtags}. 2 hashtag cuối cố định theo mẫu "${deck.navTitle || deck.id}": ${deckHashtagExtras}. Không đổi thứ tự, không thay 3 hashtag đầu.`,
    '- Trả về JSON object đúng schema (body LUÔN là chuỗi rỗng):',
    '{"coverTitle":"...","headline":"...","body":"","hashtags":["#...","#...","#...","#...","#..."]}',
  ].filter(Boolean).join('\n');
}

export function isPov3ImageMappingNote(value: string): boolean {
  return /^(?:Ảnh (?:đã map|tự map|minh họa|đối tác)|Thông tin đối tác)/i.test(String(value || '').trim());
}

export function parseDeepSeekJson(content: string): Record<string, unknown> {
  const direct = tryParseJson(content);
  if (direct) return direct;
  const fenced = content.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenced) { const p = tryParseJson(fenced[1]); if (p) return p; }
  const firstBrace = content.indexOf('{');
  const lastBrace = content.lastIndexOf('}');
  if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
    const p = tryParseJson(content.slice(firstBrace, lastBrace + 1));
    if (p) return p;
  }
  throw new BadRequestException('Không parse được JSON caption từ AI.');
}

export function collectCaptionForbiddenNames(deckList: GuideDeckList): string[] {
  const names = new Map<string, string>();
  const addName = (value?: string) => {
    const name = String(value ?? '').replace(/\s+/g, ' ').trim();
    if (name.length < 3) return;
    names.set(normalizeCaptionNameKey(name), name);
  };

  for (const page of deckList.pages) {
    if (page.type !== 'list') continue;
    for (const item of page.items) {
      addName(item.rawName);
      addName(item.name);
      addName(item.name.split(/:\s*/).slice(1).join(': '));
    }
  }

  return [...names.values()].sort((a, b) => b.length - a.length);
}

export function removeForbiddenPlaceNames(value: string, forbiddenPlaceNames: string[]): string {
  let clean = value;
  for (const name of forbiddenPlaceNames) {
    for (const candidate of getPlaceNameCandidates(name)) {
      const escaped = escapeRegExp(candidate).replace(/\s+/g, '\\s+');
      const pattern = new RegExp(`(^|[^\\p{L}\\p{N}])${escaped}(?=$|[^\\p{L}\\p{N}])`, 'giu');
      clean = clean.replace(pattern, '$1một điểm trong list');
    }
  }

  return clean
    .replace(/một điểm trong list\s+(?:hay|hoặc|và)\s+một điểm trong list/giu, 'vài điểm trong list')
    .replace(/một điểm trong list(?:\s*,\s*một điểm trong list)+/giu, 'vài điểm trong list')
    .replace(/\s{2,}/g, ' ')
    .replace(/\s+([,.!?])/g, '$1')
    .trim();
}

export function hasForbiddenPlaceName(value: string, forbiddenPlaceNames: string[]): boolean {
  return forbiddenPlaceNames.some((name) => getPlaceNameCandidates(name).some((candidate) => {
    const escaped = escapeRegExp(candidate).replace(/\s+/g, '\\s+');
    return new RegExp(`(^|[^\\p{L}\\p{N}])${escaped}(?=$|[^\\p{L}\\p{N}])`, 'iu').test(value);
  }));
}

export function getPlaceNameCandidates(name: string): string[] {
  const normalized = name.replace(/\s+/g, ' ').trim();
  const unaccented = stripVietnameseMarks(normalized);
  return [...new Set([normalized, unaccented].filter((value) => value.length >= 3))];
}

export function normalizeCaptionNameKey(value: string): string {
  return stripVietnameseMarks(value).toLowerCase();
}

export function stripVietnameseMarks(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D');
}

/**
 * Post-processing sanitizer applied to ALL text content (both new AI output and old data).
 * Fixes: wrong words, dangling chars, internal jargon, typos.
 */
export function sanitizeContentText(value: string): string {
  return String(value || '').normalize('NFC')
    // Fix typos from feedback
    .replace(/(^|[^\p{L}\p{N}])đông\s*đúng(?=$|[^\p{L}\p{N}])/giu, '$1đông đúc')
    .replace(/(^|[^\p{L}\p{N}])nơi\s*đẹp\s*thẳng\s*thừng(?=$|[^\p{L}\p{N}])/giu, '$1nơi đẹp mê ly')
    .replace(/(^|[^\p{L}\p{N}])mở\s*to\s*mắt(?=$|[^\p{L}\p{N}])/giu, '$1mở mang tầm mắt')
    .replace(/(^|[^\p{L}\p{N}])Săn\s*ảnh\s*và\s*bắt\s*sáng(?=$|[^\p{L}\p{N}])/giu, '$1Săn ảnh và ăn sáng')
    .replace(/(^|[^\p{L}\p{N}])3\s*ngày\s*chẳng\s*cần\s*chỉnh\s*sửa\s*gì(?=$|[^\p{L}\p{N}])/giu, '$13 ngày chẳng cần nghĩ ngợi gì')
    .replace(/(^|[^\p{L}\p{N}])đủ\s*ăn\s*uống(?=$|[^\p{L}\p{N}])/giu, '$1đủ bữa ăn')
    .replace(/(^|[^\p{L}\p{N}])điểm\s*ăn\s*uống(?=$|[^\p{L}\p{N}])/giu, '$1điểm ăn')
    .replace(/(^|[^\p{L}\p{N}])địa\s*chỉ\s*ăn\s*uống(?=$|[^\p{L}\p{N}])/giu, '$1địa chỉ ăn ngon')
    .replace(/(^|[^\p{L}\p{N}])không\s*chỉ\s*ăn\s*uống\s*và\s*chụp\s*ảnh(?=$|[^\p{L}\p{N}])/giu, '$1không chỉ chụp ảnh rồi đi tiếp')
    .replace(/(^|[^\p{L}\p{N}])trước\s*khi\s*thêm\s*cafe\s*hay\s*ăn\s*uống(?=$|[^\p{L}\p{N}])/giu, '$1trước khi thêm cafe hay điểm ăn')
    .replace(/(^|[^\p{L}\p{N}])mấy\s*chỗ\s*ăn\s*uống(?=$|[^\p{L}\p{N}])/giu, '$1mấy chỗ ăn ngon')
    .replace(/(^|[^\p{L}\p{N}])chọn\s*điểm\s*đi,\s*ăn\s*uống\s*và\s*chụp\s*hình(?=$|[^\p{L}\p{N}])/giu, '$1chọn điểm đi, quán ăn và góc chụp')
    .replace(/(^|[^\p{L}\p{N}])từ\s*ăn\s*uống,\s*check-?in(?=$|[^\p{L}\p{N}])/giu, '$1từ quán ăn, check-in')
    .replace(/(^|[^\p{L}\p{N}])nhóm\s*ăn\s*uống(?=$|[^\p{L}\p{N}])/giu, '$1nhóm quán ăn')
    .replace(/(^|[^\p{L}\p{N}])Ăn\s*uống(?=$|[^\p{L}\p{N}])/gu, '$1Quán ăn')
    .replace(/(^|[^\p{L}\p{N}])ăn\s*uống(?=$|[^\p{L}\p{N}])/giu, '$1quán ăn')
    .replace(/(^|[^\p{L}\p{N}])Nhấn\s*lưu\s*liền\s*kẻo(?=$|[^\p{L}\p{N}])/giu, '$1Nhấn lưu liền kẻo quên nhé')
    .replace(/(^|[^\p{L}\p{N}])lưu\s*lại(?=\s*$)/giu, '$1lưu lại ngay nhé')
    .replace(/(^|[^\p{L}\p{N}])Đà\s*Lạt\s*ẩn\s*mình\s*sau\s*vách\s*núi(?=$|[^\p{L}\p{N}])/giu, '$1Đầy đủ kinh nghiệm cho chuyến đi Đà Lạt')
    .replace(/(^|[^\p{L}\p{N}])Đà\s*Lạt\s*đủ\s*để\s*đi\s*ngay(?=$|[^\p{L}\p{N}])/giu, '$1Đầy đủ kinh nghiệm cho chuyến đi Đà Lạt')
    // Remove dangling chars at end of sentence (ng, c, ghim, g alone)
    .replace(/\s+\b(ng|ghim|c|g)\b\s*([.!?…]*)$/gi, '$2')
    // Remove internal jargon
    .replace(/(^|[^\p{L}\p{N}])bộ\s*ảnh\s*này(?=$|[^\p{L}\p{N}])/giu, '$1list này')
    .replace(/(^|[^\p{L}\p{N}])bộ\s*ảnh(?=$|[^\p{L}\p{N}])/giu, '$1list')
    .replace(/(^|[^\p{L}\p{N}])ảnh\s*đã\s*chọn(?=$|[^\p{L}\p{N}])/giu, '$1các điểm đã chọn')
    .replace(/(^|[^\p{L}\p{N}])ghim\s*ảnh(?=$|[^\p{L}\p{N}])/giu, '$1lưu lại')
    .replace(/(^|[^\p{L}\p{N}])lưu\s*ảnh(?=$|[^\p{L}\p{N}])/giu, '$1lưu list')
    .replace(/(^|[^\p{L}\p{N}])các\s*ảnh\s*đã\s*chọn(?=$|[^\p{L}\p{N}])/giu, '$1các điểm đã chọn')
    // Clean up extra spaces
    .replace(/\.{4,}/g, '...')
    .replace(/\s{2,}/g, ' ')
    .replace(/\s+([,.!?])/g, '$1')
    .trim();
}

export function sanitizeGeneratedListText(destinationId: DestinationId, list: GuideDeckList, deckId?: string): GuideDeckList {
  const resolvedDeckId = deckId || resolveDeckIdFromListId(list.id);
  // Diary text is an exact source snapshot, not marketing text to rewrite.
  if (resolvedDeckId === 'spotlight-v6-diary') return cloneJson(list);
  const pages = Array.isArray(list.pages)
    ? list.pages.map((page) => sanitizeDeckPageText(destinationId, page))
    : [];
  const isGrid8Feed = String(list.id || '').startsWith('grid-8-feed');
  const postCaptionRaw = isGrid8Feed
    ? normalizeGrid8FeedPostCaption(String(list.postCaption || ''))
    : (list.postCaption ? sanitizeContentText(localizeText(list.postCaption, destinationId)) : list.postCaption);
  const postCaption = isBannedSampleCaptionText(String(postCaptionRaw || ''))
    ? localizeText('Lưu list này rồi đi Đà Lạt cho đỡ mò từng nơi nhé.', destinationId)
    : postCaptionRaw;
  const safeCoverFallback = coverTitleFallbackForDeck(destinationId, resolvedDeckId || '', String(list.id || ''));
  const safeBodyFallback = getMarketingCopy(destinationId).captionBodyFallback;
  let coverTitle = list.coverTitle
    ? sanitizeContentText(sanitizeDeckHeadline(localizeText(list.coverTitle, destinationId)))
    : list.coverTitle;
  if (isBannedSampleCaptionText(String(coverTitle || ''))) coverTitle = safeCoverFallback;
  let title = sanitizeContentText(sanitizeDeckHeadline(localizeText(list.title || '', destinationId)));
  if (isBannedSampleCaptionText(title)) title = safeCoverFallback;
  let description = sanitizeContentText(localizeText(list.description || '', destinationId));
  if (isBannedSampleCaptionText(description)) description = safeBodyFallback;
  const isSummaryNote = isThreadsLocalDeck(resolvedDeckId || '') || isTextNoteDeck(resolvedDeckId || '');
  const storedCaptionBody = isSummaryNote ? '' : (list.captionBody || (
    list.postCaption || (Array.isArray(list.captionHashtags) && list.captionHashtags.length > 0)
      ? list.description || safeBodyFallback
      : ''
  ));
  const captionBody = storedCaptionBody
    ? sanitizeContentText(localizeText(storedCaptionBody, destinationId))
    : storedCaptionBody;
  const localized = {
    ...list,
    navTitle: sanitizeContentText(localizeText(list.navTitle || '', destinationId)),
    title,
    description,
    coverTitle,
    postCaption,
    captionBody,
    captionHashtags: isSummaryNote
      ? []
      : Array.isArray(list.captionHashtags)
        ? buildCaptionHashtags(
          list.captionHashtags.map((tag) => String(tag || '').trim()).filter(Boolean),
          'lich_trinh_huu_ich',
          destinationId,
          resolvedDeckId,
        )
        : list.captionHashtags,
    pages: pages.map((page) => {
      if (page.type !== 'cover') return page;
      let pageTitle = page.title;
      let pageSubtitle = page.subtitle;
      if (isBannedSampleCaptionText(pageTitle)) pageTitle = String(coverTitle || safeCoverFallback);
      if (isBannedSampleCaptionText(pageSubtitle)) pageSubtitle = description || safeBodyFallback;
      return { ...page, title: pageTitle, subtitle: pageSubtitle };
    }),
  };
  return localized;
}

export function sanitizeDeckPageText(destinationId: DestinationId, page: DeckPage): DeckPage {
  if (page.type === 'cover') {
    let subtitle = sanitizeContentText(localizeText(page.subtitle || '', destinationId));
    if (page.layoutVariant === 'grid-8-feed') {
      subtitle = sanitizeContentText(truncateGrid8FeedCoverSubtitle(subtitle));
    } else if (page.layoutVariant === 'spotlight-v2' || page.layoutVariant === 'spotlight-v4-cover' || page.layoutVariant === 'spotlight-v5-cover' || page.layoutVariant === 'spotlight-v6-cover') {
      subtitle = '';
    }
    return {
      ...page,
      title: sanitizeContentText(sanitizeDeckHeadline(localizeText(page.title || '', destinationId))),
      subtitle,
    };
  }

  const oneWayMultiline = page.layoutVariant === 'one-way-story-road';
  const cleanPage: DeckPage = {
    ...page,
    ...(page.layoutVariant === 'itinerary-note-threads-budget' || page.layoutVariant === 'threads-expense-sheet' ? { backgroundImage: '' } : {}),
    chipText: sanitizeContentText(localizeText(page.chipText || '', destinationId)),
    title: sanitizeContentText(sanitizeDeckHeadline(localizeText(page.title || '', destinationId))),
    subtitle: oneWayMultiline
      ? normalizeEditablePageMultilineText(localizeText(page.subtitle || '', destinationId))
      : sanitizeContentText(localizeText(page.subtitle || '', destinationId)),
    items: Array.isArray(page.items)
      ? page.items.map((item) => sanitizePageItemText(item, page))
      : [],
  };

  return ensureBudgetTableTotalItem(cleanPage);
}

export function ensureBudgetTableTotalItem(page: DeckPage): DeckPage {
  if (page.type !== 'list' || page.layoutVariant !== 'budget-3n2d-table') return page;

  const items = Array.isArray(page.items) ? page.items : [];
  const totalIndex = items.findIndex((item) => {
    const key = normalizeText(`${item.id || ''} ${item.label || ''} ${item.name || ''}`);
    return key.includes('summary_total') || key.includes('tong_cong') || key.includes('tong_thanh_toan');
  });

  const categoryItems = items.filter((item) => {
    const label = String(item.label || '');
    if (!label.startsWith('Tổng|')) return false;
    const key = normalizeText(`${item.id || ''} ${item.label || ''} ${item.name || ''}`);
    return !key.includes('summary_total') && !key.includes('tong_cong') && !key.includes('tong_thanh_toan');
  });

  const computedTotal = categoryItems.length >= 4
    ? sumBudgetSummaryCategories(categoryItems.map((item) => item.metaSecondary || ''))
    : '';

  if (totalIndex >= 0) {
    const currentTotal = items[totalIndex];
    const nextSecondary = computedTotal || currentTotal.metaSecondary;
    if (nextSecondary === currentTotal.metaSecondary) return page;
    const nextItems = [...items];
    nextItems[totalIndex] = {
      ...currentTotal,
      label: currentTotal.label || 'Tổng|Tổng cộng',
      name: currentTotal.name || 'Tổng cộng',
      metaPrimary: currentTotal.metaPrimary || 'Tổng các khoản trên',
      metaSecondary: nextSecondary,
    };
    return { ...page, items: nextItems };
  }

  const totalItem: PageItem = {
    id: 'budget-3n2d-summary-total',
    label: 'Tổng|Tổng cộng',
    name: 'Tổng cộng',
    metaPrimary: 'Tổng các khoản trên',
    metaSecondary: computedTotal || '~0k',
    imageUrl: '',
    imageMapped: false,
    imageNote: '',
    imageSource: 'fallback',
    candidateImageUrls: [],
  };

  return { ...page, items: [...items, totalItem] };
}

export function sumBudgetSummaryCategories(amounts: string[]): string {
  let min = 0;
  let max = 0;
  for (const amount of amounts) {
    const range = parseBudgetCostRange(amount);
    min += range.min;
    max += range.max;
  }
  if (min <= 0 && max <= 0) return '';
  if (min === max) return formatBudgetCostAmount(min);
  if (Math.abs(max - min) <= Math.max(min, max) * 0.08) {
    return formatBudgetCostAmount(Math.round((min + max) / 2));
  }
  return `${formatBudgetCostAmount(min)} - ${formatBudgetCostAmount(max)}`;
}

export function parseBudgetCostRange(raw: string): { min: number; max: number } {
  const cleaned = String(raw || '').replace(/\s+/g, ' ').trim().toLowerCase();
  if (!cleaned || /đã tính|miễn phí|free|^0\s*đ?$/.test(cleaned)) {
    return { min: 0, max: 0 };
  }
  const parseNum = (value: string) => {
    const normalized = value.trim().replace(',', '.');
    if (normalized.includes('.') && normalized.split('.')[1]?.length === 3) {
      return Number(normalized.replace('.', '')) || 0;
    }
    return Number(normalized) || 0;
  };
  const trRange = cleaned.match(/([\d.,]+)\s*tr\s*-\s*([\d.,]+)\s*tr/);
  if (trRange) {
    return { min: parseNum(trRange[1]) * 1_000_000, max: parseNum(trRange[2]) * 1_000_000 };
  }
  const singleTr = cleaned.match(/~?\s*([\d.,]+)\s*tr/);
  if (singleTr) {
    const value = parseNum(singleTr[1]) * 1_000_000;
    return { min: value, max: value };
  }
  const kRange = cleaned.match(/([\d.,]+)\s*k\s*-\s*([\d.,]+)\s*k/);
  if (kRange) {
    return { min: parseNum(kRange[1]) * 1_000, max: parseNum(kRange[2]) * 1_000 };
  }
  const singleK = cleaned.match(/~?\s*([\d.,]+)\s*k/);
  if (singleK) {
    const value = parseNum(singleK[1]) * 1_000;
    return { min: value, max: value };
  }
  const plainVnd = cleaned.match(/([\d.,]+)\s*(?:đ|vnd|vnđ)/);
  if (plainVnd) {
    const value = parseNum(plainVnd[1]);
    return { min: value, max: value };
  }
  return { min: 0, max: 0 };
}

export function formatBudgetCostAmount(vnd: number): string {
  if (vnd <= 0) return '';
  if (vnd >= 1_000_000) {
    const tr = vnd / 1_000_000;
    const rounded = Math.round(tr * 10) / 10;
    return `~${Number.isInteger(rounded) ? rounded : rounded.toFixed(1)}tr`;
  }
  return `~${Math.round(vnd / 1000)}k`;
}

export function sanitizePageItemText(item: PageItem, page?: DeckPage): PageItem {
  const isBudgetTableItem = page?.type === 'list' && (page.layoutVariant === 'budget-3n2d-table' || page.layoutVariant === 'itinerary-note-threads-budget' || page.layoutVariant === 'threads-expense-sheet');
  const isPov3V2Stack = page?.type === 'list' && page.layoutVariant === 'pov-3-v2-stack';
  const stackTagline = isPov3V2Stack
    ? finalizePov3V2Tagline({ name: item.name, highlight: item.label || item.imageNote || '', sectionKey: item.sourceSectionKey } as GuideItem)
    : '';
  return {
    ...item,
    label: sanitizeContentText(isPov3V2Stack ? (stackTagline || item.label || '') : (item.label || '')),
    name: sanitizeContentText(item.name || ''),
    rawName: item.rawName ? sanitizeContentText(item.rawName) : item.rawName,
    metaPrimary: sanitizeContentText(item.metaPrimary || ''),
    metaSecondary: sanitizeContentText(item.metaSecondary || ''),
    imageNote: sanitizeContentText(isPov3V2Stack ? (stackTagline || item.imageNote || '') : (item.imageNote || '')),
    ...(isBudgetTableItem ? {
      imageUrl: '',
      imageMapped: false,
      imageSource: 'fallback' as const,
      imageNote: '',
      candidateImageUrls: [],
    } : {}),
  };
}

export function stripPageItemImage(item: PageItem): PageItem {
  return {
    ...item,
    imageUrl: '',
    imageMapped: false,
    imageSource: 'fallback',
    imageNote: '',
    candidateImageUrls: undefined,
  };
}

export function enforceGrid8QuaytungMenuPage(page: ListPage): ListPage {
  const photoKeptBySection = new Set<string>();
  return {
    ...page,
    backgroundImage: '',
    items: page.items.map((item) => {
      const sectionKey = String(item.label || '').trim();
      if (!String(item.imageUrl || '').trim()) return stripPageItemImage(item);
      if (photoKeptBySection.has(sectionKey)) return stripPageItemImage(item);
      photoKeptBySection.add(sectionKey);
      return item;
    }),
  };
}

export function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function tryParseJson(value: string): Record<string, unknown> | null {
  try {
    const parsed = JSON.parse(value.trim());
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) return parsed as Record<string, unknown>;
    return null;
  } catch { return null; }
}

export function normalizeCaptionPayload(
  destinationId: DestinationId,
  parsed: Record<string, unknown>,
  current: { coverTitle: string; headline: string; body: string; hashtags: string[] },
  target: DeepSeekCaptionResponse['target'],
  tone: DeepSeekCaptionResponse['tone'],
  deckId = '',
  forbiddenPlaceNames: string[] = [],
): { coverTitle: string; headline: string; body: string; hashtags: string[] } {
  const nextCoverTitle = String(
    parsed.coverTitle ?? (parsed as Record<string, unknown>).cover_title ?? parsed.cover ?? '',
  ).trim();
  const nextHeadline = String(
    parsed.headline ?? parsed.hook ?? (parsed as Record<string, unknown>).caption_text ?? '',
  ).trim();
  const nextBody = String(parsed.body ?? parsed.caption ?? '').trim();
  const nextHashtags = Array.isArray(parsed.hashtags) ? parsed.hashtags.map((h) => String(h).trim()).filter(Boolean) : [];

  const removeLayoutTerms = (value: string): string => String(value || '')
    .replace(/\b[234]\s*(?:x|×|by)\s*[234]\b/gi, '')
    .replace(/\b(?:grid|layout)\b/gi, '')
    .replace(/\b\d+\s*điểm\s*\/\s*\d+\s*trang\b/giu, '')
    .replace(/\b\d+\s*diem\s*\/\s*\d+\s*trang\b/gi, '')
    .replace(/(^|[\s([{])(?:lưới|luoi)(?=$|[\s,.;:!?)}\]])/gi, '$1')
    .replace(/(^|[\s([{])(?:bố\s*cục|bo\s*cuc)(?=$|[\s,.;:!?)}\]])/gi, '$1')
    .replace(/(^|[\s([{])(?:\d+\s*)?(?:ô|o)\s*(?:ảnh|anh|hình|hinh)(?=$|[\s,.;:!?)}\]])/gi, '$1')
    .replace(/(^|[\s([{])(?:\d+\s*)?(?:khung|khuôn|khuon)\s*(?:ảnh|anh|hình|hinh)(?=$|[\s,.;:!?)}\]])/gi, '$1')
    .replace(/\bcó\s+(đẹp|xinh|chill|ngon|hay|ổn|on)\b/gi, '$1')
    .replace(/\s{2,}/g, ' ')
    .replace(/\s+([,.!?])/g, '$1')
    .trim();
  const normalizeCoverTitle = (v: string) => {
    const maxLen = coverTitleMaxLen(deckId);
    const fallback = coverTitleFallbackForDeck(destinationId, deckId, `${deckId}:${v}:${tone}`);
    const withoutLayout = removeLayoutTerms(sanitizeContentText(sanitizeDeckHeadline(v || fallback)));
    const clean = withoutLayout.replace(/\s+/g, ' ').trim();
    // coverTitle luôn viết thường theo văn phong casual đã chốt — ép ở code thay vì chỉ nhờ AI tuân thủ.
    const finalize = (text: string) => truncateCaptionText(text, maxLen).toLowerCase();
    if (isBannedSampleCaptionText(clean)) return finalize(fallback);
    return finalize(hasForbiddenPlaceName(clean, forbiddenPlaceNames) ? fallback : clean || fallback);
  };
  const normalizeHeadline = (v: string) => {
    const fallback = localizeText('Lưu list này rồi đi Đà Lạt cho đỡ mò từng nơi nhé.', destinationId);
    const withoutLayout = removeLayoutTerms(sanitizeContentText(v || fallback));
    const withoutPlaces = removeForbiddenPlaceNames(withoutLayout, forbiddenPlaceNames);
    const clean = sanitizeContentText(withoutPlaces).replace(/\s+/g, ' ').trim();
    if (isBannedSampleCaptionText(clean)) return truncateCaptionText(fallback, 80);
    return truncateCaptionText(hasForbiddenPlaceName(clean, forbiddenPlaceNames) ? fallback : clean || fallback, 80);
  };
  // Người dùng đã quyết định bỏ hẳn mô tả (body) khỏi app — ép cứng luôn rỗng bất kể AI trả về gì,
  // không chỉ khi AI trả rỗng. Không dựa vào việc AI có tuân thủ hướng dẫn prompt hay không.
  const normalizeBody = (_v: string) => '';
  const normalizeHashtags = (values: string[]): string[] => buildCaptionHashtags(values, tone, destinationId, deckId || undefined);

  if (target === 'cover_title') {
    return {
      coverTitle: normalizeCoverTitle(nextCoverTitle || current.coverTitle),
      headline: normalizeHeadline(current.headline),
      body: normalizeBody(current.body),
      hashtags: normalizeHashtags(current.hashtags),
    };
  }
  if (target === 'headline') {
    return {
      coverTitle: normalizeCoverTitle(current.coverTitle),
      headline: normalizeHeadline(nextHeadline),
      body: normalizeBody(current.body),
      hashtags: normalizeHashtags(current.hashtags),
    };
  }
  if (target === 'body') {
    return {
      coverTitle: normalizeCoverTitle(current.coverTitle),
      headline: normalizeHeadline(current.headline),
      body: normalizeBody(nextBody),
      hashtags: normalizeHashtags(current.hashtags),
    };
  }
  if (target === 'hashtags') {
    return {
      coverTitle: normalizeCoverTitle(current.coverTitle),
      headline: normalizeHeadline(current.headline),
      body: normalizeBody(current.body),
      hashtags: normalizeHashtags(nextHashtags),
    };
  }
  return {
    coverTitle: normalizeCoverTitle(nextCoverTitle),
    headline: normalizeHeadline(nextHeadline),
    body: normalizeBody(nextBody),
    hashtags: normalizeHashtags(nextHashtags),
  };
}
