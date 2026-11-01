/* Step 10: separate care events and little-often counters using the existing shared wins. */
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;if(root)root.TidyCare=api;})(typeof globalThis!=='undefined'?globalThis:this,function(){'use strict';
const RULES=Object.freeze([
 {id:'cat',title:'Cat Tray',group:'cat',warning:'',type:'daily'},
 {id:'fish-topup',title:'Top up fish tank water',group:'aquatic',warning:'Aquatic life needs water.',type:'weekly'},
 {id:'fish-outside',title:'Clean fish tank glass (outside)',group:'aquatic',warning:'',type:'every-two'},
 {id:'fish-inside',title:'Clean fish tank glass (inside)',group:'aquatic',warning:'',type:'monthly'},
 {id:'isopods',title:'Feed and water isopods',group:'aquatic',warning:'The isopods are hungry.',type:'monthly'},
 {id:'plants',title:'Water plants',group:'aquatic',warning:'',type:'plants'}
]);
const rule=id=>RULES.find(x=>x.id===id);
const CARE_ID=id=>'tidy-care:'+id;
const colour={green:'Not due',blue:'Due now',orange:'Overdue',red:'Seriously overdue',flashing:'Highest urgency'};
const midnight=d=>Date.UTC(d.getFullYear(),d.getMonth(),d.getDate());
function addMonths(date,months){const d=new Date(date.getFullYear(),date.getMonth(),1),last=new Date(d.getFullYear(),d.getMonth()+months+1,0).getDate();return new Date(d.getFullYear(),d.getMonth()+months,Math.min(date.getDate(),last));}
function wins(board,id){return (board?.features?.wins||[]).filter(w=>w.taskId===CARE_ID(id)).reverse().sort((a,b)=>Date.parse(b.at)-Date.parse(a.at));}
function status(board,id,now=new Date()){
 const r=rule(id);if(!r)throw Error('Unknown care task');const last=wins(board,id)[0];
 if(!last)return {state:'blue',label:'Not yet recorded',days:null,last:null,warning:r.warning};
 const d=new Date(last.at),days=Math.max(0,Math.floor((midnight(now)-midnight(d))/86400000));
 let state='green',escalation=0;
 if(r.type==='daily')state=days>=4?'flashing':days>=3?'red':days>=2?'orange':days>=1?'blue':'green';
 else if(r.type==='plants')state=days>=11?'flashing':days>=9?'red':days>=7?'orange':days>=6?'blue':'green';
 else if(r.type==='weekly'){
  if(days>=10){state='flashing';escalation=3;}else if(days>=9){state='red';escalation=2;}else if(days>=8){state='orange';escalation=1;}else if(days>=7)state='blue';
 }
 else if(r.type==='every-two'){
  if(days>=13){state='flashing';escalation=3+Math.floor((days-13)/2);}else if(days>=11){state='red';escalation=2;}else if(days>=9){state='orange';escalation=1;}else if(days>=7)state='blue';
 }
 else {const due=addMonths(d,1),lag=Math.floor((midnight(now)-midnight(due))/86400000);if(r.id==='isopods'){if(lag>=21){state='flashing';escalation=3+Math.floor((lag-21)/7);}else if(lag>=14){state='red';escalation=2;}else if(lag>=7){state='orange';escalation=1;}else if(lag>=0)state='blue';}else if(lag>=21){state='flashing';escalation=3+Math.floor((lag-21)/7);}else if(lag>=14){state='red';escalation=2;}else if(lag>=7){state='orange';escalation=1;}else if(lag>=0)state='blue';}
 const label=escalation?`${colour[state]} · stage ${escalation}`:colour[state];
 return {state,label,days,last:last.at,warning:r.warning,escalation};
}
function complete(board,id,makeId,now=new Date()){
 const r=rule(id);if(!r||!Array.isArray(board?.features?.wins))throw Error('Care record unavailable.');const record={id:makeId(),taskId:CARE_ID(id),rootId:'',title:r.title,room:id==='cat'?'cats':'',at:now.toISOString(),minutes:0,measured:false,points:1,person:board.features.displayName||'Me',_kind:'care'};
 board.features.wins.push(record);return record;
}
function undo(board,id){const last=wins(board,id)[0];if(!last)return false;board.features.wins=board.features.wins.filter(w=>w.id!==last.id);return true;}
function littleOften(board,id,makeId,now=new Date()){
 const t=board.tasks.find(t=>t.id===id&&t.littleOften&&!t.side);if(!t)throw Error('Quick task not found.');
 board.features.wins.push({id:makeId(),taskId:t.id,rootId:t.id,title:t.title,room:t.room||'',at:now.toISOString(),minutes:0,measured:false,points:1,person:board.features.displayName||'Me',_kind:'little-often'});
}
function littleUndo(board,id){const last=(board.features.wins||[]).filter(w=>w.taskId===id).reverse().sort((a,b)=>Date.parse(b.at)-Date.parse(a.at))[0];if(!last)return false;board.features.wins=board.features.wins.filter(w=>w.id!==last.id);return true;}
return Object.freeze({RULES,rule,wins,status,complete,undo,littleOften,littleUndo,colour,addMonths});
});
