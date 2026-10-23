/* Pure read-only projection of Task Data's features.wins. No storage or model writes. */
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.TidyActivityData=api;})(typeof globalThis==='object'?globalThis:this,function(){
  'use strict';
  const TIME_ZONE='Europe/London';
  const RINGS=Object.freeze({decorated:3,gold:5});
  const ROOMS=Object.freeze({entrance:'Entrance',hall:'Hallway',penny:'Penny’s Bedroom',master:'Master Bedroom',bathroom:'Bathroom',kitchen:'Kitchen',living:'Living Room',cats:'Cat Tray Area',print:'3D Printer Room',storage:'Storage Room',upstairs:'Upstairs Landing',laundry:'Laundry',general:'Other rooms'});
  const ROOM_ORDER=Object.freeze(Object.keys(ROOMS));
  const ART=Object.freeze({...Object.fromEntries(['entrance','hall','penny','master','bathroom','kitchen','living','cats','print','storage'].map(id=>[id,id+'.webp'])),upstairs:'cats.webp'});
  const OCCASIONS=Object.freeze({rest:{symbol:'🌙',description:'Rest / recovery day'},outing:{symbol:'🚗',description:'Day out'},holiday:{symbol:'🏖️',description:'Holiday / away'},occasion:{symbol:'🎉',description:'Special occasion'},birthday:{symbol:'🎂',description:'Birthday'},christmas:{symbol:'🎄',description:'Christmas'},custom:{symbol:'✦',description:'Personal day'}});
  const formatter=new Intl.DateTimeFormat('en-GB',{timeZone:TIME_ZONE,year:'numeric',month:'2-digit',day:'2-digit'});
  function validDay(value){if(typeof value!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(value))return false;const d=new Date(value+'T12:00:00Z');return Number.isFinite(+d)&&d.toISOString().slice(0,10)===value;}
  function dateOf(value){
    if(validDay(value))return value;
    // Zoned ISO instants only. Reject rollover dates and ambiguous local timestamps.
    if(typeof value!=='string'||!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2})$/.test(value)||!validDay(value.slice(0,10)))return null;
    const [h,m,s]=value.slice(11,19).split(':').map(Number);if(h>23||m>59||s>59)return null;
    const date=new Date(value);if(!Number.isFinite(+date))return null;
    const p=Object.fromEntries(formatter.formatToParts(date).map(x=>[x.type,x.value]));return `${p.year}-${p.month}-${p.day}`;
  }
  function today(){return dateOf(new Date().toISOString());}
  function plus(day,n){if(!validDay(day))throw Error('Invalid date');const d=new Date(day+'T12:00:00Z');d.setUTCDate(d.getUTCDate()+n);return d.toISOString().slice(0,10);}
  function validMonth(month){return typeof month==='string'&&/^\d{4}-\d{2}$/.test(month)&&validDay(month+'-01');}
  function monthDates(month){if(!validMonth(month))throw Error('Invalid month');const days=[];for(let d=month+'-01';d.startsWith(month);d=plus(d,1))days.push(d);return days;}
  function monthOffset(month){return (new Date(month+'-01T12:00:00Z').getUTCDay()+6)%7;}
  function shiftMonth(month,n){if(!validMonth(month))throw Error('Invalid month');const d=new Date(month+'-01T12:00:00Z');d.setUTCMonth(d.getUTCMonth()+n);return d.toISOString().slice(0,7);}
  function ringFor(n,thresholds=RINGS){return n>=thresholds.gold?'gold':n>=thresholds.decorated?'decorated':n>0?'normal':'none';}
  function roomCompare(a,b){const ai=ROOM_ORDER.indexOf(a),bi=ROOM_ORDER.indexOf(b);return (ai<0?999:ai)-(bi<0?999:bi)||(a<b?-1:a>b?1:0);}
  function artForRoom(id){return Object.hasOwn(ART,id)?ART[id]:null;}
  function roomName(id){return Object.hasOwn(ROOMS,id)?ROOMS[id]:'Other room';}
  function firstSymbol(value){const text=String(value).trim();return typeof Intl.Segmenter==='function'?[...new Intl.Segmenter('en',{granularity:'grapheme'}).segment(text)][0]?.segment||'✦':Array.from(text)[0]||'✦';}
  function annotation(value){if(!value||typeof value!=='object'||!Object.hasOwn(OCCASIONS,value.type))return null;const base=OCCASIONS[value.type];return {type:value.type,symbol:value.type==='custom'?firstSymbol(String(value.symbol||base.symbol).slice(0,24)):base.symbol,description:String(value.description||base.description).trim().slice(0,80)};}
  function analyze(board,opts={}){
    const now=opts.today||today();if(!validDay(now))throw Error('Invalid reference day');
    const roomNames=Object.create(null);for(const room of board?.rooms||[])if(typeof room.id==='string'&&typeof room.name==='string')roomNames[room.id]=room.name.slice(0,100);
    const days=Object.create(null),annotations=Object.create(null),holidays=Object.create(null),seen=new Set();
    let duplicates=0,undated=0,missingIds=0,future=0;
    // Recorded wins are authoritative; current task structure cannot invalidate history.
    for(const w of board?.features?.wins||[]){
      if(!w||typeof w.id!=='string'||!w.id.trim()){missingIds++;continue;}
      // Only a valid, eligible completion may claim an ID. An old malformed
      // copy must not hide a later valid record carrying the same ID.
      const key=dateOf(w.at);if(!key){undated++;continue;}if(key>now){future++;continue;}
      if(seen.has(w.id)){duplicates++;continue;}seen.add(w.id);
      const day=days[key]||(days[key]={count:0,points:0,laundry:0,rooms:Object.create(null),wins:[]});
      const room=typeof w.room==='string'&&w.room?w.room:'general';
      day.count++;day.rooms[room]=(day.rooms[room]||0)+1;if(room==='laundry')day.laundry++;
      const points=Number(w.points);if(Number.isFinite(points)&&points>0)day.points+=points;
      day.wins.push({id:w.id,title:String(w.title||'Completed task'),room,points:Number.isFinite(points)&&points>0?points:0});
    }
    for(const d of Object.values(days))d.winner=Object.keys(d.rooms).sort((a,b)=>d.rooms[b]-d.rooms[a]||roomCompare(a,b))[0];
    for(const [key,v]of Object.entries(opts.annotations||{})){const a=annotation(v);if(validDay(key)&&a)annotations[key]=a;}
    for(const [key,v]of Object.entries(opts.holidays||{}))if(validDay(key)&&typeof v?.symbol==='string'&&v.symbol.trim())holidays[key]={type:'configured',symbol:firstSymbol(v.symbol.slice(0,24)),description:String(v.description||'Occasion').slice(0,80)};
    return {days,roomNames,annotations,holidays,today:now,earned:[...new Set((opts.earned||[]).filter(validMonth))],duplicates,undated,missingIds,future};
  }
  function dayInfo(a,date){if(!validDay(date))throw Error('Invalid date');const d=a.days[date]||{count:0,points:0,laundry:0,rooms:{},wins:[],winner:null};const occasion=a.annotations[date]||a.holidays[date]||(date.endsWith('-12-25')?{type:'christmas',...OCCASIONS.christmas}:null);return {...d,date,occasion,marked:d.count>0||!!occasion};}
  function markedDates(a){const dates=new Set([...Object.keys(a.days),...Object.keys(a.annotations),...Object.keys(a.holidays)]);const first=Math.min(Number(a.today.slice(0,4)),...Array.from(dates,d=>Number(d.slice(0,4))));for(let y=first;y<=Number(a.today.slice(0,4));y++)dates.add(`${String(y).padStart(4,'0')}-12-25`);return [...dates].filter(d=>d<=a.today&&dayInfo(a,d).marked).sort();}
  function streak(a){const dates=markedDates(a);if(!dates.length)return {count:0,start:null,end:null,current:false};const set=new Set(dates),end=dates.at(-1);let start=end,count=1;while(set.has(plus(start,-1))){start=plus(start,-1);count++;}return {count,start,end,current:end===a.today||end===plus(a.today,-1)};}
  function monthInfo(a,month){const dates=monthDates(month),covered=dates.filter(d=>d<=a.today&&dayInfo(a,d).marked).length;const complete=covered===dates.length,past=month<a.today.slice(0,7);return {month,total:dates.length,covered,complete,star:a.earned.includes(month)||(complete&&past),retained:a.earned.includes(month)&&!complete,points:dates.reduce((n,d)=>n+(a.days[d]?.points||0),0),tasks:dates.reduce((n,d)=>n+(a.days[d]?.count||0),0)};}
  function earnedMonths(a,existing=a.earned){const months=new Set([...existing,...Object.keys(a.days).map(d=>d.slice(0,7)),...Object.keys(a.annotations).map(d=>d.slice(0,7)),...Object.keys(a.holidays).map(d=>d.slice(0,7))]);return [...months].filter(m=>validMonth(m)&&(existing.includes(m)||monthInfo(a,m).star)).sort();}
  return Object.freeze({TIME_ZONE,RINGS,ROOMS,ROOM_ORDER,OCCASIONS,validDay,dateOf,today,plus,monthDates,monthOffset,shiftMonth,ringFor,artForRoom,roomName,annotation,analyze,dayInfo,streak,monthInfo,earnedMonths});
});
