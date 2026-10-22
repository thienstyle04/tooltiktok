import type { DeckPage, GuideItem, PageItem, PartnerRotationHistory, SectionKey, WorkbookItemsBySection } from '../../../common/interfaces/guide.types';
import { normalizeText, stableHash } from './image-resolver';
import { photoKeys as sharedPhotoKeys, withExactCachedPhotoIdentity } from './partner-rotation';
import { isRequiredPartner } from './required-partners';

export const THREADS_GRID6_ID = 'threads-grid6-collage';
export const THREADS_GRID6_VERSION = 1;
export const GRID6_PLAY_SECTIONS: SectionKey[] = ['check_in', 'khu_du_lich', 'hoat_dong', 'dia_diem_lich_su'];
const groups: SectionKey[][] = [GRID6_PLAY_SECTIONS, GRID6_PLAY_SECTIONS, ['cafe'], ['quan_an']];
const labels = ['Đi chơi / check-in', 'Đi chơi / check-in', 'Cà phê', 'Quán ăn'];
const identity = (item: { name: string }) => normalizeText(item.name);
const photoKeys = (url: string): string[] => withExactCachedPhotoIdentity(() => sharedPhotoKeys(url));
const portable = (url: string) => /^https?:\/\//i.test(url) || /^\/assets\/drive-file\?/.test(url);

// Match the conversational/question-led voice of existing Threads templates,
// without recycling their three captions or inventing personal experiences.
export function threadsGrid6Hooks(): string[] {
  return [
    '24 chỗ Đà Lạt đây nè. Mấy ní chọn giúp 3 chỗ cho chuyến tới coi 👀',
    'Đi Đà Lạt chọn quán ăn trước hay chỗ chơi trước? Có 24 gợi ý để bàn kèo nè.',
    '24 chỗ Đà Lạt mà chỉ được chọn 5. Hội mình chốt những đâu?',
    'Team cà phê hay team đi chơi? 24 chỗ Đà Lạt này chia phe được chưa ☕',
    'Lưu 24 chỗ Đà Lạt rồi, giờ thiếu mỗi đứa bạn chịu chốt lịch 😭',
    'Đà Lạt có 24 gợi ý này. Chỗ nào hợp gu mấy ní nhất?',
    'Một ngày ở Đà Lạt, mấy ní xếp được kèo nào từ 24 chỗ này?',
    '24 chỗ Đà Lạt để khỏi hỏi “giờ đi đâu?” mỗi lần ra đường nè.',
    'Muốn đổi kèo Đà Lạt? Thử chọn trong 24 chỗ này coi 👇',
    '24 chỗ Đà Lạt: ăn uống, cà phê hay check-in sẽ mở màn chuyến đi?',
    'Hội hay lưu bài nhưng chưa đi đâu, 24 chỗ Đà Lạt này chốt được kèo chưa?',
    '24 gợi ý Đà Lạt cho nhóm bạn mỗi người một gu. Mấy ní chọn sao?',
    'Đi Đà Lạt thích thong thả hay tranh thủ nhiều điểm? Có 24 chỗ để chọn nè.',
    '24 chỗ Đà Lạt, ai có chỗ ruột trong này thì lên tiếng coi 👀',
    'Nếu rủ bạn mới đi Đà Lạt, mấy ní chọn chỗ nào trong 24 gợi ý này?',
    '24 chỗ Đà Lạt để cả hội cùng chọn. Đừng để một người ôm hết vụ lên plan nha.',
    'Đà Lạt đi đâu tiếp? 24 chỗ này có kèo nào mấy ní đang muốn thử không?',
    'Có 24 chỗ Đà Lạt đây rồi. Mấy ní chọn view, món ăn hay không gian?',
    '24 gợi ý Đà Lạt cho lần hẹn tới. Đi với bạn thân thì chọn chỗ nào?',
    'Ai cũng bảo “đi đâu cũng được” thì gửi 24 chỗ Đà Lạt này cho cả nhóm coi 😌',
    '24 chỗ Đà Lạt, chọn một điểm mở đầu và một quán kết ngày đi mấy ní.',
    'Một chuyến Đà Lạt không cần ghé hết 24 chỗ đâu. Giữ lại vài chỗ đúng gu thôi.',
    '24 gợi ý Đà Lạt này, chỗ nào mấy ní muốn dành nhiều thời gian nhất?',
    'Lên Đà Lạt chỉ để ngồi cà phê có phí không? 24 chỗ này cho hội mình bàn tiếp.',
    '24 chỗ Đà Lạt để lựa kèo: sáng đi chơi hay sáng kiếm món ăn trước?',
    'Nếu chỉ thêm một điểm vào plan Đà Lạt, mấy ní lấy điểm nào trong 24 chỗ này?',
    '24 gợi ý Đà Lạt cho hội chưa thống nhất được ăn gì, chơi đâu 👇',
    'Kèo Đà Lạt lần tới muốn chill hay muốn nhiều ảnh? Chọn trong 24 chỗ này nha.',
    '24 chỗ Đà Lạt mà đi một mình thì mấy ní sẽ ghé đâu trước?',
    'Gửi 24 gợi ý Đà Lạt cho đứa bạn chuyên hỏi “có chỗ nào không?” nè.',
  ];
}

