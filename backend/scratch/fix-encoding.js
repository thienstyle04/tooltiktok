const fs = require('fs');
const path = require('path');

const replacements = [
  { from: /lưu trú/g, to: 'lưu trú' },
  { from: /dịch vụ thuê xe/g, to: 'dịch vụ thuê xe' },
  { from: /dịch vụ cần lưu ý/g, to: 'dịch vụ cần lưu ý' },
  { from: /quÃ\  táº·ng/g, to: 'quà tặng' },
  { from: /Ã„Â\ ang cÃ¡ÂºÂ­p nhÃ¡ÂºÂ­t/g, to: 'Đang cập nhật' },
  { from: /đ/g, to: 'đ' },
  { from: /Ã„Â\ /g, to: 'Đ' },
  { from: /lưu trú/g, to: 'lưu trú' },
  { from: /lưu trú/g, to: 'lưu trú' },
  { from: /dịch vụ thuê xe/g, to: 'dịch vụ thuê xe' },
  { from: /dịch vụ cần lưu ý/g, to: 'dịch vụ cần lưu ý' }
];

function processDir(dir) {
  const files = fs.readdirSync(dir);
  for (const file of files) {
    const fullPath = path.join(dir, file);
    if (fs.statSync(fullPath).isDirectory()) {
      if (file !== 'node_modules' && file !== '.git' && file !== 'dist') {
        processDir(fullPath);
      }
    } else if (file.endsWith('.ts') || file.endsWith('.json') || file.endsWith('.js') || file.endsWith('.html')) {
      let content = fs.readFileSync(fullPath, 'utf8');
      let changed = false;
      for (const r of replacements) {
        if (r.from.test(content)) {
          content = content.replace(r.from, r.to);
          changed = true;
        }
      }
      if (changed) {
        fs.writeFileSync(fullPath, content, 'utf8');
        console.log(`Fixed: ${fullPath}`);
      }
    }
  }
}

const root = path.resolve(__dirname, '..');
console.log(`Starting fix in ${root}...`);
processDir(root);
console.log('Done.');
