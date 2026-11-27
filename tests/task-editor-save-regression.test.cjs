const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const M = require('../js/model.js');
const source = fs.readFileSync(
  path.join(__dirname, '../js/app.js'), 'utf8'
);

function functionLine(prefix) {
  const line = source.split('\n').find(x => x.startsWith(prefix));
  assert.ok(line, `Missing source function: ${prefix}`);
  return line;
}

test('More Options appears before Save and Cancel', () => {
  const editor = {
    open: false,
    innerHTML: '',
    showModal() { this.open = true; },
    querySelector() { return { focus() {} }; }
  };
  const context = {
    editor,
    dialogSave: null,
    dialogDirty: false,
    closeDialog() {},
    button: text => `<button type="button">${text}</button>`,
    esc: value => String(value)
  };
  vm.runInNewContext(
    functionLine('function dialog(') + '\nthis.openDialog = dialog;',
    context
  );
  context.openDialog(
    'Add task',
    '<input name="title" required>',
    () => {},
    {
      saveLabel: 'Add task',
      afterSave: '<details><summary>More options</summary></details>'
    }
  );
  const html = editor.innerHTML;
  assert.ok(html.indexOf('More options') < html.indexOf('dialog-footer'));
  assert.match(html, /type="submit"/);
  assert.match(html, /data-dialog-save-error hidden/);
});

test('Save errors are shown inside the dialog', () => {
  const box = { textContent: '', hidden: true };
  const context = {
    editor: {
      querySelector() { return box; }
    }
  };
  vm.runInNewContext(
    functionLine('function showDialogSaveError(') + '\nthis.showError = showDialogSaveError;',
    context
  );
  context.showError('Browser storage is full');
  assert.equal(box.textContent, 'Browser storage is full');
  assert.equal(box.hidden, false);
});

test('Failed persistence does not replace the board', () => {
  const original = { tasks: [] };
  let errorMessage = '';
  const context = {
    board: original,
    M: { clone: x => JSON.parse(JSON.stringify(x)) },
    TIME: { focusQuestCompleted: () => false, focusQuestCompletionId: () => '' },
    Q: { get: () => null },
    route: 'room',
    focusBreakTimer: { cancelIfTaskUndone() {}, start() {} },
    stampTaskEdits() {},
    persist() { throw Error('Simulated storage failure'); },
    render() {},
    notice() {},
    showDialogSaveError(message) { errorMessage = message; },
    window: { TidySharing: { transition() {} } }
  };
  vm.runInNewContext(
    functionLine('function change(') + '\nthis.runChange = change;',
    context
  );
  const saved = context.runChange(board => {
    board.tasks.push({ id: 'unsaved-task' });
  });
  assert.equal(saved, false);
  assert.equal(original.tasks.length, 0);
  assert.equal(errorMessage, 'Simulated storage failure');
});

test('Tools and No Mess Impact survive model normalisation', () => {
  const board = M.board();
  const task = M.task({
    title: 'Clean test shelf',
    room: 'living',
    tools: 'Microfibre cloth\nRubber gloves',
    messImpact: 'none'
  });
  M.add(board, task);
  const restored = M.normalize(JSON.parse(JSON.stringify(board)));
  const saved = restored.tasks.find(x => x.id === task.id);
  assert.ok(saved);
  assert.equal(saved.messImpact, 'none');
  assert.equal(saved.tools, 'Microfibre cloth\nRubber gloves');
});

