// Kiểu dữ liệu dùng chung frontend ↔ backend, chỉ dành cho kiểm tra kiểu JSDoc
// (`npm run typecheck:frontend`). Nguồn duy nhất: backend/src/common/interfaces/guide.types.ts.
// File không có code chạy; dùng: /** @param {import('./types').DeckPage} page */

/** @typedef {import('../../backend/src/common/interfaces/guide.types').GuideDataset} GuideDataset */
/** @typedef {import('../../backend/src/common/interfaces/guide.types').GuideDeck} GuideDeck */
/** @typedef {import('../../backend/src/common/interfaces/guide.types').GuideDeckList} GuideDeckList */
/** @typedef {import('../../backend/src/common/interfaces/guide.types').DeckPage} DeckPage */
/** @typedef {import('../../backend/src/common/interfaces/guide.types').CoverPage} CoverPage */
/** @typedef {import('../../backend/src/common/interfaces/guide.types').ListPage} ListPage */
/** @typedef {import('../../backend/src/common/interfaces/guide.types').PageItem} PageItem */
/** @typedef {import('../../backend/src/common/interfaces/guide.types').GuideItem} GuideItem */
/** @typedef {import('../../backend/src/common/interfaces/guide.types').SectionKey} SectionKey */

export {};
