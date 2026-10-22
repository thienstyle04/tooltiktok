import type { DeckPage, GuideDeckList, GuideItem, ListPage, SectionKey, WorkbookItemsBySection } from '../../../common/interfaces/guide.types';
import { normalizeText, stableHash } from './image-resolver';
import { isRequiredPartner } from './required-partners';

export const NOTE_DARK_ID = 'threads-note-dark-list';
export const NOTE_DARK_NAME = 'Note 01 · Đen tối giản';
export const NOTE_DARK_VERSION = 1;
export const NOTE_GROUPS: { label: string; keys: SectionKey[] }[] = [
  { label: 'Cà phê', keys: ['cafe'] },
  { label: 'Đi chơi / check-in', keys: ['check_in', 'khu_du_lich', 'hoat_dong', 'dia_diem_lich_su'] },
  { label: 'Quán ăn', keys: ['quan_an'] },
];
const key = (name: string) => normalizeText(name).replace(/[^a-z0-9]/g, '');

export function noteDarkCaptions(): string[] {
  return [
    'Note Đà Lạt gom sẵn cà phê, đi chơi với quán ăn nè. Mấy ní chọn giúp một kèo cho chuyến tới coi 👀',
    'Có 18 cái tên rồi mà vẫn chưa chốt lịch được với hội bạn 😭 Nhóm mấy ní ai thường là người quyết cuối?',
    'Danh sách Đà Lạt dạng note cho dễ lưu nè. Ai có chỗ ruột muốn thêm thì thả tên xuống dưới nha 👇',
    'Một nhóm mê cà phê, một nhóm chỉ lo ăn. Chia mỗi người chọn một chỗ trong note này có ổn khum?',
    '18 gợi ý Đà Lạt, chọn vài chỗ hợp gu thôi nha. Mấy ní thích đi thong thả hay ghé nhiều điểm?',
    'Ai cũng bảo đi đâu cũng được thì đưa cái note này cho cả nhóm chọn coi 😌',
    'Đi Đà Lạt thích chốt quán ăn trước hay điểm đi chơi trước? Tui gom tên theo nhóm để dễ bàn kèo nè.',
    'Note này để tham khảo chứ hông phải lịch chạy KPI nha. Mỗi nhóm giữ lại một chỗ thì mấy ní chọn đâu?',
    'Có danh sách rồi, giờ cần một đứa bạn chịu chốt ngày đi nữa thôi 😭 Tag nhẹ đồng đội vô lựa kèo nè.',
    'Cà phê, đi chơi rồi ăn uống, hội mình muốn bắt đầu từ nhóm nào trước?',
    'Mấy ní lưu địa điểm bằng note hay bằng ảnh? Tui thử gom tên một trang cho dễ tìm lại nè.',
    'Đà Lạt lần tới chưa biết đi đâu thì mở note này bàn với hội bạn nha. Thiếu kiểu địa điểm nào nữa mng?',
    'Một ngày rảnh ở Đà Lạt, chỉ được chọn ba cái tên trong này. Mấy ní xếp kèo sao?',
    'Hội chuyên lên plan vào góp ý nhẹ cái note này coi. Chọn điểm theo gu hay ưu tiên tiện đường hơn?',
    'Ai có chỗ quen trong danh sách thì kể trải nghiệm thật cho hội tham khảo với nha 👇',
    'Lưu tên một đống mà chưa ghé được bao nhiêu có phải chuyện chung không mng? Cùng chọn một kèo thôi nè.',
    'Đi với bạn thân và đi với gia đình chắc chọn khác nhau ha. Mấy ní sẽ giữ lại những cái tên nào?',
    '18 địa điểm chia ba nhóm rõ ràng nè. Ai thích quán ăn hơn cà phê thì giơ tay coi 👀',
    'Note đi chơi Đà Lạt không cần dài vô tận đâu. Chọn vài chỗ muốn ghé nhất rồi tính đường đi nha.',
    'Cả nhóm mỗi người một gu thì thử luân phiên chọn điểm xem sao. Note này có kèo nào hợp hội mấy ní không?',
    'Có tên quán rồi nhớ kiểm tra giờ mở cửa trước khi đi nha. Mấy ní có thói quen gọi hỏi trước không?',
    'Ai hay nhận nhiệm vụ lên lịch trình cho cả nhóm chắc hiểu nỗi khổ chọn quán 😭 Gửi note này cho mọi người cùng chọn nè.',
    'Team ngồi một quán cả buổi với team đi nhiều chỗ có đi chung được không mng? Bàn kèo từ danh sách này thử coi.',
    'Đà Lạt có kèo ăn uống lẫn đi chơi trong note này. Hội mình muốn thêm nhóm nào cho lần sau?',
    'Không có lịch cố định, chỉ có mấy cái tên để chọn theo gu thôi nha. Ai muốn ghé đâu trước?',
    'Gửi note này cho đứa bạn mỗi lần đi chơi đều hỏi có gợi ý gì không nè 😌',
    'Mấy ní thường chọn địa điểm theo món ăn, không gian hay người đi cùng? Chốt thử vài cái tên bên dưới coi.',
    'Cuộc họp chọn kèo Đà Lạt bắt đầu nè. Mỗi người đề cử một chỗ trong note, đừng ai nói tùy nữa nha 😭',
    'Đi một mình thì mấy ní thích cà phê hay đi chơi hơn? Có vài gợi ý để tự lựa trong note này nè.',
    'Một trang note để cả hội dễ xem lại. Có địa điểm muốn góp thêm thì ghi rõ tên với nhóm giúp tui nha 👇',
  ];
}

