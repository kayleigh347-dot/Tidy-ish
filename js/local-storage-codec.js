/* Compact, lossless storage for the main board. Reads legacy plain JSON. */
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;if(root)root.TidyStorageCodec=api;})(typeof globalThis!=='undefined'?globalThis:this,function(){
 'use strict';
 const MARKER='__tidyishStorage',HASH_SIZE=65536,WINDOW=4095,MAX_MATCH=18;
 function compress(input){
  const previous=new Uint16Array(input.length),head=new Int32Array(HASH_SIZE);head.fill(-1);
  const output=new Uint8Array(input.length+Math.ceil(input.length/8));let outPos=0,position=0;
  const hashAt=i=>((input[i]*251+input[i+1]*31+input[i+2])&65535);
  const insert=i=>{if(i+2>=input.length)return;const h=hashAt(i),prior=head[h];previous[i]=prior>=0&&i-prior<=WINDOW?i-prior:0;head[h]=i;};
  while(position<input.length){
   const flagIndex=outPos++;let flags=0;
   for(let bit=0;bit<8&&position<input.length;bit++){
    let bestLength=0,bestDistance=0;
    if(position+2<input.length){let candidate=head[hashAt(position)],tries=0;while(candidate>=0&&position-candidate<=WINDOW&&tries++<8){let length=0;while(length<MAX_MATCH&&position+length<input.length&&input[candidate+length]===input[position+length])length++;if(length>bestLength){bestLength=length;bestDistance=position-candidate;if(length===MAX_MATCH)break;}const step=previous[candidate];if(!step)break;candidate-=step;}}
    let consumed=1;
    if(bestLength>=3){output[outPos++]=bestDistance>>4;output[outPos++]=((bestDistance&15)<<4)|(bestLength-3);consumed=bestLength;}
    else{flags|=1<<bit;output[outPos++]=input[position];}
    for(let offset=0;offset<consumed;offset++)insert(position+offset);
    position+=consumed;
   }
   output[flagIndex]=flags;
  }
  return output.subarray(0,outPos);
 }
 function bytesToBase64(bytes){if(typeof Buffer!=='undefined')return Buffer.from(bytes).toString('base64');let binary='';for(let i=0;i<bytes.length;i+=0x8000)binary+=String.fromCharCode(...bytes.subarray(i,i+0x8000));return btoa(binary);}
 function base64ToBytes(value){if(typeof Buffer!=='undefined')return new Uint8Array(Buffer.from(value,'base64'));const binary=atob(value),out=new Uint8Array(binary.length);for(let i=0;i<binary.length;i++)out[i]=binary.charCodeAt(i);return out;}
 function decompress(bytes){let cursor=0,length=0;while(cursor<bytes.length){const flags=bytes[cursor++];for(let bit=0;bit<8&&cursor<bytes.length;bit++){if(flags&(1<<bit)){cursor++;length++;}else{if(cursor+1>=bytes.length)throw Error('Saved board compression is incomplete.');const a=bytes[cursor++],b=bytes[cursor++],distance=(a<<4)|(b>>4),count=(b&15)+3;if(!distance||distance>length)throw Error('Saved board compression is invalid.');length+=count;}if(length>8_000_000)throw Error('Saved board is too large to open safely.');}}return decompressKnownLength(bytes,length);}
 function decompressKnownLength(bytes,length){if(!Number.isSafeInteger(length)||length<0||length>8_000_000)throw Error('Saved board is too large to open safely.');const output=new Uint8Array(length);let cursor=0,outPos=0;while(cursor<bytes.length&&outPos<length){const flags=bytes[cursor++];for(let bit=0;bit<8&&cursor<bytes.length&&outPos<length;bit++){if(flags&(1<<bit))output[outPos++]=bytes[cursor++];else{if(cursor+1>=bytes.length)throw Error('Saved board compression is incomplete.');const a=bytes[cursor++],b=bytes[cursor++],distance=(a<<4)|(b>>4),count=(b&15)+3;if(!distance||distance>outPos||outPos+count>length)throw Error('Saved board compression is invalid.');for(let n=0;n<count;n++){output[outPos]=output[outPos-distance];outPos++;}}}}if(outPos!==length)throw Error('Saved board compression is incomplete.');return new TextDecoder().decode(output);}
 function encode(value){const raw=JSON.stringify(value);if(raw.length<65536)return raw;const input=new TextEncoder().encode(raw);if(input.length>8_000_000)return raw;const packed=JSON.stringify({[MARKER]:'lzss1',length:input.length,data:bytesToBase64(compress(input))});return packed.length<raw.length?packed:raw;}
 function decode(raw){const parsed=JSON.parse(raw);if(!parsed||parsed[MARKER]!=='lzss1')return parsed;const bytes=base64ToBytes(parsed.data);return JSON.parse(Number.isSafeInteger(parsed.length)?decompressKnownLength(bytes,parsed.length):decompress(bytes));}
 function isPacked(raw){try{return JSON.parse(raw)?.[MARKER]==='lzss1';}catch{return false;}}
 return Object.freeze({encode,decode,isPacked});
});
