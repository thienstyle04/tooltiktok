const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const test = require('node:test');
const { compareVersions, parseJsonUtf8, verifyManifest } = require('./update-protocol');

const keys = crypto.generateKeyPairSync('ed25519');
const publicKey = keys.publicKey.export({ type: 'spki', format: 'pem' });
const payload = {
  schema: 1, channel: 'stable', platform: 'win32-x64', version: '0.7.05',
  commit: 'a'.repeat(40), notes: ['Sửa lỗi'],
  artifact: { path: 'releases/dalat-studio-0.7.05.zip', sha256: 'b'.repeat(64), size: 123 },
};
function sign(value) {
  const bytes = Buffer.from(JSON.stringify(value));
  return { payload: bytes.toString('base64'), signature: crypto.sign(null, bytes, keys.privateKey).toString('base64') };
}

test('so sánh phiên bản dạng 0.7.04', () => {
  assert.equal(compareVersions('0.7.05', '0.7.04'), 1);
  assert.equal(compareVersions('0.7.04', '0.7.04'), 0);
  assert.equal(compareVersions('0.6.10', '0.7.01'), -1);
});

test('đọc JSON UTF-8 có BOM do PowerShell cũ tạo', () => {
  assert.deepEqual(parseJsonUtf8('\uFEFF{"version":"0.8.08"}'), { version: '0.8.08' });
  assert.deepEqual(parseJsonUtf8('ï»¿{"version":"0.8.08"}'), { version: '0.8.08' });
});

test('chỉ nhận manifest có chữ ký và đường dẫn gói an toàn', () => {
  assert.equal(verifyManifest(sign(payload), publicKey).version, '0.7.05');
  const tampered = sign(payload);
  tampered.payload = Buffer.from(JSON.stringify({ ...payload, version: '0.8.01' })).toString('base64');
  assert.throws(() => verifyManifest(tampered, publicKey), /Chữ ký/);
  assert.throws(() => verifyManifest(sign({ ...payload, artifact: { ...payload.artifact, path: '../secret.zip' } }), publicKey), /Đường dẫn/);
  assert.throws(() => verifyManifest(sign({ ...payload, artifact: { ...payload.artifact, size: 0 } }), publicKey), /thông tin gói/);
});