export function pickNoteCaption(history: string[], seed: string): string {
  const pool = noteDarkCaptions(), used = new Set<string>(); let last = '';
  for (const caption of history) if (pool.includes(caption)) {
    if (used.size === pool.length) used.clear();
    used.add(caption); last = caption;
  }
  if (used.size === pool.length) used.clear();
  const fresh = pool.filter(c => !used.has(c) && c !== last);
  return fresh[stableHash(seed) % fresh.length];
}

export function buildNoteDarkPages(items: WorkbookItemsBySection, seed: string, history: GuideDeckList[] = [], requiredNames?: string[]): DeckPage[] {
  const all = Object.values(items).flat(), partnerKeys = new Set(all.filter(x => x.isPartner).map(x => key(x.name)));
  const required = [...new Set((requiredNames ?? all.filter(isRequiredPartner).map(item=>item.name)).map(key))];
  if(required.length>6)throw Error(`${NOTE_DARK_NAME}: tối đa 6 đối tác, mỗi nhóm tối đa 2; chưa lưu list.`);
  const pools = NOTE_GROUPS.map(group => [...new Map(group.keys.flatMap(section => items[section] || [])
    .filter(item => key(item.name)).map(item => [key(item.name), { ...item, isPartner: partnerKeys.has(key(item.name)) }])).values()]);
  const prior = history.flatMap(list => list.pages).filter(page => page.type === 'list').flatMap(page => page.type === 'list' ? page.items : []);
  const last = history.length ? history[history.length - 1].pages.flatMap(p => p.type === 'list' ? p.items : []) : [];
  pools.forEach((pool, index) => {
    const regular = pool.filter(i => !i.isPartner).length, partners = pool.length - regular;
    if (regular + Math.min(2, partners) < 6) throw new Error(`${NOTE_DARK_NAME}: ${NOTE_GROUPS[index].label} có ${pool.length}/6 địa điểm; đối tác ${partners}, thường ${regular}. Cần ít nhất 4 địa điểm thường và đủ 6 tên với tối đa 2 đối tác; chưa lưu list.`);
  });
  // Match all 18 slots jointly. Trying quotas in descending total maximizes
  // valid partners without stealing a cross-category venue needed elsewhere.
  const quotas: number[][] = [];
  for (let a = 2; a >= 0; a--) for (let b = 2; b >= 0; b--) for (let c = 2; c >= 0; c--) quotas.push([a,b,c]);
  quotas.sort((a,b) => b.reduce((n,x)=>n+x,0)-a.reduce((n,x)=>n+x,0));
  // Điểm ưu tiên tính một lần (trước đây mỗi phép so sánh quét lại cả lịch sử, chậm khi nhiều list).
  const lastKeys = new Set(last.map(x => key(x.name))), priorCount = new Map<string, number>();
  for (const x of prior) { const id = key(x.name); priorCount.set(id, (priorCount.get(id) || 0) + 1); }
  const score = (item: GuideItem) => { const id = key(item.name); return lastKeys.has(id) ? 100000 : priorCount.get(id) || 0; };
  const ranked = pools.map((pool, group) => [false, true].map(partner => pool.filter(item => Boolean(item.isPartner) === partner)
    .map(item => ({ item, score: score(item), hash: stableHash(seed+group+item.id) }))
    .sort((a, b) => a.score-b.score || a.hash-b.hash).map(entry => entry.item)));
  let selected: GuideItem[][] | undefined;
  for (const quota of quotas) {
    const slots = quota.flatMap((count, group) => Array.from({length:6}, (_, index) => ({ group, partner:index < count })));
    const choices = slots.map(slot => ranked[slot.group][Number(slot.partner)]);
    let owner = new Map<string,number>(), chosen = new Map<number,GuideItem>();
    const reserved = new Map<number,GuideItem>();
    const assign = (slot: number, seen: Set<string>): boolean => {
      for (const item of choices[slot]) { const id=key(item.name); if(seen.has(id))continue; seen.add(id); const previous=owner.get(id);
        if(previous===undefined || !reserved.has(previous) && assign(previous,seen)){ owner.set(id,slot);chosen.set(slot,item);return true; }
      } return false;
    };
    const reserveRequired = (index:number):boolean => {
      if(index===required.length){owner=new Map([...reserved].map(([slot,item])=>[key(item.name),slot]));chosen=new Map(reserved);return slots.map((_,i)=>i).filter(i=>!reserved.has(i)).sort((a,b)=>choices[a].length-choices[b].length).every(i=>assign(i,new Set()));}
      for(let slot=0;slot<slots.length;slot++){if(reserved.has(slot)||!slots[slot].partner)continue;const item=choices[slot].find(item=>key(item.name)===required[index]);if(!item)continue;reserved.set(slot,item);if(reserveRequired(index+1))return true;reserved.delete(slot);}return false;
    };
    if(reserveRequired(0)){selected=NOTE_GROUPS.map((_,g)=>slots.flatMap((slot,i)=>slot.group===g?[chosen.get(i)!]:[]));break;}
  }
  if(!selected)throw new Error(`${NOTE_DARK_NAME}: không đủ phương án 18 địa điểm riêng giữa ba nhóm${required.length?' và các đối tác bắt buộc':''}; ${NOTE_GROUPS.map((g,i)=>`${g.label} ${pools[i].length}/6`).join(', ')}, tổng ${new Set(pools.flat().map(i=>key(i.name))).size}/18 tên khác nhau. Kiểm tra tên trùng nhóm, số địa điểm thường và giới hạn 2 đối tác/nhóm. Chưa lưu list.`);
  const rows = selected.flatMap((items,group) => {
    const ordered=items.slice().sort((a,b)=>stableHash(seed+':order:'+a.id)-stableHash(seed+':order:'+b.id));
    let best=ordered, penalty=Infinity;
    for(let shift=0;shift<6;shift++){const rotated=ordered.slice(shift).concat(ordered.slice(0,shift));const score=rotated.filter((item,i)=>key(last[group*6+i]?.name||'')===key(item.name)).length;if(score<penalty){best=rotated;penalty=score;}}
    return best.map(item => ({ id:item.id, sourceKey:item.id,sourceSectionKey:item.sectionKey,rotationGroup:`note-${group}`,name:item.name.trim(),rawName:item.name.trim(),label:NOTE_GROUPS[group].label,metaPrimary:'',metaSecondary:'',imageUrl:'',imageMapped:false,imageSource:'fallback' as const,imageNote:'text-only',candidateImageUrls:[],isPartner:item.isPartner }));
  });
  const pages: DeckPage[] = [{type:'list',title:'Đà Lạt lưu lại nè',subtitle:'',chipText:'',chipTone:'slate',backgroundImage:'',items:rows,layoutVariant:'threads-note-dark-list',canvasPreset:'tiktok-9x16',textFontSize:42,titlePlacement:'top-left'}];
  assertNoteDarkPages(pages);return pages;
}