export function threadsGrid6PostCaptions(): string[] {
  return [
    'Đi chơi, cà phê rồi tới ăn uống, chia nhóm sẵn cho mấy ní dễ bàn kèo. Ai có chỗ ruột muốn thêm thì thả tên cho hội cùng tham khảo nha 👇',
    'Tui gom tên vào từng ô để đỡ cảnh lưu ảnh xong quên mất chỗ nào. Mấy ní thường chọn quán trước hay chốt lịch đi chơi trước z?',
    'Một bên thích ngồi chill, một bên muốn đi khắp nơi 😭 Nhóm mấy ní có giống vậy không, thường dung hòa kiểu gì?',
    'Đừng cố nhét hết vào một chuyến nha. Chọn vài điểm hợp gu rồi kiểm tra đường đi, giờ mở cửa trước khi chốt kèo nè.',
    'Có cả điểm đi chơi/check-in, quán cà phê lẫn quán ăn. Hội đi cùng toàn người khác gu thì mỗi người chọn một chỗ coi, biết đâu ra plan luôn 👀',
    'Lưu lại để bàn với hội bạn nha. Chỗ nào từng ghé rồi thì chia sẻ cảm nhận thật, để người đi sau có thêm góc nhìn nè.',
    'Kèo đi chơi thường khó nhất đoạn cả nhóm chưa ai chịu quyết 😭 Thử gửi bộ ảnh này rồi cho mỗi người đề cử một chỗ xem sao.',
    'Ai có quán quen hay điểm muốn giới thiệu thêm thì thả tên bên dưới nha. Có trải nghiệm cụ thể càng dễ cho hội mình tham khảo.',
    'Đi thong thả vẫn vui mà, đâu nhất thiết chạy kín lịch. Mấy ní thích dành nguyên buổi cho cà phê hay chia ra ghé vài điểm?',
    'Trong nhóm có đứa lo chụp ảnh, đứa lo kiếm món ăn không mng? Tag nhẹ để chia việc lên plan, đừng để một người lo hết nha 😌',
    'Tên địa điểm có trên từng ảnh nè. Trước khi đi nhớ xem lại thông tin hiện tại của quán và chọn các điểm tiện đường cho mình nha.',
    'Bộ này để tham khảo rồi tự chọn theo gu thôi nha, không phải lịch trình bắt buộc. Mấy ní thấy cần thêm kiểu địa điểm nào nữa?',
    'Ăn gì với uống cà phê ở đâu mà bàn mãi chưa xong thì cho mỗi người chọn một ô đi 😭 Nhóm mấy ní ai thường là người chốt cuối?',
    'Đi cùng bạn thân với đi cùng gia đình chắc chọn kèo khác nhau ha. Hội mình thường cân nhắc điều gì đầu tiên khi lên lịch?',
    'Ai thích đi một mình vào chia sẻ cách chọn điểm với nha. Ưu tiên tiện đường, không gian hay chỗ có món mình thích hơn?',
    'Có người chỉ cần quán ngồi lâu, có người muốn ghé nhiều điểm mới chịu. Mấy ní thuộc team nào, kể nghe để hội còn tìm đồng đội 👇',
    'Lưu để dành cho lúc cả nhóm cần gợi ý nè. Ai muốn thêm lựa chọn thì góp tên, nhớ nói rõ là quán ăn, cà phê hay điểm đi chơi nha.',
    'Không cần cả nhóm thích cùng một kiểu đâu. Chọn luân phiên mỗi người một điểm có ổn không, hay mấy ní có cách nào dễ thống nhất hơn?',
  ];
}

// Description has its own cycle, not a fixed three-caption mapping to a hook.
export function threadsGrid6PostCaption(hook: string, history: string[] = [], seed = hook): string {
  return pickThreadsGrid6Hook(threadsGrid6PostCaptions(), history, 'post:' + seed);
}

