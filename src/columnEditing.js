import { Compiler, DEFAULT_ENTRY, MemoryProjectLayout } from '@dbml/parse';
import { parseDBMLDocument } from './dbmlParser.js';

const identifier = (name) => /^[A-Za-z_][\w$]*$/.test(name) ? name : `"${name.replaceAll('"', '""')}"`;
const qualified = (schema, name) => !schema || schema === 'public' ? name : `${schema}.${name}`;
const tokens = (source) => [...source.matchAll(/"(?:""|\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|`(?:\\.|[^`\\])*`|\/\/[^\n]*|\/\*[\s\S]*?\*\/|[A-Za-z_][\w$]*|[^\s]/g)]
  .filter(([text]) => !text.startsWith('//') && !text.startsWith('/*'));
const value = (text) => text.startsWith('"') ? text.slice(1, -1).replaceAll('""', '"') : text;

export function editTableColumns(source, tableName, columns) {
  const layout = new MemoryProjectLayout();
  layout.setSource(DEFAULT_ENTRY, source);
  const compiler = new Compiler(layout);
  if (compiler.parse.errors(DEFAULT_ENTRY).length) throw new Error('Resolve DBML errors before editing columns.');
  const raw = compiler.parse.rawDb(DEFAULT_ENTRY);
  const table = raw.tables.find((item) => qualified(item.schemaName, item.name) === tableName);
  if (!table) throw new Error('This table no longer exists.');
  if (table.partials?.length) throw new Error('Edit columns inherited from TablePartial in the DBML editor.');
  if (columns.length !== table.fields.length || new Set(columns.map((c) => c.originalName)).size !== table.fields.length) throw new Error('The table changed. Reopen its column editor.');
  if (columns.some((c) => !c.name.trim() || !c.type.trim())) throw new Error('Every column needs a name and type.');
  if (new Set(columns.map((c) => c.name.trim())).size !== columns.length) throw new Error('Column names must be unique.');
  if (columns.some((c) => /[\[\]{}\n\r;]|\/\/|\/\*/.test(c.type))) throw new Error('Enter only a column type, such as varchar(255).');
  const renamed = new Map(columns.map((c) => [c.originalName, c.name.trim()]));
  const patches = new Map();
  const patch = (start, end, text) => patches.set(`${start}:${end}`, { start, end, text });
  const range = (token) => [token.start.offset, token.end.offset];
  for (const column of columns) {
    const field = table.fields.find((item) => item.name === column.originalName);
    if (!field) throw new Error('The table changed. Reopen its column editor.');
    const [start, end] = range(field.token);
    const text = source.slice(start, end);
    const parts = tokens(text);
    // The type ends before settings, a comment, or the end of the field.
    const settings = parts.find((part) => part[0] === '[');
    const comment = text.search(/\/\/|\/\*/);
    const typeEnd = Math.min(settings?.index ?? text.length, comment < 0 ? text.length : comment);
    patch(start, start + typeEnd, `${identifier(column.name.trim())} ${column.type.trim()}${text.slice(0, typeEnd).match(/\s*$/)[0]}`);
  }
  for (const index of table.indexes || []) {
    for (const column of index.columns || []) {
      if (column.type === 'column' && renamed.has(column.value) && renamed.get(column.value) !== column.value) {
        patch(...range(column.token), identifier(renamed.get(column.value)));
      }
    }
  }
  for (const ref of raw.refs || []) {
    for (const endpoint of ref.endpoints || []) {
      const alias = raw.aliases?.find((a) => a.name === endpoint.tableName && a.kind === 'table')?.value;
      if (qualified(alias?.schemaName ?? endpoint.schemaName, alias?.tableName ?? endpoint.tableName) !== tableName) continue;
      const [start, end] = range(endpoint.token);
      // The implicit source of an inline ref is already covered by the field edit.
      if (table.fields.some((field) => field.token.start.offset === start)) continue;
      const parts = tokens(source.slice(start, end));
      const dot = parts.findLastIndex((part) => part[0] === '.');
      for (const part of parts.slice(dot + 1)) {
        const name = value(part[0]);
        if (endpoint.fieldNames.includes(name) && renamed.has(name) && renamed.get(name) !== name) {
          patch(start + part.index, start + part.index + part[0].length, identifier(renamed.get(name)));
        }
      }
    }
  }
  const apply = (start, end) => {
    let text = source.slice(start, end);
    for (const edit of [...patches.values()].filter((p) => p.start >= start && p.end <= end).sort((a, b) => b.start - a.start)) {
      text = text.slice(0, edit.start - start) + edit.text + text.slice(edit.end - start);
    }
    return text;
  };
  const fields = [...table.fields].sort((a, b) => a.token.start.offset - b.token.start.offset);
  const rewritten = new Map(fields.map((field) => [field.name, apply(...range(field.token))]));
  const replacements = fields.map((field, index) => ({ start: field.token.start.offset, end: field.token.end.offset, text: rewritten.get(columns[index].originalName) }));
  const outside = [...patches.values()].filter((edit) => !fields.some((field) => edit.start >= field.token.start.offset && edit.end <= field.token.end.offset));
  let result = source;
  for (const edit of [...outside, ...replacements].sort((a, b) => b.start - a.start)) result = result.slice(0, edit.start) + edit.text + result.slice(edit.end);
  const parsed = parseDBMLDocument(result);
  if (!parsed.model) throw new Error(parsed.errors[0]?.message || 'These column changes are not valid DBML.');
  const updated = parsed.model.tables.find((item) => item.name === tableName);
  if (updated.columns.length !== columns.length || updated.columns.some((c, i) => c.name !== columns[i].name.trim())) throw new Error('Enter a valid column name and type.');
  return result;
}
