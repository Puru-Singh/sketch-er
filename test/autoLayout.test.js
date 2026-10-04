import test from "node:test";
import assert from "node:assert/strict";
import {
  buildHierarchicalLayout,
  buildSmartLayout,
  inferLineage,
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

test("inferLineage identifies parent and child based on primary key scoring", () => {
  const tableMap = new Map([
    ["users", { name: "users", columns: [{ name: "id", isPk: true, isUnique: false }] }],
    ["posts", { name: "posts", columns: [{ name: "user_id", isPk: false, isUnique: false }] }],
  ]);

  const ref = {
    from: { table: "posts", column: "user_id", cardinality: "*" },
    to: { table: "users", column: "id", cardinality: "1" },
  };

  const lineage = inferLineage(ref, tableMap);
  assert.deepEqual(lineage, { child: "posts", parent: "users" });
});

test("inferLineage handles unique column constraints and cardinality differences", () => {
  const tableMap = new Map([
    ["profiles", { name: "profiles", columns: [{ name: "profile_code", isPk: false, isUnique: true }] }],
    ["members", { name: "members", columns: [{ name: "profile_code", isPk: false, isUnique: false }] }],
  ]);

  // from: unique column with 1 cardinality, to: non-unique column with * cardinality
  const ref = {
    from: { table: "profiles", column: "profile_code", cardinality: "1" },
    to: { table: "members", column: "profile_code", cardinality: "*" },
  };

  const lineage = inferLineage(ref, tableMap);
  assert.deepEqual(lineage, { child: "members", parent: "profiles" });
});

test("inferLineage applies column name heuristics ('id' vs '*_id')", () => {
  const tableMap = new Map([
    ["orders", { name: "orders", columns: [{ name: "id", isPk: false, isUnique: false }] }],
    ["items", { name: "items", columns: [{ name: "order_id", isPk: false, isUnique: false }] }],
  ]);

  const ref = {
    from: { table: "items", column: "order_id" },
    to: { table: "orders", column: "id" },
  };

  const lineage = inferLineage(ref, tableMap);
  assert.deepEqual(lineage, { child: "items", parent: "orders" });
});

test("inferLineage falls back deterministically when endpoint scores are equal", () => {
  const tableMap = new Map([
    ["table_a", { name: "table_a", columns: [{ name: "code", isPk: false, isUnique: false }] }],
    ["table_b", { name: "table_b", columns: [{ name: "code", isPk: false, isUnique: false }] }],
  ]);

  const ref = {
    from: { table: "table_a", column: "code" },
    to: { table: "table_b", column: "code" },
  };

  // When scores are equal, fromScore > toScore is false, so 'from' becomes child and 'to' becomes parent
  const lineage = inferLineage(ref, tableMap);
  assert.deepEqual(lineage, { child: "table_a", parent: "table_b" });
});

test("inferLineage safely handles missing tables or columns", () => {
  const tableMap = new Map(); // empty table map

  const ref = {
    from: { table: "unknown_child", column: "parent_id", cardinality: "0..*" },
    to: { table: "unknown_parent", column: "id", cardinality: "0..1" },
  };

  const lineage = inferLineage(ref, tableMap);
  assert.deepEqual(lineage, { child: "unknown_child", parent: "unknown_parent" });
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
