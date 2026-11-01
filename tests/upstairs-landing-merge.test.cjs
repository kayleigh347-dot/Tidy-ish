const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const M=require('../js/model.js');
const A=require('../js/activity-calendar-data.js');

test('legacy Cat Tray Area and Upstairs Landing merge without losing linked household data',()=>{
 const b=M.board(),cat=b.rooms.find(r=>r.id==='cats');cat.name='Cat Tray Area';cat.capacity=14;cat.calibration=JSON.stringify({percent:20,weights:{'cat-task':1}});
 b.rooms.push({id:'upstairs',name:'Upstairs Landing',art:'upstairs-landing-background.png',header:null,mess:0,capacity:16,calibration:JSON.stringify({percent:30,weights:{'upstairs-task':2}}),archived:false});
 const catTask=M.task({id:'cat-task',title:'Scoop tray',room:'cats'}),upTask=M.task({id:'upstairs-task',title:'Vacuum landing',room:'upstairs'});b.tasks.push(catTask,upTask);
 b.features.wins.push({id:'win-cat',taskId:catTask.id,room:'cats'},{id:'win-up',taskId:upTask.id,room:'upstairs'});
 b.features.items.push({id:'homeless-up',kind:'homeless',text:'Toy',location:'upstairs'});
 b.features.completionSummaries.push({id:'summary-up',room:'upstairs'});
 b.features.templates.push(M.task({id:'template-up',room:'upstairs',title:'Landing task'}));
 b.features.routines.push({id:'routine-up',room:'upstairs'});
 b.features.focusSessions.push({room:'cats',resetIds:['cat-task'],taskIds:['cat-task']},{room:'upstairs',resetIds:['upstairs-task'],taskIds:['upstairs-task']});
 b.features.locationAreas.push({id:'area-cat',roomId:'cats',name:'Tray corner'},{id:'area-up',roomId:'upstairs',name:'Top step'});
 b.features.taskDataArchives.push({id:'archive-up',kind:'completion',taskId:'upstairs-task',period:'2025-01',room:'upstairs',count:1});
 b.features.areas={cats:['Tray corner'],upstairs:['Top step']};
 b.features.activityDiary.annotations={one:{roomId:'upstairs',text:'upstairs stays in historical prose'}};
 const source=JSON.stringify(b),migrated=M.normalize(b),landing=migrated.rooms.find(r=>r.id==='cats');
 assert.equal(JSON.stringify(b),source);
 assert.equal(migrated.rooms.some(r=>r.id==='upstairs'),false);assert.equal(landing.name,'Upstairs Landing');assert.equal(landing.capacity,16);assert.equal(landing.archived,false);
 assert.equal(migrated.tasks.find(t=>t.id==='cat-task').room,'cats');assert.equal(migrated.tasks.find(t=>t.id==='upstairs-task').room,'cats');
 assert.deepEqual(migrated.features.wins.map(w=>w.room),['cats','cats']);assert.equal(migrated.features.items[0].location,'cats');
 assert.equal(migrated.features.completionSummaries[0].room,'cats');assert.equal(migrated.features.templates[0].room,'cats');assert.equal(migrated.features.routines[0].room,'cats');
 assert.equal(migrated.features.focusSessions.length,1);assert.deepEqual(migrated.features.focusSessions[0].taskIds,['cat-task','upstairs-task']);
 assert.deepEqual(migrated.features.locationAreas.map(a=>a.roomId),['cats','cats']);assert.deepEqual(migrated.features.areas.cats,['Tray corner','Top step']);assert.equal('upstairs' in migrated.features.areas,false);
 assert.equal(migrated.features.taskDataArchives[0].room,'cats');assert.equal(migrated.features.activityDiary.annotations.one.roomId,'cats');assert.equal(migrated.features.activityDiary.annotations.one.text,'upstairs stays in historical prose');
});

test('a board containing only Upstairs Landing adopts the canonical Cat Tray room identity',()=>{
 const b=M.board();b.rooms=b.rooms.filter(r=>r.id!=='cats');b.rooms.push({id:'upstairs',name:'Upstairs Landing',capacity:14,archived:false});
 b.tasks.push(M.task({id:'landing-task',room:'upstairs',title:'Dust landing'}));
 const migrated=M.normalize(b);assert.equal(migrated.rooms.length,b.rooms.length);assert.equal(migrated.rooms.some(r=>r.id==='upstairs'),false);assert.equal(migrated.rooms.find(r=>r.id==='cats').name,'Upstairs Landing');assert.equal(migrated.tasks[0].room,'cats');
});

test('the supplied cat tray room images cover each room cleanliness state',()=>{
 for(const state of ['spotless','clean','messy','disaster'])assert.ok(fs.existsSync(path.join(__dirname,'../assets/rooms',`tidyish-catroom-${state}-open-trays.png`)));
 assert.equal(A.artForRoom('cats'),'upstairs-landing.png');assert.ok(fs.existsSync(path.join(__dirname,'../assets/activity-calendar/upstairs-landing.png')));
});

test('later household renames of the merged room survive normalization',()=>{
 const b=M.board();b.rooms.find(r=>r.id==='cats').name='Top Hall';const migrated=M.normalize(b);assert.equal(migrated.rooms.find(r=>r.id==='cats').name,'Top Hall');
});
