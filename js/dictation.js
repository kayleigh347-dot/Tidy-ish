/* Optional browser dictation. No household data or microphone audio is stored here. */
(()=>{
'use strict';
const Recognition=window.SpeechRecognition||window.webkitSpeechRecognition;
const controls=new WeakMap();
let session=null;
function eligible(el){
 return el instanceof HTMLElement&&!el.closest('[inert]')&&!el.disabled&&!el.readOnly&&(
  el.tagName==='TEXTAREA'||(el.tagName==='INPUT'&&['text','search','email','url','tel'].includes(el.type))||
  (el.isContentEditable&&!el.parentElement?.isContentEditable));
}
function value(el){return el.isContentEditable?el.textContent:el.value;}
function announce(control,message){control.status.textContent=message;}
function cleanRepeatedTranscript(value){
 const text=String(value||'').trim().replace(/\s+/g,' '),words=text.split(' ').filter(Boolean);
 for(let size=1;size<=Math.min(10,Math.floor(words.length/3));size++){
  const repeats=words.length/size;if(!Number.isInteger(repeats)||repeats<3)continue;
  const normalize=word=>word.toLocaleLowerCase().replace(/[.,!?;:]+$/g,'');
  const first=words.slice(0,size).map(normalize).join('\u0000');let repeated=true;
  for(let start=size;start<words.length;start+=size)if(words.slice(start,start+size).map(normalize).join('\u0000')!==first){repeated=false;break;}
  if(repeated)return words.slice(0,size).join(' ');
 }
 return text;
}
function finish(s,commit=true){
 if(session!==s)return;
 session=null;
 s.button.textContent='🎤 Speak';s.button.setAttribute('aria-pressed','false');s.button.setAttribute('aria-label',s.control.label);
 const el=s.target;
 if(commit&&s.words.length&&el.isConnected&&eligible(el)&&value(el)===s.original){
  let text=cleanRepeatedTranscript(s.words.join(' '));
  if(!text)return;
  if(el.isContentEditable){
   if(!s.range||!el.contains(s.range.commonAncestorContainer)){announce(s.control,'Text was not added because the field changed.');return;}
   s.range.deleteContents();const node=document.createTextNode(text);s.range.insertNode(node);s.range.setStartAfter(node);s.range.collapse(true);
  }else{
   const before=s.original.slice(0,s.start),after=s.original.slice(s.end);
   if(before&&!/\s$/.test(before)&&!/^\s|^[.,!?;:]/.test(text))text=' '+text;
   if(after&&!/^\s|^[.,!?;:]/.test(after)&&! /\s$/.test(text))text+=' ';
   let next=before+text+after;
   if(el.maxLength>=0&&next.length>el.maxLength){announce(s.control,'Spoken text is too long for this field. Try a shorter phrase.');return;}
   el.value=next;
   try{el.setSelectionRange(before.length+text.length,before.length+text.length);}catch(_){/* email has no selection API */}
  }
  // Both are needed: dialogs track input; Schedule Maker saves changes on change.
  el.dispatchEvent(new Event('input',{bubbles:true}));
  el.dispatchEvent(new Event('change',{bubbles:true}));
  announce(s.control,'Spoken text added.');
 }else if(!s.error)announce(s.control,s.words.length?'The field changed. Spoken text was not added.':'No speech heard. Try again.');
}
function stop(commit=true){const s=session;if(!s)return;finish(s,commit);try{s.recognition.abort();}catch(_){}}
function start(target,control){
 if(session){const same=session.target===target;stop();if(same)return;}
 if(!Recognition){announce(control,'Dictation is unavailable in this browser. Use your keyboard microphone, or try Chrome or Safari over HTTPS.');return;}
 if(!eligible(target)||!target.isConnected)return;
 const original=value(target);let range=null;
 if(target.isContentEditable){const selection=window.getSelection();if(selection?.rangeCount&&target.contains(selection.getRangeAt(0).commonAncestorContainer))range=selection.getRangeAt(0).cloneRange();else{range=document.createRange();range.selectNodeContents(target);range.collapse(false);}}
 const s={target,control,button:control.button,original,start:target.selectionStart??original.length,end:target.selectionEnd??original.length,range,words:[],finalResults:[],interimResults:[],recognition:new Recognition()};
 session=s;s.recognition.lang=document.documentElement.lang==='en'?'en-GB':document.documentElement.lang||'en-GB';s.recognition.continuous=true;s.recognition.interimResults=true;
 s.button.textContent='■ Stop';s.button.setAttribute('aria-pressed','true');s.button.setAttribute('aria-label','Stop dictation and add spoken text');
 announce(control,'Allow microphone access, then speak. Press Stop when finished. Your browser may process speech online.');
 s.recognition.onresult=e=>{
  if(session!==s)return;
  const results=e.results||[],from=Number.isInteger(e.resultIndex)?Math.max(0,e.resultIndex):0;
  for(let i=from;i<results.length;i++){
   const transcript=String(results[i]?.[0]?.transcript||'');
   if(results[i]?.isFinal){s.finalResults[i]=transcript;delete s.interimResults[i];}
   else{s.interimResults[i]=transcript;delete s.finalResults[i];}
  }
  s.finalResults.length=results.length;s.interimResults.length=results.length;
  s.words=s.finalResults.filter(Boolean);const interim=s.interimResults.filter(Boolean).join(' ');
  announce(control,'Listening… '+s.words.join(' ')+(interim?' '+interim:'')+' — press Stop to add text.');
 };
 s.recognition.onerror=e=>{
  if(session!==s)return;s.error=true;
  const messages={'not-allowed':'Microphone access was denied. Allow it in browser settings, or use your keyboard microphone.','service-not-allowed':'Speech recognition is unavailable. Use your keyboard microphone.','audio-capture':'No microphone is available. Check your microphone settings.','network':'Speech recognition could not connect. Check your connection and try again.','no-speech':'No speech heard. Try again.','language-not-supported':'This speech language is unavailable in your browser.'};
  announce(control,messages[e.error]||'Dictation stopped. Try again or use your keyboard microphone.');finish(s,false);
 };
 s.recognition.onend=()=>finish(s);
 try{s.recognition.start();}catch(_){s.error=true;announce(control,'Dictation could not start. Use HTTPS and allow microphone access, or use your keyboard microphone.');finish(s,false);}
}
function scan(){
 document.querySelectorAll('input,textarea,[contenteditable]').forEach(el=>{
  if(!eligible(el)||controls.has(el))return;
  const row=document.createElement('span');row.className='dictation-control';
  const button=document.createElement('button');button.type='button';button.className='dictation-button';button.textContent='🎤 Speak';button.setAttribute('aria-pressed','false');
  const label=el.getAttribute('aria-label')||el.labels?.[0]?.childNodes[0]?.textContent?.trim()||el.getAttribute('placeholder')||el.name||'this field';
  button.setAttribute('aria-label','Speak into '+label);
  const status=document.createElement('span');status.className='dictation-status';status.setAttribute('role','status');status.setAttribute('aria-live','polite');
  row.append(button,status);el.after(row);const control={button,status,label:button.getAttribute('aria-label')};controls.set(el,control);
  // Keep the field's caret, including touch selection, when pressing its button.
  button.addEventListener('pointerdown',e=>e.preventDefault());
  button.addEventListener('click',e=>{e.preventDefault();e.stopPropagation();start(el,control);});
 });
 if(session&&(!session.target.isConnected||!eligible(session.target)))stop(false);
}
document.addEventListener('focusin',e=>{if(session&&e.target!==session.target&&e.target!==session.button)stop();},true);
document.addEventListener('input',e=>{if(session&&e.target===session.target)stop(false);},true);
document.addEventListener('submit',()=>stop(),true);
document.addEventListener('click',e=>{if(session&&!e.target.closest('.dictation-control')&&e.target!==session.target)stop();},true);
document.addEventListener('keydown',e=>{if(e.key==='Escape'&&session){stop();e.preventDefault();e.stopPropagation();}},true);
document.addEventListener('visibilitychange',()=>{if(document.hidden)stop();});
window.addEventListener('pagehide',()=>stop(false));
new MutationObserver(scan).observe(document.body,{childList:true,subtree:true,attributes:true,attributeFilter:['disabled','readonly','type','contenteditable','inert']});
scan();
})();
