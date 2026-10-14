import assert from 'node:assert/strict';
import { inheritPageTypography } from '../logic/inherit-page-typography';

for (const variant of ['spotlight-v6-map-place', 'spotlight-v6-diary-page', 'itinerary-note-timed-day', 'grid-4', 'future-template']) {
  const source: any = { type: 'list', layoutVariant: variant, title: 'Mẹ', subtitle: 'Cũ', items: [{ name: 'Cũ', metaPrimary: 'Cũ' }], backgroundImage: 'old.jpg' };
  const fresh: any = { ...source, title: 'Mới', subtitle: 'Địa chỉ mới', items: [{ name: 'Mới' }], backgroundImage: 'new.jpg' };
  const deck: any = { id: variant, lists: [{ id: 'test-main', pages: [source] }] };
  const store: any = { decks: { [variant]: { 'test-main': { '0': { title: 'Không được chép', textFontSize: 9, textScale: 100 } } } } };
  const result = inheritPageTypography(deck, [fresh, fresh], store);
  for (const page of result) {
    assert.equal(page.textFontSize, 9);
    assert.equal(page.title, 'Mới'); assert.equal(page.subtitle, 'Địa chỉ mới'); assert.equal(page.backgroundImage, 'new.jpg');
    assert.equal(page.type, 'list');
    if (page.type === 'list') assert.deepEqual(page.items, fresh.items);
  }
  assert.equal(fresh.textFontSize, undefined);
  store.decks[variant]['test-main']['0'].textFontSize = 12;
  assert.equal(result[0].textFontSize, 9, 'Old child snapshot must not change');
  assert.equal(inheritPageTypography(deck, [fresh], store)[0].textFontSize, 12);
  store.decks[variant]['test-main']['0'].textFontSize = null;
  assert.equal(inheritPageTypography(deck, [fresh], store)[0].textFontSize, null);
}
// Declarative local pages use node styles for defaults, but saved absolute
// typography must override them without rewriting the layout or source data.
{
  const model = { templateId: 'local-typography-fixture', version: 1, width: 1080, height: 1440, fonts: [], nodes: [{ kind: 'text', text: 'New hook', style: { fontSize: 60 } }] };
  const main: any = { id: 'local-typography-fixture-main', pages: [{ type: 'cover', title: 'Mother hook', backgroundImage: 'mother.jpg', localRender: model }] };
  const deck: any = { id: 'local-typography-fixture', lists: [main] };
  const child: any = { type: 'cover', title: 'Child hook', backgroundImage: 'child.jpg', localRender: structuredClone(model) };
  const store: any = { decks: { [deck.id]: { [main.id]: { '0': { title: 'Mother edit', textFontSize: 45, textScale: 90 } } } } };
  const inherited = inheritPageTypography(deck, [child], store)[0];
  assert.equal(inherited.textFontSize, 45); assert.equal(inherited.textScale, 90);
  assert.equal(inherited.title, 'Child hook'); assert.equal(inherited.backgroundImage, 'child.jpg');
  assert.deepEqual(inherited.localRender, model); assert.equal(child.textFontSize, undefined);
}
console.log('PASS typography inheritance: Maps, Diary, Note, Grid, future template; new data preserved; immutable children; reset; additional pages');
