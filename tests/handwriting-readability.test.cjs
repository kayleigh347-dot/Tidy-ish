const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const read=n=>fs.readFileSync(path.join(__dirname,'..',n),'utf8');
const css=read('css/style.css'), app=read('js/app.js'),html=read('index.html');
test('both existing handwriting faces have the same 130% metric and glyph scaling',()=>{
 const faces=[...css.matchAll(/@font-face\s*\{([^}]+)\}/g)].map(m=>m[1]).filter(s=>s.includes('"Kayleigh Writing Compact"'));
 assert.equal(faces.length,2);
 for(const [i,weight] of [400,700].entries()){
  assert.match(faces[i],new RegExp(`font-weight: ${weight};`));
  assert.match(faces[i],/size-adjust: 130%;/);
  assert.match(faces[i],new RegExp(`Kayleighs-writing_Compact_${weight===400?'Regular':'Bold'}\\.ttf`));
 }
});
test('dark stroke is restricted to existing handwriting body scope',()=>{
 const rule=css.match(/body\.kayleigh-writing-active,\s*body\.kayleigh-writing-active \*\s*\{([^}]+)\}/);
 assert.ok(rule);assert.match(rule[1],/-webkit-text-stroke: 0\.8px #160b1e;/);assert.match(rule[1],/paint-order: stroke fill;/);
 assert.match(rule[1],/font-family: "Kayleigh Writing Compact"/);
 assert.equal((css.match(/-webkit-text-stroke: 0\.8px #160b1e/g)||[]).length,1);
});
test('Settings exclusion and stylesheet cache update stay intact',()=>{
 assert.match(app,/classList\.toggle\('kayleigh-writing-active',route!=='settings'\)/);
 assert.match(html,/css\/style\.css\?v=[^"\n]+-kayleighwriting1-fontreadability2-fontcards1"/);
});