test('Invalid fields inside collapsed options can be revealed', () => {
  assert.match(source, /addEventListener\('invalid'/);
  assert.match(source, /details\.open=true/);
  assert.match(source, /showDialogSaveError\('Please check/);
});

test('Task save still uses the established board mutation path', () => {
  assert.match(source, /if\(change\(b=>\{/);
  assert.match(source, /M\.add\(b,saved\)/);
  assert.match(source, /messImpact:String\(fd\.get\('messImpact'\)/);
});

test('task title displays an inline autocomplete list with tappable options', () => {
  assert.match(source, /class=\"task-title-autocomplete\"/);
  assert.match(source, /task-autocomplete-list/);
  assert.match(source, /task-autocomplete-choice/);
  assert.match(source, /L\?\.autocompleteSavedTasks\?\.\(board,value,selectedRoom,6,isSide\?null:M\)/);
  assert.ok(source.includes(`const isSide=editor.querySelector('#modal-form [name="side"]')?.checked;`));
  assert.ok(source.includes('data-source-type="${esc(item.sourceType)}"'));
  assert.ok(source.includes('Do Later · Add to Doing Now'));
  assert.match(source, /task-title-suggestion-use/);
  assert.doesNotMatch(source, /Did you mean/);
});

test('typed and dictated input clears stale autocomplete options', () => {
  const start=source.indexOf("document.addEventListener('input',e=>{if(e.target.name!=='title'");
  const end=source.indexOf("document.addEventListener('change',e=>{if(!['room','side'].includes(e.target.name)",start);
  assert.ok(start>=0&&end>start);
  assert.match(source.slice(start,end), /hideTaskTitleSuggestions\(\)/);
  assert.match(source, /setTimeout\(renderTaskTitleSuggestion,130\)/);
  assert.match(source, /dispatchEvent\(new Event\('input',\{bubbles:true\}\)\)/);
});

test('reusable suggestion selection copies only reviewed settings without saving', () => {
  const start=source.indexOf('function useTaskTitleSuggestion(');
  const end=source.indexOf('\nfunction dismissTaskTitleSuggestion(',start);
  assert.ok(start>=0&&end>start);
  const handler=source.slice(start,end);
  assert.match(handler, /state\?\.matches\?\.find\(row=>row.id===el\?\.dataset\?\.id&&row.sourceType===el\?\.dataset\?\.sourceType\)/);
  const draftStart=handler.indexOf('const draft=L?.draftFromSavedTask?.(match)');
  const laterStart=handler.indexOf("if(match.sourceType==='do-later')");
  assert.ok(laterStart>=0&&draftStart>laterStart);
  const reusable=handler.slice(draftStart);
  assert.match(reusable, /L\?\.draftFromSavedTask\?\.\(match\)/);
  assert.match(reusable, /copyReusableTaskSettingsToForm\(draft\)/);
  assert.match(reusable, /hideTaskTitleSuggestions\(\)/);
  assert.match(reusable, /focusTaskTitleInput\(\)/);
  assert.doesNotMatch(reusable, /\b(?:change|persist|selectDoLaterTask|reactivate)\s*\(/);
});

test('Do Later routing selects the existing ID only, and rejects stale side-mode or source-type clicks', () => {
  const L=require('../js/quest-library.js'),board=M.board();
  const task=M.task({title:'Wipe shelf',room:'living',children:[M.child({title:'Top shelf',done:true})]});
  M.add(board,task);
  const template=M.task({title:task.title,room:task.room});
  board.features.templates.push(template);
  const matches=L.autocompleteSavedTasks(board,'shelf','living',6,M);
  assert.ok(matches.some(x=>x.id===task.id&&x.sourceType==='do-later'));
  assert.ok(matches.some(x=>x.id===template.id&&x.sourceType==='template'));
  const start=source.indexOf('function useTaskTitleSuggestion(');
  const end=source.indexOf('\nfunction dismissTaskTitleSuggestion(',start);
  assert.ok(start>=0&&end>start);
  let side=false,saves=0,closes=0,draft=null;
  const context={M,L,board,taskTitleSuggestionState:{matches},
    editor:{querySelector(selector){return selector.includes('[name="side"]')?{checked:side}:null;}},
    change(edit){saves++;edit(board);return true;},
    closeDialog(){closes++;},notice(){},hideTaskTitleSuggestions(){},focusTaskTitleInput(){},
    copyReusableTaskSettingsToForm(value){draft=value;}
  };
  vm.runInNewContext(source.slice(start,end)+'\nthis.choose=useTaskTitleSuggestion;',context);
  const before=M.clone(board);
  context.choose({dataset:{id:task.id,sourceType:'template'}});
  side=true;
  context.choose({dataset:{id:task.id,sourceType:'do-later'}});
  assert.equal(saves,0);assert.equal(closes,0);assert.equal(draft,null);assert.deepEqual(board,before);
  side=false;
  context.choose({dataset:{id:template.id,sourceType:'template'}});
  assert.deepEqual(draft,L.draftFromSavedTask(template));assert.equal(saves,0);assert.equal(closes,0);assert.deepEqual(board,before);
  draft=null;
  const expected=M.clone(board);M.select(expected,task.id,true);
  context.choose({dataset:{id:task.id,sourceType:'do-later'}});
  assert.equal(saves,1);assert.equal(closes,1);assert.equal(draft,null);assert.deepEqual(board,expected);
});

test('autocomplete supports arrows, enter and Escape plus click-outside dismissal', () => {
  assert.match(source, /e.key==='ArrowDown'/);
  assert.match(source, /e.key==='Enter'/);
  assert.match(source, /e.key==='Escape'/);
  assert.match(source, /e.target.closest\('\.task-title-autocomplete'\)/);
});

test('changing rooms or side-task mode dismisses stale matches and rematches', () => {
  const start=source.indexOf("document.addEventListener('change',e=>{if(!['room','side'].includes(e.target.name)");
  const end=source.indexOf("\n let librarySearchTimer",start);
  assert.ok(start>=0&&end>start);
  assert.match(source.slice(start,end), /taskTitleSuggestionState\.dismissedTitle='';hideTaskTitleSuggestions\(\);renderTaskTitleSuggestion\(\)/);
});

test('new task duplicates of completed Quests explain the Do again path', () => {
  assert.match(source, /L\?\.findDuplicateTask\?\.\(b,saved\.title,saved\.room,saved\.side\)/);
  assert.match(source, /duplicate\.done\?'This completed task already exists in this room\. Use “Do again” on the existing task or edit that task instead\.'/);
  assert.match(source, /button\('Do again','library-reactivate'/);
});

test('Add Saved Task still reactivates its completed matching Quest', () => {
  const start = source.indexOf("'activate-template':");
  const end = source.indexOf("'pause-task':", start);
  assert.ok(start >= 0 && end > start);
  const handler = source.slice(start, end);
  assert.match(handler, /L\.activateSaved\(b,t\.id,rs,fd\.has\('doing'\),M\)/);
  const L=require('../js/quest-library.js'),b=M.board();
  const t=M.task({title:'Dust',room:'kitchen'});b.features.templates.push(t);
  const existing=M.templateCopy(t,'kitchen');M.add(b,existing);M.finish(b,existing.id,true);
  const history=JSON.stringify(b.features.wins);L.activateSaved(b,t.id,['kitchen'],true,M);
  assert.equal(b.tasks.length,1);assert.equal(b.tasks[0].id,existing.id);assert.equal(b.tasks[0].done,false);assert.equal(b.tasks[0].doing,true);assert.equal(JSON.stringify(b.features.wins),history);
  L.activateSaved(b,t.id,['living'],false,M);assert.equal(b.tasks.length,2);assert.equal(b.tasks[0].templateId,t.id);assert.equal(b.tasks[0].room,'living');
});

test('selecting saved task copies time and mess impact without opening More options', () => {
  const first = source.indexOf('function copyReusableTaskSettingsToForm(');
  const last = source.indexOf('\nfunction useTaskTitleSuggestion(', first);
  assert.ok(first >= 0 && last > first, 'Reusable-settings helper should exist');
  const routine = source.slice(first, last);
  const expected = {
    title: 'Hoover carpet', children: [{ title: 'Move chair' }],
    tools: 'Hoover', notes: 'Under sofa', estimate: 15, priority: 2,
    effort: 'Medium', messImpact: 'big', tags: ['floors'], taskType: 'cleaning'
  };
  for (const initiallyOpen of [false, true]) {
    const moreOptions = { open: initiallyOpen };
    const childOptions = { open: initiallyOpen };
    const controls = Object.fromEntries(
      ['title','children','tools','notes','estimate','priority','effort',
       'messImpact','tags','taskType'].map(name=>[name,{value:''}])
    );
    const editor = { querySelector(selector) {
      const name = /\[name="([^"]+)"\]/.exec(selector)?.[1];
      return name ? controls[name] : null;
    } };
    const context = {editor};
    vm.runInNewContext(routine+'\nthis.populate = copyReusableTaskSettingsToForm;',context);
    context.populate(expected);
    assert.equal(controls.title.value,'Hoover carpet');
    assert.equal(controls.estimate.value,'15');
    assert.equal(controls.messImpact.value,'big');
    assert.equal(controls.children.value,'Move chair');
    assert.equal(controls.tools.value,'Hoover');
    assert.equal(controls.notes.value,'Under sofa');
    assert.equal(moreOptions.open,initiallyOpen,'More options visibility must not change');
    assert.equal(childOptions.open,initiallyOpen,'Subtask visibility must not change');
  }
  assert.match(source,/copyReusableTaskSettingsToForm\(draft\)/);
  assert.match(source,/saveLabel:creating\?'Add task':'Save'/);
});
