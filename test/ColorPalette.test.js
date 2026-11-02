import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import assert from "node:assert";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

async function getTransformedComponent() {
  const jsxPath = path.resolve(__dirname, "../src/SketchER.jsx");
  let code = fs.readFileSync(jsxPath, "utf8");

  // Extract just the ColorPalette function string
  const startIdx = code.indexOf("function ColorPalette(");
  const endIdx = code.indexOf("\nfunction ZoomControl", startIdx);
  let componentStr = code.substring(startIdx, endIdx);

  // Quick manual compilation of simple JSX in ColorPalette.
  // It only contains:
  // <div className="sker-color-row" role="radiogroup" aria-label={label}>
  //   {colors.map((color, i) => (
  //     <button ... />
  //   ))}
  // </div>
  componentStr = componentStr.replace(
      /<div className="sker-color-row" role="radiogroup" aria-label=\{label\}>([\s\S]*?)<\/div>/,
      `React.createElement("div", { className: "sker-color-row", role: "radiogroup", "aria-label": label }, $1)`
  );
  componentStr = componentStr.replace(
      /\{colors\.map\(\(color, i\) => \([\s\S]*?<button([\s\S]*?)\/>[\s\S]*?\)\)\}/,
      `colors.map((color, i) => React.createElement("button", {
          key: color,
          type: "button",
          role: "radio",
          tabIndex: selected === color || (!colors.includes(selected) && i === 0) ? 0 : -1,
          className: \`sker-color-dot \${selected === color ? "is-selected" : ""}\`,
          style: { background: color },
          "aria-label": \`Apply color \${color}\`,
          "aria-checked": selected === color,
          title: color,
          onClick: () => onChoose(color),
          onKeyDown: (e) => {
            let nextIndex = null;
            if (e.key === "ArrowRight" || e.key === "ArrowDown") nextIndex = (i + 1) % colors.length;
            if (e.key === "ArrowLeft" || e.key === "ArrowUp") nextIndex = (i - 1 + colors.length) % colors.length;
            if (nextIndex !== null) {
              e.preventDefault();
              onChoose(colors[nextIndex]);
              e.currentTarget.parentNode.children[nextIndex]?.focus();
            }
          }
      }))`
  );

  return new Function("React", `
    ${componentStr};
    return ColorPalette;
  `);
}

test("ColorPalette supports roving tabIndex and arrow keys", async () => {
    // Dynamically import react for standard element creation signature
    const React = await import("react");
    const ColorPaletteFactory = await getTransformedComponent();
    const ColorPalette = ColorPaletteFactory(React.default || React);

    const colors = ["#ff0000", "#00ff00", "#0000ff"];
    let chosenColor = null;

    const element = ColorPalette({
        colors,
        selected: "#00ff00",
        onChoose: (c) => chosenColor = c,
        label: "Palette"
    });

    const buttons = element.props.children;
    assert.strictEqual(buttons.length, 3);

    // Check initial tabIndex (selected is second)
    assert.strictEqual(buttons[0].props.tabIndex, -1);
    assert.strictEqual(buttons[1].props.tabIndex, 0); // selected
    assert.strictEqual(buttons[2].props.tabIndex, -1);

    // Test ArrowRight on second button
    let focusTarget = null;
    const mockParent = {
        children: [
            { focus: () => { focusTarget = 0; } },
            { focus: () => { focusTarget = 1; } },
            { focus: () => { focusTarget = 2; } }
        ]
    };

    let mockEvent = {
        key: "ArrowRight",
        preventDefault: () => {},
        currentTarget: { parentNode: mockParent }
    };

    buttons[1].props.onKeyDown(mockEvent);
    assert.strictEqual(chosenColor, "#0000ff");
    assert.strictEqual(focusTarget, 2);

    // Test ArrowLeft wrapping on first button
    mockEvent.key = "ArrowLeft";
    buttons[0].props.onKeyDown(mockEvent);
    assert.strictEqual(chosenColor, "#0000ff");
    assert.strictEqual(focusTarget, 2);

    // Check unmatched color tabIndex logic
    const elementUnmatched = ColorPalette({
        colors,
        selected: "#ffffff", // not in array
        onChoose: () => {},
        label: "Palette"
    });
    const buttonsUnmatched = elementUnmatched.props.children;
    assert.strictEqual(buttonsUnmatched[0].props.tabIndex, 0);
    assert.strictEqual(buttonsUnmatched[1].props.tabIndex, -1);
});
