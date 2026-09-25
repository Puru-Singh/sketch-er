import test from "node:test";
import assert from "node:assert/strict";
import {
  createGrabCursor,
  createGrabbingCursor,
  createColResizeCursor,
  createMoveCursor,
  getThemeCursorVariables,
  handCursorCss,
} from "../src/cursors.js";

function parseCursorSvg(cursorString) {
  const match = cursorString.match(/url\("data:image\/svg\+xml,([^"]+)"\)\s+([0-9]+)\s+([0-9]+),\s*(\S+)/);
  assert.ok(match, `Cursor string must match CSS cursor format: ${cursorString}`);
  const [, encodedSvg, hotspotX, hotspotY, fallback] = match;
  const decodedSvg = decodeURIComponent(encodedSvg);
  return {
    svg: decodedSvg,
    hotspot: { x: parseInt(hotspotX, 10), y: parseInt(hotspotY, 10) },
    fallback,
  };
}

test("grab cursor produces contrasting, high-visibility SVG with valid dimensions and hotspot", () => {
  const lightCursor = createGrabCursor(false);
  const darkCursor = createGrabCursor(true);

  const lightParsed = parseCursorSvg(lightCursor);
  const darkParsed = parseCursorSvg(darkCursor);

  assert.equal(lightParsed.fallback, "grab");
  assert.equal(darkParsed.fallback, "grab");
  assert.equal(lightParsed.hotspot.x, 11);
  assert.equal(lightParsed.hotspot.y, 6);
  assert.equal(darkParsed.hotspot.x, 11);
  assert.equal(darkParsed.hotspot.y, 6);

  // Both should contain SVG header and dimensions
  assert.ok(lightParsed.svg.includes('width="32"'));
  assert.ok(lightParsed.svg.includes('height="32"'));
  assert.ok(lightParsed.svg.includes('viewBox="0 0 32 32"'));

  // Light mode should have dark perimeter stroke and white fill
  assert.ok(lightParsed.svg.includes('fill="#ffffff"'));
  assert.ok(lightParsed.svg.includes('stroke="#0f172a"'));
  assert.ok(lightParsed.svg.includes("rgba(0,0,0,0.28)"));

  // Dark mode should have pitch-black boundary stroke and white fill
  assert.ok(darkParsed.svg.includes('fill="#ffffff"'));
  assert.ok(darkParsed.svg.includes('stroke="#000000"'));
  assert.ok(darkParsed.svg.includes("rgba(0,0,0,0.5)"));
});

test("grabbing cursor shares the same hotspot as grab to prevent cursor jitter", () => {
  const grab = parseCursorSvg(createGrabCursor(false));
  const grabbing = parseCursorSvg(createGrabbingCursor(false));

  assert.equal(grab.hotspot.x, grabbing.hotspot.x);
  assert.equal(grab.hotspot.y, grabbing.hotspot.y);
  assert.equal(grabbing.fallback, "grabbing");

  assert.ok(grabbing.svg.includes('fill="#ffffff"'));
  assert.ok(grabbing.svg.includes('stroke="#0f172a"'));
});

test("col-resize and move cursors produce centered bidirectional and 4-way indicators", () => {
  const colResize = parseCursorSvg(createColResizeCursor(false));
  const move = parseCursorSvg(createMoveCursor(false));

  assert.equal(colResize.hotspot.x, 16);
  assert.equal(colResize.hotspot.y, 16);
  assert.equal(colResize.fallback, "col-resize");

  assert.equal(move.hotspot.x, 16);
  assert.equal(move.hotspot.y, 16);
  assert.equal(move.fallback, "move");
});

test("getThemeCursorVariables returns complete set of custom cursor variables", () => {
  const varsLight = getThemeCursorVariables(false);
  const varsDark = getThemeCursorVariables(true);

  assert.ok(varsLight["--sker-cursor-grab"]);
  assert.ok(varsLight["--sker-cursor-grabbing"]);
  assert.ok(varsLight["--sker-cursor-col-resize"]);
  assert.ok(varsLight["--sker-cursor-move"]);

  assert.ok(varsDark["--sker-cursor-grab"]);
  assert.ok(varsDark["--sker-cursor-grabbing"]);
  assert.ok(varsDark["--sker-cursor-col-resize"]);
  assert.ok(varsDark["--sker-cursor-move"]);
});

test("handCursorCss backward compatibility adapter handles legacy fill argument", () => {
  const legacyGrabLight = handCursorCss("#000000", true);
  const legacyGrabbingLight = handCursorCss("#000000", false);
  const legacyGrabDark = handCursorCss("#ffffff", true);

  assert.ok(legacyGrabLight.includes("grab"));
  assert.ok(legacyGrabbingLight.includes("grabbing"));
  assert.ok(legacyGrabDark.includes("grab"));

  // Crucially, in light mode it now returns high-contrast white fill with dark stroke,
  // NOT the old solid black blob!
  const parsedLight = parseCursorSvg(legacyGrabLight);
  assert.ok(parsedLight.svg.includes('fill="#ffffff"'));
  assert.ok(parsedLight.svg.includes('stroke="#0f172a"'));
});
