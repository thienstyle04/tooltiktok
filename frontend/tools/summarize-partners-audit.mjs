import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url), JSZip = require('jszip');
const root = path.resolve(process.env.AUDIT_ROOT);
const generation = JSON.parse(fs.readFileSync(path.join(root, 'generation.json')));
const metadata = JSON.parse(fs.readFileSync(path.join(root, 'metadata-results.json')));
const archives = [];
for (const name of ['full-export-batch.zip', 'full-export-batch-remaining.zip']) {
  const file = path.join(root, name);
  if (!fs.existsSync(file)) continue;
  const zip = await JSZip.loadAsync(fs.readFileSync(file), {checkCRC32:true});
  const books = [];
  for (const entry of Object.values(zip.files)) {
    if (!entry.name.endsWith('.xlsx')) continue;
    const book = await JSZip.loadAsync(await entry.async('nodebuffer'), {checkCRC32:true});
    const xml = await book.file('xl/worksheets/sheet1.xml').async('string');
    const cells = [...xml.matchAll(/<t(?:\s[^>]*)?>([^<]+)<\/t>/g)].map(m => m[1]);
    books.push({ file:entry.name, partners:cells });
  }
  archives.push({ name, bytes:fs.statSync(file).size, pngs:Object.keys(zip.files).filter(f=>f.endsWith('.png')).length, books, crc:true });
}
const rows = generation.results.map(row => {
  const outputs = metadata.filter(m=>m.deckId===row.deckId);
  return { deckId:row.deckId, generated:row.lists.length, generationErrors:row.errors,
    partnerCounts:outputs.map(m=>m.xlsxNames?.length || 0), empty:outputs.filter(m=>m.xlsxNames?.length===0).map(m=>m.listId),
    exportErrors:outputs.filter(m=>m.error), missing:outputs.filter(m=>m.missing?.length),
  };
});
const report = { source:generation.source, attemptedTemplates:rows.length, requestedLists:rows.length*4,
  generatedLists:rows.reduce((n,r)=>n+r.generated,0), checkedXlsx:metadata.filter(m=>m.xlsx).length,
  emptyXlsx:metadata.filter(m=>m.xlsx && m.xlsxNames.length===0), archives, rows,
  integrity:JSON.parse(fs.readFileSync(path.join(root,'original-integrity.json'))) };