// Replay committed creation order, including completed cycles. A set of all
// historical titles cannot distinguish cycle two from a fully exhausted pool.
export function pickThreadsGrid6Hook(hooks: string[], history: string[], seed: string): string {
  const key = (value: string) => value.normalize('NFC').replace(/\s+/g, ' ').trim().toLowerCase();
  const pool = [...new Map(hooks.filter(hook => hook.trim()).map(hook => [key(hook), hook])).values()];
  if (!pool.length) return '';
  const valid = new Set(pool.map(key)), used = new Set<string>(); let last = '';
  for (const title of history) if (valid.has(key(title))) {
    if (used.size === valid.size) used.clear();
    last = key(title); used.add(last);
  }
  if (used.size === valid.size) used.clear();
  const fresh = pool.filter(hook => !used.has(key(hook)));
  const different = fresh.filter(hook => key(hook) !== last);
  const choices = different.length ? different : fresh;
  return choices[stableHash(seed) % choices.length];
}

export function grid6OwnPhotos(item: GuideItem): string[] {
  // diaryImageUrls is the direct Link_drive pool, before library-name matching.
  if (item.imageSource === 'fallback') return [];
  const candidates = item.diaryImageUrls !== undefined ? item.diaryImageUrls : item.imageSource === 'manual' ? [item.imageUrl, ...(item.candidateImageUrls || [])] : [];
  const maps = new Set([item.mapImageUrl, ...(item.mapCandidateImageUrls || [])].filter(Boolean).flatMap(url => photoKeys(url!)));
  return [...new Set(candidates)].filter(url => portable(url) && !photoKeys(url).some(key => maps.has(key)));
}

export type Grid6BuildOptions = {
  itemsBySection: WorkbookItemsBySection; coverImageUrls: string[]; seed: string; hook: string;
  usedImages?: Set<string>; usedItems?: Set<string>;
  previousPages?: DeckPage[][];
};

// Feed the joint matcher the same unspent partner pool that the shared rotation
// engine will enforce. Otherwise a cover/regular photo can steal a partner's
// last unspent image and every later rotation retry would repeat that conflict.
export function restrictGrid6PhotoCycles(restricted: WorkbookItemsBySection, original: WorkbookItemsBySection, history: PartnerRotationHistory): void {
  const sources = Object.values(original).flat();
  for (const item of Object.values(restricted).flat()) if (item.isPartner) {
    const state = history[`venue|${identity(item)}`]; if (!state) continue;
    const ownPool = sources.filter(source => identity(source) === identity(item)).flatMap(grid6OwnPhotos);
    const used = new Set(state.usedPhotos);
    const fresh = ownPool.filter(url => !photoKeys(url).some(key => used.has(key)));
    if (!fresh.length) continue;
    const keys = new Set(fresh.flatMap(photoKeys));
    const urls = grid6OwnPhotos(item).filter(url => photoKeys(url).some(key => keys.has(key)));
    item.imageUrl = urls[0] || ''; item.candidateImageUrls = urls; item.diaryImageUrls = urls;
  }
}

