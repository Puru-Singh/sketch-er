import test from "node:test";
import assert from "node:assert/strict";
import { buildShareUrl, decodeShareHash } from "../src/shareLink.js";

test("share URLs round-trip the complete diagram state", () => {
  const state = {
    dbml: "Table café {\n  id int [pk]\n}",
    tablePositions: { café: { x: 12.5, y: -8 } },
    collapsedTables: ["café"],
    colorLegendDescriptions: { "#10b981": "Données principales" },
  };
  const url = buildShareUrl(state, {
    origin: "https://example.test",
    pathname: "/sketch-er/",
  });

  assert.ok(url.startsWith("https://example.test/sketch-er/#share="));
  assert.deepEqual(decodeShareHash(new URL(url).hash), state);
});

test("share decoder rejects unrelated or malformed hashes", () => {
  assert.equal(decodeShareHash("#other=value"), null);
  assert.equal(decodeShareHash("#share=not-valid-compressed-json"), null);
});
