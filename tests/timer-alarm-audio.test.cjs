const {test}=require('node:test');
const assert=require('node:assert/strict');
const Alarm=require('../js/timer-alarm-audio.js');

test('timer alarm tones are bundled local sounds',()=>{
 const root=require('node:path').join(__dirname,'..','sounds');
 for(const tone of Alarm.TONES){
  const file=require('node:path').join(root,tone.file);
  assert.ok(require('node:fs').statSync(file).size>1000,tone.file+' should be bundled');
 }
});

test('a user-primed Web Audio context plays the selected alarm at the saved volume',async()=>{
 const played=[],fetched=[];
 const source={connect(node){this.destination=node;},start(){played.push(this);}};
 const gain={gain:{value:0},connect(node){this.destination=node;}};
 const context={state:'suspended',destination:{},async resume(){this.state='running';},async decodeAudioData(bytes){return {decoded:bytes.byteLength};},createBufferSource(){return {...source};},createGain(){return {...gain,gain:{value:0}};}};
 const alarm=Alarm.create({
  AudioContextCtor:function(){return context;},
  fetchFn:async url=>{fetched.push(url);return {ok:true,arrayBuffer:async()=>new ArrayBuffer(16)};},
  urlForTone:file=>'sounds/'+file+'?v=test'
 });
 assert.equal(alarm.setTone('bright-steps'),true);
 alarm.setVolume(.27);
 assert.equal(await alarm.prime(),true);
 assert.deepEqual(fetched,['sounds/bright-steps.wav?v=test']);
 assert.equal(alarm.play(),true);
 assert.equal(played.length,1);
 assert.equal(played[0].buffer.decoded,16);
 assert.equal(played[0].destination.gain.value,.27);
});

test('HTML audio fallback reports rejected playback instead of swallowing it',async()=>{
 const errors=[],played=[];
 const rejected=Object.assign(new Error('blocked'),{name:'NotAllowedError'});
 class FakeAudio{
  constructor(src){this.src=src;played.push(this);}
  addEventListener(){}
  play(){return Promise.reject(rejected);}
 }
 const alarm=Alarm.create({AudioCtor:FakeAudio,onError:error=>errors.push(error),urlForTone:file=>'sounds/'+file});
 alarm.setTone('soft-double-tap');alarm.setVolume(.18);
 assert.equal(alarm.play(),true);
 await new Promise(resolve=>setImmediate(resolve));
 assert.equal(played[0].src,'sounds/soft-double-tap.wav');
 assert.equal(played[0].volume,.18);
 assert.equal(errors[0],rejected);
});

test('overlapping previews are ignored while simultaneous timer alarms queue without overlap',()=>{
 const played=[];
 class FakeAudio{
  constructor(src){this.src=src;this.events={};played.push(this);}
  addEventListener(name,fn){this.events[name]=fn;}
  play(){return Promise.resolve();}
 }
 const alarm=Alarm.create({AudioCtor:FakeAudio,AudioContextCtor:null,urlForTone:file=>'sounds/'+file});
 assert.equal(alarm.play({key:'task-a'}),true);
 assert.equal(alarm.busy(),true);
 assert.equal(alarm.play({preview:true}),false);
 assert.equal(alarm.play({key:'task-a'}),false);
 assert.equal(alarm.play({key:'task-b'}),true);
 assert.equal(alarm.queued(),1);
 assert.equal(played.length,1);
 played[0].events.ended();
 assert.equal(played.length,2);
 assert.equal(alarm.busy(),true);
 assert.equal(alarm.queued(),0);
});

test('alarm tone selection and volume reject invalid values safely',()=>{
 const alarm=Alarm.create({AudioCtor:null,AudioContextCtor:null});
 assert.equal(alarm.tone().id,'upbeat-rise');
 assert.equal(alarm.setTone('missing'),false);
 assert.equal(alarm.setTone('soft-double-tap'),true);
 alarm.setVolume(4);
 assert.equal(alarm.volume(),1);
});

test('saved alarm volume uses 12 percent when absent and preserves an explicit zero',()=>{
 assert.equal(Alarm.storedVolume(null),.12);
 assert.equal(Alarm.storedVolume(''),.12);
 assert.equal(Alarm.storedVolume('0'),0);
 assert.equal(Alarm.storedVolume('.24'),.24);
 assert.equal(Alarm.storedVolume('not-a-volume'),.12);
});

test('stopping timer alarms pauses the active sound and drops queued alarms',()=>{
 const played=[];
 class FakeAudio{
  constructor(src){this.src=src;this.events={};this.paused=false;played.push(this);}
  addEventListener(name,fn){this.events[name]=fn;}
  play(){return Promise.resolve();}
  pause(){this.paused=true;}
 }
 const alarm=Alarm.create({AudioCtor:FakeAudio,AudioContextCtor:null,urlForTone:file=>'sounds/'+file});
 assert.equal(alarm.play({key:'task-a'}),true);
 assert.equal(alarm.play({key:'task-b'}),true);
 assert.equal(alarm.queued(),1);
 alarm.stop();
 assert.equal(played[0].paused,true);
 assert.equal(alarm.busy(),false);
 assert.equal(alarm.queued(),0);
 played[0].events.ended();
 assert.equal(played.length,1);
});
