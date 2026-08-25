import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

import { FestivalHookSourceStore, MAX_HOOK_SOURCE_FILE_BYTES, parseFestivalHookText } from '../sync/festival-hook-source';

const JSZip = require('jszip') as {
  new(): {
    file(name: string, content: string): void;
    generateAsync(options: { type: 'nodebuffer' }): Promise<Buffer>;
  };
};

async function expectReject(action: () => unknown | Promise<unknown>, pattern: RegExp): Promise<void> {
  await assert.rejects(async () => action(), pattern);
}

async function createDocx(lines: string[]): Promise<Buffer> {
  const zip = new JSZip();
  zip.file('[Content_Types].xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
</Types>`);
  zip.file('_rels/.rels', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>`);
  const paragraphs = lines.map((line) => `<w:p><w:r><w:t>${line}</w:t></w:r></w:p>`).join('');
  zip.file('word/document.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${paragraphs}<w:sectPr/></w:body></w:document>`);
  return zip.generateAsync({ type: 'nodebuffer' });
}

async function main(): Promise<void> {
  assert.deepEqual(
    parseFestivalHookText('\uFEFF- Hook A\n  Hook   B  \n1. Hook A\n\n• Hook C'),
    ['Hook A', 'Hook B', 'Hook C'],
  );

  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'festival-hook-source-'));
  let docText = 'Hook A\nHook B\nHook C\nHook A';
  let docFailure = '';
  let docGate: Promise<void> | null = null;
  const fetchDoc = async () => {
    if (docGate) await docGate;
    if (docFailure) throw new Error(docFailure);
    return docText;
  };
  const store = new FestivalHookSourceStore(root, fetchDoc, () => 0);

  try {
    await store.create({
      name: '30/4',
      docUrl: 'https://docs.google.com/document/d/public-doc-id/edit',
    });
    let status = store.getStatus('dalat');
    assert.equal(status.sources.length, 1);
    assert.equal(status.sources[0].hookCount, 3);
    const googleId = status.sources[0].id;

    await expectReject(() => store.create({
      name: '30/4',
      docUrl: 'https://docs.google.com/document/d/another-doc/edit',
    }), /đã tồn tại/i);
    await expectReject(() => store.create({
      name: 'Sai hai nguồn',
      docUrl: 'https://docs.google.com/document/d/another-doc/edit',
    }, { buffer: Buffer.from('Hook'), originalname: 'hooks.txt', size: 4 }), /đúng một nguồn/i);
    await expectReject(() => store.create({
      name: 'File quá lớn',
    }, {
      buffer: Buffer.alloc(MAX_HOOK_SOURCE_FILE_BYTES + 1),
      originalname: 'hooks.txt',
      size: MAX_HOOK_SOURCE_FILE_BYTES + 1,
    }), /5 MB/i);
    await expectReject(() => store.create({
      name: 'Sai định dạng',
    }, { buffer: Buffer.from('Hook'), originalname: 'hooks.pdf', size: 4 }), /\.docx hoặc \.txt/i);

    store.setMode('festival', googleId, 'dalat');
    const deckIds = ['spotlight-guide', 'spotlight-v2', 'spotlight-v3'];
    const firstRound = deckIds.map((deckId) => store.reserve(deckId, 'dalat'));
    assert.equal(new Set(firstRound.map((entry) => entry?.hook)).size, 3, 'Một vòng không được lặp hook');
    firstRound.forEach((entry) => store.commit(entry));
    status = store.getStatus('dalat');
    assert.equal(status.sources[0].usedCount, 3);
    assert.equal(status.sources[0].remainingCount, 0);

    let releaseDoc: (() => void) | undefined;
    docGate = new Promise<void>((resolve) => { releaseDoc = resolve; });
    const inFlightRefresh = store.refresh(googleId);
    await Promise.resolve();
    assert.throws(
      () => store.reserve('carousel-mau-1', 'dalat'),
      /đang được cập nhật/i,
      'Tạo list không được chen vào lúc refresh đang tải/parse',
    );
    releaseDoc?.();
    await inFlightRefresh;
    docGate = null;

    const rolledBack = store.reserve('carousel-mau-1', 'dalat');
    assert.ok(rolledBack);
    store.rollback(rolledBack);
    const retried = store.reserve('carousel-mau-1', 'dalat');
    assert.equal(retried?.hook, rolledBack?.hook, 'List lỗi không được tiêu thụ hook');
    store.rollback(retried);

    store.setMode('festival', googleId, 'dalat');
    const concurrentA = store.reserve('spotlight-guide', 'dalat');
    const concurrentB = store.reserve('spotlight-v2', 'dalat');
    assert.notEqual(concurrentA?.hook, concurrentB?.hook, 'Hai request đồng thời không được nhận cùng hook');
    await expectReject(() => store.refresh(googleId), /Đang tạo list/i);
    store.commit(concurrentA);
    store.commit(concurrentB);

    store.setMode('normal', '', 'dalat');
    store.setMode('festival', googleId, 'dalat');
    assert.equal(store.getStatus('dalat').sources[0].usedCount, 0, 'Bật lại nguồn phải mở vòng mới');
    assert.equal(store.getStatus('green-land').mode, 'normal', 'Green Land luôn dùng hook thường');
    await expectReject(async () => store.setMode('festival', googleId, 'green-land'), /chỉ áp dụng/i);
    store.deactivate();
    assert.equal(store.getStatus('dalat').mode, 'normal', 'Chuyển sang Green Land phải hạ chế độ đã lưu về hook thường');
    store.setMode('festival', googleId, 'dalat');
    await expectReject(async () => store.delete(googleId), /chuyển sang Hook thường/i);

    docFailure = 'Mất mạng';
    await expectReject(() => store.refresh(googleId), /Mất mạng/);
    status = store.getStatus('dalat');
    assert.equal(status.sources[0].hookCount, 3, 'Refresh lỗi phải giữ cache cũ');
    assert.match(status.sources[0].lastError || '', /Mất mạng/);
    docFailure = '';
    docText = 'Hook A\nHook D';
    await store.refresh(googleId);
    assert.equal(store.getStatus('dalat').sources[0].hookCount, 2);

    store.setMode('normal', '', 'dalat');
    await store.create({ name: 'TXT Noel' }, {
      buffer: Buffer.from('Noel A\nNoel B\nNoel A', 'utf8'),
      originalname: 'noel.txt',
      size: 20,
    });
    const docx = await createDocx(['DOCX A', 'DOCX B', 'DOCX A']);
    await store.create({ name: 'DOCX Quốc khánh' }, {
      buffer: docx,
      originalname: 'quoc-khanh.docx',
      size: docx.length,
    });
    status = store.getStatus('dalat');
    assert.equal(status.sources.find((entry) => entry.name === 'TXT Noel')?.hookCount, 2);
    assert.equal(status.sources.find((entry) => entry.name === 'DOCX Quốc khánh')?.hookCount, 2);

    const restarted = new FestivalHookSourceStore(root, fetchDoc, () => 0);
    const restored = restarted.getStatus('dalat');
    assert.equal(restored.mode, 'normal');
    assert.equal(restored.sources.length, 3, 'Restart phải khôi phục tất cả nguồn');
    assert.equal(restored.sources.find((entry) => entry.id === googleId)?.hookCount, 2);

    store.delete(googleId);
    assert.equal(store.getStatus('dalat').sources.some((entry) => entry.id === googleId), false);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }

  console.log('PASS festival-hook-sources: parse, atomic cache, no-repeat, concurrency, restart, TXT và DOCX');
}

void main();
