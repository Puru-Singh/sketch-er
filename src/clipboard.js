export async function copyTextToClipboard(text, environment = {}) {
  const navigatorObject = environment.navigatorObject ?? globalThis.navigator;
  const documentObject = environment.documentObject ?? globalThis.document;
  let clipboardError = null;

  if (navigatorObject?.clipboard?.writeText) {
    try {
      await navigatorObject.clipboard.writeText(text);
      return;
    } catch (error) {
      clipboardError = error;
    }
  }

  if (!documentObject?.body || typeof documentObject.execCommand !== "function") {
    throw clipboardError || new Error("Clipboard access is unavailable.");
  }

  const activeElement = documentObject.activeElement;
  const textarea = documentObject.createElement("textarea");
  textarea.value = text;
  textarea.readOnly = true;
  textarea.style.position = "fixed";
  textarea.style.left = "-9999px";
  textarea.style.opacity = "0";
  documentObject.body.appendChild(textarea);

  try {
    textarea.focus();
    textarea.select();
    if (!documentObject.execCommand("copy")) {
      throw clipboardError || new Error("The browser rejected the copy request.");
    }
  } finally {
    textarea.remove();
    activeElement?.focus?.();
  }
}
