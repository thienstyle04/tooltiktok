const { bumpVersion, readVersionParts, syncVersion, writeVersionParts } = require('./sync-version');

function bumpAndSync() {
  const nextParts = bumpVersion(readVersionParts());
  writeVersionParts(nextParts);
  return syncVersion();
}

if (require.main === module) {
  const { version } = bumpAndSync();
  console.log(`[version] bumped to v${version}`);
}

module.exports = { bumpAndSync };
