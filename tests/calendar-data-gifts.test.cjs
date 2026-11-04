const assert=require('node:assert/strict');
const {test}=require('node:test');
const fs=require('node:fs');
const path=require('node:path');
const M=require('../js/model.js');
const Share=require('../js/sharing-model.js');
const empty=()=>({tasks:[],side:[],rooms:[],wins:[],settings:[],homeless:[],sideTabs:[]});

test('older boards gain empty gift lists and retain valid gift people and gifts',()=>{
 const old=M.board();delete old.features.gifts;delete old.features.giftPeople;
 const normalized=M.normalize(old);
 assert.deepEqual(normalized.features.gifts,[]);
 assert.deepEqual(normalized.features.giftPeople,[]);
 normalized.features.giftPeople.push({id:'person-1',name:'Nana'});
 normalized.features.gifts.push({id:'gift-1',occasion:'christmas',recipient:'Nana',title:'Tea',eventDate:'2026-12-25',budget:20,spent:0,status:'idea'});
 assert.equal(M.normalize(normalized).features.giftPeople[0].name,'Nana');
 assert.throws(()=>M.normalize({...normalized,features:{...normalized.features,giftPeople:[{id:'person-1',name:' '}]}}),/gift person/);
});

test('gift tracker people and gifts survive household settings export and import',()=>{
 const board=M.board();
 board.features.giftPeople.push({id:'person-1',name:'Nana',tracker:true,ideas:['Tea'],checkoffs:{}},{id:'person-2',name:'Neighbours',tracker:false,checkoffs:{christmas:true,birthday:false}});
 board.features.gifts.push({id:'gift-1',occasion:'birthday',recipient:'Nana',recipientId:'person-1',title:'Flowers',eventDate:'2027-03-08',budget:25,spent:0,status:'idea'});
 const payload=Share.project(board,empty(),'owner');
 assert.ok(payload.settings.some(row=>row.id==='tidy-gift-person:person-1'));
 assert.ok(payload.settings.some(row=>row.id==='tidy-gift:gift-1'));
 const restored=Share.importRaw(payload);
 assert.deepEqual(restored.features.giftPeople,board.features.giftPeople);
 assert.deepEqual(restored.features.gifts,board.features.gifts);
});

test('index contains valid separate Calendar and gift stylesheet links',()=>{
 const html=fs.readFileSync(path.join(__dirname,'..','index.html'),'utf8');
 assert.match(html,/<link rel="stylesheet" href="css\/activity-calendar\.css\?v=[^"]+">/);
 assert.match(html,/<link rel="stylesheet" href="css\/calendar-data-gifts\.css\?v=[^"]+">/);
});

test('gift tracker keeps the all-people view gift-free and separates check-off people from trackers',()=>{
 const app=fs.readFileSync(path.join(__dirname,'..','js','app.js'),'utf8');
 assert.match(app,/\['all','All People'\]/);
 assert.match(app,/trackers\.map\(p=>\[p\.id,p\.name\]\)/);
 assert.match(app,/checkoffPeople\.map\(checkoffRow\)/);
 assert.match(app,/One person per line/);
 assert.match(app,/Add person with tracker/);
 assert.match(app,/gift-checkoff-toggle/);
 const allPeopleStart=app.indexOf('if(!person){const rows='),allPeopleEnd=app.indexOf('const eventGifts=',allPeopleStart);
 assert.ok(allPeopleStart>=0&&allPeopleEnd>allPeopleStart);
 assert.doesNotMatch(app.slice(allPeopleStart,allPeopleEnd),/giftRow|gift\.title|eventGifts/);
 const editorStart=app.indexOf('function openGiftEditor('),editorEnd=app.indexOf('function giftCheckoffPeopleDialog(',editorStart),editor=app.slice(editorStart,editorEnd);
 const formBody=editor.match(/const body=([^;]+);/)?.[1]||'';
 assert.deepEqual([...formBody.matchAll(/field\('([^']+)'/g)].map(match=>match[1]),['Gift name','Price (£)']);
 assert.match(editor,/status:existing\?\.status==='wrapped'\?'wrapped':'bought'/);
 assert.match(editor,/giftStatusTab=row\.status==='wrapped'\?'wrapped':'needs-wrap'/);
 assert.match(app,/One idea per line/);
 assert.match(app,/\['needs-wrap','Needs wrapped'\]/);
});
