/* Compact, lossless storage for the main board. Reads legacy plain JSON. */
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;if(root)root.TidyStorageCodec=api;})(typeof globalThis!=='undefined'?globalThis:this,function(){
 'use strict';
 const MARKER='__tidyishStorage',HASH_SIZE=65536,WINDOW=4095,MAX_MATCH=18;
 function compress(text){
  const input=new TextEncoder().encode(text),previous=new Int32Array(input.length),head=new Int32Array(HASH_SIZE);previous.fill(-1);head.fill(-1);
  const output=[];let position=0;
  const hashAt=i=>((input[i]*251+input[i+1]*31+input[i+2])&65535);
  const insert=i=>{if(i+2>=input.length)return;const h=hashAt(i);previous[i]=head[h];head[h]=i;};
  while(position<input.length){
   const flagIndex=output.length;output.push(0);let flags=0;
   for(let bit=0;bit<8&&position<input.length;bit++){
    let bestLength=0,bestDistance=0;
    if(position+2<input.length){let candidate=head[hashAt(position)],tries=0;while(candidate>=0&&position-candidate<=WINDOW&&tries++<24){let length=0;while(length<MAX_MATCH&&position+length<input.length&&input[candidate+length]===input[position+length])length++;if(length>bestLength){bestLength=length;bestDistance=position-candidate;if(length===MAX_MATCH)break;}candidate=previous[candidate];}}
    let consumed=1;
    if(bestLength>=3){output.push(bestDistance>>4,((bestDistance&15)<<4)|(bestLength-3));consumed=bestLength;}
    else{flags|=1<<bit;output.push(input[position]);}
    for(let offset=0;offset<consumed;offset++)insert(position+offset);
    position+=consumed;
   }
   output[flagIndex]=flags;
  }
  return Uint8Array.from(output);
 }
 function bytesToBase64(bytes){if(typeof Buffer!=='undefined')return Buffer.from(bytes).toString('base64');let binary='';for(let i=0;i<bytes.length;i+=0x8000)binary+=String.fromCharCode(...bytes.subarray(i,i+0x8000));return btoa(binary);}
 function base64ToBytes(value){if(typeof Buffer!=='undefined')return new Uint8Array(Buffer.from(value,'base64'));const binary=atob(value),out=new Uint8Array(binary.length);for(let i=0;i<binary.length;i++)out[i]=binary.charCodeAt(i);return out;}
 function decompress(bytes){const output=[];let cursor=0;while(cursor<bytes.length){const flags=bytes[cursor++];for(let bit=0;bit<8&&cursor<bytes.length;bit++){if(flags&(1<<bit))output.push(bytes[cursor++]);else{if(cursor+1>=bytes.length)throw Error('Saved board compression is incomplete.');const a=bytes[cursor++],b=bytes[cursor++],distance=(a<<4)|(b>>4),length=(b&15)+3;if(!distance||distance>output.length)throw Error('Saved board compression is invalid.');for(let n=0;n<length;n++)output.push(output[output.length-distance]);}}if(output.length>40_000_000)throw Error('Saved board is too large to open safely.');}return new TextDecoder().decode(Uint8Array.from(output));}
 function encode(value){const raw=JSON.stringify(value),packed=JSON.stringify({[MARKER]:'lzss1',data:bytesToBase64(compress(raw))});return packed.length<raw.length?packed:raw;}
 function decode(raw){const parsed=JSON.parse(raw);return parsed&&parsed[MARKER]==='lzss1'?JSON.parse(decompress(base64ToBytes(parsed.data))):parsed;}
 function isPacked(raw){try{return JSON.parse(raw)?.[MARKER]==='lzss1';}catch{return false;}}
 return Object.freeze({encode,decode,isPacked});
});
