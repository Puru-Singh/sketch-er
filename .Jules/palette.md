## 2024-05-18 - Tooltip Hints for Disabled States and Shortcuts
**Learning:** Tooltips should provide specific, actionable explanations for why a button is disabled, rather than simply stating it is disabled. They should also surface hidden keyboard shortcuts to improve power user workflows without cluttering the UI.
**Action:** Always add an explicit `title` prop to `ToolButton` components when dynamically disabling them, explaining exactly what condition must be met to enable it. Add shortcut keys to the `title` text for primary canvas actions.
