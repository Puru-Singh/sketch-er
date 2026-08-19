import test from "node:test";
import assert from "node:assert/strict";
import { calculateExportBounds, calculateExportScale } from "../src/diagramExport.js";

test("export bounds include table and group geometry in one coordinate space", () => {
  const bounds = calculateExportBounds([
    { x: 100, y: 90, width: 230, height: 138 },
    { x: 72, y: 36, width: 286, height: 220 },
    { x: 340, y: 130, width: 120, height: 0 },
  ], 40);

  assert.deepEqual(bounds, {
    minX: 32,
    minY: -4,
    maxX: 500,
    maxY: 296,
    width: 468,
    height: 300,
  });
});

test("export bounds ignore invalid browser geometry", () => {
  assert.deepEqual(calculateExportBounds([
    { x: NaN, y: 0, width: 10, height: 10 },
    { x: 10, y: 20, width: 30, height: 40 },
  ], 0), {
    minX: 10,
    minY: 20,
    maxX: 40,
    maxY: 60,
    width: 30,
    height: 40,
  });
});

test("export scale caps oversized diagrams without reducing normal exports", () => {
  assert.equal(calculateExportScale(1000, 800), 2);
  assert.ok(calculateExportScale(10000, 10000) < 1);
  assert.ok(calculateExportScale(30000, 1000) <= 0.4);
  assert.ok(calculateExportScale(2_000_000, 1000) <= 0.006);
});
