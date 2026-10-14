# Spotlight Nhật ký Đà Lạt — thử nghiệm

Template: `spotlight-v6-diary`, Dalat content sources only, 12 pages at 1080×1440.
Three Random photos followed by four food partners, four cafe partners and one
Check-in venue. Venues remain unique across categories. Check-in may be a regular
venue; its actual partner flag is preserved and XLSX contains only true partners.
Existing saved lists remain unchanged.

## Reproducible checks

From `backend`:

```powershell
npm run build
node -r ts-node/register src/modules/guide/tools/test-spotlight-diary.ts
node -r ts-node/register src/modules/guide/tools/test-spotlight-diary-integration.ts --output ../.test-runtime/diary/lists.json
node -r ts-node/register src/modules/guide/tools/test-spotlight-diary-integration.ts --source dalat-test --output ../.test-runtime/diary/lists.json
```

The integration test reads the local Dalat workbook, manifest and valid disk-cache
images. It writes generated lists/overrides only in its own temporary directory,
then removes that directory. The optional output contains export fixtures.
It checks five lists, original description lines/addresses, exact category quotas,
unique venues, partner position/photo rotation,
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
It also covers a single PNG, a mixed 29-page V5/V6/Diary batch, overflow rejection,
and a 36-page/three-workbook automation payload. Preview images are written under
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

## Quota adjustment verified 2026-10-12

- Reduced food partners from five to four; kept four cafe partners and added
  one Check-in venue, preserving 12 pages and venue uniqueness across groups.
  Five cafe partners would duplicate D'Lart Garden in the current Test source.
- Backend typecheck, core selector, eight synthetic position rotations and the
  shared partner-rotation regression passed.
- Five isolated saved lists passed on each cached source (`dalat`, `dalat-test`),
  including position/photo changes, rollback, reload and queued batch generation.
- Test-source export passed all three quality modes: 12 PNGs and eight true
  partner names per XLSX. The regular Check-in was not written as a partner.
- Single-page export, overflow blocking, mixed 29-page batch and a separate
  36-page/three-XLSX automation payload passed CRC/dimension/name checks.
- No source workbook or user lists were edited. The running dev backend still
  needs a restart to load the changed TypeScript; automatic restart was blocked
  by the execution environment. No commit, push or server release was performed.
