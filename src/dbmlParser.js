import {
  Compiler,
  DEFAULT_ENTRY,
  MemoryProjectLayout,
  dbmlLanguageConfig,
  dbmlMonarchTokensProvider,
  getMultiplicities,
} from "@dbml/parse";

export { dbmlLanguageConfig, dbmlMonarchTokensProvider };

export const EMPTY_DBML_MODEL = Object.freeze({
  tables: [], refs: [], groups: [], enums: [], notes: [], project: null,
  tablePartials: [], diagramViews: [],
});

function qualifiedName(schemaName, name) {
  return !schemaName || schemaName === "public" ? name : `${schemaName}.${name}`;
}

function formatType(type) {
  if (!type) return "unknown";
  const prefix = type.schemaName ? `${type.schemaName}.` : "";
  const name = type.type_name || type.name || String(type);
  if (type.args == null || String(name).includes("(")) return `${prefix}${name}`;
  const args = Array.isArray(type.args)
    ? type.args.map((arg) => arg?.value ?? arg).join(", ")
    : String(type.args);
  return `${prefix}${name}(${args})`;
}

function formatDefault(value) {
  if (value == null) return null;
  if (typeof value !== "object") return String(value);
  return String(value.value ?? value.expression ?? value.name ?? value.type ?? "default");
}

function fieldKey(tableName, fieldName) {
  return `${tableName}\u0000${fieldName}`;
}

function mergePartialFields(table, partialsByName) {
  const entries = (table.fields || []).map((field) => ({
    field,
    order: field.token?.start?.offset ?? Number.MAX_SAFE_INTEGER,
    priority: Number.MAX_SAFE_INTEGER,
  }));
  for (const [injectionIndex, injection] of (table.partials || []).entries()) {
    const partial = partialsByName.get(injection.name)
      || partialsByName.get(qualifiedName(injection.schemaName, injection.name));
    if (!partial) continue;
    const injectionOffset = injection.token?.start?.offset ?? injectionIndex;
    for (const [fieldIndex, field] of (partial.fields || []).entries()) {
      entries.push({ field, order: injectionOffset + fieldIndex / 1000, priority: injectionIndex });
    }
  }
  const winnerByName = new Map();
  for (const entry of entries) {
    const winner = winnerByName.get(entry.field.name);
    if (!winner || entry.priority >= winner.priority) winnerByName.set(entry.field.name, entry);
  }
  return entries
    .filter((entry) => winnerByName.get(entry.field.name) === entry)
    .sort((a, b) => a.order - b.order)
    .map((entry) => entry.field);
}

