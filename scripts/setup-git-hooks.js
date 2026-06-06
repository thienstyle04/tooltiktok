const { execSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const rootDir = path.resolve(__dirname, '..');
const hooksDir = path.join(rootDir, '.githooks');

function ensureHook(name, body) {
  const hookPath = path.join(hooksDir, name);
  if (!fs.existsSync(hookPath)) {
    fs.writeFileSync(hookPath, body, { mode: 0o755 });
  }
}

function main() {
  if (!fs.existsSync(path.join(rootDir, '.git'))) {
    console.warn('[hooks] Not a git repository; skipped hook setup.');
    return;
  }

  ensureHook('pre-commit', `#!/bin/sh
node scripts/pre-commit-version.js
`);

  ensureHook('post-merge', `#!/bin/sh
node scripts/sync-version.js
`);

  try {
    execSync('git config core.hooksPath .githooks', { cwd: rootDir, stdio: 'inherit' });
    console.log('[hooks] core.hooksPath = .githooks');
  } catch (error) {
    console.warn(`[hooks] Could not configure git hooks: ${error.message}`);
  }
}

main();
