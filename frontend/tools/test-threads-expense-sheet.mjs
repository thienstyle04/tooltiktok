import assert from 'node:assert/strict';
import { formatThousands, parseThousands, renderThreadsExpensePage, threadsExpenseMetrics, threadsExpenseTotals } from '../lib/threadsExpenseSheet.js';

// Số tiền ghi theo nghìn đồng như bảng tự ghi; người dùng có thể gõ nhiều kiểu.
assert.equal(parseThousands('1.900'), 1900);
assert.equal(parseThousands('1900'), 1900);
assert.equal(parseThousands(' 90 '), 90);
assert.equal(parseThousands('90k'), 90);
assert.equal(parseThousands('1,5tr'), 1500);
assert.equal(parseThousands('0'), 0);
assert.equal(parseThousands(''), null);
assert.equal(parseThousands('khoảng 90'), null);
assert.equal(formatThousands(3570), '3.570');

// Đúng ví dụ Tà Xùa: tổng 3.570, mỗi người 1.785.
const reference = ['1.900', '250', '50', '120', '180', '520', '120', '150', '60', '50', '10', '10', '90', '60']
  .map((amount, i) => ({ id: `r${i}`, label: 'Ăn uống', name: `Khoản ${i + 1}`, metaPrimary: '', metaSecondary: amount }));
assert.deepEqual(threadsExpenseTotals(reference), { total: 3570, perPerson: 1785, missingCount: 0 });
assert.deepEqual(threadsExpenseTotals([...reference, { metaSecondary: 'abc' }]), { total: 3570, perPerson: 1785, missingCount: 1 });
assert.equal(threadsExpenseTotals([{ metaSecondary: '1' }]).perPerson, 1, 'Làm tròn mỗi người');

// Bảng luôn vừa khung 1080px cho cả 16 và 21 dòng, kể cả khi người dùng tăng cỡ chữ.
for (const rows of [16, 21]) {
  const metrics = threadsExpenseMetrics(rows);
  assert.ok((rows + 9) * metrics.rowHeight <= 1080, `${rows} dòng phải vừa 1080px`);
  assert.ok(metrics.font >= 16, 'Chữ không quá nhỏ');
  const big = threadsExpenseMetrics(rows, 60);
  assert.ok(big.font <= big.rowHeight * 0.62 + 1e-9, 'Cỡ chữ người dùng bị giới hạn theo chiều cao dòng');
  assert.equal(threadsExpenseMetrics(rows, 17).font, 17);
}

const html = renderThreadsExpensePage({
  type: 'list', layoutVariant: 'threads-expense-sheet', title: 'Đà Lạt <2N1Đ>', subtitle: '',
  items: [...reference.slice(0, 13), { id: 'x', label: 'Ăn uống', name: 'kem <b>bơ</b>', metaPrimary: 'gửi xe', metaSecondary: '60' }],
}, 0, 'list-1');
assert.match(html, /class="story-page threads-expense-sheet"/);
assert.match(html, /data-export-name="bang-chi-tieu-threads\.png"/);
assert.match(html, /Đà Lạt &lt;2N1Đ&gt;/, 'Tiêu đề được escape');
assert.match(html, /kem &lt;b&gt;bơ&lt;\/b&gt;/, 'Nội dung được escape');
assert.match(html, /<th>NỘI DUNG<\/th><th>SỐ TIỀN<\/th><th>GHI CHÚ<\/th>/);
assert.match(html, /tes-total[^]*?>3\.570</, 'Dòng tổng');
assert.match(html, /Mỗi người<\/td><td class="tes-amount">1\.785</, 'Dòng mỗi người');
assert.equal((html.match(/<tr class="tes-row">/g) || []).length, 14, '14 dòng dữ liệu');
assert.doesNotMatch(html, /is-invalid/);
assert.match(renderThreadsExpensePage({ title: 'x', items: [{ name: 'a', metaSecondary: 'abc' }] }, 0, 'l'), /tes-amount is-invalid/, 'Số tiền sai được tô đỏ');
assert.match(renderThreadsExpensePage({ title: 'x', subtitle: 'MẪU MINH HỌA · ...', items: [] }, 0, 'l'), /is-example[^]*tes-example/);
// Nội dung quá dài thu nhỏ riêng ô, không xuống dòng làm vỡ lưới.
assert.match(renderThreadsExpensePage({ title: 'x', items: [{ name: 'ăn trưa '.repeat(12), metaSecondary: '90' }] }, 0, 'l'), /<td class="" style="font-size:0\.\d+em">ăn trưa/);
console.log('PASS threads-expense-sheet render: đọc số nghìn, tổng/mỗi người như ảnh mẫu, vừa khung 16/21 dòng, escape và báo số sai.');
