import fs from 'node:fs';
import path from 'node:path';
const outputs=path.resolve('../outputs'),source=path.join(outputs,'partners-audit-1790938831326'),root=path.join(outputs,'photo-presets-representatives-'+Date.now());
const fixture=JSON.parse(fs.readFileSync(path.join(source,'generation.json')));
const ids=['grid-4','itinerary-3n2d','spotlight-partner','spotlight-v6-maps','spotlight-v2','threads-food-local','threads-cafe-local','threads-mix-local','threads-mix-text'];
fixture.decks=fixture.decks.filter(deck=>ids.includes(deck.id)).map(deck=>({...deck,lists:deck.lists.slice(0,1).map(list=>{
 const next=structuredClone(list);if(deck.id!=='threads-mix-text'){next.photoPreset='iphone-color-edit-v1';next.pages.forEach(page=>page.photoPreset=next.photoPreset);}return next;
})}));
fs.mkdirSync(path.join(root,'data'),{recursive:true});fs.symlinkSync(path.join(source,'data/drive-file-cache'),path.join(root,'data/drive-file-cache'),'junction');
fs.writeFileSync(path.join(root,'generation.json'),JSON.stringify({...fixture,root},null,2));console.log(root);
