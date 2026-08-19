const EPSILON = 0.001;

function between(value, start, end) {
  return value > Math.min(start, end) + EPSILON && value < Math.max(start, end) - EPSILON;
}

function segmentHitsObstacle(start, end, obstacle) {
  if (Math.abs(start.y - end.y) < EPSILON) {
    return between(start.y, obstacle.top, obstacle.bottom)
      && Math.max(start.x, end.x) > obstacle.left + EPSILON
      && Math.min(start.x, end.x) < obstacle.right - EPSILON;
  }
  if (Math.abs(start.x - end.x) < EPSILON) {
    return between(start.x, obstacle.left, obstacle.right)
      && Math.max(start.y, end.y) > obstacle.top + EPSILON
      && Math.min(start.y, end.y) < obstacle.bottom - EPSILON;
  }
  return true;
}

function compactPoints(points) {
  const compacted = [];
  for (const point of points) {
    const previous = compacted[compacted.length - 1];
    if (previous && previous.x === point.x && previous.y === point.y) continue;
    const beforePrevious = compacted[compacted.length - 2];
    if (beforePrevious && previous
      && ((beforePrevious.x === previous.x && previous.x === point.x)
        || (beforePrevious.y === previous.y && previous.y === point.y))) {
      compacted[compacted.length - 1] = point;
    } else {
      compacted.push(point);
    }
  }
  return compacted;
}

function pathIsClear(points, obstacles) {
  for (let index = 1; index < points.length; index += 1) {
    if (obstacles.some((obstacle) => segmentHitsObstacle(points[index - 1], points[index], obstacle))) {
      return false;
    }
  }
  return true;
}

function pathLength(points) {
  let length = 0;
  for (let index = 1; index < points.length; index += 1) {
    length += Math.abs(points[index].x - points[index - 1].x)
      + Math.abs(points[index].y - points[index - 1].y);
  }
  return length;
}

function uniqueNumbers(values) {
  return [...new Set(values.map((value) => Math.round(value * 1000) / 1000))];
}

function isOnExitSide(candidateX, portX, direction) {
  return direction > 0 ? candidateX >= portX : candidateX <= portX;
}

export function routeOrthogonalConnection({
  start,
  end,
  preferredMidX,
  startDirection,
  endDirection,
  obstacles,
  manualMidX,
  lane = 0,
}) {
  if (Number.isFinite(manualMidX)) {
    return compactPoints([
      start,
      { x: manualMidX, y: start.y },
      { x: manualMidX, y: end.y },
      end,
    ]);
  }

  const obstacleXs = obstacles.flatMap((obstacle) => [obstacle.left, obstacle.right]);
  const candidateXs = uniqueNumbers([
    preferredMidX,
    start.x,
    end.x,
    ...obstacleXs,
    Math.min(start.x, end.x, ...obstacleXs) - 28 - Math.abs(lane) * 8,
    Math.max(start.x, end.x, ...obstacleXs) + 28 + Math.abs(lane) * 8,
  ]);

  // Prefer the familiar three-segment route whenever a clear corridor exists.
  const directCandidates = candidateXs
    .filter((x) => isOnExitSide(x, start.x, startDirection) && isOnExitSide(x, end.x, endDirection))
    .map((x) => compactPoints([start, { x, y: start.y }, { x, y: end.y }, end]))
    .filter((points) => pathIsClear(points, obstacles))
    .sort((a, b) => {
      const aMid = a.find((point, index) => index && point.x === a[index - 1].x)?.x ?? preferredMidX;
      const bMid = b.find((point, index) => index && point.x === b[index - 1].x)?.x ?? preferredMidX;
      return pathLength(a) + Math.abs(aMid - preferredMidX) * 0.2
        - pathLength(b) - Math.abs(bMid - preferredMidX) * 0.2;
    });
  if (directCandidates.length) return directCandidates[0];

  // A horizontal segment is blocked. Find clear departure/arrival corridors,
  // then cross above, below, or between the obstructing tables.
  const obstacleYs = obstacles.flatMap((obstacle) => [obstacle.top, obstacle.bottom]);
  const candidateYs = uniqueNumbers([
    ...obstacleYs,
    Math.min(start.y, end.y, ...obstacleYs) - 28 - Math.abs(lane) * 8,
    Math.max(start.y, end.y, ...obstacleYs) + 28 + Math.abs(lane) * 8,
  ]).sort((a, b) =>
    Math.abs(a - start.y) + Math.abs(a - end.y)
    - Math.abs(b - start.y) - Math.abs(b - end.y));

  const departureXs = candidateXs
    .filter((x) => isOnExitSide(x, start.x, startDirection))
    .sort((a, b) => Math.abs(a - start.x) - Math.abs(b - start.x));
  const arrivalXs = candidateXs
    .filter((x) => isOnExitSide(x, end.x, endDirection))
    .sort((a, b) => Math.abs(a - end.x) - Math.abs(b - end.x));

  let bestRoute = null;
  let bestScore = Infinity;
  for (const detourY of candidateYs) {
    const departures = departureXs.filter((x) => pathIsClear(compactPoints([
      start, { x, y: start.y }, { x, y: detourY },
    ]), obstacles)).slice(0, 12);
    const arrivals = arrivalXs.filter((x) => pathIsClear(compactPoints([
      { x, y: detourY }, { x, y: end.y }, end,
    ]), obstacles)).slice(0, 12);

    for (const departureX of departures) {
      for (const arrivalX of arrivals) {
        const route = compactPoints([
          start,
          { x: departureX, y: start.y },
          { x: departureX, y: detourY },
          { x: arrivalX, y: detourY },
          { x: arrivalX, y: end.y },
          end,
        ]);
        if (!pathIsClear(route, obstacles)) continue;
        const score = pathLength(route) + route.length * 3;
        if (score < bestScore) {
          bestRoute = route;
          bestScore = score;
        }
      }
    }
  }

  // Auto-arranged tables never overlap, so a route should always be found.
  // Preserve the previous renderer as a deterministic fallback for malformed
  // imported positions that already contain overlapping tables.
  return bestRoute || compactPoints([
    start,
    { x: preferredMidX, y: start.y },
    { x: preferredMidX, y: end.y },
    end,
  ]);
}

export function orthogonalPointsToPath(points) {
  if (!points.length) return "";
  const commands = [`M ${points[0].x} ${points[0].y}`];
  for (let index = 1; index < points.length; index += 1) {
    const previous = points[index - 1];
    const point = points[index];
    commands.push(previous.y === point.y ? `H ${point.x}` : `V ${point.y}`);
  }
  return commands.join(" ");
}

export function longestVerticalSegment(points) {
  let longest = null;
  for (let index = 1; index < points.length; index += 1) {
    const start = points[index - 1];
    const end = points[index];
    if (start.x !== end.x) continue;
    const length = Math.abs(end.y - start.y);
    if (length > 4 && (!longest || length > longest.length)) {
      longest = {
        x: start.x,
        minY: Math.min(start.y, end.y),
        maxY: Math.max(start.y, end.y),
        length,
      };
    }
  }
  return longest;
}
