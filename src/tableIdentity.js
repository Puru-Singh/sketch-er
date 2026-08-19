function structureSignature(table) {
  return JSON.stringify((table.columns || []).map((column) => ({
    name: column.name,
    type: column.type,
    isPk: Boolean(column.isPk),
    isUnique: Boolean(column.isUnique),
    notNull: Boolean(column.notNull),
    increment: Boolean(column.increment),
    defaultValue: column.defaultValue ?? null,
  })));
}

// A DBML rename is exposed by the parser as one removed name and one added
// name. Match those entries by their unchanged structure, preferring the same
// source-order id so identical table shapes remain deterministic.
export function detectTableRenames(previousTables, currentTables) {
  const previousNames = new Set(previousTables.map((table) => table.name));
  const currentNames = new Set(currentTables.map((table) => table.name));
  const removed = previousTables.filter((table) => !currentNames.has(table.name));
  const added = currentTables.filter((table) => !previousNames.has(table.name));
  const unmatchedAdded = new Set(added);
  const renames = new Map();

  const sortedRemoved = [...removed].sort((a, b) => (a.id ?? 0) - (b.id ?? 0));
  for (const oldTable of sortedRemoved) {
    const signature = structureSignature(oldTable);
    const candidates = [...unmatchedAdded]
      .filter((table) => structureSignature(table) === signature)
      .sort((a, b) => {
        const aSameId = a.id === oldTable.id ? 0 : 1;
        const bSameId = b.id === oldTable.id ? 0 : 1;
        if (aSameId !== bSameId) return aSameId - bSameId;
        const oldLine = oldTable.sourceStartLine ?? oldTable.id ?? 0;
        const aDistance = Math.abs((a.sourceStartLine ?? a.id ?? 0) - oldLine);
        const bDistance = Math.abs((b.sourceStartLine ?? b.id ?? 0) - oldLine);
        return aDistance - bDistance || (a.id ?? 0) - (b.id ?? 0);
      });
    if (!candidates.length) continue;
    const renamedTable = candidates[0];
    unmatchedAdded.delete(renamedTable);
    renames.set(oldTable.name, renamedTable.name);
  }
  return renames;
}
