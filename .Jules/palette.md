## 2025-02-23 - Discoverable Keyboard Shortcuts
**Learning:** Keyboard users often miss available shortcuts if they are only listed in hidden help dialogs or disconnected documentation. However, putting them blindly into `aria-label`s creates noisy readouts for screen reader users.
**Action:** Use `aria-keyshortcuts` to expose shortcuts semantically to assistive technologies, and append the shortcut explicitly in the visual `title` attribute for visual hover discovery.
## 2025-02-14 - Semantic ARIA Switch
**Learning:** Using `role="switch"` and `aria-checked` on checkbox inputs provides significantly better context for screen reader users than a standard checkbox, especially for UI toggles.
**Action:** Use `role="switch"` for settings toggles instead of relying solely on checkbox semantics.
## 2025-02-28 - Missing ARIA Semantics on Custom Components
**Learning:** Custom interactive components like `ToggleSwitch`, `ColorPalette`, and typeahead suggestions (`ColumnEditor`'s `role="listbox"`) in this codebase often lack necessary specific ARIA attributes (`role="switch"`, `aria-pressed`, `role="option"`, `aria-selected`). This results in screen readers failing to announce the components' true state or role.
**Action:** When working on custom interactive elements (buttons acting as toggles, checkbox acting as a switch, or custom dropdown options), always evaluate if specific ARIA attributes like `role` or `aria-selected`/`aria-pressed` are required to convey their exact purpose and state.
