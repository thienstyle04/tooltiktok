export const THREADS_FOOD_DECK_ID = 'threads-food-local';
export const THREADS_CAFE_DECK_ID = 'threads-cafe-local';
export const THREADS_MIX_DECK_ID = 'threads-mix-local';
export const THREADS_MIX_TEXT_DECK_ID = 'threads-mix-text';

export function isThreadsLocalDeck(deckId) {
  return deckId === THREADS_FOOD_DECK_ID || deckId === THREADS_CAFE_DECK_ID
    || deckId === THREADS_MIX_DECK_ID || deckId === THREADS_MIX_TEXT_DECK_ID;
}

export function isThreadsTextOnlyDeck(deckId) {
  return deckId === THREADS_MIX_TEXT_DECK_ID;
}

export function compactThreadsLocalAddress(address) {
  const fullAddress = String(address || '').replace(/\s+/g, ' ').trim();
  const parts = fullAddress.split(',').map((part) => part.trim()).filter(Boolean);
  if (parts.length < 2) return fullAddress;
  const locality = parts.at(-1);
  if (!/^Đà Lạt$/i.test(locality)) {
    return /[-–—]\s*Đà Lạt$/i.test(locality)
      ? locality.replace(/^(?:phường\s+|p\.\s*)/i, '').replace(/\s*[-–—]\s*Đà Lạt$/i, ' - Đà Lạt')
      : fullAddress;
  }
  const previous = parts.at(-2);
  if (/^(?:phường\s+|p\.\s*)?[^\d]+$/i.test(previous)
    && !/(?:^|\s)(?:đường|thôn|tổ|hẻm|ngõ)(?:\s|$)/i.test(previous)) {
    return previous.replace(/^(?:phường\s+|p\.\s*)/i, '') + ' - Đà Lạt';
  }
  return fullAddress;
}

export function threadsFoodPayload(list) {
  const templateName = String(list?.id || '').startsWith(THREADS_CAFE_DECK_ID) ? 'Cà phê'
    : String(list?.id || '').startsWith(THREADS_MIX_TEXT_DECK_ID) ? 'Tổng hợp chữ'
      : String(list?.id || '').startsWith(THREADS_MIX_DECK_ID) ? 'Tổng hợp' : 'Quán ăn';
  const isTextOnly = templateName === 'Tổng hợp chữ';
  const isMix = templateName === 'Tổng hợp' || isTextOnly;
  const targetCount = isTextOnly ? 12 : 10;
  const targetPartners = isTextOnly ? 6 : 5;
  const targetPhotos = isTextOnly ? 0 : 6;
  const pages = Array.isArray(list?.pages) ? list.pages : [];
  const items = pages.length === 1 && pages[0]?.type === 'list' ? pages[0].items || [] : [];
  const names = items.map((item) => String(item.name || '').trim());
  const partners = items.filter((item) => item.isPartner === true);
  const others = items.filter((item) => item.isPartner !== true && (isMix || item.isLocal === true));
  const photos = items.filter((item) => String(item.imageUrl || '').trim());
  const partnerPhotos = photos.filter((item) => item.isPartner === true);
  const otherPhotos = photos.filter((item) => item.isPartner !== true && (isMix || item.isLocal === true));
  if (items.length !== targetCount || partners.length !== targetPartners || others.length !== targetPartners
    || names.some((name) => !name) || new Set(names.map((name) => name.toLocaleLowerCase('vi'))).size !== targetCount) {
    throw new Error('List Threads ' + templateName + ` phải có đúng ${targetCount} tên không trùng: ${targetPartners} đối tác và ${targetPartners} địa điểm thường. Hãy tạo lại list.`);
  }
  if (partners.some((item) => !String(item.metaPrimary || '').trim())) {
    throw new Error('List Threads ' + templateName + ' thiếu địa chỉ đối tác. Hãy tạo list mới rồi xuất lại.');
  }
  if (isMix && new Set(items.map((item) => item.sourceSectionKey)).size < 4) {
    throw new Error('List Threads ' + templateName + ' phải có địa điểm từ ít nhất 4 nhóm dữ liệu. Hãy tạo lại list.');
  }
  if (photos.length !== targetPhotos || (!isTextOnly && (partnerPhotos.length !== 3 || otherPhotos.length !== 3))
    || new Set(photos.map((item) => item.imageUrl)).size !== targetPhotos
    || photos.some((item) => item.imageMapped !== true || item.imageSource !== 'manual')) {
    throw new Error(isTextOnly ? 'List Threads Tổng hợp chữ không được chứa ảnh. Hãy tạo lại list.'
      : 'List Threads ' + templateName + ' phải có đúng 6 ảnh riêng không trùng (3 đối tác, 3 địa điểm thường). Hãy tạo lại list.');
  }
  const caption = String(list.postCaption || '').trim();
  if (!caption) throw new Error('List Threads ' + templateName + ' đang thiếu hook/caption. Hãy tạo lại list.');
  const txt = '\uFEFF' + caption + '\r\n\r\n'
    + items.map((item) => '- ' + String(item.name).trim()
      + (item.isPartner ? ' (' + compactThreadsLocalAddress(item.metaPrimary) + ')' : '')).join('\r\n') + '\r\n';
  return { txt, photos, partnerNames: partners.map((item) => String(item.name).trim()) };
}

export async function addThreadsFoodFiles(folder, list, loadPhoto, safeName = (name) => name, createPartnerXlsx) {
  const { txt, photos, partnerNames } = threadsFoodPayload(list);
  if (typeof createPartnerXlsx !== 'function') throw new Error('Chưa cấu hình tạo XLSX đối tác cho mẫu Threads Local.');
  const downloaded = [];
  for (const item of photos) downloaded.push({ item, ...(await loadPhoto(item)) });
  const partnerXlsx = await createPartnerXlsx(partnerNames);
  folder.file('noi-dung.txt', txt);
  folder.file('doi-tac.xlsx', partnerXlsx);
  if (downloaded.length) {
    const images = folder.folder('anh');
    downloaded.forEach(({ item, blob, extension }, index) => {
      images.file(String(index + 1).padStart(2, '0') + '-' + safeName(item.name) + '.' + extension, blob, { compression: 'STORE' });
    });
  }
}
