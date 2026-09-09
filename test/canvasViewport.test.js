import test from "node:test";
import assert from "node:assert/strict";
import {
  clampCanvasZoom,
  zoomCanvasAroundPoint,
} from "../src/canvasViewport.js";

test("clamps canvas zoom to the supported scale range", () => {
  assert.equal(clampCanvasZoom(0.1), 0.25);
  assert.equal(clampCanvasZoom(1.25), 1.25);
  assert.equal(clampCanvasZoom(3), 2);
});

test("keeps the focused canvas point stationary while scaling", () => {
  const viewport = zoomCanvasAroundPoint({
    currentZoom: 1,
    requestedZoom: 1.5,
    offset: { x: 20, y: -10 },
    focalPoint: { x: 300, y: 200 },
  });

  assert.deepEqual(viewport, {
    zoom: 1.5,
    offset: { x: -120, y: -115 },
  });

  const worldPointBefore = {
    x: (300 - 20) / 1,
    y: (200 - -10) / 1,
  };
  const worldPointAfter = {
    x: (300 - viewport.offset.x) / viewport.zoom,
    y: (200 - viewport.offset.y) / viewport.zoom,
  };
  assert.deepEqual(worldPointAfter, worldPointBefore);
});
