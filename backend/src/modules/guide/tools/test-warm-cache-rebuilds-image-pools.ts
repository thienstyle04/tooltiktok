import assert from 'node:assert/strict';

import { GuideService } from '../guide.service';

async function main(): Promise<void> {
  const service = new GuideService() as any;
  service.activeDestinationId = 'greenland';
  service.driveCacheWarmToken = 7;
  service.workbookSource = { destinationId: 'greenland', workbook: {} };

  let invalidated = 0;
  let rebuilt = 0;
  service.invalidateDatasetCache = (options: { immediate?: boolean }) => {
    assert.equal(options.immediate, true);
    invalidated += 1;
  };
  service.buildDatasetContext = () => {
    rebuilt += 1;
    service.workbookDerivedCache = { marker: 'rebuilt-after-drive-warm' };
    return { decks: [] };
  };

  service.rebuildDatasetAfterDriveWarm(7);
  assert.equal(invalidated, 1, 'Phai invalid dataset sticky sau khi warm anh xong');
  assert.equal(rebuilt, 1, 'Phai build lai dataset voi danh sach URL anh vua xac minh');
  assert.equal(service.workbookDerivedCacheByDestination.get('greenland')?.marker, 'rebuilt-after-drive-warm');

  service.rebuildDatasetAfterDriveWarm(6);
  assert.equal(rebuilt, 1, 'Token warm cu khong duoc rebuild de ghi de destination moi');

  console.log('PASS warm-cache rebuilds sticky dataset exactly once with the current token');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
