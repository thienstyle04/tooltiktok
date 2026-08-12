import type { PremadeHookPoolKey } from './premade-hook-source';

export const BUNDLED_SECTION_HOOKS: Record<string, string[]> = {
  'hook-1': [
    '3N2Đ ở Đà Lạt, tui đi được nhiêu đây chỗ nè',
    'Có đúng 3N2Đ thì copy lịch trình này cho tui',
    '72 tiếng ở Đà Lạt, tui chia lịch như này nè',
    'Lịch trình 3N2Đ dành cho hội lần đầu lên Đà Lạt',
    'Lên Đà Lạt 3N2Đ mà chưa có plan thì lưu gấp',
  ],
  'hook-2': [
    '4N3Đ ở Đà Lạt, tui đi được nhiêu đây chỗ nè',
    'Có đúng 4N3Đ thì copy lịch trình này cho tui',
    '96 tiếng ở Đà Lạt, tui chia lịch như này nè',
    'Lịch trình 4N3Đ dành cho hội lần đầu lên Đà Lạt',
    'Lên Đà Lạt 4N3Đ mà chưa có plan thì lưu gấp',
  ],
  'hook-3': [
    '3N2Đ ở Đà Lạt hết bao nhiêu tiền? Tui tính thử cho bà coi',
    'Cầm 3 triệu đi Đà Lạt thì chơi được tới đâu?',
    'Đà Lạt 3N2Đ dưới 3 triệu là có thiệt á',
    'Muốn đi Đà Lạt mà ví mỏng thì lưu bài này',
    'Bảng chi tiêu chi tiết cho chuyến Đà Lạt 3N2Đ của tui',
  ],
  'hook-4': [
    'Đà Lạt đi đâu để ăn ngon và cà phê đẹp nhỉ?',
    'Có list này đi Đà Lạt không lo nghĩ gì nhe',
    'Đừng tới Đà Lạt khi chưa xem hết bài này',
    'Đi Đà Lạt lần đầu thì lưu ngay',
    'Chưa hết tháng mà tui đã lên hết wishlist những chỗ muốn đi ở Đà Lạt rồi',
  ],
};

export const BUNDLED_SPOTLIGHT_HOOKS = [
  'Đi Đà Lạt cả chục lần rồi, đây là những kinh nghiệm đáng tiền nhất',
  'Đừng tới Đà Lạt khi chưa xem hết bài này',
  'Có cái list này là đi Đà Lạt khỏe hơn hẳn',
  'Người có hộ khẩu Đà Lạt chỉ mình những chỗ này',
  'Đây là list mình giới thiệu cho bạn bè mỗi khi họ tới Đà Lạt',
  'Đà Lạt lại có thêm nhiều chỗ đẹp nữa rồi',
  'Đi Đà Lạt về rồi mà lòng vẫn còn ở đó',
  'Đây không phải Pinterest. Đây là Đà Lạt',
];

export const BUNDLED_PREMADE_HOOKS: Record<PremadeHookPoolKey, string[]> = {
  itinerary_3n2d: BUNDLED_SECTION_HOOKS['hook-1'],
  itinerary_4n3d: BUNDLED_SECTION_HOOKS['hook-2'],
  budget: BUNDLED_SECTION_HOOKS['hook-3'],
  highlight: [...BUNDLED_SECTION_HOOKS['hook-4'], ...BUNDLED_SPOTLIGHT_HOOKS],
};
