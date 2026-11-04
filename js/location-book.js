/* Household location records: actual places, named room areas, history and 30-day bin. */
(function(root){'use strict';
const RETENTION_DAYS=30,DAY_MS=86400000;
function nameOf(value,kind,max=60){const valueText=String(value||'').trim();if(!valueText||valueText.length>max)throw Error(`${kind} must be between 1 and ${max} characters.`);return valueText;}
function area(features,id){return features.locationAreas.find(x=>x.id===id);}
function room(rooms,id){return rooms.find(x=>x.id===id);}
function uniqueName(rows,name,exceptId=''){return rows.some(x=>x.id!==exceptId&&x.name.trim().toLowerCase()===name.toLowerCase());}
function tab(features,id){return features.locationTabs.find(x=>x.id===id);}
function addTab(features,id,name){name=nameOf(name,'Tab');if(uniqueName(features.locationTabs,name))throw Error('A tab with this name already exists.');features.locationTabs.push({id,name,order:features.locationTabs.length});}
function renameTab(features,id,name){const current=tab(features,id);if(!current)throw Error('Choose a tab.');name=nameOf(name,'Tab');if(uniqueName(features.locationTabs,name,id))throw Error('A tab with this name already exists.');current.name=name;}
function trashEntry(features,rooms,id,now=Date.now()){
 const index=features.locationEntries.findIndex(x=>x.id===id);if(index<0)throw Error('Choose an item.');
 const item=features.locationEntries[index],from=area(features,item.areaId),fromRoom=from&&room(rooms,from.roomId);
 if(!from||!fromRoom)throw Error('The item or its location is no longer available.');
 const nowMs=typeof now==='number'?now:Date.parse(now),deletedAt=new Date(nowMs).toISOString();
 features.locationTrash.push({id:item.id,item:JSON.parse(JSON.stringify(item)),deletedAt,expiresAt:new Date(nowMs+RETENTION_DAYS*DAY_MS).toISOString(),fromRoomName:fromRoom.name,fromAreaName:from.name});
 features.locationEntries.splice(index,1);return features.locationTrash.at(-1);
}
function removeTab(features,id,rooms,now=Date.now()){
 if(id==='household')throw Error('The Household tab stays available.');const current=tab(features,id);if(!current)throw Error('Choose a tab.');
 for(const item of [...features.locationEntries.filter(x=>x.tabId===id)])trashEntry(features,rooms,item.id,now);
 features.locationTabs=features.locationTabs.filter(x=>x.id!==id);
}
function addArea(features,rooms,id,roomId,name){if(!room(rooms,roomId))throw Error('Choose a room.');name=nameOf(name,'Area');const rows=features.locationAreas.filter(x=>x.roomId===roomId);if(uniqueName(rows,name))throw Error('An area with this name already exists in this room.');features.locationAreas.push({id,roomId,name,order:rows.length});}
function renameArea(features,id,name){const current=area(features,id);if(!current)throw Error('Choose an area.');name=nameOf(name,'Area');if(uniqueName(features.locationAreas.filter(x=>x.roomId===current.roomId),name,id))throw Error('An area with this name already exists in this room.');current.name=name;}
function removeArea(features,id,rooms,now=Date.now()){
 const current=area(features,id);if(!current)throw Error('Choose an area.');
 const items=features.locationEntries.filter(x=>x.areaId===id);
 for(const item of items)trashEntry(features,rooms,item.id,now);
 features.locationAreas=features.locationAreas.filter(x=>x.id!==id);return items.length;
}
function addEntry(features,rooms,id,{name,tabId,areaId}){name=nameOf(name,'Item',180);if(!tab(features,tabId))throw Error('Choose a tab.');const target=area(features,areaId);if(!target||!room(rooms,target.roomId))throw Error('Choose a named area.');features.locationEntries.push({id,name,tabId,areaId,lastMoveId:''});}
function moveEntry(features,rooms,entryId,targetAreaId,moveId,at=new Date().toISOString()){
 const entry=features.locationEntries.find(x=>x.id===entryId),from=entry&&area(features,entry.areaId),to=area(features,targetAreaId);
 if(!entry||!from||!to||!room(rooms,from.roomId)||!room(rooms,to.roomId))throw Error('The item or its location is no longer available.');
 if(from.id===to.id)return false;
 const fromRoom=room(rooms,from.roomId),toRoom=room(rooms,to.roomId);
 const move={id:moveId,entryId,fromAreaId:from.id,fromRoomName:fromRoom.name,fromAreaName:from.name,toAreaId:to.id,toRoomName:toRoom.name,toAreaName:to.name,at};
 features.locationMoves.push(move);entry.areaId=to.id;entry.lastMoveId=move.id;return true;
}
function editEntry(features,rooms,entryId,values,moveId,at){const entry=features.locationEntries.find(x=>x.id===entryId);if(!entry)throw Error('Choose an item.');const nextName=nameOf(values.name,'Item',180);if(!tab(features,values.tabId))throw Error('Choose a tab.');if(entry.areaId!==values.areaId)moveEntry(features,rooms,entryId,values.areaId,moveId,at);entry.name=nextName;entry.tabId=values.tabId;}
function restoreEntry(features,rooms,id,{tabId,areaId},moveId,at=new Date().toISOString(),now=Date.now()){
 const index=features.locationTrash.findIndex(x=>x.id===id);if(index<0)throw Error('This item is no longer in the Bin.');
 const removed=features.locationTrash[index];if(Date.parse(removed.expiresAt)<=now)throw Error('This item has expired from the Bin.');
 if(!tab(features,tabId))throw Error('Choose a tab.');const destination=area(features,areaId),toRoom=destination&&room(rooms,destination.roomId);if(!destination||!toRoom)throw Error('Choose a named area.');
 const item=JSON.parse(JSON.stringify(removed.item)),oldArea=area(features,item.areaId),oldRoom=oldArea&&room(rooms,oldArea.roomId);
 const fromAreaId=item.areaId;
 item.tabId=tabId;item.areaId=areaId;
 if(removed.fromAreaName!==destination.name||removed.fromRoomName!==toRoom.name){
  const move={id:moveId,entryId:item.id,fromAreaId,fromRoomName:removed.fromRoomName,fromAreaName:removed.fromAreaName,toAreaId:destination.id,toRoomName:toRoom.name,toAreaName:destination.name,at};
  item.lastMoveId=move.id;features.locationMoves.push(move);
 }else if(oldArea&&oldRoom&&oldArea.id===destination.id){item.lastMoveId=removed.item.lastMoveId||'';}
 features.locationEntries.push(item);features.locationTrash.splice(index,1);return item;
}
function expireTrash(features,now=Date.now()){
 const expired=new Set(features.locationTrash.filter(x=>Date.parse(x.expiresAt)<=now).map(x=>x.id));
 if(!expired.size)return 0;
 features.locationTrash=features.locationTrash.filter(x=>!expired.has(x.id));features.locationMoves=features.locationMoves.filter(x=>!expired.has(x.entryId));return expired.size;
}
function previous(features,entry){return features.locationMoves.find(x=>x.id===entry?.lastMoveId)||null;}
function history(features,entryId){return features.locationMoves.filter(x=>x.entryId===entryId).sort((a,b)=>Date.parse(a.at)-Date.parse(b.at));}
const api={RETENTION_DAYS,nameOf,addTab,renameTab,removeTab,addArea,renameArea,removeArea,addEntry,moveEntry,editEntry,trashEntry,restoreEntry,expireTrash,previous,history};
root.TidyLocationBook=api;if(typeof module!=='undefined'&&module.exports)module.exports=api;
})(typeof window==='undefined'?globalThis:this);
