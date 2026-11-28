const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const Alarm=require('../js/timer-alarm-audio.js');

const app=fs.readFileSync(require('node:path').join(__dirname,'..','js','app.js'),'utf8');
const speechReminderSource=app.split('\n').find(line=>line.startsWith('function speakLaundryReminder('));
assert.ok(speechReminderSource,'laundry speech reminder helper should exist');

test('timed-out laundry speech is cancelled before the shared alarm queue advances',async()=>{
 const played=[];let utterance,timeout,timeoutDelay=0;
 class FakeAudio{
  constructor(src){this.src=src;this.events={};played.push(this);}
  addEventListener(name,fn){this.events[name]=fn;}
  play(){return Promise.resolve();}
  pause(){this.paused=true;}
 }
 class FakeUtterance{constructor(text){this.text=text;}}
 const alarm=Alarm.create({AudioCtor:FakeAudio,AudioContextCtor:null,urlForTone:file=>'sounds/'+file});
 const jobs=new Map(),record={key:'laundry:standard:1:1:123'};
 jobs.set(record.key,record);
 const synth={speak(value){utterance=value;},cancel(){if(utterance)utterance.cancelled=true;}};
 const context={window:{speechSynthesis:synth,SpeechSynthesisUtterance:FakeUtterance},timerAlarmAudio:alarm,laundryReminderAudioJobs:jobs,Promise,Map,setTimeout(fn,ms){timeout=fn;timeoutDelay=ms;return 1;},clearTimeout(){}};
 const speak=vm.runInNewContext(`(${speechReminderSource})`,context);
 assert.equal(alarm.play({key:record.key,after:()=>speak(record),onCancel:()=>record.cancelSpeech?.()}),true);
 assert.equal(alarm.play({key:'timer:task-1'}),true);
 played[0].events.ended();
 assert.equal(utterance.text,'Time to put out the washing.');
 assert.equal(alarm.busy(),true);
 assert.equal(alarm.queued(),1);
 assert.equal(timeoutDelay,15000);
 timeout();
 assert.equal(utterance.cancelled,true);
 await new Promise(resolve=>setImmediate(resolve));
 assert.equal(jobs.has(record.key),false);
 assert.equal(played.length,2);
 assert.equal(played[1].src,'sounds/upbeat-rise.wav');
 assert.equal(alarm.busy(),true);
});
