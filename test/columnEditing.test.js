import test from 'node:test';
import assert from 'node:assert/strict';
import { editTableColumns } from '../src/columnEditing.js';
import { parseDBMLDocument } from '../src/dbmlParser.js';

const source = `Table users {
  id int [pk]
  name varchar(20) [note: 'Display name']
  indexes { name [unique] }
}
Table posts {
  user_id int [ref: > users.id]
  other_id int
}
Ref: posts.other_id > users.id
`;
test('column edits preserve settings, update refs and indexes, and reorder source', () => {
  const result = editTableColumns(source, 'users', [
    { originalName: 'name', name: 'full name', type: 'text' },
    { originalName: 'id', name: 'uid', type: 'bigint' },
  ]);
  const { model, errors } = parseDBMLDocument(result);
  assert.deepEqual(errors, []);
  assert.deepEqual(model.tables[0].columns.map((c) => [c.name, c.type]), [['full name', 'text'], ['uid', 'bigint']]);
  assert.equal(model.tables[0].columns[0].note.value, 'Display name');
  assert.equal(model.tables[0].columns[1].isPk, true);
  assert.equal(model.tables[0].indexes[0].columns[0].value, 'full name');
  assert.ok(model.refs.every((ref) => [ref.from, ref.to].some((end) => end.table === 'users' && end.column === 'uid')));
});
test('rejects duplicate names and invalid types without producing source', () => {
  assert.throws(() => editTableColumns(source, 'users', [
    { originalName: 'id', name: 'same', type: 'int' },
    { originalName: 'name', name: 'same', type: 'text' },
  ]), /unique/);
});
test('updates schema-qualified composite refs when names are swapped', () => {
  const dbml = `Table auth.users {\n a int\n b int\n}\nTable links {\n x int\n y int\n}\nRef: links.(x,y) > auth.users.(a,b)`;
  const result = editTableColumns(dbml, 'auth.users', [
    { originalName: 'a', name: 'b', type: 'int' },
    { originalName: 'b', name: 'a', type: 'int' },
  ]);
  assert.match(result, /auth.users.\(b,a\)/);
});
