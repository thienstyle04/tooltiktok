const { execSync } = require('node:child_process');
const path = require('node:path');
const { bumpAndSync } = require('./bump-version');

const rootDir = path.resolve(__dirname, '..');

const VERSION_FILES = new Set([
  'VERSION',
  'package.json',
  'frontend/package.json',
  'backend/package.json',
  'frontend/lib/appVersion.js',
]);

const CODE_PREFIXES = ['frontend/', 'backend/', 'scripts/', '.githooks/'];

function getStagedFiles() {
  return execSync('git diff --cached --name-only', { cwd: rootDir, encoding: 'utf8' })
    .split(/\r?\n/)
    .filter(Boolean);
}

function shouldBump(stagedFiles) {
  if (process.env.SKIP_VERSION_BUMP === '1') return false;
  const codeChanges = stagedFiles.filter((file) => CODE_PREFIXES.some((prefix) => file.startsWith(prefix)));
  if (codeChanges.length === 0) return false;
  const nonVersionOnly = stagedFiles.filter((file) => !VERSION_FILES.has(file));
  return nonVersionOnly.length > 0;
}

function main() {
  const stagedFiles = getStagedFiles();
  if (!shouldBump(stagedFiles)) return;

  const { version } = bumpAndSync();
  execSync(
    'git add VERSION package.json frontend/package.json backend/package.json frontend/lib/appVersion.js',
    { cwd: rootDir, stdio: 'inherit' },
  );
  console.log(`[version] pre-commit bumped to v${version}`);
}

main();