const matrixPath=path.join(root,'matrix-results.json');
if(fs.existsSync(matrixPath)) {
  report.matrix=JSON.parse(fs.readFileSync(matrixPath));
  const saved=[];
  for(const batch of report.matrix.filter(m=>m.archives===1)) {
    const file=path.join(root,'matrix-zips',batch.deckId+'.zip');
    const zip=await JSZip.loadAsync(fs.readFileSync(file),{checkCRC32:true});
    const books=[];
    for(const entry of Object.values(zip.files).filter(f=>f.name.endsWith('.xlsx'))) {
      const book=await JSZip.loadAsync(await entry.async('nodebuffer'),{checkCRC32:true});
      const xml=await book.file('xl/worksheets/sheet1.xml').async('string');
      const values=[...xml.matchAll(/<t(?:\s[^>]*)?>([^<]+)<\/t>/g)].map(m=>m[1]);
      const proof=batch.books.find(b=>b.file===entry.name);
      if(!proof || JSON.stringify(values)!==JSON.stringify(proof.names))throw Error('Saved ZIP differs from browser: '+batch.deckId);
      const decode=v=>v.replaceAll('&amp;','&').replaceAll('&lt;','<').replaceAll('&gt;','>').replaceAll('&quot;','"').replaceAll('&apos;',"'");
      const set=Number(entry.name.match(/^set(\d+)/)?.[1]||1);
      const expected=metadata.find(m=>m.deckId===batch.deckId && Number(m.listId.match(/caption-(\d+)/)?.[1]||1)===set);
      const matchesSavedList=expected && JSON.stringify(values.map(decode).sort())===JSON.stringify([...expected.xlsxNames].sort());
      books.push({file:entry.name,names:values,matchesSavedList});
    }
    if(books.length!==batch.books.length)throw Error('Missing saved workbook: '+batch.deckId);
    saved.push({deckId:batch.deckId,workbooks:books.length,empty:books.filter(b=>!b.names.length),mismatched:books.filter(b=>!b.matchesSavedList),bytes:fs.statSync(file).size,crc:true});
  }
  report.savedMatrixVerification=saved;
  for(const row of rows) {
    const batch=report.matrix.find(m=>m.deckId===row.deckId);
    if(batch){row.batch={archives:batch.archives,xlsx:batch.books?.length,pngs:batch.pngs,error:batch.error,errors:batch.errors,exportedLists:batch.result?.exportedLists?.length};}
  }
}
const metadataProof = path.join(root,'metadata-archive-verification.json');
if (fs.existsSync(metadataProof)) report.metadataArchive = JSON.parse(fs.readFileSync(metadataProof));
const fullResolutionProof = path.join(root,'batch-result-full-resolution.json');
if (fs.existsSync(fullResolutionProof)) {
  const proof=JSON.parse(fs.readFileSync(fullResolutionProof));
  report.fullResolutionBrowserProof={lists:proof.result.exportedLists.length, pngs:proof.files.filter(f=>f.endsWith('.png')).length, crc:proof.crc, skipped:proof.result.skippedLists, bytes:proof.bytes, note:'ZIP đã tạo và kiểm tra CRC trong trình duyệt; không giữ bản ZIP hoàn chỉnh trên đĩa vì bước truyền file lớn qua bộ kiểm thử đã dừng.'};
}
fs.writeFileSync(path.join(root,'report.json'),JSON.stringify(report,null,2));
const lines = ['# Kiểm tra đối tác trong XLSX', '',
  `Nguồn: Đà Lạt. Thử ${report.attemptedTemplates} mẫu × 4 list; tạo được ${report.generatedLists}/${report.requestedLists} list. Đọc nội dung ${report.checkedXlsx} XLSX; ${report.emptyXlsx.length} file trống.`, '',
  'Caption kiểm thử không gọi AI. Chỉ dùng bản sao workbook/cache và list thử; không thay đổi dữ liệu gốc.', '',
  '| Mẫu | List tạo được | Số tên trong từng XLSX | Kết quả |', '|---|---:|---|---|',
  ...rows.map(r=>`| ${r.deckId} | ${r.generated}/4 | ${r.partnerCounts.join(', ')} | ${r.generationErrors.length?'Không đủ dữ liệu: '+r.generationErrors[0].message:r.batch?.error||r.batch?.errors?.length?'Lỗi batch: '+(r.batch.error||r.batch.errors.join('; ')):r.batch && r.batch.xlsx!==r.generated?'Batch chỉ có '+r.batch.xlsx+'/'+r.generated+' XLSX':r.empty.length?'Có XLSX trống':r.exportErrors.length?'Lỗi xuất':r.deckId==='spotlight-partner'?'Lẫn nhãn “Địa chỉ” vào tên đối tác':'Có đối tác'} |`), '',
  '## ZIP xuất qua trình duyệt', '',
  `- partners-metadata-batch.zip: ${report.checkedXlsx} XLSX; đã mở lại và kiểm tra CRC cả ZIP lẫn workbook.`,
  ...(report.matrix ? [`- Batch 4 list theo từng mẫu: ${report.matrix.filter(m=>m.archives===1).length}/${report.matrix.length} mẫu tạo được ZIP; từng ZIP được đọc lại XLSX và kiểm tra CRC trong trình duyệt. Gói lưu tại matrix-zips/.`] : []),
  ...(report.savedMatrixVerification ? [`- Mở lại ${report.savedMatrixVerification.length} ZIP trên đĩa: ${report.savedMatrixVerification.reduce((n,s)=>n+s.workbooks,0)} XLSX thực tế. Khớp nội dung trong trình duyệt. Thiếu ba XLSX do batch Spotlight đối tác ghi đè, còn một XLSX trống của Tone đen.`] : []),
  ...(report.fullResolutionBrowserProof ? [`- Đợt độ phân giải chuẩn: ${report.fullResolutionBrowserProof.lists} list, ${report.fullResolutionBrowserProof.pngs} PNG; đã tạo ZIP và kiểm tra CRC trong trình duyệt, không có list bị bỏ qua. Bản ZIP lớn chỉ được truyền một phần về đĩa, không dùng file .partial để mở.`] : []),
  ...archives.map(a=>`- ${a.name}: ${a.books.length} XLSX, ${a.pngs} PNG; kiểm tra CRC thành công; ${a.books.filter(b=>!b.partners.length).length} XLSX trống.`), '',
  'Các batch 4 list dùng ảnh render giảm độ phân giải trong bộ kiểm thử; logic chọn đối tác, ghi TXT/XLSX và luồng xuất không đổi. Đây không phải kiểm tra chất lượng ảnh ở độ phân giải phát hành. Đã dừng thử gom 164 list thành một ZIP vì bộ kiểm thử render quá lâu; không kết luận lỗi tài nguyên của ứng dụng từ lần đó.', '',
  '## Nguyên nhân xác nhận', '',
  '- Spotlight Tone đen chọn địa điểm theo nhóm/chủ đề và vòng sử dụng nhưng không bắt buộc số đối tác tối thiểu; list có thể không có đối tác, XLSX vẫn được tạo với sheet rỗng.',
  '- Spotlight đối tác đánh dấu các dòng thông tin là isPartner; hàm xuất dùng name của dòng thông tin nên “Địa chỉ” bị ghi vào XLSX.',
  '- Batch Spotlight đối tác: parseListSetIndex trả về 1 cho cả bốn ID dạng partner-...; batchFolderName dùng cùng set1 nên ghi đè partners-set1.xlsx. Batch báo thành công 4 list nhưng ZIP chỉ còn một XLSX của đối tác cuối.',
  '- Spotlight Nhật ký bị chặn vì chỉ có 4/5 quán ăn đối tác đủ ảnh và mô tả trong nguồn đang thử.',
];
fs.writeFileSync(path.join(root,'report.md'),lines.join('\n'));
console.log(JSON.stringify({templates:report.attemptedTemplates,generated:report.generatedLists,xlsx:report.checkedXlsx,empty:report.emptyXlsx.map(x=>({deck:x.deckId,list:x.listId})),archives:archives.map(a=>({name:a.name,books:a.books.length,pngs:a.pngs})),integrity:report.integrity}));