export function assertNoteDarkPages(pages: DeckPage[]): void {
  const page=pages[0];if(pages.length!==1||page?.type!=='list'||page.layoutVariant!=='threads-note-dark-list'||page.items.length!==18||!page.title.trim())throw Error(`${NOTE_DARK_NAME}: cần một trang, tiêu đề và đủ 18 tên.`);
  const names=new Set<string>();
  NOTE_GROUPS.forEach((group,g)=>{const rows=page.items.slice(g*6,g*6+6);if(rows.filter(i=>i.isPartner).length>2)throw Error(`${group.label}: tối đa 2 đối tác.`);
    for(const item of rows){const id=key(item.name);if(!id||names.has(id)||!group.keys.includes(item.sourceSectionKey!))throw Error(`${NOTE_DARK_NAME}: tên trống, trùng hoặc sai nhóm.`);names.add(id);if(item.imageUrl||item.metaPrimary||item.metaSecondary)throw Error(`${NOTE_DARK_NAME}: chỉ dùng tên, không ảnh hoặc địa chỉ.`);}
  });
}

export function noteDarkExample(): DeckPage[] {
  const items={} as WorkbookItemsBySection;
  NOTE_GROUPS.forEach(group=>{items[group.keys[0]]=Array.from({length:6},(_,i)=>({id:group.keys[0]+i,name:`${group.label} minh họa ${i+1}`,sectionKey:group.keys[0],isPartner:false} as GuideItem));});
  return buildNoteDarkPages(items,'example');
}
