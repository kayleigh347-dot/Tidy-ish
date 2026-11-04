/* Task Data Activity Calendar diary bridge: new day symbols belong to shared household data.
 * Legacy browser-only notes require explicit import before becoming visible to other members. */
(function(root){'use strict';
  const C=root.TidyActivityData;
  const namespace=new URLSearchParams(root.location.search).get('qa')==='1'?'-qa':'';
  const KEY='tidyish-html-v023-activity-diary-v1'+namespace;
  let loaded=false, storedRaw='', storageIssue='', state={annotations:{},earned:[]};
  let instance=null, selectedDate=null, autoEditBlank=false;
  function tidy(input){
    if(!input||typeof input!=='object'||Array.isArray(input))throw Error('Invalid diary format');
    const annotations={};
    if(input.annotations&&typeof input.annotations==='object'&&!Array.isArray(input.annotations)){
      for(const [date,value] of Object.entries(input.annotations)){
        if(C.validDay(date)){
          const safe=C.annotation(value);
          if(safe)annotations[date]=safe;
        }
      }
    }
    const earned=Array.isArray(input.earned)?[...new Set(input.earned.filter(x=>typeof x==='string'&&/^\d{4}-\d{2}$/.test(x)&&C.validDay(x+'-01')))].sort():[];
    return {annotations,earned};
  }
  function read(){
    if(loaded)return;
    loaded=true;
    try{
      storedRaw=root.localStorage.getItem(KEY)||'';
      if(storedRaw.length>100000)throw Error('Saved diary exceeds its size limit. Original data has not been changed.');
      state=storedRaw?tidy(JSON.parse(storedRaw)):state;
    }catch(err){storageIssue='Diary storage cannot be read ('+err.message+'). Saved data will not be overwritten.';}
  }
  function write(snapshot){
    const next=tidy(snapshot);
    if(JSON.stringify(next)===JSON.stringify(state))return;
    state=next;
    if(storageIssue)return;
    try{
      const current=root.localStorage.getItem(KEY)||'';
      if(current!==storedRaw){storageIssue='Another tab changed this diary. Reload to see its changes; your task data was not changed.';return;}
      const serialized=JSON.stringify({version:1,...state});
      if(serialized.length>100000){storageIssue='Diary is too large to save. Please back up your data.';return;}
      root.localStorage.setItem(KEY,serialized);
      storedRaw=serialized;
    }catch(err){storageIssue='Diary changes could not be saved ('+err.message+'). Other task data is safe.';}
  }
  function shared(board){return tidy(board?.features?.activityDiary||{annotations:{},earned:[]});}
  function hasNotes(value){return Object.keys(value?.annotations||{}).length>0||(value?.earned?.length||0)>0;}
  function showStatus(){
    const box=root.document.getElementById('tidyish-activity-storage-status');
    if(box){box.textContent=storageIssue;box.hidden=!storageIssue;}
  }
  function mount(element,board,onShare){
    if(!element||!C||!root.TidyActivityCalendar)return;
    read();
    unmount();
    try{
      const current=shared(board);
      instance=new root.TidyActivityCalendar(element,{
        board,annotations:current.annotations,earned:current.earned,selected:selectedDate||C.today(),autoEditBlank,
        assetBase:'assets/activity-calendar/',
        onPersonalStateChange(next){if(typeof onShare==='function'){try{const safe=tidy(next);if(JSON.stringify(safe)!==JSON.stringify(shared(board)))onShare(safe);}catch(err){storageIssue='Shared diary could not be saved: '+err.message;showStatus();}}else write(next);}
      });
      autoEditBlank=false;
      const status=root.document.createElement('p');
      status.id='tidyish-activity-storage-status';status.className='activity-storage-warning';
      status.setAttribute('role','status');status.textContent=storageIssue;status.hidden=!storageIssue;
      element.appendChild(status);
      // Old local-only notes may have been private. Never publish them without a click.
      if(typeof onShare==='function'&&hasNotes(state)){
        const localOnly=Object.entries(state.annotations).filter(([d,v])=>!current.annotations[d]||JSON.stringify(current.annotations[d])!==JSON.stringify(v)).length+state.earned.filter(m=>!current.earned.includes(m)).length;
        if(localOnly){const box=root.document.createElement('div');box.className='tac-legacy-import';const note=root.document.createElement('p');note.textContent=localOnly+' locally saved diary entries are not in the shared household. Import only if you want household members to see them.';
          const button=root.document.createElement('button');button.type='button';button.textContent='Import local diary notes to household';button.addEventListener('click',()=>{try{const updated=tidy({annotations:{...state.annotations,...current.annotations},earned:[...new Set([...state.earned,...current.earned])]});if(onShare(updated)!==false){storageIssue='';}}catch(err){storageIssue='Could not import diary notes: '+err.message;showStatus();}});box.append(note,button);element.appendChild(box);}
      }
    }catch(err){element.textContent='The activity diary could not be opened: '+err.message+' Existing Task Data is safe.';}
  }
  function unmount(){
    if(instance){selectedDate=instance.selected;instance.destroy();instance=null;}
  }
  root.addEventListener('storage',e=>{
    if(e.key!==KEY||!loaded||(e.newValue||'')===storedRaw)return;
    // Do not silently replace a person's open annotation form or overwrite another tab.
    storageIssue='This personal diary changed in another tab. Reload before editing it here.';
    showStatus();
  });
  function jumpTo(date){
    if(!C||!C.validDay(date)||date>C.today())return false;
    selectedDate=date;autoEditBlank=true;
    if(instance){instance.select(date,true,true);autoEditBlank=false;}
    return true;
  }
  // The public Calendar and Task Data share the same read-only historical projection.
  function monthSummary(board,month){
    if(!C||!C.monthDates(month))return {};
    read();
    const diary=shared(board),data=C.analyze(board,{annotations:diary.annotations,earned:diary.earned});
    const result=Object.create(null);
    for(const date of C.monthDates(month)){
      if(date>data.today)continue;
      const d=C.dayInfo(data,date);
      const art=d.winner==='laundry'?'laundry.svg':C.artForRoom(d.winner)||'neutral.svg';
      result[date]={count:d.count,points:d.points,room:d.winner||'',name:d.winner?(data.roomNames[d.winner]||C.roomName(d.winner)):'',symbol:d.occasion?.symbol||'',occasion:d.occasion?.description||'',art,ring:C.ringFor(d.count),marked:d.marked};
    }
    return result;
  }
  root.TidyActivityHost=Object.freeze({mount,unmount,jumpTo,monthSummary});
})(window);
