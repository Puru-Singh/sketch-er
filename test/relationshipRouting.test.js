import test from "node:test";
import assert from "node:assert/strict";
import {
  longestVerticalSegment,
  orthogonalPointsToPath,
  routeOrthogonalConnection,
} from "../src/relationshipRouting.js";

function segmentIntersects(start, end, obstacle) {
  if (start.y === end.y) {
    return start.y > obstacle.top && start.y < obstacle.bottom
      && Math.max(start.x, end.x) > obstacle.left
      && Math.min(start.x, end.x) < obstacle.right;
  }
  return start.x > obstacle.left && start.x < obstacle.right
    && Math.max(start.y, end.y) > obstacle.top
    && Math.min(start.y, end.y) < obstacle.bottom;
}

function assertClear(points, obstacles) {
  for (let index = 1; index < points.length; index += 1) {
    obstacles.forEach((obstacle) => {
      assert.equal(segmentIntersects(points[index - 1], points[index], obstacle), false);
    });
  }
}

const baseRoute = {
  start: { x: 0, y: 20 },
  end: { x: 100, y: 80 },
  preferredMidX: 50,
  startDirection: 1,
  endDirection: -1,
  lane: 0,
};

test("keeps the compact preferred corridor when it is unobstructed", () => {
  const points = routeOrthogonalConnection({ ...baseRoute, obstacles: [] });
  assert.deepEqual(points, [
    { x: 0, y: 20 },
    { x: 50, y: 20 },
    { x: 50, y: 80 },
    { x: 100, y: 80 },
  ]);
  assert.equal(orthogonalPointsToPath(points), "M 0 20 H 50 V 80 H 100");
});

test("moves the vertical corridor around a table obstacle", () => {
  const obstacles = [{ left: 40, top: 30, right: 60, bottom: 70 }];
  const points = routeOrthogonalConnection({ ...baseRoute, obstacles });
  assertClear(points, obstacles);
  assert.notEqual(longestVerticalSegment(points).x, 50);
});

test("adds a multi-bend detour when both horizontal legs are obstructed", () => {
  const obstacles = [
    { left: 20, top: 10, right: 45, bottom: 30 },
    { left: 55, top: 70, right: 85, bottom: 90 },
  ];
  const points = routeOrthogonalConnection({ ...baseRoute, obstacles });
  assertClear(points, obstacles);
  assert.ok(points.some(({ y }) => y !== baseRoute.start.y && y !== baseRoute.end.y));
});

test("manual corridor positions remain authoritative", () => {
  const points = routeOrthogonalConnection({
    ...baseRoute,
    obstacles: [{ left: 40, top: 30, right: 60, bottom: 70 }],
    manualMidX: 50,
  });
  assert.deepEqual(points, [
    { x: 0, y: 20 },
    { x: 50, y: 20 },
    { x: 50, y: 80 },
    { x: 100, y: 80 },
  ]);
});
