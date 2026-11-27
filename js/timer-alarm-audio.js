/* User-armed local playback for in-browser task and Focus timer alarms. */
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;if(root)root.TidyTimerAlarmAudio=api;})(typeof globalThis!=='undefined'?globalThis:this,function(){
 'use strict';
 const TONES=Object.freeze([
  Object.freeze({id:'upbeat-rise',label:'Upbeat rise',file:'upbeat-rise.wav'}),
  Object.freeze({id:'bright-steps',label:'Bright steps',file:'bright-steps.wav'}),
  Object.freeze({id:'soft-double-tap',label:'Soft double tap',file:'soft-double-tap.wav'})
 ]);
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
  function finish(handle){
   if(current!==handle)return;
   current=null;
   if(queue.length)start(queue.shift());
  }
  function start(request){
   const ctx=context,buff=ctx&&buffers.get(request.tone.id);
   if(ctx&&buff&&(!ctx.state||ctx.state==='running')){
    try{
     const source=ctx.createBufferSource(),gain=ctx.createGain(),handle={source,key:request.key};
     source.buffer=buff;gain.gain.value=request.volume;source.connect(gain);gain.connect(ctx.destination);source.onended=()=>finish(handle);current=handle;source.start(0);return true;
    }catch(error){report(error);current=null;}
   }
   if(!AudioCtor){report(Error('Audio playback is not supported in this browser.'));if(queue.length)start(queue.shift());return false;}
   let audio,reported=false;
   const handle={audio,key:request.key},fail=error=>{if(reported)return;reported=true;activeAudio.delete(audio);report(error||Error('Timer sound could not play.'));finish(handle);};
   try{
    audio=new AudioCtor(urlForTone(request.tone.file));handle.audio=audio;current=handle;activeAudio.add(audio);audio.preload='auto';audio.volume=request.volume;
    audio.addEventListener?.('ended',()=>{activeAudio.delete(audio);finish(handle);},{once:true});
    audio.addEventListener?.('error',()=>fail(Error('Timer sound file could not be played.')),{once:true});
    const result=audio.play();if(result&&typeof result.catch==='function')result.catch(fail);
    return true;
   }catch(error){fail(error);return false;}
  }
  function play({preview=false,key=''}={}){
   if(key&&(current?.key===key||queue.some(request=>request.key===key)))return false;
   const request={tone:selected,volume,key};
   if(current){if(preview)return false;queue.push(request);return true;}
   return start(request);
  }
  function stop(){queue.length=0;if(current?.source){try{current.source.stop();}catch{}}if(current?.audio){try{current.audio.pause();}catch{}activeAudio.delete(current.audio);}current=null;}
  return Object.freeze({tones:TONES,tone:()=>selected,setTone,setVolume,volume:()=>volume,prime,play,stop,busy:()=>!!current,queued:()=>queue.length});
 }
 return Object.freeze({TONES,create});
});