function normalizeRawDatabase(raw) {
  const partialsByName = new Map();
  for (const partial of raw.tablePartials || []) {
    partialsByName.set(qualifiedName(partial.schemaName, partial.name), partial);
    partialsByName.set(partial.name, partial);
  }

  const injectedRefs = [];
  const tables = (raw.tables || []).map((table, tableIndex) => {
    const name = qualifiedName(table.schemaName, table.name);
    const fields = mergePartialFields(table, partialsByName);
    const localFields = new Set(table.fields || []);
    const injectedPartials = (table.partials || []).map((injection) =>
      partialsByName.get(injection.name)
      || partialsByName.get(qualifiedName(injection.schemaName, injection.name)))
      .filter(Boolean);
    for (const field of fields) {
      if (localFields.has(field)) continue;
      for (const inlineRef of field.inline_refs || []) {
        const [sourceCardinality, targetCardinality] = getMultiplicities(inlineRef.relation);
        injectedRefs.push({
          endpoints: [
            {
              schemaName: table.schemaName,
              tableName: table.name,
              fieldNames: [field.name],
              relation: sourceCardinality,
            },
            {
              schemaName: inlineRef.schemaName,
              tableName: inlineRef.tableName,
              fieldNames: inlineRef.fieldNames,
              relation: targetCardinality,
            },
          ],
        });
      }
    }
    const indexByIdentity = new Map();
    for (const index of [...injectedPartials.flatMap((partial) => partial.indexes || []), ...(table.indexes || [])]) {
      const identity = index.name || JSON.stringify(index.columns || []);
      indexByIdentity.set(identity, index);
    }
    const indexes = [...indexByIdentity.values()];
    const inheritedMetadata = Object.assign({}, ...injectedPartials.map((partial) => partial.metadata || {}));
    const inheritedHeaderColor = [...injectedPartials].reverse().find((partial) => partial.headerColor)?.headerColor;
    const inheritedNote = [...injectedPartials].reverse().find((partial) => partial.note)?.note;

    const pkNames = new Set();
    const uniqueNames = new Set();
    for (const index of indexes) {
      for (const column of index.columns || []) {
        if (column.type !== "column") continue;
        if (index.pk) pkNames.add(column.value);
        if (index.unique) uniqueNames.add(column.value);
      }
    }

    return {
      id: tableIndex + 1,
      key: name,
      name,
      rawName: table.name,
      schema: table.schemaName || "public",
      alias: table.alias || null,
      note: table.note ?? inheritedNote ?? null,
      headerColor: table.headerColor ?? inheritedHeaderColor ?? null,
      metadata: { ...inheritedMetadata, ...(table.metadata || {}) },
      columns: fields.map((field, fieldIndex) => ({
        id: fieldKey(name, field.name),
        name: field.name,
        type: formatType(field.type),
        isPk: Boolean(field.pk || pkNames.has(field.name)),
        isUnique: Boolean(field.unique || uniqueNames.has(field.name)),
        notNull: Boolean(field.not_null || field.pk || pkNames.has(field.name)),
        increment: Boolean(field.increment),
        defaultValue: formatDefault(field.dbdefault),
        note: field.note || null,
        metadata: field.metadata || {},
        enumId: null,
        checks: field.checks || [],
        sourceOrder: fieldIndex,
      })),
      indexes: indexes.map((index) => ({
        name: index.name || null,
        type: index.type || null,
        unique: Boolean(index.unique),
        isPk: Boolean(index.pk),
        note: index.note || null,
        columns: index.columns || [],
      })),
      checks: [...injectedPartials.flatMap((partial) => partial.checks || []), ...(table.checks || [])],
      records: (raw.records || []).filter((record) =>
        qualifiedName(record.schemaName, record.tableName) === name),
      partials: table.partials || [],
      sourceStartLine: table.token?.start?.line || null,
      sourceEndLine: table.token?.end?.line || null,
    };
  });

  const tableNames = new Set(tables.map((table) => table.name));
  const aliases = new Map((raw.aliases || [])
    .filter((alias) => alias.kind === "table" && alias.value)
    .map((alias) => [alias.name, alias.value]));
  const refs = [];
  for (const [refIndex, ref] of [...(raw.refs || []), ...injectedRefs].entries()) {
    if (!ref.endpoints || ref.endpoints.length !== 2) continue;
    const orderedEndpoints = [...ref.endpoints].sort((a, b) =>
      (a.token?.start?.offset ?? 0) - (b.token?.start?.offset ?? 0));
    const endpointData = orderedEndpoints.map((endpoint) => {
      const alias = !endpoint.schemaName ? aliases.get(endpoint.tableName) : null;
      return {
        table: qualifiedName(alias?.schemaName ?? endpoint.schemaName, alias?.tableName ?? endpoint.tableName),
        columns: endpoint.fieldNames || [],
        cardinality: endpoint.relation || "1",
      };
    });
    if (!tableNames.has(endpointData[0].table) || !tableNames.has(endpointData[1].table)) continue;
    const pairCount = Math.max(endpointData[0].columns.length, endpointData[1].columns.length, 1);
    for (let pairIndex = 0; pairIndex < pairCount; pairIndex += 1) {
      refs.push({
        id: `${refIndex + 1}:${pairIndex}`,
        name: ref.name || null,
        from: { ...endpointData[0], column: endpointData[0].columns[pairIndex] || endpointData[0].columns[0] },
        to: { ...endpointData[1], column: endpointData[1].columns[pairIndex] || endpointData[1].columns[0] },
        color: ref.color || null,
        onDelete: ref.onDelete || null,
        onUpdate: ref.onUpdate || null,
        inactive: Boolean(ref.inactive),
        composite: pairCount > 1,
      });
    }
  }

  const groups = (raw.tableGroups || []).map((group) => ({
    name: qualifiedName(group.schemaName, group.name),
    tables: (group.tables || []).map((table) => qualifiedName(table.schemaName, table.name)),
    note: group.note || null,
    color: group.color || null,
    metadata: group.metadata || {},
  }));

  const enums = (raw.enums || []).map((entry, index) => ({
    id: index + 1,
    name: qualifiedName(entry.schemaName, entry.name),
    note: entry.note || null,
    values: entry.values || [],
  }));
  const enumNames = new Set(enums.map((entry) => entry.name));
  for (const table of tables) {
    for (const column of table.columns) {
      if (enumNames.has(column.type)) column.enumId = column.type;
    }
  }

  return {
    tables,
    refs,
    groups,
    enums,
    notes: raw.notes || [],
    project: raw.project || null,
    tablePartials: raw.tablePartials || [],
    diagramViews: raw.diagramViews || [],
  };
}

function normalizeDiagnostics(diagnostics) {
  return diagnostics.map((diagnostic) => {
    const token = diagnostic.nodeOrToken || diagnostic.token || {};
    const zeroBased = !diagnostic.location && Boolean(token.startPos);
    const start = diagnostic.location?.start || token.startPos || token.start || {};
    const end = diagnostic.location?.end || token.endPos || token.end || start;
    const offset = zeroBased ? 1 : 0;
    return {
      message: diagnostic.diagnostic || diagnostic.message || String(diagnostic),
      code: diagnostic.code || "DBML",
      startLineNumber: Math.max(1, (start.line ?? 1) + offset),
      startColumn: Math.max(1, (start.column ?? 1) + offset),
      endLineNumber: Math.max(1, (end.line ?? start.line ?? 1) + offset),
      endColumn: Math.max(2, (end.column ?? start.column ?? 1) + offset),
    };
  });
}

export function parseDBMLDocument(source) {
  try {
    const layout = new MemoryProjectLayout();
    layout.setSource(DEFAULT_ENTRY, source);
    const compiler = new Compiler(layout);
    const diagnostics = compiler.parse.errors(DEFAULT_ENTRY);
    const warnings = normalizeDiagnostics(compiler.parse.warnings(DEFAULT_ENTRY));
    if (diagnostics.length) return { model: null, errors: normalizeDiagnostics(diagnostics), warnings };
    return { model: normalizeRawDatabase(compiler.parse.rawDb(DEFAULT_ENTRY)), errors: [], warnings };
  } catch (error) {
    return { model: null, errors: normalizeDiagnostics(error?.diags || [error]), warnings: [] };
  }
}
