export const DEFAULT_TABLE_COLOR = "#10b981";

export function normalizeLegendColor(color) {
  return String(color || DEFAULT_TABLE_COLOR).trim().toLowerCase();
}

export function buildColorLegendEntries(tables, tableColors) {
  const colors = new Set();
  tables.forEach((table) => {
    const color = normalizeLegendColor(tableColors[table.name] || table.headerColor);
    colors.add(color);
  });
  return [...colors].map((color) => ({ color }));
}
