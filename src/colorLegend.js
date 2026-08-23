export const DEFAULT_TABLE_COLOR = "#10b981";

export function normalizeLegendColor(color) {
  return String(color || DEFAULT_TABLE_COLOR).trim().toLowerCase();
}

export function buildColorLegendEntries(tables, tableColors) {
  const byColor = new Map();
  tables.forEach((table) => {
    const color = normalizeLegendColor(tableColors[table.name] || table.headerColor);
    const existing = byColor.get(color);
    if (existing) existing.tables.push(table.name);
    else byColor.set(color, { color, tables: [table.name] });
  });
  return [...byColor.values()];
}
