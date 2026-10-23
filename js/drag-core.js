/* Tidyish 10B: local, explicit task movement. This module never saves a board or awards points. */
(function(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.TidyDrag = api;
})(typeof globalThis === 'object' ? globalThis : this, function() {
  'use strict';
  function recurring(t) { return Number(t?.repeatDays)>0 || Number(t?.repeatMonths)>0 || !!t?.repeatWeekdays?.length; }
  function sameSection(a,b,view) {
    if (!a || !b || a.id===b.id || a.room!==b.room || !!a.side!==!!b.side) return false;
    if (a.side && (a.sideKind||'organisation')!==(b.sideKind||'organisation')) return false;
    if (view==='doing' && (!a.doing || !b.doing)) return false;
    if (view==='attention' && (!a.attention || !b.attention)) return false;
    return true;
  }
  function canMove(board,from,to,view='room') {
    const a=board.tasks.find(t=>t.id===from), b=board.tasks.find(t=>t.id===to);
    return !!(sameSection(a,b,view) && !a.done && !b.done && !a.paused && !b.paused && !recurring(a) && !recurring(b));
  }
  function insertRelative(list,from,to,after) {
    const pos=list.indexOf(from),ref=list.indexOf(to);
    if(pos<0 || ref<0 || from===to) return false;
    list.splice(pos,1);
    list.splice(list.indexOf(to)+(after?1:0),0,from);
    return true;
  }
  function reorder(board,from,to,after=false,view='room') {
    if(!canMove(board,from,to,view)) throw Error('Move tasks within the same room and task section. Recurring tasks stay date-ordered.');
    if(view==='doing') {if(!insertRelative(board.doingOrder,from,to,after))throw Error('Doing Now order is unavailable.');}
    else {
      const ids=board.tasks.map(t=>t.id);
      insertRelative(ids,from,to,after);
      const byId=new Map(board.tasks.map(t=>[t.id,t]));
      board.tasks=ids.map(id=>byId.get(id));
    }
    return board;
  }
  function asSubtask(t) {
    const {children,...details}=t;
    return {...details,parentId:''}; // Original ID, timer and metadata stay with the task.
  }
  function subtree(t) {
    return [asSubtask(t), ...t.children.map(c=>({...c,parentId:c.parentId||t.id}))];
  }
  function isParent(t) {return !!(t.children?.length || t.wasParent);}
  function nest(board,from,to,name='',view='room',createParent) {
    if(!canMove(board,from,to,view)) throw Error('These tasks cannot be grouped. The original tasks are unchanged.');
    const a=board.tasks.find(t=>t.id===from),b=board.tasks.find(t=>t.id===to);
    if(typeof name!=='string'||name.length>500)throw Error('Parent name must be 500 characters or fewer.');
    const parentName=name.trim();
    if(isParent(b)&&parentName)throw Error('Existing parents keep their original names.');
    const newParent=!isParent(b)&&!!parentName;
    if(newParent&&typeof createParent!=='function')throw Error('Creating a parent requires a new unique task identity.');
    const parent=newParent?createParent({room:b.room,title:parentName,side:b.side,sideKind:b.sideKind,doing:b.doing||a.doing,attention:b.attention||a.attention,children:[]}):b;
    if(newParent&&(!parent?.id || board.tasks.some(t=>t.id===parent.id)))throw Error('New parent ID must be unique.');
    const fromSubtree=subtree(a);
    if(newParent) parent.children=[...subtree(b),...fromSubtree];
    else {
      parent.children=[...b.children,...fromSubtree];
      parent.doing=!!(b.doing||a.doing);
      parent.attention=!!(b.attention||a.attention);
    }
    parent.wasParent=true;
    const after=[];
    for(const t of board.tasks){if(t.id===from)continue;after.push(t.id===to?parent:t);}
    board.tasks=after;
    const ids=new Set(board.tasks.map(t=>t.id)),seen=new Set();
    board.doingOrder=board.doingOrder.map(id=>(id===from||id===to)&&parent.doing?parent.id:id)
      .filter(id=>{if(!ids.has(id)||seen.has(id))return false;seen.add(id);return true;});
    if(parent.doing&&!seen.has(parent.id))board.doingOrder.unshift(parent.id);
    return board;
  }
  function palette(index) {return ((index%6)+6)%6;}
  return {canMove,reorder,nest,isParent,palette};
});
