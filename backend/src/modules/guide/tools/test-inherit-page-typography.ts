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
console.log('PASS typography inheritance: Maps, Diary, Note, Grid, future template; new data preserved; immutable children; reset; additional pages');
