# Spotlight Nhật ký Đà Lạt — thử nghiệm

Template: `spotlight-v6-diary`, Dalat only, 10 pages at 1080×1440.
Three Random photos followed by four food partners and three cafe partners.

## Reproducible checks

From `backend`:

```powershell
npm run build
node -r ts-node/register src/modules/guide/tools/test-spotlight-diary.ts
node -r ts-node/register src/modules/guide/tools/test-spotlight-diary-integration.ts --output ../.test-runtime/diary/lists.json
```

The integration test reads the local Dalat workbook, manifest and valid disk-cache
images. It writes generated lists/overrides only in its own temporary directory,
then removes that directory. The optional output contains export fixtures.
It checks two lists, original description lines/addresses, exact partner quotas,
failed-save rollback, restart, empty overrides, display merge, unchanged snapshots,
and an idempotent queued batch request for three automation lists.

From `frontend`:

```powershell
npm run build
node tools/test-spotlight-diary-export.mjs
node tools/test-v6-export-quality.mjs
node tools/test-spotlight-v5-partners-export.mjs
```

The export test runs the real renderer/export code in headless Chrome/Edge with
local HTTP routes backed by actual cached photos. It validates all PNGs, dimensions,
opaque corners, ZIP CRC, exact partner names and caption in each quality mode.
It also covers a single PNG, a mixed 22-page V5/V6/Diary batch, overflow rejection,
and a 30-page/three-workbook automation payload. Preview images are written under
`.test-runtime/diary` (ignored by Git).

## Scope of completed checks

- Backend/frontend builds and tests above passed.
- Existing V6, Green, Dark, Maps, Persimmon and timed-note override tests passed.
- Existing automation-scheduler unit tests passed.
- Source spreadsheet and user lists are not modified by these tests.

These are cached-source, isolated integration tests, not a fresh Google Sheet
refresh or a wall-clock scheduled run through the Windows launcher. Those live
acceptance checks remain before claiming complete end-to-end deployment acceptance.
Description filtering is deterministic and conservative, not semantic AI analysis;
source authors should keep each line a single general observation about the venue.
