// Bước key AI của ensure-portable-runtime.ps1: không bao giờ chặn máy mới vì thiếu
// key DeepSeek. Chỉ nạp phần khai báo hàm; LOCALAPPDATA giả; không npm, không mạng.
const fs = require('fs'), path = require('path'), os = require('os'), { spawnSync } = require('child_process');
const src = fs.readFileSync(path.join(__dirname, 'ensure-portable-runtime.ps1'), 'utf8');
const start = src.indexOf('function Set-EnvValue'), end = src.indexOf('Ensure-DeepSeekApiKey $localEnv');
if (start < 0 || end < 0) throw Error('markers');
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'key-prompt-'));
const lib = path.join(root, 'lib.ps1');
// Test-DeepSeekApiKey would call the network; stub it to "valid".
fs.writeFileSync(lib, src.slice(start, end) + '\nfunction Test-DeepSeekApiKey([string]$key) { return $true }\n');
const run = (envText, input, saved) => {
  const env = path.join(root, `case-${Math.random().toString(36).slice(2)}.env`);
  fs.writeFileSync(env, envText);
  const local = fs.mkdtempSync(path.join(root, 'local-'));
  if (saved) { fs.mkdirSync(path.join(local, 'DalatStudio')); fs.writeFileSync(path.join(local, 'DalatStudio', 'ai-settings.json'), JSON.stringify(saved)); }
  const script = `. '${lib}'; Ensure-DeepSeekApiKey '${env}'`;
  const r = spawnSync('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', script], { input, encoding: 'utf8', timeout: 30000, env: { ...process.env, LOCALAPPDATA: local } });
  return { out: (r.stdout + r.stderr).replace(/\s+/g, ' ').trim(), env: fs.readFileSync(env, 'utf8'), status: r.status, timedOut: r.error?.code === 'ETIMEDOUT' };
};
const assert = require('assert/strict');
const placeholder = 'PORT=3000\nDEEPSEEK_API_KEY=sk-your-deepseek-api-key-here\n';
let r = run('DEEPSEEK_API_KEY=sk-real-key\n', '');
assert.match(r.out, /Da co DEEPSEEK_API_KEY/); console.log('1 DeepSeek key present: skip ✓');
r = run(placeholder + 'GEMINI_API_KEY=AIza-test\n', '');
assert.match(r.out, /GEMINI_API_KEY/); console.log('2 Gemini key in .env: skip ✓');
r = run(placeholder, '', { active: 'gemini', profiles: { deepseek: { model: 'deepseek-chat' }, gemini: { model: 'g', secret: 'AQAAANCM...' } } });
assert.match(r.out, /luu trong app/); console.log('3 key saved in app: skip ✓');
r = run(placeholder, '\n');
assert.ok(!r.timedOut, 'Enter must not hang'); assert.match(r.out, /Da bo qua/); assert.match(r.env, /^AI_KEY_SETUP=in-app$/m);
console.log('4 Enter skips and remembers ✓');
r = run(r.env, '');
assert.match(r.out, /cau hinh trong app/); console.log('5 next start does not ask again ✓');
r = run(placeholder, '');
assert.ok(!r.timedOut, 'No keyboard (hidden window) must not hang'); assert.match(r.env, /^AI_KEY_SETUP=in-app$/m);
console.log('7 no input at all: skips, no hang ✓');
r = run(placeholder, 'sk-new-key\n');
assert.match(r.env, /^DEEPSEEK_API_KEY=sk-new-key$/m); console.log('6 pasting a DeepSeek key still works ✓');
fs.rmSync(root, { recursive: true, force: true });
console.log('PASS launcher AI key step');
