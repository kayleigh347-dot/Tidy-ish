/* User-armed local playback for in-browser task and Focus timer alarms. */
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;if(root)root.TidyTimerAlarmAudio=api;})(typeof globalThis!=='undefined'?globalThis:this,function(){
 'use strict';
 const TONES=Object.freeze([
  Object.freeze({id:'upbeat-rise',label:'Upbeat rise',file:'upbeat-rise.wav'}),
  Object.freeze({id:'bright-steps',label:'Bright steps',file:'bright-steps.wav'}),
  Object.freeze({id:'soft-double-tap',label:'Soft double tap',file:'soft-double-tap.wav'})
 ]);
 function storedVolume(raw,fallback=.12){if(raw===null||raw===undefined||String(raw).trim()==='')return fallback;const n=Number(raw);return Number.isFinite(n)&&n>=0&&n<=.3?n:fallback;}
 function create({AudioCtor=globalThis.Audio,AudioContextCtor=globalThis.AudioContext||globalThis.webkitAudioContext,fetchFn=globalThis.fetch?.bind(globalThis),urlForTone=file=>'sounds/'+file,onError=()=>{}}={}){
  let selected=TONES[0],volume=.12,context=null,current=null;
  const buffers=new Map(),loading=new Map(),activeAudio=new Set();
  const queue=[];
  const report=error=>{try{onError(error);}catch{}};
  function contextForPlayback(){
   if(!AudioContextCtor)return null;
   try{return context||(context=new AudioContextCtor());}catch{return null;}
  }
  function setTone(id){const next=TONES.find(item=>item.id===id);if(!next)return false;selected=next;return true;}
  function setVolume(value){const n=Number(value);volume=Number.isFinite(n)?Math.max(0,Math.min(1,n)):.12;}
  async function prime(){
   const tone=selected,ctx=contextForPlayback();
   if(!ctx||!fetchFn)return false;
   if(buffers.has(tone.id))return true;
   if(loading.has(tone.id))return loading.get(tone.id);
   const work=(async()=>{
    try{
     if(ctx.state==='suspended')await ctx.resume();
     if(ctx.state&&ctx.state!=='running')return false;
     const response=await fetchFn(urlForTone(tone.file));
     if(response?.ok===false)throw Error('Timer sound file could not be loaded.');
     buffers.set(tone.id,await ctx.decodeAudioData(await response.arrayBuffer()));
     return true;
    }catch{return false;}
   })();
   loading.set(tone.id,work);
   try{return await work;}finally{loading.delete(tone.id);}
  }
  function complete(handle){if(current!==handle)return;current=null;if(queue.length)start(queue.shift());}
  function finish(handle){
   if(current!==handle||handle.afterPending)return;
   if(!handle.afterStarted&&typeof handle.request?.after==='function'){
    handle.afterStarted=true;let result;
    try{result=handle.request.after();}catch(error){report(error);}
    if(result&&typeof result.then==='function'){
     handle.afterPending=true;
     Promise.resolve(result).catch(report).finally(()=>{if(current!==handle)return;handle.afterPending=false;complete(handle);});
     return;
    }
   }
   complete(handle);
  }
  function start(request){
   if(typeof request.isValid==='function'){
    let valid=false;try{valid=!!request.isValid();}catch{}
    if(!valid){try{request.onCancel?.();}catch{}if(queue.length)start(queue.shift());return false;}
   }
   const ctx=context,buff=ctx&&buffers.get(request.tone.id);
   if(ctx&&buff&&(!ctx.state||ctx.state==='running')){
    try{
     const source=ctx.createBufferSource(),gain=ctx.createGain(),handle={source,key:request.key,request};
     source.buffer=buff;gain.gain.value=request.volume;source.connect(gain);gain.connect(ctx.destination);source.onended=()=>finish(handle);current=handle;source.start(0);return true;
    }catch(error){report(error);current=null;}
   }
   if(!AudioCtor){report(Error('Audio playback is not supported in this browser.'));if(queue.length)start(queue.shift());return false;}
   let audio,reported=false;
   const handle={audio,key:request.key,request},fail=error=>{if(reported)return;reported=true;activeAudio.delete(audio);report(error||Error('Timer sound could not play.'));finish(handle);};
   try{
    audio=new AudioCtor(urlForTone(request.tone.file));handle.audio=audio;current=handle;activeAudio.add(audio);audio.preload='auto';audio.volume=request.volume;
    audio.addEventListener?.('ended',()=>{activeAudio.delete(audio);finish(handle);},{once:true});
    audio.addEventListener?.('error',()=>fail(Error('Timer sound file could not be played.')),{once:true});
    const result=audio.play();if(result&&typeof result.catch==='function')result.catch(fail);
    return true;
   }catch(error){fail(error);return current===handle;}
  }
  function play(options={}){
   const {preview=false,key=''}=options;
   if(key&&(current?.key===key||queue.some(request=>request.key===key)))return false;
   const request={...options,tone:selected,volume,key};
   if(current){if(preview)return false;queue.push(request);return true;}
   return start(request);
  }
  function cancel(key){
   let cancelled=false;
   for(let i=queue.length-1;i>=0;i--)if(queue[i].key===key){const [request]=queue.splice(i,1);try{request.onCancel?.();}catch{}cancelled=true;}
   if(current?.key===key){const handle=current;current=null;try{handle.request?.onCancel?.();}catch{}if(handle.source){try{handle.source.stop();}catch{}}if(handle.audio){try{handle.audio.pause();handle.audio.currentTime=0;}catch{}activeAudio.delete(handle.audio);}if(queue.length)start(queue.shift());cancelled=true;}
   return cancelled;
  }
  function stop(){for(const request of queue.splice(0))try{request.onCancel?.();}catch{}if(current){const handle=current;current=null;try{handle.request?.onCancel?.();}catch{}if(handle.source){try{handle.source.stop();}catch{}}if(handle.audio){try{handle.audio.pause();}catch{}activeAudio.delete(handle.audio);}}}
 return Object.freeze({tones:TONES,storedVolume,tone:()=>selected,setTone,setVolume,volume:()=>volume,prime,play,cancel,stop,busy:()=>!!current,queued:()=>queue.length});
 }
 return Object.freeze({TONES,storedVolume,create});
});
