import test from "node:test";
import assert from "node:assert/strict";
import { buildColorLegendEntries, normalizeLegendColor } from "../src/colorLegend.js";

test("legend groups tables that use the same normalized color", () => {
  const entries = buildColorLegendEntries([
    { name: "users", headerColor: "#EF4444" },
    { name: "roles", headerColor: null },
    { name: "posts", headerColor: null },
  ], {
    users: "#ef4444",
    roles: "#3B82F6",
    posts: "#3b82f6",
  });

  assert.deepEqual(entries, [
    { color: "#ef4444", tables: ["users"] },
    { color: "#3b82f6", tables: ["roles", "posts"] },
  ]);
});

test("legend color normalization supplies the table default", () => {
  assert.equal(normalizeLegendColor(), "#10b981");
  assert.equal(normalizeLegendColor("  #ABCDEF  "), "#abcdef");
});
