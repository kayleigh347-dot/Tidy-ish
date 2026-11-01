/* Optional, member-local tool preferences for the selected Focus Quests. */
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;if(root)root.TidyFocusTools=api;})(typeof globalThis!=='undefined'?globalThis:this,function(){'use strict';
const PREFIX='tidyish-html-focus-tools-v1:';
function normalize(value){return String(value||'').trim().toLocaleLowerCase('en-GB').replace(/\s+/g,' ');}
function split(value){return String(value||'').split(/[\n,]/).map(x=>x.trim()).filter(Boolean).slice(0,80);}
function key(owner){return PREFIX+encodeURIComponent(String(owner||'local'));}
function clean(input){if(!input||typeof input!=='object'||Array.isArray(input))return {};const out={};for(const [name,value]of Object.entries(input)){const id=normalize(name),replacement=String(value||'').trim().slice(0,100);if(id&&!['__proto__','constructor','prototype'].includes(id)&&replacement)out[id]=replacement;}return out;}
function read(storage,owner){try{return clean(JSON.parse(storage.getItem(key(owner))||'{}'));}catch{return {};}}
function write(storage,owner,preferences){const safe=clean(preferences);storage.setItem(key(owner),JSON.stringify(safe));return safe;}
function sources(selected){const byDefault=new Map();for(const task of selected||[]){for(const item of [task,...(task.children||[]).filter(child=>!child.done)])for(const name of split(item.tools)){const id=normalize(name);if(!id)continue;if(!byDefault.has(id))byDefault.set(id,{key:id,name,quests:new Set()});byDefault.get(id).quests.add(task.title||'Quest');}}return [...byDefault.values()].map(row=>({...row,quests:[...row.quests]}));}
function groups(selected,preferences={}){const prefs=clean(preferences),result=new Map();for(const source of sources(selected)){const name=prefs[source.key]||source.name,id=normalize(name);if(!result.has(id))result.set(id,{name,quests:new Set(),sourceNames:[]});const group=result.get(id);source.quests.forEach(title=>group.quests.add(title));group.sourceNames.push(source.name);}return [...result.values()].map(row=>({...row,quests:[...row.quests],sourceNames:[...new Set(row.sourceNames)]}));}
function update(preferences,rows,getValue){const next={...clean(preferences)};rows.forEach((row,index)=>{const value=String(getValue(index)||'').trim().slice(0,100);if(value&&normalize(value)!==row.key)next[row.key]=value;else delete next[row.key];});return clean(next);}
return Object.freeze({key,normalize,split,clean,read,write,sources,groups,update});
});
