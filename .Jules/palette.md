## 2025-02-23 - Discoverable Keyboard Shortcuts
**Learning:** Keyboard users often miss available shortcuts if they are only listed in hidden help dialogs or disconnected documentation. However, putting them blindly into `aria-label`s creates noisy readouts for screen reader users.
**Action:** Use `aria-keyshortcuts` to expose shortcuts semantically to assistive technologies, and append the shortcut explicitly in the visual `title` attribute for visual hover discovery.
## 2025-02-14 - Semantic ARIA Switch
**Learning:** Using `role="switch"` and `aria-checked` on checkbox inputs provides significantly better context for screen reader users than a standard checkbox, especially for UI toggles.
**Action:** Use `role="switch"` for settings toggles instead of relying solely on checkbox semantics.
## 2025-02-28 - Missing ARIA Semantics on Custom Components
**Learning:** Custom interactive components like `ToggleSwitch`, `ColorPalette`, and typeahead suggestions (`ColumnEditor`'s `role="listbox"`) in this codebase often lack necessary specific ARIA attributes (`role="switch"`, `aria-pressed`, `role="option"`, `aria-selected`). This results in screen readers failing to announce the components' true state or role.
**Action:** When working on custom interactive elements (buttons acting as toggles, checkbox acting as a switch, or custom dropdown options), always evaluate if specific ARIA attributes like `role` or `aria-selected`/`aria-pressed` are required to convey their exact purpose and state.
## 2024-05-18 - Tooltip Hints for Disabled States and Shortcuts
**Learning:** Tooltips should provide specific, actionable explanations for why a button is disabled, rather than simply stating it is disabled. They should also surface hidden keyboard shortcuts to improve power user workflows without cluttering the UI.
**Action:** Always add an explicit `title` prop to `ToolButton` components when dynamically disabling them, explaining exactly what condition must be met to enable it. Add shortcut keys to the `title` text for primary canvas actions.
## 2025-10-02 - Added Empty State Helpful Guidance
**Learning:** Empty states with actionable, helpful instructions and a clear visual cue make the initial "blank slate" experience much friendlier and less daunting.
**Action:** Enhance bare-bones empty states across apps by adding an icon (like ✨ or ⚠️), a clear headline, and a small example or hint of what to do next.
## 2024-05-24 - Disabled State Clarity
**Learning:** Form action buttons like 'Create group' and 'Apply changes' are sometimes disabled for complex reasons (e.g. pending parsing, structural dependencies). Without a tooltip explaining why the button is disabled, users can be confused as to why they are unable to proceed.
**Action:** Adding a simple, conditional `title` attribute to disabled buttons is an effective, accessible way to communicate state blockages without requiring dedicated error UI or intrusive tooltips.
## 2025-10-25 - Use aria-disabled instead of disabled for interactive elements
**Learning:** Using the native `disabled` attribute removes an element from the document's tab order, hiding it completely from keyboard-only and screen reader users navigating sequentially. This makes it impossible for them to discover disabled actions.
**Action:** Use `aria-disabled="true"` on buttons and interactive elements, guard click/keydown handlers manually (`e.preventDefault(); e.stopPropagation()`), and ensure CSS styles both states identically to keep the element focusable but inoperable.
## 2025-03-09 - Auto-closing Menu Action Feedback
**Learning:** Background actions (like copying text) that are triggered from auto-closing menus (like popovers or dropdowns) leave the user with no visual feedback because the UI element they interacted with disappears immediately. Furthermore, setting a static `aria-label` completely overrides the element's inner text for screen readers, potentially hiding important dynamic state (like a filename).
**Action:** Use an independent toast notification or alert when initiating background actions from auto-closing menus. Always include dynamic text (e.g., `${data.fileName}`) in static `aria-label`s if the button relies on the text content to convey state to visual users.
