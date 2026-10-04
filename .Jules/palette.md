## 2025-02-23 - Discoverable Keyboard Shortcuts
**Learning:** Keyboard users often miss available shortcuts if they are only listed in hidden help dialogs or disconnected documentation. However, putting them blindly into `aria-label`s creates noisy readouts for screen reader users.
**Action:** Use `aria-keyshortcuts` to expose shortcuts semantically to assistive technologies, and append the shortcut explicitly in the visual `title` attribute for visual hover discovery.
## 2025-02-14 - Semantic ARIA Switch
**Learning:** Using `role="switch"` and `aria-checked` on checkbox inputs provides significantly better context for screen reader users than a standard checkbox, especially for UI toggles.
**Action:** Use `role="switch"` for settings toggles instead of relying solely on checkbox semantics.
