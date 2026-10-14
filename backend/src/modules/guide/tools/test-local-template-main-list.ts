import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { localTemplateDecks } from '../local-templates';
import { GuideService } from '../guide.service';

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'dalat-local-main-contract-'));
const prior = process.env.DALAT_LOCAL_TEMPLATES_DIR;
process.env.DALAT_LOCAL_TEMPLATES_DIR = root;
try {
  const id = 'local-main-fixture', folder = path.join(root, id);
  fs.mkdirSync(folder);
  const source = 'dalat-test';
  fs.writeFileSync(path.join(folder, 'template.json'), JSON.stringify({ id, version: 1, name: 'Fixture', description: 'Fixture only', allowedSourceIds: [source], builder: 'builder.cjs', assets: [], pageCount: 1 }));
  fs.writeFileSync(path.join(folder, 'builder.cjs'), "const fs=require('node:fs'),path=require('node:path');module.exports={build(){throw Error('Reading catalog must never generate');},mainList(){const file=path.join(__dirname,'sample.json');return fs.existsSync(file)?JSON.parse(fs.readFileSync(file,'utf8')):undefined;}};");
  assert.equal(localTemplateDecks(source)[0].lists.length, 0, 'Optional sample keeps old packages compatible');
  const sample = { id: 'untrusted-sample-id', navTitle: 'Sample', title: 'Sample', pages: [{ type: 'list', title: 'Sample', subtitle: '', backgroundImage: '/assets/fixed-local-sample.png', items: [], localRender: { templateId: id, version: 1, width: 1080, height: 1440, fonts: [], nodes: [] } }] };
  const writeSample = (value: unknown) => fs.writeFileSync(path.join(folder, 'sample.json'), JSON.stringify(value));
  writeSample(sample);
  const first = localTemplateDecks(source)[0].lists[0];
  assert.equal(first.id, id + '-main'); assert.equal(first.navTitle, 'List chính'); assert.equal(first.pages.length, 1);
  first.pages[0].title = 'Caller mutation'; assert.equal(localTemplateDecks(source)[0].lists[0].pages[0].title, 'Sample');
  assert.equal(localTemplateDecks('other-source').length, 0);
  writeSample({ ...sample, pages: [] }); assert.throws(() => localTemplateDecks(source), /List chính/);
  sample.pages[0].localRender.version = 2; writeSample(sample); assert.throws(() => localTemplateDecks(source), /phiên bản/);
  sample.pages[0].localRender.version = 1; writeSample(sample);
  const dataRoot = path.join(root, 'data');
  const service = () => {
    const s = new GuideService() as any;
    Object.defineProperty(s, 'dataRoot', { value: dataRoot });
    s.activeDestinationId = source;
    s.ensureWorkbookDerivedContext = () => ({ baseDecks: [], coverImageUrls: [], itemsBySection: {} });
    return s;
  };
  const s = service();
  assert.equal(s.updatePageText(id, id + '-main', 0, { textFontSize: 45 }).textFontSize, 45);
  const reload = service(); reload.ensureGeneratedListsLoaded();
  const displayed = reload.mergeGeneratedLists(localTemplateDecks(source), [])[0].lists[0];
  assert.equal(displayed.pages[0].textFontSize, 45);
  assert.equal(displayed.pages[0].title, 'Sample');
  assert.equal(displayed.pages[0].backgroundImage, '/assets/fixed-local-sample.png');
  assert.equal(reload.generatedListsByDeckId.size, 0);
  assert.deepEqual(reload.localTemplateState, {}); assert.deepEqual(reload.partnerRotation, {});
  assert.equal(JSON.parse(fs.readFileSync(path.join(folder, 'sample.json'), 'utf8')).pages[0].textFontSize, undefined);
  assert.throws(() => s.updatePageText(id, id + '-main', 9, {}), /Khong tim thay trang/);
  assert.throws(() => s.updatePageText(id, 'missing', 0, {}), /Khong tim thay list/);
  console.log('PASS local main-list hook, legacy compatibility, source policy, page/version validation, font save/reload without workbook base deck, source snapshot and cycles unchanged');
} finally {
  if (prior === undefined) delete process.env.DALAT_LOCAL_TEMPLATES_DIR; else process.env.DALAT_LOCAL_TEMPLATES_DIR = prior;
}
