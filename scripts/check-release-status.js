#!/usr/bin/env node
/**
 * Kiem tra fearch vs main — chay sau commit/push de biet co can release len main khong.
 */
const { execSync } = require('node:child_process');
const path = require('node:path');

const repoRoot = path.resolve(__dirname, '..');

function run(cmd) {
  return execSync(cmd, { cwd: repoRoot, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
}

function runOptional(cmd) {
  try {
    return run(cmd);
  } catch {
    return '';
  }
}

function main() {
  const lines = [];
  let needsRelease = false;
  let hasLocalWork = false;

  try {
    run('git fetch origin main fearch');
  } catch (error) {
    console.error('[release-check] Khong fetch duoc GitHub:', error.message || error);
    process.exit(2);
  }

  const currentBranch = run('git branch --show-current');
  const fearchTip = run('git rev-parse origin/fearch');
  const mainTip = run('git rev-parse origin/main');
  const fearchAhead = Number(run('git rev-list --count origin/main..origin/fearch') || '0');
  const mainAhead = Number(run('git rev-list --count origin/fearch..origin/main') || '0');
  const treeDiff = runOptional('git diff --stat origin/fearch origin/main');

  const porcelain = runOptional('git status --porcelain');
  const trackedChanges = porcelain
    .split('\n')
    .filter(Boolean)
    .filter((line) => !line.startsWith('??'));

  if (trackedChanges.length > 0) {
    hasLocalWork = true;
    lines.push(`[LOCAL] Con ${trackedChanges.length} thay doi chua commit tren nhanh "${currentBranch}".`);
  }

  lines.push(`[REMOTE] origin/fearch: ${fearchTip.slice(0, 7)}`);
  lines.push(`[REMOTE] origin/main:  ${mainTip.slice(0, 7)}`);

  if (fearchAhead > 0) {
    needsRelease = true;
    lines.push(`[CANH BAO] fearch co ${fearchAhead} commit CHUA co tren main → can release-to-main.bat`);
  } else {
    lines.push('[OK] Khong co commit moi tren fearch ma thieu tren main.');
  }

  if (mainAhead > 0) {
    lines.push(`[INFO] main co ${mainAhead} commit hon fearch (merge PR / README — binh thuong).`);
  }

  if (treeDiff && !treeDiff.includes('0 files changed')) {
    const onlyReadme = treeDiff.split('\n').filter((line) => line.trim() && !line.startsWith(' README.md') && !line.includes('files changed')).length === 0
      && treeDiff.includes('README.md');
    if (fearchAhead > 0) {
      needsRelease = true;
      lines.push('[CANH BAO] Noi dung file khac nhau giua fearch va main:');
      lines.push(treeDiff);
    } else if (onlyReadme) {
      lines.push('[INFO] Chi khac README giua fearch va main — code tool da dong bo.');
    } else if (treeDiff.trim()) {
      lines.push('[INFO] Khac biet nho giua fearch va main (khong co commit fearch moi):');
      lines.push(treeDiff);
    }
  } else {
    lines.push('[OK] Noi dung file fearch va main giong nhau.');
  }

  console.log(lines.join('\n'));

  if (needsRelease || hasLocalWork) {
    console.log('\n=> Nhac: test xong tren fearch → chay release-to-main.bat → may khac chay update.bat');
    process.exit(1);
  }

  console.log('\n=> fearch va main da dong bo. May khac co the update.bat.');
  process.exit(0);
}

main();
