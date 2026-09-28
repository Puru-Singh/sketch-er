## 2025-02-18 - Tooltips, Disabled States, and Keyboard Shortcuts
**Learning:** Adding explicit keyboard shortcuts to tooltips drastically improves discoverability. We also learned that disabled buttons need customized tooltips to explain *why* they are disabled rather than generic labels. Furthermore, components that wrap buttons need explicit `title` prop forwarding.
**Action:** Always forward the `title` prop to wrapped interactive elements, include shortcut hints in `title` attributes for toolbars, and dynamically compute tooltips for disabled states to explain requirements.
