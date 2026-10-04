import test from "node:test";
import assert from "node:assert/strict";
import { calculateExportBounds, calculateExportScale, placeRightSideExportNode, downloadPng } from "../src/diagramExport.js";

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

test("downloadPng creates anchor, sets default download name, clicks, removes link, and revokes object URL after timeout", (t) => {
  const originalDocument = globalThis.document;
  const originalCreateObjectURL = URL.createObjectURL;
  const originalRevokeObjectURL = URL.revokeObjectURL;

  let createdUrl = null;
  let revokedUrl = null;
  let appendedChild = null;
  let clicked = false;
  let removed = false;
  const dummyBlob = { size: 100, type: "image/png" };

  const mockLink = {
    download: "",
    href: "",
    click() {
      clicked = true;
    },
    remove() {
      removed = true;
    },
  };

  const mockDocument = {
    body: {
      appendChild(child) {
        appendedChild = child;
      },
    },
    createElement(tagName) {
      assert.equal(tagName, "a");
      return mockLink;
    },
  };

  t.after(() => {
    globalThis.document = originalDocument;
    URL.createObjectURL = originalCreateObjectURL;
    URL.revokeObjectURL = originalRevokeObjectURL;
  });

  globalThis.document = mockDocument;
  URL.createObjectURL = (blob) => {
    assert.equal(blob, dummyBlob);
    createdUrl = "blob:http://localhost/test-uuid";
    return createdUrl;
  };
  URL.revokeObjectURL = (url) => {
    revokedUrl = url;
  };

  t.mock.timers.enable({ apis: ["setTimeout"] });

  downloadPng(dummyBlob);

  assert.equal(mockLink.download, "diagram.png");
  assert.equal(mockLink.href, createdUrl);
  assert.equal(appendedChild, mockLink);
  assert.equal(clicked, true);
  assert.equal(removed, true);

  assert.equal(revokedUrl, null);

  t.mock.timers.tick(1000);

  assert.equal(revokedUrl, createdUrl);
});

test("downloadPng uses custom file name when provided", (t) => {
  const originalDocument = globalThis.document;
  const originalCreateObjectURL = URL.createObjectURL;
  const originalRevokeObjectURL = URL.revokeObjectURL;

  const mockLink = {
    download: "",
    href: "",
    click() {},
    remove() {},
  };

  t.after(() => {
    globalThis.document = originalDocument;
    URL.createObjectURL = originalCreateObjectURL;
    URL.revokeObjectURL = originalRevokeObjectURL;
  });

  globalThis.document = {
    body: { appendChild() {} },
    createElement: () => mockLink,
  };
  URL.createObjectURL = () => "blob:http://localhost/test-custom";
  URL.revokeObjectURL = () => {};

  t.mock.timers.enable({ apis: ["setTimeout"] });

  downloadPng({}, "my-custom-diagram");

  assert.equal(mockLink.download, "my-custom-diagram.png");
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

test("a visible legend expands export bounds to the right", () => {
  const diagramBounds = calculateExportBounds([
    { x: 100, y: 100, width: 200, height: 100 },
  ], 40);
  const placement = placeRightSideExportNode(diagramBounds, { width: 280, height: 240 });

  assert.equal(placement.x, 340);
  assert.equal(placement.y, 80);
  assert.deepEqual(placement.bounds, {
    minX: 60,
    minY: 60,
    maxX: 660,
    maxY: 360,
    width: 600,
    height: 300,
  });
});
