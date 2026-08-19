import test from "node:test";
import assert from "node:assert/strict";
import {
  buildHierarchicalLayout,
  buildSmartLayout,
  HIERARCHY_ROOTS_LEFT,
} from "../src/autoLayout.js";

const table = (name, columns) => ({
  name,
  columns: columns.map(([columnName, isPk = false]) => ({ name: columnName, isPk, isUnique: false })),
  indexes: [], checks: [], records: [], note: null,
});

const tables = [
  table("leaf_a", [["id", true], ["branch_id"]]),
  table("leaf_b", [["id", true], ["branch_id"]]),
  table("branch", [["id", true], ["root_id"]]),
  table("root", [["id", true]]),
];

const relation = (child, childColumn, parent, parentColumn = "id") => ({
  from: { table: child, column: childColumn, cardinality: "*" },
  to: { table: parent, column: parentColumn, cardinality: "1" },
});

const refs = [
  relation("leaf_a", "branch_id", "branch"),
  relation("leaf_b", "branch_id", "branch"),
  relation("branch", "root_id", "root"),
];

const tableWidths = Object.fromEntries(tables.map(({ name }) => [name, 230]));

test("strict hierarchy places leaves before their lineage roots by default", () => {
  const positions = buildHierarchicalLayout({ tables, refs, tableWidths });
  assert.equal(positions.leaf_a.x, positions.leaf_b.x);
  assert.ok(positions.leaf_a.x < positions.branch.x);
  assert.ok(positions.branch.x < positions.root.x);
});

test("strict hierarchy can swap roots and leaves", () => {
  const positions = buildHierarchicalLayout({
    tables,
    refs,
    tableWidths,
    direction: HIERARCHY_ROOTS_LEFT,
  });
  assert.ok(positions.root.x < positions.branch.x);
  assert.ok(positions.branch.x < positions.leaf_a.x);
});

test("strict hierarchy condenses relationship cycles without losing tables", () => {
  const cyclicRefs = [...refs, relation("root", "id", "leaf_a", "id")];
  const positions = buildHierarchicalLayout({ tables, refs: cyclicRefs, tableWidths });
  assert.deepEqual(Object.keys(positions).sort(), tables.map(({ name }) => name).sort());
  Object.values(positions).forEach(({ x, y }) => {
    assert.ok(Number.isFinite(x));
    assert.ok(Number.isFinite(y));
  });
});

test("smart layout returns positions for grouped and ungrouped tables", async () => {
  const positions = await buildSmartLayout({
    tables,
    refs,
    groups: [{ name: "leaves", tables: ["leaf_a", "leaf_b"] }],
    tableWidths,
  });
  assert.deepEqual(Object.keys(positions).sort(), tables.map(({ name }) => name).sort());
  Object.values(positions).forEach(({ x, y }) => {
    assert.ok(Number.isFinite(x));
    assert.ok(Number.isFinite(y));
  });
});