// Joint constrained selection: never select six venues per page independently.
// Names are the cross-section identity; image assignment is a second bipartite
// matching problem so shared image aliases can be recovered by choosing another photo.
export function buildThreadsGrid6Pages(options: Grid6BuildOptions): DeckPage[] {
  const { itemsBySection, seed, hook } = options;
  if (!hook.trim()) throw new Error('Threads · Lưới 6 ảnh: thiếu hook thường của nguồn; chưa tạo list.');
  const covers = [...new Set(options.coverImageUrls)].filter(portable);
  if (!covers.length) throw new Error('Threads · Lưới 6 ảnh: thiếu 1 ảnh bìa hợp lệ trong kho nền của nguồn.');
  const pools = groups.map(keys => keys.flatMap(key => (itemsBySection[key] || []).filter(item => item.name.trim() && grid6OwnPhotos(item).length)));
  const count = (rows: GuideItem[]) => new Set(rows.map(identity)).size;
  const shortages: string[] = [];
  for (const [page, required] of [[0, 12], [2, 6], [3, 6]]) {
    const pool = pools[page], partners = count(pool.filter(item => item.isPartner)), regular = count(pool.filter(item => !item.isPartner));
    const maximum = Math.min(partners, page === 0 ? 4 : 2) + regular;
    if (count(pool) < required || maximum < required) shortages.push(`${labels[page]}: ${count(pool)}/${required} địa điểm có ảnh riêng, ${partners} đối tác / ${regular} thường; thiếu ít nhất ${Math.max(required - count(pool), required - maximum)} địa điểm/ảnh hợp lệ`);
  }
  if (shortages.length) throw new Error(`Threads · Lưới 6 ảnh: ${shortages.join('; ')}.`);
  if (!pools.flat().some(item => item.isPartner)) throw new Error('Threads · Lưới 6 ảnh: thiếu ít nhất 1 đối tác có ảnh riêng đúng nhóm.');
  const selected: GuideItem[][] = [[], [], [], []], usedNames = new Set<string>();
  let solution: { rows: GuideItem[][]; images: string[] } | undefined, visits = 0;
  const usedPhotos = new Set([...(options.usedImages || [])].flatMap(photoKeys));
  const histories = new Map<string, string[]>();
  for (const pages of options.previousPages || []) for (const page of pages) {
    if (page.type === 'cover') histories.set('cover', [...(histories.get('cover') || []), page.backgroundImage]);
    else for (const item of page.items) { const key = identity(item); histories.set(key, [...(histories.get(key) || []), item.imageUrl]); }
  }
  const orderPhotos = (urls: string[], key: string) => {
    const photoKey = (url: string) => { const keys = photoKeys(url); return keys[keys.length - 1]; };
    const valid = new Set(urls.map(photoKey)), used = new Set<string>(), prior = histories.get(key) || [];
    // Reconstruct completed cycles from successful snapshots, not a monotonic
    // set that would make all photos equally "used" forever after cycle one.
    for (const url of prior) if (valid.has(photoKey(url))) { if (used.size === valid.size) used.clear(); used.add(photoKey(url)); }
    if (used.size === valid.size) used.clear();
    const last = prior.length ? photoKey(prior[prior.length - 1]) : '';
    const spent = (url: string) => options.previousPages !== undefined ? used.has(photoKey(url)) : photoKeys(url).some(id => usedPhotos.has(id));
    return urls.slice().sort((a, b) => Number(spent(a)) - Number(spent(b)) || Number(photoKey(a) === last) - Number(photoKey(b) === last) || stableHash(`${seed}:${key}:${a}`) - stableHash(`${seed}:${key}:${b}`));
  };
  const assignImages = (): string[] | undefined => {
    const rows = selected.flat(), choices = [orderPhotos(covers, 'cover'), ...rows.map(item => orderPhotos(grid6OwnPhotos(item), identity(item)))];
    const owner = new Map<string, number>(), chosen = new Map<number, string>();
    const assign = (index: number, seen: Set<string>): boolean => {
      for (const url of choices[index]) {
        const keys = photoKeys(url), key = keys[keys.length - 1];
        if (seen.has(key)) continue;
        seen.add(key);
        const occupied = owner.get(key);
        if (occupied === undefined || assign(occupied, seen)) { owner.set(key, index); chosen.set(index, url); return true; }
      }
      return false;
    };
    for (const index of choices.map((_, i) => i).sort((a, b) => choices[a].length - choices[b].length)) if (!assign(index, new Set())) return;
    const images = choices.map((_, index) => chosen.get(index)!);
    const keys = new Set<string>();
    for (const url of images) { if (photoKeys(url).some(key => keys.has(key))) return; photoKeys(url).forEach(key => keys.add(key)); }
    return images;
  };
  const search = (): boolean => {
    if (++visits > 100000) return false;
    if (selected.every(rows => rows.length === 6)) {
      if (!selected.flat().some(item => item.isPartner)) return false;
      const images = assignImages();
      if (!images) return false;
      solution = { rows: selected.map(rows => rows.slice()), images }; return true;
    }
    const available = selected.map((rows, page) => rows.length === 6 ? [] : pools[page].filter(item => !usedNames.has(identity(item)) && (!item.isPartner || rows.filter(row => row.isPartner).length < 2)));
    for (let page = 0; page < 4; page++) if (selected[page].length < 6 && count(available[page]) < 6 - selected[page].length) return false;
    const page = [0, 1, 2, 3].filter(p => selected[p].length < 6).sort((a, b) => count(available[a]) - (6 - selected[a].length) - count(available[b]) + (6 - selected[b].length))[0];
    const usage = (item: GuideItem) => options.usedItems?.has(item.id) || options.usedItems?.has(identity(item));
    const candidates = available[page].sort((a, b) => Number(isRequiredPartner(b)) - Number(isRequiredPartner(a)) || Number(b.isPartner) - Number(a.isPartner)
      || (page < 2 ? selected[0].concat(selected[1]).filter(item => item.sectionKey === a.sectionKey).length - selected[0].concat(selected[1]).filter(item => item.sectionKey === b.sectionKey).length : 0)
      || Number(usage(a) || false) - Number(usage(b) || false) || stableHash(`${seed}:${page}:${selected[page].length}:${a.id}`) - stableHash(`${seed}:${page}:${selected[page].length}:${b.id}`));
    const tried = new Set<string>();
    for (const item of candidates) {
      const key = `${identity(item)}|${item.sectionKey}|${item.isPartner}`;
      if (tried.has(key)) continue; tried.add(key);
      selected[page].push(item); usedNames.add(identity(item));
      if (search()) return true;
      selected[page].pop(); usedNames.delete(identity(item));
    }
    return false;
  };
  if (!search() || !solution) throw new Error(`Threads · Lưới 6 ảnh: chưa tìm được đủ 24 địa điểm riêng và 25 ảnh khác nội dung giữa các nhóm (đi chơi ${count(pools[0])}/12, cà phê ${count(pools[2])}/6, quán ăn ${count(pools[3])}/6). Kiểm tra địa điểm trùng nhóm hoặc ảnh trùng/hỏng${visits > 100000 ? '; đã chạm giới hạn tìm kiếm' : ''}. Chưa lưu list.`);
  const result = solution as { rows: GuideItem[][]; images: string[] };
  const pages: DeckPage[] = [{ type: 'cover', title: hook, subtitle: '', backgroundImage: result.images[0], layoutVariant: 'threads-grid6-cover', canvasPreset: 'tiktok-9x16', textFontSize: 38, titlePlacement: 'mid-left' }];
  result.rows.forEach((rows, page) => pages.push({ type: 'list', title: '', subtitle: '', chipText: labels[page], chipTone: 'pine', backgroundImage: '', layoutVariant: 'threads-grid6-page', canvasPreset: 'tiktok-9x16', textFontSize: 32,
    items: rows.map((item, index): PageItem => ({ id: item.id, sourceKey: item.id, sourceSectionKey: item.sectionKey, rotationGroup: `grid6-page-${page}`, name: item.name, rawName: item.name, label: '', metaPrimary: '', metaSecondary: '', imageUrl: result.images[1 + page * 6 + index], candidateImageUrls: grid6OwnPhotos(item), imageMapped: true, imageSource: 'manual', imageNote: '', isPartner: item.isPartner })) }));
  assertThreadsGrid6Pages(pages);
  return pages;
}

