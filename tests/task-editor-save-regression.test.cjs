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
