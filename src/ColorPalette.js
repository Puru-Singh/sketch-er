import { createElement } from "react";

export default function ColorPalette({ colors, selected, onChoose, label }) {
  const selectedIndex = colors.indexOf(selected);
  const tabStop = selectedIndex < 0 ? 0 : selectedIndex;

  return createElement(
    "div",
    { className: "sker-color-row", role: "radiogroup", "aria-label": label },
    colors.map((color, index) =>
      createElement("button", {
        key: color,
        type: "button",
        role: "radio",
        tabIndex: index === tabStop ? 0 : -1,
        className: `sker-color-dot ${selected === color ? "is-selected" : ""}`,
        style: { background: color },
        "aria-label": `Apply color ${color}`,
        "aria-checked": selected === color,
        title: color,
        onClick: () => onChoose(color),
        onKeyDown: (event) => {
          const direction = {
            ArrowRight: 1,
            ArrowDown: 1,
            ArrowLeft: -1,
            ArrowUp: -1,
          }[event.key];
          if (!direction) return;

          event.preventDefault();
          const nextIndex = (index + direction + colors.length) % colors.length;
          onChoose(colors[nextIndex]);
          event.currentTarget.parentElement.children[nextIndex]?.focus();
        },
      }),
    ),
  );
}
