## 2024-05-24 - Disabled State Clarity
**Learning:** Form action buttons like 'Create group' and 'Apply changes' are sometimes disabled for complex reasons (e.g. pending parsing, structural dependencies). Without a tooltip explaining why the button is disabled, users can be confused as to why they are unable to proceed.
**Action:** Adding a simple, conditional `title` attribute to disabled buttons is an effective, accessible way to communicate state blockages without requiring dedicated error UI or intrusive tooltips.
