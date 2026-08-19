import test from "node:test";
import assert from "node:assert/strict";
import { detectTableRenames } from "../src/tableIdentity.js";

const table = (id, name, columns, sourceStartLine = id * 10) => ({
  id,
  name,
  sourceStartLine,
  columns: columns.map(([columnName, type = "int", settings = {}]) => ({
    name: columnName,
    type,
    isPk: false,
    isUnique: false,
    notNull: false,
    increment: false,
    defaultValue: null,
    ...settings,
  })),
});

test("detects a table rename from unchanged structure and source order", () => {
  const previous = [table(1, "users", [["id", "int", { isPk: true }], ["email", "varchar"]])];
  const current = [table(1, "accounts", [["id", "int", { isPk: true }], ["email", "varchar"]])];
  assert.deepEqual([...detectTableRenames(previous, current)], [["users", "accounts"]]);
});

test("matches multiple identical shapes by stable source order", () => {
  const previous = [table(1, "first", [["id"]]), table(2, "second", [["id"]])];
  const current = [table(1, "renamed_first", [["id"]]), table(2, "renamed_second", [["id"]])];
  assert.deepEqual([...detectTableRenames(previous, current)], [
    ["first", "renamed_first"],
    ["second", "renamed_second"],
  ]);
});

test("does not treat a structurally different replacement as a rename", () => {
  const previous = [table(1, "users", [["id"], ["email", "varchar"]])];
  const current = [table(1, "audit_log", [["event_id"], ["payload", "json"]])];
  assert.equal(detectTableRenames(previous, current).size, 0);
});

test("ignores ordinary column edits when the table name is unchanged", () => {
  const previous = [table(1, "users", [["id"]])];
  const current = [table(1, "users", [["id"], ["email", "varchar"]])];
  assert.equal(detectTableRenames(previous, current).size, 0);
});
