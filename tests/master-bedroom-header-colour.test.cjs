'use strict';
// Exact baseline renderer/CSS checks. Browser geometry and colour-seam acceptance are separate.
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),crypto=require('node:crypto');
const root=path.join(__dirname,'..'),read=p=>fs.readFileSync(path.join(root,p),'utf8');
const source=read('js/app.js'),css=read('css/style.css'),html=read('index.html');
const M=require('../js/model.js');
function extract(from,until){const start=source.indexOf('function '+from+'('),end=source.indexOf('\nfunction '+until+'(',start);assert.ok(start>=0&&end>start,from);return source.slice(start,end).trim();}
const headerBounds=vm.runInNewContext('('+source.match(/^const headerBounds=([^\n]+);$/m)[1]+')');
function renderHeader(route,roomId){
 const app={innerHTML:''},features={reduceMotion:false,laundry:[]},board=M.board();
 const rooms=new Map(board.rooms.map(r=>[r.id,r]));
 const ctx={route,roomId,app,board,headerBounds,window:{scrollY:0,TidyActivityHost:{unmount:()=>{}},scrollTo:()=>{}},document:{body:{classList:{toggle:()=>{}}},querySelector:()=>null},F:()=>features,M:{laundryNeedsAttention:()=>false},editor:{querySelector:()=>null},Q:{content:()=>'<p>Focus fixture</p>'},storageError:'',seasonalMaintain:()=>false,applySeasonalTheme:()=>{},unmountDailyLogViews:()=>{},mountDailyLogViews:()=>{},customLaundryAttentionSignature:()=>'',careAttentionSignature:()=>'',customAttentionSignature:()=>'',updateClocks:()=>{},room:id=>rooms.get(id),asset:p=>p,esc:x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])),globals:()=>'',pageHeading:()=>'<div class="top-page-line">Room heading</div>',footer:()=>'',roomPage:()=>'<p>Room fixture</p>',sidePage:()=>'<p>Side fixture</p>',morePage:()=>'',calendarView:'plan'};
 vm.runInNewContext(extract('compactHeader','pageHeading'),ctx);
 vm.runInNewContext(extract('render','dialog'),ctx);
 ctx.render();return app.innerHTML;
}
const findHeader=markup=>markup.match(/<header class="([^"]+)"><div class="brand">([\s\S]*?)<\/div><div class="top-page-line">/);
const masterRoutes=['room','focus','clearway'];
test('Master Bedroom Room, Focus and Clear the Way alone carry scoped header class',()=>{
 for(const route of masterRoutes){const h=findHeader(renderHeader(route,'master'));assert.ok(h,route);assert.match(h[1],/\bmaster-bedroom-header\b/,route);assert.match(h[2],/headers\/bedroom-bigfoot-header\.png/,route);}
});
test('Other rooms and unrelated routes never inherit Master Bedroom header colour',()=>{
 for(const route of masterRoutes)for(const id of ['kitchen','penny','living','bathroom']){
  const h=findHeader(renderHeader(route,id));assert.ok(h,route+':'+id);assert.doesNotMatch(h[1],/master-bedroom-header/,route+':'+id);
 }
 const h=findHeader(renderHeader('side','master'));assert.ok(h);assert.doesNotMatch(h[1],/master-bedroom-header/);assert.match(h[2],/headers\/Tidy-ish\.png/);
});
test('Scoped selector sets sampled #250149 only on the Master Bedroom brand strip',()=>{
 assert.match(css,/\.top\.master-bedroom-header\s*>\s*\.brand\s*\{\s*background:\s*#250149\s*;?\s*\}/i);
 assert.doesNotMatch(css,/(?:^|\})\s*\.brand\s*\{\s*background:\s*#250149/i);
});
test('Corrected supplied artwork is installed in PNG and real WebP runtime path, with original crop',()=>{
 const dig=file=>crypto.createHash('sha256').update(fs.readFileSync(path.join(root,file))).digest('hex');
 assert.equal(dig('assets/headers/bedroom-bigfoot-header.png'),'91cd44c9eec9092479f8c05da37fd8c54d2becb2e1cefa97deae0ecbd71ffb7f');
 assert.equal(dig('assets/headers/bedroom-bigfoot-header.webp'),'69d24ebb8521d78d5bb818654f5c39c33f9ea467f1c796b6769a8f88212d5f54');
 const webp=fs.readFileSync(path.join(root,'assets/headers/bedroom-bigfoot-header.webp'));
 assert.equal(webp.toString('ascii',0,4),'RIFF');assert.equal(webp.toString('ascii',8,12),'WEBP');
 const png=fs.readFileSync(path.join(root,'assets/headers/bedroom-bigfoot-header.png'));
 assert.equal(png.readUInt32BE(16),1280);assert.equal(png.readUInt32BE(20),656);
 const h=renderHeader('room','master');assert.match(h,/viewBox="0 7 1280 641"/);assert.match(h,/width="1280" height="656"/);
});
test('Master-only artwork cache bust updates actual WebP URL but not other room URLs',()=>{
 const master=renderHeader('room','master'),other=renderHeader('room','kitchen');
 assert.match(master,/headers\/bedroom-bigfoot-header\.png\?v=20261120-masterportrait2/);
 assert.doesNotMatch(other,/20261120-masterportrait2/);
 assert.match(source,/const optimized=routed\.replace\(/); // Runtime loader resolves .png to .webp.
});
test('Only changed styles and app script get fresh cache keys',()=>{
 assert.match(html,/css\/style\.css\?v=[^"\n]+-masterportrait2-roomchildstrike2-kayleighwriting1-fontreadability2-fontcards1"/);
 assert.match(html,/js\/app\.js\?v=[^"\n]+-masterportrait2-libraryrepeat1-seasonaltab1-kayleighwriting1-seasonal2a1-seasonal2b1-seasonal2c1-workloada2-christmasb1-seasonalshare1-taskcheck1-christmashome1-christmasb2a1-christmasb3a1-christmasart1-dolater1-christmastrees1-jingle1-fontcards1-taskcardart1-focusresume1-focusnav1-timeralarmfix1-focusbreak2-elapsedentry1-doingcollapse1-seasonalhomecomplete1"/);
 assert.match(html,/css\/quest-library\.css\?v=20261031-management1-libraryheader1-filterrow1-occasionaltab1-seasonaltab1"/);
});
