// Helper cho test cần chạm vào hàm nội bộ của lib/exportClient.js và lib/exporter/*.
// Không phụ thuộc hàm nằm ở file nào: tự tìm file khai báo hàm đó.
const fs = require('node:fs');
const path = require('node:path');

const libDir = path.resolve(__dirname, '../lib');
const files = () => [path.join(libDir, 'exportClient.js'),
  ...fs.readdirSync(path.join(libDir, 'exporter')).filter(name => name.endsWith('.js')).map(name => path.join(libDir, 'exporter', name))];
const declarationPattern = (name) => new RegExp(String.raw`^(export\s+)?(async\s+function\*?|function\*?|const|let|var|class)\s+${name}\b`, 'm');

/** File khai báo `name` ở cấp module. */
function fileDeclaring(name) {
  const hit = files().find(file => declarationPattern(name).test(fs.readFileSync(file, 'utf8')));
  if (!hit) throw new Error(`Không tìm thấy khai báo ${name} trong exportClient/exporter`);
  return hit;
}

/** Mã nguồn của một hàm cấp module (bỏ từ khóa export), để chạy riêng trong vm. */
function declarationSource(name) {
  const file = fileDeclaring(name);
  const source = fs.readFileSync(file, 'utf8');
  const match = declarationPattern(name).exec(source);
  const start = match.index + (match[1] ? match[1].length : 0);
  // Kết thúc ở khai báo cấp module kế tiếp.
  const next = /^(export\s+)?(async\s+function|function|const|let|var|class)\s+\w/mg;
  next.lastIndex = match.index + match[0].length;
  const hit = next.exec(source);
  return source.slice(start, hit ? hit.index : source.length);
}

/**
 * Plugin esbuild: xuất thêm các tên nội bộ được yêu cầu từ đúng file khai báo,
 * và (tùy chọn) nối thêm đoạn code thăm dò vào file khai báo một tên.
 * Dùng kèm `bundleContents(names)` làm nội dung stdin.
 */
function internalsPlugin(names, instrument = {}) {
  const wanted = new Map();
  for (const name of names) {
    const file = path.normalize(fileDeclaring(name));
    if (!wanted.has(file)) wanted.set(file, []);
    wanted.get(file).push(name);
  }
  const extra = new Map(Object.entries(instrument).map(([name, code]) => [path.normalize(fileDeclaring(name)), code]));
  return {
    name: 'export-client-internals',
    setup(build) {
      build.onLoad({ filter: /[\\/]lib[\\/](exportClient\.js|exporter[\\/][^\\/]+\.js)$/ }, (args) => {
        const file = path.normalize(args.path);
        let contents = fs.readFileSync(file, 'utf8');
        const local = (wanted.get(file) || []).filter(name => !new RegExp(String.raw`^export\s+(async\s+function|function|const|let|var|class)\s+${name}\b`, 'm').test(contents));
        if (extra.has(file)) contents += `\n${extra.get(file)}\n`;
        if (local.length) contents += `\nexport { ${local.join(', ')} };\n`;
        return { contents, loader: 'js', resolveDir: path.dirname(file) };
      });
    },
  };
}

/** Nội dung stdin: API công khai của exportClient + các tên nội bộ, resolveDir = lib. */
function bundleContents(names, extraLines = '') {
  const lines = ["export * from './exportClient';"];
  for (const name of names) {
    const rel = path.relative(libDir, fileDeclaring(name)).replace(/\\/g, '/').replace(/\.js$/, '');
    lines.push(`export { ${name} } from './${rel}';`);
  }
  return `${lines.join('\n')}\n${extraLines}`;
}

/**
 * Tùy chọn esbuild (stdin + plugins) để đóng gói exportClient cho test:
 *   names     — tên nội bộ cần xuất thêm (tự tìm file khai báo);
 *   overrides — { tênHàm: 'code' } nối vào cuối file khai báo hàm đó, ví dụ gán lại
 *               `downloadBlobFile = (blob, name) => ...` (nơi gọi thấy bản mới qua live binding);
 *   replace   — [{ name, find, with }] thay chuỗi trong file khai báo `name` (lỗi nếu không thấy);
 *   extra     — dòng thêm vào stdin (ví dụ: export { default as JSZip } from 'jszip').
 */
function bundleOptions({ names = [], overrides = {}, replace = [], extra = '' } = {}) {
  const replacements = new Map();
  for (const item of replace) {
    const file = path.normalize(fileDeclaring(item.name));
    if (!replacements.has(file)) replacements.set(file, []);
    replacements.get(file).push(item);
  }
  const base = internalsPlugin(names, overrides);
  const plugin = {
    name: 'export-client-test',
    setup(build) {
      base.setup({
        onLoad(options, callback) {
          build.onLoad(options, (args) => {
            const result = callback(args);
            for (const item of replacements.get(path.normalize(args.path)) || []) {
              if (!result.contents.includes(item.find)) throw new Error(`Không thấy đoạn cần thay trong ${path.basename(args.path)}: ${item.find}`);
              result.contents = result.contents.replace(item.find, item.with);
            }
            return result;
          });
        },
      });
    },
  };
  // esbuild.buildSync không nhận plugin: chỉ dùng plugin khi thật sự cần
  // (tên chưa được export ở file khai báo, hoặc có overrides/replace).
  const notExported = names.filter(name => !new RegExp(String.raw`^export\s+(async\s+function|function|const|let|var|class)\s+${name}\b`, 'm')
    .test(fs.readFileSync(fileDeclaring(name), 'utf8')));
  const needsPlugin = notExported.length || Object.keys(overrides).length || replace.length;
  return { stdin: { contents: bundleContents(names, extra), resolveDir: libDir }, plugins: needsPlugin ? [plugin] : [] };
}

module.exports = { libDir, fileDeclaring, declarationSource, internalsPlugin, bundleContents, bundleOptions };
