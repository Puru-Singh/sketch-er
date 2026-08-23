import test from "node:test";
import assert from "node:assert/strict";
import { generateShareQrDataUrl, SHARE_QR_TOO_LARGE } from "../src/shareQr.js";

test("QR generation returns a locally encoded PNG data URL", async () => {
  const result = await generateShareQrDataUrl("https://example.test/#share=abc123");
  assert.equal(result.error, null);
  assert.match(result.dataUrl, /^data:image\/png;base64,/);
});

test("QR generation reports oversized share URLs without truncating them", async () => {
  const result = await generateShareQrDataUrl(`https://example.test/#share=${"x".repeat(5000)}`);
  assert.equal(result.dataUrl, null);
  assert.equal(result.error, SHARE_QR_TOO_LARGE);
});
