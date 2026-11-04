const assert=require('node:assert/strict');
const {test}=require('node:test');
const fs=require('node:fs');
const path=require('node:path');
const Codec=require('../js/local-storage-codec.js');

test('household-switch cache uses compact lossless board storage and reads legacy JSON',()=>{
 const source=fs.readFileSync(path.join(__dirname,'../js/sharing.js'),'utf8');
 assert.match(source,/function writeHouseCache\(key,board\).*storageCodec\?\.encode/);
 assert.match(source,/function readHouseCache\(key\).*storageCodec\?\.decode/);
 const board={tasks:Array.from({length:1000},(_,i)=>({id:'task-'+i,title:'Wipe the kitchen counter',notes:'A repeated note used to grow the local board.'})),features:{wins:[]}};
 const packed=Codec.encode(board);
 assert.ok(packed.length<JSON.stringify(board).length);
 assert.deepEqual(Codec.decode(packed),board);
 assert.match(source,/const saved=readHouseCache\(cacheKey\(remote\.account,house\)\)/);
});
