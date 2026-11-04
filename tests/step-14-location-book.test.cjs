const assert=require('node:assert/strict');
const {test}=require('node:test');
const M=require('../js/model.js');
const Share=require('../js/sharing-model.js');
const Place=require('../js/location-book.js');
const Fresh=require('../js/fresh-house-core.js');
const empty=()=>({tasks:[],side:[],rooms:[],wins:[],settings:[],homeless:[],sideTabs:[]});
function placeBoard(){
 const b=M.board();
 Place.addArea(b.features,b.rooms,'area-kitchen-drawer','kitchen','Kitchen drawer');
 Place.addArea(b.features,b.rooms,'area-storage-bin','storage','Storage bin');
 Place.addEntry(b.features,b.rooms,'item-scissors',{name:'Scissors',tabId:'household',areaId:'area-kitchen-drawer'});
 return b;
}
test('location move records current and previous places, retaining the complete move trail',()=>{
 const b=placeBoard();
 assert.equal(Place.moveEntry(b.features,b.rooms,'item-scissors','area-storage-bin','move-1','2026-11-01T10:00:00Z'),true);
 assert.equal(Place.previous(b.features,b.features.locationEntries[0]).fromAreaName,'Kitchen drawer');
 assert.equal(Place.moveEntry(b.features,b.rooms,'item-scissors','area-kitchen-drawer','move-2','2026-11-02T10:00:00Z'),true);
 assert.equal(Place.history(b.features,'item-scissors').length,2);
 assert.equal(Place.previous(b.features,b.features.locationEntries[0]).fromAreaName,'Storage bin');
});
test('deleting an occupied area moves items and complete history to the 30-day Bin',()=>{
 const b=placeBoard(),at=Date.parse('2026-11-01T10:00:00Z');
 Place.moveEntry(b.features,b.rooms,'item-scissors','area-storage-bin','move-1',new Date(at).toISOString());
 Place.moveEntry(b.features,b.rooms,'item-scissors','area-kitchen-drawer','move-2',new Date(at+1000).toISOString());
 assert.equal(Place.removeArea(b.features,'area-kitchen-drawer',b.rooms,at+2000),1);
 assert.equal(b.features.locationEntries.length,0);
 assert.equal(b.features.locationAreas.some(x=>x.id==='area-kitchen-drawer'),false);
 assert.equal(b.features.locationTrash[0].fromAreaName,'Kitchen drawer');
 assert.equal(b.features.locationTrash[0].expiresAt,new Date(at+2000+30*86400000).toISOString());
 assert.equal(Place.history(b.features,'item-scissors').length,2);
 assert.throws(()=>Place.removeTab(b.features,'household',b.rooms),/stays available/);
});
test('Bin restore preserves history and expiry purges entries only after thirty days',()=>{
 const b=placeBoard(),at=Date.parse('2026-11-01T10:00:00Z');
 Place.moveEntry(b.features,b.rooms,'item-scissors','area-storage-bin','move-1',new Date(at).toISOString());
 Place.trashEntry(b.features,b.rooms,'item-scissors',at+1000);
 const expiry=Date.parse(b.features.locationTrash[0].expiresAt);
 assert.throws(()=>Place.restoreEntry(b.features,b.rooms,'item-scissors',{tabId:'household',areaId:'area-kitchen-drawer'},'restore-1',new Date(expiry).toISOString(),expiry),/expired/);
 assert.equal(Place.expireTrash(b.features,expiry-1),0);
 assert.equal(Place.expireTrash(b.features,expiry),1);
 assert.equal(b.features.locationMoves.length,0);
 const restored=placeBoard();Place.trashEntry(restored.features,restored.rooms,'item-scissors',at);
 Place.restoreEntry(restored.features,restored.rooms,'item-scissors',{tabId:'household',areaId:'area-storage-bin'},'restore-2',new Date(at+2000).toISOString(),at+2000);
 assert.equal(restored.features.locationEntries[0].areaId,'area-storage-bin');
 assert.equal(Place.previous(restored.features,restored.features.locationEntries[0]).fromAreaName,'Kitchen drawer');
});
test('same-name areas with different IDs survive household sync without invalidating the board',()=>{
 const b=placeBoard();
 b.features.locationAreas.push({id:'area-kitchen-drawer-from-other-device',roomId:'kitchen',name:'Kitchen drawer',order:1});
 const restored=M.normalize(b);
 assert.equal(restored.features.locationAreas.filter(x=>x.name==='Kitchen drawer').length,2);
});
test('tabs and empty areas can be renamed and removed while occupied tab items enter the Bin',()=>{
 const b=placeBoard();Place.addTab(b.features,'tab-crafting','Crafting');
 Place.addEntry(b.features,b.rooms,'item-glue',{name:'Glue',tabId:'tab-crafting',areaId:'area-kitchen-drawer'});
 Place.renameTab(b.features,'tab-crafting','Bits & Bobs');
 assert.equal(b.features.locationTabs.find(x=>x.id==='tab-crafting').name,'Bits & Bobs');
 Place.removeTab(b.features,'tab-crafting',b.rooms,Date.parse('2026-11-01T10:00:00Z'));
 assert.equal(b.features.locationTabs.some(x=>x.id==='tab-crafting'),false);
 assert.equal(b.features.locationTrash[0].item.name,'Glue');
 Place.addArea(b.features,b.rooms,'area-empty','bathroom','Shelf');
 Place.renameArea(b.features,'area-empty','Top shelf');
 Place.removeArea(b.features,'area-empty');
 assert.equal(b.features.locationAreas.some(x=>x.id==='area-empty'),false);
});
test('location tabs, areas, items and move history round-trip through the active household payload',()=>{
 const b=placeBoard();Place.addTab(b.features,'tab-crafting','Crafting');
 Place.editEntry(b.features,b.rooms,'item-scissors',{name:'Scissors',tabId:'tab-crafting',areaId:'area-storage-bin'},'move-1','2026-11-01T10:00:00Z');
 Place.addEntry(b.features,b.rooms,'item-glue',{name:'Glue',tabId:'tab-crafting',areaId:'area-kitchen-drawer'});
 Place.trashEntry(b.features,b.rooms,'item-glue',Date.parse('2026-11-01T10:01:00Z'));
 const raw=Share.project(b,empty(),'member-a');
 assert.ok(raw.settings.some(x=>x.id==='tidy-location-tab:tab-crafting'));
 assert.ok(raw.settings.some(x=>x.id==='tidy-location-item:item-scissors'));
 const restored=M.normalize(Share.importRaw(raw));
 assert.equal(restored.features.locationTabs.find(x=>x.id==='tab-crafting').name,'Crafting');
 assert.equal(restored.features.locationEntries[0].areaId,'area-storage-bin');
 assert.equal(restored.features.locationMoves[0].fromAreaName,'Kitchen drawer');
 assert.equal(restored.features.locationTrash[0].item.name,'Glue');
});
test('new household transfer excludes previous-household locations and move history',()=>{
 const b=placeBoard();Place.moveEntry(b.features,b.rooms,'item-scissors','area-storage-bin','move-1','2026-11-01T10:00:00Z');Place.trashEntry(b.features,b.rooms,'item-scissors',Date.parse('2026-11-01T10:01:00Z'));
 const prepared=Fresh.prepare(b,'member-a','all');
 assert.deepEqual(prepared.imported.features.locationTabs.map(x=>x.id),['household']);
 assert.deepEqual(prepared.imported.features.locationAreas,[]);
 assert.deepEqual(prepared.imported.features.locationEntries,[]);
 assert.deepEqual(prepared.imported.features.locationMoves,[]);
 assert.deepEqual(prepared.imported.features.locationTrash,[]);
});
