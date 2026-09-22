const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const target = path.join(root, 'outputs/studio-audit-runtime');
if (fs.existsSync(target)) throw Error('Audit runtime already exists; do not overwrite');
fs.mkdirSync(target, { recursive: true });
for (const side of ['backend', 'frontend']) {
  const dest = path.join(target, side);
  fs.mkdirSync(dest);
  for (const entry of fs.readdirSync(path.join(root, side), { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name.startsWith('.') || ['build', 'data', 'reports'].includes(entry.name)) continue;
    fs.cpSync(path.join(root, side, entry.name), path.join(dest, entry.name), { recursive: true });
  }
  fs.symlinkSync(path.join(root, side, 'node_modules'), path.join(dest, 'node_modules'), 'junction');
}
// Independent bytes, no data junctions/hardlinks. Tests may safely alter their own copy.
fs.cpSync(path.join(root, 'backend/data'), path.join(target, 'backend/data'), { recursive: true });
fs.copyFileSync(path.join(root, 'VERSION'), path.join(target, 'VERSION'));
console.log('Prepared isolated source and data copies:', target);