export function assertThreadsGrid6Pages(pages: DeckPage[]): void {
  if (pages.length !== 5 || pages[0].type !== 'cover' || !pages[0].title.trim()) throw new Error('Threads · Lưới 6 ảnh cần đúng 5 trang và hook bìa.');
  const names = new Set<string>(), images = new Set<string>(); let partners = 0;
  const addImage = (url: string) => { if (!url || photoKeys(url).some(key => images.has(key))) throw new Error('Threads · Lưới 6 ảnh: thiếu ảnh hoặc trùng ảnh trong 25 vị trí.'); photoKeys(url).forEach(key => images.add(key)); };
  addImage(pages[0].backgroundImage);
  pages.slice(1).forEach((page, index) => {
    if (page.type !== 'list' || page.items.length !== 6 || page.items.filter(item => item.isPartner).length > 2) throw new Error(`Threads · Lưới 6 ảnh: trang ${index + 2} cần đủ 6 ô và tối đa 2 đối tác.`);
    for (const item of page.items) {
      if (!item.sourceSectionKey || !groups[index].includes(item.sourceSectionKey) || !identity(item) || names.has(identity(item))) throw new Error('Threads · Lưới 6 ảnh: địa điểm trùng hoặc sai nhóm.');
      names.add(identity(item)); addImage(item.imageUrl); if (item.isPartner) partners++;
    }
  });
  if (!partners) throw new Error('Threads · Lưới 6 ảnh: cần ít nhất 1 đối tác thực sự hiển thị.');
}

// Explicit illustrations, never exported as generated content or rotation history.
export function buildThreadsGrid6Example(): DeckPage[] {
  return [{ type: 'cover', title: threadsGrid6Hooks()[0], subtitle: '', backgroundImage: '', layoutVariant: 'threads-grid6-cover', canvasPreset: 'tiktok-9x16', textFontSize: 38, titlePlacement: 'mid-left' },
    ...groups.map((keys, page): DeckPage => ({ type: 'list', title: '', subtitle: '', chipText: labels[page], chipTone: 'pine', backgroundImage: '', layoutVariant: 'threads-grid6-page', canvasPreset: 'tiktok-9x16', textFontSize: 32,
      items: Array.from({ length: 6 }, (_, index) => ({ name: `${labels[page]} · Ô ${index + 1}`, label: '', metaPrimary: '', metaSecondary: '', imageUrl: '', imageMapped: false, imageSource: 'fallback', imageNote: 'Minh họa — chưa có dữ liệu', sourceSectionKey: keys[0] })) }))];
}
