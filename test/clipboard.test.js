import test from "node:test";
import assert from "node:assert/strict";

import { copyTextToClipboard } from "../src/clipboard.js";

test("uses the Clipboard API when it is available", async () => {
  let copiedText = null;
  await copyTextToClipboard("share-url", {
    navigatorObject: {
      clipboard: {
        writeText: async (text) => { copiedText = text; },
      },
    },
    documentObject: null,
  });

  assert.equal(copiedText, "share-url");
});

test("falls back to a temporary textarea when clipboard permission is denied", async () => {
  let textarea = null;
  let restoredFocus = false;
  let fallbackCommand = null;
  const documentObject = {
    activeElement: { focus: () => { restoredFocus = true; } },
    body: { appendChild: (element) => { textarea = element; } },
    createElement: () => ({
      style: {},
      focus() {},
      select() { this.wasSelected = true; },
      remove() { this.wasRemoved = true; },
    }),
    execCommand: (command) => {
      fallbackCommand = command;
      return true;
    },
  };

  await copyTextToClipboard("fallback-url", {
    navigatorObject: {
      clipboard: { writeText: async () => { throw new Error("denied"); } },
    },
    documentObject,
  });

  assert.equal(textarea.value, "fallback-url");
  assert.equal(textarea.readOnly, true);
  assert.equal(textarea.wasSelected, true);
  assert.equal(textarea.wasRemoved, true);
  assert.equal(fallbackCommand, "copy");
  assert.equal(restoredFocus, true);
});

test("reports copy failure when neither clipboard path is usable", async () => {
  await assert.rejects(
    copyTextToClipboard("share-url", {
      navigatorObject: {},
      documentObject: {},
    }),
    /Clipboard access is unavailable/,
  );
});

test("clipboard fallback cleanup cannot turn a successful copy into a failure", async () => {
  let removed = false;
  const textarea = {
    style: {},
    focus() {},
    select() {},
    setSelectionRange() {},
    remove() { removed = true; },
  };

  await copyTextToClipboard("share-url", {
    navigatorObject: {},
    documentObject: {
      activeElement: { focus: () => { throw new Error("detached"); } },
      body: { appendChild() {} },
      createElement: () => textarea,
      execCommand: () => true,
    },
  });

  assert.equal(removed, true);
});

test("clipboard fallback removes its textarea after a rejected copy", async () => {
  let removed = false;
  const textarea = {
    style: {},
    focus() {},
    select() {},
    remove() { removed = true; },
  };

  await assert.rejects(copyTextToClipboard("share-url", {
    navigatorObject: {},
    documentObject: {
      body: { appendChild() {} },
      createElement: () => textarea,
      execCommand: () => false,
    },
  }), /browser rejected/);

  assert.equal(removed, true);
});
