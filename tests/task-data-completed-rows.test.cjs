const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const source = fs.readFileSync(path.join(__dirname, '../js/app.js'), 'utf8');
const css = fs.readFileSync(path.join(__dirname, '../css/task-data-completed-rows.css'), 'utf8');
const html = fs.readFileSync(path.join(__dirname, '../index.html'), 'utf8');
const start = source.indexOf('function dataCompletionRow(');
const end = source.indexOf('\nfunction editDataCompletion(', start);
const renderer = source.slice(start, end);

test('each completion gets one compact row, not separate title/details/button blocks', () => {
 assert.ok(start >= 0 && end > start);
 assert.match(renderer, /data-completion data-completion-record/);
 assert.match(renderer, /data-completion-line/);
 assert.match(renderer, /data-completion-meta/);
 assert.doesNotMatch(renderer, /Edit completion','data-edit-completion'/);
});
test('spanner action is right-aligned, accessible, and uses the existing editor action', () => {
 assert.match(renderer, /🔧/u);
 assert.match(renderer, /'data-edit-completion'/);
 assert.match(renderer, /aria-label="Edit completion:/);
 assert.match(css, /grid-template-columns:\s*minmax\(0, 1fr\) 44px/);
 assert.match(css, /justify-self:\s*end/);
 assert.match(css, /min-height:\s*44px/);
});
test('long titles and details wrap naturally; style is scoped to completed records', () => {
 assert.match(css, /\.task-data-page \.data-completion-record/);
 assert.match(css, /overflow-wrap:\s*anywhere/);
 assert.match(css, /white-space:\s*normal/);
 assert.match(html, /task-data-completed-rows\.css/);
});
test('editing still uses the existing saved-history edit flow', () => {
 assert.match(source, /'data-edit-completion':el=>editDataCompletion\(el\.dataset\.id\)/);
 assert.match(source, /change\(b=>TD\.editCompletion\(b,id,values,core\)\)/);
});
