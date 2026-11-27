/* Read-only theme resolution and device-local display preferences. No task,
 * occasion, household or backup mutations. Only implemented themes compete. */
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.TidySeasonalTheme=api;})(typeof globalThis!=='undefined'?globalThis:this,function(){'use strict';
const manifest=Object.freeze({
 christmas:Object.freeze({accent:'#e6c16d',edge:'snow-edge.webp',character:'gonk.webp',tree:'tree.webp',homeOrnaments:'home-ornaments.svg',particles:Object.freeze(['snowflake-01.webp','snowflake-02.webp','snowflake-03.webp','snowflake-04.webp'])}),
 newyear:Object.freeze({accent:'#e5d9ab',edge:null,character:null,sparkles:Object.freeze(['gold-sparkle.webp','silver-sparkle.webp']),particles:Object.freeze([])})
});
const key=boardKey=>boardKey+'-seasonal-display-v1';
function preferences(storage,boardKey){try{const v=JSON.parse(storage.getItem(key(boardKey))||'{}');return {decorations:v?.decorations!==false,animation:v?.animation!==false};}catch{return {decorations:true,animation:true};}}
function savePreference(storage,boardKey,name,checked){if(!['decorations','animation'].includes(name)||typeof checked!=='boolean')throw Error('Invalid Seasonal display preference.');const p={...preferences(storage,boardKey),[name]:checked};storage.setItem(key(boardKey),JSON.stringify(p));return p;}
function resolve(board,today,prefs={}){
 if(prefs.decorations===false)return null;
 const f=board?.features,plans=f?.occasionPlans;if(!plans)return null;
 const candidates=(f.occasionOccurrences||[]).flatMap(o=>{const t=plans.templates?.find(x=>x.id===o.templateId)?.plan,w=plans.occurrences?.find(x=>x.id===o.id)?.plan;if(!w||w.closed||today<o.preparationStartDate||today>o.endDate)return [];return [{id:o.id,preset:t?.preset,enabled:w.settings?.decorationsEnabled!==false,eventDate:o.eventDate}];}).sort((a,b)=>a.eventDate.localeCompare(b.eventDate)||a.id.localeCompare(b.id));
 const christmas=candidates.filter(c=>c.preset==='christmas'&&c.enabled),newyears=candidates.filter(c=>c.preset==='newyear');
 const first=christmas.find(c=>today<=c.eventDate.slice(0,4)+'-12-30');
 if(first)return {key:'christmas',id:first.id};
 // New Year takes over from 31 December through 2 January, even if there
 // is no separate New Year plan. A saved, disabled New Year takes precedence
 // over that fallback. No occasion or task is created by this visual rule.
 const md=today.slice(5);if(!['12-31','01-01','01-02'].includes(md))return null;
 const ny=newyears.find(c=>c.enabled);if(ny)return {key:'newyear',id:ny.id};
 if(newyears.length)return null;
 const transition=christmas.find(c=>today>=c.eventDate.slice(0,4)+'-12-31'&&today<=String(Number(c.eventDate.slice(0,4))+1)+'-01-02');
 return transition?{key:'newyear',id:transition.id}:null;
}
function particles(theme,animation,home){if(theme?.key!=='christmas'||!animation)return '';return Array.from({length:home?12:6},(_,i)=>`<i class="seasonal-snow-particle" style="--snow-size:${8+i%3*2}px;--snow-delay:${-i*2.1}s;--snow-duration:${12+i%4*3}s;background-image:url(assets/seasonal/christmas/${manifest.christmas.particles[i%4]})"></i>`).join('');}
return Object.freeze({manifest,preferences,savePreference,resolve,particles});
});
