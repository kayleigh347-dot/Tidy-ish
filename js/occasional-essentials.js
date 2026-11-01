/* Occasional Essentials: opt-in infrequent household maintenance catalogue.
   Research sources: UK fire services, Electrical Safety First, Electrolux UK,
   Energy Saving Trust, HSE and Aviva; read the appliance manual for exact intervals.
   Nothing is inserted into a saved household without a deliberate selection. */
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;if(root)root.TidyEssentials=api;})(typeof globalThis!=='undefined'?globalThis:this,function(){'use strict';
const ITEMS=[
 // category, slug, title, suggested months, room, minutes, guidance, optional UK seasonal month
 ['Tumble dryer','dryer-deep','Deep-clean dryer drum, door seal & moisture sensor',4,'',15,'Your requested four-month deep clean. Switch off, unplug and cool first; wipe with a damp microfibre cloth. Check the appliance manual.'],
 ['Tumble dryer','dryer-surround','Remove lint from around and behind the tumble dryer',1,'',10,'Fire-safety check: clear accessible fluff and keep vents unobstructed. Do this sooner whenever lint accumulates.'],
 ['Tumble dryer','dryer-heat','Check and clean accessible dryer condenser / heat exchanger',1,'',15,'Only if fitted and accessible. Follow the exact manufacturer instructions; some models need this more often. Never dismantle sealed parts.'],
 ['Tumble dryer','dryer-vent','Inspect accessible external dryer vent or duct for lint',2,'',10,'For a vented dryer only. Keep outlet clear; follow manufacturer guidance. Seek help for inaccessible ducting.'],
 ['Laundry appliances','washer-drawer','Clean washing-machine detergent drawer & door seal',2,'',15,'Wipe residues and check the door-seal folds for trapped debris; follow machine instructions.'],
 ['Laundry appliances','washer-filter','Check and clean washing-machine pump/drain filter',2,'',20,'Only if the model has a user-cleanable filter. Isolate power and prepare for water, following the manual.'],
 ['Laundry appliances','washer-clean','Run washing-machine maintenance/cleaning cycle',2,'',10,'Use the machine’s maintenance programme and product recommended in the manual.'],
 ['Laundry appliances','vacuum-filter','Wash or replace vacuum cleaner filters',3,'living',10,'Only wash filters the manufacturer identifies as washable; dry completely before reuse.'],
 ['Kitchen appliances','dish-filter','Clean dishwasher filter & inspect spray arms',1,'kitchen',15,'The filter may need cleaning more often, depending on use. Follow the manual.'],
 ['Kitchen appliances','dish-descale','Descale dishwasher, if needed',3,'kitchen',10,'Follow the manual and water-hardness guidance. Check dishwasher salt if your machine uses it.'],
 ['Kitchen appliances','hood-filter','Degrease cooker-hood grease filter',1,'kitchen',20,'Grease build-up is a fire risk; frequent cooking may require more often. Follow the filter instructions.'],
 ['Kitchen appliances','fridge-coils','Clear fridge ventilation grille / accessible condenser dust',4,'kitchen',15,'Only clean accessible areas after switching off, without disassembling the fridge.'],
 ['Kitchen appliances','fridge-seals','Clean fridge door seals and drainage channel',4,'kitchen',15,'Wipe seals with a microfibre cloth; check the fridge manual for accessible drainage.'],
 ['Kitchen appliances','kettle-descale','Descale kettle',2,'kitchen',15,'Hard-water areas may need this more frequently. Rinse thoroughly after a food-safe descaling method.'],
 ['Bathroom & plumbing','shower-head','Descale shower head',3,'bathroom',15,'Follow fixture instructions. In hard-water areas you may need this more often.'],
 ['Bathroom & plumbing','shower-drain','Remove hair and debris from accessible shower/bath trap',1,'bathroom',15,'Often needed sooner. Avoid dismantling inaccessible plumbing; use gloves or appropriate tools.'],
 ['Bathroom & plumbing','bath-seals','Check bath/shower sealant & under-sink areas for leaks',4,'bathroom',10,'Visual check only: deal promptly with leaks, loose sealant or damp.'],
 ['Bathroom & plumbing','bath-fan','Clean accessible bathroom extractor grille',3,'bathroom',15,'Switch off. Clean only accessible parts and follow the fan instructions.'],
 ['Bathroom & plumbing','tap-limescale','Remove limescale from taps & accessible aerators',4,'bathroom',20,'Use a cleaner suited to the finish; water hardness changes the interval.'],
 ['Safety & upkeep','smoke-alarms','Test smoke and carbon monoxide alarms',1,'',5,'Safety-critical: at least monthly, not every four months. Press test buttons and follow alarm instructions.'],
 ['Safety & upkeep','check-leads','Visually inspect plugs, cables & extensions for damage',3,'',10,'Do not use damaged or overheating equipment. Do not open electrics or attempt repairs.'],
 ['Safety & upkeep','boiler-service','Arrange annual boiler service (qualified engineer)',12,'',10,'Gas appliances need a Gas Safe registered engineer. This is an appointment reminder, not a DIY cleaning job.'],
 ['Safety & upkeep','door-weather','Inspect door and window seals, draughts and damp',6,'',15,'Check accessible frames, sills and sealant for water ingress or deterioration.'],
 ['Seasonal home care','radiators','Check radiator operation and arrange bleeding if needed',12,'',15,'Suggested early autumn check; avoid hot water and follow heating manual.',9],
 ['Seasonal home care','gutters-autumn','Arrange autumn gutter/downpipe clearing',12,'',10,'If responsible for outdoor maintenance. Avoid working at height; use a professional if needed.',10],
 ['Seasonal home care','gutters-spring','Arrange spring gutter/downpipe check',12,'',10,'If responsible for outdoor maintenance. Avoid working at height; use a professional if needed.',4],
 ['Seasonal home care','outdoor-pipes','Protect outdoor taps/pipes against freezing',12,'',10,'Only if relevant; check before UK winter and arrange appropriate insulation.',11],
 ['Seasonal home care','chimney','Arrange chimney sweep (if you use a fireplace)',12,'',10,'Professional sweep recommended before the main heating season.',9],
 ['Seasonal home care','windows-track','Clean window tracks and drainage channels',4,'',20,'Clear visible debris and check free drainage without removing fittings.'],
 ['Seasonal home care','under-furniture','Check behind large furniture for damp or mould',6,'',20,'Look for moisture and address underlying cause. Avoid heavy lifting alone.']
];
const entries=Object.freeze(ITEMS.map(r=>Object.freeze({category:r[0],id:r[1],title:r[2],months:r[3],room:r[4],minutes:r[5],note:r[6],seasonMonth:r[7]||0})));
const key=id=>'tidy-essential:'+id;
function seasonNext(month,now){const year=now.getFullYear()+((now.getMonth()+1>month||now.getMonth()+1===month&&now.getDate()>15)?1:0);return year+'-'+String(month).padStart(2,'0')+'-15';}
const matches=(task,item)=>task.occasionSourceId===key(item.id)||task.id===key(item.id);
function eligible(board,item){return !board.tasks.some(t=>matches(t,item)||t.occasionKind==='occasional'&&String(t.title||'').trim().toLowerCase()===item.title.toLowerCase());}
function addSelected(board,Model,chosen,now=new Date()){
 if(!Array.isArray(chosen))throw Error('Choose which essentials to add.');
 const unique=new Set(),entriesToAdd=[];
 for(const option of chosen){const item=entries.find(x=>x.id===option.id);if(!item)throw Error('Unknown essential job.');
  if(unique.has(item.id))throw Error('This job is selected twice.');unique.add(item.id);
  if(!eligible(board,item))continue;
  const months=Number(option.months??item.months),room=String(option.room??item.room),roomAllowed=room===''||board.rooms.some(r=>r.id===room&&!r.archived);
  if(!Number.isInteger(months)||months<1||months>120||!roomAllowed)throw Error('Invalid interval or room for '+item.title);
  const base=String(now.getFullYear())+'-'+String(now.getMonth()+1).padStart(2,'0')+'-'+String(now.getDate()).padStart(2,'0');
  // Add on a future date (never pre-mark a task as overdue); spread jobs within their first interval.
  const index=entries.indexOf(item),spread=Math.max(1,Math.floor((index*23+17)%(Math.max(29,months*28))));
  const seasonal=item.seasonMonth&&months===12;
  const next=seasonal?seasonNext(item.seasonMonth,now):Model.plus(base,spread);
  entriesToAdd.push(Model.task({id:key(item.id),title:item.title,room,occasionKind:'occasional',calendarEnabled:true,occasionSourceId:key(item.id),nextDue:next,seasonMonth:seasonal?item.seasonMonth:0,repeatMonths:months,estimate:item.minutes,priority:3,taskType:'maintenance',messImpact:'small',notes:item.note,createdAt:now.toISOString()}));
 }
 entriesToAdd.forEach(t=>Model.add(board,t));return {added:entriesToAdd.length,skipped:chosen.length-entriesToAdd.length};
}
return Object.freeze({entries,key,eligible,addSelected});
});
