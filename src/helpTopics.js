export const STARTER_DBML = `Table users {
  id int [pk, increment]
  name varchar(100) [not null]
  email varchar(255) [unique]
}

Table posts {
  id int [pk, increment]
  user_id int [not null, ref: > users.id]
  title varchar(255) [not null]
}`;

export const HELP_TOPICS = [
  {
    id: "start", label: "Start here", summary: "Your first diagram in three steps", icon: "01",
    articles: [
      {
        id: "first-diagram", title: "From text to your first diagram",
        description: "DBML is a simple way to describe database tables. Write it on the left; SketchER draws the tables and connections on the right.",
        steps: ["Copy the example below. Close Help and paste it into the DBML editor, replacing the sample text if you want to start fresh.", "You should see users and posts, connected through user_id. Change a column name or add a column to see the diagram update.", "Choose Fit to bring everything into view, then Save to download an editable .sker backup."],
        code: STARTER_DBML, codeLabel: "A complete two-table schema",
        note: "Pasting replaces whatever text you select. Save your current diagram first if you want to keep it.",
        keywords: "beginner tutorial getting started sample example paste schema database ERD",
      },
      {
        id: "read-diagram", title: "Read the diagram at a glance",
        description: "Each card is a table. Its header is the table name; each row shows a column and its data type.",
        steps: ["A key icon marks a primary key: the column that identifies a record. A link icon marks a column used in a relationship.", "Follow a connection to see which columns are related. Hover a table to highlight its connections.", "Use the arrow in a table header to collapse it to primary and relationship columns. Expand it again to see every column."],
        keywords: "icons badges primary foreign key pk fk collapse expand",
      },
    ],
  },
  {
    id: "dbml", label: "Write DBML", summary: "Tables, relationships, and reusable syntax", icon: "02",
    articles: [
      {
        id: "table-syntax", title: "Define a table and its columns",
        description: "Put columns inside a Table block. A column starts with its name, followed by its type and optional settings in square brackets.",
        codeLabel: "A table with common column settings",
        code: `Table products [headercolor: #10b981] {
  id int [pk, increment]
  name varchar(100) [not null]
  sku varchar(40) [unique]
  price decimal(10,2) [default: 0]
  description text [note: 'Shown on the product page']
}`,
        rows: [["[pk]", "Primary key"], ["[not null]", "A value is required"], ["[unique]", "Values cannot repeat"], ["[increment]", "Auto-incrementing value"], ["[default: 0]", "Default value"], ["[note: '…']", "Description shown in metadata"]],
        keywords: "constraints types varchar int decimal default null unique note headercolor",
      },
      {
        id: "relationships", title: "Connect tables with a relationship",
        description: "Add a ref setting to a column, or write a separate Ref declaration. The referenced table and column must exist in your document.",
        codeLabel: "Many posts belong to one user",
        code: `Table users {
  id int [pk]
}

Table posts {
  id int [pk]
  user_id int
}

Ref: posts.user_id > users.id`,
        rows: [[">", "Many-to-one: many posts → one user"], ["<", "One-to-many: one user → many posts"], ["-", "One-to-one"], ["<>", "Many-to-many"]],
        note: "Changing the hierarchy layout direction changes where tables appear, not what their relationships mean.",
        keywords: "reference references foreign key cardinality connections composite ref one many",
      },
      {
        id: "advanced-dbml", title: "Add schemas, indexes, and shared columns",
        description: "Use schema.table names to organize a larger database. TablePartial defines reusable columns; add ~partial_name inside a table to include them.",
        codeLabel: "A schema with reusable timestamps and an index",
        code: `TablePartial timestamps {
  created_at timestamp
  updated_at timestamp
}

Table core.users {
  id int [pk]
  email varchar(255) [not null]
  ~timestamps

  indexes {
    email [unique]
  }
}`,
        note: "Tables using TablePartial must be edited in the DBML editor. The visual column editor cannot apply changes to them. Keep definitions in one document; multi-file imports are not resolved.",
        keywords: "advanced schema indexes index partial TablePartial timestamps enum alias imports",
      },
    ],
  },
  {
    id: "canvas", label: "Work with the diagram", summary: "Navigate, edit, arrange, and add color", icon: "03",
    articles: [
      {
        id: "navigate", title: "Move around and bring tables into view",
        steps: ["Drag an empty area to pan. A two-finger trackpad scroll also pans; Ctrl/Cmd + scroll or a trackpad pinch zooms around the pointer.", "Use − and +, or click the zoom percentage for a slider and presets. Choose Fit when tables are off screen.", "Open Layout and choose Smart layout for a group-aware arrangement, or a hierarchy layout to emphasize connected levels. View → Reset view returns to 100% zoom at the origin."],
        note: "Auto-layout moves your tables. Save a backup first if you want to preserve a carefully arranged version.",
        keywords: "pan zoom fit layout arrange smart hierarchy trackpad touch reset missing offscreen",
      },
      {
        id: "edit-tables", title: "Select, move, and edit tables",
        steps: ["Click a table to select it. Ctrl/Cmd-click adds or removes tables from your selection; click empty canvas to clear the selection.", "Drag a table to reposition it. Right-click a table to open its options; with a table focused, Shift + F10 opens the same menu.", "With one table selected in the context menu, edit its columns and choose Apply changes. Choose Cancel to discard those pending column edits. You can always edit the source directly in the DBML editor."],
        note: "If Apply changes is unavailable, wait for parsing to finish and fix any DBML errors. For TablePartial tables, edit the DBML source instead.",
        keywords: "rename column editing context menu right click selection drag apply cancel",
      },
      {
        id: "groups-colors", title: "Group related tables and give colors meaning",
        steps: ["Ctrl/Cmd-click the tables you want to group. Right-click one of them, enter a unique group name, and choose Create group.", "Turn on Groups in the bottom bar to see group boundaries. Drag a group's label to move its members together.", "Choose a palette color for the selected table or group. With several tables selected, the palette applies related shades.", "Turn on Color legend and edit the descriptions to explain your colors. The visible legend is included in PNG exports."],
        note: "Use “Use DBML/default color” in the table menu to remove a custom table color override.",
        keywords: "TableGroup grouping colour color palette legend shades boundaries",
      },
      {
        id: "routes", title: "Make connections easier to follow",
        description: "Hover a table to highlight its connections, or enable Highlight links in the bottom bar to highlight all relationships.",
        steps: ["Hover a connection's vertical segment to find its grip, then drag the grip horizontally to reroute the line.", "For keyboard control, focus the relationship grip and press Left or Right. Hold Shift for a larger step."],
        keywords: "relationship line reroute route grip corridor highlight links flow",
      },
    ],
  },
  {
    id: "files", label: "Save & share", summary: "Backups, PNG exports, links, and QR codes", icon: "04",
    articles: [
      {
        id: "save-open", title: "Keep an editable backup",
        description: "SketchER autosaves in this browser, but a downloaded file is the best way to keep or move your work.",
        steps: ["Click the filename above the canvas to rename your diagram.", "Choose Save to download a .sker file. It keeps your DBML, table positions, colors, and diagram settings.", "Choose Open to restore a .sker file. Save your current work first: opening a file replaces the current diagram."],
        note: "Autosave belongs to this browser and device. Clearing browser storage can remove it; it is not a cloud backup.",
        keywords: "download save backup local autosave storage file filename open import restore sker json",
      },
      {
        id: "export", title: "Export an image for a document or presentation",
        steps: ["Choose how much detail to show: expand or collapse tables, set Highlight links, and turn on Color legend if you need it.", "Choose Export to download a PNG of the full diagram, including tables outside the current viewport. Canvas controls are excluded.", "If the diagram is too large to export, reduce the space between tables or collapse tables, then try again."],
        note: "A PNG is an image. Save a .sker file as well if you want to edit the diagram later.",
        keywords: "PNG image screenshot full resolution export picture presentation legend",
      },
      {
        id: "share", title: "Share a snapshot with someone else",
        steps: ["Choose Share → Copy shareable link and send the link to your recipient.", "Or choose Share → Show QR code so another device can scan it. If the diagram is too large for a QR code, use the link instead.", "Create a new link after making changes. A shared link is a snapshot; it does not update when you edit your diagram."],
        note: "Anyone with the link can read its diagram data. Share only what you intend to reveal. A localhost address only works on your own device; use a deployed or network-accessible address for another device.",
        keywords: "link URL QR scan phone snapshot privacy collaboration sharing copied clipboard",
      },
    ],
  },
  {
    id: "keys", label: "Keyboard shortcuts", summary: "Controls organized by where focus is", icon: "05",
    articles: [
      {
        id: "canvas-keys", title: "When the canvas is focused",
        description: "Click empty canvas or Tab to “Diagram canvas” first. These keys do not control the diagram while you are typing in the DBML editor.",
        rows: [["Arrow keys", "Pan the canvas"], ["+ or =", "Zoom in"], ["−", "Zoom out"], ["F", "Fit all tables in view"], ["0", "Reset zoom and position"]], keyboard: true,
        keywords: "shortcut hotkey keyboard zoom focus fit reset",
      },
      {
        id: "table-keys", title: "When a table or relationship grip is focused",
        rows: [["Enter / Space", "Select the focused table"], ["Ctrl/Cmd + Enter / Space", "Toggle the table in a multi-selection"], ["Arrow keys", "Move the focused table"], ["Shift + Arrow keys", "Move the table in larger steps"], ["Shift + F10", "Open the table's options"], ["Left / Right on a grip", "Move the relationship route"], ["Shift + Left / Right on a grip", "Move the route in larger steps"]], keyboard: true,
        keywords: "accessibility keyboard select move context menu reroute",
      },
      {
        id: "dialog-keys", title: "In menus and dialogs",
        rows: [["Tab / Shift + Tab", "Move between controls"], ["Escape", "Close Help, a dialog, or an open menu"], ["Left / Right on the editor divider", "Resize the DBML panel"]], keyboard: true,
        note: "Ctrl is used on Windows/Linux; Cmd is used on macOS.",
        keywords: "close escape tab focus resize panel divider Mac Windows",
      },
    ],
  },
  {
    id: "fixes", label: "Troubleshooting", summary: "Find the reason and your next step", icon: "06",
    articles: [
      {
        id: "parse-errors", title: "My diagram stopped updating",
        description: "If your DBML has an error, SketchER keeps the last valid diagram visible while you fix it.",
        steps: ["Look for diagnostics and highlighted lines in the DBML editor. Check braces, column settings, and reference names.", "Make sure every referenced table and column exists. For schema-qualified names, include the same schema in your Ref.", "Fix the error and wait for parsing to finish. The canvas will update when the source is valid again."],
        keywords: "error invalid parsing stopped update diagnostics frozen syntax braces",
      },
      {
        id: "unavailable-action", title: "A button is unavailable, or my tables disappeared",
        steps: ["Layout needs at least one table and waits for parsing to finish. Export also needs a table and is temporarily unavailable during an export.", "Create group needs a non-empty, unique name and valid, fully parsed DBML.", "Apply changes waits for valid, fully parsed DBML and does not support TablePartial tables. Edit those tables in the source.", "If tables seem to have disappeared, choose Fit. If the diagram is empty, check that your source defines tables and has no errors."],
        keywords: "disabled button unavailable waiting apply create group missing empty disappeared",
      },
      {
        id: "sharing-problems", title: "Copying, opening, or scanning did not work",
        steps: ["If copying fails, try again and allow clipboard access if your browser asks. You can select and copy example text manually.", "Open expects a valid .sker document saved by SketchER. Paste raw DBML into the editor instead of opening it as a file.", "If a phone cannot open your QR link, check that the address is reachable from that device; localhost points to the phone itself.", "If a QR code cannot fit your diagram, copy the shareable link instead. Keep a saved .sker backup for large or important diagrams."],
        keywords: "failed clipboard permission upload load QR too large phone network file",
      },
    ],
  },
];

export function searchHelp(query) {
  const fillers = new Set(["a", "an", "the", "how", "do", "i", "to", "my", "can", "why", "is", "are", "does", "it", "what", "where", "in", "on", "with", "and", "of", "this"]);
  const tokens = query.toLowerCase().match(/[\p{L}\p{N}]+/gu) || [];
  const meaningful = tokens.filter((word) => !fillers.has(word));
  const words = meaningful.length ? meaningful : tokens;
  return HELP_TOPICS.flatMap((topic) => topic.articles
    .filter((article) => {
      const text = [topic.label, article.title, article.description, article.note,
        article.keywords, article.code, ...(article.steps || []), ...(article.rows || []).flat()]
        .join(" ").toLowerCase();
      return words.every((word) => text.includes(word));
    })
    .map((article) => ({ ...article, topic: topic.label })));
}
