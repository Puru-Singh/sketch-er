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
- Live-parsing DBML editor with line numbers and syntax support
- Displays a stats bar showing table count, relationship count, and total column count
- Auto-saves all state to `localStorage` every 400 ms — nothing is ever lost on refresh
- Resizable editor panel — drag the divider between editor and canvas

### Canvas
- **Pan** — drag any empty area of the canvas
- **Zoom** — `Ctrl + Scroll` or the `+` / `−` toolbar buttons
- **Dot grid** background that scales with zoom
- **Minimap** — live overview in the bottom-right; shows viewport position relative to all tables

### Tables
- Tables render with a colored header containing the table name in a left-flush pill
- Each column row shows the column name and type side by side
- **Primary key** columns are marked with a key icon and bold name
- **Foreign key** columns are marked with a link icon and italic name
- Table width auto-sizes to fit the longest column name or header text — nothing is ever clipped
- Click the **color wheel** icon in a table header to open the native color picker
- **Drag** any table to reposition it on the canvas

### Selection & Colors
- **Click** a table to select it — reveals a color swatch palette in the editor panel
- **Ctrl / Cmd + Click** to multi-select tables; clicking a swatch applies a harmonious hue family across all selected tables
- Click a selected table again to deselect; click empty canvas to clear selection

### Relationship Lines
- Auto-drawn orthogonal (right-angle) lines from `[ref:]` syntax
- **Crow's foot** notation on the many (FK) end; a circle on the one (PK) end
- Cardinality labels (`*` and `0..1`) on each end
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
- **Drag a group's label** to move all member tables together

### Toolbar (top-right)
| Button | Action |
|---|---|
| ☀ / ☾ | Toggle light / dark theme |
| − | Zoom out |
| `100%` | Click to open zoom slider and presets (50%, 100%, 150%) |
| + | Zoom in |
| ↺ | Reset view to 100% at origin |
| Fit | Fit all tables into the viewport |
| Layout | Auto-arrange tables in a grid |
| Save | Download diagram as a `.sker` file |
| Open | Load a previously saved `.sker` file |
| Export | Export the full diagram as a 2× resolution PNG |
| ? | Open the help & reference modal |

### File Management
- **Filename** is displayed in the top-left of the canvas; click it to rename inline
- The filename is used when saving (`.sker`) and exporting (`.png`)
- Filename persists across refreshes via `localStorage`
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

```
Table users {
  id         int      [pk]
  username   varchar
  email      varchar
  created_at datetime
  role_id    int      [ref: > roles.id]
}

Table roles {
  id          int  [pk]
  name        varchar
  description text
}

Table posts {
  id          int  [pk]
  title       varchar
  author_id   int  [ref: > users.id]
  category_id int  [ref: > categories.id]
}

-- Standalone reference syntax
Ref: comments.post_id > posts.id

-- Table groups
TableGroup Auth {
  users
  roles
}
```

| Syntax | Meaning |
|---|---|
| `[pk]` | Marks a primary key column |
| `[ref: > table.col]` | Many-to-one FK relationship |
| `[ref: < table.col]` | One-to-many FK relationship |
| `[ref: - table.col]` | One-to-one relationship |
| `Ref: a.col > b.col` | Standalone reference declaration |
| `TableGroup Name { ... }` | Groups tables visually on the canvas |

---

## Keyboard & Mouse Controls

| Action | How |
|---|---|
| Pan canvas | Drag empty area |
| Zoom | `Ctrl + Scroll` |
| Select table | Click table |
| Multi-select | `Ctrl / Cmd + Click` |
| Drag table | Click and drag table header |
| Reroute a line | Drag the grip dot on the line's vertical segment |
| Rename file | Click filename (top-left of canvas) |
| Confirm rename | `Enter` or click away |
| Cancel rename | `Escape` |

---

## Tech Stack

- **React 18** + **Vite**
- **html2canvas** for PNG export
- Zero external UI libraries — all components hand-written
- All state persisted in `localStorage`

---

## License

MIT © 2025 [Puru Singh](https://github.com/Puru-Singh)
