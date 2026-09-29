const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const esbuild = require('../../backend/node_modules/esbuild');
const root = path.resolve(__dirname, '../..');
const target = path.join(os.tmpdir(), 'dalat-threads-budget-preview.html');
const build = esbuild.buildSync({ entryPoints: [path.join(root, 'frontend/lib/threadsBudget.js')], bundle: true, write: false, platform: 'node', format: 'cjs' });
const mod = { exports: {} };
new Function('module', 'exports', 'require', build.outputFiles[0].text)(mod, mod.exports, require);
const groups = ['Di chuyển', 'Lưu trú', 'Ngày 1', 'Ngày 2', 'Ngày 3'];
const counts = [2, 1, 4, 4, 4];
const names = [
  'Xe khách (khứ hồi)', 'Grab', 'Homestay A',
  'Bánh ướt lòng gà', 'Cà phê', 'Quảng trường Lâm Viên', 'Cơm trưa',
  'Bún bò', 'Cà phê Linh Lam', 'Dốc Nhà Bò', 'Lẩu gà lá é',
  'Bánh mì xíu mại', 'Cà phê sáng', 'Hồ Xuân Hương', 'Ăn tối',
];
const prices = ['610.000 đ', '223.000 đ', '150.000 đ/người', '50.000 đ', '40.000 đ', '0 đ', '80.000 đ', '60.000 đ', '45.000 đ', '0 đ', '120.000 đ', '35.000 đ', '40.000 đ', '0 đ', '90.000 đ'];
let index = 0;
const items = groups.flatMap((group, groupIndex) => Array.from({ length: counts[groupIndex] }, () => ({ label: group, name: names[index], metaSecondary: prices[index++] })));
const css = fs.readFileSync(path.join(root, 'frontend/app/styles/itinerary-note.css'), 'utf8');
const html = mod.exports.renderThreadsBudgetPage({ items, subtitle: '' }, 0, 'preview');
fs.writeFileSync(target, `<!doctype html><html lang="vi"><meta charset="utf-8"><title>Threads budget preview</title><style>body{margin:0;background:#ddd;display:flex;justify-content:center;padding:16px;} ${css}</style>${html}</html>`, 'utf8');
console.log(target);
