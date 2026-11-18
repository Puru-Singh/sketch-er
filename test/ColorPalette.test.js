import test from "node:test";
import assert from "node:assert/strict";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import ColorPalette from "../src/ColorPalette.js";

const colors = ["#ff0000", "#00ff00", "#0000ff"];

function palette(selected) {
  const choices = [];
  const element = ColorPalette({ colors, selected, label: "Table colors", onChoose: color => choices.push(color) });
  return { buttons: element.props.children, choices };
}

function keyEvent(key) {
  let focused = null;
  let prevented = false;
  return {
    event: {
      key,
      preventDefault() { prevented = true; },
      currentTarget: {
        parentElement: { children: colors.map((_, index) => ({ focus() { focused = index; } })) },
      },
    },
    get focused() { return focused; },
    get prevented() { return prevented; },
  };
}

test("renders a named radio group with one selected radio and one tab stop", () => {
  const markup = renderToStaticMarkup(createElement(ColorPalette, {
    colors, selected: colors[1], onChoose() {}, label: "Table colors",
  }));
  assert.match(markup, /role="radiogroup" aria-label="Table colors"/);
  assert.equal((markup.match(/role="radio"/g) || []).length, 3);
  assert.equal((markup.match(/aria-checked="true"/g) || []).length, 1);
  assert.equal((markup.match(/tabindex="0"/g) || []).length, 1);
  const { buttons } = palette(colors[1]);
  assert.deepEqual(buttons.map(b => b.props.tabIndex), [-1, 0, -1]);
  assert.deepEqual(buttons.map(b => b.props["aria-checked"]), [false, true, false]);
});

test("custom or absent selection starts on the first preset without changing the color", () => {
  for (const selected of ["#ffffff", undefined]) {
    const { buttons, choices } = palette(selected);
    assert.deepEqual(buttons.map(b => b.props.tabIndex), [0, -1, -1]);
    assert.ok(buttons.every(b => b.props["aria-checked"] === false));
    assert.deepEqual(choices, []);
    const interaction = keyEvent("ArrowRight");
    buttons[0].props.onKeyDown(interaction.event);
    assert.deepEqual(choices, [colors[1]]);
    assert.equal(interaction.focused, 1);
  }
});

test("all arrow keys select, move focus, and wrap at the ends", () => {
  for (const [key, from, to] of [
    ["ArrowRight", 1, 2], ["ArrowDown", 2, 0],
    ["ArrowLeft", 0, 2], ["ArrowUp", 1, 0],
  ]) {
    const { buttons, choices } = palette(colors[from]);
    const interaction = keyEvent(key);
    buttons[from].props.onKeyDown(interaction.event);
    assert.deepEqual(choices, [colors[to]]);
    assert.equal(interaction.focused, to);
    assert.equal(interaction.prevented, true);
    const updated = palette(choices[0]);
    assert.equal(updated.buttons[to].props.tabIndex, 0);
    assert.equal(updated.buttons.filter(b => b.props.tabIndex === 0).length, 1);
  }
});

test("Tab remains available for leaving the group and clicking selects a color", () => {
  const { buttons, choices } = palette(colors[1]);
  const interaction = keyEvent("Tab");
  buttons[1].props.onKeyDown(interaction.event);
  assert.equal(interaction.prevented, false);
  assert.equal(interaction.focused, null);
  assert.deepEqual(choices, []);
  buttons[2].props.onClick();
  assert.deepEqual(choices, [colors[2]]);
});

test("empty palettes render without a selectable tab stop", () => {
  const element = ColorPalette({ colors: [], selected: undefined, onChoose() {}, label: "Colors" });
  assert.deepEqual(element.props.children, []);
});
