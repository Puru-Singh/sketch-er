import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export async function loadMainModule(mockDocument, mockReactDOM) {
  const mainJsxPath = path.resolve(__dirname, "../src/main.jsx");
  let code = fs.readFileSync(mainJsxPath, "utf8");

  // Transform JSX <React.StrictMode>\n <SketchER />\n</React.StrictMode> to React.createElement(...)
  code = code.replace(
    /<React\.StrictMode>[\s\S]*?<\/React\.StrictMode>/,
    "React.createElement(React.StrictMode, null, React.createElement(SketchER))",
  );

  // Replace import statements with global/mock variable declarations
  code = code.replace(/import\s+React\s+from\s+['"]react['"];?/, "const React = globalThis.__TEST_REACT__;");
  code = code.replace(/import\s+ReactDOM\s+from\s+['"]react-dom\/client['"];?/, "const ReactDOM = globalThis.__TEST_REACT_DOM__;");
  code = code.replace(/import\s+SketchER\s+from\s+['"]\.\/SketchER\.jsx['"];?/, "const SketchER = () => null;");

  // Save current globals
  const prevDocument = globalThis.document;
  const prevReact = globalThis.__TEST_REACT__;
  const prevReactDOM = globalThis.__TEST_REACT_DOM__;

  globalThis.document = mockDocument;

  // Import React dynamically for component references
  const React = await import("react");
  globalThis.__TEST_REACT__ = React.default || React;
  globalThis.__TEST_REACT_DOM__ = mockReactDOM;

  try {
    const dataUrl = `data:text/javascript;base64,${Buffer.from(code).toString("base64")}#${Date.now()}-${Math.random()}`;
    await import(dataUrl);
  } finally {
    globalThis.document = prevDocument;
    globalThis.__TEST_REACT__ = prevReact;
    globalThis.__TEST_REACT_DOM__ = prevReactDOM;
  }
}
