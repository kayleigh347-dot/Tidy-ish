/* Photo OCR runs in the browser. Only the OCR engine and English model are fetched; photo pixels stay on-device. */
(()=>{
 'use strict';
 const VERSION='5.0.0';
 const ROOT='https://cdn.jsdelivr.net/npm/tesseract.js@'+VERSION;
 const CORE='https://cdn.jsdelivr.net/npm/tesseract.js-core@v'+VERSION;
 const LANG='https://tessdata.projectnaptha.com/4.0.0';
 let libraryPromise=null;

 function loadLibrary(){
  if(window.Tesseract)return Promise.resolve(window.Tesseract);
  if(libraryPromise)return libraryPromise;
  libraryPromise=new Promise((resolve,reject)=>{
   const script=document.createElement('script');
   script.src=ROOT+'/dist/tesseract.min.js';script.crossOrigin='anonymous';script.async=true;
   script.onload=()=>window.Tesseract?resolve(window.Tesseract):reject(Error('The text reader did not start.'));
   script.onerror=()=>reject(Error('Could not load the on-device text reader. Connect to the internet and try again.'));
   document.head.append(script);
  }).catch(error=>{libraryPromise=null;throw error;});
  return libraryPromise;
 }

 function jpegForOCR(file){
  return new Promise((resolve,reject)=>{
   const source=URL.createObjectURL(file),image=new Image();
   image.onload=()=>{
    URL.revokeObjectURL(source);
    const longest=Math.max(image.naturalWidth,image.naturalHeight),scale=Math.min(1,2400/longest);
    const canvas=document.createElement('canvas');canvas.width=Math.max(1,Math.round(image.naturalWidth*scale));canvas.height=Math.max(1,Math.round(image.naturalHeight*scale));
    const context=canvas.getContext('2d',{alpha:false});if(!context){reject(Error('This browser cannot prepare the photo for reading.'));return;}
    context.fillStyle='#fff';context.fillRect(0,0,canvas.width,canvas.height);context.imageSmoothingEnabled=true;context.imageSmoothingQuality='high';context.drawImage(image,0,0,canvas.width,canvas.height);
    canvas.toBlob(blob=>blob?resolve(blob):reject(Error('Could not prepare this photo.')),'image/jpeg',.92);
   };
   image.onerror=()=>{URL.revokeObjectURL(source);reject(Error('This photo format cannot be opened by the browser. Try a JPEG or PNG photo.'));};
   image.src=source;
  });
 }

 async function read(file,onProgress=()=>{}){
  if(!file||!String(file.type||'').startsWith('image/'))throw Error('Choose a photo first.');
  const image=await jpegForOCR(file),T=await loadLibrary();let worker;
  try{
   worker=await T.createWorker('eng',1,{
    workerPath:ROOT+'/dist/worker.min.js',
    corePath:CORE,
    langPath:LANG,
    logger:message=>{
     const stage=String(message.status||'Reading photo').replace(/^\w/,c=>c.toUpperCase());
     const percent=Number.isFinite(message.progress)?` ${Math.round(message.progress*100)}%`:'';
     onProgress(stage+percent);
    }
   });
   const result=await worker.recognize(image);
   return String(result?.data?.text||'');
  }finally{if(worker)await worker.terminate();}
 }

 window.TidyPhotoTaskOCR=Object.freeze({read});
})();
