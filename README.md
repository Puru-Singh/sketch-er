# SketchER

A fast, local-first Entity Relationship Diagram tool. Write DBML in the editor and watch your schema render as a live, interactive canvas — with colored tables, crow's foot relationship lines, table groups, and pixel-perfect PNG export.

**Made by [Puru Singh](https://github.com/Puru-Singh) · MIT License**

---

## Quick Start

```bash
npm install
npm run dev
```

Open [http://localhost:5173](http://localhost:5173).

---

## Features

### DBML Editor
- Official DBML v2 parser with complete single-document syntax support
- Precise Monaco diagnostics with line/column markers; the last valid diagram stays visible while fixing errors
- Schemas, aliases, quoted identifiers and types, enums, indexes, checks, defaults, metadata, records, notes, and table partials
- Displays a stats bar showing table count, relationship count, and total column count
- Auto-saves all state to `localStorage` every 400 ms — nothing is ever lost on refresh
- Resizable editor panel — drag the divider between editor and canvas

### Canvas
- **Pan** — two-finger swipe on a trackpad, or drag any empty area of the canvas
- **Zoom** — pinch on a trackpad, `Ctrl / Cmd + Scroll`, or the `+` / `−` toolbar buttons; gesture zoom stays centered under the pointer
- **Dot grid** background that scales with zoom
- **Minimap** — live overview in the bottom-right; shows viewport position relative to all tables

### Tables
- Tables render with a colored header containing the table name in a left-flush pill
- Each column row shows the column name and type side by side
- **Primary key** columns are marked with a key icon and bold name
- **Foreign key** columns are marked with a link icon and italic name
- Unique, not-null, and auto-increment columns receive compact badges and metadata tooltips
- Schema-qualified names prevent collisions between tables with the same name
- Table width auto-sizes to fit the longest column name or header text — nothing is ever clipped
- Right-click a table to use its recent colors or open the native color picker
- Click a table's **arrow** to collapse it to primary and relationship key columns, or expand it again
- **Drag** any table to reposition it on the canvas

### Selection & Colors
- **Click** a table to select it — reveals a color swatch palette in the editor panel
- **Ctrl / Cmd + Click** to multi-select tables; clicking a swatch applies a harmonious hue family across all selected tables
- Right-click a selected table to create a DBML `TableGroup` from the complete selection
- Click a selected table again to deselect; click empty canvas to clear selection

### Relationship Lines
- Auto-drawn orthogonal lines from inline, short-form, long-form, named, composite, and cross-schema references
- Correct endpoint notation for one-to-one, one-to-many, many-to-one, many-to-many, and optional cardinalities
- Composite references connect each participating column
- Relationship colors, `inactive` styling, names, and update/delete actions are honored
- **Drag the vertical corridor** of any line to reroute it — a grip dot appears on hover
- Lines fan out automatically when multiple connections leave the same table side
- Multiple connections arriving at the same PK column are spread apart so circles don't overlap
- **Hover a table** to highlight all its connections in the table's color, with animated flowing dots; unconnected tables dim to draw focus
- **Multi-select** highlights connections for all selected tables simultaneously

### Highlight Links (bottom bar toggle)
- Toggle **Highlight Links** in the bottom bar to light up every relationship line in its source table's color with animated dots — great for presentations or dense diagrams
- The PNG export respects this setting

### Table Groups
- Define groups in DBML with `TableGroup Name { table1 table2 }`
- Rendered as colored dashed rectangles with a label badge behind the tables
- Toggle visibility with the **Table Groups** switch in the bottom bar
- Multi-select tables, right-click one of them, and enter a name to append a new `TableGroup` block to the DBML
- **Drag a group's label** to move all member tables together
- DBML-defined group colors and notes are honored

### Toolbar (top-right)
| Button | Action |
|---|---|
| ☀ / ☾ | Toggle light / dark theme |
| − | Zoom out |
| `100%` | Click to open zoom slider and presets (50%, 100%, 150%) |
| + | Zoom in |
| ↺ | Reset view to 100% at origin |
| Fit | Fit all tables into the viewport |
| Layout | Choose a group-aware smart layout or a reversible leaf-to-root hierarchy |
| Collapse All / Expand All | Collapse every table to keys or restore every column |
| Save | Download diagram as a `.sker` file |
| Open | Load a previously saved `.sker` file |
| Export | Export the full diagram as a 2× resolution PNG |
| ? | Open the help & reference modal |

### File Management
- **Filename** is displayed in the top-left of the canvas; click it to rename inline
- The filename is used when saving (`.sker`) and exporting (`.png`)
- Filename persists across refreshes via `localStorage`
- Individual table collapse state persists in local storage, share links, and `.sker` files
- `.sker` files are plain JSON — safe to version in git or share with teammates

### PNG Export
- Captures the full diagram as rendered — exact fonts, colors, pill headers, and relationship lines
- UI controls (toolbar, minimap, filename, bottom bar) are excluded from the export
- Respects the current **Highlight Links** state
- Downloads at 2× resolution for sharp display on high-DPI screens

### Auto-fit
- On first page load and after opening a file, the canvas automatically fits all tables into view
- Manual **Fit** button in the toolbar does the same at any time

### Themes
- Light and dark mode, toggled from the toolbar
- Theme preference persists in `localStorage`

---

## DBML Syntax Reference

SketchER uses the official `@dbml/parse` v2 compiler. The full single-document language is accepted, including Project, schemas, aliases, complex types, column settings, checks, indexes, every relationship form/cardinality, enums, TablePartial injection, records, notes, custom metadata, TableGroup settings, DiagramView, comments, and multiline strings.

```
Project commerce {
  database_type: 'PostgreSQL'
  Note: 'Commerce schema'
}

TablePartial timestamps {
  created_at timestamp [not null, default: `now()`]
  updated_at timestamp
}

Enum core.role {
  admin [note: 'Administrator']
  member
}

Table core.users as U [headercolor: #3498DB] {
  ~timestamps
  id       bigint       [pk, increment]
  email    varchar(255) [not null, unique]
  role     core.role    [default: 'member']
  balance  decimal(10,2) [check: `balance >= 0`]

  indexes {
    (email, role) [unique, name: 'users_identity_idx']
  }
}

Table posts {
  id          bigint [pk]
  author_id   bigint [ref: > core.users.id]
  reviewer_id bigint
}

Ref reviewer: posts.reviewer_id >? U.id [delete: set null, inactive]

TableGroup Auth [color: #8b5cf6, note: 'Identity domain'] {
  core.users
  posts
}
```

| Syntax | Meaning |
|---|---|
| `[pk]` | Marks a primary key column |
| `[not null, unique, increment]` | Common column constraints |
| `[default: value]` | Literal, boolean, numeric, or backtick-expression default |
| ``[check: `expression`]`` | Column check constraint |
| `[ref: > table.col]` | Many-to-one FK relationship |
| `[ref: < table.col]` | One-to-many FK relationship |
| `[ref: - table.col]` | One-to-one relationship |
| `[ref: <> table.col]` | Many-to-many relationship |
| `>?`, `?>`, etc. | Optional relationship endpoint |
| `Ref: a.col > b.col` | Standalone reference declaration |
| `Ref: a.(x,y) > b.(x,y)` | Composite reference |
| `Enum schema.name { ... }` | Schema-qualified enum |
| `TablePartial name { ... }` / `~name` | Reusable table definition |
| `TableGroup Name { ... }` | Groups tables visually on the canvas |

The current editor is intentionally a single DBML document. Multi-file module declarations such as `use * from 'schema'` need a project/file workspace and are not resolved in this release.

---

## Keyboard & Mouse Controls

| Action | How |
|---|---|
| Pan canvas | Two-finger swipe or drag empty area |
| Zoom | Trackpad pinch or `Ctrl / Cmd + Scroll` |
| Select table | Click table |
| Multi-select | `Ctrl / Cmd + Click` |
| Create table group | Multi-select, then right-click a selected table |
| Drag table | Click and drag table header |
| Reroute a line | Drag the grip dot on the line's vertical segment |
| Rename file | Click filename (top-left of canvas) |
| Confirm rename | `Enter` or click away |
| Cancel rename | `Escape` |

---

## Tech Stack

- **React 18** + **Vite**
- **html2canvas** for PNG export
- **@dbml/parse v2** for the official DBML grammar, semantic validation, and Monaco tokenization
- Zero external UI libraries — all components hand-written
- All state persisted in `localStorage`

---

## License

MIT © 2025 [Puru Singh](https://github.com/Puru-Singh)
