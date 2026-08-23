import test from "node:test";
import assert from "node:assert/strict";
import {
  classifyShareQrError,
  generateShareQrDataUrl,
  SHARE_QR_FAILED,
  SHARE_QR_TOO_LARGE,
} from "../src/shareQr.js";

test("QR generation returns a crisp locally encoded SVG data URL", async () => {
  const result = await generateShareQrDataUrl("https://example.test/#share=abc123");
  assert.equal(result.error, null);
  assert.match(result.dataUrl, /^data:image\/svg\+xml;charset=utf-8,/);
});

test("QR generation reports oversized share URLs without truncating them", async () => {
  const result = await generateShareQrDataUrl(`https://example.test/#share=${"x".repeat(5000)}`);
  assert.equal(result.dataUrl, null);
  assert.equal(result.error, SHARE_QR_TOO_LARGE);
});

test("QR failures unrelated to capacity are not mislabeled as oversized", () => {
  assert.equal(classifyShareQrError(new Error("Canvas rendering failed")), SHARE_QR_FAILED);
  assert.equal(
    classifyShareQrError(new Error("The chosen QR Code version cannot contain this amount of data.")),
    SHARE_QR_TOO_LARGE,
  );
});
