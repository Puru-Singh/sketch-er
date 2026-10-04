## 2025-02-23 - Discoverable Keyboard Shortcuts
**Learning:** Keyboard users often miss available shortcuts if they are only listed in hidden help dialogs or disconnected documentation. However, putting them blindly into `aria-label`s creates noisy readouts for screen reader users.
**Action:** Use `aria-keyshortcuts` to expose shortcuts semantically to assistive technologies, and append the shortcut explicitly in the visual `title` attribute for visual hover discovery.
